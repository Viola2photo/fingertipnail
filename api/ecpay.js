// 結帳：在伺服器端重新計算金額、建立訂單，再導向綠界 AIO 付款頁
// 規格：ECPay-API-Skill guides/01-payment-aio.md（SNAPSHOT 2026-03）
const ecpay = require('../lib/ecpay');
const { calculateTotals } = require('../lib/pricing');
const { db, inventoryRef, ordersRef, customerOrderRef } = require('../lib/firebase');
const { verifyUser } = require('../lib/auth');

const SIZES = ['XS', 'S', 'M', 'L'];
const CVS_SUBTYPES = ['UNIMARTC2C', 'FAMIC2C', 'HILIFEC2C', 'OKMARTC2C'];
const MAX_QTY_PER_LINE = 20;

function fail(res, status, message) {
  res.status(status).json({ error: message });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('不允許的方法');

  try {
    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0 || items.length > 50) return fail(res, 400, '購物車是空的');

    const name = ecpay.cleanText(body.name, 20);
    const phone = String(body.phone || '').replace(/\D/g, '');
    if (!name) return fail(res, 400, '請填寫收件人姓名');
    if (!/^09\d{8}$/.test(phone)) return fail(res, 400, '手機號碼需為 09 開頭 10 碼');

    // 超商門市（電子地圖選店結果）或手動填寫的地址
    const store = body.store && CVS_SUBTYPES.includes(body.store.subType) && /^[A-Za-z0-9]{1,10}$/.test(String(body.store.id || ''))
      ? {
          subType: body.store.subType,
          id: String(body.store.id),
          name: ecpay.cleanText(body.store.name, 40),
          address: ecpay.cleanText(body.store.address, 100),
        }
      : null;
    const address = ecpay.cleanText(body.address, 120);
    if (!store && !address) return fail(res, 400, '請選擇取貨門市或填寫地址');

    // 以資料庫的價格與庫存為準，不採用瀏覽器傳來的金額
    const lines = [];
    for (const raw of items) {
      const id = String(raw.id || '');
      const size = String(raw.size || '');
      const quantity = Math.floor(Number(raw.quantity));
      if (!id || !SIZES.includes(size) || !(quantity >= 1 && quantity <= MAX_QTY_PER_LINE)) return fail(res, 400, '購物車內容有誤');
      const snap = await inventoryRef().doc(id).get();
      if (!snap.exists) return fail(res, 409, '有商品已下架，請重新整理');
      const product = snap.data();
      if (product.status === 'N') return fail(res, 409, `「${product.name}」已下架`);
      const inStock = Number(product.stock?.[size] || 0);
      const alreadyInCart = lines.filter((l) => l.id === id && l.size === size).reduce((s, l) => s + l.quantity, 0);
      if (inStock < alreadyInCart + quantity) return fail(res, 409, `「${product.name}」${size} 庫存只剩 ${inStock} 件`);
      lines.push({
        id, size, quantity, name: product.name, price: Number(product.price) || 0,
        shape: product.shape || '', image: product.media?.find((m) => m.type !== 'video')?.url || '',
      });
    }

    const totals = calculateTotals(lines, body.promoCode);
    if (!(totals.total > 0)) return fail(res, 400, '訂單金額有誤');

    // 有登入就把訂單同步到顧客的「我的訂單」（uid 由伺服器驗證 token 取得，不信任前端）
    const user = await verifyUser(req);

    const merchantTradeNo = ecpay.newMerchantTradeNo('NS');
    const now = new Date().toISOString();
    const order = {
      orderId: merchantTradeNo,
      merchantTradeNo,
      items: lines,
      totals,
      totalAmount: totals.total,
      customerUid: user ? user.uid : null,
      customerInfo: {
        name,
        phone,
        address: store ? `[${store.subType}] ${store.name}（${store.address}）` : address,
      },
      shipping: store ? { method: 'CVS', ...store } : { method: 'HOME', address },
      status: 'pending',
      createdAt: now,
      history: [{ at: now, status: 'pending', note: '建立訂單，等待付款' }],
    };

    const batch = db.batch();
    batch.set(ordersRef().doc(merchantTradeNo), order);
    if (user) batch.set(customerOrderRef(user.uid, merchantTradeNo), order);
    await batch.commit();

    const cfg = ecpay.paymentConfig();
    const origin = ecpay.siteOrigin(req);
    let itemName = lines.map((l) => `${l.name}(${l.size}) x ${l.quantity}`);
    if (totals.eventDiscount > 0) itemName.push('任4件1000折抵 x 1');
    if (totals.promoDiscount > 0) itemName.push(`${totals.promo.name}折抵 x 1`);
    if (totals.shippingFee > 0) itemName.push('物流運費 x 1');

    const params = {
      MerchantID: cfg.merchantId,
      MerchantTradeNo: merchantTradeNo,
      MerchantTradeDate: ecpay.taipeiDateTime(),
      PaymentType: 'aio',
      TotalAmount: String(totals.total),
      TradeDesc: '指尖造藝穿戴甲訂單',
      ItemName: ecpay.cleanText(itemName.join('#'), 200),
      ReturnURL: `${origin}/api/ecpay_webhook`,
      PaymentInfoURL: `${origin}/api/ecpay_payment_info`,
      OrderResultURL: `${origin}/api/ecpay_result`,
      ClientBackURL: `${origin}/shop.html`,
      ChoosePayment: 'ALL',
      EncryptType: '1',
      NeedExtraPaidInfo: 'N',
    };
    params.CheckMacValue = ecpay.generateCheckMacValue(params, cfg.hashKey, cfg.hashIv, 'sha256');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(ecpay.autoSubmitForm(`${cfg.host}/Cashier/AioCheckOut/V5`, params));
  } catch (err) {
    console.error('checkout error', err);
    fail(res, 500, '結帳暫時無法使用，請稍後再試');
  }
};

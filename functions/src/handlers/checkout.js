// 結帳：在伺服器端重新計算金額、建立訂單，再導向綠界 AIO 付款頁
// 規格：ECPay-API-Skill guides/01-payment-aio.md（SNAPSHOT 2026-03）
const ecpay = require('../lib/ecpay');
const { db, ordersRef, customerOrderRef } = require('../lib/firebase');
const { verifyUser } = require('../lib/auth');
const { priceCart, CartError } = require('../lib/cart');
const { normalizeInvoiceRequest } = require('../lib/invoice');
const { markOrderPaid } = require('../lib/payment');

const CVS_SUBTYPES = ['UNIMARTC2C', 'FAMIC2C', 'HILIFEC2C', 'OKMARTC2C'];

function fail(res, status, message) {
  res.status(status).json({ error: message });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('不允許的方法');

  try {
    const body = req.body || {};
    const name = ecpay.cleanText(body.name, 20);
    const phone = String(body.phone || '').replace(/\D/g, '');
    if (!name) return fail(res, 400, '請填寫收件人姓名');
    // 超商取貨要核對證件，綠界對姓名有格式限制，下單時就先檢查，避免出貨時才建不了物流單
    if (!ecpay.logisticsName(name)) return fail(res, 400, `收件人姓名需與證件相同：${ecpay.LOGISTICS_NAME_RULE}`);
    if (!/^09\d{8}$/.test(phone)) return fail(res, 400, '手機號碼需為 09 開頭 10 碼');

    // 超商門市（綠界電子地圖選店結果）；目前只提供超商取貨，不開放宅配
    const store = body.store && CVS_SUBTYPES.includes(body.store.subType) && /^[A-Za-z0-9]{1,10}$/.test(String(body.store.id || ''))
      ? { subType: body.store.subType, id: String(body.store.id), name: ecpay.cleanText(body.store.name, 40), address: ecpay.cleanText(body.store.address, 100) }
      : null;
    if (!store) return fail(res, 400, '請選擇取貨門市');

    const { invoice, error } = normalizeInvoiceRequest(body.invoice, phone);
    if (error) return fail(res, 400, error);

    // 付款方式：online＝綠界線上付款（信用卡／ATM／超商代碼）；cod＝超商取貨付款
    const cod = body.paymentMethod === 'cod';

    const { lines, totals } = await priceCart(body.items, body.promoCode);
    if (cod && totals.total > 20000) return fail(res, 400, '取貨付款金額上限為 20,000 元，請改用線上付款');

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
      customerInfo: { name, phone, address: `[${store.subType}] ${store.name}（${store.address}）` },
      shipping: { method: 'CVS', ...store },
      invoice,
      status: 'pending',
      createdAt: now,
      history: [{ at: now, status: 'pending', note: cod ? '建立訂單（超商取貨付款）' : '建立訂單，等待付款' }],
    };

    const batch = db.batch();
    batch.set(ordersRef().doc(merchantTradeNo), order);
    if (user) batch.set(customerOrderRef(user.uid, merchantTradeNo), order);
    await batch.commit();

    // 取貨付款不經過綠界付款頁：訂單直接成立並扣庫存，等店家出貨
    if (cod) {
      await markOrderPaid(merchantTradeNo, { tradeNo: '', paymentType: 'COD', paymentDate: '', tradeAmt: totals.total, fee: 0, simulated: false });
      return res.status(200).json({ orderNo: merchantTradeNo, cod: true });
    }

    const cfg = ecpay.paymentConfig();
    const origin = ecpay.siteOrigin(req);
    const callback = ecpay.callbackBase(req);
    const itemName = lines.map((l) => `${l.name}(${l.size}) x ${l.quantity}`);
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
      // ReturnURL / PaymentInfoURL 由綠界伺服器呼叫，使用直連網址；三個 URL 用途不同，不可相同（SKILL）
      ReturnURL: `${callback}/api/ecpay/return`,
      PaymentInfoURL: `${callback}/api/ecpay/payment-info`,
      OrderResultURL: `${origin}/api/ecpay/result`,
      ClientBackURL: `${origin}/#/orders`,
      ChoosePayment: 'ALL',
      EncryptType: '1',
      NeedExtraPaidInfo: 'N',
    };
    params.CheckMacValue = ecpay.generateCheckMacValue(params, cfg.hashKey, cfg.hashIv, 'sha256');

    // 回傳表單資料，由前台建立表單送往綠界（不可用 iframe，需整頁跳轉；SKILL）
    res.status(200).json({ orderNo: merchantTradeNo, action: `${cfg.host}/Cashier/AioCheckOut/V5`, fields: params });
  } catch (err) {
    if (err instanceof CartError) return fail(res, err.status, err.message);
    console.error('checkout error', err);
    fail(res, 500, '結帳暫時無法使用，請稍後再試');
  }
};

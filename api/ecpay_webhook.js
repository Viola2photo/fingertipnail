// 綠界付款結果通知（ReturnURL，Server-to-Server Form POST）
// 規格：guides/01 §付款結果通知。必須驗證 CheckMacValue、冪等處理、10 秒內回應純文字 1|OK。
const ecpay = require('../lib/ecpay');
const { db, inventoryRef, ordersRef, stockMovementsRef } = require('../lib/firebase');
const { PAID_STATUSES, historyEntry, applyOrderUpdate } = require('../lib/orders');

function ok(res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.status(200).send('1|OK');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const data = { ...(req.body || {}) };
  const cfg = ecpay.paymentConfig();
  if (!ecpay.verifyCheckMacValue(data, cfg.hashKey, cfg.hashIv, 'sha256')) {
    console.warn('ecpay webhook: CheckMacValue 驗證失敗', data.MerchantTradeNo);
    return res.status(400).send('0|CheckMacValue Error');
  }

  const merchantTradeNo = String(data.MerchantTradeNo || '');
  const orderRef = ordersRef().doc(merchantTradeNo);

  try {
    if (String(data.RtnCode) !== '1') {
      const snap = await orderRef.get();
      if (snap.exists && ['pending', 'awaiting_payment'].includes(snap.data().status)) {
        await applyOrderUpdate(null, snap.data(), { status: 'payment_failed', paymentError: String(data.RtnMsg || '') },
          historyEntry('payment_failed', `綠界通知付款未成功：${data.RtnMsg || data.RtnCode}`));
      }
      return ok(res);
    }

    const simulated = String(data.SimulatePaid) === '1';

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) { console.warn('ecpay webhook: 找不到訂單', merchantTradeNo); return; }
      const order = snap.data();
      if (PAID_STATUSES.includes(order.status)) return; // 重送的通知，已處理過

      const payment = {
        tradeNo: String(data.TradeNo || ''),
        paymentType: String(data.PaymentType || ''),
        paymentDate: String(data.PaymentDate || ''),
        tradeAmt: Number(data.TradeAmt || 0),
        fee: Number(data.PaymentTypeChargeFee || 0),
        simulated,
      };

      if (payment.tradeAmt !== Number(order.totalAmount)) {
        applyOrderUpdate(tx, order, { status: 'amount_mismatch', payment },
          historyEntry('amount_mismatch', `綠界金額 ${payment.tradeAmt} 與訂單金額 ${order.totalAmount} 不符，請人工確認`));
        return;
      }
      // 正式環境的「模擬付款」不是真的收到錢，不出貨、不扣庫存
      if (simulated && ecpay.isProduction()) {
        applyOrderUpdate(tx, order, { payment }, historyEntry(order.status, '收到綠界後台模擬付款通知（非真實付款）'));
        return;
      }

      // 先讀完所有庫存再寫入（transaction 規則）
      const productIds = [...new Set(order.items.map((i) => i.id))];
      const productSnaps = await Promise.all(productIds.map((id) => tx.get(inventoryRef().doc(id))));
      const stocks = {};
      productSnaps.forEach((s) => { stocks[s.id] = s.exists ? { ...(s.data().stock || {}) } : null; });

      const oversold = [];
      const now = new Date().toISOString();
      for (const line of order.items) {
        const stock = stocks[line.id];
        if (!stock) { oversold.push(`${line.name} ${line.size}`); continue; }
        const before = Number(stock[line.size] || 0);
        if (before < line.quantity) oversold.push(`${line.name} ${line.size}`);
        stock[line.size] = Math.max(0, before - line.quantity);
        tx.set(stockMovementsRef().doc(), {
          type: 'sale', productId: line.id, name: line.name, size: line.size,
          quantity: -line.quantity, before, after: stock[line.size],
          orderId: merchantTradeNo, at: now, note: '綠界付款成功自動扣庫存',
        });
      }
      Object.entries(stocks).forEach(([id, stock]) => { if (stock) tx.update(inventoryRef().doc(id), { stock }); });

      const note = `付款成功（${payment.paymentType}）` + (simulated ? '［測試環境模擬付款］' : '') +
        (oversold.length ? `；⚠ 庫存不足：${oversold.join('、')}` : '');
      applyOrderUpdate(tx, order, { status: 'paid', paidAt: now, payment, oversold }, historyEntry('paid', note));
    });

    ok(res);
  } catch (err) {
    console.error('ecpay webhook error', err);
    // 不回 1|OK，讓綠界稍後重送
    res.status(500).send('0|Server Error');
  }
};

// 付款成立的共用處理：付款通知（ReturnURL）與排程補查（QueryTradeInfo）都走這裡，確保只扣一次庫存
const ecpay = require('./ecpay');
const { db, inventoryRef, ordersRef, stockMovementsRef } = require('./firebase');
const { PAID_STATUSES, historyEntry, applyOrderUpdate } = require('./orders');

// payment: { tradeNo, paymentType, paymentDate, tradeAmt, fee, simulated }
// 回傳 'paid' | 'already' | 'mismatch' | 'simulated' | 'missing'
async function markOrderPaid(merchantTradeNo, payment, source) {
  let outcome = 'missing';
  await db.runTransaction(async (tx) => {
    const orderRef = ordersRef().doc(merchantTradeNo);
    const snap = await tx.get(orderRef);
    if (!snap.exists) { outcome = 'missing'; return; }
    const order = snap.data();
    if (PAID_STATUSES.includes(order.status)) { outcome = 'already'; return; }

    // SKILL：SimulatePaid=1 是綠界後台的模擬付款，不是真的收到錢，不出貨、不扣庫存、不開發票
    if (payment.simulated) {
      applyOrderUpdate(tx, order, { simulatedPayment: payment }, historyEntry(order.status, '收到綠界模擬付款通知（非真實付款，未變更訂單）'));
      outcome = 'simulated';
      return;
    }
    if (payment.tradeAmt !== Number(order.totalAmount)) {
      applyOrderUpdate(tx, order, { status: 'amount_mismatch', payment },
        historyEntry('amount_mismatch', `綠界金額 ${payment.tradeAmt} 與訂單金額 ${order.totalAmount} 不符，請人工確認`));
      outcome = 'mismatch';
      return;
    }

    // transaction 規則：先讀完所有庫存再寫入
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

    const patch = { status: 'paid', paidAt: now, payment, oversold };
    // 發票不在付款通知內開立（SKILL：ReturnURL 需 10 秒內回應，耗時工作改非同步），交給排程處理
    if (ecpay.invoiceEnabled()) patch.invoiceStatus = 'pending';
    const note = `付款成功（${payment.paymentType}）${source ? `［${source}］` : ''}` + (oversold.length ? `；⚠ 庫存不足：${oversold.join('、')}` : '');
    applyOrderUpdate(tx, order, patch, historyEntry('paid', note));
    outcome = 'paid';
  });
  return outcome;
}

// QueryTradeInfo/V5：TimeStamp 有效 3 分鐘，回應為 URL-encoded 且需驗證 CheckMacValue（guides/01 §查詢訂單）
async function queryTrade(merchantTradeNo) {
  const cfg = ecpay.paymentConfig();
  const params = { MerchantID: cfg.merchantId, MerchantTradeNo: merchantTradeNo, TimeStamp: String(Math.floor(Date.now() / 1000)) };
  params.CheckMacValue = ecpay.generateCheckMacValue(params, cfg.hashKey, cfg.hashIv, 'sha256');
  const data = ecpay.parseUrlEncoded(await ecpay.postForm(`${cfg.host}/Cashier/QueryTradeInfo/V5`, params));
  if (!ecpay.verifyCheckMacValue(data, cfg.hashKey, cfg.hashIv, 'sha256')) throw new Error('綠界查詢回應驗證失敗');
  return data;
}

module.exports = { markOrderPaid, queryTrade };

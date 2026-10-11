// 後台：訂單狀態操作（手動出貨、完成、取消並退回庫存）與綠界交易查詢
const ecpay = require('../../lib/ecpay');
const { requireAdmin } = require('../../lib/auth');
const { db, inventoryRef, ordersRef, stockMovementsRef } = require('../../lib/firebase');
const { PAID_STATUSES, historyEntry, applyOrderUpdate } = require('../../lib/orders');

// QueryTradeInfo/V5：TimeStamp 有效 3 分鐘，回應為 URL-encoded 且需驗證 CheckMacValue（guides/01 §查詢訂單）
async function queryTrade(order) {
  const cfg = ecpay.paymentConfig();
  const params = { MerchantID: cfg.merchantId, MerchantTradeNo: order.merchantTradeNo, TimeStamp: String(Math.floor(Date.now() / 1000)) };
  params.CheckMacValue = ecpay.generateCheckMacValue(params, cfg.hashKey, cfg.hashIv, 'sha256');
  const data = ecpay.parseUrlEncoded(await ecpay.postForm(`${cfg.host}/Cashier/QueryTradeInfo/V5`, params));
  if (!ecpay.verifyCheckMacValue(data, cfg.hashKey, cfg.hashIv, 'sha256')) throw new Error('綠界查詢回應驗證失敗');
  return data;
}

async function cancelOrder(order, restock, note) {
  const wasPaid = PAID_STATUSES.includes(order.status);
  await db.runTransaction(async (tx) => {
    const ids = [...new Set(order.items.map((i) => i.id))];
    const snaps = await Promise.all(ids.map((id) => tx.get(inventoryRef().doc(id))));
    const stocks = {};
    snaps.forEach((s) => { if (s.exists) stocks[s.id] = { ...(s.data().stock || {}) }; });
    if (wasPaid && restock) {
      const now = new Date().toISOString();
      for (const line of order.items) {
        const stock = stocks[line.id];
        if (!stock) continue;
        const before = Number(stock[line.size] || 0);
        stock[line.size] = before + line.quantity;
        tx.set(stockMovementsRef().doc(), {
          type: 'return', productId: line.id, name: line.name, size: line.size,
          quantity: line.quantity, before, after: stock[line.size], orderId: order.merchantTradeNo, at: now, note: '取消訂單退回庫存',
        });
      }
      Object.entries(stocks).forEach(([id, stock]) => tx.update(inventoryRef().doc(id), { stock }));
    }
    const msg = `取消訂單${wasPaid ? (restock ? '，商品已退回庫存' : '，商品未退回庫存') : ''}${note ? `：${note}` : ''}` +
      (wasPaid && String(order.payment?.paymentType || '').startsWith('Credit') ? '（信用卡請至綠界後台辦理退刷）' : '') +
      (wasPaid && !String(order.payment?.paymentType || '').startsWith('Credit') ? '（ATM／超商付款需另行退款給顧客）' : '');
    applyOrderUpdate(tx, order, { status: 'cancelled', cancelledAt: new Date().toISOString() }, historyEntry('cancelled', msg));
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await requireAdmin(req, res))) return;

  try {
    const { action, orderId, trackingNo, note, restock } = req.body || {};
    const snap = await ordersRef().doc(String(orderId || '')).get();
    if (!snap.exists) return res.status(404).json({ error: '找不到訂單' });
    const order = snap.data();
    const text = ecpay.cleanText(note, 200);

    if (action === 'ship') {
      if (!['paid', 'shipping'].includes(order.status)) throw new Error('只有已付款的訂單可以出貨');
      await applyOrderUpdate(null, order, { status: 'shipped', manualTrackingNo: ecpay.cleanText(trackingNo, 50) },
        historyEntry('shipped', `手動標記已出貨${trackingNo ? `，追蹤編號 ${ecpay.cleanText(trackingNo, 50)}` : ''}`));
    } else if (action === 'complete') {
      if (!['shipping', 'shipped'].includes(order.status)) throw new Error('只有已出貨的訂單可以標記完成');
      await applyOrderUpdate(null, order, { status: 'completed', completedAt: new Date().toISOString() }, historyEntry('completed', text || '顧客已取貨'));
    } else if (action === 'cancel') {
      if (order.status === 'cancelled') throw new Error('訂單已經取消');
      await cancelOrder(order, restock !== false, text);
    } else if (action === 'note') {
      await applyOrderUpdate(null, order, {}, historyEntry(order.status, text));
    } else if (action === 'query') {
      const data = await queryTrade(order);
      // 用查到的手續費補齊財務資料
      if (PAID_STATUSES.includes(order.status) && order.payment && data.PaymentTypeChargeFee !== undefined) {
        await applyOrderUpdate(null, order, { payment: { ...order.payment, fee: Number(data.PaymentTypeChargeFee || 0), handlingCharge: Number(data.HandlingCharge || 0) } });
      }
      return res.json({ data });
    } else {
      return res.status(400).json({ error: '未知的操作' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('admin order error', err);
    res.status(400).json({ error: err.message || '操作失敗' });
  }
};

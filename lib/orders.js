// 訂單狀態與共用更新邏輯
const { admin, ordersRef, customerOrderRef } = require('./firebase');

// pending → awaiting_payment（ATM/超商代碼取號）→ paid → shipping（已建物流單）→ shipped → completed
// 另有：cancelled、payment_failed、amount_mismatch（金額不符，需人工確認）
const STATUS_LABELS = {
  pending: '待付款',
  awaiting_payment: '待繳費',
  paid: '待出貨',
  shipping: '已建物流單',
  shipped: '已出貨',
  completed: '已完成',
  cancelled: '已取消',
  payment_failed: '付款失敗',
  amount_mismatch: '金額不符',
};

const PAID_STATUSES = ['paid', 'shipping', 'shipped', 'completed'];

function historyEntry(status, note) {
  return { at: new Date().toISOString(), status, note };
}

// 同時更新店家訂單與顧客「我的訂單」副本；tx 為 Firestore transaction 或 batch（可省略）
function applyOrderUpdate(writer, order, patch, entry) {
  const data = { ...patch, updatedAt: new Date().toISOString() };
  if (entry) data.history = admin.firestore.FieldValue.arrayUnion(entry);
  const refs = [ordersRef().doc(order.merchantTradeNo)];
  if (order.customerUid) refs.push(customerOrderRef(order.customerUid, order.merchantTradeNo));
  if (writer) {
    refs.forEach((ref, i) => (i === 0 ? writer.update(ref, data) : writer.set(ref, data, { merge: true })));
    return null;
  }
  return Promise.all(refs.map((ref, i) => (i === 0 ? ref.update(data) : ref.set(data, { merge: true }))));
}

module.exports = { STATUS_LABELS, PAID_STATUSES, historyEntry, applyOrderUpdate };

// 排程工作（每 10 分鐘）：
// 1. 已付款、待開立的訂單自動開立電子發票（SKILL：不要在 ReturnURL 裡做耗時工作）
// 2. 主動查詢久未付款的訂單（SKILL：ATM／超商逾期不會通知，建議排程查 QueryTradeInfo）
//    - 綠界顯示已付款但我們漏收通知 → 補做付款成立
//    - 交易未成立或繳費期限已過 → 自動取消（尚未扣庫存，不需退回）
const ecpay = require('./lib/ecpay');
const { ordersRef } = require('./lib/firebase');
const { historyEntry, applyOrderUpdate } = require('./lib/orders');
const { markOrderPaid, queryTrade } = require('./lib/payment');
const { issueInvoice } = require('./lib/invoice');

const PENDING_GRACE_MS = 2 * 60 * 60 * 1000; // 信用卡未完成付款，2 小時後查詢
const MAX_INVOICE_ATTEMPTS = 5;

function parseTaipei(text) {
  const m = /^(\d{4})\/(\d{2})\/(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/.exec(String(text || '').trim());
  if (!m) return null;
  const [, y, mo, d, h = '23', mi = '59', s = '59'] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h - 8, +mi, +s));
}

async function issuePendingInvoices(log) {
  if (!ecpay.invoiceEnabled()) return;
  const snaps = await ordersRef().where('invoiceStatus', 'in', ['pending', 'error']).limit(20).get();
  for (const doc of snaps.docs) {
    const order = doc.data();
    if ((order.invoiceAttempts || 0) >= MAX_INVOICE_ATTEMPTS || order.invoiceNo) continue;
    try {
      const result = await issueInvoice(order);
      await applyOrderUpdate(null, order, { invoiceStatus: 'issued', invoiceNo: result.invoiceNo, invoiceInfo: result, invoiceError: '' },
        historyEntry(order.status, `已開立電子發票 ${result.invoiceNo}`));
      log.push(`發票 ${order.merchantTradeNo} → ${result.invoiceNo}`);
    } catch (e) {
      await applyOrderUpdate(null, order, { invoiceStatus: 'error', invoiceError: e.message, invoiceAttempts: (order.invoiceAttempts || 0) + 1 });
      log.push(`發票 ${order.merchantTradeNo} 失敗：${e.message}`);
    }
  }
}

async function reconcileUnpaid(log, now = Date.now()) {
  const snaps = await ordersRef().where('status', 'in', ['pending', 'awaiting_payment']).limit(50).get();
  for (const doc of snaps.docs) {
    const order = doc.data();
    const created = Date.parse(order.createdAt || 0);
    const expire = parseTaipei(order.paymentInfo?.expireDate);
    const due = order.status === 'pending' ? now - created > PENDING_GRACE_MS : expire && now > expire.getTime();
    if (!due) continue;
    try {
      const trade = await queryTrade(order.merchantTradeNo);
      if (String(trade.TradeStatus) === '1') {
        const outcome = await markOrderPaid(order.merchantTradeNo, {
          tradeNo: String(trade.TradeNo || ''), paymentType: String(trade.PaymentType || ''),
          paymentDate: String(trade.PaymentDate || ''), tradeAmt: Number(trade.TradeAmt || 0),
          fee: Number(trade.PaymentTypeChargeFee || 0), simulated: false,
        }, '排程查詢補登');
        log.push(`補登付款 ${order.merchantTradeNo}：${outcome}`);
      } else {
        // 待付款訂單若綠界仍是「未付款(0)」，可能是 ATM／超商取號通知還沒到，最多等 7 天
        const notCreated = ['10200095', '10200047'].includes(String(trade.TradeStatus));
        const stale = now - created > 7 * 24 * 60 * 60 * 1000;
        if (order.status === 'pending' && !notCreated && !stale) continue;
        await applyOrderUpdate(null, order, { status: 'cancelled', cancelledAt: new Date(now).toISOString(), cancelReason: 'expired' },
          historyEntry('cancelled', `逾期未付款，自動取消（綠界交易狀態 ${trade.TradeStatus}）`));
        log.push(`逾期取消 ${order.merchantTradeNo}`);
      }
    } catch (e) {
      log.push(`查詢 ${order.merchantTradeNo} 失敗：${e.message}`);
    }
  }
}

async function runMaintenance() {
  const log = [];
  await issuePendingInvoices(log);
  await reconcileUnpaid(log);
  return log;
}

module.exports = { runMaintenance, issuePendingInvoices, reconcileUnpaid, parseTaipei };

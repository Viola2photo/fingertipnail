// 綠界物流狀態通知（ServerReplyURL，Form POST + CMV-MD5，回應 1|OK）
// 綠界的狀態碼很多且各超商不同，這裡原樣記錄 RtnCode/RtnMsg，另外處理兩類：
// - 顧客已取貨 → 訂單自動完成；取貨付款的訂單在此時才算收到錢（記 paidAt，之後開發票）
// - 顧客未取、包裹退回 → 標記「需處理」，由店家決定取消或聯絡顧客
// 代碼依綠界 logistics_status.xlsx（ECPay-API-Skill scripts/SDK_PHP/example/Logistics）
const ecpay = require('../lib/ecpay');
const { ordersRef } = require('../lib/firebase');
const { historyEntry, applyOrderUpdate } = require('../lib/orders');

const PICKED_UP = ['2067', '3022']; // 買家已到店取貨（7-ELEVEN／全家、萊爾富、OK）
const NOT_PICKED_UP = ['2065', '2074', '2076', '2078', '2072', '2070', '3019', '3020', '3023', '3025'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const data = { ...(req.body || {}) };
  const cfg = ecpay.logisticsConfig();
  if (!ecpay.verifyCheckMacValue(data, cfg.hashKey, cfg.hashIv, 'md5')) {
    return res.status(400).send('0|CheckMacValue Error');
  }

  try {
    const snaps = await ordersRef().where('logistics.id', '==', String(data.AllPayLogisticsID || '')).limit(1).get();
    if (!snaps.empty) {
      const order = snaps.docs[0].data();
      const code = String(data.RtnCode || '');
      const msg = String(data.RtnMsg || '');
      const lastStatus = { code, message: msg, at: new Date().toISOString() };
      const now = lastStatus.at;
      const patch = { logistics: { ...order.logistics, lastStatus } };
      let status = order.status;
      let note = `物流狀態 ${code}：${msg}`;
      if (PICKED_UP.includes(code) && ['shipping', 'shipped'].includes(order.status)) {
        status = 'completed';
        patch.completedAt = now;
        if (order.payment?.paymentType === 'COD') {
          patch.paidAt = now;
          patch.payment = { ...order.payment, collected: true, paymentDate: now };
          if (ecpay.invoiceEnabled()) patch.invoiceStatus = 'pending';
          note += '；顧客已取貨付款';
        }
      } else if (NOT_PICKED_UP.includes(code)) {
        patch.logisticsIssue = msg || code;
        note += '；⚠ 顧客未取貨，請確認是否取消訂單並退回庫存';
      } else if (order.status === 'shipping' && code !== '300') {
        // 300 = 訂單處理中（綠界已收到資料）；之後的貨態代表包裹已交寄或已在配送中
        status = 'shipped';
      }
      patch.status = status;
      await applyOrderUpdate(null, order, patch, historyEntry(status, note));
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send('1|OK');
  } catch (err) {
    console.error('logistics notify error', err);
    res.status(500).send('0|Server Error');
  }
};

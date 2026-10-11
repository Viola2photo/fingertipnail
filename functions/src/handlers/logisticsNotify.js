// 綠界物流狀態通知（ServerReplyURL，Form POST + CMV-MD5，回應 1|OK）
// 綠界的狀態碼很多且各超商不同，這裡原樣記錄 RtnCode/RtnMsg；「已完成」由店家在後台確認後標記。
const ecpay = require('../lib/ecpay');
const { ordersRef } = require('../lib/firebase');
const { historyEntry, applyOrderUpdate } = require('../lib/orders');

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
      // 300 = 訂單處理中（綠界已收到資料）；之後的貨態代表包裹已交寄或已在配送中
      const status = order.status === 'shipping' && code !== '300' ? 'shipped' : order.status;
      await applyOrderUpdate(null, order, { status, logistics: { ...order.logistics, lastStatus } }, historyEntry(status, `物流狀態 ${code}：${msg}`));
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send('1|OK');
  } catch (err) {
    console.error('logistics notify error', err);
    res.status(500).send('0|Server Error');
  }
};

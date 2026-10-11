// OrderResultURL：顧客付款完成後瀏覽器被綠界帶回這裡（Form POST），轉回商店頁顯示結果。
// 訂單狀態以 ReturnURL（ecpay_webhook）為準，這裡只負責導頁。
const ecpay = require('../lib/ecpay');

module.exports = (req, res) => {
  const data = { ...(req.body || {}) };
  const cfg = ecpay.paymentConfig();
  const verified = req.method === 'POST' && ecpay.verifyCheckMacValue(data, cfg.hashKey, cfg.hashIv, 'sha256');
  const success = verified && String(data.RtnCode) === '1';
  const orderNo = /^[A-Za-z0-9]{1,20}$/.test(String(data.MerchantTradeNo || '')) ? data.MerchantTradeNo : '';
  const target = `/shop.html?order=${success ? 'success' : 'pending'}${orderNo ? `&no=${orderNo}` : ''}`;
  res.writeHead(303, { Location: target });
  res.end();
};

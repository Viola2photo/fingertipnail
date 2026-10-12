// 後台「系統設定檢查」：只回報各項設定是否已填，不回傳任何金鑰內容
const ecpay = require('../lib/ecpay');
const { requireAdmin } = require('../lib/auth');
const { getSender, senderProblem } = require('../lib/shipping');

const has = (name) => Boolean(ecpay.envValue(name));

module.exports = async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const production = ecpay.isProduction();
  const senderIssue = senderProblem(await getSender().catch(() => ({ name: '', phone: '' })));
  const items = [
    { group: '模式', label: production ? '正式環境（真實收款）' : '測試環境（綠界公開測試帳號，不會真的扣款）', ok: true, warn: !production },
    { group: '金流', label: '特店編號 ECPAY_MERCHANT_ID', ok: has('ECPAY_MERCHANT_ID'), needed: production },
    { group: '金流', label: 'HashKey／HashIV', ok: has('ECPAY_HASH_KEY') && has('ECPAY_HASH_IV'), needed: production },
    { group: '物流', label: '物流 HashKey／HashIV', ok: has('ECPAY_LOGISTICS_HASH_KEY') && has('ECPAY_LOGISTICS_HASH_IV'), needed: production },
    { group: '物流', label: senderIssue ? `寄件人姓名與手機：${senderIssue}` : '寄件人姓名與手機（後台「出貨設定」）', ok: !senderIssue, needed: true },
    { group: '發票', label: ecpay.invoiceEnabled() ? '自動開立電子發票：開啟' : '自動開立電子發票：關閉', ok: ecpay.invoiceEnabled(), needed: false },
    { group: '發票', label: '發票特店編號與 HashKey／HashIV', ok: has('ECPAY_INVOICE_MERCHANT_ID') && has('ECPAY_INVOICE_HASH_KEY') && has('ECPAY_INVOICE_HASH_IV'), needed: production && ecpay.invoiceEnabled() },
    { group: '網址', label: `網站網址 SITE_URL：${ecpay.envValue('SITE_URL') || '未設定（使用目前網址）'}`, ok: has('SITE_URL'), needed: false },
    { group: '網址', label: `綠界通知網址：${ecpay.callbackBase(req)}`, ok: true, needed: false },
  ];
  res.json({ production, items });
};

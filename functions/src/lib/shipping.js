// 出貨設定：寄件人姓名與手機。優先使用後台「出貨設定」存的值，沒有才用部署參數 SENDER_NAME／SENDER_CELLPHONE。
const ecpay = require('./ecpay');
const { shippingSettingsRef } = require('./firebase');

async function getSender() {
  const snap = await shippingSettingsRef().get();
  const saved = snap.exists ? snap.data() : {};
  return {
    name: String(saved.senderName || ecpay.envValue('SENDER_NAME') || '').trim(),
    phone: String(saved.senderPhone || ecpay.envValue('SENDER_CELLPHONE') || '').replace(/\D/g, ''),
  };
}

// 回傳寄件人設定的問題（空字串代表沒問題）
function senderProblem(sender) {
  if (!sender.name || !sender.phone) return '請先到後台「訂單與出貨」→「出貨設定」填寫寄件人姓名與手機';
  if (!ecpay.logisticsName(sender.name)) return `寄件人姓名不符合超商規定（${ecpay.LOGISTICS_NAME_RULE}），請到「出貨設定」修改`;
  if (!/^09\d{8}$/.test(sender.phone)) return '寄件人手機需為 09 開頭 10 碼，請到「出貨設定」修改';
  return '';
}

module.exports = { getSender, senderProblem };

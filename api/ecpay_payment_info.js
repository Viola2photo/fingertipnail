// ATM / 超商代碼 / 條碼 取號結果通知（PaymentInfoURL）
// RtnCode=2（ATM）或 10100073（超商）代表「取號成功、顧客尚未繳費」，不是錯誤。規格：guides/01 §PaymentInfoURL
const ecpay = require('../lib/ecpay');
const { ordersRef } = require('../lib/firebase');
const { historyEntry, applyOrderUpdate } = require('../lib/orders');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const data = { ...(req.body || {}) };
  const cfg = ecpay.paymentConfig();
  if (!ecpay.verifyCheckMacValue(data, cfg.hashKey, cfg.hashIv, 'sha256')) {
    return res.status(400).send('0|CheckMacValue Error');
  }

  try {
    const snap = await ordersRef().doc(String(data.MerchantTradeNo || '')).get();
    const rtn = String(data.RtnCode);
    if (snap.exists && snap.data().status === 'pending' && (rtn === '2' || rtn === '10100073')) {
      const paymentInfo = {
        paymentType: String(data.PaymentType || ''),
        tradeNo: String(data.TradeNo || ''),
        bankCode: data.BankCode || '',
        vAccount: data.vAccount || '',
        paymentNo: data.PaymentNo || '',
        barcode: [data.Barcode1, data.Barcode2, data.Barcode3].filter(Boolean),
        expireDate: data.ExpireDate || '',
      };
      await applyOrderUpdate(null, snap.data(), { status: 'awaiting_payment', paymentInfo },
        historyEntry('awaiting_payment', `已取得繳費資訊，期限 ${paymentInfo.expireDate}`));
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send('1|OK');
  } catch (err) {
    console.error('payment info error', err);
    res.status(500).send('0|Server Error');
  }
};

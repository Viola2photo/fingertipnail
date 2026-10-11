// 綠界付款結果通知（ReturnURL，Server-to-Server Form POST）
// 規格：guides/01 §付款結果通知。驗證 CheckMacValue、冪等處理、10 秒內回應純文字 1|OK。
const ecpay = require('../lib/ecpay');
const { ordersRef } = require('../lib/firebase');
const { historyEntry, applyOrderUpdate } = require('../lib/orders');
const { markOrderPaid } = require('../lib/payment');

function ok(res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.status(200).send('1|OK');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const data = { ...(req.body || {}) };
  const cfg = ecpay.paymentConfig();
  if (!ecpay.verifyCheckMacValue(data, cfg.hashKey, cfg.hashIv, 'sha256')) {
    console.warn('ecpay return: CheckMacValue 驗證失敗', data.MerchantTradeNo);
    return res.status(400).send('0|CheckMacValue Error');
  }

  const merchantTradeNo = String(data.MerchantTradeNo || '');
  try {
    if (String(data.RtnCode) !== '1') {
      const snap = await ordersRef().doc(merchantTradeNo).get();
      if (snap.exists && ['pending', 'awaiting_payment'].includes(snap.data().status)) {
        await applyOrderUpdate(null, snap.data(), { status: 'payment_failed', paymentError: String(data.RtnMsg || '') },
          historyEntry('payment_failed', `綠界通知付款未成功：${data.RtnMsg || data.RtnCode}`));
      }
      return ok(res);
    }

    const outcome = await markOrderPaid(merchantTradeNo, {
      tradeNo: String(data.TradeNo || ''),
      paymentType: String(data.PaymentType || ''),
      paymentDate: String(data.PaymentDate || ''),
      tradeAmt: Number(data.TradeAmt || 0),
      fee: Number(data.PaymentTypeChargeFee || 0),
      simulated: String(data.SimulatePaid) === '1',
    });
    if (outcome === 'missing') console.warn('ecpay return: 找不到訂單', merchantTradeNo);
    ok(res);
  } catch (err) {
    console.error('ecpay return error', err);
    // 不回 1|OK，讓綠界稍後重送
    res.status(500).send('0|Server Error');
  }
};

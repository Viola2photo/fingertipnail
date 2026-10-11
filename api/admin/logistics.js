// 後台：建立超商物流單、列印託運單、查詢物流狀態（國內物流 C2C，CMV-MD5）
// 規格：guides/06-logistics-domestic.md（SNAPSHOT 2026-03）
const ecpay = require('../../lib/ecpay');
const { requireAdmin } = require('../../lib/auth');
const { ordersRef } = require('../../lib/firebase');
const { historyEntry, applyOrderUpdate } = require('../../lib/orders');

const PRINT_ENDPOINTS = {
  UNIMARTC2C: '/Express/PrintUniMartC2COrderInfo',
  FAMIC2C: '/Express/PrintFAMIC2COrderInfo',
  HILIFEC2C: '/Express/PrintHILIFEC2COrderInfo',
  OKMARTC2C: '/Express/PrintOKMARTC2COrderInfo',
};

async function createShipment(req, order, cfg) {
  if (order.status !== 'paid') throw new Error('只有「待出貨」的訂單可以建立物流單');
  if (order.shipping?.method !== 'CVS') throw new Error('這筆訂單不是超商取貨，請手動出貨並填寫追蹤編號');
  const senderName = process.env.SENDER_NAME;
  const senderPhone = process.env.SENDER_CELLPHONE;
  if (!senderName || !senderPhone) throw new Error('請先在環境變數設定寄件人 SENDER_NAME、SENDER_CELLPHONE');

  const amount = Math.min(20000, Math.max(1, Number(order.totalAmount) || 1));
  const params = {
    MerchantID: cfg.merchantId,
    MerchantTradeNo: ecpay.newMerchantTradeNo('LG'),
    MerchantTradeDate: ecpay.taipeiDateTime(),
    LogisticsType: 'CVS',
    LogisticsSubType: order.shipping.subType,
    GoodsAmount: String(amount),
    GoodsName: '穿戴甲',
    IsCollection: 'N',
    SenderName: senderName,
    SenderCellPhone: senderPhone,
    ReceiverName: order.customerInfo.name,
    ReceiverCellPhone: order.customerInfo.phone,
    ReceiverStoreID: order.shipping.id,
    ServerReplyURL: `${ecpay.siteOrigin(req)}/api/logistics_notify`,
  };
  // 7-ELEVEN 需另帶 CollectionAmount 且等於 GoodsAmount（guides/06 §超商取貨建單）
  if (params.LogisticsSubType === 'UNIMARTC2C') params.CollectionAmount = params.GoodsAmount;
  params.CheckMacValue = ecpay.generateCheckMacValue(params, cfg.hashKey, cfg.hashIv, 'md5');

  const result = ecpay.parsePipeResponse(await ecpay.postForm(`${cfg.host}/Express/Create`, params));
  if (!result.ok) throw new Error(`綠界建單失敗：${result.message}`);

  const logistics = {
    merchantTradeNo: params.MerchantTradeNo,
    id: result.data.AllPayLogisticsID || '',
    subType: params.LogisticsSubType,
    cvsPaymentNo: result.data.CVSPaymentNo || '',
    cvsValidationNo: result.data.CVSValidationNo || '',
    createdAt: new Date().toISOString(),
  };
  await applyOrderUpdate(null, order, { status: 'shipping', logistics },
    historyEntry('shipping', `已建立綠界物流單 ${logistics.id}（寄貨編號 ${logistics.cvsPaymentNo}）`));
  return { logistics };
}

function printLabel(order, cfg) {
  const lg = order.logistics;
  if (!lg || !lg.id) throw new Error('這筆訂單還沒有物流單');
  const endpoint = PRINT_ENDPOINTS[lg.subType];
  if (!endpoint) throw new Error('不支援的超商類型');
  const params = { MerchantID: cfg.merchantId, AllPayLogisticsID: lg.id, CVSPaymentNo: lg.cvsPaymentNo };
  if (lg.subType === 'UNIMARTC2C') params.CVSValidationNo = lg.cvsValidationNo;
  params.CheckMacValue = ecpay.generateCheckMacValue(params, cfg.hashKey, cfg.hashIv, 'md5');
  return { html: ecpay.autoSubmitForm(`${cfg.host}${endpoint}`, params) };
}

async function queryShipment(order, cfg) {
  const lg = order.logistics;
  if (!lg || !lg.id) throw new Error('這筆訂單還沒有物流單');
  const params = { MerchantID: cfg.merchantId, AllPayLogisticsID: lg.id, TimeStamp: String(Math.floor(Date.now() / 1000)) };
  params.CheckMacValue = ecpay.generateCheckMacValue(params, cfg.hashKey, cfg.hashIv, 'md5');
  const data = ecpay.parseUrlEncoded(await ecpay.postForm(`${cfg.host}/Helper/QueryLogisticsTradeInfo/V5`, params));
  return { data };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await requireAdmin(req, res))) return;

  try {
    const { action, orderId } = req.body || {};
    const snap = await ordersRef().doc(String(orderId || '')).get();
    if (!snap.exists) return res.status(404).json({ error: '找不到訂單' });
    const order = snap.data();
    const cfg = ecpay.logisticsConfig();

    if (action === 'create') return res.json(await createShipment(req, order, cfg));
    if (action === 'print') return res.json(printLabel(order, cfg));
    if (action === 'query') return res.json(await queryShipment(order, cfg));
    res.status(400).json({ error: '未知的操作' });
  } catch (err) {
    console.error('admin logistics error', err);
    res.status(400).json({ error: err.message || '操作失敗' });
  }
};

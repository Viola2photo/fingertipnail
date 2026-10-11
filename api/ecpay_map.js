// 開啟綠界超商電子地圖（C2C 店到店）。規格：guides/06 §電子地圖選店
const ecpay = require('../lib/ecpay');

const SUBTYPES = ['UNIMARTC2C', 'FAMIC2C', 'HILIFEC2C', 'OKMARTC2C'];

module.exports = async (req, res) => {
  const type = SUBTYPES.includes(req.query.type) ? req.query.type : 'UNIMARTC2C';
  const cfg = ecpay.logisticsConfig();
  const params = {
    MerchantID: cfg.merchantId,
    MerchantTradeNo: ecpay.newMerchantTradeNo('MAP'),
    LogisticsType: 'CVS',
    LogisticsSubType: type,
    IsCollection: 'N',
    // 地圖選店結果專用端點，與物流狀態通知（logistics_notify）不同
    ServerReplyURL: `${ecpay.siteOrigin(req)}/api/ecpay_map_reply`,
  };
  params.CheckMacValue = ecpay.generateCheckMacValue(params, cfg.hashKey, cfg.hashIv, 'md5');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(ecpay.autoSubmitForm(`${cfg.host}/Express/map`, params));
};

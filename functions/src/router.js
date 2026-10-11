// /api 路由。同一個函式同時服務兩種網址：
//   經 Firebase Hosting：https://你的網域/api/...（顧客瀏覽器用）
//   直連 Cloud Functions：https://asia-east1-專案.cloudfunctions.net/api/api/...（綠界伺服器通知用）
const routes = {
  'POST /api/checkout': require('./handlers/checkout'),
  'POST /api/quote': require('./handlers/quote'),
  'POST /api/ecpay/return': require('./handlers/ecpayReturn'),
  'POST /api/ecpay/payment-info': require('./handlers/ecpayPaymentInfo'),
  'POST /api/ecpay/result': require('./handlers/ecpayResult'),
  'GET /api/ecpay/map': require('./handlers/ecpayMap'),
  'POST /api/ecpay/map-reply': require('./handlers/ecpayMapReply'),
  'POST /api/ecpay/logistics-notify': require('./handlers/logisticsNotify'),
  'POST /api/admin/order': require('./handlers/adminOrder'),
  'POST /api/admin/logistics': require('./handlers/adminLogistics'),
  'GET /api/admin/status': require('./handlers/adminStatus'),
};

function routeKey(req) {
  const path = String(req.path || req.url || '').split('?')[0];
  // 直連網址會多一層函式名稱 /api，將開頭重複的 /api 合併成一個
  const normalized = path.replace(/^(\/api)+(?=\/)/, '/api').replace(/\/+$/, '');
  return `${req.method} ${normalized}`;
}

async function handle(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const handler = routes[routeKey(req)];
  if (!handler) return res.status(404).json({ error: '找不到這個 API' });
  return handler(req, res);
}

module.exports = { handle, routes, routeKey };

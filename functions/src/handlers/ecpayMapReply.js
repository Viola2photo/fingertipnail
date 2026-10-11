// 電子地圖選店結果：把門市資料傳回開啟地圖的購物車視窗
const ecpay = require('../lib/ecpay');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('不允許的方法');

  const body = req.body || {};
  const store = {
    type: 'ECPAY_MAP_RESULT',
    storeId: String(body.CVSStoreID || ''),
    storeName: String(body.CVSStoreName || ''),
    storeAddress: String(body.CVSAddress || ''),
    subType: String(body.LogisticsSubType || ''),
  };
  // 門市名稱來自外部請求，序列化後跳脫 < > &，避免被當成 HTML/Script 執行
  const json = JSON.stringify(store).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  const origin = JSON.stringify(ecpay.siteOrigin(req));

  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><title>門市選擇成功</title></head>
<body style="text-align:center; padding-top:50px; font-family:sans-serif;">
  <h2>門市選擇成功</h2>
  <p>${ecpay.escapeHtml(store.storeName)}</p>
  <p>請關閉此視窗，回到購物車繼續結帳。</p>
  <script>
    if (window.opener) {
      window.opener.postMessage(${json}, ${origin});
      window.close();
    }
  </script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
};

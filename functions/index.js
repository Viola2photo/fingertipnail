// Firebase Cloud Functions 進入點（地區：asia-east1 台灣）
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions } = require('firebase-functions/v2');
const { allSecrets } = require('./src/params');

setGlobalOptions({ region: 'asia-east1', maxInstances: 10 });

// 所有 /api/* 請求（結帳、綠界通知、後台操作）
exports.api = onRequest({ secrets: allSecrets, memory: '256MiB', timeoutSeconds: 60, invoker: 'public' }, (req, res) => {
  const { handle } = require('./src/router');
  return handle(req, res);
});

// 每 10 分鐘：自動開立電子發票、補查付款、取消逾期未付款訂單
exports.maintenance = onSchedule({ schedule: 'every 10 minutes', timeZone: 'Asia/Taipei', secrets: allSecrets }, async () => {
  const { runMaintenance } = require('./src/maintenance');
  const log = await runMaintenance();
  if (log.length) console.log('maintenance', log);
});

// 建檔系統的「照片識別款式」（Google Vision），沿用原本功能。
// 顧客也能用 Google 登入，所以要限定店家帳號，避免任何人登入後狂呼叫 Vision 產生費用
exports.analyzeImage = onCall({ memory: '512MiB', maxInstances: 2 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', '請先登入');
  const { isAdminUid } = require('./src/lib/auth');
  if (!isAdminUid(request.auth.uid)) throw new HttpsError('permission-denied', '這個帳號沒有建檔權限');
  const imageBase64 = String(request.data?.imageBase64 || '');
  if (!imageBase64.includes(',')) throw new HttpsError('invalid-argument', '缺少圖片');
  const vision = require('@google-cloud/vision');
  const client = new vision.ImageAnnotatorClient();
  try {
    const [result] = await client.annotateImage({
      image: { content: imageBase64.split(',')[1] },
      features: [{ type: 'LABEL_DETECTION', maxResults: 10 }],
    });
    return { labels: (result.labelAnnotations || []).map((l) => l.description.toLowerCase()) };
  } catch (e) {
    console.error('Vision API 錯誤', e);
    throw new HttpsError('internal', '圖像分析失敗');
  }
});

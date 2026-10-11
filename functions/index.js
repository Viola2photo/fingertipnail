const functions = require('firebase-functions');
const vision = require('@google-cloud/vision');

// 創建 Vision API 客戶端
const client = new vision.ImageAnnotatorClient();

exports.analyzeImage = functions.https.onCall(async (data, context) => {
  // 檢查用戶是否已認證
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', '用戶未認證');
  }

  try {
    const { imageBase64 } = data;

    // 將 base64 轉換為 Vision API 格式
    const request = {
      image: {
        content: imageBase64.split(',')[1] // 移除 data:image/jpeg;base64,前綴
      },
      features: [{
        type: 'LABEL_DETECTION',
        maxResults: 10
      }]
    };

    // 調用 Vision API
    const [result] = await client.annotateImage(request);
    const labels = result.labelAnnotations.map(label => label.description.toLowerCase());

    return { labels };
  } catch (error) {
    console.error('Vision API 錯誤:', error);
    throw new functions.https.HttpsError('internal', '圖像分析失敗');
  }
});
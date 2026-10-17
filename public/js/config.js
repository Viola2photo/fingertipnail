// 網站設定：文字與顯示用的數字都在這裡改，不需要動到程式。
// 注意：實際收費（運費、免運門檻、任 4 件活動、優惠碼）以伺服器 functions/src/lib/pricing.js 為準，
// 修改那邊時請同步修改這裡的說明文字。
export const SITE = {
  name: '指尖造藝',
  tagline: 'Fingertip Atelier',
  contactEmail: 'viola.lomography@gmail.com',
  announcement: '穿戴甲 NT$300 起 ・ 滿 NT$1,000 免運 ・ 任選 4 件 NT$1,000',
  freeShippingThreshold: 1000,
  shippingFee: 60,
  // 果凍膠：建檔系統裡商品名稱含這個字的商品，會當成加購用的果凍膠（不顯示在款式清單）
  glueKeyword: '果凍膠',
  // 尺寸對照表在 pages.js 的 GUIDE_PAGE.table
  // 防詐騙提醒：顯示在頁尾與「我的訂單」
  antiFraud: '防詐騙提醒：指尖造藝不會用電話、LINE 或簡訊要求您操作 ATM、網路銀行、解除分期或取消定期扣款，也不會要求您提供信用卡資料。接到可疑來電請直接掛斷，撥打 165 反詐騙專線查證。',
};

// Firebase 網頁設定（這組是公開的網頁識別碼，不是密碼；請在 Google Cloud 限制只允許你的網域使用）
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDQZGeeubB8bEUL59v9yt0QBAfIWJcvgnw',
  authDomain: 'nailproject-40022.firebaseapp.com',
  projectId: 'nailproject-40022',
  storageBucket: 'nailproject-40022.firebasestorage.app',
  messagingSenderId: '1004628981925',
  appId: '1:1004628981925:web:db01ede0c09f4071d5754c',
};

export const APP_ID = 'nail-inventory-app';
export const SHOP_OWNER_UID = 'MvkJo5e1kEcBS0fGGMr4RKdQjYg1';

export const SIZES = ['XS', 'S', 'M', 'L'];

export const SHAPE_GROUPS = [
  { key: 'short', label: '短甲', note: '日常好打字、俏皮童趣', chip: 'chip-pink', shapes: ['短梯', '短橢圓', '短圓'] },
  { key: 'mid', label: '中長甲', note: '優雅又不怕卡', chip: 'chip-lav', shapes: ['中橢圓', '杏仁甲', '中梯', '新中方'] },
  { key: 'long', label: '長甲', note: '千金修長、氣場全開', chip: 'chip-mint', shapes: ['長橢圓', '細狗尖', '長梯', '長水滴', '超長梯'] },
];

// 依品名、描述、關鍵字自動歸類風格（可自行增減關鍵字）
export const MOODS = [
  { key: 'luxe', label: '千金奢華', hint: '巨鑽珍珠', chip: 'chip-pink', words: ['千金', '巨鑽', '珍珠', '寶石', '鎏金', '奢華', '名媛'] },
  { key: 'sweet', label: '甜妹約會', hint: '蝴蝶結', chip: 'chip-peach', words: ['甜', '蝴蝶結', '約會', '蜜桃', '櫻花', '粉嫩', '芭蕾'] },
  { key: 'cool', label: '清冷仙氣', hint: '冰透貓眼', chip: 'chip-sky', words: ['清冷', '仙氣', '冰透', '貓眼', '極光', '人魚', '冰藍'] },
  { key: 'cute', label: '童趣塗鴉', hint: '小貓小狗', chip: 'chip-mint', words: ['塗鴉', '小貓', '小狗', '喵', '修勾', '童趣', '萌', '手帳', '卡皮', '小熊'] },
  { key: 'vintage', label: '復古藝術', hint: '手繪油畫', chip: 'chip-lav', words: ['復古', '手繪', '油畫', '浮雕', '押花', '莫內', '藝術'] },
  { key: 'edgy', label: '甜酷黑粉', hint: '波點', chip: 'chip-white', words: ['黑', '甜酷', '波點', '歌德', '暗黑', '豹紋', 'Y2K'] },
];

export const PRICE_TIERS = [300, 390, 450, 490, 590];

export const ORDER_STATUS = {
  pending: ['待付款', 'chip-peach'],
  awaiting_payment: ['待繳費', 'chip-peach'],
  paid: ['已付款，準備出貨', 'chip-sky'],
  shipping: ['包裹準備中', 'chip-sky'],
  shipped: ['已出貨', 'chip-mint'],
  completed: ['已完成', 'chip-mint'],
  cancelled: ['已取消', 'chip-white'],
  payment_failed: ['付款未成功', 'chip-white'],
  amount_mismatch: ['處理中', 'chip-white'],
};

// firebase-admin 初始化與資料路徑。路徑沿用既有建檔系統與商店的結構。
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

// 在 Cloud Functions 上使用預設服務帳號；在其他主機執行時才需要提供 FIREBASE_* 環境變數
if (!getApps().length) {
  if (process.env.FIREBASE_CLIENT_EMAIL) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      }),
    });
  } else {
    initializeApp();
  }
}

const db = getFirestore();
const verifyIdToken = (token) => getAuth().verifyIdToken(token);
// LINE 登入：伺服器確認身分後發給瀏覽器的一次性登入憑證（需要服務帳號有「Service Account Token Creator」權限）
const createCustomToken = (uid, claims) => getAuth().createCustomToken(uid, claims);
// 建立或更新會員的顯示名稱與頭像，讓後台與「我的訂單」看得到名字
async function upsertAuthUser(uid, profile) {
  const auth = getAuth();
  try {
    await auth.updateUser(uid, profile);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    await auth.createUser({ uid, ...profile });
  }
}
const APP_ID = 'nail-inventory-app';
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || 'MvkJo5e1kEcBS0fGGMr4RKdQjYg1';

const shopRoot = () => db.collection('artifacts').doc(APP_ID).collection('users').doc(ADMIN_USER_ID);
const inventoryRef = () => shopRoot().collection('inventory');
// 所有訂單集中存在店家這裡，後台直接讀取
const ordersRef = () => shopRoot().collection('orders');
// 每一次庫存異動（進貨、售出、盤點調整、退貨）的紀錄
const stockMovementsRef = () => shopRoot().collection('stockMovements');
// 後台「出貨設定」（寄件人姓名、手機），店家在後台直接修改
const shippingSettingsRef = () => shopRoot().collection('settings').doc('shipping');
// LINE 登入進行中的暫存（防止偽造的登入回呼），只有伺服器讀寫，網頁規則一律拒絕
const lineLoginStatesRef = () => db.collection('lineLoginStates');
// 顧客「我的訂單」看的副本
const customerOrderRef = (uid, orderId) =>
  db.collection('artifacts').doc(APP_ID).collection('users').doc(uid).collection('orders').doc(orderId);

module.exports = { FieldValue, verifyIdToken, createCustomToken, upsertAuthUser, lineLoginStatesRef, db, APP_ID, ADMIN_USER_ID, inventoryRef, ordersRef, stockMovementsRef, shippingSettingsRef, customerOrderRef };

// firebase-admin 初始化與資料路徑。路徑沿用既有建檔系統（index.html）與商店（shop.html）的結構。
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    }),
  });
}

const db = admin.firestore();
const APP_ID = 'nail-inventory-app';
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || 'MvkJo5e1kEcBS0fGGMr4RKdQjYg1';

const shopRoot = () => db.collection('artifacts').doc(APP_ID).collection('users').doc(ADMIN_USER_ID);
const inventoryRef = () => shopRoot().collection('inventory');
// 所有訂單集中存在店家這裡，後台直接讀取
const ordersRef = () => shopRoot().collection('orders');
// 每一次庫存異動（進貨、售出、盤點調整、退貨）的紀錄
const stockMovementsRef = () => shopRoot().collection('stockMovements');
// 顧客「我的訂單」看的副本
const customerOrderRef = (uid, orderId) =>
  db.collection('artifacts').doc(APP_ID).collection('users').doc(uid).collection('orders').doc(orderId);

module.exports = { admin, db, APP_ID, ADMIN_USER_ID, inventoryRef, ordersRef, stockMovementsRef, customerOrderRef };

// Firebase（固定版本，避免 CDN 改版影響網站）
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithPopup, signInWithCustomToken, GoogleAuthProvider, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, collection, onSnapshot, query, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { FIREBASE_CONFIG, APP_ID, SHOP_OWNER_UID } from './config.js';

const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
const db = getFirestore(app);

export function watchUser(cb) {
  return onAuthStateChanged(auth, cb);
}
export const login = () => signInWithPopup(auth, new GoogleAuthProvider());
// LINE 登入走伺服器（/api/line/login），登入完成後回到 next 指定的頁面
export const loginWithLine = (next = location.hash) => location.assign(`/api/line/login?next=${encodeURIComponent(next || '#/')}`);
export const loginWithToken = (token) => signInWithCustomToken(auth, token);
export const logout = () => signOut(auth);

export function watchProducts(cb, onError) {
  const ref = collection(db, 'artifacts', APP_ID, 'users', SHOP_OWNER_UID, 'inventory');
  return onSnapshot(ref, (snap) => cb(snap.docs.map((d) => ({ ...d.data(), docId: d.id }))), onError);
}

export function watchMyOrders(uid, cb, onError) {
  const ref = query(collection(db, 'artifacts', APP_ID, 'users', uid, 'orders'), orderBy('createdAt', 'desc'), limit(30));
  return onSnapshot(ref, (snap) => cb(snap.docs.map((d) => d.data())), onError);
}

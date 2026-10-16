// Firebase（固定版本，避免 CDN 改版影響網站）
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, collection, doc, onSnapshot, query, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { FIREBASE_CONFIG, APP_ID, SHOP_OWNER_UID } from './config.js';

const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
const db = getFirestore(app);

export function watchUser(cb) {
  return onAuthStateChanged(auth, cb);
}
export const login = () => signInWithPopup(auth, new GoogleAuthProvider());
export const logout = () => signOut(auth);

export function watchProducts(cb, onError) {
  const ref = collection(db, 'artifacts', APP_ID, 'users', SHOP_OWNER_UID, 'inventory');
  return onSnapshot(ref, (snap) => cb(snap.docs.map((d) => ({ ...d.data(), docId: d.id }))), onError);
}

export function watchMyOrders(uid, cb, onError) {
  const ref = query(collection(db, 'artifacts', APP_ID, 'users', uid, 'orders'), orderBy('createdAt', 'desc'), limit(30));
  return onSnapshot(ref, (snap) => cb(snap.docs.map((d) => d.data())), onError);
}

// 後台「網站文字」存的內容（settings/siteText）；讀不到時網站照常用預設文字
export function watchSiteText(cb) {
  const ref = doc(db, 'artifacts', APP_ID, 'users', SHOP_OWNER_UID, 'settings', 'siteText');
  return onSnapshot(ref, (snap) => cb(snap.exists() ? snap.data() : null), () => cb(null));
}

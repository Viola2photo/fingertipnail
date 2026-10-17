// 後台 API 的身分驗證：前端帶 Firebase ID token，伺服器驗證是不是店家帳號
const { verifyIdToken, ADMIN_USER_ID } = require('./firebase');

function adminUids() {
  const extra = (process.env.ADMIN_UIDS || '').split(',').map((s) => s.trim()).filter((s) => s && s !== '-');
  return new Set([ADMIN_USER_ID, ...extra]);
}

async function verifyUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  try {
    return await verifyIdToken(token);
  } catch (e) {
    return null;
  }
}

function isAdminUid(uid) {
  return adminUids().has(uid);
}

// 不是店家就直接回 401/403，回傳 null；是店家回傳 decoded token
async function requireAdmin(req, res) {
  const user = await verifyUser(req);
  if (!user) { res.status(401).json({ error: '請先登入' }); return null; }
  if (!isAdminUid(user.uid)) { res.status(403).json({ error: '這個帳號沒有後台權限' }); return null; }
  return user;
}

module.exports = { verifyUser, requireAdmin, isAdminUid };

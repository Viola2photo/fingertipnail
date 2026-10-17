// LINE 授權後導回這裡：確認 state 是我們發的、向 LINE 驗證身分，再用 Firebase 登入憑證讓顧客登入
// 憑證放在網址 # 後面（不會送到伺服器或被記錄），前台讀到後立刻登入並從網址移除
const { siteOrigin } = require('../lib/ecpay');
const { db, lineLoginStatesRef, createCustomToken, upsertAuthUser } = require('../lib/firebase');
const { STATE_TTL_MS, lineConfig, redirectUri, exchangeCode } = require('../lib/line');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const origin = siteOrigin(req);
  const failed = (reason) => res.redirect(303, `${origin}/?login=${reason}#/orders`);
  const cfg = lineConfig();
  if (!cfg) return failed('line_unavailable');

  const q = req.query || {};
  const state = String(q.state || '');
  if (!/^[0-9a-f]{48}$/.test(state)) return failed('line_failed');

  // state 只能用一次：讀出來就刪掉
  const ref = lineLoginStatesRef().doc(state);
  let saved = null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    saved = snap.data();
    tx.delete(ref);
  });
  if (!saved || Date.now() - Number(saved.createdAt) > STATE_TTL_MS) return failed('line_failed');
  // 顧客在 LINE 授權頁按了取消
  if (q.error || !q.code) return failed('line_cancelled');

  try {
    const profile = await exchangeCode(cfg, String(q.code), redirectUri(req), saved.nonce);
    const uid = `line:${profile.sub}`;
    await upsertAuthUser(uid, { displayName: String(profile.name || 'LINE 會員').slice(0, 60), ...(profile.picture ? { photoURL: profile.picture } : {}) });
    const token = await createCustomToken(uid, { provider: 'line' });
    res.redirect(303, `${origin}/#line_token=${encodeURIComponent(token)}&next=${encodeURIComponent(saved.next)}`);
  } catch (err) {
    console.error('line login error', err);
    failed('line_failed');
  }
};

// 開始 LINE 登入：產生一次性 state／nonce 存在伺服器，再導到 LINE 授權頁
const crypto = require('crypto');
const { siteOrigin } = require('../lib/ecpay');
const { lineLoginStatesRef } = require('../lib/firebase');
const { AUTHORIZE_URL, lineConfig, redirectUri, safeNext } = require('../lib/line');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const cfg = lineConfig();
  if (!cfg) return res.redirect(303, `${siteOrigin(req)}/?login=line_unavailable#/orders`);

  const state = crypto.randomBytes(24).toString('hex');
  const nonce = crypto.randomBytes(16).toString('hex');
  await lineLoginStatesRef().doc(state).set({ nonce, next: safeNext(req.query?.next), createdAt: Date.now() });

  const params = new URLSearchParams({
    response_type: 'code', client_id: cfg.channelId, redirect_uri: redirectUri(req), state, nonce, scope: 'profile openid',
  });
  res.redirect(303, `${AUTHORIZE_URL}?${params}`);
};

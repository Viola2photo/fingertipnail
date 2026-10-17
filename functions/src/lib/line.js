// LINE Login v2.1（OpenID Connect）。規格：developers.line.biz/en/docs/line-login/integrate-line-login/
// 流程：/api/line/login 導到 LINE 授權頁 → LINE 帶 code 回 /api/line/callback → 伺服器換 token 並向 LINE 驗證 ID token
// → 發 Firebase 登入憑證給瀏覽器。Channel secret 只在伺服器使用，不會出現在網頁上。
const { envValue, siteOrigin } = require('./ecpay');

const AUTHORIZE_URL = 'https://access.line.me/oauth2/v2.1/authorize';
const TOKEN_URL = 'https://api.line.me/oauth2/v2.1/token';
const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';
const STATE_TTL_MS = 10 * 60 * 1000;

function lineConfig() {
  const channelId = envValue('LINE_CHANNEL_ID');
  const channelSecret = envValue('LINE_CHANNEL_SECRET');
  return channelId && channelSecret ? { channelId, channelSecret } : null;
}

// LINE Developers 後台的 Callback URL 要填這個網址（完全相同）
const redirectUri = (req) => `${siteOrigin(req)}/api/line/callback`;

// 登入完成後要回到的頁面，只接受站內的 #/ 路徑，避免被利用導到其他網站
function safeNext(next) {
  const s = String(next || '');
  return /^#\/[A-Za-z0-9/_-]*$/.test(s) ? s : '#/orders';
}

async function postForm(url, params) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(8000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`LINE 回應 HTTP ${response.status}：${data.error_description || data.error || ''}`);
  return data;
}

// code → ID token → 經 LINE 驗證後的會員資料 { sub, name, picture }
async function exchangeCode(cfg, code, uri, nonce) {
  const token = await postForm(TOKEN_URL, {
    grant_type: 'authorization_code', code, redirect_uri: uri, client_id: cfg.channelId, client_secret: cfg.channelSecret,
  });
  if (!token.id_token) throw new Error('LINE 沒有回傳 ID token（請確認 channel 已開啟 openid）');
  const profile = await postForm(VERIFY_URL, { id_token: token.id_token, client_id: cfg.channelId, nonce });
  if (!profile.sub) throw new Error('LINE ID token 驗證失敗');
  return profile;
}

module.exports = { AUTHORIZE_URL, STATE_TTL_MS, lineConfig, redirectUri, safeNext, exchangeCode };

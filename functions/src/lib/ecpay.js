// 綠界 ECPay 共用工具：設定、CheckMacValue、時間格式、回應解析
// 規格來源：ECPay-API-Skill guides/13-checkmacvalue.md、guides/01-payment-aio.md、
// guides/06-logistics-domestic.md、guides/14-aes-encryption.md、guides/04-invoice-b2c.md
// （SNAPSHOT 2026-03/04；developers.ecpay.com.tw 無法即時讀取時的備援）
const crypto = require('crypto');

// 官方公開測試帳號（SKILL.md §測試帳號）。正式帳號一律只放在環境變數，不可寫進程式碼。
const STAGE_PAYMENT = { merchantId: '3002607', hashKey: 'pwFHCqoQZGmho4w6', hashIv: 'EkRm7iFT261dpevs' };
const STAGE_LOGISTICS_C2C = { merchantId: '2000933', hashKey: 'XBERn1YOvpM9nfZc', hashIv: 'h1ONHk4P4yqbl5LK' };
const STAGE_INVOICE = { merchantId: '2000132', hashKey: 'ejCk326UnaZWKisg', hashIv: 'q9jcZX8Ib9LM8wYk' };

function isProduction() {
  return process.env.ECPAY_ENV === 'production';
}

// 設定值為空或 "-" 視為尚未填寫（部署時可先填 - 佔位，之後再補）
function envValue(name) {
  const value = String(process.env[name] || '').trim();
  return value && value !== '-' ? value : '';
}

function requireEnv(name) {
  const value = envValue(name);
  if (!value) throw new Error(`尚未設定 ${name}，請參考 README「填入金鑰」`);
  return value;
}

function paymentConfig() {
  if (!isProduction()) return { ...STAGE_PAYMENT, host: 'https://payment-stage.ecpay.com.tw' };
  return {
    merchantId: requireEnv('ECPAY_MERCHANT_ID'),
    hashKey: requireEnv('ECPAY_HASH_KEY'),
    hashIv: requireEnv('ECPAY_HASH_IV'),
    host: 'https://payment.ecpay.com.tw',
  };
}

// 國內物流（C2C 店到店）。物流的 HashKey/HashIV 與金流不同，需另外設定。
function logisticsConfig() {
  if (!isProduction()) return { ...STAGE_LOGISTICS_C2C, host: 'https://logistics-stage.ecpay.com.tw' };
  return {
    merchantId: envValue('ECPAY_LOGISTICS_MERCHANT_ID') || requireEnv('ECPAY_MERCHANT_ID'),
    hashKey: requireEnv('ECPAY_LOGISTICS_HASH_KEY'),
    hashIv: requireEnv('ECPAY_LOGISTICS_HASH_IV'),
    host: 'https://logistics.ecpay.com.tw',
  };
}

// B2C 電子發票（AES-JSON）。發票帳號與金流、物流各自獨立（guides/11 §跨服務整合要點）。
function invoiceConfig() {
  if (!isProduction()) return { ...STAGE_INVOICE, host: 'https://einvoice-stage.ecpay.com.tw' };
  return {
    merchantId: requireEnv('ECPAY_INVOICE_MERCHANT_ID'),
    hashKey: requireEnv('ECPAY_INVOICE_HASH_KEY'),
    hashIv: requireEnv('ECPAY_INVOICE_HASH_IV'),
    host: 'https://einvoice.ecpay.com.tw',
  };
}

function invoiceEnabled() {
  return String(process.env.INVOICE_ENABLED || '').toLowerCase() === 'true';
}

// guides/14 §Node.js：AES 專用 URL encode（不轉小寫、不做 .NET 還原，與 CheckMacValue 的不同，不可混用）
function aesUrlEncode(text) {
  return encodeURIComponent(text)
    .replace(/%20/g, '+').replace(/~/g, '%7E').replace(/!/g, '%21')
    .replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A');
}

function aesEncrypt(data, hashKey, hashIv) {
  const json = typeof data === 'string' ? data : JSON.stringify(data);
  const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.from(hashKey, 'utf8').subarray(0, 16), Buffer.from(hashIv, 'utf8').subarray(0, 16));
  return Buffer.concat([cipher.update(aesUrlEncode(json), 'utf8'), cipher.final()]).toString('base64');
}

function aesDecrypt(cipherText, hashKey, hashIv) {
  const decipher = crypto.createDecipheriv('aes-128-cbc', Buffer.from(hashKey, 'utf8').subarray(0, 16), Buffer.from(hashIv, 'utf8').subarray(0, 16));
  const plain = Buffer.concat([decipher.update(Buffer.from(cipherText, 'base64')), decipher.final()]).toString('utf8');
  return JSON.parse(decodeURIComponent(plain.replace(/\+/g, '%20')));
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`綠界回應 HTTP ${response.status}`);
  return response.json();
}

// guides/13 §Node.js：urlencode → 小寫 → .NET 字元還原（僅供 CheckMacValue 使用）
function ecpayUrlEncode(source) {
  let encoded = encodeURIComponent(source).replace(/%20/g, '+').replace(/~/g, '%7e').replace(/'/g, '%27');
  encoded = encoded.toLowerCase();
  const replacements = { '%2d': '-', '%5f': '_', '%2e': '.', '%21': '!', '%2a': '*', '%28': '(', '%29': ')' };
  for (const [from, to] of Object.entries(replacements)) encoded = encoded.split(from).join(to);
  return encoded;
}

function generateCheckMacValue(params, hashKey, hashIv, method = 'sha256') {
  const keys = Object.keys(params)
    .filter((k) => k !== 'CheckMacValue')
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const paramStr = keys.map((k) => `${k}=${params[k]}`).join('&');
  const raw = `HashKey=${hashKey}&${paramStr}&HashIV=${hashIv}`;
  return crypto.createHash(method).update(ecpayUrlEncode(raw), 'utf8').digest('hex').toUpperCase();
}

function verifyCheckMacValue(params, hashKey, hashIv, method = 'sha256') {
  const received = Buffer.from(String(params.CheckMacValue || '').toUpperCase());
  const calculated = Buffer.from(generateCheckMacValue(params, hashKey, hashIv, method));
  if (received.length !== calculated.length) return false;
  return crypto.timingSafeEqual(received, calculated);
}

// MerchantTradeDate 必須是台灣時間 yyyy/MM/dd HH:mm:ss（月日補零）
function taipeiDateTime(date = new Date()) {
  const t = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}/${pad(t.getUTCMonth() + 1)}/${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`;
}

// MerchantTradeNo：僅英數字、最長 20 字元、永久唯一
function newMerchantTradeNo(prefix = 'NS') {
  const time = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}${time}${rand}`.slice(0, 20);
}

// ItemName / TradeDesc：去除 HTML 與控制字元，並以字元（非位元組）截斷，避免 UTF-8 截半造成 CMV 不符
function cleanText(text, maxChars) {
  const cleaned = String(text || '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .trim();
  return Array.from(cleaned).slice(0, maxChars).join('');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function autoSubmitForm(action, params) {
  const inputs = Object.entries(params)
    .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`)
    .join('');
  return `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="utf-8"><title>前往綠界…</title></head>` +
    `<body><form id="ecpay-form" method="POST" action="${escapeHtml(action)}">${inputs}</form>` +
    `<script>document.getElementById('ecpay-form').submit();</script></body></html>`;
}

// 物流建單回應：成功為 `1|k=v&k=v`，失敗為 `0|錯誤訊息`（guides/19 §國內物流回應格式）
function parsePipeResponse(text) {
  const body = String(text || '').trim();
  const idx = body.indexOf('|');
  if (idx < 0) return { ok: false, message: body, data: {} };
  const code = body.slice(0, idx);
  const rest = body.slice(idx + 1);
  if (code !== '1') return { ok: false, message: rest, data: {} };
  return { ok: true, message: '', data: Object.fromEntries(new URLSearchParams(rest)) };
}

function parseUrlEncoded(text) {
  return Object.fromEntries(new URLSearchParams(String(text || '').trim()));
}

async function postForm(url, params) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`綠界回應 HTTP ${response.status}`);
  return response.text();
}

// 本站給顧客看的網址（付款後導回、選店結果回傳都是顧客瀏覽器的請求）
function siteOrigin(req) {
  if (envValue('SITE_URL')) return envValue('SITE_URL').replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = host && host.startsWith('localhost') ? 'http' : 'https';
  return `${proto}://${host}`;
}

// 綠界伺服器直接呼叫的通知網址（ReturnURL、PaymentInfoURL、物流 ServerReplyURL）。
// SKILL 規定這些網址不可放在 CDN 後方，而 Firebase Hosting 前面有 CDN，
// 所以預設使用 Cloud Functions 的直連網址；要改可設定 CALLBACK_BASE_URL。
function callbackBase(req) {
  if (envValue('CALLBACK_BASE_URL')) return envValue('CALLBACK_BASE_URL').replace(/\/$/, '');
  const project = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  const region = process.env.FUNCTION_REGION || 'asia-east1';
  if (project && process.env.K_SERVICE) return `https://${region}-${project}.cloudfunctions.net/api`;
  return siteOrigin(req);
}

module.exports = {
  isProduction,
  envValue,
  paymentConfig,
  logisticsConfig,
  invoiceConfig,
  invoiceEnabled,
  aesUrlEncode,
  aesEncrypt,
  aesDecrypt,
  postJson,
  callbackBase,
  ecpayUrlEncode,
  generateCheckMacValue,
  verifyCheckMacValue,
  taipeiDateTime,
  newMerchantTradeNo,
  cleanText,
  escapeHtml,
  autoSubmitForm,
  parsePipeResponse,
  parseUrlEncoded,
  postForm,
  siteOrigin,
};

// 部署時才填的設定。金鑰類用 Secret Manager 保管（不會出現在程式碼、GitHub 或網頁上），
// 其餘用一般參數。部署（firebase deploy）時 CLI 會逐一詢問尚未設定的值。
// 執行時這些值都會以環境變數提供，lib/ 內一律從 process.env 讀取。
const { defineSecret, defineString, defineBoolean } = require('firebase-functions/params');

const secrets = {
  ECPAY_HASH_KEY: defineSecret('ECPAY_HASH_KEY'),
  ECPAY_HASH_IV: defineSecret('ECPAY_HASH_IV'),
  ECPAY_LOGISTICS_HASH_KEY: defineSecret('ECPAY_LOGISTICS_HASH_KEY'),
  ECPAY_LOGISTICS_HASH_IV: defineSecret('ECPAY_LOGISTICS_HASH_IV'),
  ECPAY_INVOICE_HASH_KEY: defineSecret('ECPAY_INVOICE_HASH_KEY'),
  ECPAY_INVOICE_HASH_IV: defineSecret('ECPAY_INVOICE_HASH_IV'),
};

const strings = {
  ECPAY_ENV: defineString('ECPAY_ENV', {
    default: 'stage',
    description: 'stage＝綠界測試環境（使用官方公開測試帳號）；production＝正式收款',
  }),
  ECPAY_MERCHANT_ID: defineString('ECPAY_MERCHANT_ID', { default: '-', description: '金流特店編號（正式環境才需要，未取得請填 -）' }),
  ECPAY_LOGISTICS_MERCHANT_ID: defineString('ECPAY_LOGISTICS_MERCHANT_ID', { default: '-', description: '物流特店編號（未填則沿用金流特店編號）' }),
  ECPAY_INVOICE_MERCHANT_ID: defineString('ECPAY_INVOICE_MERCHANT_ID', { default: '-', description: '電子發票特店編號' }),
  SENDER_NAME: defineString('SENDER_NAME', { default: '-', description: '超商物流寄件人姓名' }),
  SENDER_CELLPHONE: defineString('SENDER_CELLPHONE', { default: '-', description: '超商物流寄件人手機（09 開頭 10 碼）' }),
  SITE_URL: defineString('SITE_URL', { default: '-', description: '網站正式網址，例如 https://你的網域（申請網址前填 -）' }),
  CALLBACK_BASE_URL: defineString('CALLBACK_BASE_URL', {
    default: '-',
    description: '綠界伺服器通知要打的網址；填 - 會自動使用 Cloud Functions 直連網址（避開 CDN，綠界建議）',
  }),
  ADMIN_UIDS: defineString('ADMIN_UIDS', { default: '-', description: '額外的後台帳號 UID，以逗號分隔' }),
};

const booleans = {
  INVOICE_ENABLED: defineBoolean('INVOICE_ENABLED', { default: false, description: '付款成功後是否自動開立綠界 B2C 電子發票' }),
};

module.exports = { secrets, strings, booleans, allSecrets: Object.values(secrets) };

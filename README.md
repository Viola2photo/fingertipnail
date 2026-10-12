# 指尖造藝 fingertipnail

手作穿戴甲購物網站：夢幻風格前台、管理後台、綠界金流／物流／電子發票。
架設在 **Firebase**（Hosting 放網頁、Cloud Functions 跑 API、Firestore 存資料），之後申請的網址直接綁到 Firebase Hosting。

## 網站結構

| 網址 | 內容 |
|------|------|
| `/` | 前台商店（首頁、甲型／風格／價位篩選、商品頁、購物車、結帳、我的訂單）。目前只提供 7-11／全家超商取貨，付款可選線上付款或超商取貨付款；結帳頁不顯示發票選項 |
| `/admin.html` | 管理後台：總覽、商品與庫存、上架新款、訂單與出貨、財務與報表（只有店家帳號能登入） |
| `/tools/inventory.html` | 原本的建檔／盤點／照片識別系統（照片與影片管理） |
| `/api/*` | 結帳、綠界通知、後台操作（Cloud Functions） |

```
public/            網頁（前台、後台、建檔系統、圖片）
  js/config.js     前台文字設定：公告、聯絡信箱、尺寸對照、甲型分組、風格關鍵字
functions/         伺服器程式
  src/params.js    所有「部署時才填」的設定與金鑰清單
  src/lib/         綠界（CheckMacValue、AES）、金額計算、發票、訂單
  src/handlers/    各個 API
  test/            自動測試（含綠界官方測試向量）
firestore.rules    資料庫權限：商品公開可讀，只有店家能改；訂單只有店家與下單本人看得到
storage.rules      照片權限：公開可讀，只有店家能上傳
```

## 上架方式

後台「上架新款」提供三種方式：

1. **單款上架**：放照片、填品名與數量；貨號自動編號，甲型與售價沿用上一款，重量 0.2 kg、包裹 9×9×2 cm、規格 XS–L 自動帶入。
2. **批次上架**：拖入照片資料夾，檔名開頭是貨號（`NAIL_0281_1.jpg`）就自動分組。
3. **匯入商品表**：直接匯入現在用的 Excel／CSV（每個尺寸一列）。

上架前會檢查缺品名、貨號格式或重複、同名款、沒有照片、各尺寸都是 0。

## 第一次部署

需要：Node.js 22、Firebase CLI（`npm install -g firebase-tools`）、Firebase 專案升級為 **Blaze（用量計費）**方案（Cloud Functions、Secret Manager、排程都需要；小型商店通常在免費額度內，Secret Manager 每組金鑰每月約 US$0.06）。

```bash
firebase login
cd functions && npm install && npm test && cd ..
firebase deploy
```

第一次 `firebase deploy` 時 CLI 會逐一詢問設定值。**還沒拿到的值一律輸入 `-`**，網站會先以綠界測試環境運作，之後再補。

## 填入金鑰與設定

金鑰存放在 Google **Secret Manager**，不會出現在程式碼、GitHub 或網頁上。

| 名稱 | 種類 | 說明 |
|------|------|------|
| `ECPAY_ENV` | 參數 | `stage`（測試，預設）或 `production`（正式收款） |
| `ECPAY_MERCHANT_ID` | 參數 | 金流特店編號 |
| `ECPAY_HASH_KEY`、`ECPAY_HASH_IV` | 金鑰 | 金流 HashKey／HashIV |
| `ECPAY_LOGISTICS_MERCHANT_ID` | 參數 | 物流特店編號（`-` 則沿用金流的） |
| `ECPAY_LOGISTICS_HASH_KEY`、`ECPAY_LOGISTICS_HASH_IV` | 金鑰 | 物流 HashKey／HashIV（與金流不同） |
| `INVOICE_ENABLED` | 參數 | `true` 付款後自動開立電子發票 |
| `ECPAY_INVOICE_MERCHANT_ID` | 參數 | 電子發票特店編號 |
| `ECPAY_INVOICE_HASH_KEY`、`ECPAY_INVOICE_HASH_IV` | 金鑰 | 電子發票 HashKey／HashIV（與金流、物流都不同） |
| `SENDER_NAME`、`SENDER_CELLPHONE` | 參數 | 超商物流寄件人（建議改在後台「訂單與出貨」→「出貨設定」填寫，不用重新部署；後台有填時以後台為準） |
| `SITE_URL` | 參數 | 申請網址後填 `https://你的網域` |
| `CALLBACK_BASE_URL` | 參數 | 一般維持 `-`（見下方「綠界 SKILL 注意事項」） |
| `ADMIN_UIDS` | 參數 | 額外的後台帳號 UID |

**之後要填或修改金鑰：**

```bash
firebase functions:secrets:set ECPAY_HASH_KEY      # 依提示貼上，不會顯示在畫面上
firebase functions:secrets:set ECPAY_HASH_IV
firebase deploy --only functions                   # 重新部署後生效
```

一般參數存在 `functions/.env.nailproject-40022`（已列入 .gitignore，不會上傳）：

```
ECPAY_ENV=production
ECPAY_MERCHANT_ID=你的特店編號
SENDER_NAME=寄件人
SENDER_CELLPHONE=09xxxxxxxx
```

填完後到後台總覽按「查看設定」，會列出哪些已填、哪些還缺（不會顯示金鑰內容）。

## 測試（綠界測試環境）

1. `ECPAY_ENV` 維持 `stage` 部署。
2. 前台下單 → 選 7-11 或全家門市 → 付款用測試信用卡 `4311-9522-2222-2222`（期限任意未過期、CVV `222`、3D 簡訊碼 `1234`）。
3. 後台「訂單與出貨」出現「待出貨」、庫存已扣除；開啟電子發票時約 10 分鐘內自動開立。
4. 按「建立綠界超商物流單」→「列印託運單」。

本機開發：`cd functions && npm run serve`（Firebase 模擬器）。綠界通知打不到本機，需要用 ngrok 等工具，或直接部署到 Firebase 測試。

## 綠界 SKILL 注意事項

依 [ECPay-API-Skill](https://github.com/ECPay/ECPay-API-Skill) 實作。以下是架構上與 SKILL 規範相關、已做的處理；之後若要改動這些地方，請先確認不會違反 SKILL：

1. **通知網址不可放在 CDN 後方**：Firebase Hosting 前面有 CDN，所以綠界伺服器呼叫的 ReturnURL、PaymentInfoURL、物流通知預設使用 Cloud Functions 直連網址（`https://asia-east1-專案.cloudfunctions.net/api/...`），顧客瀏覽器的導回頁才走網站網址。`CALLBACK_BASE_URL` 請勿改成 Hosting 網址或 Cloudflare 等 CDN 網址。
2. **ReturnURL 需 10 秒內回應 `1|OK`**：付款通知只做驗證與更新訂單；開立發票交給每 10 分鐘的排程。Cloud Functions 冷啟動偶爾需要數秒，若綠界逾時會自動重送，程式已做冪等處理不會重複扣庫存。想更穩定可在 `functions/index.js` 的 `api` 加上 `minInstances: 1`（會有少量常駐費用）。
3. **模擬付款不出貨**：綠界後台的「模擬付款」（SimulatePaid=1）只記錄，不改訂單、不扣庫存、不開發票。
4. **ATM／超商代碼逾期不會通知**：排程會主動向綠界查詢，逾期未付自動取消；漏收的付款會補登。
5. **金鑰不可放在前端或版本控制**：全部經由 Secret Manager。
6. **超商物流姓名規則**：寄件人與收件人姓名需為中文 2～5 字或英文 4～10 個字母（不可有數字、符號），結帳時就會檢查；英文姓名的空白會先拿掉再送綠界。
7. **超商取貨付款**：不經過綠界付款頁，下單即扣庫存、狀態為「待出貨」；建立物流單時帶 `IsCollection=Y` 與代收金額（上限 20,000 元），電子地圖也一律以代收模式開啟。物流通知「買家已到店取貨」（7-11 `2067`、全家／萊爾富／OK `3022`）時訂單自動完成並記為已收款，之後才開發票、計入營收；未取退回會標記到「需處理」。**正式環境需先在綠界物流合約開通代收貨款服務。**
8. **規格版本**：開發時無法連到綠界開發者網站，參數依 SKILL 內附的 2026-03／04 規格快照。**正式上線前請到 developers.ecpay.com.tw 核對**付款（AioCheckOut）、物流（Express/Create）、發票（B2CInvoice/Issue）的最新欄位。

**目前未實作（需要時再加）**：公司統編發票、發票作廢／折讓（請在綠界後台操作）、宅配（前台已關閉，只開放超商取貨）、取貨付款未取退回的自動退庫存（請在「需處理」分頁手動取消並退回庫存）、結帳頁的發票載具／捐贈選項（已隱藏；開啟電子發票時一律開雲端發票）、信用卡退刷 API（請在綠界後台操作）。

## 上線檢查

- [ ] 綠界後台更換過 HashKey／HashIV（舊倉庫曾公開過）
- [ ] 填入正式金流、物流、發票帳號，`ECPAY_ENV=production`
- [ ] 後台「查看設定」沒有紅色 ✕
- [ ] 實際刷一筆小額，確認訂單、庫存、手續費、發票都正確，再到綠界後台退刷
- [ ] 綁定自己的網址：Firebase Console → Hosting → 新增自訂網域；完成後設定 `SITE_URL`，並在 Authentication → 設定 → 授權網域加入新網址
- [ ] Google Cloud Console 限制 Firebase 網頁金鑰只允許你的網域使用

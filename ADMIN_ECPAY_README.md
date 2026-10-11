# 指尖造藝：管理後台與綠界串接說明

## 頁面

| 網址 | 用途 |
|------|------|
| `/shop.html` | 商店（顧客購物、超商選店、綠界付款、我的訂單） |
| `/admin.html` | **管理後台**：總覽、商品與庫存、上架新款、訂單與出貨、財務與報表 |
| `/index.html` | 原本的建檔／盤點／識別系統（照片與影片管理仍在這裡） |

後台只有店家 Google 帳號（UID `MvkJo5e1kEcBS0fGGMr4RKdQjYg1`）能登入；要再加帳號，在 Vercel 設定 `ADMIN_UIDS`，並同步修改 `firestore.rules`、`storage.rules`、`admin.html` 的 `adminUserId` 檢查。

## 上架新款的三種方式

1. **單款上架**：放照片、填品名與各尺寸數量。貨號自動編號，甲型、售價預設沿用上一款，重量 0.2 kg、包裹 9×9×2 cm、規格 XS–L 自動帶入。
2. **批次上架**：把照片資料夾拖進來，檔名開頭是貨號（`NAIL_0281_1.jpg`、`NAIL_0281_2.jpg`…）就會自動分組；已存在的貨號只加照片。
3. **匯入商品表**：直接匯入你現在用的 Excel／CSV（每個尺寸一列）。同貨號合併成一款，品名前後空白自動去除；`9.0` 這類非 `NAIL_` 貨號會先用品名找既有款式，找不到才給新貨號。

上架前會檢查：缺品名、貨號格式或重複、售價、甲型、同名款、沒有照片、各尺寸都是 0。有錯誤的列不能上架。

## 庫存與進出貨

- 每次**進貨、盤點調整、退貨、售出、匯入**都會寫一筆 `stockMovements` 紀錄（時間、尺寸、異動前後、成本、操作者）。
- 顧客在綠界**付款成功**後才扣庫存（不是下單就扣），同一筆通知重送不會重複扣。
- 進貨時填「每盒成本」，財務頁才能算毛利。

## 綠界串接

依 [ECPay-API-Skill](https://github.com/ECPay/ECPay-API-Skill) 的規格實作（全方位金流 AIO + 國內物流 C2C）。官方規格網站在開發時無法連線，參數以 Skill 內附的 2026-03 規格快照為準，**上線前請到綠界開發者網站核對一次**。

| 端點 | 用途 |
|------|------|
| `POST /api/ecpay` | 結帳：伺服器依資料庫價格與庫存重新計算金額、建立訂單，再導向綠界付款頁 |
| `POST /api/ecpay_webhook` | 付款結果通知（ReturnURL）：驗證 CheckMacValue、扣庫存、記錄手續費 |
| `POST /api/ecpay_payment_info` | ATM／超商代碼取號通知（PaymentInfoURL） |
| `POST /api/ecpay_result` | 付款後導回商店頁（OrderResultURL） |
| `GET /api/ecpay_map?type=UNIMARTC2C` | 超商電子地圖（7-11／全家／萊爾富／OK） |
| `POST /api/ecpay_map_reply` | 選店結果回傳 |
| `POST /api/logistics_notify` | 物流狀態通知 |
| `POST /api/admin/logistics` | 後台：建立物流單、列印託運單、查詢物流（需店家登入） |
| `POST /api/admin/order` | 後台：出貨、完成、取消（可退回庫存）、查詢綠界交易（需店家登入） |

## 環境變數（Vercel → Settings → Environment Variables）

| 名稱 | 說明 |
|------|------|
| `ECPAY_ENV` | 設為 `production` 才會使用正式帳號；**未設定時一律使用綠界公開測試帳號** |
| `ECPAY_MERCHANT_ID` / `ECPAY_HASH_KEY` / `ECPAY_HASH_IV` | 金流正式帳號（在綠界廠商後台的介接資訊頁面取得） |
| `ECPAY_LOGISTICS_MERCHANT_ID` / `ECPAY_LOGISTICS_HASH_KEY` / `ECPAY_LOGISTICS_HASH_IV` | 物流的 HashKey/HashIV（與金流不同） |
| `SENDER_NAME` / `SENDER_CELLPHONE` | 物流寄件人姓名與手機（建立超商物流單用） |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | Firebase 服務帳號（原本 webhook 已在使用） |
| `SITE_URL` | 選填，網站正式網址，例如 `https://你的網域`（callback 網址用） |
| `ADMIN_UIDS` | 選填，額外的後台帳號 UID，以逗號分隔 |

> ⚠️ HashKey / HashIV 只能放在環境變數，不可寫進程式碼或 GitHub。

## 測試步驟（測試環境）

1. 不設定 `ECPAY_ENV`，部署到 Vercel。
2. 在商店下單，選 7-11 或全家門市，付款用測試信用卡 `4311-9522-2222-2222`（期限任意未過期、CVV `222`、3D 簡訊碼 `1234`）。
3. 後台「訂單與出貨」應出現「待出貨」，庫存已扣除。
4. 按「建立綠界超商物流單」→「列印託運單」。
5. 也可測 ATM：選 ATM 付款後訂單會變「待繳費」並顯示虛擬帳號。

## 上線前檢查

- [ ] 設定 `ECPAY_ENV=production` 與正式金流、物流帳號
- [ ] 部署權限規則：`firebase deploy --only firestore:rules,storage`
- [ ] 正式網址為 HTTPS、port 443，且 `/api/*` 沒有被 CDN 擋住
- [ ] 實際刷一筆小額，確認後台狀態、庫存、手續費都正確，再到綠界後台退刷
- [ ] 電子發票：綠界 B2C 電子發票尚未串接，若需開立發票請另外申請並告知開發者

## 測試

```bash
npm install
npm test
```

測試涵蓋：綠界官方 CheckMacValue 測試向量、金額計算（任 4 件 1000、免運、優惠碼）、結帳不採用前端金額、偽造通知被拒、付款成功扣庫存、重送通知不重複扣、金額不符不扣庫存、後台權限、取消訂單退回庫存。

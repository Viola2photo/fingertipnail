# 指尖造藝經營紀錄（record）

這個資料夾記錄「店主 Viola × AI 助手 Claude」一起把穿戴甲網站 tiptipart.com 經營成能賺錢的過程。寫法以日後可以公開發表（部落格、Threads 長文、Medium）為目標：每篇都寫清楚做了什麼、為什麼、花了多少、結果數字。

## 檔案
- `日誌/`：每天一篇，檔名 `YYYY-MM-DD_第N天_主題.md`
- `營收計畫_14天.md`：目標、行程、誠實的數字估計
- `文案庫.md`：可直接貼的 LINE／Threads／IG／社團／蝦皮文案
- `數字紀錄.csv`：每天的訪客、訂單、營業額、花費（每天填一行）

## 公開前請注意
- 不要公開：客人姓名電話地址、訂單編號、綠界金鑰、後台截圖裡的個資、帳單帳戶號碼。
- 金額可以公開到「營業額／訂單數／廣告花費」層級，成本和利潤自己決定要不要公開。

## 技術背景（給想照做的人）
- 網站：Firebase Hosting＋Cloud Functions＋Firestore，前台 Preact 無 build，程式在 GitHub `Viola2photo/fingertipnail`。
- 金流物流：綠界（信用卡、超商店到店、取貨付款）。
- 網域：Cloudflare Registrar 買的 tiptipart.com。
- 每次修改都開 Pull Request，合併到 main 後自動部署網站。

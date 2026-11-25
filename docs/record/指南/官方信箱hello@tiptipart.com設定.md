# 官方信箱 hello@tiptipart.com（全部免費）

## 做好之後會怎樣
- **收信**：客人寄到 hello@tiptipart.com 的信，會自動出現在你原本的 Gmail 收件匣（你不用多開一個信箱）。
- **回信**：在 Gmail 按「回覆」，寄件人會自動是 hello@tiptipart.com，客人看到的是官方信箱，不會看到你的私人 Gmail。
- 手機 Gmail App 也一樣可以收、可以用官方信箱回。

## 第 1 步：收信（Cloudflare Email Routing，約 10 分鐘）
1. 登入 Cloudflare → 點 **tiptipart.com** → 左邊「Email」→「Email Routing」
2. 按「Get started／開始使用」
3. 自訂地址填 `hello`，目的地填你的 Gmail → 按建立
4. Gmail 會收到一封 Cloudflare 驗證信，點裡面的確認連結
5. 回 Cloudflare，它會說要新增幾筆 DNS 記錄（MX、TXT）→ 按「Add records and enable／自動新增」
   - 這幾筆是信件用的，不會影響網站（網站用的 A 記錄不要動）
6. 測試：用別的信箱寄一封信到 hello@tiptipart.com，幾分鐘內 Gmail 會收到

## 第 2 步：回信用官方信箱（Gmail「以這個地址寄送郵件」，約 10 分鐘）
1. Google 帳戶要先開「兩步驟驗證」（你之前應該已經開了）
2. 到 https://myaccount.google.com/apppasswords 建立一組「應用程式密碼」，名稱填 `tiptipart`，會得到 16 個字母，**先複製，不要給任何人**
3. 電腦開 Gmail → 右上齒輪 →「查看所有設定」→「帳戶和匯入」→「選擇寄件地址」→「新增另一個電子郵件地址」
4. 名稱填 `指尖造藝`，地址填 `hello@tiptipart.com`，**取消勾選**「視為別名」→ 下一步
5. SMTP 伺服器：`smtp.gmail.com`，通訊埠 `587`，使用者名稱：你的 Gmail 地址，密碼：剛剛那 16 個字母，選 TLS → 新增帳戶
6. Gmail 會寄一封確認信到 hello@tiptipart.com（會轉到你自己的 Gmail），點確認
7. 同一頁「選擇寄件地址」下面，選「**從郵件寄送的地址回覆**」（這樣客人寄到官方信箱的信，回覆時自動用官方信箱）

## 第 3 步：告訴我
做完說一聲「信箱好了」，我會開 PR 把網站上的聯絡信箱從私人 Gmail 換成 hello@tiptipart.com。

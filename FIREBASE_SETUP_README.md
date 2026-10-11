# Firebase Functions 設置指南

本項目已配置 Firebase Functions 用於安全調用 Google Vision API。

## 已創建的文件

- `functions/index.js` - Cloud Function 代碼
- `functions/package.json` - Functions 依賴項
- `firebase.json` - Firebase 配置
- `.firebaserc` - 項目配置
- `deploy_functions.bat` - 自動部署腳本

## 部署步驟

### 方法 1: 使用自動腳本 (推薦)

1. 雙擊 `deploy_functions.bat` 文件
2. 按照提示完成登入和部署

### 方法 2: 手動執行

1. 安裝 Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```

2. 登入 Firebase:
   ```bash
   firebase login
   ```

3. 安裝 Functions 依賴項:
   ```bash
   cd functions
   npm install
   cd ..
   ```

4. 部署 Functions:
   ```bash
   firebase deploy --only functions
   ```

## Google Cloud Vision API 設置

### 正確的角色設置

如果找不到「Cloud Vision API 使用者」角色，請按以下步驟操作：

1. 在服務帳號創建時，**先跳過角色設置**（點擊「完成」）
2. 在「憑證」頁面找到新創建的服務帳號
3. 點擊服務帳號名稱進入詳細頁面
4. 點擊「權限」標籤
5. 點擊「新增主體」
6. 在「新主體」欄位輸入服務帳號的完整 email
7. 在「角色」下拉選單中選擇：
   - **首選**：`Cloud Vision API User` (如果可用)
   - **替代**：`Editor` (有較多權限)
   - **最小權限**：`Cloud Vision Service Agent`

8. 點擊「儲存」

### 舊版控制台的角色名稱

在某些 Google Cloud 項目中，角色名稱可能顯示為：
- `roles/cloudvision.serviceAgent`
- `roles/cloudvision.user`

如果仍然找不到，請使用 `Editor` 角色作為臨時解決方案。

### 舊版設置步驟（備用）

1. 訪問 https://console.cloud.google.com/
2. 選擇您的項目 (nailproject-40022)
3. 啟用 Cloud Vision API
4. 創建服務帳號並下載 JSON 金鑰文件
5. 將金鑰文件放置在 `functions/` 文件夾中
6. 重新部署 Functions

## 測試

部署完成後，重新載入您的應用並測試圖像識別功能。

## 故障排除

- 如果部署失敗，檢查 Firebase 項目權限
- 查看 Functions 日誌: `firebase functions:log`
- 確保 Vision API 已啟用且有足夠配額
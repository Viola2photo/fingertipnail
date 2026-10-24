# 專案規則

## 資安審計（security-audit skill）

本專案已安裝 Cloudflare 的 `security-audit` skill（`.claude/skills/security-audit`，來源：https://github.com/cloudflare/security-audit-skill ）。

**每當製作或修改網站、前後端程式、API、登入/付款/上傳等功能、Firebase/Firestore/Storage 規則、部署設定，或使用者提到資安/漏洞時：**

1. 在回覆開頭主動提醒使用者「這件事涉及資安，建議使用 security-audit skill」。
2. 以 guidance 模式套用該 skill，並在完成時列出相關風險與已處理/待處理項目（輸入驗證、XSS/注入、驗證授權、安全規則、金鑰外洩、CORS/CSP、上傳限制、速率限制、相依套件、部署設定）。
3. 只有在使用者明確要求「完整審計／滲透測試／報告」時，才執行完整六階段流程並產出檔案。
4. 重大功能完成或上線前，詢問使用者是否要執行完整審計。

另有 `.claude/hooks/security-reminder.sh`（UserPromptSubmit hook）會在提示詞含網站/資安相關關鍵字時自動注入此提醒。

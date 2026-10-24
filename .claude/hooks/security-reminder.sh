#!/bin/bash
# UserPromptSubmit hook: remind to use the security-audit skill for web/security work.
input=$(cat)
prompt=$(printf '%s' "$input" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("prompt",""))' 2>/dev/null)
if printf '%s' "$prompt" | grep -qiE '網站|網頁|前端|後端|登入|註冊|會員|付款|金流|上傳|表單|API|資安|安全|漏洞|部署|上線|website|web ?app|landing|frontend|backend|login|auth|payment|upload|form|deploy|firebase|firestore|cloudflare|security|vulnerab|pentest|audit'; then
  cat <<'MSG'
【資安提醒】此任務涉及網站/Web 開發或安全。請先提醒使用者：本專案已安裝 security-audit skill（.claude/skills/security-audit），並主動套用。
開發時務必檢查：輸入驗證與 XSS/注入、驗證與授權（Firestore/Storage rules、IDOR）、機敏資料與金鑰外洩、CORS/CSP/安全標頭、上傳檔案限制、速率限制與濫用防護、相依套件與 CI 供應鏈、部署設定。
若使用者要求「完整審計/滲透測試」才跑完整六階段流程；一般開發僅用 guidance 模式並在回覆中列出相關風險。
MSG
fi
exit 0

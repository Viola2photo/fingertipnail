@echo off
echo 安裝 Firebase CLI...
call npm install -g firebase-tools

echo 登入 Firebase...
call firebase login

echo 進入 functions 文件夾並安裝依賴項...
cd functions
call npm install

echo 返回根目錄...
cd ..

echo 部署 Functions...
call firebase deploy --only functions

echo 完成！
pause
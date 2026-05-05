@echo off
chcp 65001 >nul 2>&1
title SubExtract - Video Subtitle Extractor
color 0A

echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║        SubExtract - Video Subtitle Extractor     ║
echo  ║              Đang khởi động...                   ║
echo  ╚══════════════════════════════════════════════════╝
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  [LỖI] Node.js chưa được cài đặt!
    echo  Tải tại: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Check Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    color 0E
    echo  [CẢNH BÁO] Python chưa được cài đặt!
    echo  Chức năng trích xuất subtitle sẽ không hoạt động.
    echo  Tải tại: https://python.org/
    echo.
)

:: Install npm dependencies if needed
if not exist "%~dp0node_modules" (
    echo  [*] Đang cài đặt dependencies lần đầu...
    echo.
    cd /d "%~dp0"
    npm install
    if %errorlevel% neq 0 (
        color 0C
        echo.
        echo  [LỖI] Cài đặt dependencies thất bại!
        pause
        exit /b 1
    )
    echo.
    echo  [OK] Dependencies đã cài xong!
    echo.
)

:: Start server and open browser
echo  [*] Đang khởi động server...
echo  [*] Trình duyệt sẽ tự mở sau 2 giây...
echo.

cd /d "%~dp0"
start "" http://localhost:3456
node server.js

:: If server stops
echo.
echo  Server đã dừng.
pause

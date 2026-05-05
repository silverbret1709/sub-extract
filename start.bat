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

:: ============ CHECK NODE.JS ============
where node >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  [LỖI] Node.js chưa được cài đặt!
    echo  Tải tại: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: ============ CHECK PYTHON ============
where python >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  [LỖI] Python chưa được cài đặt!
    echo  Tải tại: https://python.org/
    echo  Nhớ tick "Add Python to PATH" khi cài!
    echo.
    pause
    exit /b 1
)

:: ============ NPM INSTALL ============
if not exist "%~dp0node_modules" (
    echo  [*] Đang cài đặt Node.js dependencies lần đầu...
    echo.
    cd /d "%~dp0"
    npm install
    if %errorlevel% neq 0 (
        color 0C
        echo.
        echo  [LỖI] npm install thất bại!
        pause
        exit /b 1
    )
    echo.
    echo  [OK] Node.js dependencies đã cài xong!
    echo.
)

:: ============ AUTO INSTALL PYTHON PACKAGES ============
echo  [*] Đang kiểm tra Python packages...

:: Check yt-dlp
python -c "import yt_dlp" >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] yt-dlp chưa có, đang cài đặt...
    pip install yt-dlp
    if %errorlevel% equ 0 (
        echo  [OK] yt-dlp đã cài thành công!
    ) else (
        echo  [CẢNH BÁO] Cài yt-dlp thất bại. Tính năng tải video sẽ không hoạt động.
    )
) else (
    echo  [OK] yt-dlp
)

:: Check faster-whisper
python -c "import faster_whisper" >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] faster-whisper chưa có, đang cài đặt (có thể mất vài phút)...
    pip install faster-whisper
    if %errorlevel% equ 0 (
        echo  [OK] faster-whisper đã cài thành công!
    ) else (
        echo  [CẢNH BÁO] Cài faster-whisper thất bại. Thử: pip install openai-whisper
    )
) else (
    echo  [OK] faster-whisper
)

:: Check ffmpeg
where ffmpeg >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] ffmpeg chưa có, đang cài qua pip...
    pip install ffmpeg-python
    echo  [CẢNH BÁO] ffmpeg binary cần cài riêng. Tải tại: https://ffmpeg.org/download.html
) else (
    echo  [OK] ffmpeg
)

echo.

:: ============ START SERVER ============
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

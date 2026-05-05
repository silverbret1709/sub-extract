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

:: Add local bin to PATH (for portable ffmpeg)
set "PATH=%~dp0bin;%PATH%"
cd /d "%~dp0"

:: ============ CHECK NODE.JS ============
echo  [*] Kiểm tra Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  ╔══════════════════════════════════════════════════╗
    echo  ║  [LỖI] Node.js chưa được cài đặt!              ║
    echo  ║  Tải tại: https://nodejs.org/                   ║
    echo  ╚══════════════════════════════════════════════════╝
    echo.
    echo  Nhấn phím bất kỳ để thoát...
    pause >nul
    exit /b 1
)
echo  [OK] Node.js đã cài

:: ============ CHECK PYTHON ============
echo  [*] Kiểm tra Python...
where python >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  ╔══════════════════════════════════════════════════╗
    echo  ║  [LỖI] Python chưa được cài đặt!               ║
    echo  ║  Tải tại: https://python.org/                   ║
    echo  ║  Nhớ tick "Add Python to PATH" khi cài!         ║
    echo  ╚══════════════════════════════════════════════════╝
    echo.
    echo  Nhấn phím bất kỳ để thoát...
    pause >nul
    exit /b 1
)
echo  [OK] Python đã cài

:: ============ NPM INSTALL ============
if not exist "%~dp0node_modules" (
    echo.
    echo  [*] Lần đầu chạy - đang cài Node.js dependencies...
    echo  (Quá trình này chỉ chạy 1 lần, xin chờ...)
    echo.
    call npm install
    if errorlevel 1 (
        color 0C
        echo.
        echo  [LỖI] npm install thất bại!
        echo  Nhấn phím bất kỳ để thoát...
        pause >nul
        exit /b 1
    )
    echo.
    echo  [OK] Node.js dependencies đã cài xong!
)

:: ============ AUTO INSTALL PYTHON PACKAGES ============
echo.
echo  [*] Kiểm tra Python packages...

:: Check yt-dlp
python -c "import yt_dlp" >nul 2>&1
if errorlevel 1 (
    echo  [!] yt-dlp chưa có, đang cài...
    python -m pip install yt-dlp
    if errorlevel 1 (
        echo  [!] Cài yt-dlp thất bại - tính năng tải video sẽ không hoạt động
    ) else (
        echo  [OK] yt-dlp đã cài thành công!
    )
) else (
    echo  [OK] yt-dlp
)

:: Check faster-whisper
python -c "import faster_whisper" >nul 2>&1
if errorlevel 1 (
    echo  [!] faster-whisper chưa có, đang cài (có thể mất vài phút)...
    python -m pip install faster-whisper
    if errorlevel 1 (
        echo  [!] Cài faster-whisper thất bại
        echo      Thử chạy thủ công: python -m pip install faster-whisper
    ) else (
        echo  [OK] faster-whisper đã cài thành công!
    )
) else (
    echo  [OK] faster-whisper
)

:: ============ CHECK FFMPEG ============
where ffmpeg >nul 2>&1
if errorlevel 1 (
    if exist "%~dp0bin\ffmpeg.exe" (
        echo  [OK] ffmpeg (portable)
    ) else (
        echo  [!] ffmpeg chưa có, đang tải tự động...
        echo      (khoảng 80MB, xin chờ...)

        if not exist "%~dp0bin" mkdir "%~dp0bin"

        powershell -Command "& { $ProgressPreference='SilentlyContinue'; try { Invoke-WebRequest -Uri 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip' -OutFile '%~dp0bin\ffmpeg.zip' -UseBasicParsing } catch { Write-Host 'Download failed'; exit 1 } }"

        if exist "%~dp0bin\ffmpeg.zip" (
            echo  [*] Đang giải nén ffmpeg...
            powershell -Command "& { $ProgressPreference='SilentlyContinue'; Expand-Archive -Path '%~dp0bin\ffmpeg.zip' -DestinationPath '%~dp0bin\ffmpeg_temp' -Force }"

            for /r "%~dp0bin\ffmpeg_temp" %%f in (ffmpeg.exe ffprobe.exe) do (
                copy /y "%%f" "%~dp0bin\" >nul 2>&1
            )

            rd /s /q "%~dp0bin\ffmpeg_temp" >nul 2>&1
            del "%~dp0bin\ffmpeg.zip" >nul 2>&1

            if exist "%~dp0bin\ffmpeg.exe" (
                echo  [OK] ffmpeg đã tải và cài thành công!
            ) else (
                echo  [!] Giải nén ffmpeg thất bại
                echo      Tải thủ công: https://ffmpeg.org/download.html
            )
        ) else (
            echo  [!] Tải ffmpeg thất bại - kiểm tra mạng
            echo      Tải thủ công: https://ffmpeg.org/download.html
        )
    )
) else (
    echo  [OK] ffmpeg
)

:: ============ ALL CHECKS DONE ============
echo.
echo  ══════════════════════════════════════════════════
echo   Mọi thứ sẵn sàng! Đang khởi động server...
echo  ══════════════════════════════════════════════════
echo.
echo  [*] Trình duyệt sẽ tự mở sau 2 giây...
echo  [*] Nhấn Ctrl+C để dừng server
echo.

:: Open browser then start server
start "" http://localhost:3456
node server.js

:: If server stops or crashes
echo.
echo  ══════════════════════════════════════════════════
echo   Server đã dừng hoặc gặp lỗi.
echo  ══════════════════════════════════════════════════
echo.
echo  Nhấn phím bất kỳ để đóng...
pause >nul

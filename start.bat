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
echo  [*] Đang kiểm tra dependencies...

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

:: ============ CHECK & AUTO-DOWNLOAD FFMPEG ============
where ffmpeg >nul 2>&1
if %errorlevel% neq 0 (
    if exist "%~dp0bin\ffmpeg.exe" (
        echo  [OK] ffmpeg (portable)
    ) else (
        echo  [!] ffmpeg chưa có, đang tải tự động...
        echo      (khoảng 80MB, xin chờ...)
        echo.

        if not exist "%~dp0bin" mkdir "%~dp0bin"

        :: Download ffmpeg release zip using PowerShell
        powershell -Command "& { $ProgressPreference='SilentlyContinue'; try { Invoke-WebRequest -Uri 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip' -OutFile '%~dp0bin\ffmpeg.zip' -UseBasicParsing } catch { Write-Host 'Download failed'; exit 1 } }"

        if exist "%~dp0bin\ffmpeg.zip" (
            echo  [*] Đang giải nén ffmpeg...
            powershell -Command "& { $ProgressPreference='SilentlyContinue'; Expand-Archive -Path '%~dp0bin\ffmpeg.zip' -DestinationPath '%~dp0bin\ffmpeg_temp' -Force }"

            :: Move binaries to bin folder
            for /r "%~dp0bin\ffmpeg_temp" %%f in (ffmpeg.exe ffprobe.exe) do (
                copy /y "%%f" "%~dp0bin\" >nul 2>&1
            )

            :: Cleanup
            rd /s /q "%~dp0bin\ffmpeg_temp" >nul 2>&1
            del "%~dp0bin\ffmpeg.zip" >nul 2>&1

            if exist "%~dp0bin\ffmpeg.exe" (
                echo  [OK] ffmpeg đã tải và cài thành công!
            ) else (
                color 0E
                echo  [CẢNH BÁO] Giải nén ffmpeg thất bại.
                echo  Tải thủ công: https://ffmpeg.org/download.html
                echo  Đặt ffmpeg.exe và ffprobe.exe vào thư mục bin\
            )
        ) else (
            color 0E
            echo  [CẢNH BÁO] Tải ffmpeg thất bại. Kiểm tra kết nối mạng.
            echo  Tải thủ công: https://ffmpeg.org/download.html
            echo  Đặt ffmpeg.exe và ffprobe.exe vào thư mục bin\
        )
    )
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

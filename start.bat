@echo off
chcp 65001 >nul 2>&1
title SubExtract - Video Subtitle Extractor
color 0A
cd /d "%~dp0"
set "PATH=%~dp0bin;%PATH%"

echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║        SubExtract - Video Subtitle Extractor     ║
echo  ║              Dang khoi dong...                   ║
echo  ╚══════════════════════════════════════════════════╝
echo.

:: ============ CHECK NODE.JS ============
echo  [*] Kiem tra Node.js...
where node >nul 2>&1
if errorlevel 1 goto :NO_NODE
echo  [OK] Node.js
goto :CHECK_PYTHON

:NO_NODE
color 0C
echo  [LOI] Node.js chua duoc cai dat!
echo  Tai tai: https://nodejs.org/
goto :DONE_ERROR

:: ============ CHECK PYTHON ============
:CHECK_PYTHON
echo  [*] Kiem tra Python...
where python >nul 2>&1
if errorlevel 1 goto :NO_PYTHON
echo  [OK] Python
goto :CHECK_NPM

:NO_PYTHON
color 0C
echo  [LOI] Python chua duoc cai dat!
echo  Tai tai: https://python.org/
echo  Nho tick "Add Python to PATH" khi cai!
goto :DONE_ERROR

:: ============ NPM INSTALL ============
:CHECK_NPM
if exist "%~dp0node_modules" goto :CHECK_YTDLP
echo.
echo  [*] Lan dau chay - dang cai Node.js dependencies...
echo  (Chi chay 1 lan, xin cho...)
echo.
call npm install
if errorlevel 1 goto :NPM_FAIL
echo  [OK] Node.js dependencies da cai xong!
goto :CHECK_YTDLP

:NPM_FAIL
color 0C
echo  [LOI] npm install that bai!
goto :DONE_ERROR

:: ============ CHECK YT-DLP ============
:CHECK_YTDLP
echo  [*] Kiem tra yt-dlp...
python -c "import yt_dlp" >nul 2>&1
if errorlevel 1 goto :INSTALL_YTDLP
echo  [OK] yt-dlp
goto :CHECK_WHISPER

:INSTALL_YTDLP
echo  [!] yt-dlp chua co, dang cai...
python -m pip install yt-dlp
echo  [*] yt-dlp: xong
goto :CHECK_WHISPER

:: ============ CHECK FASTER-WHISPER ============
:CHECK_WHISPER
echo  [*] Kiem tra faster-whisper...
python -c "import faster_whisper" >nul 2>&1
if errorlevel 1 goto :INSTALL_WHISPER
echo  [OK] faster-whisper
goto :CHECK_FFMPEG

:INSTALL_WHISPER
echo  [!] faster-whisper chua co, dang cai (co the mat vai phut)...
python -m pip install faster-whisper
echo  [*] faster-whisper: xong
goto :CHECK_FFMPEG

:: ============ CHECK FFMPEG ============
:CHECK_FFMPEG
echo  [*] Kiem tra ffmpeg...
where ffmpeg >nul 2>&1
if errorlevel 1 goto :FFMPEG_NOT_IN_PATH
echo  [OK] ffmpeg
goto :START_SERVER

:FFMPEG_NOT_IN_PATH
if exist "%~dp0bin\ffmpeg.exe" (
    echo  [OK] ffmpeg (portable)
    goto :START_SERVER
)
echo  [!] ffmpeg chua co, dang tai tu dong...
echo      (khoang 80MB, xin cho...)
if not exist "%~dp0bin" mkdir "%~dp0bin"
powershell -Command "& { $ProgressPreference='SilentlyContinue'; try { Invoke-WebRequest -Uri 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip' -OutFile '%~dp0bin\ffmpeg.zip' -UseBasicParsing } catch { Write-Host 'Download failed'; exit 1 } }"
if not exist "%~dp0bin\ffmpeg.zip" goto :FFMPEG_FAIL
echo  [*] Dang giai nen ffmpeg...
powershell -Command "& { Expand-Archive -Path '%~dp0bin\ffmpeg.zip' -DestinationPath '%~dp0bin\ffmpeg_temp' -Force }"
for /r "%~dp0bin\ffmpeg_temp" %%f in (ffmpeg.exe ffprobe.exe) do (
    copy /y "%%f" "%~dp0bin\" >nul 2>&1
)
rd /s /q "%~dp0bin\ffmpeg_temp" >nul 2>&1
del "%~dp0bin\ffmpeg.zip" >nul 2>&1
if exist "%~dp0bin\ffmpeg.exe" (
    echo  [OK] ffmpeg da tai thanh cong!
) else (
    echo  [!] Giai nen ffmpeg that bai
)
goto :START_SERVER

:FFMPEG_FAIL
echo  [!] Tai ffmpeg that bai - kiem tra mang
echo      Tai thu cong: https://ffmpeg.org/download.html
goto :START_SERVER

:: ============ START SERVER ============
:START_SERVER
echo.
echo  ==================================================
echo   San sang! Dang khoi dong server...
echo  ==================================================
echo.
echo  [*] Trinh duyet se tu mo sau 2 giay...
echo  [*] Nhan Ctrl+C de dung server
echo.
start "" http://localhost:3456
node server.js
echo.
echo  ==================================================
echo   Server da dung.
echo  ==================================================
goto :DONE_PAUSE

:: ============ ERROR / END ============
:DONE_ERROR
echo.
echo  Cai dat that bai. Xem loi o tren.
:DONE_PAUSE
echo.
echo  Nhan phim bat ky de dong...
pause >nul

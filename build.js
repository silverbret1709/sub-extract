/**
 * Build script for SubExtract
 * Creates a distributable package with:
 * - SubExtract.exe (launcher)
 * - All app files (server, public, translate, etc.)
 * - update.bat for easy updates
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIST_DIR = path.join(__dirname, 'dist');
const APP_NAME = 'SubExtract';

// Files/folders to include in distribution
const INCLUDE = [
  'server.js',
  'translate.js',
  'transcribe.py',
  'package.json',
  'package-lock.json',
  'public',
  'bin',
];

// Files/folders to exclude
const EXCLUDE = [
  'node_modules',
  'dist',
  'downloads',
  'output',
  'uploads',
  '.git',
  'build.js',
];

function clean() {
  console.log('🧹 Cleaning dist...');
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

function copyFiles() {
  console.log('📁 Copying app files...');
  
  for (const item of INCLUDE) {
    const src = path.join(__dirname, item);
    const dest = path.join(DIST_DIR, item);
    
    if (!fs.existsSync(src)) {
      console.log(`  ⚠️ Skipping ${item} (not found)`);
      continue;
    }
    
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      copyDirSync(src, dest);
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
    console.log(`  ✅ ${item}`);
  }
  
  // Create empty required dirs
  ['downloads', 'output', 'uploads'].forEach(dir => {
    fs.mkdirSync(path.join(DIST_DIR, dir), { recursive: true });
  });
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function installDeps() {
  console.log('📦 Installing production dependencies...');
  execSync('npm install --production', {
    cwd: DIST_DIR,
    stdio: 'inherit',
  });
}

function createLauncher() {
  console.log('🚀 Creating launcher...');
  
  // Create a simple launcher script that pkg will compile
  const launcherCode = `
const { spawn } = require('child_process');
const path = require('path');
const { exec } = require('child_process');

// Get the directory where the exe is located
const appDir = path.dirname(process.execPath);
const serverPath = path.join(appDir, 'server.js');

console.log('');
console.log('  ╔══════════════════════════════════════╗');
console.log('  ║       🎬 SubExtract v1.0.0           ║');
console.log('  ║   Trích xuất & dịch subtitle video   ║');
console.log('  ╚══════════════════════════════════════╝');
console.log('');
console.log('  Starting server...');

const server = spawn(process.execPath.includes('SubExtract') ? 'node' : process.argv[0], [serverPath], {
  cwd: appDir,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' }
});

// Open browser after 2 seconds
setTimeout(() => {
  console.log('  🌐 Opening browser at http://localhost:3456');
  exec('start http://localhost:3456');
}, 2000);

server.on('close', (code) => {
  console.log('Server stopped with code', code);
  process.exit(code);
});

process.on('SIGINT', () => {
  server.kill();
  process.exit(0);
});
`;

  fs.writeFileSync(path.join(DIST_DIR, 'launcher.js'), launcherCode);
}

function createBatchLauncher() {
  console.log('📄 Creating batch launcher...');
  
  const batContent = `@echo off
title SubExtract - Video Subtitle Extractor
echo.
echo   ========================================
echo   ^|       SubExtract v1.0.0              ^|
echo   ^|   Trich xuat ^& dich subtitle video  ^|
echo   ========================================
echo.

:: Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   [ERROR] Node.js chua duoc cai dat!
    echo   Tai tai: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Check if Python is installed  
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   [WARNING] Python chua duoc cai dat!
    echo   Tinh nang trich xuat subtitle se khong hoat dong.
    echo   Tai tai: https://python.org/
    echo.
)

echo   Starting server...
echo   Mo trinh duyet tai: http://localhost:3456
echo   Nhan Ctrl+C de dung server.
echo.

:: Open browser after delay
start /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3456"

:: Start server
cd /d "%~dp0"
node server.js

pause
`;

  fs.writeFileSync(path.join(DIST_DIR, `${APP_NAME}.bat`), batContent);
  console.log(`  ✅ ${APP_NAME}.bat`);
}

function createUpdateScript() {
  console.log('🔄 Creating update script...');
  
  const updateBat = `@echo off
title SubExtract - Update
echo.
echo   Updating SubExtract...
echo.

:: Check git
where git >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   [ERROR] Git chua duoc cai dat!
    echo   Tai tai: https://git-scm.com/
    pause
    exit /b 1
)

cd /d "%~dp0"

:: Check if .git exists
if exist ".git" (
    echo   Pulling latest changes...
    git pull origin main
) else (
    echo   [INFO] Day khong phai git repo.
    echo   De cap nhat, tai lai tu nguon va ghi de cac file.
)

echo.
echo   Installing dependencies...
call npm install --production

echo.
echo   ========================================
echo   Update hoan tat! Chay lai SubExtract.bat
echo   ========================================
pause
`;

  fs.writeFileSync(path.join(DIST_DIR, 'update.bat'), updateBat);
  console.log('  ✅ update.bat');
}

function createReadme() {
  const readme = `# SubExtract - Video Subtitle Extractor

## Cài đặt lần đầu

### Yêu cầu:
- **Node.js** v18+ → https://nodejs.org/
- **Python** 3.8+ → https://python.org/ (cho tính năng trích xuất subtitle)
- **yt-dlp** → \`pip install yt-dlp\` (cho tính năng tải video từ link)

### Chạy:
1. Click đúp **SubExtract.bat**
2. Trình duyệt sẽ tự mở tại http://localhost:3456

### Cập nhật:
- Nếu có Git: chạy **update.bat**
- Nếu không: tải lại folder mới, ghi đè (giữ nguyên settings.json)

### Lưu ý:
- File cài đặt API keys: \`settings.json\` (tự tạo khi lưu key đầu tiên)
- Folder tạm: \`downloads/\`, \`output/\`, \`uploads/\` (có thể xóa)
`;

  fs.writeFileSync(path.join(DIST_DIR, 'README.md'), readme);
  console.log('  ✅ README.md');
}

// ============ MAIN ============
async function main() {
  console.log('');
  console.log('🔨 Building SubExtract distribution...');
  console.log('');
  
  clean();
  copyFiles();
  installDeps();
  createBatchLauncher();
  createUpdateScript();
  createReadme();
  
  console.log('');
  console.log('════════════════════════════════════════');
  console.log(`✅ Build hoàn tất! Folder: dist/`);
  console.log(`📁 Gửi cho em folder "dist" là chạy được.`);
  console.log(`🚀 Chạy: dist/${APP_NAME}.bat`);
  console.log('════════════════════════════════════════');
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});

const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn, execSync, spawnSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { translateText, translateSRT, testApiKey, getApiKey, setApiKey, loadSettings, saveSettings, SUPPORTED_LANGUAGES, ENGINES } = require('./translate');

const app = express();
const PORT = 3456;

// Directories
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const OUTPUT_DIR = path.join(__dirname, 'output');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

[DOWNLOADS_DIR, OUTPUT_DIR, UPLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/output', express.static(OUTPUT_DIR));
app.use('/downloads', express.static(DOWNLOADS_DIR));

// Build environment for whisper subprocess with custom model cache dir
function getWhisperEnv() {
  const settings = loadSettings();
  const cacheDir = settings.MODEL_CACHE_DIR || '';
  const env = { ...process.env, PYTHONIOENCODING: 'utf-8' };
  if (cacheDir && fs.existsSync(cacheDir)) {
    env.HF_HOME = cacheDir;  // faster-whisper (huggingface)
    env.XDG_CACHE_HOME = cacheDir;  // openai-whisper fallback
  }
  return env;
}

// File upload config
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.mp3', '.wav', '.m4a', '.flac', '.ogg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('File không được hỗ trợ. Chấp nhận: mp4, mov, avi, mkv, webm, mp3, wav, m4a'));
  }
});

// Job tracking
const jobs = new Map();

// ============ UTILITY FUNCTIONS ============

function checkYtDlp() {
  try {
    execSync('yt-dlp --version', { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

function checkWhisper() {
  try {
    execSync('python -c "import faster_whisper; print(\'ok\')"', { stdio: 'pipe' });
    return 'faster-whisper';
  } catch {
    try {
      execSync('python -c "import whisper; print(\'ok\')"', { stdio: 'pipe' });
      return 'openai-whisper';
    } catch { return null; }
  }
}

// ============ API ROUTES ============

// Health check & dependency status
app.get('/api/status', (req, res) => {
  const ytdlp = checkYtDlp();
  const whisper = checkWhisper();
  res.json({
    ytdlp: ytdlp,
    whisper: whisper,
    ready: ytdlp && whisper
  });
});

// Download video from URL
app.post('/api/download', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL không được để trống' });

  const jobId = uuidv4();
  const job = {
    id: jobId,
    type: 'download',
    status: 'downloading',
    url,
    progress: '',
    videoPath: null,
    textPath: null,
    error: null,
    createdAt: Date.now()
  };
  jobs.set(jobId, job);

  res.json({ jobId, status: 'downloading' });

  // Start download in background
  downloadVideo(jobId, url);
});

// Upload local file
app.post('/api/upload', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Không có file nào được upload' });

  const jobId = uuidv4();
  const job = {
    id: jobId,
    type: 'upload',
    status: 'uploaded',
    url: null,
    progress: 'File đã upload thành công',
    videoPath: req.file.path,
    originalName: req.file.originalname,
    textPath: null,
    error: null,
    createdAt: Date.now()
  };
  jobs.set(jobId, job);

  res.json({ jobId, status: 'uploaded', filename: req.file.originalname });
});

// Start transcription
app.post('/api/transcribe/:jobId', (req, res) => {
  const { jobId } = req.params;
  const { model } = req.body; // tiny, base, small, medium, large-v3
  const job = jobs.get(jobId);

  if (!job) return res.status(404).json({ error: 'Job không tồn tại' });
  if (!job.videoPath) return res.status(400).json({ error: 'Chưa có file video/audio' });
  if (job.status === 'transcribing') return res.status(400).json({ error: 'Đang xử lý...' });

  job.status = 'transcribing';
  job.progress = 'Đang bắt đầu nhận diện giọng nói...';
  res.json({ status: 'transcribing' });

  // Start transcription in background
  transcribeVideo(jobId, model || 'base');
});

// Get job status
app.get('/api/job/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job không tồn tại' });

  const response = { ...job };
  if (job.textPath && fs.existsSync(job.textPath)) {
    response.text = fs.readFileSync(job.textPath, 'utf-8');
    response.downloadUrl = `/output/${path.basename(job.textPath)}`;
  }
  if (job.videoPath && fs.existsSync(job.videoPath)) {
    // Check if video is in downloads dir
    if (job.videoPath.startsWith(DOWNLOADS_DIR)) {
      response.videoUrl = `/downloads/${path.basename(job.videoPath)}`;
    }
  }
  res.json(response);
});

// List all jobs
app.get('/api/jobs', (req, res) => {
  const allJobs = [];
  for (const [id, job] of jobs) {
    const j = { ...job };
    if (j.textPath && fs.existsSync(j.textPath)) {
      j.downloadUrl = `/output/${path.basename(j.textPath)}`;
    }
    allJobs.push(j);
  }
  allJobs.sort((a, b) => b.createdAt - a.createdAt);
  res.json(allJobs);
});

// ============ BATCH TRANSLATE WITH FILE UPLOAD ============

// Upload config for batch translate (accepts any file type for subtitle/video)
const batchUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      // Preserve original filename with a unique prefix
      cb(null, `batch_${Date.now()}_${file.originalname}`);
    }
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB per file
});

// Batch translate with uploaded files (from browser file picker)
app.post('/api/batch-translate-upload', batchUpload.array('files', 500), async (req, res) => {
  const { fromLang, toLang, extractModel, filesMeta: filesMetaJson, outputMode, outputFolder, engine } = req.body;
  const uploadedFiles = req.files || [];

  if (uploadedFiles.length === 0) {
    return res.status(400).json({ error: 'Không có file nào được upload' });
  }
  if (!toLang) return res.status(400).json({ error: 'Chưa chọn ngôn ngữ đích' });

  let filesMeta = [];
  try { filesMeta = JSON.parse(filesMetaJson || '[]'); } catch {}

  // Build file list matching uploaded files with metadata
  // filesMeta preserves subfolder paths (e.g. "1 - Introduction/file.srt")
  // while multer's originalname may strip them
  const files = uploadedFiles.map((uf, i) => {
    const meta = filesMeta[i] || {};
    // Use meta.name which has subfolder prefix, fallback to multer originalname
    const displayName = meta.name || uf.originalname;
    const ext = path.extname(uf.originalname).toLowerCase();
    const subtitleExts = ['.txt', '.srt', '.vtt', '.sub', '.ass', '.ssa'];
    const isSubtitle = subtitleExts.includes(ext);

    return {
      name: displayName,  // e.g. "1 - Introduction/1. Background.en_US.srt"
      path: uf.path,
      type: isSubtitle ? 'subtitle' : (meta.type || 'video'),
      hasSubtitle: isSubtitle,
      subtitlePath: isSubtitle ? uf.path : null,
      size: uf.size,
    };
  });

  const batchId = uuidv4();
  const batchJob = {
    id: batchId,
    type: 'batch-translate',
    status: 'processing',
    totalFiles: files.length,
    completedFiles: 0,
    failedFiles: 0,
    currentFile: '',
    progress: 'Đang bắt đầu...',
    results: [],
    error: null,
    createdAt: Date.now(),
  };
  jobs.set(batchId, batchJob);

  res.json({ batchId, status: 'processing' });

  // Process files in background
  processBatchTranslate(batchId, files, fromLang || 'auto', toLang, extractModel || 'base', outputMode || 'same', outputFolder || '', engine || 'google');
});


// ============ TRANSLATION API ============

// Get supported languages
app.get('/api/languages', (req, res) => {
  res.json(SUPPORTED_LANGUAGES);
});

// Get available engines info
app.get('/api/engines', (req, res) => {
  // Return engines with key status (configured or not)
  const result = {};
  for (const [id, info] of Object.entries(ENGINES)) {
    result[id] = {
      ...info,
      configured: !info.requiresKey || !!getApiKey(id),
    };
  }
  res.json(result);
});

// Get/Set API settings
app.get('/api/settings', (req, res) => {
  const settings = loadSettings();
  // Mask API keys for security (show only last 4 chars)
  const masked = {};
  for (const [key, value] of Object.entries(settings)) {
    if (key.includes('API_KEY') && value) {
      masked[key] = '••••••••' + value.slice(-4);
    } else {
      masked[key] = value;
    }
  }
  res.json(masked);
});

app.post('/api/settings', (req, res) => {
  const { engine, apiKey, region, modelCacheDir } = req.body;
  if (engine && apiKey !== undefined) {
    setApiKey(engine, apiKey);
  }
  const settings = loadSettings();
  if (region) {
    settings.MICROSOFT_REGION = region;
  }
  if (modelCacheDir !== undefined) {
    settings.MODEL_CACHE_DIR = modelCacheDir;
  }
  saveSettings(settings);
  res.json({ success: true });
});

// Test an API key
app.post('/api/test-key', async (req, res) => {
  const { engine, apiKey } = req.body;
  if (!engine || !apiKey) {
    return res.status(400).json({ error: 'Thiếu engine hoặc API key' });
  }
  const result = await testApiKey(engine, apiKey);
  res.json(result);
});

// Translate subtitle from a completed job
app.post('/api/translate/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const { fromLang, toLang } = req.body;
  const job = jobs.get(jobId);

  if (!job) return res.status(404).json({ error: 'Job không tồn tại' });
  if (!job.textPath || !fs.existsSync(job.textPath)) {
    return res.status(400).json({ error: 'Chưa có file subtitle để dịch' });
  }
  if (!toLang) return res.status(400).json({ error: 'Chưa chọn ngôn ngữ đích' });
  if (job.translateStatus === 'translating') {
    return res.status(400).json({ error: 'Đang dịch...' });
  }

  job.translateStatus = 'translating';
  job.translateProgress = 'Đang bắt đầu dịch...';
  job.translatedPath = null;

  res.json({ status: 'translating' });

  // Start translation in background
  translateJob(jobId, fromLang || 'auto', toLang);
});

// Scan a local folder for video/subtitle files
app.post('/api/scan-folder', (req, res) => {
  const { folderPath } = req.body;
  if (!folderPath) return res.status(400).json({ error: 'Chưa nhập đường dẫn thư mục' });

  if (!fs.existsSync(folderPath)) {
    return res.status(400).json({ error: 'Thư mục không tồn tại' });
  }

  const stat = fs.statSync(folderPath);
  if (!stat.isDirectory()) {
    return res.status(400).json({ error: 'Đường dẫn không phải thư mục' });
  }

  const videoExts = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.mp3', '.wav', '.m4a', '.flac', '.ogg'];
  const subtitleExts = ['.txt', '.srt', '.vtt', '.sub', '.ass', '.ssa'];
  const items = [];

  // Recursive scan function
  function scanDir(dirPath) {
    let entries;
    try { entries = fs.readdirSync(dirPath); } catch { return; }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      let fstat;
      try { fstat = fs.statSync(fullPath); } catch { continue; }

      if (fstat.isDirectory()) {
        scanDir(fullPath); // Recurse into subfolder
        continue;
      }

      if (!fstat.isFile()) continue;

      const ext = path.extname(entry).toLowerCase();
      // Display name = relative path from root folder
      const relPath = path.relative(folderPath, fullPath);

      if (videoExts.includes(ext)) {
        const baseName = path.basename(entry, ext);
        const fileDir = path.dirname(fullPath);
        const existingSub = subtitleExts
          .map(se => path.join(fileDir, baseName + se))
          .find(p => fs.existsSync(p));

        items.push({
          name: relPath,
          path: fullPath,
          type: 'video',
          hasSubtitle: !!existingSub,
          subtitlePath: existingSub || null,
          size: fstat.size,
        });
      } else if (subtitleExts.includes(ext)) {
        items.push({
          name: relPath,
          path: fullPath,
          type: 'subtitle',
          hasSubtitle: true,
          subtitlePath: fullPath,
          size: fstat.size,
        });
      }
    }
  }

  scanDir(folderPath);
  res.json({ folderPath, items, total: items.length });
});

// Batch translate files from a folder
app.post('/api/batch-translate', async (req, res) => {
  const { files, fromLang, toLang, extractModel, outputMode, outputFolder, engine } = req.body;
  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'Không có file nào được chọn' });
  }
  if (!toLang) return res.status(400).json({ error: 'Chưa chọn ngôn ngữ đích' });

  const batchId = uuidv4();
  const batchJob = {
    id: batchId,
    type: 'batch-translate',
    status: 'processing',
    totalFiles: files.length,
    completedFiles: 0,
    failedFiles: 0,
    currentFile: '',
    progress: 'Đang bắt đầu...',
    results: [],
    error: null,
    createdAt: Date.now(),
  };
  jobs.set(batchId, batchJob);

  res.json({ batchId, status: 'processing' });

  // Process files in background
  processBatchTranslate(batchId, files, fromLang || 'auto', toLang, extractModel || 'base', outputMode || 'same', outputFolder || '', engine || 'google');
});

// Get batch job status
app.get('/api/batch/:batchId', (req, res) => {
  const job = jobs.get(req.params.batchId);
  if (!job) return res.status(404).json({ error: 'Batch job không tồn tại' });
  res.json(job);
});

// ============ BACKGROUND WORKERS ============

/**
 * Detect if URL is from a platform that serves muxed streams (video+audio combined).
 * These platforms don't support split video/audio downloads, so we must use 'best' format.
 */
function isMuxedStreamPlatform(url) {
  const muxedPlatforms = [
    'tiktok.com', 'vm.tiktok.com',
    'facebook.com', 'fb.watch', 'fb.com',
    'instagram.com',
    'twitter.com', 'x.com',
    'threads.net',
  ];
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return muxedPlatforms.some(p => hostname === p || hostname.endsWith('.' + p));
  } catch {
    return false;
  }
}

function downloadVideo(jobId, url) {
  const job = jobs.get(jobId);
  const outputTemplate = path.join(DOWNLOADS_DIR, `${jobId}.%(ext)s`);

  // For platforms with muxed streams (TikTok, Facebook, etc.), use 'best' to keep audio
  // For YouTube and others, use split format for better quality
  const useMuxed = isMuxedStreamPlatform(url);
  const formatStr = useMuxed ? 'best[ext=mp4]/best' : 'bv*+ba/b/bv+ba/best';

  const args = [
    '--no-playlist',
    '-f', formatStr,
    '--merge-output-format', 'mp4',
    '-o', outputTemplate,
    '--no-check-certificates',
    url
  ];

  if (!useMuxed) {
    args.splice(5, 0, '--audio-multistreams'); // Only for split-stream platforms
  }

  console.log(`[${jobId}] Downloading: ${url} (format: ${formatStr})`);
  const proc = spawn('yt-dlp', args, { windowsHide: true });

  let output = '';
  proc.stdout.on('data', (data) => {
    const line = data.toString().trim();
    output += line + '\n';
    // Parse progress
    const match = line.match(/(\d+\.?\d*)%/);
    if (match) {
      job.progress = `Đang tải: ${match[1]}%`;
    } else if (line.includes('[Merger]') || line.includes('Merging')) {
      job.progress = 'Đang ghép video...';
    } else if (line.includes('[download]') && line.includes('Destination')) {
      job.progress = 'Đang tải video...';
    }
  });

  proc.stderr.on('data', (data) => {
    const line = data.toString().trim();
    output += line + '\n';
    console.log(`[${jobId}] stderr: ${line}`);
  });

  proc.on('close', async (code) => {
    if (code !== 0) {
      job.status = 'error';
      job.error = `Tải video thất bại (code ${code}). Kiểm tra lại URL.\n${output.slice(-500)}`;
      console.log(`[${jobId}] Download failed with code ${code}`);
      return;
    }

    // Find the downloaded file
    const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.startsWith(jobId) && !f.includes('_audio') && !f.includes('_ba') && !f.includes('_muxed') && !f.includes('_retry'));
    if (files.length === 0) {
      job.status = 'error';
      job.error = 'Không tìm thấy file sau khi tải';
      return;
    }

    job.videoPath = path.join(DOWNLOADS_DIR, files[0]);
    console.log(`[${jobId}] Downloaded: ${files[0]}`);

    // Verify audio stream exists; if not, attempt re-download with audio-only fallback
    if (!hasAudioStream(job.videoPath)) {
      console.log(`[${jobId}] No audio stream detected, attempting recovery...`);
      job.progress = 'Video thiếu audio, đang thử tải lại với audio...';

      const recovered = await tryRecoverAudio(jobId, url, job.videoPath);
      if (!recovered) {
        job.status = 'error';
        job.error = 'File video không có audio stream. Không thể trích xuất phụ đề từ video không có âm thanh.\nThử tải video từ nguồn khác hoặc upload file có âm thanh.';
        console.log(`[${jobId}] Audio recovery failed`);
        return;
      }
    }

    job.status = 'downloaded';
    job.progress = `Tải video thành công: ${path.basename(job.videoPath)}`;
  });
}

function hasAudioStream(filePath) {
  try {
    const result = spawnSync('ffprobe', [
      '-v', 'quiet', '-print_format', 'json', '-show_streams', '-select_streams', 'a', filePath
    ], { windowsHide: true, encoding: 'utf-8' });
    const data = JSON.parse(result.stdout);
    return data.streams && data.streams.length > 0;
  } catch {
    return true; // Assume yes if ffprobe fails, let whisper handle it
  }
}

function extractAudio(videoPath, audioPath) {
  const result = spawnSync('ffmpeg', [
    '-y', '-i', videoPath, '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1', audioPath
  ], { windowsHide: true, encoding: 'utf-8', timeout: 120000 });
  return result.status === 0;
}

/**
 * Try to recover audio for a video that was downloaded without an audio stream.
 * Strategy:
 *   1. Re-download with audio-only format and mux together
 *   2. Re-download with explicit format that includes audio
 */
function tryRecoverAudio(jobId, url, videoPath) {
  return new Promise((resolve) => {
    if (!url) {
      // Uploaded file, no URL to re-download from
      resolve(false);
      return;
    }

    const job = jobs.get(jobId);
    const audioOnlyPath = path.join(DOWNLOADS_DIR, `${jobId}_ba.m4a`);
    const muxedPath = path.join(DOWNLOADS_DIR, `${jobId}_muxed.mp4`);

    console.log(`[${jobId}] Recovery: downloading audio-only stream...`);
    job.progress = 'Đang tải audio riêng...';

    // Step 1: Download audio-only
    const dlProc = spawnSync('yt-dlp', [
      '--no-playlist',
      '-f', 'ba/ba*/worstaudio',
      '-o', audioOnlyPath,
      '--no-check-certificates',
      url
    ], { windowsHide: true, encoding: 'utf-8', timeout: 120000 });

    if (dlProc.status === 0 && fs.existsSync(audioOnlyPath)) {
      console.log(`[${jobId}] Recovery: audio downloaded, muxing...`);
      job.progress = 'Đang ghép audio vào video...';

      // Step 2: Mux video + audio
      const muxProc = spawnSync('ffmpeg', [
        '-y', '-i', videoPath, '-i', audioOnlyPath,
        '-c', 'copy', '-map', '0:v:0', '-map', '1:a:0',
        '-shortest', muxedPath
      ], { windowsHide: true, encoding: 'utf-8', timeout: 120000 });

      if (muxProc.status === 0 && fs.existsSync(muxedPath) && hasAudioStream(muxedPath)) {
        // Replace original with muxed version
        try { fs.unlinkSync(videoPath); } catch {}
        try { fs.unlinkSync(audioOnlyPath); } catch {}
        fs.renameSync(muxedPath, videoPath);
        console.log(`[${jobId}] Recovery: audio muxed successfully`);
        job.videoPath = videoPath;
        resolve(true);
        return;
      }

      // Mux failed, but we have audio - use it directly
      if (fs.existsSync(audioOnlyPath) && hasAudioStream(audioOnlyPath)) {
        console.log(`[${jobId}] Recovery: using audio-only file for transcription`);
        job.videoPath = audioOnlyPath;
        resolve(true);
        return;
      }
    }

    // Step 3: Try re-downloading with a combined format
    console.log(`[${jobId}] Recovery: trying full re-download with different format...`);
    job.progress = 'Đang thử tải lại video có audio...';

    const retryPath = path.join(DOWNLOADS_DIR, `${jobId}_retry.mp4`);
    const retryProc = spawnSync('yt-dlp', [
      '--no-playlist',
      '-f', 'best[ext=mp4]/best[acodec!=none]/best',
      '--merge-output-format', 'mp4',
      '-o', retryPath,
      '--no-check-certificates',
      url
    ], { windowsHide: true, encoding: 'utf-8', timeout: 180000 });

    if (retryProc.status === 0 && fs.existsSync(retryPath) && hasAudioStream(retryPath)) {
      try { fs.unlinkSync(videoPath); } catch {}
      fs.renameSync(retryPath, videoPath);
      console.log(`[${jobId}] Recovery: re-download with audio succeeded`);
      job.videoPath = videoPath;
      resolve(true);
      return;
    }

    // All recovery attempts failed
    // Clean up temp files
    for (const f of [audioOnlyPath, muxedPath, retryPath]) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
    resolve(false);
  });
}

function transcribeVideo(jobId, modelSize) {
  const job = jobs.get(jobId);
  const whisperType = checkWhisper();

  if (!whisperType) {
    job.status = 'error';
    job.error = 'Whisper chưa được cài đặt. Chạy: pip install faster-whisper';
    return;
  }

  // Check for audio stream
  if (!hasAudioStream(job.videoPath)) {
    // For uploaded files, try extracting audio anyway (ffprobe might be wrong)
    console.log(`[${jobId}] No audio stream detected by ffprobe, will try ffmpeg extraction anyway...`);
    job.progress = 'Audio stream không rõ ràng, đang thử trích xuất...';
  }

  // Extract audio to WAV for reliable processing
  const audioPath = path.join(DOWNLOADS_DIR, `${jobId}_audio.wav`);
  console.log(`[${jobId}] Extracting audio...`);
  job.progress = 'Đang trích xuất audio...';

  const audioOk = extractAudio(job.videoPath, audioPath);
  const inputForWhisper = audioOk && fs.existsSync(audioPath) ? audioPath : job.videoPath;

  if (audioOk) {
    console.log(`[${jobId}] Audio extracted to ${audioPath}`);
  } else {
    console.log(`[${jobId}] Audio extraction failed, using original file`);
  }

  const outputFile = path.join(OUTPUT_DIR, `${jobId}.txt`);
  const scriptPath = path.join(__dirname, 'transcribe.py');

  const args = [
    scriptPath,
    '--input', inputForWhisper,
    '--output', outputFile,
    '--model', modelSize,
    '--engine', whisperType
  ];

  console.log(`[${jobId}] Transcribing with ${whisperType}, model: ${modelSize}`);
  job.progress = `Đang tải model ${modelSize}... (lần đầu sẽ lâu hơn)`;

  const proc = spawn('python', args, {
    windowsHide: true,
    env: getWhisperEnv()
  });

  let stderrOutput = '';

  proc.stdout.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      console.log(`[${jobId}] whisper: ${trimmed}`);
      if (trimmed.startsWith('PROGRESS:')) {
        job.progress = trimmed.replace('PROGRESS:', '').trim();
      }
    }
  });

  proc.stderr.on('data', (data) => {
    const line = data.toString().trim();
    if (line) {
      stderrOutput += line + '\n';
      // Filter out noisy warnings
      if (!line.includes('FutureWarning') && !line.includes('UserWarning') && !line.includes('hf_xet')) {
        console.log(`[${jobId}] whisper stderr: ${line}`);
      }
    }
  });

  proc.on('error', (err) => {
    console.log(`[${jobId}] spawn error: ${err.message}`);
    job.status = 'error';
    job.error = `Không thể chạy Python: ${err.message}`;
  });

  proc.on('close', (code) => {
    if (code !== 0) {
      // Extract meaningful error from stderr
      const errorLines = stderrOutput.split('\n').filter(l =>
        l.includes('ERROR') || l.includes('Error') || l.includes('Traceback') || l.includes('Exception')
      );
      const errorDetail = errorLines.length > 0
        ? errorLines.join('\n')
        : stderrOutput.slice(-300);

      job.status = 'error';
      job.error = `Trích xuất thất bại (code ${code}).\n${errorDetail}`;
      console.log(`[${jobId}] Transcription failed (code ${code})`);
      return;
    }

    if (fs.existsSync(outputFile)) {
      job.textPath = outputFile;
      job.status = 'completed';
      job.progress = 'Hoàn thành!';
      console.log(`[${jobId}] Transcription complete: ${outputFile}`);
    } else {
      job.status = 'error';
      job.error = 'Không tạo được file output';
    }
  });
}

// ============ TRANSLATION WORKERS ============

async function translateJob(jobId, fromLang, toLang) {
  const job = jobs.get(jobId);
  try {
    const content = fs.readFileSync(job.textPath, 'utf-8');
    const isSRT = job.textPath.endsWith('.srt');

    const translateFn = isSRT ? translateSRT : translateText;
    const result = await translateFn(content, fromLang, toLang, (pct, msg) => {
      job.translateProgress = msg;
    });

    // Save translated file
    const ext = path.extname(job.textPath);
    let baseName = path.basename(job.textPath, ext);
    // Strip existing language codes (e.g. ".en_US", ".en", ".ja", ".zh-CN")
    baseName = baseName.replace(/\.(([a-z]{2}(_[A-Z]{2})?)|([a-z]{2}-[A-Z]{2}))$/, '');
    const translatedPath = path.join(OUTPUT_DIR, `${baseName}.${toLang}${ext}`);

    fs.writeFileSync(translatedPath, result.translatedText, 'utf-8');

    job.translatedPath = translatedPath;
    job.translateStatus = 'completed';
    job.translateProgress = 'Dịch hoàn thành!';
    job.detectedLang = result.detectedLang;
    console.log(`[${jobId}] Translation complete: ${translatedPath}`);

  } catch (err) {
    job.translateStatus = 'error';
    job.translateProgress = `Lỗi: ${err.message}`;
    console.error(`[${jobId}] Translation failed:`, err.message);
  }
}

async function processBatchTranslate(batchId, files, fromLang, toLang, extractModel, outputMode = 'same', outputFolder = '', engine = 'google') {
  const batchJob = jobs.get(batchId);

  // Determine output directory for custom mode
  let customOutputDir = null;
  if (outputMode === 'custom' && outputFolder) {
    try {
      if (!fs.existsSync(outputFolder)) fs.mkdirSync(outputFolder, { recursive: true });
      customOutputDir = outputFolder;
    } catch (e) {
      console.error(`[batch:${batchId}] Cannot create output dir: ${outputFolder}`, e.message);
    }
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    batchJob.currentFile = file.name;
    batchJob.progress = `Đang xử lý file ${i + 1}/${files.length}: ${file.name}`;

    try {
      let subtitleContent = '';
      let subtitlePath = file.subtitlePath;

      // If no subtitle exists, extract from video first
      if (!subtitlePath && file.type === 'video') {
        batchJob.progress = `Đang trích xuất subtitle từ: ${file.name}`;

        // Extract audio and transcribe
        const audioPath = path.join(DOWNLOADS_DIR, `batch_${batchId}_${i}_audio.wav`);
        const outputFile = path.join(OUTPUT_DIR, `batch_${batchId}_${i}.srt`);

        const audioOk = extractAudio(file.path, audioPath);
        const inputForWhisper = audioOk && fs.existsSync(audioPath) ? audioPath : file.path;

        // Run transcription synchronously for batch
        const whisperType = checkWhisper();
        if (!whisperType) throw new Error('Whisper chưa được cài đặt');

        const scriptPath = path.join(__dirname, 'transcribe.py');
        const result = spawnSync('python', [
          scriptPath,
          '--input', inputForWhisper,
          '--output', outputFile,
          '--model', extractModel,
          '--engine', whisperType,
          '--format', 'srt'  // Output SRT with timecodes for batch translate
        ], {
          windowsHide: true,
          encoding: 'utf-8',
          timeout: 600000, // 10 minutes per file
          env: getWhisperEnv()
        });

        // Clean up audio temp
        try { if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath); } catch {}

        if (result.status !== 0 || !fs.existsSync(outputFile)) {
          throw new Error(`Trích xuất thất bại: ${(result.stderr || '').slice(-200)}`);
        }

        subtitlePath = outputFile;
      }

      // Read subtitle content
      if (subtitlePath && fs.existsSync(subtitlePath)) {
        subtitleContent = fs.readFileSync(subtitlePath, 'utf-8');
      } else {
        throw new Error('Không tìm thấy file subtitle');
      }

      // Translate
      batchJob.progress = `Đang dịch: ${file.name}`;
      const subtExt = path.extname(subtitlePath).toLowerCase();
      const isSubFormat = ['.srt', '.vtt', '.ass', '.sub', '.ssa'].includes(subtExt)
        || subtitleContent.trimStart().startsWith('WEBVTT')
        || /^\d+\r?\n\d{2}:\d{2}/.test(subtitleContent.trimStart());
      const translateFnType = isSubFormat ? 'srt' : 'text';

      const translateFn = translateFnType === 'srt' ? translateSRT : translateText;
      const result = await translateFn(subtitleContent, fromLang, toLang, (pct, msg) => {
        batchJob.progress = `Dịch ${file.name}: ${msg}`;
      }, engine);

      // Determine output file name (preserve subfolder structure)
      const fileBaseName = path.basename(file.name); // Just the filename without subfolder
      let origBaseName = fileBaseName.replace(/\.[^.]+$/, ''); // Strip extension
      origBaseName = origBaseName.replace(/\.(([a-z]{2}(_[A-Z]{2})?)|([a-z]{2}-[A-Z]{2}))$/, '');
      const outExt = ['.srt', '.vtt', '.ass', '.sub', '.ssa'].includes(subtExt) ? subtExt : '.txt';
      const translatedBaseName = `${origBaseName}.${toLang}${outExt}`;

      // Keep subfolder prefix from original file name (e.g. "1 - Introduction/")
      const subfolderPrefix = file.name.includes('/') || file.name.includes('\\')
        ? path.dirname(file.name).replace(/\\/g, '/') + '/'
        : '';
      const translatedRelPath = subfolderPrefix + translatedBaseName;

      // Determine save directory
      let saveDir;
      if (customOutputDir) {
        // For custom output, recreate subfolder structure
        saveDir = subfolderPrefix
          ? path.join(customOutputDir, path.dirname(file.name))
          : customOutputDir;
      } else if (outputMode === 'same') {
        const origDir = path.dirname(file.path);
        saveDir = (origDir && origDir !== '.' && fs.existsSync(origDir)) ? origDir : OUTPUT_DIR;
      } else {
        saveDir = OUTPUT_DIR;
      }

      // Ensure save directory exists
      if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
      }

      const translatedPath = path.join(saveDir, translatedBaseName);
      fs.writeFileSync(translatedPath, result.translatedText, 'utf-8');

      // Also save a copy to output dir (flat) for download URL
      const outputCopy = path.join(OUTPUT_DIR, translatedBaseName);
      if (translatedPath !== outputCopy) {
        fs.writeFileSync(outputCopy, result.translatedText, 'utf-8');
      }

      batchJob.completedFiles++;
      batchJob.results.push({
        name: translatedBaseName,
        relativePath: translatedRelPath, // e.g. "1 - Introduction/file.vi.srt"
        status: 'success',
        savedPath: translatedPath,
        outputPath: translatedPath,
        downloadUrl: `/output/${translatedBaseName}`,
      });

      console.log(`[batch:${batchId}] Translated: ${file.name} -> ${translatedBaseName} (saved: ${translatedPath})`);

    } catch (err) {
      batchJob.failedFiles++;
      batchJob.results.push({
        name: file.name,
        status: 'error',
        error: err.message,
      });
      console.error(`[batch:${batchId}] Failed: ${file.name}:`, err.message);
    }
  }

  batchJob.status = batchJob.failedFiles === files.length ? 'error' : 'completed';
  batchJob.progress = `Hoàn thành! ${batchJob.completedFiles}/${files.length} file thành công`;
  if (batchJob.failedFiles > 0) {
    batchJob.progress += `, ${batchJob.failedFiles} file lỗi`;
  }
  batchJob.currentFile = '';
  console.log(`[batch:${batchId}] Batch complete: ${batchJob.completedFiles}/${files.length}`);
}

// ============ START SERVER ============

app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║   Video Subtitle Extractor                       ║`);
  console.log(`║   http://localhost:${PORT}                          ║`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);

  // Check dependencies
  const ytdlp = checkYtDlp();
  const whisper = checkWhisper();
  console.log(`  yt-dlp:   ${ytdlp ? '✅ Đã cài đặt' : '❌ Chưa cài - chạy: pip install yt-dlp'}`);
  console.log(`  whisper:  ${whisper ? `✅ ${whisper}` : '❌ Chưa cài - chạy: pip install faster-whisper'}`);
  console.log('');
});

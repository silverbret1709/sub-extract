/**
 * Video Subtitle Extractor - Frontend Application
 */

// ============ STATE ============
const state = {
  currentJobId: null,
  pollInterval: null,
  batchId: null,
  batchPollInterval: null,
  scannedFiles: [],
  deps: { ytdlp: false, whisper: null }
};

// ============ DOM ELEMENTS ============
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
  headerStatus: $('#headerStatus'),
  urlInput: $('#urlInput'),
  btnPaste: $('#btnPaste'),
  btnDownload: $('#btnDownload'),
  fileInput: $('#fileInput'),
  uploadZone: $('#uploadZone'),
  inputSection: $('#inputSection'),
  modelSection: $('#modelSection'),
  progressSection: $('#progressSection'),
  resultSection: $('#resultSection'),
  errorSection: $('#errorSection'),
  setupSection: $('#setupSection'),
  progressText: $('#progressText'),
  progressBar: $('#progressBar'),
  resultText: $('#resultText'),
  btnCopy: $('#btnCopy'),
  btnDownloadTxt: $('#btnDownloadTxt'),
  btnNewJob: $('#btnNewJob'),
  btnTranscribe: $('#btnTranscribe'),
  btnRetry: $('#btnRetry'),
  errorMessage: $('#errorMessage'),
  // Translate elements
  folderInput: $('#folderInput'),
  btnScanFolder: $('#btnScanFolder'),
  btnPickFolder: $('#btnPickFolder'),
  btnPickFiles: $('#btnPickFiles'),
  folderPicker: $('#folderPicker'),
  filePicker: $('#filePicker'),
  fromLang: $('#fromLang'),
  toLang: $('#toLang'),
  scanResults: $('#scanResults'),
  scanCount: $('#scanCount'),
  fileList: $('#fileList'),
  btnSelectAll: $('#btnSelectAll'),
  btnDeselectAll: $('#btnDeselectAll'),
  btnBatchTranslate: $('#btnBatchTranslate'),
  extractModelRow: $('#extractModelRow'),
  extractModel: $('#extractModel'),
  outputFolderRow: $('#outputFolderRow'),
  outputModeSame: $('#outputModeSame'),
  outputModeCustom: $('#outputModeCustom'),
  outputFolderInput: $('#outputFolderInput'),
  outputFolder: $('#outputFolder'),
  btnPickOutputFolder: $('#btnPickOutputFolder'),
  // Batch section
  batchSection: $('#batchSection'),
  batchProgress: $('#batchProgress'),
  batchProgressText: $('#batchProgressText'),
  batchProgressBar: $('#batchProgressBar'),
  batchSpinner: $('#batchSpinner'),
  batchResultsList: $('#batchResultsList'),
  batchFooter: $('#batchFooter'),
  btnNewBatch: $('#btnNewBatch'),
};

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', () => {
  checkDependencies();
  loadLanguages();
  loadEngines();
  setupEventListeners();
});

async function checkDependencies() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    state.deps = data;

    const statusEl = els.headerStatus;
    const dot = statusEl.querySelector('.status-dot');
    const text = statusEl.querySelector('span:last-child');

    if (data.ready) {
      dot.classList.add('ready');
      text.textContent = 'Sẵn sàng';
      els.setupSection.style.display = 'none';
    } else {
      dot.classList.add('error');
      text.textContent = 'Thiếu thư viện';
      showSetupGuide(data);
    }

    updateSetupBadge('badgeYtdlp', 'setupYtdlp', data.ytdlp);
    updateSetupBadge('badgeWhisper', 'setupWhisper', data.whisper);

    // Update whisper engine info in Settings tab
    const whisperInfo = $('#whisperEngineInfo');
    if (whisperInfo) {
      if (data.whisper) {
        whisperInfo.textContent = `✅ ${data.whisper}`;
        whisperInfo.style.color = 'var(--success)';
      } else {
        whisperInfo.textContent = '❌ Chưa cài đặt';
        whisperInfo.style.color = 'var(--error)';
      }
    }
  } catch (err) {
    console.error('Status check failed:', err);
  }
}

async function loadLanguages() {
  try {
    const res = await fetch('/api/languages');
    const langs = await res.json();

    // Populate selects
    const fromSelect = els.fromLang;
    const toSelect = els.toLang;
    fromSelect.innerHTML = '';
    toSelect.innerHTML = '';

    for (const [code, name] of Object.entries(langs)) {
      fromSelect.innerHTML += `<option value="${code}"${code === 'auto' ? ' selected' : ''}>${name}</option>`;
      if (code !== 'auto') {
        toSelect.innerHTML += `<option value="${code}"${code === 'en' ? ' selected' : ''}>${name}</option>`;
      }
    }
  } catch (err) {
    console.error('Failed to load languages:', err);
  }
}

function updateSetupBadge(badgeId, stepId, installed) {
  const badge = $(`#${badgeId}`);
  const step = $(`#${stepId}`);
  if (installed) {
    badge.textContent = typeof installed === 'string' ? installed : 'Đã cài';
    badge.classList.add('installed');
    step.classList.add('done');
    step.querySelector('.step-icon').classList.remove('pending');
    step.querySelector('.step-icon').classList.add('done');
    step.querySelector('.step-icon').textContent = '✓';
  }
}

function showSetupGuide(data) {
  els.setupSection.style.display = 'block';
}

// ============ EVENT LISTENERS ============
function setupEventListeners() {
  // Tab switching
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      $$('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      $$('.tab-content').forEach(c => c.classList.remove('active'));

      const cardHeader = $('#inputSection .card-header');
      const settingsSection = $('#settingsSection');

      if (tabName === 'settings') {
        // Hide card header content, show settings card
        if (cardHeader) cardHeader.style.display = 'none';
        if (settingsSection) settingsSection.style.display = 'block';
        loadGitStatus();
      } else {
        // Show card header, hide settings card
        if (cardHeader) cardHeader.style.display = '';
        if (settingsSection) settingsSection.style.display = 'none';
        $(`#content${capitalize(tabName)}`).classList.add('active');
      }
    });
  });

  // Paste button
  els.btnPaste.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      els.urlInput.value = text;
      els.urlInput.focus();
    } catch (err) {
      showToast('Không thể đọc clipboard', 'error');
    }
  });

  // Download button
  els.btnDownload.addEventListener('click', () => startFromUrl());

  // URL input enter key
  els.urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') startFromUrl();
  });

  // Upload zone
  els.uploadZone.addEventListener('click', () => els.fileInput.click());
  els.uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    els.uploadZone.classList.add('dragover');
  });
  els.uploadZone.addEventListener('dragleave', () => {
    els.uploadZone.classList.remove('dragover');
  });
  els.uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    els.uploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  });
  els.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) uploadFile(file);
  });

  // Transcribe button
  els.btnTranscribe.addEventListener('click', () => startTranscription());

  // Copy button
  els.btnCopy.addEventListener('click', () => {
    const text = els.resultText.textContent;
    navigator.clipboard.writeText(text).then(() => {
      showToast('Đã copy text vào clipboard', 'success');
    });
  });

  // New job / Retry buttons
  els.btnNewJob.addEventListener('click', () => resetUI());
  els.btnRetry.addEventListener('click', () => resetUI());

  // Model option selection
  $$('.model-option').forEach(opt => {
    opt.addEventListener('click', () => {
      $$('.model-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
  });

  // ===== TRANSLATE TAB =====
  els.btnPickFolder.addEventListener('click', async () => {
    // Use showDirectoryPicker for writable access (allows saving back to same folder)
    if (window.showDirectoryPicker) {
      try {
        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        state.sourceDirHandle = dirHandle;
        // Recursively read files from directory and all subfolders
        const files = [];
        async function readDir(handle, prefix) {
          for await (const entry of handle.values()) {
            if (entry.kind === 'file') {
              const file = await entry.getFile();
              const relPath = prefix ? `${prefix}/${file.name}` : file.name;
              Object.defineProperty(file, 'webkitRelativePath', { value: `${dirHandle.name}/${relPath}` });
              files.push(file);
            } else if (entry.kind === 'directory') {
              await readDir(entry, prefix ? `${prefix}/${entry.name}` : entry.name);
            }
          }
        }
        await readDir(dirHandle, '');
        handleFolderPicked(files, dirHandle.name);
      } catch (err) {
        if (err.name !== 'AbortError') showToast('Không thể mở thư mục', 'error');
      }
    } else {
      // Fallback to webkitdirectory input
      els.folderPicker.value = '';
      els.folderPicker.click();
    }
  });
  els.btnPickFiles.addEventListener('click', async () => {
    if (window.showOpenFilePicker) {
      try {
        const handles = await window.showOpenFilePicker({
          multiple: true,
          types: [
            { description: 'Video & Subtitle', accept: {
              'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm'],
              'audio/*': ['.mp3', '.wav', '.m4a', '.flac', '.ogg'],
              'text/*': ['.txt', '.srt', '.vtt', '.sub', '.ass', '.ssa']
            }}
          ]
        });
        await handleFilesPickedFromHandles(handles);
      } catch (err) {
        if (err.name !== 'AbortError') showToast('Không thể chọn file', 'error');
      }
    } else {
      els.filePicker.value = '';
      els.filePicker.click();
    }
  });
  els.folderPicker.addEventListener('change', (e) => handleFolderPicked(e.target.files));
  els.filePicker.addEventListener('change', (e) => handleFilesPicked(e.target.files));
  els.btnScanFolder.addEventListener('click', () => scanFolder());
  els.folderInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') scanFolder();
  });
  els.btnSelectAll.addEventListener('click', () => toggleAllFiles(true));
  els.btnDeselectAll.addEventListener('click', () => toggleAllFiles(false));
  $('#btnClearList').addEventListener('click', () => clearFileList());
  els.btnBatchTranslate.addEventListener('click', () => startBatchTranslate());

  // Output folder mode toggle
  els.outputModeSame.addEventListener('change', () => {
    els.outputFolderInput.style.display = 'none';
  });
  els.outputModeCustom.addEventListener('change', () => {
    els.outputFolderInput.style.display = 'block';
    els.outputFolder.focus();
  });

  // Output folder picker button (uses File System Access API)
  els.btnPickOutputFolder.addEventListener('click', async () => {
    try {
      if (window.showDirectoryPicker) {
        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        state.outputDirHandle = dirHandle;
        els.outputFolder.value = dirHandle.name;
        showToast(`Đã chọn thư mục: ${dirHandle.name}`, 'success');
      } else {
        showToast('Trình duyệt không hỗ trợ. Vui lòng nhập đường dẫn thủ công.', 'error');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        showToast('Không thể chọn thư mục', 'error');
      }
    }
  });
  els.btnNewBatch.addEventListener('click', () => resetBatchUI());

  // Engine option selection
  $$('.engine-option').forEach(opt => {
    opt.addEventListener('click', () => {
      $$('.engine-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
  });

  // API Settings toggle
  $('#btnToggleApiSettings').addEventListener('click', () => {
    const panel = $('#apiSettingsPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });

  // File type filters
  $$('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFileFilter(btn.dataset.filter);
    });
  });
}

// ============ EXTRACT ACTIONS ============
async function startFromUrl() {
  const url = els.urlInput.value.trim();
  if (!url) { showToast('Vui lòng nhập URL video', 'error'); return; }
  if (!isValidUrl(url)) { showToast('URL không hợp lệ', 'error'); return; }

  els.btnDownload.disabled = true;
  try {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Có lỗi xảy ra', 'error'); els.btnDownload.disabled = false; return; }

    state.currentJobId = data.jobId;
    showSection('progress');
    els.progressText.textContent = 'Đang tải video...';
    els.progressBar.style.width = '10%';
    startPolling('download');
  } catch (err) {
    showToast('Không thể kết nối server', 'error');
    els.btnDownload.disabled = false;
  }
}

async function uploadFile(file) {
  const formData = new FormData();
  formData.append('video', file);
  showSection('progress');
  els.progressText.textContent = `Đang upload: ${file.name}...`;
  els.progressBar.style.width = '30%';

  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) { showError(data.error || 'Upload thất bại'); return; }

    state.currentJobId = data.jobId;
    els.progressBar.style.width = '100%';
    els.progressText.textContent = `Đã upload: ${data.filename}`;
    setTimeout(() => showSection('model'), 500);
  } catch (err) {
    showError('Upload thất bại. Kiểm tra kết nối.');
  }
}

async function startTranscription() {
  if (!state.currentJobId) return;
  const model = document.querySelector('input[name="model"]:checked')?.value || 'base';
  els.btnTranscribe.disabled = true;

  try {
    const res = await fetch(`/api/transcribe/${state.currentJobId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model })
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Có lỗi xảy ra', 'error'); els.btnTranscribe.disabled = false; return; }

    showSection('progress');
    els.progressText.textContent = 'Đang bắt đầu nhận diện giọng nói...';
    els.progressBar.style.width = '20%';
    startPolling('transcribe');
  } catch (err) {
    showToast('Không thể kết nối server', 'error');
    els.btnTranscribe.disabled = false;
  }
}

// ============ TRANSLATE ACTIONS ============

/**
 * Handle folder picked via browser's native directory picker.
 * Filters files for video/subtitle types and builds the file list.
 */
function handleFolderPicked(fileList, folderName) {
  if (!fileList || fileList.length === 0) return;

  const videoExts = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.mp3', '.wav', '.m4a', '.flac', '.ogg'];
  const subtitleExts = ['.txt', '.srt', '.vtt', '.sub', '.ass', '.ssa'];
  const allExts = [...videoExts, ...subtitleExts];

  // Get folder name from webkitRelativePath if not provided
  if (!folderName) {
    const firstRelPath = fileList[0]?.webkitRelativePath || '';
    folderName = firstRelPath.split('/')[0] || 'Selected folder';
  }

  // Filter relevant files (only top-level, skip deep subfolders)
  const items = [];
  const fileMap = new Map(); // baseName -> { video, subtitle }

  for (const file of fileList) {
    const relPath = file.webkitRelativePath || file.name;
    // Display name: strip root folder prefix, keep subfolder structure
    const parts = relPath.split('/');
    const displayName = parts.length > 1 ? parts.slice(1).join('/') : file.name;

    const name = file.name;
    const ext = '.' + name.split('.').pop().toLowerCase();
    if (!allExts.includes(ext)) continue;

    const isSubtitle = subtitleExts.includes(ext);

    items.push({
      name: displayName,
      file, // Keep File object for upload
      path: relPath,
      type: isSubtitle ? 'subtitle' : 'video',
      hasSubtitle: false, // Will be determined below
      size: file.size,
    });

    // Use directory-aware baseName for matching (e.g. "subfolder/video" matches "subfolder/video.srt")
    const dirPrefix = displayName.includes('/') ? displayName.substring(0, displayName.lastIndexOf('/') + 1) : '';
    const baseName = dirPrefix + name.substring(0, name.lastIndexOf('.'));
    if (!fileMap.has(baseName)) fileMap.set(baseName, { video: null, subtitle: null });
    if (isSubtitle) fileMap.get(baseName).subtitle = displayName;
    else fileMap.get(baseName).video = displayName;
  }

  // Mark videos that have matching subtitle files
  for (const item of items) {
    if (item.type === 'video') {
      const dirPrefix = item.name.includes('/') ? item.name.substring(0, item.name.lastIndexOf('/') + 1) : '';
      const fileName = item.name.includes('/') ? item.name.split('/').pop() : item.name;
      const baseName = dirPrefix + fileName.substring(0, fileName.lastIndexOf('.'));
      const entry = fileMap.get(baseName);
      item.hasSubtitle = !!(entry && entry.subtitle);
    } else {
      item.hasSubtitle = true;
    }
  }

  if (items.length === 0) {
    showToast('Không tìm thấy file video/subtitle trong thư mục', 'error');
    return;
  }

  state.scannedFiles = items;
  state.browserPicked = true;
  renderFileList(items);
  els.scanResults.style.display = 'block';
  els.scanCount.textContent = `${items.length} files`;
  els.folderInput.value = folderName;

  const hasVideoWithoutSub = items.some(f => f.type === 'video' && !f.hasSubtitle);
  els.extractModelRow.style.display = hasVideoWithoutSub ? 'flex' : 'none';

  // Show output folder selection - always show 'same folder' option
  els.outputFolderRow.style.display = 'block';
  els.outputModeSame.closest('.radio-option').style.display = 'flex';
  els.outputModeSame.checked = true;
  els.outputFolderInput.style.display = 'none';
  showToast(`Tìm thấy ${items.length} file trong thư mục`, 'success');
}

/**
 * Handle files picked via browser's native file input (fallback, no handles).
 */
function handleFilesPicked(fileList) {
  if (!fileList || fileList.length === 0) return;

  const subtitleExts = ['.txt', '.srt', '.vtt', '.sub', '.ass', '.ssa'];
  const items = [];

  for (const file of fileList) {
    const name = file.name;
    const ext = '.' + name.split('.').pop().toLowerCase();
    const isSubtitle = subtitleExts.includes(ext);

    items.push({
      name,
      file, // Keep File object for upload
      path: name,
      type: isSubtitle ? 'subtitle' : 'video',
      hasSubtitle: isSubtitle,
      size: file.size,
    });
  }

  state.scannedFiles = items;
  renderFileList(items);
  els.scanResults.style.display = 'block';
  els.scanCount.textContent = `${items.length} files`;
  els.folderInput.value = '';

  const hasVideoWithoutSub = items.some(f => f.type === 'video' && !f.hasSubtitle);
  els.extractModelRow.style.display = hasVideoWithoutSub ? 'flex' : 'none';
  // Show output folder selection - always show 'same folder' option
  els.outputFolderRow.style.display = 'block';
  els.outputModeSame.closest('.radio-option').style.display = 'flex';
  els.outputModeSame.checked = true;
  els.outputFolderInput.style.display = 'none';
  state.browserPicked = true;
  showToast(`Đã chọn ${items.length} file`, 'success');
}

/**
 * Handle files picked via showOpenFilePicker (with FileSystemFileHandle).
 * Stores file handles for later use when saving translations.
 */
async function handleFilesPickedFromHandles(handles) {
  if (!handles || handles.length === 0) return;

  const subtitleExts = ['.txt', '.srt', '.vtt', '.sub', '.ass', '.ssa'];
  const items = [];

  // Store all file handles for later directory resolution
  state.fileHandles = handles;

  for (const handle of handles) {
    const file = await handle.getFile();
    const name = file.name;
    const ext = '.' + name.split('.').pop().toLowerCase();
    const isSubtitle = subtitleExts.includes(ext);

    items.push({
      name,
      file,
      fileHandle: handle,
      path: name,
      type: isSubtitle ? 'subtitle' : 'video',
      hasSubtitle: isSubtitle,
      size: file.size,
    });
  }

  state.scannedFiles = items;
  state.browserPicked = true;
  renderFileList(items);
  els.scanResults.style.display = 'block';
  els.scanCount.textContent = `${items.length} files`;
  els.folderInput.value = 'Selected files';

  const hasVideoWithoutSub = items.some(f => f.type === 'video' && !f.hasSubtitle);
  els.extractModelRow.style.display = hasVideoWithoutSub ? 'flex' : 'none';
  // Show output folder selection
  els.outputFolderRow.style.display = 'block';
  els.outputModeSame.closest('.radio-option').style.display = 'flex';
  els.outputModeSame.checked = true;
  els.outputFolderInput.style.display = 'none';
  showToast(`Đã chọn ${items.length} file. Dịch xong sẽ hỏi chọn thư mục lưu.`, 'success');
}

async function scanFolder() {
  const folderPath = els.folderInput.value.trim();
  if (!folderPath) { showToast('Vui lòng nhập đường dẫn thư mục', 'error'); return; }

  els.btnScanFolder.disabled = true;
  try {
    const res = await fetch('/api/scan-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath })
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Lỗi quét thư mục', 'error'); els.btnScanFolder.disabled = false; return; }

    state.scannedFiles = data.items;
    renderFileList(data.items);
    els.scanResults.style.display = 'block';
    els.scanCount.textContent = `${data.total} files`;

    // Show extract model row if any video without subtitle
    const hasVideoWithoutSub = data.items.some(f => f.type === 'video' && !f.hasSubtitle);
    els.extractModelRow.style.display = hasVideoWithoutSub ? 'flex' : 'none';

    // Show output folder selection - show both options for path-based scan
    els.outputFolderRow.style.display = 'block';
    els.outputModeSame.closest('.radio-option').style.display = 'flex';
    els.outputModeSame.checked = true;
    els.outputFolderInput.style.display = 'none';
    state.browserPicked = false;

    showToast(`Tìm thấy ${data.total} file`, 'success');
  } catch (err) {
    showToast('Không thể kết nối server', 'error');
  }
  els.btnScanFolder.disabled = false;
}

function renderFileList(items) {
  els.fileList.innerHTML = '';
  items.forEach((item, idx) => {
    const sizeStr = formatFileSize(item.size);
    const typeIcon = item.type === 'video' ? '🎬' : '📝';
    const subBadge = item.hasSubtitle
      ? '<span class="file-badge has-sub">Có subtitle</span>'
      : '<span class="file-badge no-sub">Cần trích xuất</span>';

    const div = document.createElement('div');
    div.className = 'file-item';
    div.dataset.type = item.type;
    div.dataset.hassub = item.hasSubtitle ? 'yes' : 'no';
    div.innerHTML = `
      <label class="file-check">
        <input type="checkbox" checked data-index="${idx}">
        <span class="checkmark"></span>
      </label>
      <span class="file-icon">${typeIcon}</span>
      <div class="file-info">
        <span class="file-name">${item.name}</span>
        <span class="file-meta">${sizeStr} ${subBadge}</span>
      </div>
    `;
    els.fileList.appendChild(div);
  });

  // Reset filter to "all"
  $$('.filter-btn').forEach(b => b.classList.remove('active'));
  $('.filter-btn[data-filter="all"]')?.classList.add('active');
  updateFilterCount();
}

function toggleAllFiles(checked) {
  // Only affect visible (not hidden by filter) items
  els.fileList.querySelectorAll('.file-item:not([style*="display: none"]) input[type="checkbox"]').forEach(cb => cb.checked = checked);
}

function clearFileList() {
  state.scannedFiles = [];
  state.browserPicked = false;
  state.sourceDirHandle = null;
  els.fileList.innerHTML = '';
  els.scanResults.style.display = 'none';
  els.scanCount.textContent = '0 files';
  els.folderInput.value = '';
  els.extractModelRow.style.display = 'none';
  els.outputFolderRow.style.display = 'none';
  showToast('Đã xoá danh sách file', 'success');
}

function applyFileFilter(filter) {
  const items = els.fileList.querySelectorAll('.file-item');
  let visibleCount = 0;

  items.forEach(item => {
    const type = item.dataset.type;
    const hasSub = item.dataset.hassub === 'yes';
    let show = true;

    switch (filter) {
      case 'subtitle': show = (type === 'subtitle'); break;
      case 'video': show = (type === 'video'); break;
      case 'no-sub': show = (type === 'video' && !hasSub); break;
      default: show = true;
    }

    item.style.display = show ? '' : 'none';
    // Auto-check visible, uncheck hidden
    const cb = item.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = show;
    if (show) visibleCount++;
  });

  updateFilterCount();
}

function updateFilterCount() {
  const visible = els.fileList.querySelectorAll('.file-item:not([style*="display: none"])').length;
  const total = els.fileList.querySelectorAll('.file-item').length;
  const checked = els.fileList.querySelectorAll('.file-item:not([style*="display: none"]) input[type="checkbox"]:checked').length;
  els.scanCount.textContent = visible === total ? `${total} files` : `${visible}/${total} files (${checked} đã chọn)`;
}

async function startBatchTranslate() {
  const toLang = els.toLang.value;
  const fromLang = els.fromLang.value;
  const extractModel = els.extractModel?.value || 'base';
  const outputMode = document.querySelector('input[name="outputMode"]:checked')?.value || 'same';
  const outputFolder = outputMode === 'custom' ? (els.outputFolder?.value?.trim() || '') : '';

  // Note: if outputMode === 'same' and we have sourceDirHandle, files will be saved
  // to the picked directory after translation. If no dirHandle, server saves to output/ dir
  // and files are auto-downloaded to user's default download folder.

  // Get selected files
  const selectedFiles = [];
  els.fileList.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
    const idx = parseInt(cb.dataset.index);
    if (state.scannedFiles[idx]) selectedFiles.push(state.scannedFiles[idx]);
  });

  if (selectedFiles.length === 0) { showToast('Chưa chọn file nào', 'error'); return; }

  els.btnBatchTranslate.disabled = true;

  try {
    // Check if files were picked via browser (have File objects) or via path scan
    const hasBrowserFiles = selectedFiles.some(f => f.file instanceof File);

    let res;
    if (hasBrowserFiles) {
      // Upload files via FormData
      const formData = new FormData();
      formData.append('fromLang', fromLang);
      formData.append('toLang', toLang);
      formData.append('extractModel', extractModel);
      formData.append('outputMode', outputMode);
      formData.append('outputFolder', outputFolder);
      formData.append('engine', document.querySelector('input[name="engine"]:checked')?.value || 'google');

      const filesMeta = [];
      selectedFiles.forEach((f, i) => {
        if (f.file instanceof File) {
          formData.append('files', f.file, f.name);
          filesMeta.push({ name: f.name, type: f.type, hasSubtitle: f.hasSubtitle, index: i });
        }
      });
      formData.append('filesMeta', JSON.stringify(filesMeta));

      res = await fetch('/api/batch-translate-upload', { method: 'POST', body: formData });
    } else {
      // Path-based (from scan-folder)
      res = await fetch('/api/batch-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: selectedFiles, fromLang, toLang, extractModel, outputMode, outputFolder, engine: document.querySelector('input[name="engine"]:checked')?.value || 'google' })
      });
    }

    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Lỗi', 'error'); els.btnBatchTranslate.disabled = false; return; }

    state.batchId = data.batchId;
    showBatchSection();
    startBatchPolling();
  } catch (err) {
    showToast('Không thể kết nối server', 'error');
    els.btnBatchTranslate.disabled = false;
  }
}

function showBatchSection() {
  els.inputSection.style.display = 'none';
  els.batchSection.style.display = 'block';
  els.batchProgress.style.display = 'block';
  els.batchFooter.style.display = 'none';
  els.batchResultsList.innerHTML = '';
  els.batchProgressBar.style.width = '0%';
  state.batchSaveComplete = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startBatchPolling() {
  if (state.batchPollInterval) clearInterval(state.batchPollInterval);
  state.batchPollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/batch/${state.batchId}`);
      const job = await res.json();

      // Show progress with file count
      const done = (job.completedFiles || 0) + (job.failedFiles || 0);
      const total = job.totalFiles || 0;
      const countLabel = total > 0 ? `(${done}/${total}) ` : '';
      els.batchProgressText.textContent = countLabel + (job.progress || 'Đang xử lý...');
      if (total > 0) {
        const pct = Math.round((done / total) * 100);
        els.batchProgressBar.style.width = `${pct}%`;
      }

      // Render results as they come in (show server paths temporarily)
      if (!state.batchSaveComplete) {
        renderBatchResults(job.results);
      }

      if (job.status === 'completed' || job.status === 'error') {
        clearInterval(state.batchPollInterval);
        state.batchPollInterval = null;
        els.batchSpinner.style.display = 'none';
        els.batchFooter.style.display = 'flex';
        els.batchProgressBar.style.width = '100%';

        // Save translated files via File System Access API to user's picked folder
        const outputMode = document.querySelector('input[name="outputMode"]:checked')?.value || 'same';
        let dirHandle = (outputMode === 'same') ? state.sourceDirHandle : state.outputDirHandle;

        // If files were picked individually and no dirHandle yet, ask now (lazy resolution)
        if (!dirHandle && outputMode === 'same' && state.browserPicked && state.fileHandles) {
          try {
            els.batchProgressText.textContent = 'Chọn thư mục chứa file gốc để lưu bản dịch...';
            dirHandle = await window.showDirectoryPicker({
              mode: 'readwrite',
              startIn: state.fileHandles[0],
            });
            state.sourceDirHandle = dirHandle;
          } catch (err) {
            // User cancelled - will auto-download instead
            dirHandle = null;
          }
        }

        if (dirHandle && job.results) {
          els.batchProgressText.textContent = `Đang lưu ${job.results.filter(r => r.status === 'success').length} file vào thư mục gốc...`;
          await saveFilesToPickedDir(job.results, dirHandle);
          state.batchSaveComplete = true;
          els.batchProgressText.textContent = `Hoàn thành! Đã lưu vào: ${dirHandle.name}/`;
        } else if (state.browserPicked && job.results) {
          // No dirHandle available - auto-download files via browser
          await autoDownloadResults(job.results);
          state.batchSaveComplete = true;
        } else {
          // Path-based (server already saved to correct location)
          renderBatchResults(job.results);
        }

        showToast(job.status === 'completed' ? 'Dịch hoàn thành!' : 'Có lỗi xảy ra', job.status === 'completed' ? 'success' : 'error');
      }
    } catch (err) {
      console.error('Batch poll error:', err);
    }
  }, 1500);
}

/**
 * Save translated files to a directory via File System Access API.
 * Downloads each file from server output dir and writes to the given dir handle.
 */
async function saveFilesToPickedDir(results, dirHandle) {
  if (!dirHandle) return;

  for (const r of results) {
    if (r.status !== 'success' || !r.downloadUrl) continue;
    try {
      const response = await fetch(r.downloadUrl);
      const content = await response.text();

      // Navigate to correct subfolder using relativePath (e.g. "1 - Introduction/file.vi.srt")
      const relPath = r.relativePath || r.name;
      const parts = relPath.split('/');
      const fileName = parts.pop(); // Last part is the file name

      // Walk through subdirectories, creating them if needed
      let currentDir = dirHandle;
      for (const folder of parts) {
        if (!folder) continue;
        currentDir = await currentDir.getDirectoryHandle(folder, { create: true });
      }

      // Write the file in the correct subdirectory
      const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();

      // Update the saved path display
      r.savedPath = `${dirHandle.name}/${relPath}`;
    } catch (err) {
      console.error(`Failed to save ${r.relativePath || r.name} to picked dir:`, err);
    }
  }
  // Re-render with updated paths
  renderBatchResults(results);
}

/**
 * Auto-download translated files via browser when no directory handle is available.
 * Triggers standard browser download for each successful result.
 */
async function autoDownloadResults(results) {
  for (const r of results) {
    if (r.status !== 'success' || !r.downloadUrl) continue;
    try {
      const a = document.createElement('a');
      a.href = r.downloadUrl;
      a.download = r.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      r.savedPath = `Downloads/${r.name}`;
      // Small delay between downloads to avoid browser blocking
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (err) {
      console.error(`Failed to auto-download ${r.name}:`, err);
    }
  }
  renderBatchResults(results);
}

function renderBatchResults(results) {
  if (!results || results.length === 0) return;
  els.batchResultsList.innerHTML = '';
  results.forEach(r => {
    const div = document.createElement('div');
    div.className = `batch-result-item ${r.status}`;
    if (r.status === 'success') {
      const savedPath = r.savedPath || r.outputPath || '';
      div.innerHTML = `
        <span class="batch-result-icon">✅</span>
        <div class="batch-result-info">
          <span class="batch-result-name">${r.name}</span>
          ${savedPath ? `<span class="batch-result-path" title="${savedPath}">📁 ${savedPath}</span>` : ''}
        </div>
      `;
    } else {
      div.innerHTML = `
        <span class="batch-result-icon">❌</span>
        <span class="batch-result-name">${r.name}</span>
        <span class="batch-result-error">${r.error || 'Lỗi'}</span>
      `;
    }
    els.batchResultsList.appendChild(div);
  });
}

function resetBatchUI() {
  if (state.batchPollInterval) clearInterval(state.batchPollInterval);
  state.batchId = null;
  state.batchSaveComplete = false;
  els.batchSection.style.display = 'none';
  els.batchSpinner.style.display = 'block';
  els.inputSection.style.display = 'block';
  els.btnBatchTranslate.disabled = false;

  // Switch to translate tab
  $$('.tab').forEach(t => t.classList.remove('active'));
  $('#tabTranslate').classList.add('active');
  $$('.tab-content').forEach(c => c.classList.remove('active'));
  $('#contentTranslate').classList.add('active');
}

// ============ POLLING ============
function startPolling(phase) {
  if (state.pollInterval) clearInterval(state.pollInterval);
  state.pollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/job/${state.currentJobId}`);
      const job = await res.json();
      updateProgress(job, phase);

      if (job.status === 'downloaded' && phase === 'download') {
        clearInterval(state.pollInterval);
        els.progressBar.style.width = '100%';
        els.progressText.textContent = 'Tải video thành công!';
        setTimeout(() => showSection('model'), 800);
      }
      if (job.status === 'completed') {
        clearInterval(state.pollInterval);
        showResult(job);
      }
      if (job.status === 'error') {
        clearInterval(state.pollInterval);
        showError(job.error);
      }
    } catch (err) {
      console.error('Poll error:', err);
    }
  }, 1000);
}

function updateProgress(job, phase) {
  if (job.progress) {
    els.progressText.textContent = job.progress;
    const match = job.progress.match(/(\d+)%/);
    if (match) {
      let pct = parseInt(match[1]);
      if (phase === 'download') pct = Math.min(90, pct * 0.9);
      els.progressBar.style.width = `${pct}%`;
    }
  }
}

// ============ UI HELPERS ============
function showSection(section) {
  els.modelSection.style.display = 'none';
  els.progressSection.style.display = 'none';
  els.resultSection.style.display = 'none';
  els.errorSection.style.display = 'none';

  switch (section) {
    case 'model':
      els.modelSection.style.display = 'block';
      els.inputSection.style.display = 'none';
      els.btnTranscribe.disabled = false;
      break;
    case 'progress':
      els.progressSection.style.display = 'block';
      els.inputSection.style.display = 'none';
      break;
    case 'result':
      els.resultSection.style.display = 'block';
      els.inputSection.style.display = 'none';
      break;
    case 'error':
      els.errorSection.style.display = 'block';
      break;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showResult(job) {
  showSection('result');
  els.resultText.textContent = job.text || 'Không có nội dung';
  if (job.downloadUrl) {
    els.btnDownloadTxt.href = job.downloadUrl;
    els.btnDownloadTxt.download = `subtitle_${new Date().toISOString().slice(0, 10)}.txt`;
  }
  showToast('Trích xuất hoàn thành!', 'success');
}

function showError(message) {
  showSection('error');
  els.errorMessage.textContent = message || 'Có lỗi không xác định';
}

function resetUI() {
  state.currentJobId = null;
  if (state.pollInterval) clearInterval(state.pollInterval);

  els.urlInput.value = '';
  els.btnDownload.disabled = false;
  els.progressBar.style.width = '0%';
  els.progressText.textContent = '';
  els.fileInput.value = '';

  els.inputSection.style.display = 'block';
  els.modelSection.style.display = 'none';
  els.progressSection.style.display = 'none';
  els.resultSection.style.display = 'none';
  els.errorSection.style.display = 'none';
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    ${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}
    <span>${message}</span>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function isValidUrl(str) {
  try {
    const url = new URL(str);
    return ['http:', 'https:'].includes(url.protocol);
  } catch { return false; }
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// ============ ENGINE / API KEY MANAGEMENT ============

async function loadEngines() {
  try {
    const res = await fetch('/api/engines');
    const engines = await res.json();

    for (const [id, info] of Object.entries(engines)) {
      if (id === 'google') continue; // Always "FREE"
      const statusEl = $(`#status${capitalize(id)}`);
      if (statusEl) {
        if (info.configured) {
          statusEl.textContent = 'Đã cấu hình';
          statusEl.classList.add('configured');
        } else {
          statusEl.textContent = 'Chưa cấu hình';
          statusEl.classList.remove('configured');
        }
      }
    }
  } catch (err) {
    console.error('Failed to load engines:', err);
  }
}

async function saveKey(engine) {
  const input = $(`#inputKey${capitalize(engine)}`);
  const statusEl = $(`#keyStatus${capitalize(engine)}`);
  const apiKey = input?.value?.trim();

  if (!apiKey) {
    statusEl.textContent = '⚠️ Vui lòng nhập API key';
    statusEl.className = 'api-key-status error';
    return;
  }

  statusEl.textContent = '⏳ Đang lưu...';
  statusEl.className = 'api-key-status loading';

  try {
    const regionInput = $(`#inputMsRegion`);
    const body = { engine, apiKey };
    if (engine === 'microsoft' && regionInput?.value?.trim()) {
      body.region = regionInput.value.trim();
    }

    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    statusEl.textContent = '✅ Đã lưu thành công';
    statusEl.className = 'api-key-status success';
    input.value = '';

    // Update engine status badge
    const engineStatusEl = $(`#status${capitalize(engine)}`);
    if (engineStatusEl) {
      engineStatusEl.textContent = 'Đã cấu hình';
      engineStatusEl.classList.add('configured');
    }

    // Mark group as saved
    $(`#keyGroup${capitalize(engine)}`)?.classList.add('saved');

    showToast(`Đã lưu API key cho ${engine}`, 'success');
  } catch (err) {
    statusEl.textContent = `❌ Lỗi: ${err.message}`;
    statusEl.className = 'api-key-status error';
  }
}

async function testKey(engine) {
  const input = $(`#inputKey${capitalize(engine)}`);
  const statusEl = $(`#keyStatus${capitalize(engine)}`);
  const apiKey = input?.value?.trim();

  if (!apiKey) {
    statusEl.textContent = '⚠️ Vui lòng nhập API key để test';
    statusEl.className = 'api-key-status error';
    return;
  }

  statusEl.textContent = '⏳ Đang kiểm tra kết nối...';
  statusEl.className = 'api-key-status loading';

  try {
    const res = await fetch('/api/test-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engine, apiKey }),
    });
    const result = await res.json();

  statusEl.textContent = result.message;
    statusEl.className = `api-key-status ${result.success ? 'success' : 'error'}`;
  } catch (err) {
    statusEl.textContent = `❌ Lỗi kết nối: ${err.message}`;
    statusEl.className = 'api-key-status error';
  }
}

// ============ MODEL CACHE DIRECTORY ============
document.addEventListener('DOMContentLoaded', () => {
  // Load current model cache dir
  loadModelCacheDir();

  // Pick folder button
  const btnPick = $('#btnPickModelCache');
  if (btnPick) {
    btnPick.addEventListener('click', async () => {
      if (window.showDirectoryPicker) {
        try {
          const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
          $('#inputModelCacheDir').value = dirHandle.name;
          // We can't get full path from browser, so save the name and let user paste full path
          showToast('Nhập đường dẫn đầy đủ rồi bấm Lưu', 'warning');
        } catch {}
      }
    });
  }

  // Save button
  const btnSave = $('#btnSaveModelCache');
  if (btnSave) {
    btnSave.addEventListener('click', saveModelCacheDir);
  }
});

async function loadModelCacheDir() {
  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();
    const input = $('#inputModelCacheDir');
    const status = $('#modelCacheStatus');
    if (settings.MODEL_CACHE_DIR) {
      input.value = settings.MODEL_CACHE_DIR;
      status.textContent = `✅ Đang dùng: ${settings.MODEL_CACHE_DIR}`;
      status.className = 'api-key-status success';
    } else {
      status.textContent = 'Mặc định: C:\\Users\\...\\. cache\\huggingface';
      status.className = 'api-key-status';
    }
  } catch {}
}

async function saveModelCacheDir() {
  const input = $('#inputModelCacheDir');
  const status = $('#modelCacheStatus');
  const dir = input.value.trim();

  if (!dir) {
    // Clear setting → use default
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelCacheDir: '' }),
    });
    status.textContent = 'Đã xoá. Sẽ dùng thư mục mặc định.';
    status.className = 'api-key-status success';
    showToast('Đã reset về thư mục mặc định', 'success');
    return;
  }

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelCacheDir: dir }),
    });
    const result = await res.json();
    if (result.success) {
      status.textContent = `✅ Đã lưu: ${dir}`;
      status.className = 'api-key-status success';
      showToast('Đã lưu thư mục model. Model mới sẽ tải về đây.', 'success');
    }
  } catch (err) {
    status.textContent = `❌ Lỗi: ${err.message}`;
    status.className = 'api-key-status error';
  }
}

// ============ CUSTOM MODAL ============
function showModal({ icon = '🚀', title = 'Thông báo', message = '', input = false, placeholder = '', okText = 'Xác nhận', cancelText = 'Huỷ' } = {}) {
  return new Promise((resolve) => {
    const overlay = $('#customModal');
    $('#modalIcon').textContent = icon;
    $('#modalTitle').textContent = title;
    $('#modalMessage').textContent = message;
    const inputWrap = $('#modalInputWrap');
    const inputEl = $('#modalInput');
    const btnOk = $('#modalBtnOk');
    const btnCancel = $('#modalBtnCancel');
    btnOk.textContent = okText;
    btnCancel.textContent = cancelText;

    if (input) {
      inputWrap.style.display = '';
      inputEl.value = '';
      inputEl.placeholder = placeholder || '';
    } else {
      inputWrap.style.display = 'none';
    }

    overlay.style.display = 'flex';
    if (input) setTimeout(() => inputEl.focus(), 100);

    function cleanup() {
      overlay.style.display = 'none';
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onOverlay);
      inputEl.removeEventListener('keydown', onKey);
    }
    function onOk() { cleanup(); resolve(input ? (inputEl.value || '') : true); }
    function onCancel() { cleanup(); resolve(input ? null : false); }
    function onOverlay(e) { if (e.target === overlay) onCancel(); }
    function onKey(e) { if (e.key === 'Enter') onOk(); if (e.key === 'Escape') onCancel(); }

    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
    overlay.addEventListener('click', onOverlay);
    inputEl.addEventListener('keydown', onKey);
  });
}

// ============ GIT CONTROLS ============
async function loadGitStatus() {
  const statusEl = $('#gitStatusText');
  if (!statusEl) return;
  try {
    const res = await fetch('/api/git/status');
    const data = await res.json();
    if (data.error) {
      statusEl.textContent = '⚠️ Git chưa được khởi tạo';
      return;
    }
    let info = `📌 Branch: ${data.branch}`;
    if (data.remote) info += ` | 🔗 ${data.remote}`;
    info += `\n📝 ${data.lastCommit}`;
    if (data.changedFiles > 0) info += ` | 📦 ${data.changedFiles} file thay đổi`;
    statusEl.textContent = info;
  } catch (e) {
    statusEl.textContent = '❌ Không thể kết nối server';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Git Push
  const btnPush = $('#btnGitPush');
  if (btnPush) {
    btnPush.addEventListener('click', async () => {
      const msg = await showModal({ icon: '🚀', title: 'Push lên GitHub', message: 'Nhập mô tả thay đổi (hoặc để trống)', input: true, placeholder: 'Ví dụ: Fix lỗi dịch subtitle...', okText: 'Push' });
      if (msg === null) return; // cancelled
      
      btnPush.disabled = true;
      btnPush.textContent = '⏳ Đang push...';
      const log = $('#gitLog');
      
      try {
        const res = await fetch('/api/git/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg || undefined })
        });
        const data = await res.json();
        if (data.success) {
          showToast(data.message, 'success');
          if (log) { log.textContent = data.output || data.message; log.style.display = 'block'; }
        } else {
          showToast(`Lỗi: ${data.error}`, 'error');
          if (log) { log.textContent = data.error + '\n' + (data.stderr || ''); log.style.display = 'block'; }
        }
      } catch (e) {
        showToast('Lỗi push: ' + e.message, 'error');
      }
      
      btnPush.disabled = false;
      btnPush.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/></svg> Push lên GitHub';
      loadGitStatus();
    });
  }
  
  // Check Update
  const btnCheck = $('#btnGitCheckUpdate');
  if (btnCheck) {
    btnCheck.addEventListener('click', async () => {
      btnCheck.disabled = true;
      btnCheck.textContent = '⏳ Đang kiểm tra...';
      const log = $('#gitLog');
      const btnPull = $('#btnGitPull');
      
      try {
        const res = await fetch('/api/git/check-update');
        const data = await res.json();
        
        if (data.status === 'up-to-date') {
          showToast('✅ Đang dùng bản mới nhất!', 'success');
          if (log) { log.textContent = `Local: ${data.localHash} | Remote: ${data.remoteHash}\n${data.remoteLog}`; log.style.display = 'block'; }
          if (btnPull) btnPull.style.display = 'none';
        } else if (data.status === 'behind') {
          showToast(`🔔 Có ${data.behind} bản cập nhật mới!`, 'info');
          if (log) { log.textContent = `Bản mới nhất: ${data.remoteLog}`; log.style.display = 'block'; }
          if (btnPull) btnPull.style.display = '';
        } else if (data.status === 'error') {
          showToast('⚠️ Chưa kết nối remote. Cần thêm remote origin trước.', 'error');
          if (log) { log.textContent = data.error; log.style.display = 'block'; }
        } else {
          showToast(`Trạng thái: ${data.status}`, 'info');
        }
      } catch (e) {
        showToast('Lỗi: ' + e.message, 'error');
      }
      
      btnCheck.disabled = false;
      btnCheck.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Kiểm tra update';
    });
  }
  
  // Pull Update
  const btnPull = $('#btnGitPull');
  if (btnPull) {
    btnPull.addEventListener('click', async () => {
      const ok = await showModal({ icon: '⬇️', title: 'Cập nhật app', message: 'Tải bản mới từ GitHub? Server sẽ cần restart sau khi cập nhật.', okText: 'Cập nhật' });
      if (!ok) return;
      
      btnPull.disabled = true;
      btnPull.textContent = '⏳ Đang cập nhật...';
      const log = $('#gitLog');
      
      try {
        const res = await fetch('/api/git/pull', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          showToast('✅ ' + data.message + (data.npmUpdated ? ' (đã cập nhật dependencies)' : ''), 'success');
          if (log) { log.textContent = data.output + '\n\nCommit: ' + data.latestCommit; log.style.display = 'block'; }
          // Suggest reload
          setTimeout(async () => {
            const reload = await showModal({ icon: '✅', title: 'Cập nhật thành công!', message: 'Reload trang để áp dụng thay đổi mới?', okText: 'Reload', cancelText: 'Để sau' });
            if (reload) location.reload();
          }, 1500);
        } else {
          showToast('Lỗi: ' + data.error, 'error');
        }
      } catch (e) {
        showToast('Lỗi pull: ' + e.message, 'error');
      }
      
      btnPull.disabled = false;
      btnPull.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Cập nhật ngay';
      btnPull.style.display = 'none';
      loadGitStatus();
    });
  }
});

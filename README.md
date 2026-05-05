# 🎬 SubExtract - Video Subtitle Extractor

Trích xuất phụ đề / lời nói từ video TikTok, Facebook, YouTube thành file text thuần túy.

## ✨ Tính năng

- 📥 **Tải video** từ link TikTok, Facebook Reel, YouTube, Instagram
- 📁 **Upload file** video/audio có sẵn trên máy
- 🎙️ **Nhận diện giọng nói** tiếng Việt bằng Whisper AI
- 📝 **Xuất file .txt** - text thuần túy, dễ copy/paste
- 🌐 **Dịch subtitle** sang nhiều ngôn ngữ (Google, DeepL, Gemini, OpenAI)
- 🎛️ **Chọn model** AI từ Tiny (nhanh) đến Large-v3 (chính xác nhất)
- 🖥️ **Giao diện web** đẹp, dễ sử dụng

---

## 📋 Yêu cầu hệ thống

| Phần mềm | Phiên bản | Mục đích |
|-----------|-----------|----------|
| [Node.js](https://nodejs.org/) | >= 18 | Chạy web server |
| [Python](https://python.org/) | >= 3.8 | Chạy Whisper AI |
| [FFmpeg](https://ffmpeg.org/) | Bất kỳ | Xử lý audio/video |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Mới nhất | Tải video từ URL |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | Mới nhất | Nhận diện giọng nói |

---

## 🚀 Cài đặt nhanh

### Bước 1: Cài phần mềm cần thiết

1. **Node.js** — Tải và cài từ [nodejs.org](https://nodejs.org/) (chọn bản LTS)
2. **Python** — Tải và cài từ [python.org](https://python.org/) (☑️ tick "Add to PATH" khi cài)
3. **FFmpeg** — Tải từ [ffmpeg.org](https://ffmpeg.org/download.html), giải nén và thêm vào PATH

### Bước 2: Cài thư viện Python

Mở **Command Prompt** hoặc **PowerShell**, chạy:

```bash
# Tải video từ link
pip install yt-dlp

# Nhận diện giọng nói (chọn 1 trong 2)
pip install faster-whisper          # Khuyên dùng - nhanh hơn
# pip install openai-whisper        # Bản gốc OpenAI
```

> 💡 **Có GPU NVIDIA?** Cài thêm CUDA để tăng tốc xử lý: `pip install faster-whisper[cuda]`

### Bước 3: Clone và chạy

```bash
git clone https://github.com/silverbret1709/sub-extract
cd sub-extract
npm install
```

### Bước 4: Khởi động

**Cách 1 — Double-click (đơn giản nhất):**
> Mở thư mục `sub-extract` → double-click file **`start.bat`**

**Cách 2 — Chạy bằng lệnh:**
```bash
cd sub-extract
node server.js
```

Trình duyệt sẽ tự mở tại **http://localhost:3456** 🎉

---

## ▶️ Hướng dẫn sử dụng

### Cách 1: Dán link video
1. Copy link TikTok / Facebook Reel / YouTube
2. Dán vào ô URL
3. Click **"Tải & Trích xuất"**
4. Chọn model Whisper (khuyên dùng: **Base**)
5. Click **"Bắt đầu trích xuất"**
6. Đợi xử lý → Copy text hoặc tải file .txt

### Cách 2: Upload file có sẵn
1. Chuyển tab **"Upload file có sẵn"**
2. Kéo thả file hoặc click chọn file
3. Chọn model → Trích xuất

### Cách 3: Dịch subtitle hàng loạt
1. Chuyển tab **"Dịch subtitle"**
2. Chọn thư mục chứa file subtitle / video
3. Chọn ngôn ngữ nguồn & đích
4. Click **"Bắt đầu dịch"**

---

## 🎛️ Model Whisper

| Model | RAM | Tốc độ | Chất lượng |
|-------|-----|--------|------------|
| Tiny | ~75MB | ⚡⚡⚡ Nhanh nhất | ★★☆☆☆ |
| **Base** | ~150MB | ⚡⚡ Nhanh | ★★★☆☆ |
| Small | ~500MB | ⚡ Trung bình | ★★★★☆ |
| Medium | ~1.5GB | 🐌 Chậm | ★★★★☆ |
| Large-v3 | ~3GB | 🐌🐌 Rất chậm | ★★★★★ |

> 💡 **Khuyên dùng**: Model `Base` cho cân bằng tốc độ và chất lượng. Nếu có GPU NVIDIA thì dùng `Small` hoặc `Medium`.

---

## 📁 Cấu trúc project

```
sub-extract/
├── start.bat          # 🚀 Double-click để chạy
├── server.js          # Express server
├── transcribe.py      # Python script cho Whisper
├── translate.js       # Module dịch subtitle
├── package.json       # Dependencies
├── public/
│   ├── index.html     # Giao diện web
│   ├── style.css      # Styling
│   └── app.js         # Frontend logic
├── downloads/         # Video đã tải (tự tạo)
├── uploads/           # Video đã upload (tự tạo)
└── output/            # File text đã trích xuất (tự tạo)
```

---

## ❓ Xử lý lỗi thường gặp

| Lỗi | Nguyên nhân | Cách sửa |
|-----|-------------|----------|
| `yt-dlp not found` | Chưa cài yt-dlp | `pip install yt-dlp` |
| `Whisper chưa được cài` | Chưa cài faster-whisper | `pip install faster-whisper` |
| `ffmpeg not found` | Chưa cài FFmpeg | Tải từ ffmpeg.org, thêm vào PATH |
| `ENOENT package.json` | Chạy sai thư mục | `cd sub-extract` rồi chạy lại |
| Video không có tiếng | File video thiếu audio | Thử tải từ nguồn khác |

---

## 📜 License

MIT

# 🎬 SubExtract - Video Subtitle Extractor

Trích xuất phụ đề / lời nói từ video TikTok, Facebook, YouTube thành file text thuần túy.

## ✨ Tính năng

- 📥 **Tải video** từ link TikTok, Facebook Reel, YouTube, Instagram
- 📁 **Upload file** video/audio có sẵn trên máy
- 🎙️ **Nhận diện giọng nói** tiếng Việt bằng Whisper AI
- 📝 **Xuất file .txt** - text thuần túy, dễ copy/paste
- 🎛️ **Chọn model** AI từ Tiny (nhanh) đến Large-v3 (chính xác nhất)
- 🖥️ **Giao diện web** đẹp, dễ sử dụng

## 📋 Yêu cầu

- **Node.js** >= 18
- **Python** >= 3.8
- **yt-dlp** - Tải video từ link
- **faster-whisper** - Nhận diện giọng nói (khuyên dùng)

## 🚀 Cài đặt

```bash
# 1. Cài dependencies Node.js
cd video-subtitle-extractor
npm install

# 2. Cài yt-dlp (tải video)
pip install yt-dlp

# 3. Cài faster-whisper (nhận diện giọng nói - khuyên dùng)
pip install faster-whisper

# Hoặc dùng bản gốc OpenAI Whisper:
# pip install openai-whisper
```

## ▶️ Sử dụng

```bash
npm run dev
# Mở http://localhost:3456
```

### Cách 1: Dán link video
1. Copy link TikTok / Facebook Reel / YouTube
2. Dán vào ô URL
3. Click "Tải & Trích xuất"
4. Chọn model Whisper (khuyên dùng: Base)
5. Click "Bắt đầu trích xuất"
6. Đợi xử lý → Copy text hoặc tải file .txt

### Cách 2: Upload file có sẵn
1. Chuyển tab "Upload file có sẵn"
2. Kéo thả file hoặc click chọn file
3. Chọn model → Trích xuất

## 🎛️ Model Whisper

| Model | RAM | Tốc độ | Chất lượng |
|-------|-----|--------|------------|
| Tiny | ~75MB | ⚡⚡⚡ Nhanh nhất | ★★☆☆☆ |
| **Base** | ~150MB | ⚡⚡ Nhanh | ★★★☆☆ |
| Small | ~500MB | ⚡ Trung bình | ★★★★☆ |
| Medium | ~1.5GB | 🐌 Chậm | ★★★★☆ |
| Large-v3 | ~3GB | 🐌🐌 Rất chậm | ★★★★★ |

> 💡 **Khuyên dùng**: Model `Base` cho cân bằng tốc độ và chất lượng. Nếu có GPU NVIDIA thì dùng `Small` hoặc `Medium`.

## 📁 Cấu trúc

```
video-subtitle-extractor/
├── server.js          # Express server
├── transcribe.py      # Python script cho Whisper
├── public/
│   ├── index.html     # Giao diện web
│   ├── style.css      # Styling
│   └── app.js         # Frontend logic
├── downloads/         # Video đã tải
├── uploads/           # Video đã upload
└── output/            # File text đã trích xuất
```

/**
 * Multi-Engine Subtitle Translation Module
 * Supports: Google Translate (free), Gemini Flash, GPT-4o mini, DeepL, Microsoft Translator
 */

const googleTranslate = require('google-translate-api-x');
const path = require('path');
const fs = require('fs');

// ============ SUPPORTED LANGUAGES ============
const SUPPORTED_LANGUAGES = {
  'auto': 'Tự động nhận diện',
  'vi': 'Tiếng Việt',
  'en': 'English',
  'zh-CN': '中文 (简体)',
  'zh-TW': '中文 (繁體)',
  'ja': '日本語',
  'ko': '한국어',
  'fr': 'Français',
  'de': 'Deutsch',
  'es': 'Español',
  'pt': 'Português',
  'ru': 'Русский',
  'th': 'ไทย',
  'id': 'Bahasa Indonesia',
  'ms': 'Bahasa Melayu',
  'ar': 'العربية',
  'hi': 'हिन्दी',
  'it': 'Italiano',
  'nl': 'Nederlands',
  'pl': 'Polski',
  'tr': 'Türkçe',
  'uk': 'Українська',
  'cs': 'Čeština',
  'sv': 'Svenska',
  'da': 'Dansk',
  'fi': 'Suomi',
  'no': 'Norsk',
  'el': 'Ελληνικά',
  'ro': 'Română',
  'hu': 'Magyar',
};

// ============ ENGINE INFO ============
const ENGINES = {
  google: {
    name: 'Google Translate',
    description: 'Miễn phí, cơ bản',
    requiresKey: false,
    icon: '🌐',
  },
  gemini: {
    name: 'Gemini Flash',
    description: 'Chất lượng cao, rẻ',
    requiresKey: true,
    keyName: 'GEMINI_API_KEY',
    icon: '✨',
  },
  openai: {
    name: 'GPT-4.1 nano',
    description: 'Cực rẻ, chất lượng tốt',
    requiresKey: true,
    keyName: 'OPENAI_API_KEY',
    icon: '🤖',
  },
  deepl: {
    name: 'DeepL',
    description: 'Chuyên nghiệp, 30+ ngôn ngữ',
    requiresKey: true,
    keyName: 'DEEPL_API_KEY',
    icon: '📘',
  },
  microsoft: {
    name: 'Microsoft Translator',
    description: 'Free 2M chars/tháng',
    requiresKey: true,
    keyName: 'MICROSOFT_API_KEY',
    icon: '🔷',
  },
};

// ============ SETTINGS MANAGEMENT ============
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load settings:', e.message);
  }
  return {};
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save settings:', e.message);
  }
}

function getApiKey(engine) {
  const settings = loadSettings();
  const envKey = ENGINES[engine]?.keyName;
  // Priority: settings.json > environment variable
  return settings[envKey] || process.env[envKey] || '';
}

function setApiKey(engine, key) {
  const settings = loadSettings();
  const envKey = ENGINES[engine]?.keyName;
  if (envKey) {
    settings[envKey] = key;
    saveSettings(settings);
  }
}

// ============ ENGINE: GOOGLE TRANSLATE (FREE) ============
async function translateWithGoogle(text, fromLang, toLang, onProgress) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) return { translatedText: '', detectedLang: fromLang };

  const BATCH_SIZE = 20;
  const batches = [];
  for (let i = 0; i < lines.length; i += BATCH_SIZE) {
    batches.push(lines.slice(i, i + BATCH_SIZE));
  }

  const translatedLines = [];
  let detectedLang = fromLang;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchText = batch.join('\n');

    try {
      const opts = { to: toLang };
      if (fromLang && fromLang !== 'auto') opts.from = fromLang;
      const result = await googleTranslate(batchText, opts);

      translatedLines.push(result.text || '');

      if (i === 0 && result.from && result.from.language) {
        detectedLang = result.from.language.iso || fromLang;
      }

      const pct = Math.min(100, Math.round(((i + 1) / batches.length) * 100));
      if (onProgress) onProgress(pct, `[Google] Đang dịch... ${pct}%`);
    } catch (err) {
      console.error(`Google batch ${i + 1} failed:`, err.message);
      translatedLines.push(batchText);
      await sleep(1000);
    }

    if (i < batches.length - 1) await sleep(300);
  }

  return { translatedText: translatedLines.join('\n'), detectedLang };
}

// ============ ENGINE: GEMINI FLASH ============
async function translateWithGemini(text, fromLang, toLang, onProgress) {
  const apiKey = getApiKey('gemini');
  if (!apiKey) throw new Error('Chưa cấu hình API key cho Gemini. Vào Cài đặt API để thêm.');

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) return { translatedText: '', detectedLang: fromLang };

  // Large batch size to reduce API calls (free tier = 20 req/day)
  const BATCH_SIZE = 80;
  const batches = [];
  for (let i = 0; i < lines.length; i += BATCH_SIZE) {
    batches.push(lines.slice(i, i + BATCH_SIZE));
  }

  const translatedLines = [];
  const fromLabel = fromLang === 'auto' ? '' : ` from ${SUPPORTED_LANGUAGES[fromLang] || fromLang}`;
  const toLabel = SUPPORTED_LANGUAGES[toLang] || toLang;

  for (let i = 0; i < batches.length; i++) {
    const batchText = batches[i].join('\n');
    const prompt = `Translate the following text${fromLabel} to ${toLabel}. Return ONLY the translated text, preserving the exact same number of lines and line breaks. Do not add any explanation, notes, or extra content.\n\n${batchText}`;

    // Retry with exponential backoff for rate limiting
    let retries = 0;
    const MAX_RETRIES = 5;
    let success = false;

    while (retries <= MAX_RETRIES && !success) {
      try {
        const result = await model.generateContent(prompt);
        const translated = result.response.text().trim();
        translatedLines.push(translated);
        success = true;

        const pct = Math.min(100, Math.round(((i + 1) / batches.length) * 100));
        if (onProgress) onProgress(pct, `[Gemini] Đang dịch... ${pct}%`);
      } catch (err) {
        const is429 = err.message?.includes('429') || err.message?.includes('quota') || err.message?.includes('Too Many');
        if (is429 && retries < MAX_RETRIES) {
          // Extract retryDelay from error if available, or use exponential backoff
          let waitSec = Math.min(60, Math.pow(2, retries + 1) * 5); // 10s, 20s, 40s, 60s
          const delayMatch = err.message.match(/retryDelay.*?(\d+)s/i);
          if (delayMatch) waitSec = parseInt(delayMatch[1]) + 2;

          console.log(`Gemini rate limited, retry ${retries + 1}/${MAX_RETRIES} in ${waitSec}s...`);
          if (onProgress) onProgress(null, `[Gemini] Rate limit, đợi ${waitSec}s rồi thử lại...`);
          await sleep(waitSec * 1000);
          retries++;
        } else {
          console.error(`Gemini batch ${i + 1} failed:`, err.message);
          translatedLines.push(batchText);
          success = true; // Move on
        }
      }
    }

    if (i < batches.length - 1) await sleep(1000); // 1s between batches
  }

  return { translatedText: translatedLines.join('\n'), detectedLang: fromLang };
}

// ============ ENGINE: OPENAI GPT-4.1-NANO ============
async function translateWithOpenAI(text, fromLang, toLang, onProgress) {
  const apiKey = getApiKey('openai');
  if (!apiKey) throw new Error('Chưa cấu hình API key cho OpenAI. Vào Cài đặt API để thêm.');

  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey });

  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) return { translatedText: '', detectedLang: fromLang };

  // Large batch = fewer requests = cheaper (system prompt sent once per request)
  const BATCH_SIZE = 120;
  const batches = [];
  for (let i = 0; i < lines.length; i += BATCH_SIZE) {
    batches.push(lines.slice(i, i + BATCH_SIZE));
  }

  const translatedLines = [];
  const toLabel = SUPPORTED_LANGUAGES[toLang] || toLang;

  for (let i = 0; i < batches.length; i++) {
    const batchText = batches[i].join('\n');

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4.1-nano',  // ~$0.10/1M input, $0.40/1M output — rẻ nhất
        messages: [
          {
            role: 'system',
            content: `Translate to ${toLabel}. Return ONLY translated text. Keep same line count and breaks. No notes.`
          },
          { role: 'user', content: batchText }
        ],
        temperature: 0.3,
      });

      const translated = response.choices[0]?.message?.content?.trim() || batchText;
      translatedLines.push(translated);

      const pct = Math.min(100, Math.round(((i + 1) / batches.length) * 100));
      if (onProgress) onProgress(pct, `[GPT-4.1 nano] Đang dịch... ${pct}%`);
    } catch (err) {
      console.error(`OpenAI batch ${i + 1} failed:`, err.message);
      translatedLines.push(batchText);
    }

    if (i < batches.length - 1) await sleep(200);
  }

  return { translatedText: translatedLines.join('\n'), detectedLang: fromLang };
}

// ============ ENGINE: DEEPL ============
async function translateWithDeepL(text, fromLang, toLang, onProgress) {
  const apiKey = getApiKey('deepl');
  if (!apiKey) throw new Error('Chưa cấu hình API key cho DeepL. Vào Cài đặt API để thêm.');

  const deepl = require('deepl-node');
  const translator = new deepl.Translator(apiKey);

  // DeepL language code mapping
  const deeplLangMap = {
    'en': 'en-US', 'pt': 'pt-BR', 'zh-CN': 'zh-HANS', 'zh-TW': 'zh-HANT',
  };
  const targetLang = deeplLangMap[toLang] || toLang;
  const sourceLang = (fromLang === 'auto' || !fromLang) ? null : (deeplLangMap[fromLang] || fromLang);

  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) return { translatedText: '', detectedLang: fromLang };

  // DeepL handles batching internally, but we batch for progress reporting
  const BATCH_SIZE = 40;
  const batches = [];
  for (let i = 0; i < lines.length; i += BATCH_SIZE) {
    batches.push(lines.slice(i, i + BATCH_SIZE));
  }

  const translatedLines = [];
  let detectedLang = fromLang;

  for (let i = 0; i < batches.length; i++) {
    const batchText = batches[i].join('\n');

    try {
      const result = await translator.translateText(batchText, sourceLang, targetLang);
      translatedLines.push(result.text);

      if (i === 0 && result.detectedSourceLang) {
        detectedLang = result.detectedSourceLang.toLowerCase();
      }

      const pct = Math.min(100, Math.round(((i + 1) / batches.length) * 100));
      if (onProgress) onProgress(pct, `[DeepL] Đang dịch... ${pct}%`);
    } catch (err) {
      console.error(`DeepL batch ${i + 1} failed:`, err.message);
      translatedLines.push(batchText);
    }

    if (i < batches.length - 1) await sleep(100);
  }

  return { translatedText: translatedLines.join('\n'), detectedLang };
}

// ============ ENGINE: MICROSOFT TRANSLATOR ============
async function translateWithMicrosoft(text, fromLang, toLang, onProgress) {
  const apiKey = getApiKey('microsoft');
  if (!apiKey) throw new Error('Chưa cấu hình API key cho Microsoft Translator. Vào Cài đặt API để thêm.');

  const axios = require('axios');
  const settings = loadSettings();
  const region = settings.MICROSOFT_REGION || 'southeastasia';
  const endpoint = 'https://api.cognitive.microsofttranslator.com/translate';

  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) return { translatedText: '', detectedLang: fromLang };

  const BATCH_SIZE = 25;
  const batches = [];
  for (let i = 0; i < lines.length; i += BATCH_SIZE) {
    batches.push(lines.slice(i, i + BATCH_SIZE));
  }

  const translatedLines = [];
  let detectedLang = fromLang;

  for (let i = 0; i < batches.length; i++) {
    const batchText = batches[i].join('\n');

    try {
      const params = { 'api-version': '3.0', to: toLang };
      if (fromLang && fromLang !== 'auto') params.from = fromLang;

      const response = await axios.post(
        endpoint,
        [{ Text: batchText }],
        {
          params,
          headers: {
            'Ocp-Apim-Subscription-Key': apiKey,
            'Ocp-Apim-Subscription-Region': region,
            'Content-Type': 'application/json',
          },
        }
      );

      const translated = response.data?.[0]?.translations?.[0]?.text || batchText;
      translatedLines.push(translated);

      if (i === 0 && response.data?.[0]?.detectedLanguage) {
        detectedLang = response.data[0].detectedLanguage.language;
      }

      const pct = Math.min(100, Math.round(((i + 1) / batches.length) * 100));
      if (onProgress) onProgress(pct, `[Microsoft] Đang dịch... ${pct}%`);
    } catch (err) {
      console.error(`Microsoft batch ${i + 1} failed:`, err.message);
      translatedLines.push(batchText);
    }

    if (i < batches.length - 1) await sleep(100);
  }

  return { translatedText: translatedLines.join('\n'), detectedLang };
}

// ============ MAIN TRANSLATE FUNCTION ============
const ENGINE_MAP = {
  google: translateWithGoogle,
  gemini: translateWithGemini,
  openai: translateWithOpenAI,
  deepl: translateWithDeepL,
  microsoft: translateWithMicrosoft,
};

async function translateText(text, fromLang, toLang, onProgress, engine = 'google') {
  const translateFn = ENGINE_MAP[engine];
  if (!translateFn) throw new Error(`Engine không hợp lệ: ${engine}`);
  return translateFn(text, fromLang, toLang, onProgress);
}

// ============ SRT/VTT TRANSLATION ============
async function translateSRT(srtContent, fromLang, toLang, onProgress, engine = 'google') {
  const content = srtContent.trim();
  const isVTT = content.startsWith('WEBVTT');

  // Parse subtitle blocks (separated by blank lines)
  const blocks = content.split(/\n\s*\n/);
  const textLines = [];
  const blockMap = [];

  const timestampPattern = /^\d{0,2}:?\d{2}[:.]\\d{2}[.,]\d{3}\s*-->\s*\d{0,2}:?\d{2}[:.]\\d{2}[.,]\d{3}/;
  // More robust timestamp pattern
  const tsRegex = /^\d{0,2}:?\d{2}[:.]\d{2}[.,]\d{3}\s*-->\s*\d{0,2}:?\d{2}[:.]\d{2}[.,]\d{3}/;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (!block) continue;
    if (i === 0 && block.startsWith('WEBVTT')) continue;

    const lines = block.split('\n');
    let timestampLineIdx = -1;
    for (let j = 0; j < Math.min(lines.length, 3); j++) {
      if (tsRegex.test(lines[j].trim())) {
        timestampLineIdx = j;
        break;
      }
    }

    if (timestampLineIdx === -1) continue;

    const textParts = lines.slice(timestampLineIdx + 1).join(' ').trim();
    if (textParts) {
      textLines.push(textParts);
      blockMap.push(i);
    }
  }

  if (textLines.length === 0) {
    console.log('translateSRT: No text lines found to translate.');
    return { translatedText: srtContent, detectedLang: fromLang };
  }

  console.log(`translateSRT: Found ${textLines.length} text lines (engine: ${engine}, format: ${isVTT ? 'WebVTT' : 'SRT'})`);

  // Translate all text lines using the selected engine
  const fullText = textLines.join('\n');
  const result = await translateText(fullText, fromLang, toLang, onProgress, engine);
  const translatedParts = result.translatedText.split('\n');

  // Rebuild subtitle with translated text
  let tIdx = 0;
  for (const blockIdx of blockMap) {
    const block = blocks[blockIdx].trim();
    const lines = block.split('\n');

    let timestampLineIdx = -1;
    for (let j = 0; j < Math.min(lines.length, 3); j++) {
      if (tsRegex.test(lines[j].trim())) {
        timestampLineIdx = j;
        break;
      }
    }

    if (timestampLineIdx !== -1 && tIdx < translatedParts.length) {
      const headerLines = lines.slice(0, timestampLineIdx + 1);
      blocks[blockIdx] = [...headerLines, translatedParts[tIdx]].join('\n');
      tIdx++;
    }
  }

  return {
    translatedText: blocks.join('\n\n'),
    detectedLang: result.detectedLang,
  };
}

// ============ UTILITIES ============
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Test an API key by making a minimal API call
 */
async function testApiKey(engine, apiKey) {
  try {
    switch (engine) {
      case 'gemini': {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent('Say "OK" in one word.');
        return { success: true, message: `✅ Gemini kết nối thành công` };
      }
      case 'openai': {
        const OpenAI = require('openai');
        const client = new OpenAI({ apiKey });
        await client.chat.completions.create({
          model: 'gpt-4.1-nano',
          messages: [{ role: 'user', content: 'Say OK' }],
          max_tokens: 5,
        });
        return { success: true, message: `✅ OpenAI kết nối thành công` };
      }
      case 'deepl': {
        const deepl = require('deepl-node');
        const translator = new deepl.Translator(apiKey);
        const usage = await translator.getUsage();
        const charUsed = usage.character?.count || 0;
        const charLimit = usage.character?.limit || 0;
        return { success: true, message: `✅ DeepL OK. Đã dùng: ${charUsed.toLocaleString()}/${charLimit.toLocaleString()} ký tự` };
      }
      case 'microsoft': {
        const axios = require('axios');
        const settings = loadSettings();
        const region = settings.MICROSOFT_REGION || 'southeastasia';
        await axios.post(
          'https://api.cognitive.microsofttranslator.com/translate',
          [{ Text: 'Hello' }],
          {
            params: { 'api-version': '3.0', to: 'vi' },
            headers: {
              'Ocp-Apim-Subscription-Key': apiKey,
              'Ocp-Apim-Subscription-Region': region,
              'Content-Type': 'application/json',
            },
          }
        );
        return { success: true, message: `✅ Microsoft Translator kết nối thành công` };
      }
      default:
        return { success: false, message: 'Engine không hợp lệ' };
    }
  } catch (err) {
    return { success: false, message: `❌ Lỗi: ${err.message}` };
  }
}

module.exports = {
  translateText,
  translateSRT,
  testApiKey,
  getApiKey,
  setApiKey,
  loadSettings,
  saveSettings,
  SUPPORTED_LANGUAGES,
  ENGINES,
};

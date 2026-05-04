"""
Video Subtitle Extractor - Transcription Script
Supports both faster-whisper and openai-whisper engines
With automatic fallback and error recovery
"""

import argparse
import sys
import os
import io
import traceback

# Force UTF-8 output to handle Vietnamese characters on Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if sys.stderr.encoding != 'utf-8':
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Add NVIDIA CUDA DLL paths so CTranslate2 can find cublas64_12.dll, cudnn, etc.
def _setup_cuda_paths():
    try:
        import importlib.util
        site_packages = os.path.dirname(importlib.util.find_spec("nvidia").submodule_search_locations[0])
        nvidia_dir = os.path.join(site_packages, "nvidia")
        if os.path.isdir(nvidia_dir):
            for sub in os.listdir(nvidia_dir):
                bin_dir = os.path.join(nvidia_dir, sub, "bin")
                lib_dir = os.path.join(nvidia_dir, sub, "lib")
                for d in [bin_dir, lib_dir]:
                    if os.path.isdir(d):
                        os.environ["PATH"] = d + os.pathsep + os.environ.get("PATH", "")
                        if hasattr(os, "add_dll_directory"):
                            os.add_dll_directory(d)
    except Exception:
        pass

_setup_cuda_paths()


def progress(msg):
    """Print a progress message with proper encoding"""
    try:
        print(f"PROGRESS:{msg}", flush=True)
    except Exception:
        print(f"PROGRESS:{msg.encode('ascii', 'replace').decode()}", flush=True)


def log_warn(msg):
    """Print warning to stderr"""
    try:
        print(f"WARNING: {msg}", file=sys.stderr, flush=True)
    except Exception:
        pass


def log_error(msg):
    """Print error to stderr"""
    try:
        print(f"ERROR: {msg}", file=sys.stderr, flush=True)
    except Exception:
        pass


def format_srt_time(seconds):
    """Convert seconds to SRT timestamp: HH:MM:SS,mmm"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def try_load_model(model_size):
    """Try to load faster-whisper model, with GPU -> CPU fallback"""
    from faster_whisper import WhisperModel

    # Try GPU first
    for device, compute_type in [("cuda", "float16"), ("cpu", "int8")]:
        try:
            progress(f"Loading model {model_size} on {device.upper()}...")
            model = WhisperModel(model_size, device=device, compute_type=compute_type)
            # Quick test: try a dummy transcription to verify GPU actually works
            if device == "cuda":
                import numpy as np
                dummy_audio = np.zeros(16000, dtype=np.float32)  # 1 second silence
                try:
                    list(model.transcribe(dummy_audio, language="vi", beam_size=1, vad_filter=False)[0])
                except Exception as e:
                    if "cublas" in str(e).lower() or "cuda" in str(e).lower():
                        log_warn(f"CUDA test failed: {e}")
                        progress("CUDA not working properly, switching to CPU...")
                        continue
                    # Other errors are OK (just bad audio)
            progress(f"Model loaded on {device.upper()}")
            return model, device
        except Exception as e:
            log_warn(f"{device.upper()} failed: {e}")
            if device == "cuda":
                progress("GPU not available, switching to CPU...")
                continue
            raise

    raise RuntimeError("Could not load model on any device")


def write_segments(segments, output_format, source='faster'):
    """
    Convert segments to either plain text or SRT format.
    source: 'faster' for faster-whisper segments, 'openai' for openai-whisper segments
    """
    lines = []
    srt_entries = []
    idx = 1
    total = len(segments) if isinstance(segments, list) else 0

    for i, segment in enumerate(segments):
        if source == 'faster':
            text = segment.text.strip()
            start = segment.start
            end = segment.end
        else:  # openai
            text = segment['text'].strip()
            start = segment['start']
            end = segment['end']

        if not text:
            continue

        lines.append(text)

        if output_format == 'srt':
            srt_start = format_srt_time(start)
            srt_end = format_srt_time(end)
            srt_entries.append(f"{idx}\n{srt_start} --> {srt_end}\n{text}\n")
            idx += 1

        if total > 0:
            progress_pct = min(100, int((i + 1) / total * 100))
            progress(f"Processing... {progress_pct}%")

    if output_format == 'srt':
        return '\n'.join(srt_entries)
    else:
        return '\n'.join(lines)


def transcribe_faster_whisper(input_path, output_path, model_size, output_format='txt'):
    """Transcribe using faster-whisper (CTranslate2-based, much faster)"""

    model, device = try_load_model(model_size)

    progress(f"Transcribing on {device.upper()}...")

    # Strategy: try multiple configs until one works
    configs = [
        {"beam_size": 5, "vad_filter": False},  # Most reliable first
        {"beam_size": 1, "vad_filter": False},   # Simplest fallback
    ]

    segments = None
    info = None

    for i, config in enumerate(configs):
        try:
            progress(f"Transcribing (config {i+1}/{len(configs)})...")
            result = model.transcribe(
                input_path,
                language="vi",
                **config
            )
            segments_iter, info = result
            # Force evaluation to catch errors
            segments = list(segments_iter)
            progress(f"Detected language: {info.language} ({info.language_probability:.1%})")
            break
        except Exception as e:
            log_warn(f"Config {i+1} failed: {e}")
            if i == len(configs) - 1:
                raise
            progress(f"Config {i+1} failed, trying next...")

    if segments is None:
        raise RuntimeError("All transcription configs failed")

    output_content = write_segments(segments, output_format, source='faster')

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(output_content)

    count = output_content.count('\n-->\n') if output_format == 'srt' else output_content.count('\n') + 1
    progress(f"Done! Extracted {count} segments.")


def transcribe_openai_whisper(input_path, output_path, model_size, output_format='txt'):
    """Transcribe using original openai-whisper"""
    import whisper

    progress(f"Loading model {model_size}...")

    model = whisper.load_model(model_size)

    progress("Transcribing...")

    result = model.transcribe(
        input_path,
        language="vi",
        verbose=False
    )

    output_content = write_segments(result['segments'], output_format, source='openai')

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(output_content)

    count = output_content.count('\n-->\n') if output_format == 'srt' else output_content.count('\n') + 1
    progress(f"Done! Extracted {count} segments.")


def main():
    parser = argparse.ArgumentParser(description='Transcribe video/audio to text')
    parser.add_argument('--input', required=True, help='Input video/audio file path')
    parser.add_argument('--output', required=True, help='Output text file path')
    parser.add_argument('--model', default='base', help='Whisper model size: tiny, base, small, medium, large-v3')
    parser.add_argument('--engine', default='faster-whisper', help='Engine: faster-whisper or openai-whisper')
    parser.add_argument('--format', default='txt', choices=['txt', 'srt'], help='Output format: txt (plain text) or srt (with timecodes)')

    args = parser.parse_args()

    if not os.path.exists(args.input):
        log_error(f"File not found: {args.input}")
        sys.exit(1)

    # Create output directory
    os.makedirs(os.path.dirname(args.output), exist_ok=True)

    # Try primary engine, fallback to other if fails
    try:
        if args.engine == 'faster-whisper':
            transcribe_faster_whisper(args.input, args.output, args.model, args.format)
        else:
            transcribe_openai_whisper(args.input, args.output, args.model, args.format)
    except Exception as e:
        log_error(f"{args.engine} failed: {str(e)}")
        progress(f"Engine {args.engine} failed, trying fallback...")

        # Try fallback engine
        try:
            if args.engine == 'faster-whisper':
                progress("Switching to openai-whisper...")
                transcribe_openai_whisper(args.input, args.output, args.model, args.format)
            else:
                progress("Switching to faster-whisper...")
                transcribe_faster_whisper(args.input, args.output, args.model, args.format)
        except Exception as e2:
            log_error(f"Both engines failed.\n  Primary: {str(e)}\n  Fallback: {str(e2)}")
            traceback.print_exc(file=sys.stderr)
            sys.exit(1)


if __name__ == '__main__':
    main()
    # Force clean exit to avoid CUDA cleanup errors causing non-zero exit code
    os._exit(0)

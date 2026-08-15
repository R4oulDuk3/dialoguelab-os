import argparse
import json
import os

import ctranslate2
from faster_whisper import WhisperModel


def load_model(model_name, model_root):
    has_cuda = ctranslate2.get_cuda_device_count() > 0
    if has_cuda:
        try:
            return WhisperModel(model_name, device="cuda", compute_type="float16", download_root=model_root)
        except Exception:
            # A detected NVIDIA device can still lack the matching CUDA/cuDNN runtime.
            # CPU int8 is the consumer-safe fallback and needs no system GPU packages.
            pass
    return WhisperModel(model_name, device="cpu", compute_type="int8", download_root=model_root)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prepare", action="store_true")
    parser.add_argument("--request")
    parser.add_argument("--model", required=True)
    parser.add_argument("--model-root", required=True)
    args = parser.parse_args()
    os.makedirs(args.model_root, exist_ok=True)
    model = load_model(args.model, args.model_root)
    if args.prepare:
        print(json.dumps({"ready": True, "model": args.model}))
        return
    if not args.request:
        raise ValueError("A transcription request file is required.")
    with open(args.request, "r", encoding="utf-8") as source:
        request = json.load(source)
    language = request.get("language") or None
    segments, info = model.transcribe(
        request["audioPath"],
        language=language,
        initial_prompt=request.get("text") or None,
        word_timestamps=True,
        vad_filter=False,
        condition_on_previous_text=False,
    )
    words = []
    transcript = []
    for segment in segments:
        transcript.append(segment.text)
        for word in segment.words or []:
            value = word.word.strip()
            if value:
                words.append({"text": value, "startSeconds": word.start, "endSeconds": word.end})
    print(json.dumps({
        "language": info.language,
        "text": "".join(transcript).strip(),
        "words": words,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()

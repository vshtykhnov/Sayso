import argparse
import json
import os
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-json", required=True)
    args = parser.parse_args()

    payload = json.loads(Path(args.input_json).read_text(encoding="utf-8-sig"))
    text = payload["text"]
    speaker = payload.get("speaker", "xenia")
    sample_rate = int(payload.get("sampleRate", 48000))
    output_file = payload["outputFile"]
    model_cache_dir = payload.get("modelCacheDir")

    if model_cache_dir:
        os.environ["TORCH_HOME"] = model_cache_dir

    from silero_tts.silero_tts import SileroTTS

    model = SileroTTS(
        model_id="v4_ru",
        language="ru",
        speaker=speaker,
        sample_rate=sample_rate,
        device="cpu",
        num_threads=4,
    )
    model.tts(text, output_file)

    print(json.dumps({"ok": True, "outputFile": output_file}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)

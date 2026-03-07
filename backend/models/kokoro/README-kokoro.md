# Kokoro ONNX Model Files

Download both files into this directory (`backend/models/kokoro/`):

## Model file

```bash
cd backend/models/kokoro
wget https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
```

## Voices file

```bash
wget https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
```

## Verify

After downloading, this directory should contain:
- `kokoro-v1.0.onnx`
- `voices-v1.0.bin`

Available voices: `af_heart`, `af_bella`, `af_nicole`, `af_sarah`, `af_sky`, `am_adam`, `am_michael`, etc.
Configure via `KOKORO_VOICE` in `backend/.env`.

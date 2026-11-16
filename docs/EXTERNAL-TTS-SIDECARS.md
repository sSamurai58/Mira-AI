# External TTS sidecars (F5 / Chatterbox / Cosy)

Desktop Electron can call optional Python engines for real voice cloning.
Android Capacitor does **not** run these sidecars.

## Speak order

`speakTokenPipeline`:

1. disk cache  
2. unit-stitch (≥75% coverage)  
3. external sidecars in order (`MIRA_TTS_SIDECAR`)  
4. per-chunk stitch (≥35%)  
5. Mira neural-mel pack  
6. renderer parametric / Web Speech fallback  

Default `MIRA_TTS_SIDECAR=auto` → **f5 → chatterbox → cosy**.

| Value | Engines |
|-------|---------|
| `auto` | f5, chatterbox, cosy |
| `f5` | F5-TTS only |
| `chatterbox` | Chatterbox only |
| `cosy` | CosyVoice only |
| `off` | no Python sidecars |

## F5-TTS (preferred quality / RU)

```bash
pip install f5-tts
# optional RU community ckpt — see F5 SHARED.md
export F5_PYTHON=python3
# optional: export F5_HOME=/path/with/mira_f5_infer.py
# optional: export F5_CKPT=... F5_VOCAB=... F5_DEVICE=cuda
```

Needs a **reference WAV** from the Voice Studio speaker pack (`sourceWav`).
Script: `electron/voiceStudio/tokens/mira_f5_infer.py` (also packed under `resources/voice-sidecars/`).

Upstream: https://github.com/SWivid/F5-TTS — note Emilia base weights may be **CC-BY-NC**.

## Chatterbox (Resemble)

```bash
pip install chatterbox-tts
export CHATTERBOX_PYTHON=python3
export CHATTERBOX_MODEL=multilingual   # or turbo | nano
# optional CHATTERBOX_HOME, CHATTERBOX_DEVICE
```

Multilingual V3 supports `language_id=ru`. Turbo/Nano are English-first and need `--ref`.
Upstream **retired Aug 2026** (archive MIT). Output may include PerTh watermark.

## CosyVoice

```bash
export COSYVOICE_HOME=/path/with/mira_cosy_infer.py
export COSYVOICE_PYTHON=python3
```

Stub until wired to a real Cosy install (`mira_cosy_infer.py`).

## UI

Voice Studio shows sidecar probe: `F5 on/off · CB on/off · Cosy on/off` and the active order.

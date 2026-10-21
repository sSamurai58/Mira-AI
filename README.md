# Mira — русская Mini-TTS с нуля

Учебный проект: **своя архитектура и свои веса**, без загрузки предобученных TTS.

Пайплайн: `текст → encoder/attention/decoder → mel → Griffin-Lim → WAV`.

## Установка

```bat
pip install -r requirements.txt
```

## Русские данные

### A) Common Voice RU

1. Скачай Russian: https://commonvoice.mozilla.org/ru/datasets  
2. Распакуй архив  
3. Подготовь ~1 час для CPU:

```bat
python scripts/prepare_common_voice_ru.py --cv-dir "ПУТЬ\к\cv-corpus-XX\ru" --out data/ru --max-hours 1
```

### B) Свой голос

Пары `0001.wav` + `0001.txt` в одной папке:

```bat
python scripts/prepare_own_voice.py --src raw_recordings --out data/ru
```

Итог: `data/ru/metadata.csv` и `data/ru/wavs/`.

## Обучение

```bat
python src/mira_tts/train.py --config configs/tts_ru_cpu.yaml
```

Чекпоинты пишутся в `checkpoints/`.

## Синтез

```bat
python src/mira_tts/synthesize.py --checkpoint checkpoints/latest.pt --text "привет мир" --out out.wav
```

## Важно

- На CPU сеть специально крошечная — иначе обучение неподъёмно.
- Griffin-Lim звучит «металлически»; нейро-вокодер — следующий шаг.
- Качество ≈ объём чистых русских пар (текст, аудио) и время обучения.
- Для голосового бота дальше: своя ASR → склейка с этой TTS.

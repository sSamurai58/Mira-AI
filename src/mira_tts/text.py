"""Токенизация русского текста на уровне символов."""

from __future__ import annotations

PAD = "<pad>"
BOS = "<bos>"
EOS = "<eos>"
UNK = "<unk>"

# Базовый алфавит для учебной модели (кириллица + пробел + частая пунктуация)
_CHARS = (
    "абвгдеёжзийклмнопрстуфхцчшщъыьэюя"
    "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ"
    "0123456789"
    " .,!?-:;"
)

VOCAB = [PAD, BOS, EOS, UNK] + list(_CHARS)
STOI = {ch: i for i, ch in enumerate(VOCAB)}
ITOS = {i: ch for ch, i in STOI.items()}

PAD_ID = STOI[PAD]
BOS_ID = STOI[BOS]
EOS_ID = STOI[EOS]
UNK_ID = STOI[UNK]


def normalize_text(text: str) -> str:
    text = text.strip().replace("\u00a0", " ")
    text = " ".join(text.split())
    return text


def encode(text: str, add_special: bool = True) -> list[int]:
    text = normalize_text(text)
    ids = [STOI.get(ch, UNK_ID) for ch in text]
    if add_special:
        ids = [BOS_ID] + ids + [EOS_ID]
    return ids


def decode(ids: list[int]) -> str:
    chars: list[str] = []
    for i in ids:
        if i in (PAD_ID, BOS_ID):
            continue
        if i == EOS_ID:
            break
        chars.append(ITOS.get(i, ""))
    return "".join(chars)


def vocab_size() -> int:
    return len(VOCAB)
# WhatsApp / Instagram bridge contract (0.1.11)

Mira does **not** embed unofficial WA/IG clients. Outbound send goes through an optional
HTTP bridge that you run yourself.

## Env

| Variable | Purpose |
|----------|---------|
| `WHATSAPP_BRIDGE_URL` | Base URL, e.g. `http://127.0.0.1:8787` |
| `INSTAGRAM_BRIDGE_URL` | Base URL for IG bridge |
| `MESSAGING_MODE` | `live` (call bridge) or `dry-run` (default without token/URL) |
| `MESSAGING_ENABLED` | `true` / `false` |

## HTTP contract

`POST {BRIDGE_URL}/send`

```json
{
  "chatId": "string",
  "text": "string",
  "replyTo": "string|null"
}
```

### Success response

```json
{ "ok": true, "externalId": "optional-message-id" }
```

### Failure

```json
{ "ok": false, "error": "human-readable" }
```

Non-2xx HTTP → Mira treats as failed send (confirm already accepted; user sees error).

## Smoke

```bash
# With bridge mock:
WHATSAPP_BRIDGE_URL=http://127.0.0.1:9 MESSAGING_MODE=live npm run p6:smoke
# Without URL → dry-run path (always OK in smoke)
npm run p6:smoke
```

Telegram remains the primary live messenger (Bot API). WA/IG stay bridge-or-dry-run.

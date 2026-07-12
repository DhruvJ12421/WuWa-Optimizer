# English OCR Fixture Protocol

## Status

No real game fixture corpus is committed yet. Therefore Tacet Lab does not claim the planned 95% field-accuracy target.

## Required corpus

Create anonymized fixtures under:

- `tests/fixtures/ocr/english-1080p/`
- `tests/fixtures/ocr/english-1440p/`

Each sample consists of an image and a same-name JSON sidecar:

```text
hooscamp-001.png
hooscamp-001.json
```

Sidecar shape:

```json
{
  "name": "Hooscamp",
  "cost": 1,
  "rarity": 5,
  "level": 25,
  "sonata": "Lingering Tunes",
  "mainStat": { "key": "atkPercent", "value": 18.0 },
  "subStats": [
    { "key": "critRate", "value": 6.3 }
  ]
}
```

## Capture rules

- Use the current English game UI with no overlays covering the detail panel.
- Include both fullscreen and borderless-window captures where possible.
- Include several UI scales, brightness levels, Echo costs, levels, Sonata sets, and five-substat cases.
- Remove UID, account name, chat, notifications, and unrelated personal information before committing.
- Keep the original resolution. Do not sharpen or pre-crop fixture screenshots manually.

## Acceptance rule

`src/scanner/accuracy.ts` counts identity, cost, rarity, level, Sonata, main stat, and each expected substat as individual fields. Corpus accuracy is total matched fields divided by total expected fields.

The 95% statement may be added only when:

- Both resolutions have at least 25 varied real samples.
- Combined exact field accuracy is at least 95%.
- No missing field is silently replaced with a high-confidence default.
- Low-confidence and failed fields remain editable in the review queue.

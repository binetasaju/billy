# Receipt test set

Real receipts with the right answers, to measure how well Billy reads bills.
Run from `mobile/`:

```bash
npm run eval:receipts                 # photo + OCR text (what the app does)
npm run eval:receipts -- --mode text  # OCR text only, to compare
npm run eval:receipts -- dosa-cafe    # just one receipt
```

## Adding a receipt (aim for 10–30, different restaurants and layouts)

For each receipt, use one name (e.g. `dosa-cafe`) for these files:

| File | What |
|---|---|
| `dosa-cafe.jpg` | The photo, as you'd take it in the app |
| `dosa-cafe.expected.json` | The right answer, typed from the paper receipt |
| `dosa-cafe.ocr.txt` | Optional. Scan it in the app and copy the `[MLKIT] OCR Text` lines from the Metro terminal |

`dosa-cafe.expected.json`:

```json
{
  "total": 590,
  "chargesTotal": 28.1,
  "items": [
    { "name": "Paneer Butter Masala", "amount": 320 },
    { "name": "Butter Naan", "amount": 120 }
  ]
}
```

- `amount` is the line amount (quantity × price), as printed.
- `chargesTotal` (optional) is every tax, service charge, discount and round-off added together (discounts negative). Leave it out for tax-inclusive bills or if unsure.
- An item counts as found when the amount matches exactly and at least half the words of the name match.

Receipts can contain personal details (names, phone numbers, card digits). Crop or cover them before committing, or keep the photos out of git.

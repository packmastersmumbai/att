# Extracting the 2025 training records

How the seed data in `src/training.js` and `src/mockdrill.js` was derived, so
anyone can re-derive it rather than trusting the transcription.

Source: `# TRAINING/TRAINING RECORD/2025 Training/`

## The training records (33 `.doc` files)

    python extract-training-records.py

Writes `training-extract.json`: header fields, the attendance roster where one
was typed, observations and actions, per file.

**`.doc` is legacy binary format.** `markitdown` does not support it and
`python-docx` reads only `.docx`. Word COM via `pywin32` is the working route,
which is why this needs Windows and a real Word install. `tb.Cell(r, c)` throws
on merged cells — catch it rather than assuming a rectangular table.

The attendance table is the one whose header row contains both `Name` and
`Sign`; names sit in columns 2 and 7 (two blocks side by side).

**Seven of the 33 records carry typed attendance — 57 rows, 14 people.** The
other 26 are blank and exist only as ink on the scans in `Scanned/`. An earlier
assumption that attendance was *never* digitised was wrong; it had not been
checked.

## The mock drill format (`.docx`)

    python read-drill-format.py "<path to the .docx>"

Reads `2025 Mock drill/# 2025 mock drill format NEW.docx` — the report layout
reproduced by `?page=mockdrill`.

## The four conducted drills (scanned PDFs)

These are images, so `pypdf` extracts nothing. Render and read them:

```python
import fitz                       # pymupdf, not pypdf
d = fitz.open(path)
d[0].get_pixmap(dpi=140).save('page.png')
```

The first-aid report names ANUJ PATHAK as site in-charge where the other three
name TARUN MISHRA, and one spill-control target date is handwritten `31|11|25`
— a date that does not exist. Both are transcribed as written / as the month
end, and noted in the seed comments.

## Matching names to employees

Exact match on case- and space-stripped names only. Do NOT loosen it:
`RAJNI` substring-matches `DHRUV RAJ NISHAD` on the employee sheet, and
`ASHOK PATOLE` in the records is `ASHOK POTALE` there. Eight of the fourteen
names match nothing; the seeder reports them rather than guessing.

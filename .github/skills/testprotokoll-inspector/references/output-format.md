# Output Format Reference

The extractor produces these artifacts under `.copilot-artifacts\testprotokoll-inspector\<document-name>\`:

| File | Purpose |
|---|---|
| `document.md` | Primary agent-readable view: metadata, error index, ordered paragraphs, tables, image refs, chart summaries |
| `document.json` | Full structured manifest including extractor metadata, body array, and error index |
| `errors.json` | **Primary defect lookup**: `1.3.5` -> title, status, qualifier, date, login, paragraph range, related image paths |
| `warnings` | Non-fatal extraction warnings included in `document.json`, command JSON output, and `document.md` |
| `images\*` | Binary image files extracted from `word/media/*`; raster (PNG/JPG) preferred over vector (EMF/WMF) |
| `charts\*.json` | Parsed Office chart data (series, categories, values) |
| `charts\*.xml` | Raw Office chart XML for debugging or deeper inspection |
| `.extracted-by-testprotokoll-inspector` | Safety marker — proves the directory was created by this tool |

## Recommended Agent Flow

1. Resolve the `.docx` path or inbox folder from the user request.
2. Run the bundled extractor from the skill directory immediately, usually with `--reuse-if-current`.
3. Do **not** search `.copilot-artifacts` before running the extractor. Missing artifacts are normal before the first run.
4. Do **not** inspect the application code before extraction for mixed requests like "analyze defect and fix code".
5. Use the output paths printed by the extractor.
6. If the user refers to a specific defect like `1.3.5`, **open `errors.json` first**. It is the direct lookup index — no guessing required.
7. Read `document.md` for the full protocol overview (error index, tables, paragraphs).
8. Open only the image files that are referenced by the relevant defect entry.
9. Use `document.json` only when structured traversal is more useful than the markdown view.
10. Use `charts\*.json` for Office chart data.

## Required No-Cache Behavior

Missing `.copilot-artifacts\testprotokoll-inspector\...` output is the normal trigger to create it now.

- Do not treat a missing cache as a reason to stop.
- Do not say the `.docx` cannot be processed in the current session.
- Run the bundled extractor first, then read the generated artifacts.

## Recommended Command Pattern

```powershell
python ".github\skills\testprotokoll-inspector\scripts\extract_docx.py" "<source>" --reuse-if-current
```

For inbox-style folders, use:

```powershell
python ".github\skills\testprotokoll-inspector\scripts\extract_docx.py" "J:\dev\docs\testprotokolle\inbox" --latest --reuse-if-current
```

If the repository path does not exist because the skill is globally installed, use the actual folder that contains the loaded `SKILL.md`.

## `errors.json` Structure

```json
{
  "1.3.5": {
    "protocol_id": "1.3.5",
    "title": "[offen] Fehler 5 – Favorit wird erst beim zweiten Mal gespeichert",
    "status": "offen",
    "error_number": 5,
    "qualifier": null,
    "section_prefix": "1.3",
    "short_title": "Favorit wird erst beim zweiten Mal gespeichert",
    "start_body_index": 123,
    "start_paragraph_index": 89,
    "end_body_index": 140,
    "date": "18.05.26",
    "login": "PAL1/0001/PAL",
    "images": ["images\\image-012.png", "images\\image-013.png"],
    "content_paragraphs": ["Beschreibungstext ...", "..."]
  }
}
```

## `document.json` — Extractor Metadata

```json
{
  "extractor": {
    "name": "testprotokoll-inspector",
    "version": "0.2.0"
  },
  "source": {
    "path": "J:\\dev\\docs\\testprotokolle\\inbox\\Testprotokoll-103429.docx",
    "modified_utc": "2026-05-21T17:51:30.401801+00:00"
  },
  "warnings": []
}
```

## Notes

- The `.extracted-by-testprotokoll-inspector` marker must be present before the extractor will overwrite the output directory. Without it the extractor aborts with a clear error message.
- Raster screenshot formats are preferred over EMF/WMF fallback images when both representations exist for the same visual occurrence.
- Images are extracted from body paragraphs, table cells, headers, and footers.
- Office charts are converted into text summaries and JSON when possible.
- If a document contains only image-based evidence, the extracted image files are the source of truth.
- For requests that combine QA analysis with implementation work, `errors.json` and the linked images should narrow the code search before repository exploration starts.

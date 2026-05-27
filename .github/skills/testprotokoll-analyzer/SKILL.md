---
name: testprotokoll-analyzer
description: "Extract and analyze German QA/QS Word test protocols (Testprotokoll, Testprotokolle, .docx) before code work. Use when the user wants to read or analyze a test report, explicitly says to use the testprotokoll-analyzer skill, fix code based on a QA/QS handover, compare defect IDs like 1.3.5 against their own notes, inspect screenshots or tables, or process documents from J:\\dev\\docs, J:\\dev\\docs\\inbox, or J:\\dev\\docs\\testprotokolle\\inbox."
argument-hint: "Pfad zur .docx Datei oder Ablageordner, z.B. J:\\dev\\docs\\testprotokolle\\inbox oder J:\\dev\\docs\\testprotokolle\\inbox\\Testprotokoll-103429.docx"
---

# testprotokoll-analyzer

Use this skill when QA or QS delivers a test protocol as a Word `.docx` and the agent must understand the content — defects, screenshots, tables, error IDs — without installing heavy dependencies.

## Critical Execution Rule

If the user asks about a `.docx` test protocol or a defect from it, **run the bundled extractor before any code exploration**.

- Missing `.copilot-artifacts\testprotokoll-analyzer\...` cache is **not** a blocker; it is the signal to run the extractor now.
- Do **not** start repository discovery, implementation planning, or defect fixing until `errors.json` or `document.md` exists for the target document.
- Do **not** claim that the `.docx` cannot be read directly in the current session while this skill is available; this skill exists specifically to make it readable.
- Prefer `--reuse-if-current` so repeated runs stay cheap and deterministic.
- If the user explicitly writes phrases like **"nutze dein Testprotokoll analyzer Skill"**, treat that as a direct instruction to execute this workflow immediately.

## Required Order

1. Resolve the target `.docx`.
2. Run `extract_docx.py` immediately.
3. Read `errors.json` first for concrete defect IDs like `1.3.5`; otherwise read `document.md`.
4. Open only the images referenced by the relevant defect entry.
5. If the user supplied their own notes per defect, compare those notes against the extracted defect entries before judging the implementation.
6. Only then inspect code or propose fixes.

## When the User Supplies Notes

If the prompt contains a list like `1.3.1: ...`, `1.3.2: ...`, treat those lines as **user hypotheses or triage notes**, not as final truth.

For each referenced defect ID:

1. Look up the defect in `errors.json`.
2. Compare the extracted title, description, date, login, tables, and screenshots with the user's note.
3. Classify the result into one of these buckets:
   - **passt / kein Change empfohlen**
   - **prüfen im Code**
   - **mit FEK abstimmen**
   - **Ticket für Ausbaustufe**
   - **klarer Umsetzungsbedarf**
4. Only after that move into code analysis for the defects that are still open.

Do **not** skip directly from user notes into code reasoning without checking the protocol artifacts.

## Fast Path Commands

Direct file path:

```powershell
python "C:\Users\vincent_m\.copilot\skills\testprotokoll-analyzer\scripts\extract_docx.py" "J:\dev\docs\Testprotokoll-103429.docx" --reuse-if-current
```

Latest dropped file in the canonical inbox:

```powershell
python "C:\Users\vincent_m\.copilot\skills\testprotokoll-analyzer\scripts\extract_docx.py" "J:\dev\docs\testprotokolle\inbox" --latest --reuse-if-current
```

Latest dropped file in a legacy inbox layout:

```powershell
python "C:\Users\vincent_m\.copilot\skills\testprotokoll-analyzer\scripts\extract_docx.py" "J:\dev\docs\inbox" --latest --reuse-if-current
```

## Recommended Folder Layout

```text
J:\dev\docs\
  testprotokolle\
    inbox\
      <original>.docx          <- QS drops files here
    archive\
      <protocol-id>\
        <original>.docx

  .copilot-artifacts\
    testprotokoll-analyzer\
      <document-name>\
        document.md             <- primary agent-readable view
        document.json           <- structured manifest
        errors.json             <- direct defect index (1.3.5 -> block + images)
        images\                 <- extracted screenshots and graphics
        charts\                 <- Office chart data
        .extracted-by-testprotokoll-analyzer   <- safety marker
```

Originals stay in `testprotokolle\inbox` or `testprotokolle\archive\<protocol-id>`.
Artifacts under `.copilot-artifacts\` are a **cache** — never the source of truth.

## Goal

Transform the `.docx` into agent-friendly artifacts:

- `document.md` — paragraphs, tables, image references, chart summaries, and error index in reading order
- `document.json` — full structured manifest with extractor metadata
- `errors.json` — **primary defect index**: `1.3.5` maps directly to title, status, date, login, body range, related images
- `images\` — extracted screenshots and graphics (raster PNG/JPG preferred over EMF/WMF)
- `charts\` — raw chart XML and parsed JSON when Office charts are embedded

## Procedure

1. Resolve the source document.
   - If the user provided a `.docx` path, use it directly.
   - If the user provided a folder such as `J:\dev\docs`, `J:\dev\docs\inbox`, or `J:\dev\docs\testprotokolle\inbox`, treat that as a handover location and run the extractor there immediately. Use `--latest` when the user refers to "the dropped document", "latest", or an inbox-style folder.
   - If artifacts are missing, do not investigate code first. Extract first.
2. Run the extractor immediately. Prefer `--reuse-if-current` unless the user explicitly wants a full refresh:

   ```powershell
   python "C:\Users\vincent_m\.copilot\skills\testprotokoll-analyzer\scripts\extract_docx.py" "J:\dev\docs\testprotokolle\inbox\Testprotokoll-103429.docx" --reuse-if-current
   ```

   Override artifact root if the auto-detection picks the wrong directory:

   ```powershell
   python "C:\Users\vincent_m\.copilot\skills\testprotokoll-analyzer\scripts\extract_docx.py" "...\Testprotokoll.docx" --artifact-root "J:\dev\docs" --reuse-if-current
   ```

3. Confirm the output paths from the extractor result and use those files as the source of truth for the session.
4. **Read `errors.json` first** if the user references a specific defect ID like `1.3.5`. Jump directly to the relevant block, date, login, and linked images.
5. Read `document.md` for a full document overview or to answer questions about the whole protocol.
6. Open specific images from `images\` only when the defect evidence cannot be understood from text alone.
7. If the prompt includes the user's own notes per defect, create a per-defect comparison of **protocol evidence vs. user note vs. recommendation**.
8. Use `charts\` and `document.json` only for structured traversal or chart data.
9. Proceed with defect analysis, root-cause investigation, or implementation fix.

## Output Location

Default artifact path:

```text
<docs-root>\.copilot-artifacts\testprotokoll-analyzer\<document-name>\
```

The docs-root is auto-detected by walking up from the docx parent, skipping transient folder names (`inbox`, `archive`, `testprotokolle`, etc.) until a stable anchor is found or an existing `.copilot-artifacts` directory is located.

Example for `J:\dev\docs\testprotokolle\inbox\Testprotokoll-103429.docx`:

```text
J:\dev\docs\.copilot-artifacts\testprotokoll-analyzer\Testprotokoll-103429\
```

Override priority:

1. `--output <path>` — absolute output directory, used as-is
2. `--artifact-root <path>` — artifacts go under `<root>\.copilot-artifacts\testprotokoll-analyzer\<name>\`
3. `TESTPROTOKOLL_ARTIFACT_ROOT` environment variable — same pattern as above
4. Auto-detected root (default)

## Behavior Rules

- Artifacts are a **read cache**. Re-run the extractor when the `.docx` changes.
- `--reuse-if-current` skips extraction if the artifact set matches the current `.docx` (path, mtime, image completeness).
- For mixed requests like "analyze Fehler 1.3.5 and fix gwsys95", the test protocol comes first, code exploration second.
- For prompts that include a block of notes for many defect IDs, work defect-by-defect from the extracted protocol, not from memory and not from the note block alone.
- When no artifact cache exists yet, the correct next action is to run the extractor, not to explain the limitation.
- The extractor **never deletes** a directory it did not create. A missing `.extracted-by-testprotokoll-analyzer` marker causes an immediate, clear error.
- **Do not install dependencies silently.** This workflow uses only the Python standard library.
- Fallbacks (Mammoth, Word COM automation) require explicit user approval before use.

## Expected Output for Multi-Defect Requests

When the user gives many IDs plus notes, the preferred answer shape is a compact defect-by-defect assessment.

Per defect, cover:

- defect ID
- extracted title / evidence summary
- whether the user note seems consistent with the protocol
- recommended action for the target system (for example `kein Change`, `Code prüfen`, `FEK abstimmen`, `Ticket`, `umsetzen`)

Only after this assessment should the agent summarize what should be done in the target codebase such as `gwsys95`.

## Example: Note-Driven Analysis Request

User request:

> Bitte nutze dein Testprotokoll analyzer Skill um das Testprotokoll `J:\dev\docs\inbox\Testprotokoll-103429.docx` zu analysieren.  
> Folgende Notizen habe ich mir gemacht:  
> `1.3.1: ...`  
> `1.3.2: ...`  
> `...`  
> Bitte analysiere diese und schaue, was wir hier machen könnten / sollten im gwsys95.

Correct behavior:

1. Run the extractor with `--reuse-if-current`.
2. Read `errors.json` and use the protocol entries as the baseline.
3. Compare each user note against the extracted defect.
4. Identify which items are already acceptable, which need FEK alignment, and which require code inspection.
5. Only then derive gwsys95 recommendations.

## Example: Combined QA + Code Task

User request:

> Analysiere Fehler 1.3.5 aus `J:\dev\docs\Testprotokoll-103429.docx` und behebe ihn in gwsys95.

Correct behavior:

1. Run the extractor with `--reuse-if-current`.
2. Read `errors.json` entry `1.3.5`.
3. Read only the referenced screenshots and relevant paragraphs.
4. Then inspect `gwsys95` code paths that match the extracted defect description.

Incorrect behavior:

- Scanning the codebase before extraction
- Treating a missing artifact cache as a blocker
- Saying the `.docx` cannot be used in the current session

## Fidelity Strategy

1. **Default**: bundled stdlib extractor — DrawingML (`r:embed`/`r:link`), legacy VML (`v:imagedata`), headers/footers, raster-over-vector selection.
2. **Gap detection**: if `images: 0` despite visible screenshots, or text boxes/callouts are missing, escalate.
3. **Escalation** (approval required):
   - **Mammoth** — images + text boxes, adds `pip install mammoth` dependency
   - **Word COM automation** — highest fidelity on Windows when Microsoft Word is installed

## Bundled Resources

- [DOCX extractor](./scripts/extract_docx.py)
- [Output format reference](./references/output-format.md)

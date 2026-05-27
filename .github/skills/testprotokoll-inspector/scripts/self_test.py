#!/usr/bin/env python3
"""Self-test for the bundled testprotokoll DOCX extractor.

Creates temporary DOCX fixtures with the Python standard library and verifies
the production-critical extraction contract.
"""
from __future__ import annotations

import base64
import json
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
EXTRACTOR = SCRIPT_DIR / "extract_docx.py"

PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6X"
    "qZ2sAAAAASUVORK5CYII="
)


def write_docx(path: Path, *, include_error: bool, include_image: bool) -> None:
    content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>"""
    root_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""
    image_rel = (
        '<Relationship Id="rIdImage1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" '
        'Target="media/image1.png"/>'
        if include_image
        else ""
    )
    doc_rels = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{image_rel}</Relationships>"""
    core = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Fixture</dc:title><dc:creator>Codex</dc:creator></cp:coreProperties>"""
    app = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Fixture</Application></Properties>"""
    image_paragraph = (
        """<w:p><w:r><w:drawing><wp:inline>
<wp:docPr id="1" name="Screenshot" descr="Evidence screenshot"/>
<a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rIdImage1"/></pic:blipFill></pic:pic></a:graphicData></a:graphic>
</wp:inline></w:drawing></w:r></w:p>"""
        if include_image
        else ""
    )
    error_block = (
        """<w:p><w:r><w:t>1.3 Fehler</w:t></w:r></w:p>
<w:p><w:r><w:t>[offen] Fehler 5 – Favorit wird erst beim zweiten Mal gespeichert</w:t></w:r></w:p>
<w:p><w:r><w:t>Festgestellt am: 18.05.26</w:t></w:r></w:p>
<w:p><w:r><w:t>Angemeldet mit: PAL1/0001/PAL</w:t></w:r></w:p>
<w:p><w:r><w:t>Beschreibungstext</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Spalte A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Spalte B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>"""
        if include_error
        else '<w:p><w:r><w:t>Testprotokoll ohne bekannte Fehlerüberschrift</w:t></w:r></w:p>'
    )
    document = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<w:body>{error_block}{image_paragraph}<w:sectPr/></w:body></w:document>"""

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", root_rels)
        archive.writestr("word/_rels/document.xml.rels", doc_rels)
        archive.writestr("word/document.xml", document)
        archive.writestr("docProps/core.xml", core)
        archive.writestr("docProps/app.xml", app)
        if include_image:
            archive.writestr("word/media/image1.png", PNG_1X1)


def run_extractor(source: Path, output: Path) -> dict[str, object]:
    completed = subprocess.run(
        [sys.executable, str(EXTRACTOR), str(source), "--output", str(output), "--reuse-if-current"],
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise AssertionError(f"extractor failed: {completed.stderr}")
    return json.loads(completed.stdout)


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> int:
    workspace = Path(tempfile.mkdtemp(prefix="testprotokoll-inspector-"))
    try:
        docx = workspace / "Testprotokoll-Minimal.docx"
        output = workspace / "out"
        write_docx(docx, include_error=True, include_image=True)

        first = run_extractor(docx, output)
        second = run_extractor(docx, output)
        errors = json.loads((output / "errors.json").read_text(encoding="utf-8"))

        assert_true(first["ok"] is True and first["reused"] is False, "first extraction should run")
        assert_true(second["ok"] is True and second["reused"] is True, "second extraction should reuse")
        assert_true("1.3.5" in errors, "expected defect 1.3.5 in errors.json")
        assert_true(errors["1.3.5"]["date"] == "18.05.26", "expected parsed date")
        assert_true(errors["1.3.5"]["login"] == "PAL1/0001/PAL", "expected parsed login")
        assert_true(errors["1.3.5"]["images"], "expected image linked to defect")
        assert_true((output / errors["1.3.5"]["images"][0]).exists(), "expected extracted image file")
        assert_true("Spalte A | Spalte B" in errors["1.3.5"]["content_paragraphs"], "expected table content")

        no_error_docx = workspace / "Testprotokoll-Unknown.docx"
        no_error_output = workspace / "out-no-error"
        write_docx(no_error_docx, include_error=False, include_image=False)
        no_error = run_extractor(no_error_docx, no_error_output)
        assert_true(no_error["counts"]["errors"] == 0, "expected no indexed errors")
        assert_true(no_error["warnings"], "expected warning when no errors are indexed")

    finally:
        shutil.rmtree(workspace, ignore_errors=True)

    print("self-test passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())

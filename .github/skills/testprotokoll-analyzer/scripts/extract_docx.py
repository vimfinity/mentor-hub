#!/usr/bin/env python3
"""testprotokoll-analyzer -- DOCX extractor for German QA/QS test protocols.

Extracts body text, tables, headers, footers, embedded images (DrawingML + VML),
and Office charts from a Word .docx file into agent-friendly artifacts.
"""
from __future__ import annotations

import argparse
import json
import os
import posixpath
import re
import shutil
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path
import xml.etree.ElementTree as ET

EXTRACTOR_NAME = "testprotokoll-analyzer"
EXTRACTOR_VERSION = "0.2.0"
MARKER_FILENAME = ".extracted-by-testprotokoll-analyzer"

TRANSIENT_FOLDER_NAMES = {
    "inbox", "eingang", "archive", "archiv",
    "testprotokolle", "protokolle", "protocols",
}

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
    "c": "http://schemas.openxmlformats.org/drawingml/2006/chart",
    "pic": "http://schemas.openxmlformats.org/drawingml/2006/picture",
    "cp": "http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
    "dc": "http://purl.org/dc/elements/1.1/",
    "dcterms": "http://purl.org/dc/terms/",
    "ep": "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties",
    "v": "urn:schemas-microsoft-com:vml",
    "o": "urn:schemas-microsoft-com:office:office",
    "mc": "http://schemas.openxmlformats.org/markup-compatibility/2006",
}

PKG_REL_NS = {"pr": "http://schemas.openxmlformats.org/package/2006/relationships"}
W_VAL = f"{{{NS['w']}}}val"
R_ID = f"{{{NS['r']}}}id"
R_EMBED = f"{{{NS['r']}}}embed"
R_LINK = f"{{{NS['r']}}}link"
O_RELID = f"{{{NS['o']}}}relid"

PREFERRED_RASTER_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff", ".webp"}
SECONDARY_IMAGE_EXTENSIONS = {".svg"}
FALLBACK_VECTOR_EXTENSIONS = {".emf", ".wmf"}


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    text = value.replace("\r", "").replace("\xa0", " ").replace("\u00ad", "")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def text_or_none(value: str | None) -> str | None:
    text = normalize_text(value)
    return text or None


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def slugify(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("._")
    return value or "document"


def looks_like_heading(style_id: str | None) -> int | None:
    if not style_id:
        return None
    lowered = style_id.lower()
    match = re.search(r"(\d+)$", lowered)
    if "heading" in lowered and match:
        return int(match.group(1))
    if "berschrift" in lowered and match:  # covers Uberschrift, uberschrift, Ueberschrift
        return int(match.group(1))
    if lowered in {"title", "titel"}:
        return 1
    return None


def safe_float(value: str | None) -> float | str | None:
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return text


def image_extension_priority(path: str) -> int:
    extension = Path(path).suffix.lower()
    if extension in PREFERRED_RASTER_EXTENSIONS:
        return 3
    if extension in SECONDARY_IMAGE_EXTENSIONS:
        return 2
    if extension in FALLBACK_VECTOR_EXTENSIONS:
        return 1
    return 0


def _find_artifact_root(docx_path: Path) -> Path:
    """Walk up from the docx parent to find the best anchor for .copilot-artifacts.

    First pass: look for an existing .copilot-artifacts directory.
    Second pass: skip transient folder names (inbox, archive, testprotokolle, ...).
    Fallback: docx parent directory.
    """
    current = docx_path.parent
    for _ in range(6):
        if (current / ".copilot-artifacts").exists():
            return current
        parent = current.parent
        if parent == current:
            break
        current = parent

    current = docx_path.parent
    for _ in range(5):
        if current.name.lower() not in TRANSIENT_FOLDER_NAMES:
            return current
        parent = current.parent
        if parent == current:
            break
        current = parent

    return docx_path.parent


def build_output_dir(
    docx_path: Path,
    explicit_output: Path | None,
    artifact_root: Path | None,
) -> Path:
    """Resolve artifact output directory following the priority chain:
    1. --output  2. --artifact-root  3. TESTPROTOKOLL_ARTIFACT_ROOT  4. auto-detect
    """
    if explicit_output is not None:
        return explicit_output

    doc_name = slugify(docx_path.stem)

    if artifact_root is not None:
        return artifact_root / ".copilot-artifacts" / EXTRACTOR_NAME / doc_name

    env_root = os.environ.get("TESTPROTOKOLL_ARTIFACT_ROOT")
    if env_root:
        return Path(env_root) / ".copilot-artifacts" / EXTRACTOR_NAME / doc_name

    detected_root = _find_artifact_root(docx_path)
    return detected_root / ".copilot-artifacts" / EXTRACTOR_NAME / doc_name


def should_reuse_artifacts(output_dir: Path, docx_path: Path) -> bool:
    """Return True if existing artifacts are up to date and all referenced images exist."""
    doc_json = output_dir / "document.json"
    errors_json = output_dir / "errors.json"
    marker = output_dir / MARKER_FILENAME

    if not (doc_json.exists() and errors_json.exists() and marker.exists()):
        return False

    try:
        manifest = json.loads(doc_json.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return False

    source_info = manifest.get("source", {})
    if source_info.get("path") != str(docx_path):
        return False

    current_mtime = datetime.fromtimestamp(
        docx_path.stat().st_mtime, tz=timezone.utc
    ).isoformat()
    if source_info.get("modified_utc") != current_mtime:
        return False

    try:
        errors_data = json.loads(errors_json.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return False

    for error in errors_data.values():
        for img_rel_path in error.get("images") or []:
            if not (output_dir / img_rel_path).exists():
                return False

    return True


def resolve_source(source: Path, use_latest: bool) -> Path:
    if not source.exists():
        raise FileNotFoundError(f"Source path does not exist: {source}")

    if source.is_file():
        if source.suffix.lower() != ".docx":
            raise ValueError(f"Source file is not a .docx document: {source}")
        return source

    candidates = sorted(
        (
            path
            for path in source.iterdir()
            if path.is_file()
            and path.suffix.lower() == ".docx"
            and not path.name.startswith("~$")
        ),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    )

    if not candidates:
        raise FileNotFoundError(f"No .docx files found in directory: {source}")

    if len(candidates) == 1:
        return candidates[0]

    if use_latest:
        return candidates[0]

    names = "\n".join(f"- {c.name}" for c in candidates[:20])
    raise ValueError(
        "Multiple .docx files found. Provide a file path or rerun with --latest.\n" + names
    )


class DocxExtractor:
    def __init__(self, docx_path: Path, output_dir: Path) -> None:
        self.docx_path = docx_path
        self.output_dir = output_dir
        self.archive: zipfile.ZipFile | None = None
        self.exported_binaries: dict[str, dict[str, str]] = {}
        self.exported_charts: dict[str, dict[str, object]] = {}
        self.image_occurrence_count = 0
        self.chart_occurrence_count = 0
        self.paragraph_count = 0
        self.table_count = 0

    def extract(self) -> dict[str, object]:
        if self.output_dir.exists():
            marker = self.output_dir / MARKER_FILENAME
            if not marker.exists():
                raise ValueError(
                    f"Output directory already exists and was not created by {EXTRACTOR_NAME}:\n"
                    f"  {self.output_dir}\n"
                    "Remove it manually or choose a different path with --output."
                )
            shutil.rmtree(self.output_dir)

        (self.output_dir / "images").mkdir(parents=True, exist_ok=True)
        (self.output_dir / "charts").mkdir(parents=True, exist_ok=True)

        with zipfile.ZipFile(self.docx_path) as archive:
            self.archive = archive
            metadata = self.read_metadata()
            headers = self.read_text_parts("word/header", "header")
            footers = self.read_text_parts("word/footer", "footer")
            body_items = self.parse_document_body()
            error_index = self.build_error_index(body_items)

        manifest: dict[str, object] = {
            "extractor": {
                "name": EXTRACTOR_NAME,
                "version": EXTRACTOR_VERSION,
            },
            "source": {
                "path": str(self.docx_path),
                "name": self.docx_path.name,
                "size_bytes": self.docx_path.stat().st_size,
                "modified_utc": datetime.fromtimestamp(
                    self.docx_path.stat().st_mtime, tz=timezone.utc
                ).isoformat(),
            },
            "generated_utc": datetime.now(tz=timezone.utc).isoformat(),
            "output_dir": str(self.output_dir),
            "metadata": metadata,
            "headers": headers,
            "footers": footers,
            "body": body_items,
            "errors": error_index,
            "counts": {
                "paragraphs": self.paragraph_count,
                "tables": self.table_count,
                "images": self.image_occurrence_count,
                "charts": self.chart_occurrence_count,
                "errors": len(error_index),
            },
        }

        self.write_output_files(manifest)
        (self.output_dir / MARKER_FILENAME).write_text(
            f"Generated by {EXTRACTOR_NAME} v{EXTRACTOR_VERSION}\n"
            f"Source: {self.docx_path}\n"
            f"Generated: {manifest['generated_utc']}\n",
            encoding="utf-8",
        )
        return manifest

    def archive_names(self) -> set[str]:
        if self.archive is None:
            return set()
        return set(self.archive.namelist())

    def read_xml(self, part_name: str) -> ET.Element | None:
        if self.archive is None or part_name not in self.archive_names():
            return None
        raw = self.archive.read(part_name)
        return ET.fromstring(raw)

    def load_relationships(self, part_name: str) -> dict[str, dict[str, str]]:
        if self.archive is None:
            return {}
        folder = posixpath.dirname(part_name)
        file_name = posixpath.basename(part_name)
        rel_name = posixpath.join(folder, "_rels", f"{file_name}.rels")
        root = self.read_xml(rel_name)
        if root is None:
            return {}
        relationships: dict[str, dict[str, str]] = {}
        for rel in root.findall("pr:Relationship", PKG_REL_NS):
            rel_id = rel.attrib.get("Id")
            target = rel.attrib.get("Target")
            target_mode = rel.attrib.get("TargetMode")
            rel_type = rel.attrib.get("Type")
            if not rel_id or not target or target_mode == "External":
                continue
            relationships[rel_id] = {
                "target": self.resolve_part_target(part_name, target),
                "type": rel_type or "",
            }
        return relationships

    def resolve_part_target(self, source_part: str, target: str) -> str:
        if target.startswith("/"):
            return target.lstrip("/")
        return posixpath.normpath(posixpath.join(posixpath.dirname(source_part), target))

    def read_metadata(self) -> dict[str, object]:
        metadata: dict[str, object] = {}

        core = self.read_xml("docProps/core.xml")
        if core is not None:
            metadata["title"] = text_or_none(core.findtext("dc:title", default="", namespaces=NS))
            metadata["subject"] = text_or_none(core.findtext("dc:subject", default="", namespaces=NS))
            metadata["creator"] = text_or_none(core.findtext("dc:creator", default="", namespaces=NS))
            metadata["description"] = text_or_none(
                core.findtext("dc:description", default="", namespaces=NS)
            )
            metadata["keywords"] = text_or_none(
                core.findtext("cp:keywords", default="", namespaces=NS)
            )
            metadata["created"] = text_or_none(
                core.findtext("dcterms:created", default="", namespaces=NS)
            )
            metadata["modified"] = text_or_none(
                core.findtext("dcterms:modified", default="", namespaces=NS)
            )

        app = self.read_xml("docProps/app.xml")
        if app is not None:
            metadata["application"] = text_or_none(
                app.findtext("ep:Application", default="", namespaces=NS)
            )
            metadata["pages"] = text_or_none(app.findtext("ep:Pages", default="", namespaces=NS))
            metadata["words"] = text_or_none(app.findtext("ep:Words", default="", namespaces=NS))

        return {key: value for key, value in metadata.items() if value not in (None, "")}

    def read_text_parts(self, prefix: str, label: str) -> list[dict[str, object]]:
        names = sorted(
            name
            for name in self.archive_names()
            if name.startswith(prefix) and name.endswith(".xml")
        )
        parts: list[dict[str, object]] = []
        for name in names:
            root = self.read_xml(name)
            if root is None:
                continue
            relationships = self.load_relationships(name)
            lines = []
            for paragraph in root.findall(".//w:p", NS):
                text = self.extract_paragraph_text(paragraph)
                if text:
                    lines.append(text)
            combined_text = "\n".join(lines)
            images = self.extract_images_from_container(
                root,
                relationships,
                container_text=combined_text,
                location={"section": label, "part": name},
            )
            charts = self.extract_charts_from_container(
                root,
                relationships,
                container_text=combined_text,
                location={"section": label, "part": name},
            )
            if lines or images or charts:
                parts.append(
                    {
                        "kind": label,
                        "part": name,
                        "text": combined_text,
                        "images": images,
                        "charts": charts,
                    }
                )
        return parts

    def parse_document_body(self) -> list[dict[str, object]]:
        root = self.read_xml("word/document.xml")
        if root is None:
            raise ValueError("The DOCX package does not contain word/document.xml")

        body = root.find("w:body", NS)
        if body is None:
            return []

        rels = self.load_relationships("word/document.xml")
        items: list[dict[str, object]] = []

        for child in list(body):
            tag = local_name(child.tag)
            if tag == "p":
                item = self.parse_paragraph(child, rels)
                if item:
                    items.append(item)
            elif tag == "tbl":
                items.append(self.parse_table(child, rels))

        return items

    def parse_paragraph(
        self,
        paragraph: ET.Element,
        relationships: dict[str, dict[str, str]],
    ) -> dict[str, object] | None:
        text = self.extract_paragraph_text(paragraph)
        style_node = paragraph.find("w:pPr/w:pStyle", NS)
        style_id = style_node.attrib.get(W_VAL) if style_node is not None else None
        heading_level = looks_like_heading(style_id)
        is_list_item = paragraph.find("w:pPr/w:numPr", NS) is not None

        if is_list_item and text and not text.startswith(("- ", "* ")):
            text = f"- {text}"

        paragraph_index = self.paragraph_count + 1
        images = self.extract_images_from_container(
            paragraph,
            relationships,
            container_text=text,
            location={"section": "body", "paragraph": paragraph_index},
        )
        charts = self.extract_charts_from_container(
            paragraph,
            relationships,
            container_text=text,
            location={"section": "body", "paragraph": paragraph_index},
        )

        if not text and not images and not charts:
            return None

        self.paragraph_count = paragraph_index

        return {
            "kind": "paragraph",
            "index": paragraph_index,
            "style": style_id,
            "heading_level": heading_level,
            "is_list_item": is_list_item,
            "text": text_or_none(text),
            "images": images,
            "charts": charts,
        }

    def parse_table(
        self,
        table: ET.Element,
        relationships: dict[str, dict[str, str]],
    ) -> dict[str, object]:
        self.table_count += 1
        table_index = self.table_count
        rows: list[list[str]] = []
        images: list[dict[str, object]] = []
        charts: list[dict[str, object]] = []

        for row_index, row in enumerate(table.findall("w:tr", NS), start=1):
            row_cells: list[str] = []
            for column_index, cell in enumerate(row.findall("w:tc", NS), start=1):
                paragraphs = [self.extract_paragraph_text(p) for p in cell.findall(".//w:p", NS)]
                cell_text = "\n".join(t for t in paragraphs if t)
                row_cells.append(cell_text)
                location = {
                    "section": "body",
                    "table": table_index,
                    "row": row_index,
                    "column": column_index,
                }
                cell_images = self.extract_images_from_container(
                    cell, relationships, container_text=cell_text, location=location
                )
                cell_charts = self.extract_charts_from_container(
                    cell, relationships, container_text=cell_text, location=location
                )
                images.extend(cell_images)
                charts.extend(cell_charts)
            rows.append(row_cells)

        column_count = max((len(row) for row in rows), default=0)
        normalized_rows = [row + [""] * (column_count - len(row)) for row in rows]

        return {
            "kind": "table",
            "index": table_index,
            "row_count": len(normalized_rows),
            "column_count": column_count,
            "rows": normalized_rows,
            "images": images,
            "charts": charts,
        }

    def extract_paragraph_text(self, paragraph: ET.Element) -> str:
        parts: list[str] = []
        for node in paragraph.iter():
            name = local_name(node.tag)
            if name == "t" and node.text:
                parts.append(node.text)
            elif name == "tab":
                parts.append("\t")
            elif name in {"br", "cr"}:
                parts.append("\n")
        return normalize_text("".join(parts))

    def extract_images_from_container(
        self,
        container: ET.Element,
        relationships: dict[str, dict[str, str]],
        container_text: str | None,
        location: dict[str, object],
    ) -> list[dict[str, object]]:
        images: list[dict[str, object]] = []
        seen_targets: set[str] = set()

        def append_image_candidates(
            candidates: list[dict[str, str | None]],
            fallback_name: str | None,
            fallback_title: str | None,
            fallback_desc: str | None,
        ) -> None:
            if not candidates:
                return

            valid = []
            for c in candidates:
                target = c.get("target")
                rtype = c.get("relation_type")
                if not target:
                    continue
                if rtype and not rtype.endswith("/image") and not target.startswith("word/media/"):
                    continue
                valid.append(c)

            if not valid:
                return

            best = max(image_extension_priority(str(c["target"])) for c in valid if c.get("target"))
            selected = (
                [c for c in valid if c.get("target") and image_extension_priority(str(c["target"])) == best]
                if best > 0
                else valid
            )

            for c in selected:
                target = str(c["target"])
                if target in seen_targets:
                    continue
                export_info = self.export_binary_part(target, "images", "image")
                self.image_occurrence_count += 1
                images.append(
                    {
                        "index": self.image_occurrence_count,
                        "relative_path": export_info["relative_path"],
                        "output_path": export_info["output_path"],
                        "source_part": target,
                        "name": text_or_none(c.get("name") or fallback_name),
                        "title": text_or_none(c.get("title") or fallback_title),
                        "description": text_or_none(c.get("description") or fallback_desc),
                        "container_text": text_or_none(container_text),
                        "location": location,
                    }
                )
                seen_targets.add(target)

        # DrawingML (inline and floating)
        for drawing in container.findall(".//w:drawing", NS):
            doc_pr = drawing.find(".//wp:docPr", NS)
            nv_pic_pr = drawing.find(".//pic:cNvPr", NS)
            pr = doc_pr if doc_pr is not None else nv_pic_pr
            drawing_candidates: list[dict[str, str | None]] = []
            for blip in drawing.findall(".//a:blip", NS):
                rel_id = blip.attrib.get(R_EMBED) or blip.attrib.get(R_LINK) or blip.attrib.get(R_ID)
                if not rel_id:
                    continue
                rel = relationships.get(rel_id)
                if not rel:
                    continue
                drawing_candidates.append(
                    {
                        "target": rel["target"],
                        "relation_type": rel.get("type"),
                        "name": pr.attrib.get("name") if pr is not None else None,
                        "title": pr.attrib.get("title") if pr is not None else None,
                        "description": pr.attrib.get("descr") if pr is not None else None,
                    }
                )
            append_image_candidates(drawing_candidates, None, None, None)

        # Legacy VML inside w:pict
        for pict in container.findall(".//w:pict", NS):
            shape = None
            for candidate_path in (".//v:shape", ".//v:rect", ".//v:roundrect", ".//v:oval", ".//v:image"):
                shape = pict.find(candidate_path, NS)
                if shape is not None:
                    break
            pict_candidates: list[dict[str, str | None]] = []
            for image_data in pict.findall(".//v:imagedata", NS):
                rel_id = image_data.attrib.get(R_ID) or image_data.attrib.get(O_RELID)
                if not rel_id:
                    continue
                rel = relationships.get(rel_id)
                if not rel:
                    continue
                pict_candidates.append(
                    {
                        "target": rel["target"],
                        "relation_type": rel.get("type"),
                        "name": shape.attrib.get("id") if shape is not None else None,
                        "title": image_data.attrib.get("title"),
                        "description": (
                            image_data.attrib.get("title")
                            or (shape.attrib.get("alt") if shape is not None else None)
                            or (shape.attrib.get("title") if shape is not None else None)
                        ),
                    }
                )
            append_image_candidates(pict_candidates, None, None, None)

        # Bare VML imagedata outside w:pict (catches some floating shapes)
        for image_data in container.findall(".//v:imagedata", NS):
            rel_id = image_data.attrib.get(R_ID) or image_data.attrib.get(O_RELID)
            if not rel_id:
                continue
            rel = relationships.get(rel_id)
            if not rel:
                continue
            append_image_candidates(
                [
                    {
                        "target": rel["target"],
                        "relation_type": rel.get("type"),
                        "name": None,
                        "title": image_data.attrib.get("title"),
                        "description": image_data.attrib.get("title"),
                    }
                ],
                None, None, None,
            )

        return images

    def extract_charts_from_container(
        self,
        container: ET.Element,
        relationships: dict[str, dict[str, str]],
        container_text: str | None,
        location: dict[str, object],
    ) -> list[dict[str, object]]:
        charts: list[dict[str, object]] = []
        for chart_node in container.findall(".//c:chart", NS):
            rel_id = chart_node.attrib.get(R_ID)
            if not rel_id:
                continue
            rel = relationships.get(rel_id)
            if not rel or not rel["type"].endswith("/chart"):
                continue
            chart_info = self.export_chart(rel["target"])
            self.chart_occurrence_count += 1
            charts.append(
                {
                    "index": self.chart_occurrence_count,
                    "relative_json_path": chart_info["relative_json_path"],
                    "relative_xml_path": chart_info["relative_xml_path"],
                    "output_json_path": chart_info["output_json_path"],
                    "output_xml_path": chart_info["output_xml_path"],
                    "source_part": rel["target"],
                    "chart": chart_info["chart"],
                    "container_text": text_or_none(container_text),
                    "location": location,
                }
            )
        return charts

    def export_binary_part(self, part_name: str, subfolder: str, prefix: str) -> dict[str, str]:
        if part_name in self.exported_binaries:
            return self.exported_binaries[part_name]
        if self.archive is None:
            raise RuntimeError("Archive is not open.")
        extension = Path(part_name).suffix or ".bin"
        index = len(self.exported_binaries) + 1
        output_name = f"{prefix}-{index:03d}{extension}"
        destination = self.output_dir / subfolder / output_name
        destination.write_bytes(self.archive.read(part_name))
        info = {
            "relative_path": str(destination.relative_to(self.output_dir)),
            "output_path": str(destination),
        }
        self.exported_binaries[part_name] = info
        return info

    def export_chart(self, part_name: str) -> dict[str, object]:
        if part_name in self.exported_charts:
            return self.exported_charts[part_name]
        if self.archive is None:
            raise RuntimeError("Archive is not open.")
        chart = self.parse_chart(part_name)
        index = len(self.exported_charts) + 1
        xml_path = self.output_dir / "charts" / f"chart-{index:03d}.xml"
        json_path = self.output_dir / "charts" / f"chart-{index:03d}.json"
        xml_path.write_bytes(self.archive.read(part_name))
        json_path.write_text(json.dumps(chart, ensure_ascii=False, indent=2), encoding="utf-8")
        info: dict[str, object] = {
            "relative_xml_path": str(xml_path.relative_to(self.output_dir)),
            "relative_json_path": str(json_path.relative_to(self.output_dir)),
            "output_xml_path": str(xml_path),
            "output_json_path": str(json_path),
            "chart": chart,
        }
        self.exported_charts[part_name] = info
        return info

    def parse_chart(self, part_name: str) -> dict[str, object]:
        root = self.read_xml(part_name)
        if root is None:
            return {"type": "unknown", "title": None, "series": []}
        title = text_or_none(
            " ".join(
                text_or_none(node.text) or ""
                for node in root.findall(".//c:title//a:t", NS)
            )
        )
        plot_area = root.find(".//c:plotArea", NS)
        chart_type = "unknown"
        series_nodes: list[ET.Element] = []
        if plot_area is not None:
            for child in list(plot_area):
                if local_name(child.tag).endswith("Chart"):
                    chart_type = local_name(child.tag)
                    series_nodes = child.findall("c:ser", NS)
                    break
        series: list[dict[str, object]] = []
        for series_index, series_node in enumerate(series_nodes, start=1):
            name = self.extract_series_name(series_node) or f"Series {series_index}"
            categories = self.extract_chart_points(series_node.find("c:cat", NS), numeric=False)
            values = self.extract_chart_points(series_node.find("c:val", NS), numeric=True)
            series.append({"name": name, "categories": categories, "values": values})
        return {"type": chart_type, "title": title, "series": series}

    def extract_series_name(self, series_node: ET.Element) -> str | None:
        candidates = [
            series_node.findtext("c:tx/c:v", default="", namespaces=NS),
            series_node.findtext("c:tx/c:strRef/c:strCache/c:pt/c:v", default="", namespaces=NS),
            series_node.findtext("c:tx/c:strLit/c:pt/c:v", default="", namespaces=NS),
        ]
        for candidate in candidates:
            text = text_or_none(candidate)
            if text:
                return text
        return None

    def extract_chart_points(self, node: ET.Element | None, numeric: bool) -> list[float | str | None]:
        if node is None:
            return []
        points = sorted(
            node.findall(".//c:pt", NS),
            key=lambda item: int(item.attrib.get("idx", "0")),
        )
        values: list[float | str | None] = []
        for point in points:
            raw = point.findtext("c:v", default="", namespaces=NS)
            values.append(safe_float(raw) if numeric else text_or_none(raw))
        return values

    def build_error_index(self, body_items: list[dict[str, object]]) -> dict[str, object]:
        section_prefix = self.detect_error_section_prefix(body_items) or "1.3"
        errors: dict[str, dict[str, object]] = {}
        current_key: str | None = None

        for body_position, item in enumerate(body_items, start=1):
            item_images = self.collect_item_images(item)

            if item["kind"] == "paragraph":
                text = text_or_none(str(item.get("text") or ""))
                if text:
                    error_match = re.match(
                        r"^\[(?P<status>[^\]]+)\]\s*Fehler\s*(?P<number>\d+)(?P<qualifier>.*?)\s*[-–]\s*(?P<title>.+)$",
                        text,
                    )
                    if error_match:
                        if current_key and current_key in errors:
                            errors[current_key]["end_body_index"] = body_position - 1
                        error_number = error_match.group("number")
                        current_key = f"{section_prefix}.{error_number}"
                        errors[current_key] = {
                            "protocol_id": current_key,
                            "title": text,
                            "status": error_match.group("status").strip(),
                            "error_number": int(error_number),
                            "qualifier": text_or_none(error_match.group("qualifier")),
                            "section_prefix": section_prefix,
                            "short_title": error_match.group("title").strip(),
                            "start_body_index": body_position,
                            "start_paragraph_index": item.get("index"),
                            "end_body_index": body_position,
                            "date": None,
                            "login": None,
                            "images": [],
                            "content_paragraphs": [],
                        }
                        if item_images:
                            errors[current_key]["images"].extend(item_images)
                        continue

                    if current_key and current_key in errors:
                        date_match = re.match(r"^Festgestellt am:\s*(.+)$", text)
                        login_match = re.match(r"^Angemeldet mit:\s*(.+)$", text)
                        if date_match and not errors[current_key]["date"]:
                            errors[current_key]["date"] = date_match.group(1).strip()
                        elif login_match and not errors[current_key]["login"]:
                            errors[current_key]["login"] = login_match.group(1).strip()
                        else:
                            errors[current_key]["content_paragraphs"].append(text)
                        errors[current_key]["end_body_index"] = body_position

                if current_key and current_key in errors and item_images:
                    errors[current_key]["images"].extend(item_images)

            elif current_key and current_key in errors:
                if item_images:
                    errors[current_key]["images"].extend(item_images)
                table_rows = item.get("rows") or []
                if table_rows:
                    rendered = [
                        " | ".join(normalize_text(str(cell)) for cell in row)
                        for row in table_rows
                    ]
                    errors[current_key]["content_paragraphs"].append("\n".join(rendered))
                errors[current_key]["end_body_index"] = body_position

        if current_key and current_key in errors:
            errors[current_key]["end_body_index"] = len(body_items)

        normalized: dict[str, object] = {}
        for key, value in errors.items():
            unique_images: list[str] = []
            seen_images: set[str] = set()
            for img in value["images"]:
                if img not in seen_images:
                    unique_images.append(img)
                    seen_images.add(img)
            value["images"] = unique_images
            normalized[key] = value
        return normalized

    def detect_error_section_prefix(self, body_items: list[dict[str, object]]) -> str | None:
        for item in body_items:
            if item["kind"] != "paragraph":
                continue
            text = text_or_none(str(item.get("text") or ""))
            if not text:
                continue
            match = re.match(r"^(?P<prefix>\d+(?:\.\d+)*)\s+Fehler(?:\s+\d+)?$", text.replace("\t", " "))
            if match:
                return match.group("prefix")
        return None

    def collect_item_images(self, item: dict[str, object]) -> list[str]:
        images = item.get("images") or []
        return [str(img["relative_path"]) for img in images if img.get("relative_path")]

    def write_output_files(self, manifest: dict[str, object]) -> None:
        (self.output_dir / "document.md").write_text(
            self.render_markdown(manifest), encoding="utf-8"
        )
        (self.output_dir / "document.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        (self.output_dir / "errors.json").write_text(
            json.dumps(manifest.get("errors", {}), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def render_markdown(self, manifest: dict[str, object]) -> str:
        lines: list[str] = []
        source = manifest["source"]
        counts = manifest["counts"]

        lines += [
            "# DOCX Extraction",
            "",
            f"- Source: `{source['path']}`",
            f"- Generated: `{manifest['generated_utc']}`",
            f"- Extractor: `{EXTRACTOR_NAME} v{EXTRACTOR_VERSION}`",
            f"- Paragraphs: {counts['paragraphs']}",
            f"- Tables: {counts['tables']}",
            f"- Images: {counts['images']}",
            f"- Charts: {counts['charts']}",
            f"- Errors indexed: {counts['errors']}",
        ]

        errors = manifest.get("errors") or {}
        if errors:
            lines += ["", "## Error Index", ""]
            for protocol_id, error in errors.items():
                n = len(error.get("images") or [])
                suffix = f" ({n} image{'s' if n != 1 else ''})" if n else ""
                lines.append(f"- **{protocol_id}**: {error['title']}{suffix}")

        metadata = manifest.get("metadata") or {}
        if metadata:
            lines += ["", "## Metadata", ""]
            for key, value in metadata.items():
                lines.append(f"- **{key}**: {value}")

        for part_list, heading in [
            (manifest.get("headers") or [], "## Headers"),
            (manifest.get("footers") or [], "## Footers"),
        ]:
            if part_list:
                lines += ["", heading]
                for item in part_list:
                    lines += ["", f"### {item['part']}", ""]
                    if item.get("text"):
                        lines.append(item["text"])
                    self._append_image_lines(lines, item.get("images") or [])
                    self._append_chart_lines(lines, item.get("charts") or [])

        lines += ["", "## Body"]
        for item in manifest.get("body", []):
            if item["kind"] == "paragraph":
                lines.extend(self.render_markdown_paragraph(item))
            elif item["kind"] == "table":
                lines.extend(self.render_markdown_table(item))

        lines.append("")
        return "\n".join(lines)

    def _append_image_lines(self, lines: list[str], images: list[dict[str, object]]) -> None:
        if not images:
            return
        lines += ["", "#### Images"]
        for image in images:
            lines.append(
                f"- Image {image['index']}: `{image['relative_path']}`"
                + (f" — {image['description']}" if image.get("description") else "")
            )

    def _append_chart_lines(self, lines: list[str], charts: list[dict[str, object]]) -> None:
        if not charts:
            return
        lines += ["", "#### Charts"]
        for chart in charts:
            lines.extend(self.render_chart_summary(chart))

    def render_markdown_paragraph(self, item: dict[str, object]) -> list[str]:
        lines: list[str] = []
        heading_level = item.get("heading_level")
        style = item.get("style")
        label = f"Paragraph {item['index']}"
        text = item.get("text")

        lines.append("")
        if heading_level:
            marker = "#" * min(int(heading_level) + 2, 6)
            lines.append(f"{marker} {text or label}")
        else:
            lines.append(f"### {label}")

        if style:
            lines += ["", f"- Style: `{style}`"]

        if text and not heading_level:
            lines += ["", str(text)]

        self._append_image_lines(lines, item.get("images") or [])
        self._append_chart_lines(lines, item.get("charts") or [])
        return lines

    def render_markdown_table(self, item: dict[str, object]) -> list[str]:
        lines: list[str] = []
        rows = item["rows"]
        col_count = item["column_count"]
        header = [f"Column {i}" for i in range(1, col_count + 1)]

        lines += ["", f"### Table {item['index']}", "", f"- Rows: {item['row_count']}", f"- Columns: {col_count}"]
        if rows and col_count:
            lines += [
                "",
                self.render_pipe_row(header),
                self.render_pipe_row(["---"] * col_count),
            ]
            for row in rows:
                lines.append(self.render_pipe_row(row))

        images = item.get("images") or []
        if images:
            lines += ["", "#### Images in Table"]
            for image in images:
                loc = image["location"]
                lines.append(
                    f"- Image {image['index']} at row {loc['row']}, col {loc['column']}: "
                    f"`{image['relative_path']}`"
                    + (f" — {image['description']}" if image.get("description") else "")
                )

        charts = item.get("charts") or []
        if charts:
            lines += ["", "#### Charts in Table"]
            for chart in charts:
                loc = chart["location"]
                lines.append(f"- Chart {chart['index']} at row {loc['row']}, col {loc['column']}")
                lines.extend(self.render_chart_summary(chart, indent="  "))

        return lines

    def render_chart_summary(self, chart_occurrence: dict[str, object], indent: str = "") -> list[str]:
        chart = chart_occurrence["chart"]
        chart_type = chart.get("type") or "unknown"
        title = chart.get("title")
        series = chart.get("series") or []
        lines = [
            f"{indent}- Chart {chart_occurrence['index']}: `{chart_occurrence['relative_json_path']}`",
            f"{indent}  - Type: `{chart_type}`",
        ]
        if title:
            lines.append(f"{indent}  - Title: {title}")
        if series:
            lines.append(f"{indent}  - Series:")
            for s in series:
                name = s.get("name") or "Series"
                cats = ", ".join("" if v is None else str(v) for v in s.get("categories", []))
                vals = ", ".join("" if v is None else str(v) for v in s.get("values", []))
                lines.append(f"{indent}    - {name}")
                if cats:
                    lines.append(f"{indent}      - Categories: {cats}")
                if vals:
                    lines.append(f"{indent}      - Values: {vals}")
        return lines

    def render_pipe_row(self, row: list[str]) -> str:
        return "| " + " | ".join(self.escape_pipe_cell(cell) for cell in row) + " |"

    def escape_pipe_cell(self, value: object) -> str:
        text = normalize_text("" if value is None else str(value))
        return text.replace("|", "\\|").replace("\n", "<br>")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Extract agent-friendly artifacts from a German QA/QS Word .docx test protocol."
    )
    parser.add_argument("source", help="Path to a .docx file or a directory containing .docx files.")
    parser.add_argument(
        "--latest",
        action="store_true",
        help="When the source is a directory with multiple .docx files, pick the most recently modified one.",
    )
    parser.add_argument(
        "--output",
        help="Explicit output directory (overrides all other path logic).",
    )
    parser.add_argument(
        "--artifact-root",
        help=(
            "Root directory for artifacts. "
            "Artifacts go to <root>\\.copilot-artifacts\\testprotokoll-analyzer\\<name>\\."
        ),
    )
    parser.add_argument(
        "--reuse-if-current",
        action="store_true",
        help="Skip extraction if existing artifacts are up to date (same source path, mtime, and images).",
    )
    args = parser.parse_args(argv)

    try:
        source = resolve_source(Path(args.source), args.latest)
        artifact_root = Path(args.artifact_root) if args.artifact_root else None
        output_dir = build_output_dir(source, Path(args.output) if args.output else None, artifact_root)

        if args.reuse_if_current and should_reuse_artifacts(output_dir, source):
            manifest = json.loads((output_dir / "document.json").read_text(encoding="utf-8"))
            result = {
                "ok": True,
                "reused": True,
                "source": manifest["source"]["path"],
                "output_dir": str(output_dir),
                "markdown_path": str(output_dir / "document.md"),
                "json_path": str(output_dir / "document.json"),
                "errors_path": str(output_dir / "errors.json"),
                "counts": manifest["counts"],
            }
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 0

        extractor = DocxExtractor(source, output_dir)
        manifest = extractor.extract()

    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1

    result = {
        "ok": True,
        "reused": False,
        "source": manifest["source"]["path"],
        "output_dir": manifest["output_dir"],
        "markdown_path": str(Path(manifest["output_dir"]) / "document.md"),
        "json_path": str(Path(manifest["output_dir"]) / "document.json"),
        "errors_path": str(Path(manifest["output_dir"]) / "errors.json"),
        "counts": manifest["counts"],
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())

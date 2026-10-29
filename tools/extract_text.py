"""
BTSPath — extract the plain text of a course file, to prepare a chapter's quiz and terminal steps.

Runs locally. Writes extracted/<id>.txt (that folder is private: never publish it).

    python tools/extract_text.py "resources/LINUX/S1-S2/CHP9_Les utilisateurs et les droits.pdf"
    python tools/extract_text.py --stats          # word count of every file, writes nothing

Needs: pip install pypdf   (only for PDFs; .pptx works without it)
"""

import os
import re
import sys
import zipfile
from xml.etree import ElementTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_manifest import ROOT, RESOURCES, SUBJECTS, slug  # noqa: E402

OUT_DIR = os.path.join(ROOT, "extracted")
SCANNED_BELOW = 30  # average words per page under this = probably scanned images


def pdf_pages(path):
    from pypdf import PdfReader
    return [(page.extract_text() or "") for page in PdfReader(path).pages]


def pptx_pages(path):
    ns = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
    with zipfile.ZipFile(path) as z:
        slides = [n for n in z.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", n)]
        slides.sort(key=lambda n: int(re.search(r"(\d+)\.xml$", n).group(1)))
        pages = []
        for name in slides:
            root = ElementTree.fromstring(z.read(name))
            lines = ["".join(t.text or "" for t in p.iter(ns + "t")) for p in root.iter(ns + "p")]
            pages.append("\n".join(l for l in lines if l.strip()))
        return pages


def extract(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        return pdf_pages(path)
    if ext == ".pptx":
        return pptx_pages(path)
    raise ValueError(f"Unsupported file type: {ext}")


def clean(pages):
    """Remove noise that wastes reading time: lone bullet symbols (ü, ⚫, •…), page numbers,
    and header/footer lines repeated on most pages (course title, author, page number)."""
    split = [[l.strip() for l in p.splitlines()] for p in pages]
    counts = {}
    for lines in split:
        for l in set(lines):
            counts[l] = counts.get(l, 0) + 1
    repeated = {l for l, n in counts.items() if len(pages) >= 4 and n >= len(pages) * 0.5}
    footer = re.compile(r"^(Par\.? .*\d+|\d+)$")
    out = []
    for lines in split:
        keep = [l for l in lines if len(l) > 2 and l not in repeated and len(re.sub(r"\W", "", l)) > 1 and not footer.match(l)]
        out.append("\n".join(keep))
    return out


def file_id(path):
    rel = os.path.relpath(path, RESOURCES).replace("\\", "/")
    subject, semester, filename = rel.split("/", 2)
    return f"{subject.lower()}-{slug(semester)}-{slug(os.path.splitext(filename)[0])}"


def words(pages):
    return sum(len(p.split()) for p in pages)


def stats():
    for subject in SUBJECTS:
        base = os.path.join(RESOURCES, subject)
        for dirpath, _, files in sorted(os.walk(base)):
            for f in sorted(files):
                path = os.path.join(dirpath, f)
                try:
                    pages = extract(path)
                except Exception as e:
                    print(f"  ERROR  {os.path.relpath(path, RESOURCES)}: {e}")
                    continue
                n, w = len(pages), words(pages)
                flag = "SCANNED?" if n and w / n < SCANNED_BELOW else "ok"
                print(f"  {flag:8} {w:6} words {n:4} pages  {os.path.relpath(path, RESOURCES)}")


def main(paths):
    os.makedirs(OUT_DIR, exist_ok=True)
    for path in paths:
        path = os.path.abspath(path)
        pages = extract(path)
        out = os.path.join(OUT_DIR, file_id(path) + ".txt")
        pages = clean(pages)
        with open(out, "w", encoding="utf-8") as f:
            for i, text in enumerate(pages, 1):
                text = re.sub(r"[ \t]+\n", "\n", text).strip()
                if text:
                    f.write(f"--- page {i} ---\n{text}\n\n")
        w = words(pages)
        warn = "  (little text: probably scanned)" if pages and w / len(pages) < SCANNED_BELOW else ""
        print(f"{os.path.relpath(out, ROOT)}: {len(pages)} pages, {w} words{warn}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        print(__doc__)
    elif args == ["--stats"]:
        stats()
    else:
        main(args)

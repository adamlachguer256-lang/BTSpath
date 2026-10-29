"""
BTSPath — resource manifest builder.

Scans resources/<SUBJECT>/<SEMESTER>/ and writes data/manifest.json.
It only looks at folder names, file names, extensions and sizes:
it never opens or reads the content of your course files.

Run it again every time you add, move or remove a file:

    python tools/build_manifest.py
"""

import hashlib
import json
import os
import re
import unicodedata
from datetime import date
from urllib.parse import quote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESOURCES = os.path.join(ROOT, "resources")
OUTPUT = os.path.join(ROOT, "data", "manifest.json")

SUBJECTS = {
    "NETWORK": {"name": "Network", "full": "Réseaux informatiques"},
    "LINUX": {"name": "Linux", "full": "Administration Linux"},
    "SEP": {"name": "SEP", "full": "Systèmes d'exploitation propriétaires"},
}

ALLOWED_EXT = {".pdf", ".pptx", ".ppt", ".docx", ".doc", ".xlsx", ".zip", ".txt"}

# Manual label fixes for file names that are not clear enough on their own.
# Key = path relative to resources/ (with forward slashes).
LABEL_OVERRIDES = {
    "LINUX/S3/archivage2.pdf": "Archivage",
    "LINUX/S3/chapitre sauvegardevd.pdf": "Sauvegarde",
    "NETWORK/S2/Ch2_Routage_Staique_CDP.pdf": "Chapitre 2 · Routage statique et CDP",
}

# Words that appear in some file names but are not part of the chapter title.
NOISE = re.compile(r"\(\d+\)|\bcontrole\b", re.IGNORECASE)


def nfc(text):
    return unicodedata.normalize("NFC", text)


def tidy(text):
    """Turn a raw file-name fragment into a readable title."""
    text = NOISE.sub(" ", text)
    text = text.replace("_", " ").replace("+", " ")
    text = re.sub(r"\s+", " ", text).strip(" -.")
    return text[:1].upper() + text[1:] if text else text


def parse_chapter(subject, semester, stem):
    """Return (number, title) following the BTSPath labelling rules.

    NETWORK     : number + name when both exist, otherwise whichever exists
    LINUX S1-S2 : number + name
    LINUX S3    : name only
    SEP         : number only
    """
    stem = re.sub(r"^S\d{2}_", "", stem)  # NETWORK/S3 prefix "S33_"

    if subject == "SEP":
        m = re.search(r"chap\.?\s*(\d+)", stem, re.IGNORECASE)
        return (int(m.group(1)) if m else None), None

    # "CHP9_x", "Ch11_x", "Chap 7 x", "Chap. 2 - x", "Chap1-x", "Chapitre 3"
    m = re.match(r"^(?:chapitre|chap|chp|ch)\.?\s*(\d+)\s*[-_ ]*(.*)$", stem, re.IGNORECASE)
    number, title = (int(m.group(1)), tidy(m.group(2))) if m else (None, tidy(stem))
    if not m:
        title = re.sub(r"^chapitre\s+", "", title, flags=re.IGNORECASE)
        title = tidy(title)

    if subject == "LINUX" and semester == "S3":
        return None, title or None
    return number, title or None


def make_label(number, title):
    if number is not None and title:
        return f"Chapitre {number} · {title}"
    if number is not None:
        return f"Chapitre {number}"
    return title


def slug(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def build():
    resources, unclassified, seen_hashes = [], [], {}

    for subject in SUBJECTS:
        subject_dir = os.path.join(RESOURCES, subject)
        if not os.path.isdir(subject_dir):
            continue
        for semester in sorted(os.listdir(subject_dir)):
            sem_dir = os.path.join(subject_dir, semester)
            if not os.path.isdir(sem_dir):
                continue
            for filename in sorted(os.listdir(sem_dir)):
                full = os.path.join(sem_dir, filename)
                stem, ext = os.path.splitext(filename)
                rel = f"{subject}/{semester}/{filename}"
                if not os.path.isfile(full) or ext.lower() not in ALLOWED_EXT:
                    continue

                number, title = parse_chapter(subject, semester, nfc(stem))
                label = LABEL_OVERRIDES.get(nfc(rel)) or make_label(number, title)
                if not label:
                    unclassified.append(rel)
                    continue

                digest = sha256(full)  # fingerprint only, used to spot duplicates
                entry = {
                    "id": f"{subject.lower()}-{slug(semester)}-{slug(stem)}",
                    "subject": subject,
                    "semester": semester,
                    "chapterNumber": number,
                    "label": label,
                    "filename": nfc(filename),
                    "type": ext.lower().lstrip("."),
                    "sizeBytes": os.path.getsize(full),
                    "path": "resources/" + quote(rel),
                }
                if digest in seen_hashes:
                    entry["duplicateOf"] = seen_hashes[digest]
                else:
                    seen_hashes[digest] = entry["id"]
                resources.append(entry)

    # Files that are not inside a known SUBJECT/SEMESTER folder.
    todo_dir = os.path.join(RESOURCES, "To-Organize")
    if os.path.isdir(todo_dir):
        for dirpath, _, files in os.walk(todo_dir):
            for f in files:
                unclassified.append(os.path.relpath(os.path.join(dirpath, f), RESOURCES).replace("\\", "/"))

    def sort_key(r):
        # numbered chapters first (in order), then name-only chapters A→Z
        n = r["chapterNumber"]
        return (r["subject"], r["semester"], n is None, n or 0, r["label"].lower())

    resources.sort(key=sort_key)

    manifest = {
        "generated": date.today().isoformat(),
        "subjects": [
            {"id": key, **info,
             "semesters": sorted({r["semester"] for r in resources if r["subject"] == key})}
            for key, info in SUBJECTS.items()
        ],
        "resources": resources,
        "unclassified": [nfc(u) for u in unclassified],
    }

    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"Wrote {os.path.relpath(OUTPUT, ROOT)}: {len(resources)} resources")
    for s in SUBJECTS:
        print(f"  {s:8} {sum(r['subject'] == s for r in resources)}")
    for r in resources:
        if "duplicateOf" in r:
            print(f"  duplicate: {r['path']} == {r['duplicateOf']}")
    if unclassified:
        print("Not classified (check these by hand):")
        for u in unclassified:
            print("  " + u)


if __name__ == "__main__":
    build()

# BTSPath

**Your path to BTS success.** — *Ton parcours vers la réussite en BTS.*

An independent learning platform for BTS students in Morocco: course resources organised by
subject, semester and chapter, a revision tracker, and chapter quizzes.

Plain HTML + CSS + JavaScript. No framework, no database, no build step.

## Project structure

```
BTSpath/
├─ index.html                 the single page of the site
├─ assets/
│  ├─ css/style.css           all the design (colours are at the top, in :root)
│  ├─ img/logo.svg            logo + favicon
│  └─ js/
│     ├─ app.js               loads data, routes between pages, draws each page
│     ├─ quiz.js              reusable quiz component
│     ├─ store.js             saves progress in the browser (localStorage)
│     ├─ icons.js             SVG icons + logo
│     ├─ subnet.js            IPv4 subnet + VLSM calculator (page "Outils")
│     └─ config.js            settings (resource-request form link)
├─ sw.js                      service worker: offline mode
├─ manifest.webmanifest       makes the site installable as an app
├─ data/
│  ├─ manifest.json           list of all resources — GENERATED, don't edit by hand
│  └─ quizzes/
│     ├─ index.json           list of available quizzes
│     └─ demo-btspath.json    demonstration quiz
├─ tools/build_manifest.py    builds data/manifest.json from the resources/ folder
└─ resources/                 your course files: SUBJECT/SEMESTER/file
```

## Run it on your computer

A browser can't load the JSON files when you double-click `index.html`, so use Python's small built-in server:

```
cd "C:\Users\LENOVO T15\Desktop\BTSpath"
python -m http.server 8000
```

Then open <http://localhost:8000>. Stop it with `Ctrl + C`.

## Add a new PDF (or any course file)

1. Put the file in `resources/<SUBJECT>/<SEMESTER>/`, e.g. `resources/NETWORK/S4/Ch1_Protocole PPP.pdf`.
   Start the name with the chapter number (`Ch1_`, `CHP1_`, `Chap 1`, `S44-Chap1`…) when there is one.
2. Rebuild the manifest:
   ```
   python tools/build_manifest.py
   ```
3. Refresh the site. The new file appears with its count, chapter label and progress tracker.

Labels follow these rules (in `parse_chapter`):
NETWORK = number and/or name (whatever the filename has) · LINUX S1-S2 = number + name ·
LINUX S3 = name only · SEP = number only.
To fix a label that looks wrong, add a line to `LABEL_OVERRIDES` at the top of the script.
Files you can't classify yet go in `resources/To-Organize/`; the script lists them but doesn't show them on the site.

## Add a quiz for a chapter

1. Find the chapter's `id` in `data/manifest.json` (e.g. `"network-s2-ch11-protocole-ospf"`).
2. Copy `data/quizzes/demo-btspath.json` to a new file, e.g. `data/quizzes/network-ospf.json`, set `"demo": false`
   and write the questions. `answer` is the position of the right choice, **counting from 0**
   (0 = A, 1 = B, 2 = C, 3 = D). `explanation` is optional.
3. Add an entry to `data/quizzes/index.json`:
   ```json
   {
     "id": "network-ospf",
     "file": "network-ospf.json",
     "title": "OSPF — Chapitre 11",
     "subject": "NETWORK",
     "chapterId": "network-s2-ch11-protocole-ospf",
     "demo": false
   }
   ```
   (Don't forget the comma between entries.) A **Quiz** button now appears on that chapter, and the quiz is listed on the Quiz page.

## Add a guided terminal for a chapter

1. Copy `data/labs/linux-s3-lvm.json` to a new file and keep the same structure:
   - `prompt`: `etudiant@btspath:~$` (normal user) or `root@serveur#` (root)
   - each step: `task` (what to do), `accept` (every correct way to write it), `hint`, optional `output` (what the
     terminal prints; copy it from the course) and `note`
   - optional `challenge`: last step with no hints. Use `accept_sequence` when it needs several commands in order.
2. Add an entry to `data/labs/index.json` with the chapter's `chapterId`. A **Terminal** button appears on that chapter.
3. Bump `VERSION` in `sw.js`.

Correct answers are compared after removing extra spaces, so `pvcreate   /dev/sdb` = `pvcreate /dev/sdb`.
Different option orders must each be listed in `accept`.

## Extract a chapter's text (to prepare a quiz or terminal)

```
pip install pypdf
python tools/extract_text.py "resources/LINUX/S3/Chap 8 LVM.pdf"   # → extracted/…txt (private, not published)
python tools/extract_text.py --stats                              # word count of every file
```
Scanned PDFs (images) give almost no text: the script says so.

## Offline mode and app install

- Once a student has visited the site, the pages work without internet. Every PDF they have
  opened once is also saved for offline use.
- On Android/Chrome/Edge an **Installer** button appears in the top bar. On iPhone: Share → *Add to Home Screen*.
- **When you change app files** (CSS/JS/HTML), increase `VERSION` in `sw.js` (e.g. `btspath-v2`) so
  students' phones drop the old cached copy. Data files (manifest, quizzes) refresh automatically when online.
- Offline mode only works over `http://localhost` or `https://` (GitHub Pages is https, so that's fine).

## Progress backup

*Ma progression* page (link on the home page): **export** progress and quiz scores to a `.json` file, **import** it on
another device, or reset everything. This is how a student moves progress from PC to phone without accounts.

## Activate resource requests (free)

At the moment the request page says clearly that requests are **not** collected, and lets students copy their request.

Easiest option, **Google Forms** (free):
1. Create a form with the questions Subject, Semester, Chapter, Need and Details. Answers land in a Google Sheet.
2. In the form, open ⋮ → *Get pre-filled link*, type `{subject}`, `{semester}`, `{chapter}`, `{need}`, `{message}`
   in the matching fields, then copy the link.
3. Paste it into `REQUEST_FORM_URL` in `assets/js/config.js`.

Alternatively, put an address in `REQUEST_EMAIL` to open the student's email app instead.

## Deploy

The repo is about 210 MB (the course files). Every file is under 20 MB, so it fits GitHub's limits
(100 MB per file, 1 GB per site).

**GitHub Pages:**
```
cd "C:\Users\LENOVO T15\Desktop\BTSpath"
git init
git add .
git commit -m "BTSPath MVP"
git branch -M main
git remote add origin https://github.com/<your-username>/btspath.git
git push -u origin main
```
Then on GitHub: *Settings → Pages → Source: Deploy from a branch → main / (root) → Save*.
The site will be at `https://<your-username>.github.io/btspath/`.

⚠️ **Pages with a free GitHub account only works on _public_ repositories**, which means anyone can
see and download the course files. Only publish material you're allowed to share.
If you want to keep the repo private, use **Netlify** or **Cloudflare Pages** (both free): connect the private repo,
leave the build command empty and set the output folder to `/`.

**If the files get too big or you can't share them publicly:** host them on Google Drive (*Share → Anyone with the link*)
and replace the `path` in the manifest with the Drive link. Note that this means editing `manifest.json` by hand,
or extending the script to read a list of external links.

## Limitations

- Progress and quiz scores are saved **only in this browser on this device** (localStorage). They don't sync
  automatically and they disappear if you clear browsing data. Use the export/import backup to move them. There are no accounts.
- `.pptx` files can't be previewed in the browser, only downloaded. Export them to PDF if you want "Open" to work.
- Only one quiz exists, and it is a demonstration about using the site, not BTS course content.
- The library only shows files that exist. Missing ones (LINUX CHP19, NETWORK S2 Ch8, SEP S1 Chap2, SEP S4 Chap3,
  NETWORK S4) simply don't appear.
- `NETWORK/S2/Ch9_Le Protocole EIGRP.pdf` is identical to the S1 copy. It is kept and flagged as a duplicate; you can delete it
  yourself if you want to save 1 file in the repo.
- The font loads from Google Fonts. Offline, the site falls back to the system font.

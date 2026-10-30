// BTSPath — main application: loads the data, routes between pages, renders views.
// Pages (hash routes): #/  #/subject/LINUX  #/quizzes  #/quiz/<id>  #/request  #/about

import { icon, LOGO, SUBJECT_ICON } from "./icons.js";
import * as store from "./store.js";
import { renderQuiz } from "./quiz.js";
import { renderLab } from "./terminal.js";
import { REQUEST_FORM_URL, REQUEST_EMAIL } from "./config.js";
import { viewSubnet, mountSubnet, handleSubnetEvent } from "./subnet.js";

const app = document.getElementById("app");
let manifest, quizIndex, labIndex;

// ---------- helpers ----------

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function getJSON(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

function formatSize(bytes) {
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1).replace(".", ",") + " Mo";
  return Math.max(1, Math.round(bytes / 1024)) + " Ko";
}

function semesterLabel(sem) {
  const m = sem.match(/^S(\d)(?:-S(\d))?$/);
  if (!m) return sem;
  return m[2] ? `Semestres ${m[1]} – ${m[2]}` : `Semestre ${m[1]}`;
}

const subjectById = (id) => manifest.subjects.find((s) => s.id === id);
const resourcesOf = (id) => manifest.resources.filter((r) => r.subject === id);
const quizForChapter = (resId) => quizIndex.quizzes.find((q) => q.chapterId === resId);
const labForChapter = (resId) => labIndex.labs.find((l) => l.chapterId === resId);

function stats(list) {
  const total = list.length;
  const revised = list.filter((r) => store.getStatus(r.id) === "revised").length;
  const learning = list.filter((r) => store.getStatus(r.id) === "learning").length;
  return { total, revised, learning, todo: total - revised - learning, pct: total ? Math.round((revised / total) * 100) : 0 };
}

function progressBar(s, label) {
  const r = s.total ? (s.revised / s.total) * 100 : 0;
  const l = s.total ? (s.learning / s.total) * 100 : 0;
  return `<div class="bar" role="img" aria-label="${esc(label)} : ${s.revised} révisé(s), ${s.learning} en cours sur ${s.total}">
    <span class="bar-revised" style="width:${r}%"></span><span class="bar-learning" style="width:${l}%"></span>
  </div>`;
}

function ring(pct, size = 132) {
  const r = 52, c = 2 * Math.PI * r;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 120 120" aria-hidden="true">
    <circle cx="60" cy="60" r="${r}" class="ring-track"/>
    <circle cx="60" cy="60" r="${r}" class="ring-value" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}"/>
  </svg>`;
}

function emptyState(iconName, title, text, action = "") {
  return `<div class="empty">
    <div class="empty-icon">${icon(iconName, 28)}</div>
    <h3>${title}</h3><p>${text}</p>${action}
  </div>`;
}

function resourceActions(r) {
  const canPreview = r.type === "pdf";
  const quiz = quizForChapter(r.id);
  const lab = labForChapter(r.id);
  return `
    ${canPreview
      ? `<a class="btn btn-primary btn-sm" href="${r.path}" target="_blank" rel="noopener" data-open="${r.id}">${icon("external", 16)} Ouvrir</a>`
      : ""}
    <a class="btn ${canPreview ? "btn-ghost" : "btn-primary"} btn-sm" href="${r.path}" download="${esc(r.filename)}" data-open="${r.id}" aria-label="Télécharger ${esc(r.filename)}">${icon("download", 16)}${canPreview ? "" : " Télécharger"}</a>
    ${quiz ? `<a class="btn btn-accent btn-sm" href="#/quiz/${quiz.id}">${icon("quiz", 16)} Quiz</a>` : ""}
    ${lab ? `<a class="btn btn-term btn-sm" href="#/lab/${lab.id}">${icon("terminal", 16)} Terminal</a>` : ""}`;
}

// ---------- layout chrome ----------

const NAV = [
  { href: "#/", label: "Accueil", icon: "home", match: (p) => p === "" },
  { href: "#/subject/NETWORK", label: "Network", icon: "network", match: (p) => p === "subject/NETWORK" },
  { href: "#/subject/LINUX", label: "Linux", icon: "terminal", match: (p) => p === "subject/LINUX" },
  { href: "#/subject/SEP", label: "SEP", icon: "monitor", match: (p) => p === "subject/SEP" },
  { href: "#/quizzes", label: "Quiz", icon: "quiz", match: (p) => p.startsWith("quiz") || p.startsWith("lab") },
];

function renderChrome(path) {
  const links = NAV.map((n) => {
    const active = n.match(path) ? ' aria-current="page"' : "";
    return { desktop: `<a href="${n.href}"${active}>${n.label}</a>`, mobile: `<a href="${n.href}"${active}>${icon(n.icon, 22)}<span>${n.label}</span></a>` };
  });
  const cur = (p) => (path === p ? ' aria-current="page"' : "");
  document.getElementById("nav").innerHTML = links.map((l) => l.desktop).join("") +
    `<a href="#/tools"${cur("tools")}>Outils</a><a href="#/about"${cur("about")}>À propos</a>`;
  document.getElementById("tabbar").innerHTML = links.map((l) => l.mobile).join("");
}

function applyTheme() {
  const saved = store.getTheme();
  if (saved) document.documentElement.dataset.theme = saved;
  else delete document.documentElement.dataset.theme;
  const dark = saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  const btn = document.getElementById("theme-toggle");
  btn.innerHTML = icon(dark ? "sun" : "moon", 20);
  btn.setAttribute("aria-label", dark ? "Passer au thème clair" : "Passer au thème sombre");
  return dark;
}

// ---------- views ----------

function viewHome() {
  const all = stats(manifest.resources);
  const last = store.getLast();
  const lastRes = last && manifest.resources.find((r) => r.id === last.id);
  const realQuizzes = quizIndex.quizzes.filter((q) => !q.demo).length;

  const subjectCards = manifest.subjects.map((s) => {
    const list = resourcesOf(s.id);
    const st = stats(list);
    return `<a class="subject-card" href="#/subject/${s.id}" data-subject="${s.id}">
      <div class="subject-top">
        <span class="subject-icon">${icon(SUBJECT_ICON[s.id], 24)}</span>
        <span class="subject-go">${icon("arrow", 20)}</span>
      </div>
      <h3>${esc(s.name)}</h3>
      <p class="muted">${esc(s.full)}</p>
      ${list.length ? `
        <p class="subject-meta"><strong>${list.length}</strong> ressources · ${s.semesters.length} ${s.semesters.length > 1 ? "dossiers de semestre" : "dossier de semestre"}</p>
        ${progressBar(st, s.name)}
        <p class="subject-progress"><span>${st.revised} révisé${st.revised > 1 ? "s" : ""}</span><span>${st.learning} en cours</span></p>`
      : `<p class="subject-meta">Aucune ressource pour l'instant.</p>`}
    </a>`;
  }).join("");

  return `
  <section class="hero">
    <div class="container hero-inner">
      <div class="hero-text">
        <p class="eyebrow">Plateforme indépendante · Étudiants BTS au Maroc</p>
        <h1>Ton parcours vers la réussite <span class="nowrap">en BTS<span class="dot">.</span></span></h1>
        <p class="hero-sub">Your path to BTS success. Retrouve tes cours, suis tes révisions chapitre par chapitre et entraîne-toi avec des quiz.</p>
        <div class="hero-actions">
          ${lastRes
            ? `<a class="btn btn-accent btn-lg" href="#/subject/${lastRes.subject}">${icon("book", 20)} Continuer : ${esc(subjectById(lastRes.subject).name)}</a>`
            : `<a class="btn btn-accent btn-lg" href="#subjects" data-scroll="subjects">${icon("book", 20)} Choisir une matière</a>`}
          <button class="btn btn-on-dark btn-lg" data-search>${icon("search", 20)} Rechercher</button>
        </div>
        <dl class="hero-stats">
          <div><dt>Ressources</dt><dd>${manifest.resources.length}</dd></div>
          <div><dt>Matières</dt><dd>${manifest.subjects.length}</dd></div>
          <div><dt>Quiz de chapitre</dt><dd>${realQuizzes}</dd></div>
        </dl>
      </div>
      <div class="hero-card" aria-label="Ta progression">
        <div class="ring-wrap">${ring(all.pct)}<div class="ring-label"><strong>${all.pct}%</strong><span>révisé</span></div></div>
        <ul class="legend">
          <li><span class="sw sw-revised"></span>Révisés <strong>${all.revised}</strong></li>
          <li><span class="sw sw-learning"></span>En cours <strong>${all.learning}</strong></li>
          <li><span class="sw sw-todo"></span>Pas commencés <strong>${all.todo}</strong></li>
        </ul>
        <p class="hero-card-note">${all.revised + all.learning === 0
          ? "Marque tes chapitres « En cours » ou « Révisé » pour suivre ta progression."
          : "Progression enregistrée sur cet appareil."}</p>
        <a class="hero-card-link" href="#/progress">Ma progression · sauvegarder ${icon("arrow", 14)}</a>
      </div>
    </div>
  </section>

  <section class="container section" id="subjects">
    <div class="section-head">
      <h2>Tes matières</h2>
      <p class="muted">Ressources classées par semestre et par chapitre.</p>
    </div>
    <div class="subject-grid">${subjectCards}</div>
  </section>

  <section class="container section">
    <div class="tiles">
      <div class="tile">
        <span class="tile-icon">${icon("clock", 22)}</span>
        <h3>Reprendre</h3>
        ${lastRes
          ? `<p class="tile-strong">${esc(lastRes.label)}</p>
             <p class="muted">${esc(subjectById(lastRes.subject).name)} · ${semesterLabel(lastRes.semester)}</p>
             <div class="row-actions">${resourceActions(lastRes)}</div>`
          : `<p class="muted">Les ressources que tu ouvres apparaîtront ici pour y revenir en un clic.</p>`}
      </div>
      <a class="tile tile-link" href="#/quizzes">
        <span class="tile-icon">${icon("quiz", 22)}</span>
        <h3>Quiz</h3>
        <p class="muted">${realQuizzes
          ? `${realQuizzes} quiz de chapitre disponible${realQuizzes > 1 ? "s" : ""}.`
          : "Les quiz de chapitre arrivent progressivement. Une démo est disponible pour découvrir le format."}</p>
        <span class="tile-cta">Voir les quiz ${icon("arrow", 16)}</span>
      </a>
      <a class="tile tile-link" href="#/tools">
        <span class="tile-icon">${icon("calc", 22)}</span>
        <h3>Calculateur IPv4</h3>
        <p class="muted">Sous-réseaux, masques et VLSM calculés instantanément, avec le détail en binaire.</p>
        <span class="tile-cta">Ouvrir l'outil ${icon("arrow", 16)}</span>
      </a>
      <a class="tile tile-link" href="#/request">
        <span class="tile-icon">${icon("request", 22)}</span>
        <h3>Une ressource manque ?</h3>
        <p class="muted">Indique la matière et le chapitre qui ont besoin de nouvelles ressources.</p>
        <span class="tile-cta">Faire une demande ${icon("arrow", 16)}</span>
      </a>
    </div>
  </section>`;
}

// subject page keeps its filters while you stay on it
const filters = { subject: null, sem: "all", q: "", type: "all", status: "all" };

function viewSubject(id) {
  const s = subjectById(id);
  if (!s) return viewNotFound();
  if (filters.subject !== id) Object.assign(filters, { subject: id, sem: "all", q: "", type: "all", status: "all" });

  const list = resourcesOf(id);
  const types = [...new Set(list.map((r) => r.type))];

  return `
  <section class="subject-hero" data-subject="${id}">
    <div class="container">
      <a class="crumb" href="#/">${icon("back", 16)} Accueil</a>
      <div class="subject-head">
        <span class="subject-icon lg">${icon(SUBJECT_ICON[id], 30)}</span>
        <div>
          <h1>${esc(s.name)}</h1>
          <p class="muted">${esc(s.full)}</p>
        </div>
        <div class="subject-stats" id="subject-stats">${subjectStats(list, s)}</div>
      </div>
    </div>
  </section>

  <section class="container section-tight">
    ${id === "NETWORK" ? `<a class="callout" href="#/tools">${icon("calc", 20)}<span><strong>Calculateur IPv4 et VLSM</strong> — vérifie tes exercices d'adressage.</span>${icon("arrow", 18)}</a>` : ""}
    ${list.length ? `
    <div class="toolbar">
      <div class="tabs" role="tablist" aria-label="Semestre">
        ${["all", ...s.semesters].map((sem) => `<button role="tab" aria-selected="${filters.sem === sem}" data-sem="${sem}">${sem === "all" ? "Tout" : esc(sem)}</button>`).join("")}
      </div>
      <div class="filters">
        <label class="field search-field">${icon("search", 18)}
          <input type="search" id="lib-q" placeholder="Rechercher dans ${esc(s.name)}…" value="${esc(filters.q)}" aria-label="Rechercher">
        </label>
        ${types.length > 1 ? `<select id="lib-type" aria-label="Type de fichier">
          <option value="all">Tous les types</option>
          ${types.map((t) => `<option value="${t}" ${filters.type === t ? "selected" : ""}>${t.toUpperCase()}</option>`).join("")}
        </select>` : ""}
        <select id="lib-status" aria-label="Statut">
          <option value="all">Tous les statuts</option>
          ${store.STATUSES.map((st) => `<option value="${st.id}" ${filters.status === st.id ? "selected" : ""}>${st.label}</option>`).join("")}
        </select>
      </div>
    </div>
    <div id="library"></div>` : emptyState("inbox", "Aucune ressource pour l'instant",
      `Les cours de ${esc(s.name)} n'ont pas encore été ajoutés.`,
      `<a class="btn btn-primary" href="#/request">Demander une ressource</a>`)}
  </section>`;
}

function subjectStats(list, s) {
  const st = stats(list);
  return `<div class="stat"><strong>${list.length}</strong><span>ressources</span></div>
    <div class="stat"><strong>${st.revised}<small>/${st.total}</small></strong><span>révisés</span></div>
    <div class="stat-bar">${progressBar(st, s.name)}<span class="muted">${st.pct}% révisé · ${st.learning} en cours</span></div>`;
}

function renderLibrary() {
  const box = document.getElementById("library");
  if (!box) return;
  const q = norm(filters.q.trim());
  const items = resourcesOf(filters.subject).filter((r) =>
    (filters.sem === "all" || r.semester === filters.sem) &&
    (filters.type === "all" || r.type === filters.type) &&
    (filters.status === "all" || store.getStatus(r.id) === filters.status) &&
    (!q || norm(r.label + " " + r.filename).includes(q)));

  if (!items.length) {
    box.innerHTML = emptyState("search", "Aucun résultat", "Aucune ressource ne correspond à ces filtres.",
      `<button class="btn btn-ghost" data-reset>Réinitialiser les filtres</button>`);
    return;
  }

  const groups = {};
  items.forEach((r) => (groups[r.semester] ||= []).push(r));
  box.innerHTML = Object.entries(groups).map(([sem, rs]) => `
    <div class="sem-group">
      <h2 class="sem-title">${semesterLabel(sem)} <span class="count">${rs.length}</span></h2>
      <ul class="res-list">${rs.map(resourceRow).join("")}</ul>
    </div>`).join("");
}

function resourceRow(r) {
  const status = store.getStatus(r.id);
  const badge = r.chapterNumber ?? icon(r.type === "pdf" ? "file" : "slides", 18);
  return `<li class="res status-${status}" data-id="${r.id}">
    <span class="res-num">${badge}</span>
    <div class="res-main">
      <h3>${esc(r.label)}</h3>
      <p class="res-file" title="${esc(r.filename)}">${esc(r.filename)}</p>
      <div class="chips">
        <span class="chip chip-${r.type}">${r.type.toUpperCase()}</span>
        <span class="chip">${formatSize(r.sizeBytes)}</span>
        ${r.type !== "pdf" ? `<span class="chip">Téléchargement</span>` : ""}
        ${r.duplicateOf ? `<span class="chip" title="Même fichier que dans un autre semestre">Identique à un autre semestre</span>` : ""}
      </div>
    </div>
    <div class="seg" role="group" aria-label="Statut de ${esc(r.label)}">
      ${store.STATUSES.map((st) => `<button data-status="${st.id}" aria-pressed="${status === st.id}">${st.id === "revised" ? icon("check", 14) : ""}${st.label}</button>`).join("")}
    </div>
    <div class="res-actions">${resourceActions(r)}</div>
  </li>`;
}

function quizCard(q) {
  const chapter = q.chapterId && manifest.resources.find((r) => r.id === q.chapterId);
  const best = store.getQuizBest(q.id);
  return `<a class="quiz-card" href="#/quiz/${q.id}">
      <span class="tile-icon">${icon("quiz", 22)}</span>
      <div>
        ${q.demo ? `<span class="badge-demo">Démonstration</span>` : ""}
        <h3>${esc(q.title)}</h3>
        <p class="muted">${chapter ? esc(chapter.label) : "Fonctionnement de la plateforme"}</p>
      </div>
      <span class="quiz-best">${best !== null ? `Meilleur : ${best}%` : "Pas encore fait"}</span>
    </a>`;
}

function labCard(l) {
  const chapter = manifest.resources.find((r) => r.id === l.chapterId);
  const p = store.getLab(l.id);
  return `<a class="quiz-card" href="#/lab/${l.id}">
        <span class="tile-icon term-icon">${icon("terminal", 22)}</span>
        <div><h3>${esc(l.title)}</h3>
        <p class="muted">${chapter ? esc(chapter.label) : ""}</p></div>
        <span class="quiz-best">${p?.done ? `Terminé · ${p.helped.length ? `${p.helped.length} avec aide` : "sans aide"}` : p?.index ? `En cours · étape ${p.index + 1}` : "Pas encore fait"}</span>
      </a>`;
}

// Group quiz/lab entries by the semester of their chapter, in manifest order.
function bySemester(entries, cardFn) {
  const order = (e) => manifest.resources.findIndex((r) => r.id === e.chapterId);
  const groups = {};
  [...entries].sort((a, b) => order(a) - order(b)).forEach((e) => {
    const sem = manifest.resources.find((r) => r.id === e.chapterId)?.semester || "";
    (groups[sem] ||= []).push(e);
  });
  return Object.entries(groups).map(([sem, list]) => `
    <div class="sem-group">
      <h2 class="sem-title">${sem ? semesterLabel(sem) : "Autres"} <span class="count">${list.length}</span></h2>
      <div class="quiz-list">${list.map(cardFn).join("")}</div>
    </div>`).join("");
}

function viewQuizzes(subjectId) {
  const subjectOf = (e) => manifest.resources.find((r) => r.id === e.chapterId)?.subject;
  const s = subjectById(subjectId) || manifest.subjects.find((x) => quizIndex.quizzes.some((q) => subjectOf(q) === x.id)) || manifest.subjects[0];
  const quizzes = quizIndex.quizzes.filter((q) => subjectOf(q) === s.id);
  const labs = labIndex.labs.filter((l) => subjectOf(l) === s.id);
  const demo = quizIndex.quizzes.filter((q) => q.demo || !subjectOf(q));

  return `<section class="container section page">
    <div class="section-head">
      <h1>Quiz</h1>
      <p class="muted">Choisis une matière, puis un chapitre. Ce ne sont pas des sujets officiels d'examen BTS.</p>
    </div>
    <div class="toolbar">
      <div class="tabs" role="tablist" aria-label="Matière">
        ${manifest.subjects.map((x) => `<a role="tab" class="tab" aria-selected="${x.id === s.id}" href="#/quizzes/${x.id}">${esc(x.name)}
          <span class="count">${quizIndex.quizzes.filter((q) => subjectOf(q) === x.id).length}</span></a>`).join("")}
      </div>
    </div>
    ${quizzes.length ? bySemester(quizzes, quizCard) : `<div class="note">${icon("info", 18)}<p>Aucun quiz publié pour ${esc(s.name)} pour l'instant.</p></div>`}
    ${labs.length ? `
    <div class="section-head" style="margin-top:40px">
      <h2>Terminal guidé — ${esc(s.name)}</h2>
      <p class="muted">Tape les vraies commandes du chapitre, étape par étape, dans un terminal simulé.</p>
    </div>
    ${bySemester(labs, labCard)}` : ""}
    ${demo.length ? `<div class="sem-group" style="margin-top:40px"><h2 class="sem-title">Démonstration</h2><div class="quiz-list">${demo.map(quizCard).join("")}</div></div>` : ""}
  </section>`;
}

async function viewLab(id) {
  const entry = labIndex.labs.find((l) => l.id === id);
  if (!entry) return (app.innerHTML = viewNotFound());
  const lab = await getJSON(`data/labs/${entry.file}`);
  const chapter = manifest.resources.find((r) => r.id === lab.chapterId);
  app.innerHTML = `<section class="container section page lab-page">
    <a class="crumb" href="#/subject/${chapter?.subject || ""}">${icon("back", 16)} ${chapter ? esc(subjectById(chapter.subject).name) : "Retour"}</a>
    <div class="quiz-head">
      <span class="badge-term">${icon("terminal", 14)} Terminal guidé${chapter ? ` · ${esc(chapter.label)}` : ""}</span>
      <h1>${esc(lab.title)}</h1>
      <p class="muted">Simulation : seules les commandes du chapitre sont reconnues. Pour tout tester, utilise une vraie machine Linux.</p>
    </div>
    <div id="lab"></div>
  </section>`;
  renderLab(document.getElementById("lab"), lab, id);
}

async function viewQuiz(id) {
  const entry = quizIndex.quizzes.find((q) => q.id === id);
  if (!entry) return viewNotFound();
  const quiz = await getJSON(`data/quizzes/${entry.file}`);
  app.innerHTML = `<section class="container section page narrow">
    <a class="crumb" href="#/quizzes">${icon("back", 16)} Tous les quiz</a>
    <div class="quiz-head">
      ${quiz.demo ? `<span class="badge-demo">Démonstration — pas un sujet officiel</span>` : ""}
      <h1>${esc(quiz.title)}</h1>
      ${quiz.description ? `<p class="muted">${esc(quiz.description)}</p>` : ""}
    </div>
    <div class="quiz card" id="quiz"></div>
  </section>`;
  renderQuiz(document.getElementById("quiz"), quiz, id);
}

function viewRequest() {
  const configured = REQUEST_FORM_URL || REQUEST_EMAIL;
  return `<section class="container section page narrow">
    <div class="section-head">
      <h1>Demander une ressource</h1>
      <p class="muted">Un chapitre manque ou n'a pas assez de supports ? Dis-le-nous.</p>
    </div>
    ${configured ? "" : `<div class="note warn">${icon("info", 18)}<p><strong>La collecte des demandes n'est pas encore activée.</strong> Ta demande n'est envoyée nulle part pour l'instant : tu peux la copier et la transmettre directement.</p></div>`}
    <form class="card form" id="request-form">
      <div class="grid-2">
        <label>Matière
          <select name="subject" required>
            ${manifest.subjects.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}
          </select>
        </label>
        <label>Semestre
          <select name="semester">${["S1", "S2", "S3", "S4"].map((s) => `<option>${s}</option>`).join("")}</select>
        </label>
      </div>
      <label>Chapitre
        <select name="chapter" id="req-chapter"></select>
      </label>
      <label>Type de besoin
        <select name="need">
          <option>Cours manquant</option><option>Exercices / TD</option><option>Examens des années précédentes</option><option>Corrections</option><option>Autre</option>
        </select>
      </label>
      <label>Précisions <span class="muted">(facultatif)</span>
        <textarea name="message" rows="4" maxlength="800" placeholder="Ex. : il manque le chapitre 19, ou des exercices sur le VLSM."></textarea>
      </label>
      <div class="row-actions">
        ${REQUEST_FORM_URL ? `<button class="btn btn-primary" type="submit">${icon("external", 18)} Continuer vers le formulaire</button>`
          : REQUEST_EMAIL ? `<button class="btn btn-primary" type="submit">${icon("request", 18)} Envoyer par e-mail</button>` : ""}
        <button class="btn ${configured ? "btn-ghost" : "btn-primary"}" type="button" data-copy>${icon("copy", 18)} Copier la demande</button>
      </div>
      <p class="form-status" id="req-status" aria-live="polite"></p>
    </form>
  </section>`;
}

function fillChapterSelect() {
  const form = document.getElementById("request-form");
  if (!form) return;
  const subject = form.subject.value, sem = form.semester.value;
  const chapters = resourcesOf(subject).filter((r) => r.semester.split("-").includes(sem) && !r.duplicateOf);
  form.chapter.innerHTML = chapters.map((r) => `<option>${esc(r.label)}</option>`).join("") +
    `<option value="Chapitre non listé">Chapitre non listé / autre</option>`;
}

function requestText(form) {
  const d = Object.fromEntries(new FormData(form));
  return { d, text: `Demande BTSPath\nMatière : ${d.subject}\nSemestre : ${d.semester}\nChapitre : ${d.chapter}\nBesoin : ${d.need}\n${d.message ? "Précisions : " + d.message : ""}`.trim() };
}

function viewAbout() {
  return `<section class="container section page narrow prose">
    <h1>À propos de BTSPath</h1>
    <p class="lead">BTSPath aide les étudiants BTS au Maroc à trouver leurs ressources, organiser leurs révisions et s'entraîner sur leurs matières.</p>
    <div class="about-grid">
      <div class="tile"><span class="tile-icon">${icon("book", 22)}</span><h3>Ressources</h3><p class="muted">Les supports de cours sont classés par matière, semestre et chapitre.</p></div>
      <div class="tile"><span class="tile-icon">${icon("check", 22)}</span><h3>Suivi</h3><p class="muted">Marque chaque chapitre « Pas commencé », « En cours » ou « Révisé ».</p></div>
      <div class="tile"><span class="tile-icon">${icon("quiz", 22)}</span><h3>Quiz</h3><p class="muted">Des quiz par chapitre, ajoutés progressivement.</p></div>
    </div>
    <h2>Ta progression</h2>
    <p>Ta progression et tes scores sont enregistrés uniquement dans ce navigateur, sur cet appareil (<em>localStorage</em>). Ils ne sont pas synchronisés entre tes appareils et ne sont visibles par personne d'autre. Si tu effaces les données du navigateur, ils disparaissent.</p>
    <h2>Indépendance</h2>
    <p>BTSPath est une plateforme indépendante. Elle n'est affiliée à aucun établissement, organisme ou administration. Les quiz ne sont pas des sujets officiels d'examen.</p>
    <p>Le contenu de la bibliothèque reflète uniquement les fichiers réellement disponibles : elle n'est pas forcément complète.</p>
    <p class="muted">Dernière mise à jour de la bibliothèque : ${esc(manifest.generated)}.</p>
  </section>`;
}

function viewProgress() {
  const all = stats(manifest.resources);
  const rows = manifest.subjects.map((s) => {
    const list = resourcesOf(s.id);
    const sems = s.semesters.map((sem) => {
      const st = stats(list.filter((r) => r.semester === sem));
      return `<li><span>${semesterLabel(sem)}</span>${progressBar(st, sem)}<span class="muted">${st.revised}/${st.total}</span></li>`;
    }).join("");
    const st = stats(list);
    return `<div class="card progress-card" data-subject="${s.id}">
      <div class="progress-head">
        <span class="subject-icon">${icon(SUBJECT_ICON[s.id], 22)}</span>
        <div><h3>${esc(s.name)}</h3><p class="muted">${st.revised} révisé${st.revised > 1 ? "s" : ""} · ${st.learning} en cours · ${st.todo} pas commencé${st.todo > 1 ? "s" : ""}</p></div>
        <strong class="progress-pct">${st.pct}%</strong>
      </div>
      <ul class="sem-bars">${sems}</ul>
    </div>`;
  }).join("");

  return `<section class="container section page">
    <div class="section-head">
      <h1>Ma progression</h1>
      <p class="muted">${all.revised} chapitre${all.revised > 1 ? "s" : ""} révisé${all.revised > 1 ? "s" : ""} sur ${all.total} (${all.pct}%). Enregistré dans ce navigateur, sur cet appareil.</p>
    </div>
    <div class="progress-grid">${rows}</div>

    <h2 class="block-title">Sauvegarder ou transférer</h2>
    <div class="tiles tiles-2">
      <div class="tile">
        <span class="tile-icon">${icon("download", 22)}</span>
        <h3>Exporter</h3>
        <p class="muted">Télécharge un petit fichier avec ta progression et tes scores. Garde-le ou envoie-le sur ton autre appareil.</p>
        <div class="row-actions"><button class="btn btn-primary" data-export>${icon("download", 18)} Télécharger ma sauvegarde</button></div>
      </div>
      <div class="tile">
        <span class="tile-icon">${icon("upload", 22)}</span>
        <h3>Importer</h3>
        <p class="muted">Charge un fichier de sauvegarde BTSPath. Il remplace la progression actuelle de cet appareil.</p>
        <div class="row-actions">
          <label class="btn btn-ghost">${icon("upload", 18)} Choisir un fichier<input type="file" accept=".json,application/json" id="import-file" hidden></label>
        </div>
      </div>
    </div>
    <p class="form-status" id="backup-status" aria-live="polite"></p>
    <div class="danger-zone">
      <p><strong>Tout recommencer</strong><br><span class="muted">Efface la progression et les scores de cet appareil.</span></p>
      <button class="btn btn-ghost btn-sm" data-reset-progress>Réinitialiser</button>
    </div>
  </section>`;
}

function viewNotFound() {
  return `<section class="container section">${emptyState("search", "Page introuvable", "Cette page n'existe pas ou a été déplacée.", `<a class="btn btn-primary" href="#/">Retour à l'accueil</a>`)}</section>`;
}

// ---------- router ----------

async function route() {
  const path = location.hash.replace(/^#\/?/, "");
  if (path === "subjects") return; // in-page anchor
  renderChrome(path);
  const [page, arg] = path.split("/");
  try {
    if (page === "") app.innerHTML = viewHome();
    else if (page === "subject") { app.innerHTML = viewSubject(arg); renderLibrary(); }
    else if (page === "quizzes") app.innerHTML = viewQuizzes(arg);
    else if (page === "quiz") await viewQuiz(arg);
    else if (page === "lab") await viewLab(arg);
    else if (page === "request") { app.innerHTML = viewRequest(); fillChapterSelect(); }
    else if (page === "about") app.innerHTML = viewAbout();
    else if (page === "tools") { app.innerHTML = viewSubnet(); mountSubnet(); }
    else if (page === "progress") app.innerHTML = viewProgress();
    else app.innerHTML = viewNotFound();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<section class="container section">${emptyState("info", "Impossible de charger cette page", esc(err.message))}</section>`;
  }
  const titles = { "": "", subject: subjectById(arg)?.name, quizzes: "Quiz", quiz: "Quiz", lab: "Terminal", request: "Demander une ressource", about: "À propos", tools: "Calculateur IPv4", progress: "Ma progression" };
  document.title = titles[page] ? `${titles[page]} · BTSPath` : "BTSPath";
  window.scrollTo(0, 0);
}

// ---------- events (delegated) ----------

app.addEventListener("click", async (e) => {
  const t = e.target;
  if (handleSubnetEvent(e)) return;

  if (t.closest("[data-export]")) {
    const blob = new Blob([store.exportBackup()], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob), download: `btspath-progression-${new Date().toISOString().slice(0, 10)}.json`,
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    document.getElementById("backup-status").textContent = "Sauvegarde téléchargée.";
    return;
  }

  if (t.closest("[data-reset-progress]")) {
    if (confirm("Effacer toute ta progression et tes scores sur cet appareil ?")) { store.resetProgress(); route(); }
    return;
  }

  const statusBtn = t.closest("[data-status]");
  if (statusBtn) {
    const li = statusBtn.closest("[data-id]");
    const id = li.dataset.id;
    store.setStatus(id, statusBtn.dataset.status);
    li.className = `res status-${statusBtn.dataset.status}`;
    li.querySelectorAll("[data-status]").forEach((b) => b.setAttribute("aria-pressed", b === statusBtn));
    document.getElementById("subject-stats").innerHTML = subjectStats(resourcesOf(filters.subject), subjectById(filters.subject));
    return;
  }

  const open = t.closest("[data-open]");
  if (open) store.setLast(open.dataset.open);

  const sem = t.closest("[data-sem]");
  if (sem) {
    filters.sem = sem.dataset.sem;
    document.querySelectorAll("[data-sem]").forEach((b) => b.setAttribute("aria-selected", b === sem));
    renderLibrary();
  }

  if (t.closest("[data-reset]")) {
    Object.assign(filters, { sem: "all", q: "", type: "all", status: "all" });
    app.innerHTML = viewSubject(filters.subject);
    renderLibrary();
  }

  const scroll = t.closest("[data-scroll]");
  if (scroll) {
    e.preventDefault();
    document.getElementById(scroll.dataset.scroll)?.scrollIntoView({ behavior: "smooth" });
  }

  if (t.closest("[data-search]")) openPalette();

  if (t.closest("[data-copy]")) {
    const form = document.getElementById("request-form");
    const status = document.getElementById("req-status");
    try {
      await navigator.clipboard.writeText(requestText(form).text);
      status.textContent = "Demande copiée. Colle-la dans un message pour la transmettre.";
    } catch {
      status.textContent = "Copie impossible dans ce navigateur. Sélectionne le texte manuellement.";
    }
  }
});

app.addEventListener("input", (e) => {
  if (handleSubnetEvent(e)) return;
  if (e.target.id === "lib-q") { filters.q = e.target.value; renderLibrary(); }
});

app.addEventListener("change", async (e) => {
  if (e.target.id === "import-file" && e.target.files[0]) {
    const status = document.getElementById("backup-status");
    try {
      const text = await e.target.files[0].text();
      if (!confirm("Remplacer la progression de cet appareil par celle du fichier ?")) return;
      const n = store.importBackup(text);
      route();
      document.getElementById("backup-status").textContent = `Sauvegarde importée : ${n} chapitre${n > 1 ? "s" : ""} suivi${n > 1 ? "s" : ""}.`;
    } catch (err) {
      status.textContent = err instanceof SyntaxError ? "Ce fichier n'est pas lisible." : err.message;
      status.classList.add("is-error");
    }
    return;
  }
  if (e.target.id === "lib-type") { filters.type = e.target.value; renderLibrary(); }
  if (e.target.id === "lib-status") { filters.status = e.target.value; renderLibrary(); }
  if (e.target.form?.id === "request-form" && (e.target.name === "subject" || e.target.name === "semester")) fillChapterSelect();
});

app.addEventListener("submit", (e) => {
  if (e.target.id !== "request-form") return;
  e.preventDefault();
  const { d, text } = requestText(e.target);
  if (REQUEST_FORM_URL) {
    const url = REQUEST_FORM_URL.replace(/\{(subject|semester|chapter|need|message)\}/g, (_, k) => encodeURIComponent(d[k] || ""));
    window.open(url, "_blank", "noopener");
  } else if (REQUEST_EMAIL) {
    location.href = `mailto:${REQUEST_EMAIL}?subject=${encodeURIComponent("Demande de ressource BTSPath")}&body=${encodeURIComponent(text)}`;
  }
});

// ---------- quick search palette (Ctrl+K or /) ----------

const palette = document.getElementById("palette");
const pq = document.getElementById("palette-q");
const pr = document.getElementById("palette-results");
let pIndex = 0;

function openPalette() {
  if (!manifest || palette.open) return;
  pq.value = "";
  renderPalette();
  palette.showModal();
  pq.focus();
}

function paletteMatches() {
  const q = norm(pq.value.trim());
  const words = q.split(/\s+/).filter(Boolean);
  return manifest.resources.filter((r) => !r.duplicateOf).filter((r) => {
    const hay = norm(`${r.label} ${r.filename} ${r.subject} ${r.semester}`);
    return words.every((w) => hay.includes(w));
  }).slice(0, 8);
}

function renderPalette() {
  const items = paletteMatches();
  pIndex = Math.min(pIndex, Math.max(items.length - 1, 0));
  pr.innerHTML = items.length ? items.map((r, i) => `
    <li role="option" aria-selected="${i === pIndex}">
      <a href="${r.path}" target="_blank" rel="noopener" data-open="${r.id}" ${r.type === "pdf" ? "" : `download="${esc(r.filename)}"`}>
        <span class="subject-icon sm" data-subject="${r.subject}">${icon(SUBJECT_ICON[r.subject], 16)}</span>
        <span class="p-main"><strong>${esc(r.label)}</strong><small>${esc(subjectById(r.subject).name)} · ${esc(r.semester)} · ${r.type.toUpperCase()}</small></span>
        ${icon(r.type === "pdf" ? "external" : "download", 16)}
      </a>
    </li>`).join("") : `<li class="p-empty">Aucune ressource trouvée.</li>`;
}

pq.addEventListener("input", () => { pIndex = 0; renderPalette(); });
pq.addEventListener("keydown", (e) => {
  const n = pr.querySelectorAll("[role=option]").length;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!n) return;
    pIndex = (pIndex + (e.key === "ArrowDown" ? 1 : n - 1)) % n;
    renderPalette();
    pr.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  } else if (e.key === "Enter") {
    e.preventDefault();
    pr.querySelector('[aria-selected="true"] a')?.click();
  }
});
pr.addEventListener("click", (e) => {
  const a = e.target.closest("[data-open]");
  if (a) { store.setLast(a.dataset.open); palette.close(); if (!location.hash || location.hash === "#/") route(); }
});
palette.addEventListener("click", (e) => { if (e.target === palette) palette.close(); });

document.addEventListener("keydown", (e) => {
  const typing = /input|textarea|select/i.test(e.target.tagName);
  if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
    e.preventDefault();
    openPalette();
  }
});

document.getElementById("open-search").addEventListener("click", openPalette);
document.getElementById("theme-toggle").addEventListener("click", () => {
  const dark = applyTheme();
  store.setTheme(dark ? "light" : "dark");
  applyTheme();
});

// ---------- offline + install (PWA) ----------

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Service worker:", err));
}

function updateOnline() {
  document.getElementById("offline").hidden = navigator.onLine;
}
window.addEventListener("online", updateOnline);
window.addEventListener("offline", updateOnline);
updateOnline();

let installPrompt = null;
const installBtn = document.getElementById("install");
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  installBtn.hidden = false;
});
installBtn.addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  installBtn.hidden = true;
});
window.addEventListener("appinstalled", () => (installBtn.hidden = true));

// ---------- start ----------

document.getElementById("brand-logo").innerHTML = LOGO;
document.getElementById("search-icon").innerHTML = icon("search", 18);
document.getElementById("palette-icon").innerHTML = icon("search", 20);
installBtn.innerHTML = icon("install", 18) + "<span>Installer</span>";
document.getElementById("offline").innerHTML = icon("offline", 16) + "<span>Hors ligne — les pages et les ressources déjà ouvertes restent disponibles.</span>";
applyTheme();

try {
  [manifest, quizIndex, labIndex] = await Promise.all([
    getJSON("data/manifest.json"),
    getJSON("data/quizzes/index.json"),
    getJSON("data/labs/index.json").catch(() => ({ labs: [] })),
  ]);
  window.addEventListener("hashchange", route);
  route();
} catch (err) {
  console.error(err);
  app.innerHTML = `<section class="container section">${emptyState("info", "Les données n'ont pas pu être chargées",
    location.protocol === "file:"
      ? "Ouvre BTSPath avec un petit serveur local : dans le dossier du projet, lance <code>python -m http.server 8000</code> puis va sur <code>http://localhost:8000</code>."
      : esc(err.message))}</section>`;
}

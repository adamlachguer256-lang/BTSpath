// Everything BTSPath remembers is kept in this browser's localStorage.
// Nothing is sent anywhere: progress stays on this device and this browser only.

const KEY = "btspath:v1";

const defaults = () => ({ progress: {}, last: null, quizBest: {}, labs: {}, theme: null, days: [], exam: null });

let state = defaults();
try {
  state = { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || "{}") };
} catch {
  // storage blocked or corrupted: start empty, the site still works
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // ignore (private mode, storage full...)
  }
}

export const STATUSES = [
  { id: "todo", label: "Pas commencé" },
  { id: "learning", label: "En cours" },
  { id: "revised", label: "Révisé" },
];

export function getStatus(id) {
  return state.progress[id] || "todo";
}

export function setStatus(id, status) {
  if (status === "todo") delete state.progress[id];
  else { state.progress[id] = status; markToday(); }
  save();
}

export function getLast() {
  return state.last;
}

export function setLast(resourceId) {
  state.last = { id: resourceId, at: Date.now() };
  markToday();
  save();
}

// ---------- study streak: the days a chapter was marked or a resource opened ----------

// local date as "YYYY-MM-DD"
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function markToday() {
  const today = dayKey();
  if (state.days.at(-1) !== today) state.days = [...state.days.filter((d) => d !== today), today].slice(-60);
}

// Days in a row up to today. Still alive if the last study day was yesterday.
export function getStreak() {
  const days = new Set(state.days);
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return { days: n, today: days.has(dayKey()) };
}

// ---------- exam plan: { date: "YYYY-MM-DD", chapters: [resource ids] } ----------

export function getExam() {
  return state.exam;
}

export function setExam(exam) {
  state.exam = exam;
  save();
}

export function getQuizBest(quizId) {
  return state.quizBest[quizId] ?? null;
}

export function setQuizBest(quizId, percent) {
  if (percent > (state.quizBest[quizId] ?? -1)) {
    state.quizBest[quizId] = percent;
    save();
  }
}

// terminal labs: { index: next step, helped: [steps solved with help], done }
export function getLab(labId) {
  return state.labs[labId] ?? null;
}

export function setLab(labId, value) {
  state.labs[labId] = value;
  save();
}

// ---------- backup / restore (moves progress to another device by file) ----------

export function exportBackup() {
  return JSON.stringify({ app: "BTSPath", version: 1, exported: new Date().toISOString(), data: state }, null, 2);
}

// Returns the number of chapters restored, or throws if the file is not a BTSPath backup.
export function importBackup(text) {
  const file = JSON.parse(text);
  if (file?.app !== "BTSPath" || typeof file.data !== "object") throw new Error("Ce fichier n'est pas une sauvegarde BTSPath.");
  const valid = new Set(["learning", "revised"]);
  const progress = {};
  for (const [id, s] of Object.entries(file.data.progress || {})) if (valid.has(s)) progress[id] = s;
  const quizBest = {};
  for (const [id, v] of Object.entries(file.data.quizBest || {})) if (Number.isFinite(v)) quizBest[id] = Math.max(0, Math.min(100, v));
  const labs = {};
  for (const [id, v] of Object.entries(file.data.labs || {})) {
    if (v && Number.isInteger(v.index) && v.index >= 0) {
      labs[id] = { index: v.index, helped: Array.isArray(v.helped) ? v.helped.filter(Number.isInteger) : [], done: !!v.done };
    }
  }
  const days = Array.isArray(file.data.days) ? file.data.days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().slice(-60) : [];
  const e = file.data.exam;
  const exam = e && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && Array.isArray(e.chapters) ? { date: e.date, chapters: e.chapters.map(String) } : null;
  state = { ...state, progress, quizBest, labs, days, exam, last: file.data.last?.id ? { id: String(file.data.last.id), at: Number(file.data.last.at) || 0 } : null };
  save();
  return Object.keys(progress).length;
}

export function resetProgress() {
  state = { ...defaults(), theme: state.theme };
  save();
}

export function getTheme() {
  return state.theme;
}

export function setTheme(theme) {
  state.theme = theme;
  save();
}

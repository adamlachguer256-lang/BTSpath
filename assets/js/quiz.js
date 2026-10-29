// Reusable multiple-choice quiz component.
// Usage: renderQuiz(containerElement, quizData, quizId)
// quizData format: see data/quizzes/demo-btspath.json

import { icon } from "./icons.js";
import { getQuizBest, setQuizBest } from "./store.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const LETTERS = ["A", "B", "C", "D", "E", "F"];

// Shuffles the choices of every question (keeps track of the right answer),
// so the correct answer is not always at the same letter.
function shuffleChoices(questions) {
  return questions.map((q) => {
    const order = q.choices.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return { ...q, choices: order.map((i) => q.choices[i]), answer: order.indexOf(q.answer) };
  });
}

export function renderQuiz(root, original, quizId) {
  const quiz = { ...original, questions: shuffleChoices(original.questions) };
  let index = 0;
  let answers = []; // index chosen for each question

  function question() {
    const q = quiz.questions[index];
    const chosen = answers[index];
    const done = chosen !== undefined;
    const pct = Math.round((index / quiz.questions.length) * 100);

    root.innerHTML = `
      <div class="quiz-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${quiz.questions.length}" aria-valuenow="${index}">
        <span style="width:${pct}%"></span>
      </div>
      <p class="quiz-count">Question ${index + 1} / ${quiz.questions.length}</p>
      <h2 class="quiz-question">${esc(q.question)}</h2>
      <div class="choices" role="group" aria-label="Réponses">
        ${q.choices.map((c, i) => {
          let state = "";
          if (done && i === q.answer) state = "is-correct";
          else if (done && i === chosen) state = "is-wrong";
          return `<button class="choice ${state}" data-choice="${i}" ${done ? "disabled" : ""}>
            <span class="choice-key">${LETTERS[i]}</span><span>${esc(c)}</span>
            ${state === "is-correct" ? icon("check", 18) : state === "is-wrong" ? icon("x", 18) : ""}
          </button>`;
        }).join("")}
      </div>
      <div class="quiz-feedback" aria-live="polite">
        ${done ? `
          <div class="feedback ${chosen === q.answer ? "good" : "bad"}">
            <strong>${chosen === q.answer ? "Bonne réponse !" : "Pas tout à fait."}</strong>
            ${q.explanation ? `<p>${esc(q.explanation)}</p>` : ""}
          </div>
          <button class="btn btn-primary" data-next>
            ${index + 1 < quiz.questions.length ? "Question suivante" : "Voir mon score"} ${icon("arrow", 18)}
          </button>` : `<p class="hint">Astuce : tu peux répondre avec les touches A, B, C, D.</p>`}
      </div>`;
    if (done) root.querySelector("[data-next]").focus({ preventScroll: true });
  }

  function result() {
    const score = answers.filter((a, i) => a === quiz.questions[i].answer).length;
    const total = quiz.questions.length;
    const pct = Math.round((score / total) * 100);
    const previousBest = getQuizBest(quizId);
    setQuizBest(quizId, pct);
    const message = pct === 100 ? "Parfait, tout est juste !" : pct >= 70 ? "Très bien, continue comme ça." : pct >= 40 ? "Pas mal — relis le chapitre et réessaie." : "Reprends le chapitre, puis retente ta chance.";
    const r = 52, c = 2 * Math.PI * r;

    root.innerHTML = `
      <div class="quiz-result">
        <svg class="ring big" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="${r}" class="ring-track"/>
          <circle cx="60" cy="60" r="${r}" class="ring-value" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}"/>
        </svg>
        <div class="ring-label"><strong>${score}/${total}</strong><span>${pct}%</span></div>
        <h2>${message}</h2>
        ${previousBest !== null ? `<p class="muted">Meilleur score précédent : ${previousBest}%</p>` : ""}
        <div class="row-actions center">
          <button class="btn btn-primary" data-retry>${icon("retry", 18)} Réessayer</button>
          <a class="btn btn-ghost" href="#/quizzes">Tous les quiz</a>
        </div>
      </div>
      <h3 class="review-title">Correction</h3>
      <ol class="review">
        ${quiz.questions.map((q, i) => `
          <li class="${answers[i] === q.answer ? "good" : "bad"}">
            <span class="review-icon">${icon(answers[i] === q.answer ? "check" : "x", 16)}</span>
            <div><p>${esc(q.question)}</p>
            <p class="muted">Bonne réponse : ${esc(q.choices[q.answer])}</p></div>
          </li>`).join("")}
      </ol>`;
    root.querySelector("[data-retry]").focus({ preventScroll: true });
  }

  function choose(i) {
    if (answers[index] !== undefined || !(i in quiz.questions[index].choices)) return;
    answers[index] = i;
    question();
  }

  root.onclick = (e) => {
    const choice = e.target.closest("[data-choice]");
    if (choice) return choose(Number(choice.dataset.choice));
    if (e.target.closest("[data-next]")) {
      index += 1;
      return index < quiz.questions.length ? question() : result();
    }
    if (e.target.closest("[data-retry]")) {
      index = 0;
      answers = [];
      quiz.questions = shuffleChoices(original.questions);
      question();
    }
  };

  // keyboard: A/B/C/D or 1-4 to answer
  const onKey = (e) => {
    if (!root.isConnected) return document.removeEventListener("keydown", onKey);
    if (e.ctrlKey || e.metaKey || e.altKey || /input|textarea|select/i.test(e.target.tagName)) return;
    const k = e.key.toUpperCase();
    const i = LETTERS.indexOf(k) >= 0 ? LETTERS.indexOf(k) : /^[1-6]$/.test(k) ? Number(k) - 1 : -1;
    if (i >= 0 && index < quiz.questions.length) choose(i);
  };
  document.addEventListener("keydown", onKey);

  question();
}

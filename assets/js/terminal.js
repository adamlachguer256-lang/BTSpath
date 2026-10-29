// Guided terminal: the student types real commands, step by step, for one chapter.
// Usage: renderLab(containerElement, labData, labId) — lab format: see data/labs/*.json

import { icon } from "./icons.js";
import { getLab, setLab } from "./store.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Same command written slightly differently should still count: extra spaces, long dashes, trailing ";".
const normalize = (cmd) => cmd.replace(/[\u2013\u2014\u2212]/g, "-").replace(/\s+/g, " ").replace(/\s*;\s*$/, "").trim();

const BUILTINS = ["cd", "echo", "pwd", "type", "history", "help", "exit", "export", "alias"];

// A few generic commands behave like a real terminal, so the student can look around freely.
function simulate(cmd, ctx) {
  const [name, ...args] = cmd.split(" ");
  const root = ctx.root;
  switch (name) {
    case "pwd": return root ? "/root" : "/home/etudiant";
    case "whoami": return root ? "root" : "etudiant";
    case "id": return root ? "uid=0(root) gid=0(root) groupes=0(root)" : "uid=1000(etudiant) gid=1000(etudiant) groupes=1000(etudiant),27(sudo)";
    case "ls": return args.length ? null : root ? "" : "Bureau  Documents  Images  Musique  Téléchargements";
    case "history": return ctx.history.map((h, i) => `${String(i + 1).padStart(5)}  ${h}`).join("\n");
    case "echo": {
      const text = args.join(" ");
      if (text === "$PS1") return "\\u@\\h:\\w\\$ ";
      if (text === "$SHELL") return "/bin/bash";
      if (text === "$HOME") return root ? "/root" : "/home/etudiant";
      if (/>/.test(text)) return "";
      return text.replace(/^["']|["']$/g, "");
    }
    case "type": {
      if (!args[0]) return null;
      return BUILTINS.includes(args[0]) ? `${args[0]} est une primitive du shell` : `${args[0]} est /usr/bin/${args[0]}`;
    }
    case "man":
      if (args[0] === "ls") return "LS(1)                    Commandes de l'utilisateur                    LS(1)\n\nNOM\n       ls - afficher le contenu de répertoires\n\nSYNOPSIS\n       ls [OPTION]... [FICHIER]...\n\n(simulation — dans un vrai terminal, appuie sur q pour quitter)";
      return args[0] ? `(simulation) Pas de page de manuel pour ${args[0]} dans le simulateur.` : "Quelle page de manuel voulez-vous ?";
    case "help":
      return "Commandes du simulateur : clear, history, pwd, whoami, help\nBoutons « Indice » et « Solution » sous le terminal.\nTape la commande demandée dans la consigne, puis Entrée.";
    default: return null;
  }
}

// commands that never count as a mistake (looking around is allowed)
const NEUTRAL = new Set(["clear", "help", "history", "pwd", "whoami"]);

export function renderLab(root, lab, labId) {
  const steps = [...lab.steps];
  if (lab.challenge) steps.push({ ...lab.challenge, challenge: true });

  const saved = getLab(labId);
  const state = {
    index: Math.min(saved?.index ?? 0, steps.length),
    helped: new Set(saved?.helped ?? []),
    tries: 0,
    seq: 0, // position inside a multi-command challenge
    history: [],
    histPos: 0,
    lines: [],
  };
  // A step can change the prompt (e.g. "A:~#" → "A:/mnt#"), like in the course examples.
  const promptAt = (i) => {
    let p = lab.prompt;
    for (let k = 0; k <= Math.min(i, steps.length - 1); k++) if (steps[k].prompt) p = steps[k].prompt;
    return p;
  };
  const ctx = { root: lab.prompt.trim().endsWith("#"), history: state.history };

  const persist = () => setLab(labId, { index: state.index, helped: [...state.helped], done: state.index >= steps.length });

  root.innerHTML = `
    <div class="lab-top">
      <div class="lab-steps" id="lab-steps" aria-label="Étapes"></div>
      <div class="lab-task" id="lab-task" aria-live="polite"></div>
    </div>
    <div class="term" id="term">
      <div class="term-bar"><span></span><span></span><span></span><strong>${esc(lab.prompt.replace(/[#$]$/, "").trim())}</strong></div>
      <div class="term-body" id="term-body">
        <div id="term-out"></div>
        <form class="term-line" id="term-form" autocomplete="off">
          <label class="term-prompt" for="term-in">${esc(lab.prompt)}</label>
          <input id="term-in" spellcheck="false" autocapitalize="off" autocorrect="off" enterkeyhint="send" aria-label="Commande">
        </form>
      </div>
    </div>
    <div class="lab-help">
      <button class="btn btn-ghost btn-sm" data-hint>${icon("quiz", 16)} Indice</button>
      <button class="btn btn-ghost btn-sm" data-solution>${icon("info", 16)} Solution</button>
      <button class="btn btn-ghost btn-sm" data-restart>${icon("retry", 16)} Recommencer</button>
    </div>`;

  const out = root.querySelector("#term-out");
  const body = root.querySelector("#term-body");
  const input = root.querySelector("#term-in");

  function print(html, cls = "") {
    state.lines.push(`<div class="t-line ${cls}">${html}</div>`);
    out.innerHTML = state.lines.join("");
    body.scrollTop = body.scrollHeight;
  }

  function current() { return steps[state.index]; }

  function expected(step) {
    if (step.accept_sequence) return step.accept_sequence[state.seq] || [];
    return step.accept || [];
  }

  function renderHeader() {
    root.querySelector("#lab-steps").innerHTML = steps.map((s, i) => {
      const cls = i < state.index ? (state.helped.has(i) ? "helped" : "done") : i === state.index ? "now" : "";
      return `<span class="lab-dot ${cls}" title="${s.challenge ? "Défi" : `Étape ${i + 1}`}">${s.challenge ? "★" : i + 1}</span>`;
    }).join("");

    const task = root.querySelector("#lab-task");
    const step = current();
    root.querySelector(".term-prompt").textContent = promptAt(state.index);
    if (!step) {
      const clean = steps.length - state.helped.size;
      task.innerHTML = `<div class="lab-done">
        <strong>${icon("check", 20)} Terminal terminé !</strong>
        <p>${clean}/${steps.length} étapes réussies sans aide.${state.helped.size ? " Refais les étapes en jaune pour t'entraîner." : " Parfait."}</p>
        <div class="row-actions">
          <button class="btn btn-primary btn-sm" data-restart>${icon("retry", 16)} Recommencer</button>
          <a class="btn btn-ghost btn-sm" href="#/subject/${lab.chapterId.split("-")[0].toUpperCase()}">Retour au chapitre</a>
        </div></div>`;
      input.disabled = true;
      root.querySelector(".lab-help").hidden = true;
      return;
    }
    input.disabled = false;
    root.querySelector(".lab-help").hidden = false;
    root.querySelector("[data-hint]").hidden = !!step.challenge;
    const seqInfo = step.accept_sequence ? ` <span class="muted">(${state.seq + 1}/${step.accept_sequence.length} commandes)</span>` : "";
    task.innerHTML = `<span class="lab-label">${step.challenge ? "Défi final · sans indice" : `Étape ${state.index + 1} / ${steps.length - (lab.challenge ? 1 : 0)}`}</span>
      ${step.section ? `<span class="lab-section">${icon("book", 14)} Cours : ${esc(step.section)}</span>` : ""}
      <p>${esc(step.task)}${seqInfo}</p>`;
  }

  function nextStep() {
    state.index += 1;
    state.tries = 0;
    state.seq = 0;
    persist();
    renderHeader();
    if (state.index >= steps.length) print(`${icon("check", 14)} Bravo, tu as terminé « ${esc(lab.title)} ».`, "t-ok");
  }

  function run(raw) {
    const cmd = normalize(raw);
    print(`<span class="t-prompt">${esc(promptAt(state.index))}</span> ${esc(raw)}`);
    if (!cmd) return;
    state.history.push(cmd);
    state.histPos = state.history.length;

    if (cmd === "clear") { state.lines = []; out.innerHTML = ""; return; }

    const step = current();
    if (!step) {
      const res = simulate(cmd, ctx);
      print(res === null ? `${esc(cmd.split(" ")[0])} : commande non disponible dans le simulateur` : esc(res), res === null ? "t-err" : "");
      return;
    }

    if (expected(step).some((a) => normalize(a) === cmd)) {
      const result = step.accept_sequence ? "" : step.output ?? simulate(cmd, ctx) ?? "";
      if (result) print(esc(result));
      if (step.accept_sequence && state.seq + 1 < step.accept_sequence.length) {
        state.seq += 1;
        print(`${icon("check", 14)} Bien. Continue…`, "t-ok");
        renderHeader();
        return;
      }
      print(`${icon("check", 14)} Correct !${step.note ? " " + esc(step.note) : ""}`, "t-ok");
      nextStep();
      return;
    }

    if (NEUTRAL.has(cmd.split(" ")[0])) {
      const res = simulate(cmd, ctx);
      if (res) print(esc(res));
      return;
    }

    state.tries += 1;
    if (step.challenge) {
      print(`✗ Ce n'est pas ça.${state.tries >= 3 ? " Tu peux afficher la solution." : ""}`, "t-err");
    } else if (state.tries === 1) {
      print(`✗ Pas tout à fait. 💡 ${esc(step.hint || "Relis la consigne.")}`, "t-err");
    } else if (state.tries === 2) {
      const first = expected(step)[0].split(" ")[0];
      print(`✗ Encore un essai. La commande commence par : <code>${esc(first)} …</code>`, "t-err");
    } else {
      showSolution();
    }
  }

  function showSolution() {
    const step = current();
    if (!step) return;
    state.helped.add(state.index);
    persist();
    print(`Solution : <code>${esc(expected(step)[0])}</code> — tape-la pour continuer.`, "t-hint");
    renderHeader();
  }

  root.querySelector("#term-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const value = input.value;
    input.value = "";
    run(value);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      if (!state.history.length) return;
      state.histPos = Math.max(0, Math.min(state.history.length, state.histPos + (e.key === "ArrowUp" ? -1 : 1)));
      input.value = state.history[state.histPos] ?? "";
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      state.lines = []; out.innerHTML = "";
    }
  });

  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-hint]")) {
      const step = current();
      if (step) { state.helped.add(state.index); persist(); renderHeader(); print(`💡 ${esc(step.hint || "Relis la consigne.")}`, "t-hint"); }
    } else if (e.target.closest("[data-solution]")) {
      showSolution();
    } else if (e.target.closest("[data-restart]")) {
      Object.assign(state, { index: 0, tries: 0, seq: 0, lines: [] });
      state.helped.clear();
      out.innerHTML = "";
      persist();
      intro();
      renderHeader();
      input.focus();
    } else if (e.target.closest("#term-body") && !window.getSelection().toString()) {
      input.focus();
    }
  });

  function intro() {
    print(esc(lab.intro), "t-intro");
    print("Tape <code>help</code> pour l'aide. Flèche ↑ pour reprendre une commande.", "t-intro");
    if (state.index > 0 && state.index < steps.length) print(`Reprise à l'étape ${state.index + 1}.`, "t-intro");
  }

  intro();
  renderHeader();
  input.focus({ preventScroll: true });
}

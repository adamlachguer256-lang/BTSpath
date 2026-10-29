// IPv4 subnet + VLSM calculator. Pure maths, no data files.

import { icon } from "./icons.js";

// ---------- IPv4 maths ----------

function parseIp(text) {
  const parts = String(text).trim().split(".");
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return null;
  return parts.reduce((acc, p) => ((acc << 8) + Number(p)) >>> 0, 0);
}

const toIp = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join(".");
const maskOf = (prefix) => (prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0);

function prefixFromMask(text) {
  const m = parseIp(text);
  if (m === null) return null;
  const bits = m.toString(2).padStart(32, "0");
  return /^1*0*$/.test(bits) ? bits.indexOf("0") === -1 ? 32 : bits.indexOf("0") : null;
}

// accepts "192.168.1.10/26", "192.168.1.10 255.255.255.192" or "192.168.1.10" + separate mask
function parseCidr(text, maskText = "") {
  const [ipPart, rest] = String(text).trim().split(/\s*\/\s*|\s+/);
  const ip = parseIp(ipPart);
  if (ip === null) return { error: "Adresse IP invalide (exemple : 192.168.1.10)." };
  let prefix = null;
  const p = rest ?? maskText.trim();
  if (/^\d{1,2}$/.test(p) && Number(p) <= 32) prefix = Number(p);
  else if (p) prefix = prefixFromMask(p);
  if (prefix === null) return { error: "Préfixe ou masque invalide (exemple : /26 ou 255.255.255.192)." };
  return { ip, prefix };
}

export function subnetInfo(ip, prefix) {
  const mask = maskOf(prefix);
  const network = (ip & mask) >>> 0;
  const broadcast = (network | ~mask) >>> 0;
  const size = 2 ** (32 - prefix);
  const usable = prefix === 32 ? 1 : prefix === 31 ? 2 : size - 2;
  const first = prefix >= 31 ? network : network + 1;
  const last = prefix >= 31 ? broadcast : broadcast - 1;
  const o1 = ip >>> 24, o2 = (ip >>> 16) & 255;
  const cls = o1 === 0 ? "—" : o1 < 127 ? "A" : o1 === 127 ? "A (bouclage)" : o1 < 192 ? "B" : o1 < 224 ? "C" : o1 < 240 ? "D (multicast)" : "E (réservée)";
  const kind = o1 === 10 || (o1 === 172 && o2 >= 16 && o2 <= 31) || (o1 === 192 && o2 === 168) ? "Privée (RFC 1918)"
    : o1 === 127 ? "Bouclage (loopback)" : o1 === 169 && o2 === 254 ? "APIPA (lien local)" : o1 >= 224 ? "Spéciale" : "Publique";
  return { ip, prefix, mask, network, broadcast, size, usable, first, last, cls, kind, wildcard: (~mask) >>> 0 };
}

// Allocates subnets biggest first so every block stays aligned.
export function vlsm(baseIp, basePrefix, needs) {
  const base = subnetInfo(baseIp, basePrefix);
  let cursor = base.network;
  const rows = [...needs].map((n, i) => ({ ...n, order: i })).sort((a, b) => b.hosts - a.hosts);
  const out = [];
  for (const n of rows) {
    let bits = 0;
    while (2 ** bits - 2 < n.hosts) bits++;
    if (bits < 2) bits = 2; // smallest usable block: /30
    const prefix = 32 - bits;
    if (prefix < basePrefix || cursor + 2 ** bits - 1 > base.broadcast) {
      return { error: `Pas assez d'adresses dans ${toIp(base.network)}/${basePrefix} pour « ${n.name} » (${n.hosts} hôtes).` };
    }
    out.push({ ...n, ...subnetInfo(cursor, prefix) });
    cursor += 2 ** bits;
  }
  const used = cursor - base.network;
  return { base, rows: out, used, free: base.size - used };
}

// ---------- view ----------

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function binary(n, prefix) {
  const bits = n.toString(2).padStart(32, "0");
  return bits.match(/.{8}/g).map((oct, i) =>
    [...oct].map((b, j) => `<span class="${i * 8 + j < prefix ? "bn" : "bh"}">${b}</span>`).join("")).join('<span class="bdot">.</span>');
}

const state = { tab: "subnet", cidr: "192.168.1.10/26", base: "192.168.10.0/24",
  needs: [{ name: "LAN A", hosts: 50 }, { name: "LAN B", hosts: 25 }, { name: "LAN C", hosts: 10 }, { name: "Liaison WAN", hosts: 2 }] };

export function viewSubnet() {
  return `<section class="container section page">
    <a class="crumb" href="#/subject/NETWORK">${icon("back", 16)} Network</a>
    <div class="section-head">
      <h1>Calculateur IPv4</h1>
      <p class="muted">Calcule un sous-réseau ou découpe un réseau en VLSM. Tout est calculé dans ton navigateur.</p>
    </div>
    <div class="tabs" role="tablist" aria-label="Outil">
      <button role="tab" data-tool="subnet" aria-selected="${state.tab === "subnet"}">Sous-réseau</button>
      <button role="tab" data-tool="vlsm" aria-selected="${state.tab === "vlsm"}">VLSM</button>
    </div>
    <div id="tool-body" class="tool-body"></div>
  </section>`;
}

function renderSubnetTab(body) {
  body.innerHTML = `
    <div class="card">
      <label class="tool-label" for="cidr">Adresse IP / préfixe</label>
      <input class="tool-input" id="cidr" value="${esc(state.cidr)}" spellcheck="false" autocomplete="off" inputmode="decimal" placeholder="192.168.1.10/26">
      <p class="hint">Exemples : <code>10.0.0.5/8</code> · <code>172.16.40.1 255.255.240.0</code></p>
    </div>
    <div id="subnet-out" aria-live="polite"></div>`;
  updateSubnet();
}

function updateSubnet() {
  const out = document.getElementById("subnet-out");
  const p = parseCidr(state.cidr);
  if (p.error) { out.innerHTML = `<p class="tool-error">${p.error}</p>`; return; }
  const s = subnetInfo(p.ip, p.prefix);
  const cell = (k, v, mono = true) => `<div class="kv"><span>${k}</span><strong class="${mono ? "mono" : ""}">${v}</strong></div>`;
  out.innerHTML = `
    <div class="kv-grid">
      ${cell("Adresse réseau", `${toIp(s.network)}/${s.prefix}`)}
      ${cell("Broadcast", toIp(s.broadcast))}
      ${cell("Première adresse utilisable", toIp(s.first))}
      ${cell("Dernière adresse utilisable", toIp(s.last))}
      ${cell("Masque", toIp(s.mask))}
      ${cell("Masque générique (wildcard)", toIp(s.wildcard))}
      ${cell("Hôtes utilisables", s.usable.toLocaleString("fr-FR"), false)}
      ${cell("Adresses au total", s.size.toLocaleString("fr-FR"), false)}
      ${cell("Classe", s.cls, false)}
      ${cell("Type", s.kind, false)}
    </div>
    <div class="card bin">
      <p class="bin-title">En binaire <span class="muted">— <span class="bn">partie réseau</span> · <span class="bh">partie hôte</span></span></p>
      <div class="bin-row"><span>IP</span><code>${binary(s.ip, s.prefix)}</code></div>
      <div class="bin-row"><span>Masque</span><code>${binary(s.mask, s.prefix)}</code></div>
      <div class="bin-row"><span>Réseau</span><code>${binary(s.network, s.prefix)}</code></div>
    </div>`;
}

function renderVlsmTab(body) {
  body.innerHTML = `
    <div class="card">
      <label class="tool-label" for="vlsm-base">Réseau de départ</label>
      <input class="tool-input" id="vlsm-base" value="${esc(state.base)}" spellcheck="false" autocomplete="off" placeholder="192.168.10.0/24">
      <p class="tool-label sub">Sous-réseaux nécessaires</p>
      <div id="needs" class="needs"></div>
      <button class="btn btn-ghost btn-sm" data-add-need>+ Ajouter un sous-réseau</button>
    </div>
    <div id="vlsm-out" aria-live="polite"></div>`;
  renderNeeds();
  updateVlsm();
}

function renderNeeds() {
  document.getElementById("needs").innerHTML = state.needs.map((n, i) => `
    <div class="need">
      <input aria-label="Nom" data-need="${i}" data-field="name" value="${esc(n.name)}">
      <input aria-label="Nombre d'hôtes" data-need="${i}" data-field="hosts" type="number" min="1" value="${n.hosts}">
      <span class="muted need-unit">hôtes</span>
      <button class="icon-btn sm" data-del-need="${i}" aria-label="Supprimer ${esc(n.name)}" ${state.needs.length < 2 ? "disabled" : ""}>${icon("x", 16)}</button>
    </div>`).join("");
}

function updateVlsm() {
  const out = document.getElementById("vlsm-out");
  const p = parseCidr(state.base);
  if (p.error) { out.innerHTML = `<p class="tool-error">${p.error}</p>`; return; }
  const needs = state.needs.filter((n) => n.hosts > 0);
  if (!needs.length) { out.innerHTML = `<p class="tool-error">Indique au moins un sous-réseau avec un nombre d'hôtes.</p>`; return; }
  const r = vlsm(p.ip, p.prefix, needs);
  if (r.error) { out.innerHTML = `<p class="tool-error">${esc(r.error)}</p>`; return; }
  out.innerHTML = `
    <p class="vlsm-summary">Réseau <strong class="mono">${toIp(r.base.network)}/${r.base.prefix}</strong> ·
      ${r.used.toLocaleString("fr-FR")} adresses utilisées · ${r.free.toLocaleString("fr-FR")} libres</p>
    <div class="table-wrap"><table class="vlsm-table">
      <thead><tr><th>Sous-réseau</th><th>Demandés</th><th>Disponibles</th><th>Réseau</th><th>Masque</th><th>Plage utilisable</th><th>Broadcast</th></tr></thead>
      <tbody>${r.rows.map((s) => `<tr>
        <td><strong>${esc(s.name)}</strong></td><td>${s.hosts}</td><td>${s.usable}</td>
        <td class="mono">${toIp(s.network)}/${s.prefix}</td><td class="mono">${toIp(s.mask)}</td>
        <td class="mono">${toIp(s.first)} – ${toIp(s.last)}</td><td class="mono">${toIp(s.broadcast)}</td></tr>`).join("")}
      </tbody></table></div>
    <p class="hint">Les sous-réseaux sont attribués du plus grand au plus petit pour rester alignés.</p>`;
}

export function mountSubnet() {
  const body = document.getElementById("tool-body");
  (state.tab === "subnet" ? renderSubnetTab : renderVlsmTab)(body);
}

// events are delegated from app.js
export function handleSubnetEvent(e) {
  const t = e.target;
  if (e.type === "click") {
    const tab = t.closest("[data-tool]");
    if (tab) {
      state.tab = tab.dataset.tool;
      document.querySelectorAll("[data-tool]").forEach((b) => b.setAttribute("aria-selected", b === tab));
      return mountSubnet(), true;
    }
    if (t.closest("[data-add-need]")) {
      state.needs.push({ name: `LAN ${String.fromCharCode(65 + state.needs.length)}`, hosts: 10 });
      renderNeeds(); updateVlsm();
      return true;
    }
    const del = t.closest("[data-del-need]");
    if (del) { state.needs.splice(Number(del.dataset.delNeed), 1); renderNeeds(); updateVlsm(); return true; }
  }
  if (e.type === "input") {
    if (t.id === "cidr") { state.cidr = t.value; updateSubnet(); return true; }
    if (t.id === "vlsm-base") { state.base = t.value; updateVlsm(); return true; }
    if (t.dataset.need) {
      const n = state.needs[Number(t.dataset.need)];
      n[t.dataset.field] = t.dataset.field === "hosts" ? Math.max(0, parseInt(t.value, 10) || 0) : t.value;
      updateVlsm();
      return true;
    }
  }
  return false;
}

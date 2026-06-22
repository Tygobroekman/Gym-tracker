"use strict";

/* ===================== Opslag ===================== */
const KEY = "gym-tracker-db-v1";
const DEFAULT_MUSCLES = ["Borst", "Rug", "Schouders", "Biceps", "Triceps", "Buik", "Quadriceps", "Hamstrings", "Billen", "Kuiten"];

const DEFAULT_DB = {
  musclesV2: true,
  muscles: [...DEFAULT_MUSCLES],
  exercises: [
    { id: "ex_bench", name: "Bench press", muscle: "Borst", notes: "" },
    { id: "ex_squat", name: "Squat", muscle: "Benen", notes: "" },
    { id: "ex_deadlift", name: "Deadlift", muscle: "Rug", notes: "" },
    { id: "ex_ohp", name: "Overhead press", muscle: "Schouders", notes: "" }
  ],
  activeSession: null,
  sessions: [],
  body: []
};

let db = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_DB);
    const parsed = Object.assign(structuredClone(DEFAULT_DB), JSON.parse(raw));
    return migrate(parsed);
  } catch (e) {
    console.error("Laden mislukt", e);
    return structuredClone(DEFAULT_DB);
  }
}
function migrate(d) {
  if (!Array.isArray(d.muscles) || !d.muscles.length) d.muscles = [...DEFAULT_MUSCLES];
  // Eenmalig de nieuwe, specifiekere spiergroepen toevoegen (zonder bestaande te wissen).
  if (!d.musclesV2) {
    DEFAULT_MUSCLES.forEach((m) => { if (!d.muscles.includes(m)) d.muscles.push(m); });
    d.musclesV2 = true;
  }
  (d.exercises || []).forEach((ex) => {
    if (ex.muscle && !d.muscles.includes(ex.muscle)) d.muscles.push(ex.muscle);
  });
  return d;
}
function save() { localStorage.setItem(KEY, JSON.stringify(db)); }
function uid(p = "id") { return p + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/* ===================== Helpers ===================== */
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Accepteer zowel komma als punt als decimaalteken.
const num = (v) => {
  if (v == null) return null;
  const s = String(v).trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
};
const fmtNum = (v) => (v == null ? "–" : Number(v).toLocaleString("nl-NL", { maximumFractionDigits: 2 }));
const fmtDate = (iso) => new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
const fmtShort = (iso) => new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
const fmtDay = (iso) => new Date(iso).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
const todayISO = () => new Date().toISOString();
const dateInputVal = (iso) => new Date(iso).toISOString().slice(0, 10);
const exerciseById = (id) => db.exercises.find((e) => e.id === id);

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1600);
}

// Duur-formattering.
function fmtTimer(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
function fmtMinutes(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return m + " min";
  return Math.floor(m / 60) + "u " + (m % 60) + "m";
}

// Live sessie-timer.
let timerInterval = null;
function clearTimer() { if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } }
function startSessionTimer() {
  clearTimer();
  const tick = () => {
    const el = $("#session-timer");
    if (!el || !db.activeSession) { clearTimer(); return; }
    el.textContent = fmtTimer((Date.now() - Date.parse(db.activeSession.date)) / 1000);
  };
  tick();
  timerInterval = setInterval(tick, 1000);
}

function entryVolume(entry) { return entry.sets.reduce((a, st) => a + (st.weight || 0) * (st.reps || 0), 0); }
function sessionVolume(s) { return s.entries.reduce((v, e) => v + entryVolume(e), 0); }
function sessionsThisWeek() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(now.getDate() - day);
  return db.sessions.filter((s) => new Date(s.finishedAt || s.date) >= monday).length;
}

// Reeks van prestaties van één oefening over afgeronde sessies.
function exerciseSeries(exId) {
  const out = [];
  db.sessions.forEach((s) => {
    const e = s.entries.find((x) => x.exerciseId === exId);
    if (!e) return;
    const sets = e.sets.filter((st) => st.weight != null || st.reps != null);
    if (!sets.length) return;
    const maxW = Math.max(...sets.map((st) => st.weight || 0));
    const vol = sets.reduce((a, st) => a + (st.weight || 0) * (st.reps || 0), 0);
    out.push({ date: s.finishedAt || s.date, maxW, vol, sets });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
function lastPerformance(exId) {
  const s = exerciseSeries(exId);
  if (!s.length) return null;
  const last = s[s.length - 1];
  const best = last.sets.reduce((a, b) => ((b.weight || 0) > (a.weight || 0) ? b : a));
  return { date: last.date, set: best, sets: last.sets };
}

// Spiergroepen in de door de gebruiker bepaalde volgorde; onbekende/lege groepen achteraan.
function orderedMuscleKeys(presentKeys) {
  const keys = [];
  db.muscles.forEach((m) => { if (presentKeys.includes(m)) keys.push(m); });
  presentKeys.forEach((k) => { if (!keys.includes(k)) keys.push(k); });
  return keys;
}

// Map een spiergroep-naam naar een regio op het lichaam-figuur (specifiek vóór generiek).
function muscleToRegion(name) {
  const n = (name || "").toLowerCase();
  if (/borst|chest|pec/.test(n)) return "chest";
  if (/bicep/.test(n)) return "biceps";
  if (/tricep/.test(n)) return "triceps";
  if (/schouder|delt|shoulder/.test(n)) return "shoulders";
  if (/rug|lat|trap|back/.test(n)) return "back";
  if (/buik|abs|core|romp/.test(n)) return "abs";
  if (/quad|bovenbeen/.test(n)) return "quads";
  if (/hamstring|achterbeen/.test(n)) return "hamstrings";
  if (/bil|glut/.test(n)) return "glutes";
  if (/kuit|calf|calv/.test(n)) return "calves";
  if (/arm/.test(n)) return "biceps";          // generieke "Armen"
  if (/be+n|leg|dij/.test(n)) return "quads";   // generieke "Benen"
  return null;
}

/* ===================== Iconen ===================== */
const ICON = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1V9.5"/></svg>',
  dumbbell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 7v10M3.5 9v6M17.5 7v10M20.5 9v6M6.5 12h11"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>',
  body: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.5" r="2"/><path d="M12 7v8M12 9l-5-1M12 9l5-1M12 15l-3 6M12 15l3 6"/></svg>',
  chevron: '<svg class="chevron" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l6 6-6 6"/></svg>',
  back: '<svg viewBox="0 0 12 20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 1L2 10l8 9"/></svg>',
  plus: '<svg class="plus-circle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
  add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  up: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l5-5 5 5"/></svg>',
  down: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6l5 5 5-5"/></svg>'
};
function iconBtn(act, id = "") { return `<button class="icon-btn" data-act="${act}"${id ? ` data-id="${id}"` : ""}>${ICON.add}</button>`; }
function textAction(act, label, id = "") { return `<button class="title-action" data-act="${act}"${id ? ` data-id="${id}"` : ""}>${label}</button>`; }

/* ===================== Lichaam-figuur: voor- + achterkant ===================== */
function bodyMapSVG(trained) {
  const c = (r) => (trained.has(r) ? "var(--accent)" : "var(--bodymap-off)");
  const skin = "var(--bodymap-skin)";
  const st = `stroke="var(--separator)" stroke-width="0.8"`;

  // Voorkant, gecentreerd op x=90
  const front = `
    <ellipse cx="90" cy="30" rx="15" ry="17" fill="${skin}" ${st}/>
    <rect x="82" y="45" width="16" height="10" rx="4" fill="${skin}" ${st}/>
    <rect x="39" y="116" width="13" height="48" rx="6" fill="${skin}" ${st}/>
    <rect x="128" y="116" width="13" height="48" rx="6" fill="${skin}" ${st}/>
    <circle cx="45" cy="170" r="6" fill="${skin}" ${st}/>
    <circle cx="135" cy="170" r="6" fill="${skin}" ${st}/>
    <path d="M73 148 L107 148 L104 175 L76 175 Z" fill="${skin}" ${st}/>
    <rect x="74" y="256" width="14" height="60" rx="6" fill="${skin}" ${st}/>
    <rect x="92" y="256" width="14" height="60" rx="6" fill="${skin}" ${st}/>
    <path d="M73 316 L88 316 L90 330 L71 330 Z" fill="${skin}" ${st}/>
    <path d="M92 316 L107 316 L109 330 L90 330 Z" fill="${skin}" ${st}/>
    <ellipse cx="57" cy="66" rx="15" ry="13" fill="${c("shoulders")}" ${st}/>
    <ellipse cx="123" cy="66" rx="15" ry="13" fill="${c("shoulders")}" ${st}/>
    <path d="M74 60 L89 60 L89 91 Q74 93 70 79 Q69 66 74 60 Z" fill="${c("chest")}" ${st}/>
    <path d="M106 60 L91 60 L91 91 Q106 93 110 79 Q111 66 106 60 Z" fill="${c("chest")}" ${st}/>
    <rect x="42" y="70" width="15" height="46" rx="7" fill="${c("biceps")}" ${st}/>
    <rect x="123" y="70" width="15" height="46" rx="7" fill="${c("biceps")}" ${st}/>
    <rect x="74" y="91" width="32" height="56" rx="7" fill="${c("abs")}" ${st}/>
    <line x1="90" y1="95" x2="90" y2="143" stroke="var(--separator)" stroke-width="0.8"/>
    <line x1="75" y1="110" x2="105" y2="110" stroke="var(--separator)" stroke-width="0.8"/>
    <line x1="75" y1="126" x2="105" y2="126" stroke="var(--separator)" stroke-width="0.8"/>
    <rect x="73" y="172" width="16" height="82" rx="8" fill="${c("quads")}" ${st}/>
    <rect x="91" y="172" width="16" height="82" rx="8" fill="${c("quads")}" ${st}/>
    <text x="90" y="346" class="bm-cap">Voorkant</text>`;

  // Achterkant, gecentreerd op x=270
  const back = `
    <ellipse cx="270" cy="30" rx="15" ry="17" fill="${skin}" ${st}/>
    <rect x="262" y="45" width="16" height="10" rx="4" fill="${skin}" ${st}/>
    <rect x="219" y="116" width="13" height="48" rx="6" fill="${skin}" ${st}/>
    <rect x="308" y="116" width="13" height="48" rx="6" fill="${skin}" ${st}/>
    <circle cx="225" cy="170" r="6" fill="${skin}" ${st}/>
    <circle cx="315" cy="170" r="6" fill="${skin}" ${st}/>
    <rect x="258" y="114" width="24" height="34" rx="6" fill="${skin}" ${st}/>
    <path d="M253 316 L268 316 L270 330 L251 330 Z" fill="${skin}" ${st}/>
    <path d="M272 316 L287 316 L289 330 L270 330 Z" fill="${skin}" ${st}/>
    <ellipse cx="237" cy="66" rx="15" ry="13" fill="${c("shoulders")}" ${st}/>
    <ellipse cx="303" cy="66" rx="15" ry="13" fill="${c("shoulders")}" ${st}/>
    <path d="M252 55 Q270 48 288 55 L283 77 Q270 71 257 77 Z" fill="${c("back")}" ${st}/>
    <path d="M257 79 L283 79 L278 116 Q270 123 262 116 Z" fill="${c("back")}" ${st}/>
    <rect x="222" y="70" width="15" height="46" rx="7" fill="${c("triceps")}" ${st}/>
    <rect x="303" y="70" width="15" height="46" rx="7" fill="${c("triceps")}" ${st}/>
    <ellipse cx="262" cy="160" rx="13" ry="14" fill="${c("glutes")}" ${st}/>
    <ellipse cx="278" cy="160" rx="13" ry="14" fill="${c("glutes")}" ${st}/>
    <rect x="253" y="176" width="16" height="80" rx="8" fill="${c("hamstrings")}" ${st}/>
    <rect x="271" y="176" width="16" height="80" rx="8" fill="${c("hamstrings")}" ${st}/>
    <rect x="255" y="258" width="14" height="58" rx="7" fill="${c("calves")}" ${st}/>
    <rect x="273" y="258" width="14" height="58" rx="7" fill="${c("calves")}" ${st}/>
    <text x="270" y="346" class="bm-cap">Achterkant</text>`;

  return `<svg viewBox="0 0 360 354" class="bodymap" aria-hidden="true">${front}${back}</svg>`;
}

/* ===================== Navigatie ===================== */
const TABS = [
  { view: "home", label: "Home", icon: "home" },
  { view: "session", label: "Sessie", icon: "dumbbell" },
  { view: "library", label: "Oefeningen", icon: "list" },
  { view: "body", label: "Lichaam", icon: "body" }
];
const TITLES = {
  home: "Home", session: "Sessie", library: "Oefeningen", body: "Lichaam",
  history: "Historie", exercise: "Oefening", muscles: "Spiergroepen"
};

let navStack = [{ view: "home" }];
const cur = () => navStack[navStack.length - 1];
function setTab(view) { navStack = [{ view }]; closeModal(); render(); }
function push(view, param) { navStack.push({ view, param }); closeModal(); render(); }
function back() { if (navStack.length > 1) { navStack.pop(); closeModal(); render(); } }

function renderTabbar() {
  const rootTab = navStack[0].view;
  const idx = Math.max(0, TABS.findIndex((t) => t.view === rootTab));
  $("#tabbar").innerHTML =
    `<div class="tab-highlight" style="--idx:${idx}"></div>` +
    TABS.map((t) => `<button class="tab ${t.view === rootTab ? "active" : ""}" data-tab="${t.view}">
      ${ICON[t.icon]}<span>${t.label}</span></button>`).join("");
}

function render() {
  clearTimer();
  const v = cur().view;
  $("#view-title").textContent = TITLES[v] || "";
  $("#hdr-back").innerHTML = navStack.length > 1 ? `<button class="nav-back" data-act="back">${ICON.back}<span>Terug</span></button>` : "";
  $("#hdr-right").innerHTML = "";
  renderTabbar();
  window.scrollTo(0, 0);
  if (typeof headerEl !== "undefined" && headerEl) headerEl.classList.remove("scrolled");

  if (v === "home") renderHome();
  else if (v === "session") renderSession();
  else if (v === "library") renderLibrary();
  else if (v === "body") renderBody();
  else if (v === "history") renderHistory();
  else if (v === "exercise") renderExerciseDetail(cur().param);
  else if (v === "muscles") renderMuscles();
}

/* ===================== Home ===================== */
function renderHome() {
  const root = $("#view");
  let html = "";

  if (db.activeSession) {
    const n = db.activeSession.entries.length;
    html += `<div class="group-label">Actief</div>
      <div class="group"><div class="row" data-tab-go="session">
        <div class="r-main"><div class="r-title" style="color:var(--accent)">Sessie bezig…</div>
        <div class="r-sub">${esc(db.activeSession.name)} • ${n} oefening${n === 1 ? "" : "en"}</div></div>
        ${ICON.chevron}</div></div>`;
  }

  const last = db.sessions[db.sessions.length - 1];
  html += `<div class="group-label">Laatste sessie</div>`;
  if (last) {
    const totalSets = last.entries.reduce((n, e) => n + e.sets.filter((x) => x.weight != null || x.reps != null).length, 0);
    html += `<div class="group"><div class="row" data-session="${last.id}">
      <div class="r-main"><div class="r-title">${esc(last.name)}</div>
      <div class="r-sub">${fmtDate(last.finishedAt || last.date)} • ${totalSets} sets · ${Math.round(sessionVolume(last))} kg${last.durationSec ? " · " + fmtMinutes(last.durationSec) : ""}</div></div>
      ${ICON.chevron}</div></div>`;
  } else {
    html += `<div class="group"><div class="row"><div class="r-main muted">Nog geen sessies</div></div></div>`;
  }

  const bodyData = db.body.slice().sort((a, b) => a.date.localeCompare(b.date));
  html += `<div class="group-label">Lichaam</div>`;
  if (bodyData.length) {
    const latest = bodyData[bodyData.length - 1];
    const prev = bodyData.length > 1 ? bodyData[bodyData.length - 2] : null;
    const cells = BODY_FIELDS.filter((f) => f.primary).map((f) => {
      const v = latest[f.key];
      let d = "";
      if (prev && prev[f.key] != null && v != null) {
        const diff = +(v - prev[f.key]).toFixed(2);
        if (diff !== 0) d = `<span class="${diff > 0 ? "delta-up" : "delta-down"}"> ${diff > 0 ? "▲" : "▼"}${fmtNum(Math.abs(diff))}</span>`;
      }
      return `<div class="stat"><div class="val">${fmtNum(v)}<span class="u"> ${f.unit}</span></div><div class="lbl">${f.label}${d}</div></div>`;
    }).join("");
    html += `<div class="card" data-tab-go="body" style="cursor:pointer">
      <div class="stat-grid">${cells}</div>
      <p class="muted small center mt">Laatste meting · ${fmtDate(latest.date)}</p></div>`;
  } else {
    html += `<div class="group"><div class="row" data-tab-go="body"><div class="r-main muted">Nog geen metingen</div>${ICON.chevron}</div></div>`;
  }

  html += `<div class="group-label">Overzicht</div>
    <div class="stat-grid" style="margin-bottom:8px">
      <div class="stat"><div class="val">${db.sessions.length}</div><div class="lbl">Sessies</div></div>
      <div class="stat"><div class="val">${sessionsThisWeek()}</div><div class="lbl">Deze week</div></div>
      <div class="stat"><div class="val">${db.exercises.length}</div><div class="lbl">Oefeningen</div></div>
    </div>`;

  html += `<div class="group-label">Meer</div><div class="group">
    <div class="row" data-go="history"><div class="r-main"><div class="r-title">Alle sessies</div></div>${ICON.chevron}</div>
    <div class="row" data-go="muscles"><div class="r-main"><div class="r-title">Spiergroepen beheren</div></div>${ICON.chevron}</div>
  </div>`;

  html += `<div class="mt"></div>`;
  html += db.activeSession
    ? `<button class="btn-primary" data-tab-go="session">Ga verder met sessie</button>`
    : `<button class="btn-primary" data-act="start-session">Nieuwe sessie starten</button>`;
  root.innerHTML = html;
}

/* ===================== Sessie ===================== */
function renderSession() {
  const root = $("#view");
  const s = db.activeSession;

  if (!s) {
    const last = db.sessions[db.sessions.length - 1];
    root.innerHTML = `
      <div class="empty"><span class="big">🏋️</span><p>Geen actieve sessie</p></div>
      <button class="btn-primary" data-act="start-session">Nieuwe sessie starten</button>
      ${last ? `<p class="muted small center mt">Laatste: ${esc(last.name)} • ${fmtDate(last.finishedAt || last.date)}</p>` : ""}`;
    return;
  }

  $("#hdr-right").innerHTML = textAction("finish-session", "Afronden");

  let body = `<div class="field mt"><input id="session-name" value="${esc(s.name)}" data-act="rename-session" /></div>
    <p class="muted small" style="margin:0 4px 0">${fmtDay(s.date)}</p>
    <div class="timer-card">
      <div><div class="t-time" id="session-timer">0:00</div><div class="t-lbl">sessieduur</div></div>
      <div class="t-vol"><div class="v"><span id="session-volume">${Math.round(sessionVolume(s))}</span> kg</div><div class="t-lbl">totaal getild</div></div>
    </div>`;

  // Getrainde spieren
  const trained = sessionTrainedRegions(s);
  const names = [...new Set(s.entries.map((e) => (exerciseById(e.exerciseId) || {}).muscle).filter(Boolean))];
  body += `<div class="card"><div class="card-head"><h3 style="font-size:17px">Getrainde spieren</h3></div>
    ${s.entries.length
      ? bodyMapSVG(trained) + (names.length ? `<div class="chips">${names.map((n) => `<span class="pill">${esc(n)}</span>`).join("")}</div>` : "")
      : `<p class="muted small center" style="padding:14px 0">Voeg oefeningen toe om te zien welke spieren je traint.</p>`}
  </div>`;

  // Oefeningen gegroepeerd op spiergroep (echte index behouden)
  const buckets = {};
  s.entries.forEach((entry, ei) => {
    const ex = exerciseById(entry.exerciseId);
    const key = ex && ex.muscle ? ex.muscle : "Overig";
    (buckets[key] = buckets[key] || []).push({ entry, ei });
  });
  orderedMuscleKeys(Object.keys(buckets)).forEach((key) => {
    body += `<div class="group-label">${esc(key)}</div>`;
    buckets[key].forEach(({ entry, ei }) => {
      const ex = exerciseById(entry.exerciseId);
      const last = lastPerformance(entry.exerciseId);
      body += `<div class="card">
        <div class="card-head">
          <h3 style="font-size:18px">${esc(ex ? ex.name : "Onbekend")}</h3>
          <button class="btn-link" style="color:var(--red)" data-act="remove-entry" data-ei="${ei}">Verwijder</button>
        </div>
        ${last ? `<p class="muted small" style="margin:-4px 0 10px">Vorige keer: ${last.set.weight ?? "–"} kg × ${last.set.reps ?? "–"} (${fmtShort(last.date)})</p>` : ""}
        <div class="set-head"><span></span><span style="text-align:center">Kg</span><span style="text-align:center">Reps</span><span></span></div>`;
      entry.sets.forEach((set, si) => {
        const ph = last && last.sets[si] ? last.sets[si] : {};
        body += `<div class="set-row">
          <span class="setnum">${si + 1}</span>
          <input type="number" inputmode="decimal" placeholder="${ph.weight ?? ""}" value="${set.weight ?? ""}" data-field="weight" data-ei="${ei}" data-si="${si}" />
          <input type="number" inputmode="numeric" placeholder="${ph.reps ?? ""}" value="${set.reps ?? ""}" data-field="reps" data-ei="${ei}" data-si="${si}" />
          <button class="del" data-act="remove-set" data-ei="${ei}" data-si="${si}">✕</button>
        </div>`;
      });
      body += `<button class="btn-link" data-act="add-set" data-ei="${ei}">+ Set toevoegen</button>
        <div class="vol-line">Volume: <b id="vol-${ei}">${Math.round(entryVolume(entry))}</b> kg</div></div>`;
    });
  });

  body += `<button class="btn-add-cell mt" data-act="pick-exercise">${ICON.plus} Oefening toevoegen</button>
    <button class="btn-destructive mt" data-act="discard-session">Stoppen zonder opslaan</button>`;
  root.innerHTML = body;
  startSessionTimer();
}

function sessionTrainedRegions(s) {
  const set = new Set();
  s.entries.forEach((e) => {
    const ex = exerciseById(e.exerciseId);
    if (ex) { const r = muscleToRegion(ex.muscle); if (r) set.add(r); }
  });
  return set;
}

function startSession() {
  db.activeSession = {
    id: uid("sess"), date: todayISO(),
    name: "Workout " + new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "short" }),
    entries: []
  };
  save(); setTab("session");
}
function finishSession() {
  const s = db.activeSession;
  if (!s) return;
  const hasData = s.entries.some((e) => e.sets.some((set) => set.weight != null || set.reps != null));
  if (!hasData) {
    if (!confirm("Geen sets ingevuld. Sessie weggooien?")) return;
    db.activeSession = null; save(); setTab("home"); return;
  }
  s.finishedAt = todayISO();
  s.durationSec = Math.round((Date.parse(s.finishedAt) - Date.parse(s.date)) / 1000);
  db.sessions.push(s); db.activeSession = null; save();
  toast("Sessie opgeslagen 💪"); setTab("home");
}
function discardSession() {
  if (!db.activeSession) return;
  if (confirm("Sessie afsluiten zonder op te slaan? De ingevoerde sets gaan verloren.")) {
    db.activeSession = null; save(); setTab("home");
  }
}
function addSet(ei) {
  const sets = db.activeSession.entries[ei].sets;
  const prev = sets[sets.length - 1];
  sets.push({ weight: prev ? prev.weight : null, reps: prev ? prev.reps : null });
  save(); renderSession();
}

/* ===================== Oefening kiezen (modal) ===================== */
function openPickExercise() {
  const items = db.exercises.slice().sort((a, b) => a.name.localeCompare(b.name)).map(
    (ex) => `<div class="row" data-act="add-entry" data-id="${ex.id}">
      <div class="r-main"><div class="r-title">${esc(ex.name)}</div><div class="r-sub">${esc(ex.muscle || "—")}</div></div>
      <span class="pill">Kies</span></div>`
  ).join("");
  openModal(`<h2>Oefening toevoegen</h2>
    <input id="ex-search" placeholder="Zoeken…" data-act="filter-pick" />
    <div class="group mt" id="pick-list">${items || `<div class="row muted">Nog geen oefeningen.</div>`}</div>
    <button class="btn-tinted mt" data-act="new-exercise-session">+ Nieuwe oefening aanmaken</button>`);
}
function addEntry(exId) {
  db.activeSession.entries.push({ exerciseId: exId, sets: [{ weight: null, reps: null }] });
  save(); closeModal(); renderSession();
}

/* ===================== Bibliotheek ===================== */
function renderLibrary() {
  $("#hdr-right").innerHTML = iconBtn("new-exercise");
  const root = $("#view");
  if (!db.exercises.length) {
    root.innerHTML = `<div class="empty"><span class="big">📚</span><p>Nog geen oefeningen</p></div>
      <button class="btn-primary" data-act="new-exercise">Eerste oefening aanmaken</button>`;
    return;
  }
  const groups = {};
  db.exercises.forEach((ex) => { const g = ex.muscle || "Overig"; (groups[g] = groups[g] || []).push(ex); });
  let html = "";
  orderedMuscleKeys(Object.keys(groups)).forEach((g) => {
    html += `<div class="group-label">${esc(g)}</div><div class="group">`;
    groups[g].sort((a, b) => a.name.localeCompare(b.name)).forEach((ex) => {
      const lp = lastPerformance(ex.id);
      html += `<div class="row" data-go="exercise" data-id="${ex.id}">
        <div class="r-main"><div class="r-title">${esc(ex.name)}</div>
        <div class="r-sub">${lp ? `Laatst: ${lp.set.weight ?? "–"} kg × ${lp.set.reps ?? "–"}` : "Nog niet gelogd"}</div></div>
        ${ICON.chevron}</div>`;
    });
    html += `</div>`;
  });
  root.innerHTML = html;
}

/* ===================== Oefening-detail + grafiek ===================== */
let exMetric = "maxW";
function renderExerciseDetail(exId) {
  const ex = exerciseById(exId);
  if (!ex) { back(); return; }
  $("#hdr-right").innerHTML = textAction("edit-exercise", "Wijzig", ex.id);
  const root = $("#view");
  const series = exerciseSeries(exId);

  let html = `<div class="card mt"><h3>${esc(ex.name)}</h3>
    <p class="muted" style="margin:6px 0 0">${esc(ex.muscle || "—")}</p>
    ${ex.notes ? `<p style="margin:8px 0 0">${esc(ex.notes)}</p>` : ""}</div>`;

  if (series.length) {
    const totalVol = series.reduce((a, s) => a + s.vol, 0);
    let bestW = 0, bestReps = 0;
    series.forEach((s) => s.sets.forEach((st) => { if ((st.weight || 0) > bestW) { bestW = st.weight || 0; bestReps = st.reps || 0; } }));
    html += `<div class="stat-grid" style="margin-bottom:14px">
      <div class="stat"><div class="val">${fmtNum(bestW)}<span class="u"> kg</span></div><div class="lbl">Beste set ×${bestReps}</div></div>
      <div class="stat"><div class="val">${Math.round(totalVol).toLocaleString("nl-NL")}<span class="u"> kg</span></div><div class="lbl">Totaal getild</div></div>
      <div class="stat"><div class="val">${series.length}</div><div class="lbl">Sessies</div></div>
    </div>`;
  }

  if (series.length < 2) {
    html += `<div class="card"><div class="empty" style="padding:30px 0">
      <span class="big">📈</span><p>${series.length ? "Nog maar 1 sessie — log nog een keer voor een grafiek." : "Nog geen data. Log deze oefening in een sessie."}</p></div></div>`;
  } else {
    const key = exMetric, unit = key === "maxW" ? "kg" : "kg vol.";
    const pts = series.map((s) => ({ x: new Date(s.date).getTime(), y: key === "maxW" ? s.maxW : s.vol }));
    const lastv = pts[pts.length - 1].y, diff = +(lastv - pts[0].y).toFixed(1);
    html += `<div class="card">
      <div class="segmented">
        <button data-metric="maxW" class="${key === "maxW" ? "active" : ""}">Max gewicht</button>
        <button data-metric="vol" class="${key === "vol" ? "active" : ""}">Volume</button>
      </div>
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px">
        <span style="font-size:26px;font-weight:700">${fmtNum(lastv)} <span class="muted" style="font-size:15px;font-weight:400">${unit}</span></span>
        <span class="${diff >= 0 ? "delta-up" : "delta-down"}" style="font-size:14px">${diff >= 0 ? "▲" : "▼"} ${fmtNum(Math.abs(diff))} sinds start</span>
      </div>
      ${lineChart(pts)}</div>`;
  }

  if (series.length) {
    html += `<div class="group-label">Geschiedenis</div><div class="group">`;
    series.slice().reverse().forEach((s) => {
      const setsTxt = s.sets.map((x) => `${x.weight ?? "–"}×${x.reps ?? "–"}`).join(", ");
      html += `<div class="row"><div class="r-main"><div class="r-title">${fmtDate(s.date)}</div>
        <div class="r-sub">${esc(setsTxt)}</div></div>
        <span class="r-value">${Math.round(s.vol).toLocaleString("nl-NL")} kg</span></div>`;
    });
    html += `</div>`;
  }
  root.innerHTML = html;
}

/* ===================== Oefening formulier ===================== */
let pendingSessionAdd = false;
function openExerciseForm(exId) {
  const ex = exId ? exerciseById(exId) : null;
  const opts = db.muscles.map((m) => `<option value="${esc(m)}" ${ex && ex.muscle === m ? "selected" : ""}>${esc(m)}</option>`).join("");
  openModal(`<h2>${ex ? "Oefening bewerken" : "Nieuwe oefening"}</h2>
    <div class="field"><label>Naam</label><input id="f-name" value="${esc(ex ? ex.name : "")}" placeholder="bv. Incline dumbbell press" /></div>
    <div class="field"><label>Spiergroep</label>
      <div class="select-wrap"><select id="f-muscle"><option value="">— Kies —</option>${opts}</select></div></div>
    <div class="field"><label>Notitie</label><textarea id="f-notes" rows="2" placeholder="techniek, instelling…">${esc(ex ? ex.notes : "")}</textarea></div>
    <button class="btn-primary" data-act="save-exercise" data-id="${ex ? ex.id : ""}">Opslaan</button>
    ${ex ? `<button class="btn-destructive mt" data-act="delete-exercise" data-id="${ex.id}">Oefening verwijderen</button>` : ""}`);
}
function saveExercise(exId) {
  const name = $("#f-name").value.trim();
  if (!name) { toast("Naam is verplicht"); return; }
  const muscle = $("#f-muscle").value.trim();
  const notes = $("#f-notes").value.trim();
  if (exId) { Object.assign(exerciseById(exId), { name, muscle, notes }); save(); closeModal(); render(); return; }
  const ex = { id: uid("ex"), name, muscle, notes };
  db.exercises.push(ex);
  // Tijdens een sessie aangemaakt → meteen toevoegen en klaarzetten om in te vullen.
  if (pendingSessionAdd && db.activeSession) {
    pendingSessionAdd = false;
    db.activeSession.entries.push({ exerciseId: ex.id, sets: [{ weight: null, reps: null }] });
    save(); closeModal(); setTab("session"); toast("Toegevoegd aan sessie"); return;
  }
  save(); closeModal(); render();
}

/* ===================== Spiergroepen beheren ===================== */
function renderMuscles() {
  $("#hdr-right").innerHTML = iconBtn("add-muscle");
  const root = $("#view");
  let html = `<div class="group-label">Volgorde van spiergroepen</div><div class="group">`;
  if (!db.muscles.length) html += `<div class="row muted">Geen spiergroepen.</div>`;
  db.muscles.forEach((m, i) => {
    const count = db.exercises.filter((e) => e.muscle === m).length;
    html += `<div class="row">
      <div class="r-main" data-act="rename-muscle" data-i="${i}"><div class="r-title">${esc(m)}</div>
      <div class="r-sub">${count} oefening${count === 1 ? "" : "en"}</div></div>
      <div class="reorder">
        <button class="mv" data-act="muscle-up" data-i="${i}"${i === 0 ? " disabled" : ""}>${ICON.up}</button>
        <button class="mv" data-act="muscle-down" data-i="${i}"${i === db.muscles.length - 1 ? " disabled" : ""}>${ICON.down}</button>
      </div>
      <button class="del-x" data-act="delete-muscle" data-i="${i}">✕</button></div>`;
  });
  html += `</div><p class="muted small" style="margin:10px 8px">Tik op een naam om te hernoemen. De volgorde bepaalt ook hoe oefeningen en sessies gegroepeerd worden.</p>`;
  root.innerHTML = html;
}
function addMuscle() {
  const name = prompt("Naam nieuwe spiergroep:");
  if (name && name.trim()) {
    if (db.muscles.includes(name.trim())) { toast("Bestaat al"); return; }
    db.muscles.push(name.trim()); save(); renderMuscles();
  }
}
function renameMuscle(i) {
  const old = db.muscles[i];
  const name = prompt("Spiergroep hernoemen:", old);
  if (name && name.trim() && name.trim() !== old) {
    const nn = name.trim();
    db.exercises.forEach((e) => { if (e.muscle === old) e.muscle = nn; });
    db.muscles[i] = nn; save(); renderMuscles();
  }
}
function deleteMuscle(i) {
  const m = db.muscles[i];
  const count = db.exercises.filter((e) => e.muscle === m).length;
  const msg = count ? `"${m}" verwijderen? ${count} oefening(en) houden geen spiergroep meer.` : `"${m}" verwijderen?`;
  if (confirm(msg)) {
    db.exercises.forEach((e) => { if (e.muscle === m) e.muscle = ""; });
    db.muscles.splice(i, 1); save(); renderMuscles();
  }
}
function moveMuscle(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= db.muscles.length) return;
  [db.muscles[i], db.muscles[j]] = [db.muscles[j], db.muscles[i]];
  save(); renderMuscles();
}

/* ===================== Lichaam ===================== */
const BODY_FIELDS = [
  { key: "weight", label: "Gewicht", unit: "kg", primary: true },
  { key: "bodyFat", label: "Vet", unit: "%", primary: true },
  { key: "muscle", label: "Spier", unit: "kg", primary: true },
  { key: "waist", label: "Taille", unit: "cm" },
  { key: "chest", label: "Borst", unit: "cm" },
  { key: "arm", label: "Arm", unit: "cm" },
  { key: "thigh", label: "Been", unit: "cm" }
];
let bodyMetricKey = "weight";

function renderBody() {
  $("#hdr-right").innerHTML = iconBtn("log-body");
  const root = $("#view");
  const data = db.body.slice().sort((a, b) => a.date.localeCompare(b.date));
  if (!data.length) {
    root.innerHTML = `<div class="empty"><span class="big">📊</span><p>Nog geen metingen</p></div>
      <button class="btn-primary" data-act="log-body">Eerste meting toevoegen</button>`;
    return;
  }
  const latest = data[data.length - 1];
  const prev = data.length > 1 ? data[data.length - 2] : null;

  const present = BODY_FIELDS.filter((f) => latest[f.key] != null);
  let cellsHtml = present.map((f) => {
    let d = "";
    if (prev && prev[f.key] != null) {
      const diff = +(latest[f.key] - prev[f.key]).toFixed(2);
      if (diff !== 0) d = `<span class="${diff > 0 ? "delta-up" : "delta-down"}"> ${diff > 0 ? "▲" : "▼"}${fmtNum(Math.abs(diff))}</span>`;
    }
    return `<div class="stat"><div class="val">${fmtNum(latest[f.key])}<span class="u"> ${f.unit}</span></div><div class="lbl">${f.label}${d}</div></div>`;
  }).join("");
  // Vul de laatste rij aan zodat er geen leeg grijs vak overblijft.
  const filler = (3 - (present.length % 3)) % 3;
  for (let k = 0; k < filler; k++) cellsHtml += `<div class="stat"></div>`;
  let html = `<div class="group-label">Laatste meting · ${fmtDate(latest.date)}</div><div class="card"><div class="stat-grid">${cellsHtml}</div></div>`;

  const selector = BODY_FIELDS.map((f) => `<option value="${f.key}" ${f.key === bodyMetricKey ? "selected" : ""}>${f.label}</option>`).join("");
  const pts = data.filter((d) => d[bodyMetricKey] != null).map((d) => ({ x: new Date(d.date).getTime(), y: d[bodyMetricKey] }));
  html += `<div class="card"><div class="card-head"><h3 style="font-size:17px">Verloop</h3>
    <div class="select-wrap" style="width:auto"><select style="width:auto;padding-right:34px" data-act="change-metric">${selector}</select></div></div>
    ${pts.length >= 2 ? lineChart(pts) : `<p class="muted small center" style="padding:24px 0">Minstens 2 metingen nodig.</p>`}</div>`;

  html += `<div class="group-label">Alle metingen</div><div class="group">`;
  data.slice().reverse().forEach((m) => {
    const parts = BODY_FIELDS.filter((f) => m[f.key] != null).map((f) => `${f.label} ${fmtNum(m[f.key])}${f.unit}`);
    html += `<div class="row" data-act="edit-body" data-id="${m.id}"><div class="r-main"><div class="r-title">${fmtDate(m.date)}</div>
      <div class="r-sub">${parts.join(" · ") || "—"}</div></div>${ICON.chevron}</div>`;
  });
  html += `</div>`;
  root.innerHTML = html;
}
function openBodyForm(id) {
  const m = id ? db.body.find((b) => b.id === id) : null;
  const fields = BODY_FIELDS.map((f) => `<div class="field" style="flex:1"><label>${f.label} (${f.unit})</label>
    <input type="number" inputmode="decimal" step="0.01" id="b-${f.key}" value="${m && m[f.key] != null ? m[f.key] : ""}" placeholder="–" /></div>`);
  let grid = "";
  for (let i = 0; i < fields.length; i += 2) grid += `<div class="row-inputs">${fields[i]}${fields[i + 1] || ""}</div>`;
  openModal(`<h2>${m ? "Meting bewerken" : "Nieuwe meting"}</h2>
    <div class="field"><label>Datum</label><input type="date" id="b-date" value="${dateInputVal(m ? m.date : todayISO())}" /></div>
    ${grid}
    <button class="btn-primary" data-act="save-body" data-id="${m ? m.id : ""}">Opslaan</button>
    ${m ? `<button class="btn-destructive mt" data-act="delete-body" data-id="${m.id}">Verwijderen</button>` : ""}`);
}
function saveBody(id) {
  const dateVal = $("#b-date").value;
  const rec = { id: id || uid("body"), date: dateVal ? new Date(dateVal).toISOString() : todayISO() };
  let any = false;
  BODY_FIELDS.forEach((f) => { const v = num($("#b-" + f.key).value); rec[f.key] = v; if (v != null) any = true; });
  if (!any) { toast("Vul minstens één waarde in"); return; }
  if (id) db.body[db.body.findIndex((b) => b.id === id)] = rec;
  else db.body.push(rec);
  save(); closeModal(); render();
}

/* ===================== Historie ===================== */
function renderHistory() {
  const root = $("#view");
  const sessions = db.sessions.slice().reverse();
  if (!sessions.length) { root.innerHTML = `<div class="empty"><span class="big">🗓️</span><p>Nog geen afgeronde sessies</p></div>`; return; }
  let html = `<div class="group-label">${sessions.length} sessie${sessions.length === 1 ? "" : "s"}</div><div class="group">`;
  sessions.forEach((s) => {
    const totalSets = s.entries.reduce((n, e) => n + e.sets.filter((x) => x.weight != null || x.reps != null).length, 0);
    const names = s.entries.map((e) => (exerciseById(e.exerciseId) || {}).name || "?").join(", ");
    html += `<div class="row" data-session="${s.id}"><div class="r-main"><div class="r-title">${esc(s.name)}</div>
      <div class="r-sub">${fmtDate(s.finishedAt || s.date)} • ${totalSets} sets · ${Math.round(sessionVolume(s))} kg${s.durationSec ? " · " + fmtMinutes(s.durationSec) : ""}</div>
      <div class="r-sub">${esc(names)}</div></div>${ICON.chevron}</div>`;
  });
  html += `</div>`;
  root.innerHTML = html;
}
function openSessionDetail(id) {
  const s = db.sessions.find((x) => x.id === id);
  if (!s) return;
  let html = `<h2>${esc(s.name)}</h2><p class="muted small center" style="margin:-10px 0 14px">${fmtDay(s.finishedAt || s.date)}${s.durationSec ? " · " + fmtMinutes(s.durationSec) : ""} · ${Math.round(sessionVolume(s))} kg getild</p>`;
  s.entries.forEach((e) => {
    const ex = exerciseById(e.exerciseId);
    html += `<div class="card"><h3 style="font-size:17px;margin:0 0 8px">${esc(ex ? ex.name : "?")}</h3>`;
    e.sets.forEach((set, i) => html += `<div class="small" style="padding:3px 0">Set ${i + 1}: <b>${set.weight ?? "–"} kg</b> × ${set.reps ?? "–"}</div>`);
    html += `</div>`;
  });
  html += `<button class="btn-destructive mt" data-act="delete-session" data-id="${s.id}">Sessie verwijderen</button>`;
  openModal(html);
}

/* ===================== Grafiek ===================== */
function lineChart(pts) {
  if (pts.length < 2) return "";
  const W = 600, H = 190, padX = 30, padY = 24;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  if (minY === maxY) { minY -= 1; maxY += 1; }
  const sx = (x) => padX + ((x - minX) / (maxX - minX || 1)) * (W - padX * 2);
  const sy = (y) => H - padY - ((y - minY) / (maxY - minY)) * (H - padY * 2);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
  const fill = `M${sx(pts[0].x).toFixed(1)},${(H - padY).toFixed(1)} ` +
    pts.map((p) => `L${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ") +
    ` L${sx(pts[pts.length - 1].x).toFixed(1)},${(H - padY).toFixed(1)} Z`;
  const dots = pts.map((p) => `<circle class="chart-dot" cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="3"/>`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <path class="chart-fill" d="${fill}"/><path class="chart-line" d="${line}"/>${dots}
    <text class="chart-lbl" x="3" y="${(sy(maxY) + 4).toFixed(1)}">${fmtNum(maxY)}</text>
    <text class="chart-lbl" x="3" y="${(sy(minY) + 4).toFixed(1)}">${fmtNum(minY)}</text></svg>`;
}

/* ===================== Modal ===================== */
function openModal(inner) {
  $("#modal-root").innerHTML = `<div class="modal-overlay" data-act="overlay"><div class="modal"><div class="modal-grabber"></div>${inner}</div></div>`;
}
function closeModal() { $("#modal-root").innerHTML = ""; pendingSessionAdd = false; }

/* ===================== Events ===================== */
document.addEventListener("click", (e) => {
  const tabBtn = e.target.closest("[data-tab]");
  if (tabBtn) { setTab(tabBtn.dataset.tab); return; }

  const el = e.target.closest("[data-act], [data-go], [data-tab-go], [data-session]");
  if (!el) return;

  if (el.dataset.tabGo) { setTab(el.dataset.tabGo); return; }
  if (el.dataset.go) { push(el.dataset.go, el.dataset.id); return; }
  if (el.dataset.session) { openSessionDetail(el.dataset.session); return; }

  const a = el.dataset.act;
  const id = el.dataset.id;
  const ei = el.dataset.ei != null ? +el.dataset.ei : null;
  const si = el.dataset.si != null ? +el.dataset.si : null;
  const i = el.dataset.i != null ? +el.dataset.i : null;

  switch (a) {
    case "back": back(); break;
    case "overlay": if (e.target === el) closeModal(); break;

    case "start-session": startSession(); break;
    case "finish-session": finishSession(); break;
    case "discard-session": discardSession(); break;
    case "pick-exercise": openPickExercise(); break;
    case "add-entry": addEntry(id); break;
    case "add-set": addSet(ei); break;
    case "remove-set":
      db.activeSession.entries[ei].sets.splice(si, 1);
      if (!db.activeSession.entries[ei].sets.length) db.activeSession.entries[ei].sets.push({ weight: null, reps: null });
      save(); renderSession(); break;
    case "remove-entry":
      if (confirm("Oefening uit sessie verwijderen?")) { db.activeSession.entries.splice(ei, 1); save(); renderSession(); } break;

    case "new-exercise": openExerciseForm(null); break;
    case "new-exercise-session": pendingSessionAdd = true; openExerciseForm(null); break;
    case "edit-exercise": openExerciseForm(id); break;
    case "save-exercise": saveExercise(id); break;
    case "delete-exercise":
      if (confirm("Oefening verwijderen?")) {
        db.exercises = db.exercises.filter((x) => x.id !== id); save(); closeModal();
        if (cur().view === "exercise") back(); else render();
      } break;

    case "add-muscle": addMuscle(); break;
    case "rename-muscle": renameMuscle(i); break;
    case "delete-muscle": deleteMuscle(i); break;
    case "muscle-up": moveMuscle(i, -1); break;
    case "muscle-down": moveMuscle(i, 1); break;

    case "log-body": openBodyForm(null); break;
    case "edit-body": openBodyForm(id); break;
    case "save-body": saveBody(id); break;
    case "delete-body": db.body = db.body.filter((x) => x.id !== id); save(); closeModal(); render(); break;

    case "delete-session":
      if (confirm("Sessie verwijderen?")) { db.sessions = db.sessions.filter((x) => x.id !== id); save(); closeModal(); render(); } break;
  }

  const metricBtn = e.target.closest("[data-metric]");
  if (metricBtn) { exMetric = metricBtn.dataset.metric; renderExerciseDetail(cur().param); }
});

document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.field && t.dataset.ei != null) {
    const ei = +t.dataset.ei;
    const entry = db.activeSession.entries[ei];
    entry.sets[+t.dataset.si][t.dataset.field] = num(t.value); save();
    const volEl = $("#vol-" + ei); if (volEl) volEl.textContent = Math.round(entryVolume(entry));
    const totEl = $("#session-volume"); if (totEl) totEl.textContent = Math.round(sessionVolume(db.activeSession));
  } else if (t.dataset.act === "rename-session") {
    db.activeSession.name = t.value; save();
  } else if (t.dataset.act === "change-metric") {
    bodyMetricKey = t.value; renderBody();
  } else if (t.dataset.act === "filter-pick") {
    const q = t.value.toLowerCase();
    $("#pick-list").querySelectorAll(".row").forEach((it) => { it.style.display = it.textContent.toLowerCase().includes(q) ? "" : "none"; });
  }
});

/* ===================== Init ===================== */
const headerEl = document.querySelector(".app-header");
window.addEventListener("scroll", () => {
  headerEl.classList.toggle("scrolled", window.scrollY > 8);
}, { passive: true });

render();
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("SW", e)));
}

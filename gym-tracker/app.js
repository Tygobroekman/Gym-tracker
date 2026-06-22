"use strict";

/* ---------- Opslag ---------- */
const KEY = "gym-tracker-db-v1";

const DEFAULT_DB = {
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
    return Object.assign(structuredClone(DEFAULT_DB), JSON.parse(raw));
  } catch (e) {
    console.error("Laden mislukt", e);
    return structuredClone(DEFAULT_DB);
  }
}
function save() {
  localStorage.setItem(KEY, JSON.stringify(db));
}
function uid(p = "id") {
  return p + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ---------- Helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
const num = (v) => (v === "" || v == null ? null : Number(v));
const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
const fmtDay = (iso) =>
  new Date(iso).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
const todayISO = () => new Date().toISOString();
const dateInputVal = (iso) => new Date(iso).toISOString().slice(0, 10);

function exerciseById(id) {
  return db.exercises.find((e) => e.id === id);
}

// Beste set (op gewicht) van een oefening uit de laatst afgeronde sessie waarin hij voorkwam.
function lastPerformance(exId) {
  for (let i = db.sessions.length - 1; i >= 0; i--) {
    const entry = db.sessions[i].entries.find((e) => e.exerciseId === exId);
    if (entry) {
      const sets = entry.sets.filter((s) => s.weight != null || s.reps != null);
      if (sets.length) {
        const best = sets.reduce((a, b) => ((b.weight || 0) > (a.weight || 0) ? b : a));
        return { date: db.sessions[i].finishedAt || db.sessions[i].date, set: best, sets };
      }
    }
  }
  return null;
}

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1600);
}

/* ---------- Router ---------- */
let view = "session";
const titles = { session: "Sessie", library: "Oefeningen", body: "Lichaam", history: "Historie" };

function render() {
  $("#view-title").textContent = titles[view];
  $("#header-action").innerHTML = "";
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.view === view)
  );
  if (view === "session") renderSession();
  else if (view === "library") renderLibrary();
  else if (view === "body") renderBody();
  else if (view === "history") renderHistory();
}

/* ---------- Sessie ---------- */
function renderSession() {
  const root = $("#view");
  const s = db.activeSession;

  if (!s) {
    const last = db.sessions[db.sessions.length - 1];
    root.innerHTML = `
      <div class="empty">
        <span class="big">🏋️</span>
        <p>Geen actieve sessie.</p>
      </div>
      <button class="btn-primary btn-block" data-action="start-session">Nieuwe sessie starten</button>
      ${
        last
          ? `<p class="muted small center" style="margin-top:18px">Laatste sessie: ${esc(
              last.name
            )} • ${fmtDate(last.finishedAt || last.date)}</p>`
          : ""
      }`;
    return;
  }

  $("#header-action").innerHTML = `<button class="btn-ghost" data-action="finish-session">Afronden</button>`;

  let body = `
    <div class="card">
      <input id="session-name" value="${esc(s.name)}" data-action="rename-session" />
      <p class="muted small" style="margin:8px 2px 0">${fmtDay(s.date)}</p>
    </div>`;

  s.entries.forEach((entry, ei) => {
    const ex = exerciseById(entry.exerciseId);
    const last = lastPerformance(entry.exerciseId);
    body += `
      <div class="card">
        <div class="card-head">
          <div>
            <h3>${esc(ex ? ex.name : "Onbekend")}</h3>
            ${ex && ex.muscle ? `<span class="pill accent">${esc(ex.muscle)}</span>` : ""}
          </div>
          <button class="btn-danger btn-sm" data-action="remove-entry" data-ei="${ei}">Verwijderen</button>
        </div>
        ${
          last
            ? `<p class="muted small flush-top" style="margin:-4px 0 10px">Vorige keer: ${
                last.set.weight ?? "–"
              } kg × ${last.set.reps ?? "–"} <span class="muted">(${fmtDate(last.date)})</span></p>`
            : ""
        }
        <div class="set-head"><span></span><span>Gewicht (kg)</span><span>Reps</span><span></span></div>`;

    entry.sets.forEach((set, si) => {
      body += `
        <div class="set-row">
          <span class="setnum">${si + 1}</span>
          <input type="number" inputmode="decimal" placeholder="${
            last && last.sets[si] ? last.sets[si].weight ?? "" : ""
          }" value="${set.weight ?? ""}" data-field="weight" data-ei="${ei}" data-si="${si}" />
          <input type="number" inputmode="numeric" placeholder="${
            last && last.sets[si] ? last.sets[si].reps ?? "" : ""
          }" value="${set.reps ?? ""}" data-field="reps" data-ei="${ei}" data-si="${si}" />
          <button class="del" data-action="remove-set" data-ei="${ei}" data-si="${si}">✕</button>
        </div>`;
    });

    body += `
        <button class="btn-ghost btn-sm" data-action="add-set" data-ei="${ei}">+ Set toevoegen</button>
      </div>`;
  });

  body += `<button class="fab-add" data-action="pick-exercise">+ Oefening toevoegen</button>`;
  root.innerHTML = body;
}

function startSession() {
  db.activeSession = {
    id: uid("sess"),
    date: todayISO(),
    name: "Workout " + new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "short" }),
    entries: []
  };
  save();
  render();
}

function finishSession() {
  const s = db.activeSession;
  if (!s) return;
  const hasData = s.entries.some((e) => e.sets.some((set) => set.weight != null || set.reps != null));
  if (!hasData) {
    if (!confirm("Deze sessie heeft geen ingevulde sets. Toch afronden (en weggooien)?")) return;
    db.activeSession = null;
    save();
    render();
    return;
  }
  s.finishedAt = todayISO();
  db.sessions.push(s);
  db.activeSession = null;
  save();
  toast("Sessie opgeslagen 💪");
  view = "history";
  render();
}

function addSet(ei) {
  const sets = db.activeSession.entries[ei].sets;
  const prev = sets[sets.length - 1];
  sets.push({ weight: prev ? prev.weight : null, reps: prev ? prev.reps : null });
  save();
  renderSession();
}

/* ---------- Oefening kiezen (modal) ---------- */
function openPickExercise() {
  const items = db.exercises
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      (ex) => `
      <div class="list-item" data-action="add-entry" data-id="${ex.id}">
        <div class="li-main">
          <div class="li-title">${esc(ex.name)}</div>
          <div class="li-sub">${esc(ex.muscle || "—")}</div>
        </div>
        <span class="pill accent">Kies</span>
      </div>`
    )
    .join("");

  openModal(`
    <h2>Oefening toevoegen</h2>
    <input id="ex-search" placeholder="Zoeken…" data-action="filter-pick" />
    <div class="divider"></div>
    <div id="pick-list">${items || `<p class="empty">Nog geen oefeningen.</p>`}</div>
    <div class="divider"></div>
    <button class="btn-block" data-action="new-exercise-from-pick">+ Nieuwe oefening aanmaken</button>
  `);
}

function addEntry(exId) {
  db.activeSession.entries.push({ exerciseId: exId, sets: [{ weight: null, reps: null }] });
  save();
  closeModal();
  renderSession();
}

/* ---------- Bibliotheek ---------- */
function renderLibrary() {
  $("#header-action").innerHTML = `<button class="btn-ghost" data-action="new-exercise">+ Nieuw</button>`;
  const root = $("#view");
  if (!db.exercises.length) {
    root.innerHTML = `<div class="empty"><span class="big">📚</span><p>Nog geen oefeningen.</p></div>
      <button class="btn-primary btn-block" data-action="new-exercise">Eerste oefening aanmaken</button>`;
    return;
  }
  const groups = {};
  db.exercises.forEach((ex) => {
    const g = ex.muscle || "Overig";
    (groups[g] = groups[g] || []).push(ex);
  });
  let html = "";
  Object.keys(groups)
    .sort()
    .forEach((g) => {
      html += `<p class="muted small" style="margin:14px 4px 8px;text-transform:uppercase;letter-spacing:.04em">${esc(
        g
      )}</p>`;
      groups[g]
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((ex) => {
          const lp = lastPerformance(ex.id);
          html += `
          <div class="list-item" data-action="edit-exercise" data-id="${ex.id}">
            <div class="li-main">
              <div class="li-title">${esc(ex.name)}</div>
              <div class="li-sub">${
                lp ? `PR-set: ${lp.set.weight ?? "–"} kg × ${lp.set.reps ?? "–"}` : "Nog niet gelogd"
              }${ex.notes ? " • " + esc(ex.notes) : ""}</div>
            </div>
            <span class="muted">›</span>
          </div>`;
        });
    });
  root.innerHTML = html;
}

function openExerciseForm(exId) {
  const ex = exId ? exerciseById(exId) : null;
  openModal(`
    <h2>${ex ? "Oefening bewerken" : "Nieuwe oefening"}</h2>
    <div class="field"><label>Naam</label>
      <input id="f-name" value="${esc(ex ? ex.name : "")}" placeholder="bv. Incline dumbbell press" /></div>
    <div class="field"><label>Spiergroep</label>
      <input id="f-muscle" value="${esc(ex ? ex.muscle : "")}" placeholder="bv. Borst" list="muscles" />
      <datalist id="muscles">
        <option>Borst</option><option>Rug</option><option>Benen</option>
        <option>Schouders</option><option>Armen</option><option>Core</option><option>Cardio</option>
      </datalist></div>
    <div class="field"><label>Notitie (optioneel)</label>
      <textarea id="f-notes" rows="2" placeholder="techniek, instelling, etc.">${esc(ex ? ex.notes : "")}</textarea></div>
    <button class="btn-primary btn-block" data-action="save-exercise" data-id="${ex ? ex.id : ""}">Opslaan</button>
    ${ex ? `<button class="btn-danger btn-block" style="margin-top:10px" data-action="delete-exercise" data-id="${ex.id}">Oefening verwijderen</button>` : ""}
  `);
}

function saveExercise(exId) {
  const name = $("#f-name").value.trim();
  if (!name) { toast("Naam is verplicht"); return; }
  const muscle = $("#f-muscle").value.trim();
  const notes = $("#f-notes").value.trim();
  if (exId) {
    const ex = exerciseById(exId);
    Object.assign(ex, { name, muscle, notes });
  } else {
    db.exercises.push({ id: uid("ex"), name, muscle, notes });
  }
  save();
  closeModal();
  render();
}

/* ---------- Lichaam ---------- */
const BODY_FIELDS = [
  { key: "weight", label: "Gewicht", unit: "kg" },
  { key: "bodyFat", label: "Vet%", unit: "%" },
  { key: "chest", label: "Borst", unit: "cm" },
  { key: "waist", label: "Taille", unit: "cm" },
  { key: "arm", label: "Arm", unit: "cm" },
  { key: "thigh", label: "Been", unit: "cm" }
];

function renderBody() {
  $("#header-action").innerHTML = `<button class="btn-ghost" data-action="log-body">+ Meting</button>`;
  const root = $("#view");
  const data = db.body.slice().sort((a, b) => a.date.localeCompare(b.date));

  if (!data.length) {
    root.innerHTML = `<div class="empty"><span class="big">📊</span><p>Nog geen metingen.</p></div>
      <button class="btn-primary btn-block" data-action="log-body">Eerste meting toevoegen</button>`;
    return;
  }

  const latest = data[data.length - 1];
  const prev = data.length > 1 ? data[data.length - 2] : null;

  let stats = `<div class="card"><div class="card-head"><h3>Laatste meting</h3><span class="muted small">${fmtDate(
    latest.date
  )}</span></div><div class="stat-grid">`;
  BODY_FIELDS.forEach((f) => {
    const v = latest[f.key];
    if (v == null) return;
    let delta = "";
    if (prev && prev[f.key] != null) {
      const d = +(v - prev[f.key]).toFixed(1);
      if (d !== 0) {
        const up = d > 0;
        delta = `<span class="small" style="color:${up ? "var(--ok)" : "var(--accent-2)"}">${
          up ? "▲" : "▼"
        } ${Math.abs(d)}</span>`;
      }
    }
    stats += `<div class="stat"><div class="val">${v}<span class="muted small"> ${f.unit}</span></div><div class="lbl">${f.label} ${delta}</div></div>`;
  });
  stats += `</div></div>`;

  const chart = renderChart(data, bodyMetricKey);

  const selector = BODY_FIELDS.map(
    (f) =>
      `<option value="${f.key}" ${f.key === bodyMetricKey ? "selected" : ""}>${f.label}</option>`
  ).join("");

  let history = `<div class="card"><div class="card-head"><h3>Verloop</h3>
    <select style="width:auto" data-action="change-metric">${selector}</select></div>${chart}</div>`;

  history += `<p class="muted small" style="margin:14px 4px 8px;text-transform:uppercase">Alle metingen</p>`;
  data
    .slice()
    .reverse()
    .forEach((m) => {
      const parts = BODY_FIELDS.filter((f) => m[f.key] != null).map(
        (f) => `${f.label} ${m[f.key]}${f.unit}`
      );
      history += `
      <div class="list-item" data-action="edit-body" data-id="${m.id}">
        <div class="li-main">
          <div class="li-title">${fmtDate(m.date)}</div>
          <div class="li-sub">${parts.join(" · ") || "—"}</div>
        </div>
        <span class="muted">›</span>
      </div>`;
    });

  root.innerHTML = stats + history;
}

let bodyMetricKey = "weight";

function renderChart(data, key) {
  const pts = data.filter((d) => d[key] != null).map((d) => ({ x: new Date(d.date).getTime(), y: d[key] }));
  if (pts.length < 2) return `<p class="empty small">Minstens 2 metingen nodig voor een grafiek.</p>`;
  const W = 600, H = 180, pad = 28;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  if (minY === maxY) { minY -= 1; maxY += 1; }
  const sx = (x) => pad + ((x - minX) / (maxX - minX || 1)) * (W - pad * 2);
  const sy = (y) => H - pad - ((y - minY) / (maxY - minY)) * (H - pad * 2);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
  const dots = pts.map((p) => `<circle class="chart-dot" cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="3" />`).join("");
  const lblMax = `<text x="2" y="${sy(maxY) + 4}" fill="#8b92a3" font-size="11">${+maxY.toFixed(1)}</text>`;
  const lblMin = `<text x="2" y="${sy(minY) + 4}" fill="#8b92a3" font-size="11">${+minY.toFixed(1)}</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}${lblMax}${lblMin}
  </svg>`;
}

function openBodyForm(id) {
  const m = id ? db.body.find((b) => b.id === id) : null;
  const fields = BODY_FIELDS.map(
    (f) => `
    <div class="field" style="flex:1">
      <label>${f.label} (${f.unit})</label>
      <input type="number" inputmode="decimal" id="b-${f.key}" value="${m && m[f.key] != null ? m[f.key] : ""}" placeholder="–" />
    </div>`
  );
  // twee per rij
  let grid = "";
  for (let i = 0; i < fields.length; i += 2) {
    grid += `<div class="row">${fields[i]}${fields[i + 1] || ""}</div>`;
  }
  openModal(`
    <h2>${m ? "Meting bewerken" : "Nieuwe meting"}</h2>
    <div class="field"><label>Datum</label>
      <input type="date" id="b-date" value="${dateInputVal(m ? m.date : todayISO())}" /></div>
    ${grid}
    <button class="btn-primary btn-block" data-action="save-body" data-id="${m ? m.id : ""}">Opslaan</button>
    ${m ? `<button class="btn-danger btn-block" style="margin-top:10px" data-action="delete-body" data-id="${m.id}">Verwijderen</button>` : ""}
  `);
}

function saveBody(id) {
  const dateVal = $("#b-date").value;
  const rec = { id: id || uid("body"), date: dateVal ? new Date(dateVal).toISOString() : todayISO() };
  let any = false;
  BODY_FIELDS.forEach((f) => {
    const v = num($("#b-" + f.key).value);
    rec[f.key] = v;
    if (v != null) any = true;
  });
  if (!any) { toast("Vul minstens één waarde in"); return; }
  if (id) {
    const i = db.body.findIndex((b) => b.id === id);
    db.body[i] = rec;
  } else {
    db.body.push(rec);
  }
  save();
  closeModal();
  render();
}

/* ---------- Historie ---------- */
function renderHistory() {
  const root = $("#view");
  const sessions = db.sessions.slice().reverse();
  if (!sessions.length) {
    root.innerHTML = `<div class="empty"><span class="big">🗓️</span><p>Nog geen afgeronde sessies.</p></div>`;
    return;
  }
  root.innerHTML = sessions
    .map((s) => {
      const totalSets = s.entries.reduce(
        (n, e) => n + e.sets.filter((x) => x.weight != null || x.reps != null).length,
        0
      );
      const vol = s.entries.reduce(
        (v, e) => v + e.sets.reduce((sv, x) => sv + (x.weight || 0) * (x.reps || 0), 0),
        0
      );
      const names = s.entries.map((e) => (exerciseById(e.exerciseId) || {}).name || "?").join(", ");
      return `
      <div class="list-item" data-action="view-session" data-id="${s.id}">
        <div class="li-main">
          <div class="li-title">${esc(s.name)}</div>
          <div class="li-sub">${fmtDate(s.finishedAt || s.date)} • ${s.entries.length} oef · ${totalSets} sets · ${Math.round(
        vol
      )} kg volume</div>
          <div class="li-sub" style="margin-top:4px">${esc(names)}</div>
        </div>
        <span class="muted">›</span>
      </div>`;
    })
    .join("");
}

function openSessionDetail(id) {
  const s = db.sessions.find((x) => x.id === id);
  if (!s) return;
  let html = `<h2>${esc(s.name)}</h2><p class="muted small" style="margin:-8px 0 14px">${fmtDay(
    s.finishedAt || s.date
  )}</p>`;
  s.entries.forEach((e) => {
    const ex = exerciseById(e.exerciseId);
    html += `<div class="card"><h3 style="margin:0 0 8px">${esc(ex ? ex.name : "?")}</h3>`;
    e.sets.forEach((set, i) => {
      html += `<div class="small" style="padding:3px 0">Set ${i + 1}: <b>${set.weight ?? "–"} kg</b> × ${
        set.reps ?? "–"
      }</div>`;
    });
    html += `</div>`;
  });
  html += `<button class="btn-danger btn-block" data-action="delete-session" data-id="${s.id}">Sessie verwijderen</button>`;
  openModal(html);
}

/* ---------- Modal ---------- */
function openModal(inner) {
  $("#modal-root").innerHTML = `<div class="modal-overlay" data-action="overlay"><div class="modal">${inner}</div></div>`;
}
function closeModal() {
  $("#modal-root").innerHTML = "";
}

/* ---------- Events ---------- */
document.addEventListener("click", (e) => {
  // tabs
  const tab = e.target.closest(".tab");
  if (tab) { view = tab.dataset.view; closeModal(); render(); return; }

  const el = e.target.closest("[data-action]");
  if (!el) return;
  const a = el.dataset.action;
  const id = el.dataset.id;
  const ei = el.dataset.ei != null ? +el.dataset.ei : null;
  const si = el.dataset.si != null ? +el.dataset.si : null;

  switch (a) {
    case "overlay": if (e.target === el) closeModal(); break;

    // sessie
    case "start-session": startSession(); break;
    case "finish-session": finishSession(); break;
    case "pick-exercise": openPickExercise(); break;
    case "add-entry": addEntry(id); break;
    case "add-set": addSet(ei); break;
    case "remove-set":
      db.activeSession.entries[ei].sets.splice(si, 1);
      if (!db.activeSession.entries[ei].sets.length)
        db.activeSession.entries[ei].sets.push({ weight: null, reps: null });
      save(); renderSession(); break;
    case "remove-entry":
      if (confirm("Oefening uit sessie verwijderen?")) {
        db.activeSession.entries.splice(ei, 1); save(); renderSession();
      }
      break;
    case "new-exercise-from-pick": openExerciseForm(null); break;

    // bibliotheek
    case "new-exercise": openExerciseForm(null); break;
    case "edit-exercise": openExerciseForm(id); break;
    case "save-exercise": saveExercise(id); break;
    case "delete-exercise":
      if (confirm("Oefening verwijderen uit bibliotheek?")) {
        db.exercises = db.exercises.filter((x) => x.id !== id);
        save(); closeModal(); render();
      }
      break;

    // lichaam
    case "log-body": openBodyForm(null); break;
    case "edit-body": openBodyForm(id); break;
    case "save-body": saveBody(id); break;
    case "delete-body":
      db.body = db.body.filter((x) => x.id !== id); save(); closeModal(); render(); break;

    // historie
    case "view-session": openSessionDetail(id); break;
    case "delete-session":
      if (confirm("Sessie definitief verwijderen?")) {
        db.sessions = db.sessions.filter((x) => x.id !== id); save(); closeModal(); render();
      }
      break;
  }
});

// live inputs (sets) zonder re-render
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.field && t.dataset.ei != null) {
    const set = db.activeSession.entries[+t.dataset.ei].sets[+t.dataset.si];
    set[t.dataset.field] = num(t.value);
    save();
  } else if (t.dataset.action === "rename-session") {
    db.activeSession.name = t.value;
    save();
  } else if (t.dataset.action === "change-metric") {
    bodyMetricKey = t.value;
    renderBody();
  } else if (t.dataset.action === "filter-pick") {
    const q = t.value.toLowerCase();
    $("#pick-list").querySelectorAll(".list-item").forEach((it) => {
      it.style.display = it.textContent.toLowerCase().includes(q) ? "" : "none";
    });
  }
});

/* ---------- Init ---------- */
render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("SW mislukt", e))
  );
}

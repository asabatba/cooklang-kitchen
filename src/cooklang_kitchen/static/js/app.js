// ---- State ----
let recipes = [];
const selectedIds = new Set();
let activeId = null;
let activeData = null; // full recipe data for the currently viewed recipe
let searchFilter = '';
let adminMode = false;
const ADMIN_MODE_PREF_KEY = 'cooklang_admin_mode_preference';
const TIMER_STORAGE_KEY = 'cooklang_timers_v1';
const RECIPE_SELECTION_STORAGE_KEY = 'cooklang_recipe_selection_v1';
const TIMER_COMPLETE_TTL_MS = 15000;
let lastShoppingData = null;
let recipeLoadToken = 0;
let timerDockCollapsed = false;

const timerStore = {
  active: new Map(),
  completed: new Map(),
  tickHandle: null,
};

// ---- API ----
async function fetchRecipes() {
  const res = await fetch('/api/recipes');
  recipes = await res.json();
  renderRecipeList();
}

async function fetchRecipeDetail(id) {
  const res = await fetch(`/api/recipes/${id}`);
  if (!res.ok) throw new Error(`Failed to load recipe ${id}`);
  return await res.json();
}

async function fetchCombined(ids) {
  const res = await fetch('/api/combine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  return await res.json();
}

// ---- Toast ----
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

// ---- URL selection ----
function recipeExists(id) {
  return recipes.some(r => r.id === id);
}

function getRecipeIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('recipe');
  if (!raw) return null;
  const id = parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function setRecipeIdInUrl(id, options = {}) {
  const { replace = false } = options;
  const url = new URL(window.location.href);
  const current = getRecipeIdFromUrl();
  if (id === null) url.searchParams.delete('recipe');
  else url.searchParams.set('recipe', String(id));

  if (current === id && !replace) return;

  const next = `${url.pathname}${url.search}${url.hash}`;
  if (replace) history.replaceState({ recipeId: id }, '', next);
  else history.pushState({ recipeId: id }, '', next);
}

function persistRecipeSelection(id) {
  try {
    if (id === null || id === undefined) localStorage.removeItem(RECIPE_SELECTION_STORAGE_KEY);
    else localStorage.setItem(RECIPE_SELECTION_STORAGE_KEY, String(id));
  } catch {
    // Ignore storage failures.
  }
}

function getFallbackRecipeSelection() {
  try {
    const raw = localStorage.getItem(RECIPE_SELECTION_STORAGE_KEY);
    if (!raw) return null;
    const id = parseInt(raw, 10);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function clearRecipeSelection(options = {}) {
  const { syncUrl = true, replaceUrl = true } = options;
  activeId = null;
  activeData = null;
  renderRecipeList();
  if (syncUrl) setRecipeIdInUrl(null, { replace: replaceUrl });
  persistRecipeSelection(null);
  document.getElementById('mainContent').innerHTML = `
    <div class="empty-state">
      <div class="icon">📖</div>
      <h2>Choose a recipe</h2>
      <p>Select a recipe from the sidebar to view it,<br>or check multiple to build a shopping list.</p>
    </div>`;
}

async function syncSelectionFromUrl() {
  const routeId = getRecipeIdFromUrl();
  if (routeId && recipeExists(routeId)) {
    await viewRecipe(routeId, { syncUrl: false, closePanels: false });
    return;
  }
  if (routeId && !recipeExists(routeId)) {
    setRecipeIdInUrl(null, { replace: true });
  }
  const fallbackId = getFallbackRecipeSelection();
  if (fallbackId && recipeExists(fallbackId)) {
    setRecipeIdInUrl(fallbackId, { replace: true });
    await viewRecipe(fallbackId, { syncUrl: false, closePanels: false });
    return;
  }
  clearRecipeSelection({ syncUrl: false });
}

window.addEventListener('popstate', () => {
  syncSelectionFromUrl();
});

// ---- Timer helpers ----
function buildTimerId(recipeId, stepIndex, timerIndex) {
  return `${recipeId}:${stepIndex}:${timerIndex}`;
}

function normalizeTimerUnit(unitRaw) {
  const unit = (unitRaw || '').trim().toLowerCase().replace(/\./g, '');
  const map = {
    // English
    s: 'seconds', sec: 'seconds', secs: 'seconds', second: 'seconds', seconds: 'seconds',
    m: 'minutes', min: 'minutes', mins: 'minutes', minute: 'minutes', minutes: 'minutes',
    h: 'hours', hr: 'hours', hrs: 'hours', hour: 'hours', hours: 'hours',
    // Spanish
    seg: 'seconds', segs: 'seconds', segundo: 'seconds', segundos: 'seconds',
    minuto: 'minutes', minutos: 'minutes',
    hora: 'hours', horas: 'hours',
  };
  return map[unit] || '';
}

function parseQuantityNumber(raw) {
  const value = String(raw || '').trim().replace(',', '.');
  if (!value) return null;

  function parseSingle(input) {
    const cleaned = String(input || '').trim();
    if (!cleaned) return null;

    const mixed = cleaned.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (mixed) {
      const whole = Number(mixed[1]);
      const num = Number(mixed[2]);
      const den = Number(mixed[3]);
      if (den === 0) return null;
      return whole + (num / den);
    }

    const frac = cleaned.match(/^(\d+)\/(\d+)$/);
    if (frac) {
      const num = Number(frac[1]);
      const den = Number(frac[2]);
      if (den === 0) return null;
      return num / den;
    }

    const n = Number(cleaned);
    if (!Number.isFinite(n)) return null;
    return n;
  }

  // Support ranges like "3-4", "15 - 18", "3–4", "3 a 4".
  // We use the upper bound to avoid under-timing recipe steps.
  const range = value.match(/^(.+?)\s*(?:-|–|—|\ba\b)\s*(.+)$/i);
  if (range) {
    const left = parseSingle(range[1]);
    const right = parseSingle(range[2]);
    if (left !== null && right !== null) return Math.max(left, right);
  }

  return parseSingle(value);
}

function parseTimerQuantityToSeconds(quantity, unit) {
  const amount = parseQuantityNumber(quantity);
  if (amount === null || amount <= 0) return null;
  const normalized = normalizeTimerUnit(unit);
  if (normalized === 'seconds') return Math.max(1, Math.round(amount));
  if (normalized === 'minutes') return Math.max(1, Math.round(amount * 60));
  if (normalized === 'hours') return Math.max(1, Math.round(amount * 3600));
  return null;
}

function formatClock(totalSec) {
  const sec = Math.max(0, Math.floor(totalSec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function buildStepTimersForRecipe(recipeData, stepIndex) {
  const step = recipeData?.parsed?.steps?.[stepIndex];
  if (!step || !Array.isArray(step.timers)) return [];

  const list = [];
  step.timers.forEach((tm, timerIndex) => {
    const durationSec = parseTimerQuantityToSeconds(tm.quantity, tm.unit);
    if (!durationSec) return;
    const qty = [tm.quantity, tm.unit].filter(Boolean).join(' ');
    const label = tm.name ? `${tm.name}${qty ? ` (${qty})` : ''}` : qty;
    list.push({
      timerId: buildTimerId(recipeData.id, stepIndex, timerIndex),
      recipeId: recipeData.id,
      recipeTitle: recipeData.title,
      stepIndex,
      stepNumber: stepIndex + 1,
      timerIndex,
      label: label || 'Timer',
      durationSec,
    });
  });

  return list;
}

function getRemainingSeconds(runtime, nowMs = Date.now()) {
  if (runtime.status === 'paused') return Math.max(0, Math.round(runtime.pausedRemainingSec || 0));
  if (runtime.status !== 'running') return 0;
  return Math.max(0, Math.ceil((runtime.endsAtMs - nowMs) / 1000));
}

function getElapsedSeconds(runtime, nowMs = Date.now()) {
  const remaining = getRemainingSeconds(runtime, nowMs);
  return Math.max(0, runtime.durationSec - remaining);
}

function serializeRuntime(runtime) {
  return {
    timerId: runtime.timerId,
    recipeId: runtime.recipeId,
    recipeTitle: runtime.recipeTitle,
    stepIndex: runtime.stepIndex,
    stepNumber: runtime.stepNumber,
    timerIndex: runtime.timerIndex,
    label: runtime.label,
    durationSec: runtime.durationSec,
    status: runtime.status,
    startedAtMs: runtime.startedAtMs,
    endsAtMs: runtime.endsAtMs,
    pausedRemainingSec: runtime.pausedRemainingSec,
    pendingQueue: runtime.pendingQueue || [],
  };
}

function saveTimersToStorage() {
  try {
    if (timerStore.active.size === 0) {
      localStorage.removeItem(TIMER_STORAGE_KEY);
      return;
    }
    const payload = {
      active: Array.from(timerStore.active.values()).map(serializeRuntime),
      savedAtMs: Date.now(),
    };
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures.
  }
}

function restoreTimersFromStorage() {
  let raw = null;
  try {
    raw = localStorage.getItem(TIMER_STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (!raw) return;

  try {
    const payload = JSON.parse(raw);
    if (!payload || !Array.isArray(payload.active)) return;

    const now = Date.now();
    for (const item of payload.active) {
      if (!item || typeof item !== 'object') continue;
      if (typeof item.timerId !== 'string') continue;
      if (!Number.isFinite(item.durationSec) || item.durationSec <= 0) continue;

      const runtime = {
        timerId: item.timerId,
        recipeId: Number(item.recipeId),
        recipeTitle: String(item.recipeTitle || `Recipe #${Number(item.recipeId)}`),
        stepIndex: Number(item.stepIndex),
        stepNumber: Number(item.stepNumber) || (Number(item.stepIndex) + 1),
        timerIndex: Number(item.timerIndex),
        label: String(item.label || 'Timer'),
        durationSec: Number(item.durationSec),
        status: item.status === 'paused' ? 'paused' : 'running',
        startedAtMs: Number(item.startedAtMs) || now,
        endsAtMs: Number(item.endsAtMs) || now,
        pausedRemainingSec: item.pausedRemainingSec === null ? null : Number(item.pausedRemainingSec),
        pendingQueue: Array.isArray(item.pendingQueue) ? item.pendingQueue.filter(p => p && typeof p === 'object') : [],
      };

      if (runtime.status === 'running' && runtime.endsAtMs <= now) {
        runtime.endsAtMs = now;
      }
      timerStore.active.set(runtime.timerId, runtime);
    }

    if (timerStore.active.size > 0) {
      ensureTimerTicker();
      tickTimers({ silentRestored: true });
    }
  } catch {
    try {
      localStorage.removeItem(TIMER_STORAGE_KEY);
    } catch {
      // Ignore cleanup errors.
    }
  }
}

function playTimerDoneBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    osc.start(now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.stop(now + 0.18);
  } catch {
    // Audio playback can fail due to browser policy; ignore.
  }
}

function ensureTimerTicker() {
  if (timerStore.tickHandle) return;
  timerStore.tickHandle = window.setInterval(() => tickTimers(), 1000);
}

function stopTimerTickerIfIdle() {
  if (timerStore.active.size > 0 || timerStore.completed.size > 0) return;
  if (timerStore.tickHandle) {
    clearInterval(timerStore.tickHandle);
    timerStore.tickHandle = null;
  }
}

function findStepActiveTimer(recipeId, stepIndex) {
  const candidates = [];
  for (const rt of timerStore.active.values()) {
    if (rt.recipeId === recipeId && rt.stepIndex === stepIndex) candidates.push(rt);
  }
  candidates.sort((a, b) => a.timerIndex - b.timerIndex);
  return candidates[0] || null;
}

function stepHasActiveTimer(recipeId, stepIndex) {
  return !!findStepActiveTimer(recipeId, stepIndex);
}

function stepWasRecentlyCompleted(recipeId, stepIndex) {
  const now = Date.now();
  for (const done of timerStore.completed.values()) {
    if (done.recipeId === recipeId && done.stepIndex === stepIndex && done.expiresAtMs > now && done.stepComplete) {
      return true;
    }
  }
  return false;
}

function stopTimersForStep(recipeId, stepIndex, suppressSave = false) {
  const toDelete = [];
  for (const [timerId, rt] of timerStore.active.entries()) {
    if (rt.recipeId === recipeId && rt.stepIndex === stepIndex) toDelete.push(timerId);
  }
  toDelete.forEach(timerId => timerStore.active.delete(timerId));
  if (!suppressSave) saveTimersToStorage();
}

function startTimerDescriptor(descriptor, pendingQueue = [], options = {}) {
  const { fromChain = false } = options;

  const existing = timerStore.active.get(descriptor.timerId);
  if (existing && (existing.status === 'running' || existing.status === 'paused')) {
    renderTimerDock();
    refreshActiveRecipeTimerUI();
    return existing;
  }

  const now = Date.now();
  const runtime = {
    timerId: descriptor.timerId,
    recipeId: descriptor.recipeId,
    recipeTitle: descriptor.recipeTitle,
    stepIndex: descriptor.stepIndex,
    stepNumber: descriptor.stepNumber,
    timerIndex: descriptor.timerIndex,
    label: descriptor.label,
    durationSec: descriptor.durationSec,
    status: 'running',
    startedAtMs: now,
    endsAtMs: now + (descriptor.durationSec * 1000),
    pausedRemainingSec: null,
    pendingQueue,
  };

  timerStore.active.set(runtime.timerId, runtime);
  timerStore.completed.delete(runtime.timerId);
  ensureTimerTicker();
  saveTimersToStorage();

  if (!fromChain) toast(`Started timer: ${runtime.label}`);

  renderTimerDock();
  refreshActiveRecipeTimerUI();
  return runtime;
}

function startStepTimersForRecipe(recipeData, stepIndex) {
  if (!recipeData) return;
  const descriptors = buildStepTimersForRecipe(recipeData, stepIndex);
  if (!descriptors.length) {
    toast('This step has no valid timer duration.');
    return;
  }

  const existing = findStepActiveTimer(recipeData.id, stepIndex);
  if (existing) {
    const ok = confirm('A timer is already running for this step. Replace it?');
    if (!ok) return;
    stopTimersForStep(recipeData.id, stepIndex, true);
  }

  startTimerDescriptor(descriptors[0], descriptors.slice(1));
}

function pauseTimerById(timerId) {
  const rt = timerStore.active.get(timerId);
  if (!rt || rt.status !== 'running') return;
  rt.pausedRemainingSec = getRemainingSeconds(rt);
  rt.status = 'paused';
  saveTimersToStorage();
  renderTimerDock();
  refreshActiveRecipeTimerUI();
}

function resumeTimerById(timerId) {
  const rt = timerStore.active.get(timerId);
  if (!rt || rt.status !== 'paused') return;
  const now = Date.now();
  const remaining = Math.max(1, Math.round(rt.pausedRemainingSec || rt.durationSec));
  rt.startedAtMs = now - ((rt.durationSec - remaining) * 1000);
  rt.endsAtMs = now + (remaining * 1000);
  rt.pausedRemainingSec = null;
  rt.status = 'running';
  ensureTimerTicker();
  saveTimersToStorage();
  renderTimerDock();
  refreshActiveRecipeTimerUI();
}

function stopTimerById(timerId) {
  if (!timerStore.active.has(timerId)) return;
  timerStore.active.delete(timerId);
  timerStore.completed.delete(timerId);
  saveTimersToStorage();
  stopTimerTickerIfIdle();
  renderTimerDock();
  refreshActiveRecipeTimerUI();
}

function skipTimerById(timerId) {
  const rt = timerStore.active.get(timerId);
  if (!rt) return;
  completeRuntimeTimer(rt, { skipped: true });
}

function stopAllTimersForRecipe(recipeId) {
  const ids = [];
  for (const [timerId, rt] of timerStore.active.entries()) {
    if (rt.recipeId === recipeId) ids.push(timerId);
  }
  ids.forEach(timerId => timerStore.active.delete(timerId));
  if (ids.length) toast(`Stopped ${ids.length} timer${ids.length > 1 ? 's' : ''}.`);
  saveTimersToStorage();
  stopTimerTickerIfIdle();
  renderTimerDock();
  refreshActiveRecipeTimerUI();
}

function completeRuntimeTimer(runtime, options = {}) {
  const { skipped = false, silent = false } = options;
  timerStore.active.delete(runtime.timerId);

  timerStore.completed.set(runtime.timerId, {
    timerId: runtime.timerId,
    recipeId: runtime.recipeId,
    recipeTitle: runtime.recipeTitle,
    stepIndex: runtime.stepIndex,
    stepNumber: runtime.stepNumber,
    timerIndex: runtime.timerIndex,
    label: runtime.label,
    status: skipped ? 'skipped' : 'done',
    expiresAtMs: Date.now() + TIMER_COMPLETE_TTL_MS,
    stepComplete: runtime.pendingQueue.length === 0,
  });

  if (!silent) {
    if (!skipped) {
      playTimerDoneBeep();
      toast(`Timer done: ${runtime.label}`);
    }
    if (runtime.pendingQueue.length === 0) {
      toast(`Step ${runtime.stepNumber} complete for ${runtime.recipeTitle}`);
    }
  }

  if (runtime.pendingQueue.length > 0) {
    const next = runtime.pendingQueue[0];
    const rest = runtime.pendingQueue.slice(1);
    startTimerDescriptor(next, rest, { fromChain: true });
  }

  saveTimersToStorage();
  stopTimerTickerIfIdle();
  renderTimerDock();
  refreshActiveRecipeTimerUI();
}

function tickTimers(options = {}) {
  const { silentRestored = false } = options;
  const now = Date.now();
  const toFinish = [];

  for (const rt of timerStore.active.values()) {
    if (rt.status === 'running' && rt.endsAtMs <= now) toFinish.push(rt);
  }

  for (const done of timerStore.completed.values()) {
    if (done.expiresAtMs <= now) timerStore.completed.delete(done.timerId);
  }

  for (const rt of toFinish) {
    completeRuntimeTimer(rt, { silent: silentRestored });
  }

  renderTimerDock();
  refreshActiveRecipeTimerUI();
  stopTimerTickerIfIdle();
}

function getRecipeTimers(recipeId) {
  const list = [];
  for (const rt of timerStore.active.values()) {
    if (rt.recipeId === recipeId) list.push(rt);
  }
  list.sort((a, b) => a.stepIndex - b.stepIndex || a.timerIndex - b.timerIndex);
  return list;
}

function getStepTimerRowId(recipeId, stepIndex) {
  return `stepTimerRow-${recipeId}-${stepIndex}`;
}

function renderStepTimerRow(recipeData, stepIndex) {
  const step = recipeData?.parsed?.steps?.[stepIndex];
  if (!step) return '';

  const rawTimersCount = Array.isArray(step.timers) ? step.timers.length : 0;
  if (!rawTimersCount) return '';

  const validDescriptors = buildStepTimersForRecipe(recipeData, stepIndex);
  if (!validDescriptors.length) {
    return '<div class="step-timer-meta step-timer-muted">No valid timer duration in this step.</div>';
  }

  const active = findStepActiveTimer(recipeData.id, stepIndex);
  if (active) {
    const remaining = formatClock(getRemainingSeconds(active));
    const elapsed = formatClock(getElapsedSeconds(active));
    const status = active.status === 'paused' ? 'Paused' : 'Running';
    return `
      <div class="step-timer-meta">
        <span class="timer-chip ${active.status}">${status}</span>
        <span class="timer-title">⏱ ${esc(active.label)}</span>
        <span class="timer-clock">${remaining}</span>
        <span class="timer-elapsed">elapsed ${elapsed}</span>
      </div>
      <div class="timer-controls">
        ${active.status === 'running'
          ? `<button type="button" class="step-timer-btn" onclick="pauseTimerById('${active.timerId}')">Pause</button>`
          : `<button type="button" class="step-timer-btn" onclick="resumeTimerById('${active.timerId}')">Resume</button>`}
        <button type="button" class="step-timer-btn" onclick="skipTimerById('${active.timerId}')">Skip</button>
        <button type="button" class="step-timer-btn danger" onclick="stopTimerById('${active.timerId}')">Stop</button>
      </div>`;
  }

  const completed = stepWasRecentlyCompleted(recipeData.id, stepIndex);
  return `
    <div class="step-timer-meta ${completed ? 'step-timer-complete' : ''}">
      <span class="timer-chip ready">Ready</span>
      <span>${completed ? 'Step timer completed. Start again if needed.' : `${validDescriptors.length} timer${validDescriptors.length > 1 ? 's' : ''} available`}</span>
    </div>
    <div class="timer-controls">
      <button type="button" class="step-timer-btn" onclick="startStepTimer(${stepIndex})">Start Step Timer</button>
    </div>`;
}

function renderRecipeTimerPanel() {
  const el = document.getElementById('recipeTimerPanel');
  if (!el || !activeData) return;

  const timers = getRecipeTimers(activeData.id);
  if (!timers.length) {
    el.innerHTML = '<div class="recipe-timer-panel"><span>No active timers for this recipe.</span></div>';
    return;
  }

  let html = '<div class="recipe-timer-panel">';
  html += `<div class="recipe-timer-head"><strong>${timers.length}</strong> active timer${timers.length > 1 ? 's' : ''}</div>`;
  html += '<div class="recipe-timer-list">';
  for (const rt of timers) {
    html += `<div class="recipe-timer-item">
      <span class="timer-chip ${rt.status}">${rt.status === 'paused' ? 'Paused' : 'Running'}</span>
      <span>Step ${rt.stepNumber}: ${esc(rt.label)}</span>
      <strong>${formatClock(getRemainingSeconds(rt))}</strong>
    </div>`;
  }
  html += '</div>';
  html += `<div class="timer-controls"><button type="button" class="step-timer-btn danger" onclick="stopAllTimersForRecipe(${activeData.id})">Stop All For Recipe</button></div>`;
  html += '</div>';
  el.innerHTML = html;
}

function refreshActiveRecipeTimerUI() {
  if (!activeData) return;
  renderRecipeTimerPanel();

  const steps = activeData?.parsed?.steps || [];
  for (let i = 0; i < steps.length; i++) {
    const row = document.getElementById(getStepTimerRowId(activeData.id, i));
    if (row) row.innerHTML = renderStepTimerRow(activeData, i);

    const stepEl = document.getElementById(`recipeStep-${activeData.id}-${i}`);
    if (stepEl) {
      stepEl.classList.toggle('active-timer-step', stepHasActiveTimer(activeData.id, i));
      stepEl.classList.toggle('timer-step-complete', stepWasRecentlyCompleted(activeData.id, i));
    }
  }
}

function toggleTimerDock() {
  timerDockCollapsed = !timerDockCollapsed;
  renderTimerDock();
}

function openRecipeFromTimer(recipeId) {
  if (!recipeExists(recipeId)) {
    toast('Recipe no longer exists');
    return;
  }
  viewRecipe(recipeId);
}

function renderTimerDock() {
  const dock = document.getElementById('timerDock');
  if (!dock) return;

  const active = Array.from(timerStore.active.values()).sort((a, b) => {
    if (a.status !== b.status) return a.status === 'running' ? -1 : 1;
    return a.endsAtMs - b.endsAtMs;
  });
  const completed = Array.from(timerStore.completed.values()).sort((a, b) => b.expiresAtMs - a.expiresAtMs);

  const hasEntries = active.length > 0 || completed.length > 0;
  dock.classList.toggle('visible', hasEntries);
  document.body.classList.toggle('timer-dock-visible', hasEntries);

  if (!hasEntries) {
    dock.innerHTML = '';
    return;
  }

  let html = '<div class="timer-dock-bar">';
  html += `<button type="button" class="timer-dock-toggle" onclick="toggleTimerDock()">${timerDockCollapsed ? '▲' : '▼'}</button>`;
  html += `<div class="timer-dock-title">Timers <span class="timer-dock-count">${active.length}</span></div>`;
  html += '</div>';

  if (!timerDockCollapsed) {
    html += '<div class="timer-dock-list">';

    for (const rt of active) {
      const remaining = formatClock(getRemainingSeconds(rt));
      const elapsed = formatClock(getElapsedSeconds(rt));
      const canOpen = recipeExists(rt.recipeId);
      html += `
      <div class="timer-dock-item ${rt.status === 'paused' ? 'paused' : 'running'}">
        <div class="timer-dock-item-head">
          <span class="timer-chip ${rt.status}">${rt.status === 'paused' ? 'Paused' : 'Running'}</span>
          ${canOpen
            ? `<button type="button" class="timer-link" onclick="openRecipeFromTimer(${rt.recipeId})">${esc(rt.recipeTitle)}</button>`
            : `<span class="timer-link disabled">${esc(rt.recipeTitle)} (deleted)</span>`}
          <span class="timer-step">Step ${rt.stepNumber}</span>
        </div>
        <div class="timer-dock-item-body">
          <div class="timer-dock-label">${esc(rt.label)}</div>
          <div class="timer-dock-clocks"><strong>${remaining}</strong><span>elapsed ${elapsed}</span></div>
        </div>
        <div class="timer-controls">
          ${rt.status === 'running'
            ? `<button type="button" class="step-timer-btn" onclick="pauseTimerById('${rt.timerId}')">Pause</button>`
            : `<button type="button" class="step-timer-btn" onclick="resumeTimerById('${rt.timerId}')">Resume</button>`}
          <button type="button" class="step-timer-btn" onclick="skipTimerById('${rt.timerId}')">Skip</button>
          <button type="button" class="step-timer-btn danger" onclick="stopTimerById('${rt.timerId}')">Stop</button>
        </div>
      </div>`;
    }

    for (const done of completed) {
      html += `
      <div class="timer-dock-item done">
        <div class="timer-dock-item-head">
          <span class="timer-chip ready">${done.status === 'skipped' ? 'Skipped' : 'Done'}</span>
          ${recipeExists(done.recipeId)
            ? `<button type="button" class="timer-link" onclick="openRecipeFromTimer(${done.recipeId})">${esc(done.recipeTitle)}</button>`
            : `<span class="timer-link disabled">${esc(done.recipeTitle)} (deleted)</span>`}
          <span class="timer-step">Step ${done.stepNumber}</span>
        </div>
        <div class="timer-dock-item-body">
          <div class="timer-dock-label">${esc(done.label)}</div>
        </div>
      </div>`;
    }
    html += '</div>';
  }

  dock.innerHTML = html;
}

function startStepTimer(stepIndex) {
  if (!activeData) return;
  startStepTimersForRecipe(activeData, stepIndex);
}

// ---- Render recipe list ----
function renderRecipeList() {
  const container = document.getElementById('recipeList');
  const filtered = recipes.filter(r =>
    !searchFilter || r.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
    (r.description || '').toLowerCase().includes(searchFilter.toLowerCase())
  );

  const groups = {};
  for (const r of filtered) {
    const cat = r.category || 'Uncategorized';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(r);
  }

  let html = '';
  for (const [cat, items] of Object.entries(groups).sort()) {
    html += `<div><div class="category-label">${esc(cat)}</div>`;
    for (const r of items) {
      const isActive = r.id === activeId;
      const isSelected = selectedIds.has(r.id);
      html += `
          <div class="recipe-item ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}" data-id="${r.id}">
            <div class="recipe-check" onclick="event.stopPropagation(); toggleSelect(${r.id})"></div>
            <div class="recipe-info" onclick="viewRecipe(${r.id})">
              <h3>${esc(r.title)}</h3>
              <p>${esc(r.description || '')}</p>
            </div>
          </div>`;
    }
    html += '</div>';
  }
  container.innerHTML = html;
}

function filterRecipes(val) {
  searchFilter = val;
  renderRecipeList();
}

function toggleSelect(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  renderRecipeList();
  updateShoppingList();
  updateCartBadge();
}

function updateCartBadge() {
  const b1 = document.getElementById('cartBadge');
  const b2 = document.getElementById('shoppingBadge');
  if (selectedIds.size > 0) {
    b1.textContent = selectedIds.size; b1.style.display = 'flex';
    b2.textContent = selectedIds.size; b2.style.display = 'inline-flex';
  } else {
    b1.style.display = 'none'; b2.style.display = 'none';
  }
}

// ---- Copy / Export helpers ----
function recipeToText(data) {
  const p = data.parsed;
  const lines = [];
  lines.push(data.title.toUpperCase());
  if (data.description) lines.push(data.description);
  lines.push('');

  if (Object.keys(p.metadata).length) {
    for (const [k, v] of Object.entries(p.metadata)) lines.push(`${k}: ${formatMetaValue(v)}`);
    lines.push('');
  }

  if (p.ingredients.length) {
    lines.push('INGREDIENTS');
    for (const ing of p.ingredients) {
      const qty = [ing.quantity, ing.unit].filter(Boolean).join(' ');
      lines.push(`  ${qty ? qty + ' ' : ''}${ing.name}${ing.preparation ? ' (' + ing.preparation + ')' : ''}`);
    }
    lines.push('');
  }

  lines.push('METHOD');
  let num = 0;
  for (const step of p.steps) {
    num++;
    lines.push(`  ${num}. ${step.text}`);
  }
  return lines.join('\n');
}

function recipeToMarkdown(data) {
  const p = data.parsed;
  const lines = [];
  lines.push(`# ${data.title}`);
  if (data.description) lines.push(`*${data.description}*`);
  lines.push('');

  if (Object.keys(p.metadata).length) {
    for (const [k, v] of Object.entries(p.metadata)) lines.push(`**${k}:** ${formatMetaValue(v)}  `);
    lines.push('');
  }

  if (p.ingredients.length) {
    lines.push('## Ingredients');
    for (const ing of p.ingredients) {
      const qty = [ing.quantity, ing.unit].filter(Boolean).join(' ');
      lines.push(`- ${qty ? qty + ' ' : ''}${ing.name}${ing.preparation ? ' (' + ing.preparation + ')' : ''}`);
    }
    lines.push('');
  }

  lines.push('## Method');
  let num = 0;
  for (const step of p.steps) {
    num++;
    lines.push(`${num}. ${step.text}`);
  }
  return lines.join('\n');
}

function recipeToCooklang(data) {
  return data.source;
}

function shoppingToText() {
  if (!lastShoppingData) return '';
  const lines = ['SHOPPING LIST'];
  if (lastShoppingData.recipes) lines.push('For: ' + lastShoppingData.recipes.join(', '));
  lines.push('');
  for (const ing of lastShoppingData.ingredients) {
    const qty = [ing.quantity, ing.unit].filter(Boolean).join(' ');
    lines.push(`  ${qty ? qty.padEnd(12) : ''.padEnd(12)} ${ing.name}`);
  }
  return lines.join('\n');
}

function shoppingToMarkdown() {
  if (!lastShoppingData) return '';
  const lines = ['# Shopping List'];
  if (lastShoppingData.recipes) lines.push('*' + lastShoppingData.recipes.join(', ') + '*');
  lines.push('');
  for (const ing of lastShoppingData.ingredients) {
    const qty = [ing.quantity, ing.unit].filter(Boolean).join(' ');
    lines.push(`- ${qty ? '**' + qty + '** ' : ''}${ing.name}`);
  }
  return lines.join('\n');
}

async function copyToClipboard(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label} copied to clipboard`);
  } catch {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    toast(`${label} copied to clipboard`);
  }
}

function downloadFile(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
  toast(`Downloaded ${filename}`);
}

// Recipe copy/export
function copyRecipe(format) {
  if (!activeData) return;
  const text = format === 'md' ? recipeToMarkdown(activeData)
    : format === 'cook' ? recipeToCooklang(activeData)
      : recipeToText(activeData);
  copyToClipboard(text, 'Recipe');
}

function exportRecipe(format) {
  if (!activeData) return;
  const slug = activeData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (format === 'md') {
    downloadFile(recipeToMarkdown(activeData), `${slug}.md`);
  } else if (format === 'cook') {
    downloadFile(recipeToCooklang(activeData), `${slug}.cook`);
  } else {
    downloadFile(recipeToText(activeData), `${slug}.txt`);
  }
}

// Shopping copy/export
function copyShoppingList() {
  copyToClipboard(shoppingToText(), 'Shopping list');
}

function exportShoppingList(format) {
  if (format === 'md') {
    downloadFile(shoppingToMarkdown(), 'shopping-list.md');
  } else {
    downloadFile(shoppingToText(), 'shopping-list.txt');
  }
}

// ---- View recipe detail ----
async function viewRecipe(id, options = {}) {
  const { syncUrl = true, replaceUrl = false, closePanels = true } = options;
  if (!recipeExists(id)) {
    clearRecipeSelection({ syncUrl, replaceUrl: true });
    return;
  }

  const token = ++recipeLoadToken;
  activeId = id;
  persistRecipeSelection(id);

  if (syncUrl) setRecipeIdInUrl(id, { replace: replaceUrl });

  renderRecipeList();
  if (closePanels) closeDrawers();

  const main = document.getElementById('mainContent');
  main.innerHTML = '<div class="empty-state"><p style="font-style:italic;">Loading…</p></div>';

  try {
    const data = await fetchRecipeDetail(id);
    if (token !== recipeLoadToken) return;

    activeData = data;
    const p = data.parsed;
    let html = '<div class="recipe-detail">';

    html += '<div class="recipe-title-row">';
    html += `<h2>${esc(data.title)}</h2>`;
    html += '<div class="recipe-actions">';
    html += `<button class="action-btn" onclick="copyRecipe('text')" title="Copy as plain text">📋 Copy</button>`;
    html += `<button class="action-btn" onclick="exportRecipe('cook')" title="Download .cook file">↓ .cook</button>`;
    html += `<button class="action-btn" onclick="exportRecipe('md')" title="Download Markdown">↓ .md</button>`;
    html += `<button class="action-btn" onclick="exportRecipe('txt')" title="Download plain text">↓ .txt</button>`;
    if (adminMode) {
      html += `<button class="action-btn" onclick="openEditRecipe(${data.id})" title="Edit recipe" style="color:var(--terracotta);">✎ Edit</button>`;
    }
    html += '</div></div>';

    if (data.description) html += `<p class="description">${esc(data.description)}</p>`;

    const meta = p.metadata || {};
    if (Object.keys(meta).length) {
      html += '<div class="recipe-meta-bar">';
      for (const [k, v] of Object.entries(meta)) {
        html += `<span class="meta-chip"><strong>${esc(k)}:</strong> ${esc(formatMetaValue(v))}</span>`;
      }
      html += '</div>';
    }

    if (p.notes && p.notes.length) {
      html += '<div class="section-title">Notes</div>';
      for (const note of p.notes) {
        html += `<div class="step" style="margin-bottom:0.25rem;"><span class="step-num">›</span><div class="step-text"><em>${esc(note.text)}</em></div></div>`;
      }
    }

    if (p.ingredients.length) {
      html += '<div class="section-title">Ingredients</div>';
      html += '<div class="recipe-ingredients-grid">';
      for (const ing of p.ingredients) {
        const qty = [ing.quantity, ing.unit].filter(Boolean).join(' ');
        html += '<div class="ingredient-pill">';
        if (qty) html += `<span class="qty">${esc(qty)}</span>`;
        html += `<span>${esc(ing.name)}${ing.preparation ? ' <small style="color:var(--ink-muted);font-style:italic;">(' + esc(ing.preparation) + ')</small>' : ''}</span>`;
        html += '</div>';
      }
      html += '</div>';
    }

    html += '<div class="section-title">Method</div>';
    html += '<div id="recipeTimerPanel"></div>';

    let currentSection = '';
    let stepNum = 0;
    for (const step of p.steps) {
      if (step.section && step.section !== currentSection) {
        currentSection = step.section;
        html += `<div class="section-title" style="color:var(--sage);font-size:0.95rem;margin-top:1rem;">${esc(currentSection)}</div>`;
      }

      const stepIndex = stepNum;
      stepNum++;
      const stepClasses = ['step'];
      if (stepHasActiveTimer(data.id, stepIndex)) stepClasses.push('active-timer-step');
      if (stepWasRecentlyCompleted(data.id, stepIndex)) stepClasses.push('timer-step-complete');

      const highlighted = highlightStep(step);
      html += `<div class="${stepClasses.join(' ')}" id="recipeStep-${data.id}-${stepIndex}" data-step-index="${stepIndex}">`;
      html += `<span class="step-num">${stepNum}</span><div class="step-text">${highlighted}`;
      html += `<div class="step-timer-row" id="${getStepTimerRowId(data.id, stepIndex)}"></div>`;
      html += '</div></div>';
    }

    html += `<button class="source-toggle" onclick="this.nextElementSibling.classList.toggle('visible')">
      &lt;/&gt; View Cooklang source
    </button>`;
    html += `<pre class="source-block">${highlightSource(data.source)}</pre>`;
    html += '</div>';
    main.innerHTML = html;

    refreshActiveRecipeTimerUI();
    renderTimerDock();
  } catch {
    if (token !== recipeLoadToken) return;
    toast('Could not load recipe');
    clearRecipeSelection({ syncUrl: true, replaceUrl: true });
  }
}

// Single-pass tokenizer: finds all @ingredients, #cookware, ~timers in one regex
// so replacements never interfere with each other.
const CK_TOKEN_RE = /(@([^\s@#~{}]+(?:\s+[^\s@#~{}]+)*?)\{([^}]*)\}(?:\(([^)]*)\))?)|(@([a-zA-Z\u00C0-\u024F][a-zA-Z0-9\u00C0-\u024F _-]*))|(#([^\s@#~{}]+(?:\s+[^\s@#~{}]+)*?)\{([^}]*)\}(?:\(([^)]*)\))?)|(#([a-zA-Z\u00C0-\u024F][a-zA-Z0-9\u00C0-\u024F _-]*))|(~([^\s@#~{}]*)\{([^}]*)\})/g;

function highlightStep(step) {
  return step.raw.replace(CK_TOKEN_RE, (match, iBrace, iName, iQty, iPrep, iBare, iBareName, cBrace, cName, cQty, cPrep, cBare, cBareName, tm, tName, tQty) => {
    if (iBrace) {
      // @ingredient{qty%unit}(prep)
      const [qty, unit] = (iQty || '').includes('%') ? iQty.split('%', 2) : [iQty, ''];
      const display = [qty, unit, iName].filter(Boolean).join(' ');
      const prepStr = iPrep ? ' (' + esc(iPrep) + ')' : '';
      return '<span class="ing-highlight">' + esc(display) + prepStr + '</span>';
    }
    if (iBare) {
      return '<span class="ing-highlight">' + esc(iBareName) + '</span>';
    }
    if (cBrace) {
      return '<span class="cookware-highlight">' + esc(cName) + '</span>';
    }
    if (cBare) {
      return '<span class="cookware-highlight">' + esc(cBareName) + '</span>';
    }
    if (tm) {
      const [qty, unit] = (tQty || '').includes('%') ? tQty.split('%', 2) : [tQty, ''];
      let display = [qty, unit].filter(Boolean).join(' ');
      if (tName) display = tName + ' (' + display + ')';
      return '<span class="timer-highlight">⏱ ' + esc(display) + '</span>';
    }
    return match;
  });
}

function highlightSource(source) {
  let text = esc(source);
  // Metadata, notes, and sections are line-level, safe to do separately
  text = text.replace(/^(---\s*)$/gm, '<span class="ck-meta">$1</span>');
  text = text.replace(/^([A-Za-z0-9_-]+\s*:\s*.+)$/gm, '<span class="ck-meta">$1</span>');
  text = text.replace(/^(\s*-\s+.+)$/gm, '<span class="ck-meta">$1</span>');
  text = text.replace(/^(&gt;&gt;\s*.+)$/gm, '<span class="ck-meta">$1</span>');
  text = text.replace(/^(&gt;\s*.+)$/gm, '<span class="ck-meta">$1</span>');
  text = text.replace(/^(=+\s*.*?=*\s*)$/gm, '<span class="ck-section">$1</span>');
  // Single-pass for @, #, ~ tokens
  const SRC_RE = /(@[^\s@#~{}]+(?:\s+[^\s@#~{}]+)*?\{[^}]*\}(?:\([^)]*\))?)|(&#64;[a-zA-Z\u00C0-\u024F][a-zA-Z0-9\u00C0-\u024F _-]*)|(@[a-zA-Z\u00C0-\u024F][a-zA-Z0-9\u00C0-\u024F _-]*)|(#[^\s@#~{}]+(?:\s+[^\s@#~{}]+)*?\{[^}]*\})|(#[a-zA-Z\u00C0-\u024F][a-zA-Z0-9\u00C0-\u024F _-]*)|(~[^\s@#~{}]*\{[^}]*\})/g;
  text = text.replace(SRC_RE, (m, ingB, _skip, ingN, cwB, cwN, timer) => {
    if (ingB) return '<span class="ck-ing">' + ingB + '</span>';
    if (ingN) return '<span class="ck-ing">' + ingN + '</span>';
    if (cwB) return '<span class="ck-cw">' + cwB + '</span>';
    if (cwN) return '<span class="ck-cw">' + cwN + '</span>';
    if (timer) return '<span class="ck-timer">' + timer + '</span>';
    return m;
  });
  return text;
}

// ---- Shopping list ----
async function updateShoppingList() {
  const container = document.getElementById('shoppingContent');
  const actionsEl = document.getElementById('shoppingActions');
  const ids = [...selectedIds];

  if (ids.length === 0) {
    lastShoppingData = null;
    actionsEl.style.display = 'none';
    container.innerHTML = '<div class="shopping-empty"><div class="icon">🧺</div><p>Select recipes to generate<br>a combined shopping list</p></div>';
    return;
  }

  container.innerHTML = '<div class="shopping-empty"><p style="font-style:italic;">Loading…</p></div>';
  const data = await fetchCombined(ids);
  lastShoppingData = data;
  actionsEl.style.display = 'flex';

  let html = '';
  if (data.recipes && data.recipes.length) {
    html += '<div class="selected-recipes-list">';
    for (const title of data.recipes) html += `<span class="shopping-recipe-tag">${esc(title)}</span>`;
    html += '</div>';
  }
  for (const ing of data.ingredients) {
    const qty = [ing.quantity, ing.unit].filter(Boolean).join(' ');
    html += `<div class="shopping-item"><span class="qty">${esc(qty || '—')}</span><span class="name">${esc(ing.name)}</span></div>`;
  }
  container.innerHTML = html;
}

// ---- Auth & Admin mode ----
let authStatus = { password_set: false, logged_in: false };

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/status');
    authStatus = await res.json();
  } catch { /* offline fallback */ }
  updateAdminButton();
}

function getAdminModePreference() {
  try {
    return localStorage.getItem(ADMIN_MODE_PREF_KEY) === '1';
  } catch {
    return false;
  }
}

function setAdminModePreference(enabled) {
  try {
    if (enabled) localStorage.setItem(ADMIN_MODE_PREF_KEY, '1');
    else localStorage.removeItem(ADMIN_MODE_PREF_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function updateAdminButton() {
  const btn = document.getElementById('adminToggle');
  if (adminMode) {
    btn.classList.add('active');
    btn.innerHTML = authStatus.password_set ? '🔓 Admin (on)' : '✎ Admin (on)';
  } else {
    btn.classList.remove('active');
    btn.innerHTML = authStatus.password_set ? '🔒 Admin' : '✎ Admin';
  }
}

async function toggleAdmin() {
  if (adminMode) {
    // Turn off
    adminMode = false;
    setAdminModePreference(false);
    updateAdminButton();
    renderRecipeList();
    if (activeId) viewRecipe(activeId, { replaceUrl: true });
    const existingBtn = document.getElementById('addRecipeBtn');
    if (existingBtn) existingBtn.remove();
    toast('Admin mode off');
    return;
  }

  // Turn on — check if we need a password
  await checkAuth();

  if (authStatus.password_set && !authStatus.logged_in) {
    // Show login modal
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('loginModal').classList.add('visible');
    setTimeout(() => document.getElementById('loginPassword').focus(), 100);
    return;
  }

  // No password or already logged in — activate directly
  activateAdmin();
}

function activateAdmin() {
  adminMode = true;
  setAdminModePreference(true);
  updateAdminButton();
  renderRecipeList();
  if (activeId) viewRecipe(activeId, { replaceUrl: true });
  addNewRecipeButton();
  toast('Admin mode on — click ✎ Edit on recipes or add new ones');
}

async function submitLogin() {
  const pw = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pw }),
  });

  if (res.ok) {
    authStatus.logged_in = true;
    closeLogin();
    activateAdmin();
  } else {
    errEl.textContent = 'Wrong password. Please try again.';
    errEl.style.display = 'block';
    document.getElementById('loginPassword').select();
  }
}

function closeLogin() {
  document.getElementById('loginModal').classList.remove('visible');
}

async function adminLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  authStatus.logged_in = false;
  adminMode = false;
  setAdminModePreference(false);
  updateAdminButton();
  renderRecipeList();
  if (activeId) viewRecipe(activeId, { replaceUrl: true });
  const existingBtn = document.getElementById('addRecipeBtn');
  if (existingBtn) existingBtn.remove();
  toast('Logged out');
}

function addNewRecipeButton() {
  if (document.getElementById('addRecipeBtn')) return;
  const sh = document.querySelector('.sidebar-header');
  const btn = document.createElement('button');
  btn.id = 'addRecipeBtn';
  btn.className = 'btn btn-primary';
  btn.style.cssText = 'width:100%;margin-top:0.5rem;font-size:0.82rem;padding:0.4rem;';
  btn.textContent = '+ Add Recipe';
  btn.onclick = openNewRecipe;
  sh.appendChild(btn);
}

function openNewRecipe() {
  document.getElementById('editId').value = '';
  document.getElementById('fieldTitle').value = '';
  document.getElementById('fieldCategory').value = '';
  document.getElementById('fieldDescription').value = '';
  document.getElementById('fieldSource').value = '';
  document.getElementById('modalTitle').textContent = 'Add Recipe';
  document.getElementById('saveBtn').textContent = 'Save Recipe';
  document.getElementById('deleteWrap').style.display = 'none';
  document.getElementById('adminModal').classList.add('visible');
}

async function openEditRecipe(id) {
  const data = await fetchRecipeDetail(id);
  document.getElementById('editId').value = id;
  document.getElementById('fieldTitle').value = data.title;
  document.getElementById('fieldCategory').value = data.category || '';
  document.getElementById('fieldDescription').value = data.description || '';
  document.getElementById('fieldSource').value = data.source;
  document.getElementById('modalTitle').textContent = 'Edit Recipe';
  document.getElementById('saveBtn').textContent = 'Update Recipe';
  document.getElementById('deleteWrap').style.display = 'block';
  document.getElementById('adminModal').classList.add('visible');
}

function closeAdmin() {
  document.getElementById('adminModal').classList.remove('visible');
}

async function saveRecipe() {
  const id = document.getElementById('editId').value;
  const body = {
    title: document.getElementById('fieldTitle').value,
    category: document.getElementById('fieldCategory').value,
    description: document.getElementById('fieldDescription').value,
    source: document.getElementById('fieldSource').value,
  };

  if (!body.source.trim()) {
    toast('Source is required');
    return;
  }

  const url = id ? `/api/recipes/${id}` : '/api/recipes';
  const method = id ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    const data = await res.json();
    toast(id ? 'Recipe updated' : 'Recipe created');
    closeAdmin();
    await fetchRecipes();
    viewRecipe(data.id);
  } else if (res.status === 401) {
    toast('Session expired — please log in again');
    adminMode = false;
    authStatus.logged_in = false;
    setAdminModePreference(false);
    updateAdminButton();
  } else {
    const err = await res.json();
    toast('Error: ' + (err.error || 'Unknown'));
  }
}

async function deleteRecipe() {
  const id = document.getElementById('editId').value;
  if (!id) return;
  if (!confirm('Delete this recipe permanently?')) return;

  const res = await fetch(`/api/recipes/${id}`, { method: 'DELETE' });
  if (res.ok) {
    toast('Recipe deleted');
    closeAdmin();
    const deletedId = parseInt(id, 10);
    selectedIds.delete(deletedId);
    await fetchRecipes();
    updateShoppingList();
    updateCartBadge();
    if (activeId === deletedId) {
      clearRecipeSelection({ syncUrl: true, replaceUrl: true });
    } else {
      renderRecipeList();
    }
    renderTimerDock();
    refreshActiveRecipeTimerUI();
  } else if (res.status === 401) {
    toast('Session expired — please log in again');
    adminMode = false;
    authStatus.logged_in = false;
    setAdminModePreference(false);
    updateAdminButton();
  }
}

// ---- Mobile drawers ----
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('visible');
}
function toggleCart() {
  document.getElementById('shoppingPanel').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('visible');
}
function closeDrawers() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('shoppingPanel').classList.remove('open');
  document.getElementById('overlay').classList.remove('visible');
}

function esc(s) {
  if (!s) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function formatMetaValue(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (value === null || value === undefined) return '';
  return String(value);
}

async function initApp() {
  await fetchRecipes();
  restoreTimersFromStorage();
  await checkAuth();
  if (getAdminModePreference()) {
    if (!authStatus.password_set || authStatus.logged_in) {
      activateAdmin();
    } else {
      setAdminModePreference(false);
    }
  }
  await syncSelectionFromUrl();
  renderTimerDock();
}

initApp();

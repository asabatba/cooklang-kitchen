
(() => {
  const APP_CONFIG = window.__APP_CONFIG__ || {};
  const ADMIN_MODE_PREF_KEY = 'cooklang_admin_mode_preference';
  const TIMER_STORAGE_KEY = 'cooklang_timers_v1';
  const RECIPE_SELECTION_STORAGE_KEY = 'cooklang_recipe_selection_v1';
  const THEME_STORAGE_KEY = 'cooklang_theme';
  const LANGUAGE_STORAGE_KEY = 'cooklang_language';
  const TIMER_COMPLETE_TTL_MS = 15000;

  const CK_TOKEN_RE = /(@([^\s@#~{}]+(?:\s+[^\s@#~{}]+)*?)\{([^}]*)\}(?:\(([^)]*)\))?)|(@([a-zA-Z\u00C0-\u024F][a-zA-Z0-9\u00C0-\u024F _-]*))|(#([^\s@#~{}]+(?:\s+[^\s@#~{}]+)*?)\{([^}]*)\}(?:\(([^)]*)\))?)|(#([a-zA-Z\u00C0-\u024F][a-zA-Z0-9\u00C0-\u024F _-]*))|(~([^\s@#~{}]*)\{([^}]*)\})/g;
  const SRC_RE = /(@[^\s@#~{}]+(?:\s+[^\s@#~{}]+)*?\{[^}]*\}(?:\([^)]*\))?)|(@[a-zA-Z\u00C0-\u024F][a-zA-Z0-9\u00C0-\u024F _-]*)|(#[^\s@#~{}]+(?:\s+[^\s@#~{}]+)*?\{[^}]*\})|(#[a-zA-Z\u00C0-\u024F][a-zA-Z0-9\u00C0-\u024F _-]*)|(~[^\s@#~{}]*\{[^}]*\})/g;

  function esc(value) {
    if (value === null || value === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(value);
    return div.innerHTML;
  }

  function formatMetaValue(value) {
    if (Array.isArray(value)) return value.join(', ');
    if (value === null || value === undefined) return '';
    return String(value);
  }

  const RECIPE_TEXT_FORMAT = {
    heading: (text) => text.toUpperCase(),
    subtitle: (text) => text,
    metaLine: (k, v) => `${k}: ${v}`,
    sectionHeading: (text) => text.toUpperCase(),
    listItem: (text) => `  ${text}`,
    numberedItem: (n, text) => `  ${n}. ${text}`,
  };

  const RECIPE_MARKDOWN_FORMAT = {
    heading: (text) => `# ${text}`,
    subtitle: (text) => `*${text}*`,
    metaLine: (k, v) => `**${k}:** ${v}  `,
    sectionHeading: (text) => `## ${text}`,
    listItem: (text) => `- ${text}`,
    numberedItem: (n, text) => `${n}. ${text}`,
  };

  function formatRecipeArtifact(data, fmt) {
    const p = data.parsed;
    const lines = [];
    lines.push(fmt.heading(data.title || ''));
    if (data.description) lines.push(fmt.subtitle(data.description));
    lines.push('');
    if (Object.keys(p.metadata || {}).length) {
      for (const [k, v] of Object.entries(p.metadata)) lines.push(fmt.metaLine(k, formatMetaValue(v)));
      lines.push('');
    }
    if (p.ingredients.length) {
      lines.push(fmt.sectionHeading('Ingredients'));
      for (const ing of p.ingredients) {
        const qty = [ing.quantity, ing.unit].filter(Boolean).join(' ');
        lines.push(fmt.listItem(`${qty ? qty + ' ' : ''}${ing.name}${ing.preparation ? ` (${ing.preparation})` : ''}`));
      }
      lines.push('');
    }
    lines.push(fmt.sectionHeading('Method'));
    p.steps.forEach((step, idx) => lines.push(fmt.numberedItem(idx + 1, step.text)));
    return lines.join('\n');
  }

  const SHOPPING_TEXT_FORMAT = {
    heading: () => 'SHOPPING LIST',
    subtitle: (recipes) => `For: ${recipes}`,
    listItem: (qty, name) => `  ${qty ? qty.padEnd(12) : ''.padEnd(12)} ${name}`,
  };

  const SHOPPING_MARKDOWN_FORMAT = {
    heading: () => '# Shopping List',
    subtitle: (recipes) => `*${recipes}*`,
    listItem: (qty, name) => `- ${qty ? `**${qty}** ` : ''}${name}`,
  };

  function formatShoppingArtifact(data, fmt) {
    if (!data) return '';
    const lines = [fmt.heading()];
    if (data.recipes) lines.push(fmt.subtitle(data.recipes.join(', ')));
    lines.push('');
    for (const ing of data.ingredients) {
      const qty = [ing.quantity, ing.unit].filter(Boolean).join(' ');
      lines.push(fmt.listItem(qty, ing.name));
    }
    return lines.join('\n');
  }

  function getTranslationLanguages() {
    const raw = Array.isArray(APP_CONFIG.translationLanguages) ? APP_CONFIG.translationLanguages : ['en'];
    const unique = [];
    const seen = new Set();
    raw.forEach((code) => {
      const normalized = String(code || '').trim().toLowerCase();
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      unique.push({
        code: normalized,
        label: normalized === 'en' ? 'English' : normalized.toUpperCase(),
      });
    });
    if (!seen.has('en')) unique.unshift({ code: 'en', label: 'English' });
    return unique;
  }

  function normalizeTimerUnit(unitRaw) {
    const unit = (unitRaw || '').trim().toLowerCase().replace(/\./g, '');
    const map = {
      s: 'seconds', sec: 'seconds', secs: 'seconds', second: 'seconds', seconds: 'seconds',
      m: 'minutes', min: 'minutes', mins: 'minutes', minute: 'minutes', minutes: 'minutes',
      h: 'hours', hr: 'hours', hrs: 'hours', hour: 'hours', hours: 'hours',
      seg: 'seconds', segs: 'seconds', segundo: 'seconds', segundos: 'seconds',
      minuto: 'minutes', minutos: 'minutes', hora: 'hours', horas: 'hours',
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
        if (!den) return null;
        return whole + (num / den);
      }
      const frac = cleaned.match(/^(\d+)\/(\d+)$/);
      if (frac) {
        const num = Number(frac[1]);
        const den = Number(frac[2]);
        if (!den) return null;
        return num / den;
      }
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : null;
    }

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

  function formatCountdownDisplay(remainingSec) {
    const sec = Math.floor(remainingSec || 0);
    if (sec < 0) return `+${formatClock(Math.abs(sec))}`;
    return formatClock(sec);
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function formatISODate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function parseISODateLocal(str) {
    const [y, m, d] = String(str).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  function mondayOfDate(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    date.setDate(date.getDate() + diff);
    return date;
  }

  async function fetchJSON(url, options = {}) {
    const res = await fetch(url, options);
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { res, body };
  }

  window.kitchenApp = () => ({
    translationLanguages: getTranslationLanguages(),
    recipes: [],
    selectedCounts: {},
    activeId: null,
    activeData: null,
    activeLoading: false,
    activeError: '',
    searchFilter: '',
    showSource: false,
    shoppingLoading: false,
    lastShoppingData: null,
    adminMode: false,
    authStatus: { password_set: false, logged_in: false },
    adminForm: { id: null, title: '', category: '', description: '', source: '' },
    translationAdmin: {
      language: '',
      loading: false,
      missing: { total: 0, counts: {}, labels: {} },
      lastResult: null,
      error: '',
    },
    loginPassword: '',
    loginError: '',
    recipeLoadToken: 0,
    planOpen: false,
    planWeekStart: formatISODate(mondayOfDate(new Date())),
    planEntries: {},
    planLoading: false,
    planPicker: { date: null, slot: null, search: '' },
    timers: { active: [], completed: [], tickHandle: null },
    ui: {
      sidebarOpen: false,
      cartOpen: false,
      adminModalOpen: false,
      loginModalOpen: false,
      translationModalOpen: false,
      timerDockCollapsed: false,
      toastQueue: [],
      theme: 'dark',
      language: 'en',
    },

    get selectedCount() { return Object.keys(this.selectedCounts).length; },
    get hasShoppingData() {
      return !!(this.lastShoppingData && Array.isArray(this.lastShoppingData.ingredients) && this.lastShoppingData.ingredients.length > 0);
    },
    get hasAnyTimers() { return this.timers.active.length > 0 || this.timers.completed.length > 0; },
    get currentLanguage() { return this.ui.language || 'en'; },
    get nonEnglishTranslationLanguages() {
      return this.translationLanguages.filter((lang) => lang.code !== 'en');
    },

    get currentWeekDates() {
      const start = parseISODateLocal(this.planWeekStart);
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        return formatISODate(d);
      });
    },

    get planWeekLabel() {
      const dates = this.currentWeekDates;
      const start = parseISODateLocal(dates[0]);
      const end = parseISODateLocal(dates[6]);
      const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const endLabel = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      return `${startLabel} – ${endLabel}`;
    },

    get weekRecipeCounts() {
      const counts = {};
      for (const date of this.currentWeekDates) {
        for (const slot of ['lunch', 'dinner']) {
          const id = this.planEntries[this.planEntryKey(date, slot)];
          if (!id) continue;
          counts[id] = (counts[id] || 0) + 1;
        }
      }
      return counts;
    },

    get planPickerResults() {
      const term = (this.planPicker.search || '').trim().toLowerCase();
      const list = term
        ? this.recipes.filter((r) => (r.title || '').toLowerCase().includes(term) || (r.description || '').toLowerCase().includes(term))
        : this.recipes;
      return [...list].sort((a, b) => a.title.localeCompare(b.title));
    },

    get filteredRecipesByCategory() {
      const term = this.searchFilter.trim().toLowerCase();
      const filtered = this.recipes.filter((r) => {
        if (!term) return true;
        return (r.title || '').toLowerCase().includes(term) || (r.description || '').toLowerCase().includes(term);
      });
      const groups = {};
      for (const recipe of filtered) {
        const cat = recipe.category || 'Uncategorized';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(recipe);
      }
      return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
    },

    get renderedSteps() {
      if (!this.activeData || !this.activeData.parsed || !Array.isArray(this.activeData.parsed.steps)) return [];
      let currentSection = '';
      return this.activeData.parsed.steps.map((step, index) => {
        const showSectionTitle = !!step.section && step.section !== currentSection;
        if (showSectionTitle) currentSection = step.section;
        return { step, index, stepNumber: index + 1, showSectionTitle, sectionTitle: step.section || '' };
      });
    },

    get activeRecipeTimers() {
      if (!this.activeData) return [];
      return this.timers.active
        .filter((rt) => rt.recipeId === this.activeData.id)
        .sort((a, b) => a.stepIndex - b.stepIndex || a.timerIndex - b.timerIndex);
    },

    get sortedActiveTimers() {
      const rank = (status) => (status === 'overdue' ? 0 : status === 'running' ? 1 : 2);
      return [...this.timers.active].sort((a, b) => {
        if (a.status !== b.status) return rank(a.status) - rank(b.status);
        return a.endsAtMs - b.endsAtMs;
      });
    },

    get sortedCompletedTimers() {
      return [...this.timers.completed].sort((a, b) => b.expiresAtMs - a.expiresAtMs);
    },

    async init() {
      this.initTheme();
      this.initLanguage();
      await this.fetchRecipes();
      this.restoreTimersFromStorage();
      await this.checkAuth();
      if (this.getAdminModePreference()) {
        if (this.authStatus.password_set && this.authStatus.logged_in) this.activateAdmin(false);
        else this.setAdminModePreference(false);
      }
      await this.syncSelectionFromUrl();
      window.addEventListener('popstate', () => this.syncSelectionFromUrl());
    },
    initLanguage() {
      let language = 'en';
      try {
        const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (stored && this.translationLanguages.some((lang) => lang.code === stored)) language = stored;
      } catch {
        language = 'en';
      }
      this.ui.language = language;
      if (!this.translationAdmin.language && this.nonEnglishTranslationLanguages.length > 0) {
        this.translationAdmin.language = this.nonEnglishTranslationLanguages[0].code;
      }
    },

    persistLanguage(language) {
      try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
      } catch {
        // ignore
      }
    },
    initTheme() {
      let theme = 'dark';
      try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') theme = stored;
        else theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
      } catch {
        theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
      }
      this.ui.theme = theme;
      this.applyTheme();
    },

    applyTheme() {
      if (this.ui.theme === 'light') document.documentElement.classList.remove('dark');
      else document.documentElement.classList.add('dark');
    },

    toggleTheme() {
      this.ui.theme = this.ui.theme === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(THEME_STORAGE_KEY, this.ui.theme);
      } catch {
        // ignore
      }
      this.applyTheme();
    },

    async changeLanguage(language) {
      const next = this.translationLanguages.some((lang) => lang.code === language) ? language : 'en';
      if (next === this.currentLanguage) return;
      this.ui.language = next;
      this.persistLanguage(next);
      if (this.activeId) await this.loadActiveRecipe(this.activeId, { syncUrl: false, closePanels: false });
      if (Object.keys(this.selectedCounts).length > 0) await this.updateShoppingList();
      this.toast(`Language set to ${next === 'en' ? 'English' : next.toUpperCase()}`);
    },

    toast(message) {
      const id = Date.now() + Math.random();
      this.ui.toastQueue.push({ id, message });
      setTimeout(() => {
        this.ui.toastQueue = this.ui.toastQueue.filter((t) => t.id !== id);
      }, 2200);
    },

    closeDrawers() {
      this.ui.sidebarOpen = false;
      this.ui.cartOpen = false;
    },

    isSelected(id) { return !!this.selectedCounts[id]; },

    toggleSelect(id) {
      const next = { ...this.selectedCounts };
      if (next[id]) delete next[id];
      else next[id] = 1;
      this.selectedCounts = next;
      this.updateShoppingList();
    },

    recipeExists(id) { return this.recipes.some((r) => r.id === id); },

    getRecipeIdFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get('recipe');
      if (!raw) return null;
      const id = parseInt(raw, 10);
      return Number.isInteger(id) && id > 0 ? id : null;
    },

    setRecipeIdInUrl(id, options = {}) {
      const { replace = false } = options;
      const current = this.getRecipeIdFromUrl();
      const url = new URL(window.location.href);
      if (id === null) url.searchParams.delete('recipe');
      else url.searchParams.set('recipe', String(id));
      if (current === id && !replace) return;
      const next = `${url.pathname}${url.search}${url.hash}`;
      if (replace) history.replaceState({ recipeId: id }, '', next);
      else history.pushState({ recipeId: id }, '', next);
    },

    persistRecipeSelection(id) {
      try {
        if (id === null || id === undefined) localStorage.removeItem(RECIPE_SELECTION_STORAGE_KEY);
        else localStorage.setItem(RECIPE_SELECTION_STORAGE_KEY, String(id));
      } catch {
        // ignore
      }
    },

    getFallbackRecipeSelection() {
      try {
        const raw = localStorage.getItem(RECIPE_SELECTION_STORAGE_KEY);
        if (!raw) return null;
        const id = parseInt(raw, 10);
        return Number.isInteger(id) && id > 0 ? id : null;
      } catch {
        return null;
      }
    },

    async fetchRecipes() {
      const { res, body } = await fetchJSON('/api/recipes');
      if (!res.ok || !Array.isArray(body)) throw new Error('Could not load recipes');
      this.recipes = body;
      const nextCounts = {};
      for (const [id, count] of Object.entries(this.selectedCounts)) {
        if (this.recipeExists(Number(id))) nextCounts[id] = count;
      }
      this.selectedCounts = nextCounts;
    },

    clearRecipeSelection(options = {}) {
      const { syncUrl = true, replaceUrl = true } = options;
      this.activeId = null;
      this.activeData = null;
      this.activeLoading = false;
      this.activeError = '';
      this.showSource = false;
      if (syncUrl) this.setRecipeIdInUrl(null, { replace: replaceUrl });
      this.persistRecipeSelection(null);
    },

    async syncSelectionFromUrl() {
      const routeId = this.getRecipeIdFromUrl();
      if (routeId && this.recipeExists(routeId)) {
        await this.loadActiveRecipe(routeId, { syncUrl: false, closePanels: false });
        return;
      }
      if (routeId && !this.recipeExists(routeId)) this.setRecipeIdInUrl(null, { replace: true });
      const fallbackId = this.getFallbackRecipeSelection();
      if (fallbackId && this.recipeExists(fallbackId)) {
        this.setRecipeIdInUrl(fallbackId, { replace: true });
        await this.loadActiveRecipe(fallbackId, { syncUrl: false, closePanels: false });
        return;
      }
      this.clearRecipeSelection({ syncUrl: false });
    },

    async loadActiveRecipe(id, options = {}) {
      const { syncUrl = true, replaceUrl = false, closePanels = true } = options;
      if (!this.recipeExists(id)) {
        this.clearRecipeSelection({ syncUrl, replaceUrl: true });
        return;
      }
      const token = ++this.recipeLoadToken;
      this.activeId = id;
      this.activeError = '';
      this.activeLoading = true;
      this.showSource = false;
      if (syncUrl) this.setRecipeIdInUrl(id, { replace: replaceUrl });
      this.persistRecipeSelection(id);
      if (closePanels) this.closeDrawers();

      const { res, body } = await fetchJSON(`/api/recipes/${id}?lang=${encodeURIComponent(this.currentLanguage)}`);
      if (token !== this.recipeLoadToken) return;
      if (!res.ok || !body) {
        this.activeLoading = false;
        this.activeData = null;
        this.activeError = 'Could not load recipe';
        this.toast('Could not load recipe');
        return;
      }
      this.activeData = body;
      this.activeLoading = false;
    },

    async updateShoppingList() {
      const entries = Object.entries(this.selectedCounts);
      if (entries.length === 0) {
        this.lastShoppingData = null;
        this.shoppingLoading = false;
        return;
      }
      this.shoppingLoading = true;
      const { res, body } = await fetchJSON('/api/combine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: entries.map(([id, count]) => ({ id: Number(id), count })),
          language: this.currentLanguage,
        }),
      });
      this.shoppingLoading = false;
      if (!res.ok || !body) {
        this.toast('Could not build shopping list');
        return;
      }
      this.lastShoppingData = body;
    },

    planEntryKey(date, slot) { return `${date}_${slot}`; },

    planRecipeFor(date, slot) {
      const id = this.planEntries[this.planEntryKey(date, slot)];
      return id ? this.recipes.find((r) => r.id === id) || null : null;
    },

    formatPlanDate(dateStr) {
      const d = parseISODateLocal(dateStr);
      return {
        weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
        display: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      };
    },

    isToday(dateStr) { return dateStr === formatISODate(new Date()); },

    async openPlanOverlay() {
      this.planOpen = true;
      this.closeDrawers();
      await this.loadPlanWeek();
    },

    closePlanOverlay() {
      this.planOpen = false;
      this.closePlanPicker();
    },

    async changePlanWeek(deltaDays) {
      const d = parseISODateLocal(this.planWeekStart);
      d.setDate(d.getDate() + deltaDays);
      this.planWeekStart = formatISODate(d);
      await this.loadPlanWeek();
    },

    async goToCurrentWeek() {
      this.planWeekStart = formatISODate(mondayOfDate(new Date()));
      await this.loadPlanWeek();
    },

    async loadPlanWeek() {
      this.planLoading = true;
      const dates = this.currentWeekDates;
      const { res, body } = await fetchJSON(`/api/meal-plan?start=${dates[0]}&end=${dates[6]}`);
      this.planLoading = false;
      if (!res.ok || !Array.isArray(body)) {
        this.toast('Could not load meal plan');
        return;
      }
      const entries = {};
      for (const row of body) entries[this.planEntryKey(row.date, row.slot)] = row.recipe_id;
      this.planEntries = entries;
    },

    openPlanPicker(date, slot) {
      this.planPicker = { date, slot, search: '' };
    },

    closePlanPicker() {
      this.planPicker = { date: null, slot: null, search: '' };
    },

    async assignPlanSlot(recipeId) {
      const { date, slot } = this.planPicker;
      if (!date || !slot) return;
      const { res, body } = await fetchJSON(`/api/meal-plan/${date}/${slot}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe_id: recipeId }),
      });
      if (!res.ok) {
        if (res.status === 401) { this.handleAuthExpired(); return; }
        this.toast((body && body.error) || 'Could not assign recipe');
        return;
      }
      this.planEntries = { ...this.planEntries, [this.planEntryKey(date, slot)]: recipeId };
      this.closePlanPicker();
    },

    async clearPlanSlot(date, slot) {
      const { res, body } = await fetchJSON(`/api/meal-plan/${date}/${slot}`, { method: 'DELETE' });
      if (!res.ok) {
        if (res.status === 401) { this.handleAuthExpired(); return; }
        this.toast((body && body.error) || 'Could not clear slot');
        return;
      }
      const next = { ...this.planEntries };
      delete next[this.planEntryKey(date, slot)];
      this.planEntries = next;
    },

    async addWeekToShoppingList() {
      const counts = this.weekRecipeCounts;
      const ids = Object.keys(counts);
      if (ids.length === 0) {
        this.toast('No meals planned this week');
        return;
      }
      const next = { ...this.selectedCounts };
      for (const id of ids) next[id] = (next[id] || 0) + counts[id];
      this.selectedCounts = next;
      await this.updateShoppingList();
      this.toast('Added this week to shopping list');
    },

    recipeToText(data) { return formatRecipeArtifact(data, RECIPE_TEXT_FORMAT); },

    recipeToMarkdown(data) { return formatRecipeArtifact(data, RECIPE_MARKDOWN_FORMAT); },

    recipeToCooklang(data) { return data.source || ''; },

    shoppingToText() { return formatShoppingArtifact(this.lastShoppingData, SHOPPING_TEXT_FORMAT); },

    shoppingToMarkdown() { return formatShoppingArtifact(this.lastShoppingData, SHOPPING_MARKDOWN_FORMAT); },

    async copyToClipboard(text, label) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      this.toast(`${label} copied to clipboard`);
    },

    downloadFile(content, filename) {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      this.toast(`Downloaded ${filename}`);
    },

    copyRecipe(format) {
      if (!this.activeData) return;
      const text = format === 'md' ? this.recipeToMarkdown(this.activeData)
        : format === 'cook' ? this.recipeToCooklang(this.activeData)
          : this.recipeToText(this.activeData);
      this.copyToClipboard(text, 'Recipe');
    },

    exportRecipe(format) {
      if (!this.activeData) return;
      const slug = (this.activeData.title || 'recipe').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (format === 'md') this.downloadFile(this.recipeToMarkdown(this.activeData), `${slug}.md`);
      else if (format === 'cook') this.downloadFile(this.recipeToCooklang(this.activeData), `${slug}.cook`);
      else this.downloadFile(this.recipeToText(this.activeData), `${slug}.txt`);
    },

    copyShoppingList() { this.copyToClipboard(this.shoppingToText(), 'Shopping list'); },

    exportShoppingList(format) {
      if (format === 'md') this.downloadFile(this.shoppingToMarkdown(), 'shopping-list.md');
      else this.downloadFile(this.shoppingToText(), 'shopping-list.txt');
    },

    async checkAuth() {
      const { res, body } = await fetchJSON('/api/auth/status');
      if (res.ok && body) this.authStatus = body;
    },

    handleAuthExpired() {
      this.adminMode = false;
      this.authStatus.logged_in = false;
      this.setAdminModePreference(false);
      this.toast('Session expired - please log in again');
    },

    getAdminModePreference() {
      try {
        return localStorage.getItem(ADMIN_MODE_PREF_KEY) === '1';
      } catch {
        return false;
      }
    },

    setAdminModePreference(enabled) {
      try {
        if (enabled) localStorage.setItem(ADMIN_MODE_PREF_KEY, '1');
        else localStorage.removeItem(ADMIN_MODE_PREF_KEY);
      } catch {
        // ignore
      }
    },

    async toggleAdmin() {
      if (this.adminMode) {
        this.adminMode = false;
        this.setAdminModePreference(false);
        this.toast('Admin mode off');
        return;
      }
      await this.checkAuth();
      if (!this.authStatus.password_set) {
        this.toast('Set an admin password first: cooklang-kitchen set-password');
        return;
      }
      if (!this.authStatus.logged_in) {
        this.loginPassword = '';
        this.loginError = '';
        this.ui.loginModalOpen = true;
        return;
      }
      this.activateAdmin();
    },

    activateAdmin(showToast = true) {
      this.adminMode = true;
      this.setAdminModePreference(true);
      if (showToast) this.toast('Admin mode on');
    },

    closeLogin() { this.ui.loginModalOpen = false; },

    async submitLogin() {
      const { res, body } = await fetchJSON('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: this.loginPassword }),
      });
      if (!res.ok) {
        this.loginError = (body && body.error) || 'Wrong password. Please try again.';
        return;
      }
      this.authStatus.logged_in = true;
      this.closeLogin();
      this.activateAdmin();
    },

    openNewRecipe() {
      this.adminForm = { id: null, title: '', category: '', description: '', source: '' };
      this.ui.adminModalOpen = true;
    },

    async openEditRecipe(id) {
      const { res, body } = await fetchJSON(`/api/recipes/${id}`);
      if (!res.ok || !body) {
        this.toast('Could not load recipe');
        return;
      }
      this.adminForm = {
        id: body.id,
        title: body.title || '',
        category: body.category || '',
        description: body.description || '',
        source: body.source || '',
      };
      this.ui.adminModalOpen = true;
    },

    closeAdmin() { this.ui.adminModalOpen = false; },

    async openTranslationsAdmin() {
      if (this.nonEnglishTranslationLanguages.length === 0) {
        this.toast('No target languages configured');
        return;
      }
      if (!this.translationAdmin.language) this.translationAdmin.language = this.nonEnglishTranslationLanguages[0].code;
      this.translationAdmin.lastResult = null;
      this.translationAdmin.error = '';
      this.ui.translationModalOpen = true;
      await this.loadMissingTranslations();
    },

    closeTranslationsAdmin() {
      this.ui.translationModalOpen = false;
    },

    async loadMissingTranslations() {
      if (!this.translationAdmin.language) return;
      this.translationAdmin.loading = true;
      this.translationAdmin.error = '';
      const { res, body } = await fetchJSON(`/api/translations/missing?language=${encodeURIComponent(this.translationAdmin.language)}`);
      this.translationAdmin.loading = false;
      if (res.ok && body) {
        this.translationAdmin.missing = {
          total: body.total_missing || 0,
          counts: body.counts || {},
          labels: body.labels || {},
        };
        return;
      }
      if (res.status === 401) {
        this.handleAuthExpired();
        this.closeTranslationsAdmin();
        return;
      }
      this.translationAdmin.error = (body && body.error) || 'Could not load missing translation counts';
    },

    async runTranslationUpdate() {
      if (!this.translationAdmin.language) return;
      this.translationAdmin.loading = true;
      this.translationAdmin.error = '';
      const { res, body } = await fetchJSON('/api/translations/update-missing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: this.translationAdmin.language }),
      });
      this.translationAdmin.loading = false;
      if (res.ok && body) {
        this.translationAdmin.lastResult = body;
        await this.loadMissingTranslations();
        if (this.currentLanguage === this.translationAdmin.language) {
          if (this.activeId) await this.loadActiveRecipe(this.activeId, { syncUrl: false, closePanels: false });
          if (Object.keys(this.selectedCounts).length > 0) await this.updateShoppingList();
        }
        this.toast(`Stored ${body.stored} translations for ${this.translationAdmin.language.toUpperCase()}`);
        return;
      }
      if (res.status === 401) {
        this.handleAuthExpired();
        this.closeTranslationsAdmin();
        return;
      }
      this.translationAdmin.error = (body && body.error) || 'Translation update failed';
    },

    async saveRecipe() {
      const payload = {
        title: this.adminForm.title || '',
        category: this.adminForm.category || '',
        description: this.adminForm.description || '',
        source: this.adminForm.source || '',
      };
      if (!payload.source.trim()) {
        this.toast('Source is required');
        return;
      }
      const id = this.adminForm.id;
      const url = id ? `/api/recipes/${id}` : '/api/recipes';
      const method = id ? 'PUT' : 'POST';
      const { res, body } = await fetchJSON(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok && body) {
        this.toast(id ? 'Recipe updated' : 'Recipe created');
        this.closeAdmin();
        await this.fetchRecipes();
        await this.loadActiveRecipe(body.id);
        return;
      }
      if (res.status === 401) {
        this.handleAuthExpired();
        return;
      }
      this.toast(`Error: ${(body && body.error) || 'Unknown'}`);
    },

    async deleteRecipe() {
      const id = this.adminForm.id;
      if (!id) return;
      if (!confirm('Delete this recipe permanently?')) return;
      const { res } = await fetchJSON(`/api/recipes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        this.toast('Recipe deleted');
        this.closeAdmin();
        const nextCounts = { ...this.selectedCounts };
        delete nextCounts[id];
        this.selectedCounts = nextCounts;
        await this.fetchRecipes();
        await this.updateShoppingList();
        if (this.activeId === Number(id)) this.clearRecipeSelection({ syncUrl: true, replaceUrl: true });
        return;
      }
      if (res.status === 401) {
        this.handleAuthExpired();
      }
    },

    buildTimerId(recipeId, stepIndex, timerIndex) {
      return `${recipeId}:${stepIndex}:${timerIndex}`;
    },

    buildStepTimersForRecipe(recipeData, stepIndex) {
      const step = recipeData?.parsed?.steps?.[stepIndex];
      if (!step || !Array.isArray(step.timers)) return [];
      const list = [];
      step.timers.forEach((tm, timerIndex) => {
        const durationSec = parseTimerQuantityToSeconds(tm.quantity, tm.unit);
        if (!durationSec) return;
        const qty = [tm.quantity, tm.unit].filter(Boolean).join(' ');
        const label = tm.name ? `${tm.name}${qty ? ` (${qty})` : ''}` : qty;
        list.push({
          timerId: this.buildTimerId(recipeData.id, stepIndex, timerIndex),
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
    },

    stepTimerRawCount(step) { return Array.isArray(step?.timers) ? step.timers.length : 0; },
    stepTimerDescriptors(recipeData, stepIndex) { return this.buildStepTimersForRecipe(recipeData, stepIndex); },

    stepActiveTimer(recipeId, stepIndex) {
      const list = this.timers.active
        .filter((rt) => rt.recipeId === recipeId && rt.stepIndex === stepIndex)
        .sort((a, b) => a.timerIndex - b.timerIndex);
      return list[0] || null;
    },

    stepHasActiveTimer(recipeId, stepIndex) { return !!this.stepActiveTimer(recipeId, stepIndex); },

    stepWasRecentlyCompleted(recipeId, stepIndex) {
      const now = Date.now();
      return this.timers.completed.some((done) => done.recipeId === recipeId
        && done.stepIndex === stepIndex
        && done.expiresAtMs > now
        && done.stepComplete);
    },

    getRemainingSeconds(runtime, nowMs = Date.now()) {
      if (!runtime) return 0;
      if (runtime.status === 'paused') return Math.round(runtime.pausedRemainingSec || 0);
      if (runtime.status === 'running') return Math.max(0, Math.ceil((runtime.endsAtMs - nowMs) / 1000));
      if (runtime.status === 'overdue') {
        const overdueStart = runtime.overdueSinceMs || runtime.endsAtMs || nowMs;
        return -Math.max(0, Math.floor((nowMs - overdueStart) / 1000));
      }
      return 0;
    },

    getElapsedSeconds(runtime, nowMs = Date.now()) {
      if (!runtime) return 0;
      if (runtime.status === 'overdue') {
        const overdueStart = runtime.overdueSinceMs || runtime.endsAtMs || nowMs;
        const overtime = Math.max(0, Math.floor((nowMs - overdueStart) / 1000));
        return runtime.durationSec + overtime;
      }
      const remaining = this.getRemainingSeconds(runtime, nowMs);
      return Math.max(0, runtime.durationSec - Math.max(0, remaining));
    },

    formatClock,
    formatCountdownDisplay,

    touchTimers() {
      this.timers.active = [...this.timers.active];
      this.timers.completed = [...this.timers.completed];
    },

    ensureTimerTicker() {
      if (this.timers.tickHandle) return;
      this.timers.tickHandle = window.setInterval(() => this.tickTimers(), 1000);
    },

    stopTimerTickerIfIdle() {
      if (this.timers.active.length > 0 || this.timers.completed.length > 0) return;
      if (this.timers.tickHandle) {
        clearInterval(this.timers.tickHandle);
        this.timers.tickHandle = null;
      }
    },

    playTimerDoneBeep() {
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
        // ignore
      }
    },

    saveTimersToStorage() {
      try {
        if (this.timers.active.length === 0) {
          localStorage.removeItem(TIMER_STORAGE_KEY);
          return;
        }
        const payload = { active: this.timers.active, savedAtMs: Date.now() };
        localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // ignore
      }
    },

    restoreTimersFromStorage() {
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
        const restored = [];
        for (const item of payload.active) {
          if (!item || typeof item.timerId !== 'string') continue;
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
            status: item.status === 'paused' || item.status === 'overdue' ? item.status : 'running',
            startedAtMs: Number(item.startedAtMs) || now,
            endsAtMs: Number(item.endsAtMs) || now,
            pausedRemainingSec: item.pausedRemainingSec === null ? null : Number(item.pausedRemainingSec),
            pausedFromStatus: typeof item.pausedFromStatus === 'string' ? item.pausedFromStatus : null,
            overdueSinceMs: item.overdueSinceMs === null || item.overdueSinceMs === undefined ? null : Number(item.overdueSinceMs),
            pendingQueue: Array.isArray(item.pendingQueue) ? item.pendingQueue : [],
          };
          if (runtime.status === 'running' && runtime.endsAtMs <= now) {
            runtime.status = 'overdue';
            runtime.overdueSinceMs = runtime.endsAtMs;
          }
          if (runtime.status === 'overdue' && !Number.isFinite(runtime.overdueSinceMs)) runtime.overdueSinceMs = runtime.endsAtMs || now;
          restored.push(runtime);
        }
        this.timers.active = restored;
        if (restored.length > 0) {
          this.ensureTimerTicker();
          this.tickTimers({ silentRestored: true });
        }
      } catch {
        try {
          localStorage.removeItem(TIMER_STORAGE_KEY);
        } catch {
          // ignore
        }
      }
    },

    startTimerDescriptor(descriptor, pendingQueue = [], options = {}) {
      const { fromChain = false } = options;
      const existing = this.timers.active.find((rt) => rt.timerId === descriptor.timerId);
      if (existing) return existing;
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
        pausedFromStatus: null,
        overdueSinceMs: null,
        pendingQueue,
      };
      this.timers.active = [...this.timers.active, runtime];
      this.timers.completed = this.timers.completed.filter((done) => done.timerId !== runtime.timerId);
      this.ensureTimerTicker();
      this.saveTimersToStorage();
      if (!fromChain) this.toast(`Started timer: ${runtime.label}`);
      return runtime;
    },

    stopTimersForStep(recipeId, stepIndex, suppressSave = false) {
      this.timers.active = this.timers.active.filter((rt) => !(rt.recipeId === recipeId && rt.stepIndex === stepIndex));
      if (!suppressSave) this.saveTimersToStorage();
    },

    startStepTimersForRecipe(recipeData, stepIndex) {
      if (!recipeData) return;
      const descriptors = this.buildStepTimersForRecipe(recipeData, stepIndex);
      if (!descriptors.length) {
        this.toast('This step has no valid timer duration.');
        return;
      }
      const existing = this.stepActiveTimer(recipeData.id, stepIndex);
      if (existing) {
        const ok = confirm('A timer is already running for this step. Replace it?');
        if (!ok) return;
        this.stopTimersForStep(recipeData.id, stepIndex, true);
      }
      this.startTimerDescriptor(descriptors[0], descriptors.slice(1));
      this.touchTimers();
    },

    startStepTimer(stepIndex) {
      if (!this.activeData) return;
      this.startStepTimersForRecipe(this.activeData, stepIndex);
    },

    pauseTimerById(timerId) {
      const rt = this.timers.active.find((item) => item.timerId === timerId);
      if (!rt || (rt.status !== 'running' && rt.status !== 'overdue')) return;
      rt.pausedRemainingSec = this.getRemainingSeconds(rt);
      rt.pausedFromStatus = rt.status;
      rt.status = 'paused';
      this.saveTimersToStorage();
      this.touchTimers();
    },

    resumeTimerById(timerId) {
      const rt = this.timers.active.find((item) => item.timerId === timerId);
      if (!rt || rt.status !== 'paused') return;
      const now = Date.now();
      const previousStatus = rt.pausedFromStatus || 'running';
      const remaining = Math.round(rt.pausedRemainingSec || rt.durationSec);
      if (previousStatus === 'overdue' || remaining < 0) {
        rt.status = 'overdue';
        rt.overdueSinceMs = now - (Math.abs(remaining) * 1000);
      } else {
        const safeRemaining = Math.max(1, remaining);
        rt.startedAtMs = now - ((rt.durationSec - safeRemaining) * 1000);
        rt.endsAtMs = now + (safeRemaining * 1000);
        rt.status = 'running';
      }
      rt.pausedRemainingSec = null;
      rt.pausedFromStatus = null;
      this.ensureTimerTicker();
      this.saveTimersToStorage();
      this.touchTimers();
    },

    stopTimerById(timerId) {
      const rt = this.timers.active.find((item) => item.timerId === timerId);
      if (!rt) return;
      this.timers.active = this.timers.active.filter((item) => item.timerId !== timerId);
      this.timers.completed = this.timers.completed.filter((done) => done.timerId !== timerId);
      if (rt.pendingQueue && rt.pendingQueue.length > 0) {
        const next = rt.pendingQueue[0];
        const rest = rt.pendingQueue.slice(1);
        this.startTimerDescriptor(next, rest, { fromChain: true });
      } else if (rt.status === 'overdue') {
        this.toast(`Step ${rt.stepNumber} complete for ${rt.recipeTitle}`);
      }
      this.saveTimersToStorage();
      this.stopTimerTickerIfIdle();
      this.touchTimers();
    },

    skipTimerById(timerId) {
      const rt = this.timers.active.find((item) => item.timerId === timerId);
      if (!rt) return;
      this.completeRuntimeTimer(rt, { skipped: true });
    },

    stopAllTimersForRecipe(recipeId) {
      const count = this.timers.active.filter((rt) => rt.recipeId === recipeId).length;
      this.timers.active = this.timers.active.filter((rt) => rt.recipeId !== recipeId);
      if (count > 0) this.toast(`Stopped ${count} timer${count > 1 ? 's' : ''}.`);
      this.saveTimersToStorage();
      this.stopTimerTickerIfIdle();
      this.touchTimers();
    },

    completeRuntimeTimer(runtime, options = {}) {
      const { skipped = false, silent = false } = options;
      this.timers.active = this.timers.active.filter((rt) => rt.timerId !== runtime.timerId);
      this.timers.completed = [
        ...this.timers.completed,
        {
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
        },
      ];
      if (!silent) {
        if (!skipped) {
          this.playTimerDoneBeep();
          this.toast(`Timer done: ${runtime.label}`);
        }
        if (runtime.pendingQueue.length === 0) this.toast(`Step ${runtime.stepNumber} complete for ${runtime.recipeTitle}`);
      }
      if (runtime.pendingQueue.length > 0) {
        const next = runtime.pendingQueue[0];
        const rest = runtime.pendingQueue.slice(1);
        this.startTimerDescriptor(next, rest, { fromChain: true });
      }
      this.saveTimersToStorage();
      this.stopTimerTickerIfIdle();
      this.touchTimers();
    },

    tickTimers(options = {}) {
      const { silentRestored = false } = options;
      const now = Date.now();
      let changed = false;
      for (const rt of this.timers.active) {
        if (rt.status === 'running' && rt.endsAtMs <= now) {
          rt.status = 'overdue';
          rt.overdueSinceMs = rt.endsAtMs || now;
          changed = true;
          if (!silentRestored) {
            this.playTimerDoneBeep();
            this.toast(`Timer done: ${rt.label}`);
          }
        }
      }
      const keepCompleted = this.timers.completed.filter((done) => done.expiresAtMs > now);
      if (keepCompleted.length !== this.timers.completed.length) {
        this.timers.completed = keepCompleted;
        changed = true;
      }
      if (changed) this.saveTimersToStorage();
      this.touchTimers();
      this.stopTimerTickerIfIdle();
    },

    highlightStep(step) {
      const ingredients = Array.isArray(step.ingredients) ? [...step.ingredients] : [];
      const cookware = Array.isArray(step.cookware) ? [...step.cookware] : [];
      const timers = Array.isArray(step.timers) ? [...step.timers] : [];
      return esc(step.raw).replace(CK_TOKEN_RE, (match) => {
        if (match.startsWith('@')) {
          const ing = ingredients.shift();
          if (!ing) return esc(match);
          const display = [ing.quantity, ing.unit, ing.name].filter(Boolean).join(' ');
          const prepStr = ing.preparation ? ` (${esc(ing.preparation)})` : '';
          return `<span class="font-semibold text-amber-600">${esc(display)}${prepStr}</span>`;
        }
        if (match.startsWith('#')) {
          const tool = cookware.shift();
          if (!tool) return esc(match);
          return `<span class="font-semibold text-emerald-600">${esc(tool.name)}</span>`;
        }
        if (match.startsWith('~')) {
          const timer = timers.shift();
          if (!timer) return esc(match);
          let display = [timer.quantity, timer.unit].filter(Boolean).join(' ');
          if (timer.name) display = `${timer.name}${display ? ` (${display})` : ''}`;
          return `<span class="font-semibold text-yellow-500">[timer ${esc(display)}]</span>`;
        }
        return esc(match);
      });
    },

    highlightSource(source) {
      let text = esc(source);
      text = text.replace(/^(---\s*)$/gm, '<span class="text-zinc-500">$1</span>');
      text = text.replace(/^([A-Za-z0-9_-]+\s*:\s*.+)$/gm, '<span class="text-zinc-500">$1</span>');
      text = text.replace(/^(\s*-\s+.+)$/gm, '<span class="text-zinc-500">$1</span>');
      text = text.replace(/^(&gt;&gt;\s*.+)$/gm, '<span class="text-zinc-500">$1</span>');
      text = text.replace(/^(&gt;\s*.+)$/gm, '<span class="text-zinc-500">$1</span>');
      text = text.replace(/^(=+\s*.*?=*\s*)$/gm, '<span class="text-zinc-100 font-semibold">$1</span>');
      text = text.replace(SRC_RE, (m, ingB, ingN, cwB, cwN, timer) => {
        if (ingB) return `<span class="text-amber-400">${ingB}</span>`;
        if (ingN) return `<span class="text-amber-400">${ingN}</span>`;
        if (cwB) return `<span class="text-emerald-300">${cwB}</span>`;
        if (cwN) return `<span class="text-emerald-300">${cwN}</span>`;
        if (timer) return `<span class="text-yellow-300">${timer}</span>`;
        return m;
      });
      return text;
    },

    formatMetaValue,
  });
})();

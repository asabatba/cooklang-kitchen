// ---- State ----
    let recipes = [];
    const selectedIds = new Set();
    let activeId = null;
    let activeData = null; // full recipe data for the currently viewed recipe
    let searchFilter = '';
    let adminMode = false;
    const ADMIN_MODE_PREF_KEY = 'cooklang_admin_mode_preference';
    let lastShoppingData = null;

    // ---- API ----
    async function fetchRecipes() {
      const res = await fetch('/api/recipes');
      recipes = await res.json();
      renderRecipeList();
    }

    async function fetchRecipeDetail(id) {
      const res = await fetch(`/api/recipes/${id}`);
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
    async function viewRecipe(id) {
      activeId = id;
      renderRecipeList();
      closeDrawers();

      const main = document.getElementById('mainContent');
      main.innerHTML = '<div class="empty-state"><p style="font-style:italic;">Loading…</p></div>';

      const data = await fetchRecipeDetail(id);
      activeData = data;
      const p = data.parsed;

      let html = '<div class="recipe-detail">';

      // Title row with actions
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

      // Meta chips
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

      // Ingredients overview
      if (p.ingredients.length) {
        html += '<div class="section-title">Ingredients</div>';
        html += '<div class="recipe-ingredients-grid">';
        for (const ing of p.ingredients) {
          const qty = [ing.quantity, ing.unit].filter(Boolean).join(' ');
          html += `<div class="ingredient-pill">`;
          if (qty) html += `<span class="qty">${esc(qty)}</span>`;
          html += `<span>${esc(ing.name)}${ing.preparation ? ' <small style="color:var(--ink-muted);font-style:italic;">(' + esc(ing.preparation) + ')</small>' : ''}</span>`;
          html += `</div>`;
        }
        html += '</div>';
      }

      // Steps
      let currentSection = '';
      let stepNum = 0;
      html += '<div class="section-title">Method</div>';

      for (const step of p.steps) {
        if (step.section && step.section !== currentSection) {
          currentSection = step.section;
          html += `<div class="section-title" style="color:var(--sage);font-size:0.95rem;margin-top:1rem;">${esc(currentSection)}</div>`;
        }
        stepNum++;
        const highlighted = highlightStep(step);
        html += `<div class="step"><span class="step-num">${stepNum}</span><div class="step-text">${highlighted}</div></div>`;
      }

      // Source toggle
      html += `<button class="source-toggle" onclick="this.nextElementSibling.classList.toggle('visible')">
      &lt;/&gt; View Cooklang source
    </button>`;
      html += `<pre class="source-block">${highlightSource(data.source)}</pre>`;

      html += '</div>';
      main.innerHTML = html;
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
        if (activeId) viewRecipe(activeId);
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
      if (activeId) viewRecipe(activeId);
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
      if (activeId) viewRecipe(activeId);
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
        activeId = null;
        activeData = null;
        selectedIds.delete(parseInt(id));
        await fetchRecipes();
        updateShoppingList();
        updateCartBadge();
        document.getElementById('mainContent').innerHTML = `
        <div class="empty-state">
          <div class="icon">📖</div>
          <h2>Choose a recipe</h2>
          <p>Select a recipe from the sidebar to view it,<br>or check multiple to build a shopping list.</p>
        </div>`;
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
      await checkAuth();
      if (getAdminModePreference()) {
        if (!authStatus.password_set || authStatus.logged_in) {
          activateAdmin();
        } else {
          setAdminModePreference(false);
        }
      }
    }

    initApp();

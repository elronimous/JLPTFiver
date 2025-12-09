(function(){
  window.App = window.App || {};
  const { CONST, Utils, Storage } = window.App;

  const Cram = {};
  let modalEl, listEl, searchEl, startBtn, selectedCountEl, totalCardsEl, selectedByLevelEl;
  let customListSelectEl, customListNameEl, loadCustomListBtn, addToCustomListBtn, deleteCustomListBtn, saveNewCustomListBtn, customListHintEl;
  let levelFiltersEl;
  let selectTodayBtn, deselectAllBtn;
  let scoreMinEl, scoreMaxEl, itemsPerGrammarEl;
  let starBtns;

  let overlayEl, quitBtn, saveBtn, cardEl, wrongBtn, rightBtn, nextBtn, progressEl, scoreEl;
  let flipHintEl;

  // Resume/saved session prompt
  let resumeBackdropEl, resumeContinueBtn, resumeStartNewBtn, resumeCloseBtn;

  const CRAM_SESSION_VERSION = 1;
  const CRAM_SESSION_KEY = (CONST?.STORAGE_KEYS?.CRAM_SESSION) || "jlpt-cram-session";


  let isOpen = false;
  let selected = new Set();

  let levelFilter = new Set(CONST.LEVEL_ORDER);

  let allLevelBtn = null;
  const levelBtns = new Map();
  const selectAllBtns = new Map();
  let starFilter = "any"; // any | starred
  let deck = [];
  let sessionExampleIds = [];
  let wrongGrammarMap = new Map();
  let wrongExampleIds = new Set();
  let wrongCount = 0;
  let rightCount = 0;
  let totalInitial = 0;
  let showingBack = false;
  let awaitingNext = false; // after marking WRONG, show back + NEXT

  function showSession(on){
    if (!overlayEl) return;
    overlayEl.hidden = !on;
    overlayEl.style.display = on ? "flex" : "none";
    document.body.classList.toggle("cram-session-open", on);
  }

  function exampleIdOf(gp){
    return `${gp.level}_${gp.index}`;
  }
  function grammarKeyOf(gp){
    return `${gp.level}_${gp.grammar}`;
  }

  function getScore(exampleId){
    return window.App.Scores ? window.App.Scores.get(exampleId) : 0;
  }

  function hasExamples(grammarKey){
    const notes = window.App.Notes ? window.App.Notes.getNotes(grammarKey) : [];
    return notes.some(n => Utils.htmlToText(n.jpHtml || "").length > 0);
  }

  
  function allLevelsOn(){
    return CONST.LEVEL_ORDER.every(lvl => levelFilter.has(lvl));
  }

  function syncLevelFilterFromMain(){
    const f = Storage.ui?.filters || {};
    if (f.ALL){
      levelFilter = new Set(CONST.LEVEL_ORDER);
    } else {
      const s = new Set();
      CONST.LEVEL_ORDER.forEach(lvl=>{ if (f[lvl]) s.add(lvl); });
      levelFilter = s;
    }
    updateLevelFilterUI();
  }

  function updateLevelFilterUI(){
    // per-level active states
    levelBtns.forEach((btn,lvl)=>{
      btn.classList.toggle("active", levelFilter.has(lvl));
    });
    if (allLevelBtn){
      allLevelBtn.classList.toggle("active", allLevelsOn());
    }
    selectAllBtns.forEach((btn,lvl)=>{
      btn.disabled = !levelFilter.has(lvl);
    });
  }

  function matchesListFilters(gp, opts){
    opts = opts || {};
    const levels = opts.levels || levelFilter;
    if (levels && !levels.has(gp.level)) return false;

    const exId = exampleIdOf(gp);
    const gKey = grammarKeyOf(gp);

    if (!opts.ignoreStar){
      const starred = !!Storage.userData.seenExamples[exId];
      if (starFilter === "starred" && !starred) return false;
    }

    if (!opts.ignoreScore){
      const sMin = Number(scoreMinEl?.value || 0);
      const sMax = Number(scoreMaxEl?.value || CONST.SCORE_MAX);
      const score = getScore(exId);
      if (score < sMin || score > sMax) return false;
    }

    if (!opts.ignoreSearch){
      const q = (searchEl?.value || "").trim().toLowerCase();
      const hay = `${gp.grammar} ${gp.romaji||""} ${gp.meaning||""}`.toLowerCase();
      if (q && !hay.includes(q)) return false;
    }

    if (opts.requireExamples && !hasExamples(gKey)) return false;

    return true;
  }

  function selectAllForLevel(lvl){
    if (!window.App.State?.flat) return;
    const levels = new Set([lvl]);
    window.App.State.flat.forEach(gp=>{
      const exId = exampleIdOf(gp);
      if (!matchesListFilters(gp, { levels, requireExamples:true })) return;
      selected.add(exId);
    });
    refreshSelectedCount();
    buildList();
  }

  function dailyExampleIdsFor(level, viewYMD){
    const byLevel = window.App.State?.byLevel || {};
    const permutations = window.App.State?.permutations || {};
    const items = byLevel[level] || [];
    if (!items.length) return [];

    const viewDate = Utils.ymdToDate(viewYMD);

    const progOn = !!Storage.settings.progressiveEnabled;
    const progStartYMD = Storage.settings.progressiveStartByLevel?.[level];
    const progStartDate = progStartYMD ? Utils.ymdToDate(progStartYMD) : null;
    const useProgressive = progOn && progStartDate && (Utils.daysBetween(progStartDate, viewDate) >= 0);

    let indices = [];
    if (useProgressive){
      const days = Utils.daysBetween(progStartDate, viewDate);
      const start = days * CONST.ITEMS_PER_DAY;
      for (let i=0;i<CONST.ITEMS_PER_DAY;i++){
        indices.push((start + i) % items.length);
      }
    } else {
      const randomStart = Utils.ymdToDate(CONST.RANDOM_START_YMD);
      const randomOffsetDays = Utils.daysBetween(randomStart, viewDate);

      const perm = permutations[level] || items.map((_,i)=>i);
      const slice = Utils.mod(randomOffsetDays * CONST.ITEMS_PER_DAY, items.length);
      for (let i=0;i<CONST.ITEMS_PER_DAY;i++){
        indices.push(perm[(slice + i) % items.length]);
      }
    }

    return indices.map(idx => {
      const item = items[idx];
      return `${item.level}_${item.index}`;
    });
  }

  function selectTodaysGrammar(){
    const todayYMD = Utils.dateToYMD(new Date());
    const lvls = Array.from(levelFilter);

    lvls.forEach(lvl=>{
      const ids = dailyExampleIdsFor(lvl, todayYMD);
      ids.forEach(exId=>{
        // ensure it has examples (user sentences) before selecting
        const gp = window.App.State?.flat?.find(x => exampleIdOf(x) === exId);
        if (!gp) return;
        if (!hasExamples(grammarKeyOf(gp))) return;
        selected.add(exId);
      });
    });

    refreshSelectedCount();
    buildList();
  }


  function computeTotalCards(){
    const per = Number(itemsPerGrammarEl?.value || 5);
    // Prefer an exact count (limited by available sentences), but fall back to an estimate.
    try{
      if (!window.App.State?.flat) return selected.size * per;
      let total = 0;
      selected.forEach(exId => {
        const gp = window.App.State.flat.find(x => `${x.level}_${x.index}` === exId);
        if (!gp) { total += per; return; }
        const gKey = `${gp.level}_${gp.grammar}`;
        const notes = window.App.Notes ? window.App.Notes.getNotes(gKey) : [];
        const usableCount = notes.filter(n => Utils.htmlToText(n.jpHtml || "").length > 0).length;
        total += Math.min(usableCount, per);
      });
      return total;
    } catch(e){
      return selected.size * per;
    }
  }


  function refreshSelectedByLevel(){
    if (!selectedByLevelEl) return;
    const counts = { N5:0, N4:0, N3:0, N2:0, N1:0 };
    selected.forEach(exId=>{
      const lvl = String(exId).split("_")[0];
      if (counts[lvl] == null) counts[lvl] = 0;
      counts[lvl] += 1;
    });
    selectedByLevelEl.textContent = `Selected Grammar: N5=${counts.N5||0}, N4=${counts.N4||0}, N3=${counts.N3||0}, N2=${counts.N2||0}, N1=${counts.N1||0}`;
  }

function refreshSelectedCount(){
    if (selectedCountEl) selectedCountEl.textContent = `Selected: ${selected.size}`;
    if (totalCardsEl) totalCardsEl.textContent = `Total cards: ${computeTotalCards()}`;
    refreshSelectedByLevel();
    if (startBtn) startBtn.disabled = selected.size === 0;
    updateCustomListButtons();
  }


  function getCramLists(){
    try{
      const lists = Storage?.ui?.cramLists;
      if (lists && typeof lists === "object") return lists;
      return {};
    }catch{
      return {};
    }
  }

  function saveCramLists(next){
    if (!Storage.ui) Storage.ui = {};
    Storage.ui.cramLists = next || {};
    Storage.saveUi();
  }

  function updateCustomListButtons(){
    const hasChosen = !!(customListSelectEl && customListSelectEl.value);
    const hasSelection = selected.size > 0;
    const nameOk = !!((customListNameEl?.value || "").trim());

    if (loadCustomListBtn) loadCustomListBtn.disabled = !hasChosen;
    if (addToCustomListBtn) addToCustomListBtn.disabled = !(hasChosen && hasSelection);
    if (deleteCustomListBtn) deleteCustomListBtn.disabled = !hasChosen;
    if (saveNewCustomListBtn) saveNewCustomListBtn.disabled = !(hasSelection && nameOk);
  }

  function refreshCustomListDropdown(preserveSelection = true){
    if (!customListSelectEl) return;

    const lists = getCramLists();
    const prev = preserveSelection ? customListSelectEl.value : "";

    customListSelectEl.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "— Select a saved list —";
    customListSelectEl.appendChild(ph);

    Object.keys(lists).sort((a,b)=>a.localeCompare(b, undefined, { sensitivity:"base" })).forEach(name=>{
      const arr = Array.isArray(lists[name]) ? lists[name] : [];
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = `${name} (${arr.length})`;
      customListSelectEl.appendChild(opt);
    });

    if (prev && lists[prev]) customListSelectEl.value = prev;
    else customListSelectEl.value = "";

    updateCustomListButtons();
  }

  function loadCustomList(){
    const name = customListSelectEl?.value || "";
    const lists = getCramLists();
    const ids = lists[name];
    if (!name || !Array.isArray(ids)) return;

    if (selected.size > 0){
      const ok = confirm(`Replace your current selection with "${name}"?`);
      if (!ok) return;
    }

    selected = new Set(ids.map(String));
    refreshSelectedCount();
    buildList();
  }

  function saveSelectionAsNewList(){
    const name = (customListNameEl?.value || "").trim();
    if (!name){
      alert("Enter a list name first.");
      return;
    }
    if (selected.size === 0){
      alert("Select at least one grammar point first.");
      return;
    }

    const lists = { ...getCramLists() };
    if (lists[name]){
      alert("That list name already exists. Pick a different name.");
      return;
    }

    lists[name] = Array.from(selected);
    saveCramLists(lists);

    if (customListNameEl) customListNameEl.value = "";
    refreshCustomListDropdown(false);
    if (customListSelectEl) customListSelectEl.value = name;
    updateCustomListButtons();
  }

  function addSelectionToExistingList(){
    const name = customListSelectEl?.value || "";
    if (!name){
      alert("Choose a list first.");
      return;
    }
    if (selected.size === 0){
      alert("Select at least one grammar point first.");
      return;
    }

    const lists = { ...getCramLists() };
    const existing = new Set((lists[name] || []).map(String));
    selected.forEach(id => existing.add(String(id)));
    lists[name] = Array.from(existing);

    saveCramLists(lists);
    refreshCustomListDropdown(true);
    if (customListSelectEl) customListSelectEl.value = name;
    updateCustomListButtons();
  }

  
  function deleteSelectedCustomList(){
    const name = customListSelectEl?.value || "";
    if (!name) return;

    const lists = { ...getCramLists() };
    const arr = Array.isArray(lists[name]) ? lists[name] : [];
    if (!lists[name]) return;

    const ok = confirm(`Delete the list "${name}" (${arr.length} items)? This cannot be undone.`);
    if (!ok) return;

    delete lists[name];
    saveCramLists(lists);

    refreshCustomListDropdown(false);
    if (customListSelectEl) customListSelectEl.value = "";
    updateCustomListButtons();
  }

function buildList(){
    if (!listEl || !window.App.State?.flat) return;
    listEl.innerHTML = "";

    const ud = Storage.userData;
    const q = (searchEl?.value || "").trim().toLowerCase();

    const sMin = Number(scoreMinEl?.value || 0);
    const sMax = Number(scoreMaxEl?.value || CONST.SCORE_MAX);

    let anyShown = false;

    window.App.State.flat.forEach(gp => {
      const exId = exampleIdOf(gp);
      const gKey = grammarKeyOf(gp);

      if (!levelFilter.has(gp.level)) return;

      const starred = !!ud.seenExamples[exId];
      if (starFilter === "starred" && !starred) return;

      const score = getScore(exId);
      if (score < sMin || score > sMax) return;

      const hay = `${gp.grammar} ${gp.romaji||""} ${gp.meaning||""}`.toLowerCase();
      if (q && !hay.includes(q)) return;

      const canUse = hasExamples(gKey);

      const item = document.createElement("div");
      item.className =
        `cram-item level-${gp.level}` +
        (selected.has(exId) ? " selected" : "") +
        (!canUse ? " no-examples" : "");
      item.tabIndex = 0;

      item.innerHTML = `
        <div class="cram-item-title">${Utils.escapeHtml(gp.grammar)}</div>
        <div class="cram-item-meaning">${Utils.escapeHtml(gp.meaning || "")}</div>
      `;

      item.addEventListener("click", () => {
        if (!canUse) return;
        if (selected.has(exId)) selected.delete(exId);
        else selected.add(exId);
        refreshSelectedCount();
        buildList();
      });

      listEl.appendChild(item);
      anyShown = true;
    });

    if (!anyShown){
      const none = document.createElement("div");
      none.className = "modal-hint";
      none.textContent = "No matches for those filters (or no examples exist).";
      listEl.appendChild(none);
    }
  }

  function open(){
    if (!modalEl) return;
    // Start Cram with the same level filters as the main page
    syncLevelFilterFromMain();

    isOpen = true;
    modalEl.hidden = false;
    refreshCustomListDropdown(true);
    refreshSelectedCount();
    buildList();
    if (searchEl) searchEl.focus();
  }

  function close(){
    if (!modalEl) return;
    isOpen = false;
    modalEl.hidden = true;
  }

  function showResumePrompt(on){
    if (!resumeBackdropEl) return;
    resumeBackdropEl.hidden = !on;
  }

  function shuffleInPlace(arr){
    for (let i = arr.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function loadSavedSession(){
    try{
      const raw = localStorage.getItem(CRAM_SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || typeof s !== "object") return null;
      if (s.v !== CRAM_SESSION_VERSION) return null;
      // Basic integrity check
      if (!Array.isArray(s.deck) || !s.deck.length) return null;
      return s;
    }catch{
      return null;
    }
  }

  function hasSavedSession(){
    return !!loadSavedSession();
  }

  function clearSavedSession(){
    try{ localStorage.removeItem(CRAM_SESSION_KEY); }catch{}
  }

  function setSaveButtonState(){
    if (!saveBtn) return;
    // Only allow saving while the quiz is in progress (not on results screen)
    saveBtn.disabled = !(deck && deck.length);
  }

  function saveSessionSnapshot(){
    if (!deck || !deck.length) return;

    const payload = {
      v: CRAM_SESSION_VERSION,
      savedAt: Date.now(),
      totalInitial: totalInitial,
      wrongCount: wrongCount,
      rightCount: rightCount,
      showingBack: !!showingBack,
      awaitingNext: !!awaitingNext,
      sessionExampleIds: Array.isArray(sessionExampleIds) ? sessionExampleIds : [],
      wrongGrammar: Array.from(wrongGrammarMap.entries()).map(([key, val]) => ({
        key,
        exId: String(val?.exId || ""),
        count: Number(val?.count || 1)
      })),
      wrongExampleIds: Array.from(wrongExampleIds || []).map(String),
      deck: deck.map(c => ({
        exId: String(c?.exId || ""),
        jpHtml: String(c?.jpHtml || ""),
        enHtml: String(c?.enHtml || "")
      }))
    };

    try{
      localStorage.setItem(CRAM_SESSION_KEY, JSON.stringify(payload));
    }catch(e){
      // If storage is full or unavailable, fail silently.
    }
  }

  function resumeSavedSession(){
    const s = loadSavedSession();
    if (!s) return false;
    if (!window.App.State?.flat) return false;

    // Rebuild deck with fresh gp references
    const rebuilt = [];
    (s.deck || []).forEach(it => {
      const exId = String(it?.exId || "");
      const gp = window.App.State.flat.find(x => `${x.level}_${x.index}` === exId);
      if (!gp) return;
      rebuilt.push({ exId, gp, jpHtml: String(it?.jpHtml || ""), enHtml: String(it?.enHtml || "") });
    });

    if (!rebuilt.length) return false;

    deck = rebuilt;
    totalInitial = Number(s.totalInitial || rebuilt.length);
    wrongCount = Number(s.wrongCount || 0);
    rightCount = Number(s.rightCount || 0);
    showingBack = !!s.showingBack;
    awaitingNext = !!s.awaitingNext;

    sessionExampleIds = Array.isArray(s.sessionExampleIds) ? s.sessionExampleIds.map(String) : [];

    wrongGrammarMap = new Map();
    const wg = Array.isArray(s.wrongGrammar) ? s.wrongGrammar : [];
    wg.forEach(w => {
      const exId = String(w?.exId || "");
      const gp = window.App.State.flat.find(x => `${x.level}_${x.index}` === exId);
      if (!gp) return;
      const key = String(w?.key || grammarKeyOf(gp));
      wrongGrammarMap.set(key, { gp, exId, count: Math.max(1, Number(w?.count || 1)) });
    });

    wrongExampleIds = new Set((s.wrongExampleIds || []).map(String));

    // Close selection modal if it was open and jump straight into the session
    close();
    showSession(true);
    renderCard();
    return true;
  }


  function endSession(){
    clearSavedSession();
    deck = [];
    wrongCount = 0;
    rightCount = 0;
    totalInitial = 0;
    showingBack = false;
    awaitingNext = false;
    wrongGrammarMap = new Map();
    wrongExampleIds = new Set();
    showSession(false);
    setSaveButtonState();
  }

  function buildDeckFromExampleIds(exampleIds, itemsPerGrammarOverride){
    const itemsPerGrammar = Number((itemsPerGrammarOverride ?? itemsPerGrammarEl?.value) || 5);
    deck = [];

    (exampleIds || []).forEach(exId => {
      const gp = window.App.State.flat.find(x => `${x.level}_${x.index}` === exId);
      if (!gp) return;

      const gKey = `${gp.level}_${gp.grammar}`;
      const notes = window.App.Notes ? window.App.Notes.getNotes(gKey) : [];
      const usable = notes
        .map(n => ({ jpHtml: n.jpHtml || "", enHtml: n.enHtml || "" }))
        .filter(n => Utils.htmlToText(n.jpHtml).length > 0);

      // Pick random sentences rather than always taking top-to-bottom.
      const picks = usable.slice();
      shuffleInPlace(picks);
      picks.slice(0, itemsPerGrammar).forEach(n => {
        deck.push({ exId, gp, jpHtml: n.jpHtml, enHtml: n.enHtml });
      });
    });

    shuffleInPlace(deck);
    totalInitial = deck.length;
  }

  function restartWithExampleIds(exampleIds, itemsPerGrammarOverride){
    const ids = Array.from(exampleIds || []).map(String);
    if (!ids.length) return;

    clearSavedSession();

    sessionExampleIds = Array.from(new Set(ids));

    wrongCount = 0;
    rightCount = 0;
    showingBack = false;
    awaitingNext = false;
    wrongGrammarMap = new Map();
    wrongExampleIds = new Set();

    buildDeckFromExampleIds(ids, itemsPerGrammarOverride);
showSession(true);
    renderCard();
  }

  function openCramWithPreselected(exampleIds, itemsPerGrammarOverride){
    selected = new Set(Array.from(exampleIds || []));
    if (searchEl) searchEl.value = "";

    showSession(false);
    open();

    if (itemsPerGrammarOverride != null && itemsPerGrammarEl){
      const v = Math.max(1, Math.min(10, Number(itemsPerGrammarOverride) || 1));
      itemsPerGrammarEl.value = String(v);
    }

    // Ensure all levels are visible so the preselected items show up.
    levelFilter = new Set(CONST.LEVEL_ORDER);
    updateLevelFilterUI();

    refreshSelectedCount();
    buildList();
  }

  function renderResultsCard(){
    const pct = accuracyPct();
    const msg = encouragementForPct(pct);

    const wrongItems = Array.from(wrongGrammarMap.values());
    wrongItems.sort((a,b)=>{
      const ai = CONST.LEVEL_ORDER.indexOf(a.gp.level);
      const bi = CONST.LEVEL_ORDER.indexOf(b.gp.level);
      if (ai !== bi) return ai - bi;
      return String(a.gp.grammar).localeCompare(String(b.gp.grammar));
    });

    const wrongListHtml = wrongItems.map(w => {
      const gp = w.gp;
      const countHtml = w.count > 1 ? `<span class="cram-wrong-count">×${w.count}</span>` : "";
      return `
        <div class="cram-item level-${gp.level}">
          <div class="cram-item-title">${Utils.escapeHtml(gp.grammar)}${countHtml}</div>
          <div class="cram-item-meaning">${Utils.escapeHtml(gp.meaning || "")} </div>
        </div>
      `;
    }).join("");

    const wrongSection = wrongItems.length ? `
      <div class="cram-results-wrong">
        <div class="cram-results-subtitle">Marked wrong</div>
        <div class="cram-wrong-list">${wrongListHtml}</div>
        <div class="cram-results-retry-controls">
          <div class="viewall-filter-label">Retry examples per grammar:</div>
          <input id="cramRetryItemsPerGrammar" class="cram-select cram-number" type="number" min="1" max="10" step="1" value="${Number(itemsPerGrammarEl?.value || 5)}" />
        </div>
        <div class="cram-results-actions">
          <button class="cram-action next" type="button" data-action="retry-wrong">Try these ones again!</button>
          <button class="cram-action next" type="button" data-action="pick-wrong">Select which ones you want to cram again!</button>
        </div>
      </div>
    ` : `
      <div class="cram-results-perfect">No wrong answers this run.</div>
    `;


    const saveSection = `
      <div class="cram-results-save">
        <div class="cram-results-subtitle">Save as a cram list</div>
        <div class="cram-results-save-row">
          <input id="cramResultsNewListName" class="cram-select cram-text" type="text" placeholder="New list name…" />
          <button class="modal-btn primary" type="button" data-action="save-new-list">Save new</button>
        </div>
        <div class="cram-results-save-row">
          <select id="cramResultsListSelect" class="cram-select"></select>
          <button class="modal-btn" type="button" data-action="add-to-list">Add to list</button>
        </div>
        <div id="cramResultsSaveHint" class="modal-hint" style="text-align:center;margin:0">Save the grammar from this session to a custom list.</div>
      </div>
    `;


    cardEl.innerHTML = `
      <div class="cram-results">
        <div class="cram-results-head">
          <div class="cram-results-title">Session complete</div>
          <div class="cram-results-stats">Accuracy ${pct}% • Right ${rightCount} • Wrong ${wrongCount}</div>
          <div class="cram-results-msg">${Utils.escapeHtml(msg)}</div>
        </div>
        ${wrongSection}
        ${saveSection}
        <div class="cram-results-exit">
          <button class="chip-btn" type="button" data-action="leave" aria-label="Leave cram">✕ Leave</button>
        </div>
      </div>
    `;

    cardEl.onclick = null;
    cardEl.style.cursor = "default";

    // Wire up result actions
    cardEl.querySelector('[data-action="leave"]')?.addEventListener('click', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      endSession();
    });

    cardEl.querySelector('[data-action="retry-wrong"]')?.addEventListener('click', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      const per = Math.max(1, Math.min(10, Number(cardEl.querySelector('#cramRetryItemsPerGrammar')?.value || itemsPerGrammarEl?.value || 5)));
      restartWithExampleIds(wrongExampleIds, per);
    });

    cardEl.querySelector('[data-action="pick-wrong"]')?.addEventListener('click', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      const per = Math.max(1, Math.min(10, Number(cardEl.querySelector('#cramRetryItemsPerGrammar')?.value || itemsPerGrammarEl?.value || 5)));
      openCramWithPreselected(wrongExampleIds, per);
    });


    // Save list controls
    const resultsNewNameEl = cardEl.querySelector('#cramResultsNewListName');
    const resultsSelectEl = cardEl.querySelector('#cramResultsListSelect');
    const resultsHintEl = cardEl.querySelector('#cramResultsSaveHint');
    const saveNewBtn = cardEl.querySelector('[data-action="save-new-list"]');
    const addBtn = cardEl.querySelector('[data-action="add-to-list"]');

    function setResultsHint(t){
      if (resultsHintEl) resultsHintEl.textContent = t || "Save the grammar from this session to a custom list.";
    }

    function populateResultsLists(preserveName){
      if (!resultsSelectEl) return;
      const lists = getCramLists();
      const prev = preserveName ? (resultsSelectEl.value || "") : "";
      resultsSelectEl.innerHTML = "";
      const ph = document.createElement("option");
      ph.value = "";
      ph.textContent = "— Select a saved list —";
      resultsSelectEl.appendChild(ph);

      Object.keys(lists).sort((a,b)=>a.localeCompare(b, undefined, { sensitivity:"base" })).forEach(name=>{
        const arr = Array.isArray(lists[name]) ? lists[name] : [];
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = `${name} (${arr.length})`;
        resultsSelectEl.appendChild(opt);
      });

      if (prev && lists[prev]) resultsSelectEl.value = prev;
      else resultsSelectEl.value = "";
    }

    function updateResultsSaveButtons(){
      const hasSession = Array.isArray(sessionExampleIds) && sessionExampleIds.length > 0;
      const newNameOk = !!((resultsNewNameEl?.value || "").trim());
      const hasChosen = !!(resultsSelectEl && resultsSelectEl.value);

      if (saveNewBtn) saveNewBtn.disabled = !(hasSession && newNameOk);
      if (addBtn) addBtn.disabled = !(hasSession && hasChosen);
    }

    populateResultsLists(false);
    updateResultsSaveButtons();

    resultsNewNameEl?.addEventListener("input", updateResultsSaveButtons);
    resultsSelectEl?.addEventListener("change", updateResultsSaveButtons);

    saveNewBtn?.addEventListener("click", (e)=>{
      e.preventDefault(); e.stopPropagation();
      const name = (resultsNewNameEl?.value || "").trim();
      if (!name){
        setResultsHint("Enter a new list name first.");
        updateResultsSaveButtons();
        return;
      }
      if (!sessionExampleIds?.length){
        setResultsHint("Nothing to save.");
        return;
      }
      const lists = { ...getCramLists() };
      if (lists[name]){
        setResultsHint(`That list name already exists: "${name}".`);
        return;
      }
      lists[name] = Array.from(new Set(sessionExampleIds.map(String)));
      saveCramLists(lists);
      populateResultsLists(true);
      if (resultsSelectEl) resultsSelectEl.value = name;
      if (resultsNewNameEl) resultsNewNameEl.value = "";
      setResultsHint(`Saved as "${name}".`);
      updateResultsSaveButtons();
    });

    addBtn?.addEventListener("click", (e)=>{
      e.preventDefault(); e.stopPropagation();
      const name = resultsSelectEl?.value || "";
      if (!name){
        setResultsHint("Choose a list first.");
        updateResultsSaveButtons();
        return;
      }
      if (!sessionExampleIds?.length){
        setResultsHint("Nothing to add.");
        return;
      }
      const lists = { ...getCramLists() };
      const existing = new Set((lists[name] || []).map(String));
      sessionExampleIds.forEach(id => existing.add(String(id)));
      lists[name] = Array.from(existing);
      saveCramLists(lists);
      populateResultsLists(true);
      if (resultsSelectEl) resultsSelectEl.value = name;
      setResultsHint(`Added to "${name}".`);
      updateResultsSaveButtons();
    });


    // Optional: clicking an item opens Bunpro (if we have a link)
    cardEl.querySelectorAll('.cram-wrong-list .cram-item').forEach((el, idx)=>{
      el.addEventListener('click', (e)=>{
        e.preventDefault();
        e.stopPropagation();
        const w = wrongItems[idx];
        const link = w?.gp?.primaryLink;
        if (link) window.open(link, '_blank', 'noopener');
      });
    });
  }


  function recordWrong(card){
    try{
      if (!card || !card.gp) return;
      const key = grammarKeyOf(card.gp);
      const prev = wrongGrammarMap.get(key);
      if (prev) prev.count += 1;
      else wrongGrammarMap.set(key, { gp: card.gp, exId: card.exId, count: 1 });
      wrongExampleIds.add(card.exId);
    } catch(e){
      // ignore
    }
  }

  function accuracyPct(){
    const attempts = wrongCount + rightCount;
    if (!attempts) return 0;
    return Math.round((rightCount / attempts) * 100);
  }

  function encouragementForPct(pct){
    if (pct >= 100){
      return "You NAILED it. You're already at max power — go immerse and enjoy yourself!";
    }

    if (pct < 10) return "You did your best — do a quick review, then come back stronger.";
    if (pct < 20) return "Getting there. It needs more work, but you're on the right track.";
    if (pct < 30) return "Solid start. A bit more repetition and it'll click.";
    if (pct < 40) return "Nice progress. Keep going — you're building real momentum.";
    if (pct < 50) return "Good effort. You're close to breaking through — keep pushing.";
    if (pct < 60) return "Halfway and climbing. Tighten up the weak spots and you'll jump quickly.";
    if (pct < 70) return "Strong work. You're getting consistent — keep sharpening.";
    if (pct < 80) return "Really solid. You're in a great place — polish the last few rough edges.";
    if (pct < 90) return "Great run. You're very close — a little review will take you far.";
    return "So close to perfect. Clean up the last few mistakes and you'll be unstoppable.";
  }

  function renderFooter(){
    if (progressEl) progressEl.textContent = `Remaining ${deck.length} / ${totalInitial}`;
    if (scoreEl) scoreEl.textContent = `Wrong ${wrongCount} • Right ${rightCount}`;
  }

  function syncActionButtons(){
    if (!wrongBtn || !rightBtn || !nextBtn) return;

    const done = deck.length === 0;

    if (done){
      wrongBtn.hidden = false;
      rightBtn.hidden = false;
      nextBtn.hidden = true;

      wrongBtn.disabled = true;
      rightBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }

    if (awaitingNext){
      wrongBtn.hidden = true;
      rightBtn.hidden = true;
      nextBtn.hidden = false;

      wrongBtn.disabled = true;
      rightBtn.disabled = true;
      nextBtn.disabled = false;
    } else {
      wrongBtn.hidden = false;
      rightBtn.hidden = false;
      nextBtn.hidden = true;

      wrongBtn.disabled = false;
      rightBtn.disabled = false;
      nextBtn.disabled = true;
    }
  }

  function renderCard(){
    if (!cardEl) return;

    if (deck.length === 0){
      // Session completed: do not leave a resumable save behind.
      clearSavedSession();
      awaitingNext = false;
      if (flipHintEl) flipHintEl.hidden = true;
      setSaveButtonState();
      renderResultsCard();
      syncActionButtons();
      renderFooter();
      return;
    }

    const c = deck[0];
    const gp = c.gp;

    const gpHtml = gp.primaryLink
      ? `<a href="${gp.primaryLink}" target="_blank" rel="noopener">${Utils.escapeHtml(gp.grammar)}</a>`
      : Utils.escapeHtml(gp.grammar);

    if (!showingBack){
      cardEl.innerHTML = `<div class="cram-front">${c.jpHtml}</div>`;
    } else {
      cardEl.innerHTML = `
        <div class="cram-back">
          <div class="jp">${c.jpHtml}</div>
          <div class="en">${c.enHtml || ""}</div>
          <div class="gp level-${gp.level}">${gpHtml}</div>
          <div class="desc">${Utils.escapeHtml(gp.meaning || "")}</div>
        </div>
      `;
    }

    cardEl.onclick = () => {
      showingBack = !showingBack;
      renderCard();
    };

    if (flipHintEl){ flipHintEl.hidden = false; flipHintEl.textContent = "Click the card to flip."; }

    syncActionButtons();
    renderFooter();
    setSaveButtonState();
  }

  function beginSession(){
    clearSavedSession();
    wrongCount = 0;
    rightCount = 0;
    showingBack = false;
    awaitingNext = false;
    wrongGrammarMap = new Map();
    wrongExampleIds = new Set();

    sessionExampleIds = Array.from(new Set(Array.from(selected).map(String)));
    buildDeckFromExampleIds(sessionExampleIds);

    close();
    showSession(true);
    renderCard();
  }

  function markWrong(){
    if (deck.length === 0) return;
    if (awaitingNext) return;

    // Step 1: reveal the back, then wait for NEXT to advance/reinsert.
    wrongCount++;
    recordWrong(deck[0]);
    awaitingNext = true;
    showingBack = true;
    renderCard();
  }

  function nextAfterWrong(){
    if (deck.length === 0) return;
    if (!awaitingNext) return;

    // Step 2: now put the card back into the deck, shuffle, and show the next.
    const c = deck.shift();
    deck.push(c);
    shuffleInPlace(deck);
    awaitingNext = false;
    showingBack = false;
    renderCard();
  }


  function markRight(){
    if (deck.length === 0) return;
    if (awaitingNext) return;
    rightCount++;
    deck.shift();
    showingBack = false;
    renderCard();
  }


  Cram.refreshIfOpen = () => { if (isOpen) buildList(); };

  Cram.init = () => {
    const openBtn = Utils.qs("#openCramBtn");
    modalEl = Utils.qs("#cramModalBackdrop");
    listEl = Utils.qs("#cramList");
    searchEl = Utils.qs("#cramSearch");
    startBtn = Utils.qs("#cramStartBtn");
    selectedCountEl = Utils.qs("#cramSelectedCount");
    totalCardsEl = Utils.qs("#cramTotalCards");
    selectedByLevelEl = Utils.qs("#cramSelectedByLevel");
    const closeBtn = Utils.qs("#closeCramBtn");

    levelFiltersEl = Utils.qs("#cramLevelFilters");
    selectTodayBtn = Utils.qs("#cramSelectTodayBtn");
    deselectAllBtn = Utils.qs("#cramDeselectAllBtn");
    scoreMinEl = Utils.qs("#cramScoreMin");
    scoreMaxEl = Utils.qs("#cramScoreMax");
    itemsPerGrammarEl = Utils.qs("#cramItemsPerGrammar");


    customListSelectEl = Utils.qs("#cramCustomListSelect");
    customListNameEl = Utils.qs("#cramCustomListName");
    loadCustomListBtn = Utils.qs("#cramLoadCustomListBtn");
    addToCustomListBtn = Utils.qs("#cramAddToCustomListBtn");
    deleteCustomListBtn = Utils.qs("#cramDeleteCustomListBtn");
    saveNewCustomListBtn = Utils.qs("#cramSaveNewCustomListBtn");
    customListHintEl = Utils.qs("#cramCustomListHint");

    overlayEl = Utils.qs("#cramSessionOverlay");
    quitBtn = Utils.qs("#cramQuitBtn");
    saveBtn = Utils.qs("#cramSaveBtn");
    cardEl = Utils.qs("#cramCard");
    wrongBtn = Utils.qs("#cramWrongBtn");
    rightBtn = Utils.qs("#cramRightBtn");
    nextBtn = Utils.qs("#cramNextBtn");
    progressEl = Utils.qs("#cramProgressText");
    scoreEl = Utils.qs("#cramScoreText");
    flipHintEl = Utils.qs("#cramFlipHint");

    // Resume prompt elements
    resumeBackdropEl = Utils.qs("#cramResumeBackdrop");
    resumeContinueBtn = Utils.qs("#cramResumeBtn");
    resumeStartNewBtn = Utils.qs("#cramDiscardBtn");
    resumeCloseBtn = Utils.qs("#cramResumeCloseBtn");

    starBtns = Array.from(document.querySelectorAll(".cram-star-btn"));

    showSession(false);
    if (nextBtn){ nextBtn.hidden = true; nextBtn.disabled = true; }

    openBtn?.addEventListener("click", () => {
      if (hasSavedSession()){
        // Ask whether to resume the saved session
        if (resumeBackdropEl){
          showResumePrompt(true);
        } else {
          const ok = window.confirm("You have a saved cram session. Continue where you left off?");
          if (ok){
            const resumed = resumeSavedSession();
            if (!resumed){
              // If the save is incompatible, discard it and start fresh.
              clearSavedSession();
              open();
            }
          } else {
            clearSavedSession();
            open();
          }
        }
      } else {
        open();
      }
    });
    closeBtn?.addEventListener("click", close);
    modalEl?.addEventListener("click", (e)=>{ if (e.target === modalEl) close(); });


    // Resume prompt
    resumeCloseBtn?.addEventListener("click", () => showResumePrompt(false));
    resumeContinueBtn?.addEventListener("click", () => {
      showResumePrompt(false);
      const resumed = resumeSavedSession();
      if (!resumed){
        clearSavedSession();
        open();
      }
    });
    resumeStartNewBtn?.addEventListener("click", () => {
      clearSavedSession();
      showResumePrompt(false);
      open();
    });
    resumeBackdropEl?.addEventListener("click", (e) => {
      if (e.target === resumeBackdropEl) showResumePrompt(false);
    });

    // Score range
    scoreMinEl.innerHTML = "";
    scoreMaxEl.innerHTML = "";
    for (let i=0;i<=CONST.SCORE_MAX;i++){
      const o1 = document.createElement("option");
      const em = (CONST.SCORE_EMOJIS && CONST.SCORE_EMOJIS[i]) ? CONST.SCORE_EMOJIS[i] : "";
      o1.value = String(i);
      o1.textContent = em ? `${em} ${i}` : String(i);
      const o2 = o1.cloneNode(true);
      scoreMinEl.appendChild(o1);
      scoreMaxEl.appendChild(o2);
    }
    scoreMinEl.value = "0";
    scoreMaxEl.value = String(CONST.SCORE_MAX);

    scoreMinEl.addEventListener("change", ()=>{
      if (Number(scoreMinEl.value) > Number(scoreMaxEl.value)) scoreMaxEl.value = scoreMinEl.value;
      buildList();
    });
    scoreMaxEl.addEventListener("change", ()=>{
      if (Number(scoreMaxEl.value) < Number(scoreMinEl.value)) scoreMinEl.value = scoreMaxEl.value;
      buildList();
    });

    searchEl?.addEventListener("input", Utils.debounce(buildList, 80));
    selectTodayBtn?.addEventListener("click", selectTodaysGrammar);
    deselectAllBtn?.addEventListener("click", ()=>{
      selected.clear();
      refreshSelectedCount();
      buildList();
    });

    // Custom lists
    refreshCustomListDropdown(true);
    customListSelectEl?.addEventListener("change", updateCustomListButtons);
    loadCustomListBtn?.addEventListener("click", loadCustomList);
    addToCustomListBtn?.addEventListener("click", addSelectionToExistingList);
    deleteCustomListBtn?.addEventListener("click", deleteSelectedCustomList);
    saveNewCustomListBtn?.addEventListener("click", saveSelectionAsNewList);
    customListNameEl?.addEventListener("input", updateCustomListButtons);
    startBtn?.addEventListener("click", beginSession);

    itemsPerGrammarEl?.addEventListener("input", refreshSelectedCount);
    itemsPerGrammarEl?.addEventListener("change", refreshSelectedCount);

    // Level filter buttons (match main page visuals/behavior)
    levelFiltersEl.innerHTML = "";
    levelBtns.clear();
    selectAllBtns.clear();
    allLevelBtn = null;

    // "All" behaves like main page (toggles every level on/off)
    const allCol = document.createElement("div");
    allCol.className = "cram-level-col";
    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "level-filter-btn ALL";
    allBtn.textContent = "All";
    allBtn.addEventListener("click", ()=>{
      if (allLevelsOn()){
        levelFilter.clear();
      } else {
        levelFilter = new Set(CONST.LEVEL_ORDER);
      }
      updateLevelFilterUI();
      buildList();
    });
    allCol.appendChild(allBtn);
    levelFiltersEl.appendChild(allCol);
    allLevelBtn = allBtn;

    // Per-level toggles + "Select all" buttons under each
    CONST.LEVEL_ORDER.forEach(lvl=>{
      const col = document.createElement("div");
      col.className = "cram-level-col";

      const b = document.createElement("button");
      b.type = "button";
      b.className = `level-filter-btn ${lvl}`;
      b.textContent = lvl;
      b.addEventListener("click", ()=>{
        if (levelFilter.has(lvl)) levelFilter.delete(lvl);
        else levelFilter.add(lvl);
        updateLevelFilterUI();
        buildList();
      });

      const sel = document.createElement("button");
      sel.type = "button";
      sel.className = "cram-mini-btn";
      sel.textContent = `Select all ${lvl}`;
      sel.addEventListener("click", (ev)=>{
        ev.preventDefault();
        ev.stopPropagation();
        selectAllForLevel(lvl);
      });

      col.appendChild(b);
      col.appendChild(sel);
      levelFiltersEl.appendChild(col);

      levelBtns.set(lvl, b);
      selectAllBtns.set(lvl, sel);
    });

    // Initial sync to main page filters
    syncLevelFilterFromMain();

    if (starBtns.length){
      starBtns.forEach(btn=>{
        btn.addEventListener("click", ()=>{
          starBtns.forEach(b=>b.classList.remove("active"));
          btn.classList.add("active");
          starFilter = btn.dataset.star || "any";
          buildList();
        });
      });
    }

    saveBtn?.addEventListener("click", () => {
      // Manual save: creates a resumable session for later.
      saveSessionSnapshot();

      if (saveBtn){
        const prev = saveBtn.textContent;
        saveBtn.textContent = "Saved";
        saveBtn.disabled = true;
        window.setTimeout(() => {
          if (!saveBtn) return;
          saveBtn.textContent = prev;
          setSaveButtonState();
        }, 900);
      }
    });

    quitBtn?.addEventListener("click", endSession);

    wrongBtn?.addEventListener("click", markWrong);
    rightBtn?.addEventListener("click", markRight);
    nextBtn?.addEventListener("click", nextAfterWrong);

    refreshSelectedCount();
  };

  window.App.Cram = Cram;
})();
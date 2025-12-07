(function(){
  window.App = window.App || {};
  const { CONST, Utils, Storage } = window.App;

  const Cram = {};
  let modalEl, listEl, searchEl, startBtn, selectedCountEl;
  let levelFiltersEl;
  let selectTodayBtn, deselectAllBtn;
  let scoreMinEl, scoreMaxEl, itemsPerGrammarEl;
  let starBtns;

  let overlayEl, quitBtn, cardEl, wrongBtn, rightBtn, nextBtn, progressEl, scoreEl;

  let isOpen = false;
  let selected = new Set();

  let levelFilter = new Set(CONST.LEVEL_ORDER);

  let allLevelBtn = null;
  const levelBtns = new Map();
  const selectAllBtns = new Map();
  let starFilter = "any"; // any | starred
  let deck = [];
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

function refreshSelectedCount(){
    if (selectedCountEl) selectedCountEl.textContent = `Selected: ${selected.size}`;
    if (startBtn) startBtn.disabled = selected.size === 0;
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
    refreshSelectedCount();
    buildList();
    if (searchEl) searchEl.focus();
  }

  function close(){
    if (!modalEl) return;
    isOpen = false;
    modalEl.hidden = true;
  }

  function shuffleInPlace(arr){
    for (let i = arr.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
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
      cardEl.innerHTML = `
        <div class="cram-back">
          <div class="jp">Well done!</div>
          <div class="en">Wrong / Right: ${wrongCount} / ${rightCount}</div>
          <div class="desc" style="opacity:.9">Click ✕ in the top right to return home.</div>
        </div>
      `;
      awaitingNext = false;
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

    syncActionButtons();
    renderFooter();
  }

  function beginSession(){
    const itemsPerGrammar = Number(itemsPerGrammarEl?.value || 5);

    deck = [];
    wrongCount = 0;
    rightCount = 0;
    showingBack = false;
    awaitingNext = false;

    selected.forEach(exId => {
      const gp = window.App.State.flat.find(x => `${x.level}_${x.index}` === exId);
      if (!gp) return;

      const gKey = `${gp.level}_${gp.grammar}`;
      const notes = window.App.Notes ? window.App.Notes.getNotes(gKey) : [];
      const usable = notes
        .map(n => ({ jpHtml: n.jpHtml || "", enHtml: n.enHtml || "" }))
        .filter(n => Utils.htmlToText(n.jpHtml).length > 0);

      usable.slice(0, itemsPerGrammar).forEach(n => {
        deck.push({ exId, gp, jpHtml: n.jpHtml, enHtml: n.enHtml });
      });
    });

    shuffleInPlace(deck);
    totalInitial = deck.length;

    close();
    showSession(true);
    renderCard();
  }

  function markWrong(){
    if (deck.length === 0) return;
    if (awaitingNext) return;

    // Step 1: reveal the back, then wait for NEXT to advance/reinsert.
    wrongCount++;
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
    const closeBtn = Utils.qs("#closeCramBtn");

    levelFiltersEl = Utils.qs("#cramLevelFilters");
    selectTodayBtn = Utils.qs("#cramSelectTodayBtn");
    deselectAllBtn = Utils.qs("#cramDeselectAllBtn");
    scoreMinEl = Utils.qs("#cramScoreMin");
    scoreMaxEl = Utils.qs("#cramScoreMax");
    itemsPerGrammarEl = Utils.qs("#cramItemsPerGrammar");

    overlayEl = Utils.qs("#cramSessionOverlay");
    quitBtn = Utils.qs("#cramQuitBtn");
    cardEl = Utils.qs("#cramCard");
    wrongBtn = Utils.qs("#cramWrongBtn");
    rightBtn = Utils.qs("#cramRightBtn");
    nextBtn = Utils.qs("#cramNextBtn");
    progressEl = Utils.qs("#cramProgressText");
    scoreEl = Utils.qs("#cramScoreText");

    starBtns = Array.from(document.querySelectorAll(".cram-star-btn"));

    showSession(false);
    if (nextBtn){ nextBtn.hidden = true; nextBtn.disabled = true; }

    openBtn?.addEventListener("click", open);
    closeBtn?.addEventListener("click", close);
    modalEl?.addEventListener("click", (e)=>{ if (e.target === modalEl) close(); });

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
    startBtn?.addEventListener("click", beginSession);

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

    quitBtn?.addEventListener("click", ()=>{
      deck = [];
      wrongCount = 0;
      rightCount = 0;
      totalInitial = 0;
      showingBack = false;
      awaitingNext = false;
      showSession(false);
    });

    wrongBtn?.addEventListener("click", markWrong);
    rightBtn?.addEventListener("click", markRight);
    nextBtn?.addEventListener("click", nextAfterWrong);

    refreshSelectedCount();
  };

  window.App.Cram = Cram;
})();

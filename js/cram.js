(function(){
  window.App = window.App || {};
  const { CONST, Utils, Storage } = window.App;

  const Cram = {};

  function getCardFontScale(){
    const s = typeof Storage.settings.cardFontScale === "number" && Number.isFinite(Storage.settings.cardFontScale)
      ? Storage.settings.cardFontScale
      : 1;
    return Math.max(0.6, Math.min(1.6, s));
  }

  function setCardFontScale(next){
    const clamped = Math.max(0.6, Math.min(1.6, next));
    Storage.settings.cardFontScale = clamped;
    Storage.saveSettings();
    return clamped;
  }

  function applyCardFontScale(root){
    if (!root) return;
    const scale = getCardFontScale();
    const baseFront = 1.5;
    const baseBackJp = 1.3;
    const baseBackEn = 1.05;
    root.querySelectorAll(".cram-front").forEach(el=>{
      el.style.fontSize = (baseFront * scale) + "rem";
    });
    root.querySelectorAll(".cram-back .jp").forEach(el=>{
      el.style.fontSize = (baseBackJp * scale) + "rem";
    });
    root.querySelectorAll(".cram-back .en").forEach(el=>{
      el.style.fontSize = (baseBackEn * scale) + "rem";
    });
  }

  function attachCardFontControls(root){
    if (!root) return;
    let controls = root.querySelector(".card-font-controls");
    if (!controls){
      controls = document.createElement("div");
      controls.className = "card-font-controls";
      const dec = document.createElement("button");
      dec.type = "button";
      dec.className = "card-font-btn";
      dec.textContent = "−";
      const inc = document.createElement("button");
      inc.type = "button";
      inc.className = "card-font-btn";
      inc.textContent = "+";
      controls.appendChild(dec);
      controls.appendChild(inc);
      root.appendChild(controls);
      dec.addEventListener("click",(ev)=>{
        ev.stopPropagation();
        const s = getCardFontScale();
        setCardFontScale(s - 0.1);
        applyCardFontScale(root);
      });
      inc.addEventListener("click",(ev)=>{
        ev.stopPropagation();
        const s = getCardFontScale();
        setCardFontScale(s + 0.1);
        applyCardFontScale(root);
      });
    }
    applyCardFontScale(root);
  }

  let modalEl, listEl, searchEl, startBtn, selectedCountEl, totalCardsEl, selectedByLevelEl, collapseBtnEl;
  let topCollapsed = false;
  let customListSelectEl, customListNameEl, loadCustomListBtn, addToCustomListBtn, deleteCustomListBtn, saveNewCustomListBtn, customListHintEl;
  let levelFiltersEl;
  let selectTodayBtn, deselectAllBtn, selectLevelsBtn, selectMatchesBtn;
  let scoreMinEl, scoreMaxEl, itemsPerGrammarEl;
  let scoreRangeGroupEl, srsFilterGroupEl;
  let starBtns;
  let cramSrsBtns, cramSrsLevelBtns, cramSrsMode = "any";
  let quickPickPreviewEl, filterPickPreviewEl;
  let srsLevelFilter = new Set();

  // SRS difficulty selection (Cram selection)
  let srsDiffBtn, srsDiffPanelEl, srsDiffMinEl, srsDiffMaxEl, srsDiffTextEl, srsDiffResetBtn, srsDiffSelectBtn;
  let srsDiffHardValEl, srsDiffEasyValEl;
  let srsDiffDualEl;
  let srsDiffEnabled = false;
  let prevSrsModeBeforeDiff = "any";

  let overlayEl, quitBtn, saveBtn, cardEl, wrongBtn, rightBtn, undoBtn, nextBtn, progressEl, scoreEl;
  let completeQuitRowEl, completeQuitBtnEl;
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
  let hasManualSave = false; // becomes true after saving (via Quit) or resuming a saved session
  let undoState = null; // last pre-answer snapshot for UNDO

  // Keyboard: ArrowRight -> reveal back (if on front), otherwise advance (NEXT/Right).
  let keydownAttached = false;
  function isTypingInField(){
    const ae = document.activeElement;
    if (!ae) return false;
    const tag = ae.tagName;
    return ae.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }
  function onKeyDown(ev){
    if (ev.key !== "ArrowRight") return;
    if (!document.body.classList.contains("cram-session-open")) return;
    if (isTypingInField()) return;

    // Prevent page scroll while the session overlay is open.
    ev.preventDefault();

    // If session is complete (results card), do nothing.
    if (!Array.isArray(deck) || deck.length === 0) return;

    if (!showingBack){
      showingBack = true;
      renderCard();
      return;
    }

    // Prefer explicit NEXT (after WRONG) if available, otherwise treat as "Right".
    if (nextBtn && !nextBtn.hidden && !nextBtn.disabled){
      nextBtn.click();
      return;
    }
    if (rightBtn && !rightBtn.hidden && !rightBtn.disabled){
      rightBtn.click();
    }
  }
  function attachKeydown(){
    if (keydownAttached) return;
    keydownAttached = true;
    document.addEventListener("keydown", onKeyDown);
  }
  function detachKeydown(){
    if (!keydownAttached) return;
    keydownAttached = false;
    document.removeEventListener("keydown", onKeyDown);
  }

  function showSession(on){
    if (!overlayEl) return;
    overlayEl.hidden = !on;
    overlayEl.style.display = on ? "flex" : "none";
    document.body.classList.toggle("cram-session-open", on);
    if (on) attachKeydown(); else detachKeydown();
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

function getUsableNotes(grammarKey){
  const notes = window.App.Notes ? window.App.Notes.getNotes(grammarKey) : [];
  return notes
    .map(n => ({ jpHtml: n.jpHtml || "", enHtml: n.enHtml || "" }))
    .filter(n => Utils.htmlToText(n.jpHtml || "").length > 0);
}

  function selectAllMatchingCurrentFilters(){
    if (!window.App.State?.flat) return;
    const ud = Storage.userData;
    const q = (searchEl?.value || "").trim().toLowerCase();
    const sMin = Number(scoreMinEl?.value || 0);
    const sMax = Number(scoreMaxEl?.value || CONST.SCORE_MAX);

    const settings = Storage.settings || {};
    const srsEnabled = !!settings.srsEnabled;
    const useSrsDiff = srsEnabled && srsDiffEnabled;
    const srsDiffBounds = useSrsDiff ? getSrsDifficultyBounds() : null;

    window.App.State.flat.forEach(gp => {
      const exId = exampleIdOf(gp);
      const gKey = grammarKeyOf(gp);

      if (!levelFilter.has(gp.level)) return;

      const starred = !!ud.seenExamples[exId];
      if (starFilter === "starred" && !starred) return;

      if (cramSrsMode === "only" || cramSrsMode === "not"){
        const srsApi = window.App.SRS;
        const inSrs = !!(srsApi && srsApi.hasGrammarKey && srsApi.hasGrammarKey(gKey));
        if (cramSrsMode === "only"){
          if (!inSrs) return;
          if (srsLevelFilter && srsLevelFilter.size > 0 && !srsLevelFilter.has(gp.level)) return;
        } else {
          if (inSrs) return;
        }
      }

      if (useSrsDiff){
        const srsApi = window.App.SRS;
        if (!(srsApi && srsApi.hasGrammarKey && srsApi.getCard)) return;
        if (!srsApi.hasGrammarKey(gKey)) return;
        const card = srsApi.getCard(gKey);
        const diff = Number(card && card.difficulty);
          if (Number.isFinite(diff) && diff > 0){
            const { dMin, dMax } = srsDiffBounds;
            if (diff < dMin || diff > dMax) return;
          }
      }

      const score = getScore(exId);
      if (score < sMin || score > sMax) return;

      const hay = `${gp.grammar} ${gp.romaji||""} ${gp.meaning||""}`.toLowerCase();
      if (q && !hay.includes(q)) return;

      // Only select items that can actually generate cards
      if (!hasExamples(gKey)) return;

      selected.add(exId);
    });

    refreshSelectedCount();
    buildList();
  }

  function setCramSrsMode(nextMode){
    const raw = (nextMode || "any").toLowerCase();
    const mode = (raw === "only" || raw === "any" || raw === "not") ? raw : "any";
    cramSrsMode = mode;

    // Leaving SRS Items clears the started-level filter.
    if (cramSrsMode !== "only" && srsLevelFilter) srsLevelFilter.clear();

    // Show/hide the started-level filter + difficulty settings together with SRS Items.
    updateSrsLevelFilterUI();
    setSrsDifficultyEnabled(cramSrsMode === "only");

    if (cramSrsBtns && cramSrsBtns.length){
      cramSrsBtns.forEach(b=>b.classList.remove("active"));
      const btn = cramSrsBtns.find(b => (b.dataset.srs||"") === cramSrsMode) || cramSrsBtns[0];
      btn && btn.classList.add("active");
    }
  }

  function normalizeSrsDiffRange(){
    if (!srsDiffMinEl || !srsDiffMaxEl) return;
    let aMin = Number(srsDiffMinEl.value || 1);
    let aMax = Number(srsDiffMaxEl.value || 10);
    if (!Number.isFinite(aMin)) aMin = 1;
    if (!Number.isFinite(aMax)) aMax = 10;
    if (aMin > aMax){
      const t = aMin; aMin = aMax; aMax = t;
    }
    // Clamp
    aMin = Math.max(1, Math.min(10, aMin));
    aMax = Math.max(1, Math.min(10, aMax));
    srsDiffMinEl.value = String(aMin);
    srsDiffMaxEl.value = String(aMax);

    // Map axis (1=hard .. 10=easy) -> FSRS difficulty (10=hard .. 1=easy)
    const dHard = 11 - aMin;
    const dEasy = 11 - aMax;

    const fmt = (n) => {
      // Always show a fixed-width numeric format like 01.00, 10.00
      const s = (Number.isFinite(n) ? n : 0).toFixed(2);
      const parts = s.split(".");
      const i = (parts[0] || "0").padStart(2, "0");
      const d = (parts[1] || "00").padEnd(2, "0").slice(0, 2);
      return `${i}.${d}`;
    };

    // Keep the display width stable (no "all" vs numbers swapping)
    const hardTxt = fmt(dHard);
    const easyTxt = fmt(dEasy);

    if (srsDiffHardValEl) srsDiffHardValEl.textContent = hardTxt;
    if (srsDiffEasyValEl) srsDiffEasyValEl.textContent = easyTxt;

    if (srsDiffTextEl){
      if (aMin === 1 && aMax === 10){
        srsDiffTextEl.textContent = "Difficulty: ALL";
      } else {
        srsDiffTextEl.textContent = `Difficulty: ${hardTxt} (hard) → ${easyTxt} (easy)`;
      }
    }

    updateSrsDiffTrack();
  }


  function updateSrsDiffTrack(){
    if (!srsDiffDualEl || !srsDiffMinEl || !srsDiffMaxEl) return;
    const a1 = Number(srsDiffMinEl.value || 1);
    const a2 = Number(srsDiffMaxEl.value || 10);
    const lo = Math.min(a1, a2);
    const hi = Math.max(a1, a2);
    const pct = (v) => ((v - 1) / 9) * 100;
    srsDiffDualEl.style.setProperty("--min", `${pct(lo)}%`);
    srsDiffDualEl.style.setProperty("--max", `${pct(hi)}%`);
  }


  function getSrsDifficultyBounds(){
    if (!srsDiffMinEl || !srsDiffMaxEl) return { dMin: 1, dMax: 10 };
    let aMin = Number(srsDiffMinEl.value || 1);
    let aMax = Number(srsDiffMaxEl.value || 10);
    if (!Number.isFinite(aMin)) aMin = 1;
    if (!Number.isFinite(aMax)) aMax = 10;
    if (aMin > aMax){ const t=aMin; aMin=aMax; aMax=t; }
    // Axis -> difficulty bounds
    const dMax = 11 - aMin; // hard end (higher number)
    const dMin = 11 - aMax; // easy end (lower number)
    return { dMin, dMax };
  }

  function setSrsDifficultyEnabled(on){
    const enabled = !!on;
    srsDiffEnabled = enabled;
    if (srsDiffPanelEl) srsDiffPanelEl.hidden = !enabled;
    if (enabled){
      normalizeSrsDiffRange();
    }
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
  }


  function updateSrsLevelFilterUI(){
    const wrap = (modalEl || document).querySelector("#cramSrsLevelFilterWrap");
    if (wrap){
      const show = cramSrsMode === "only";
      wrap.hidden = !show;
      wrap.classList.toggle("disabled", !show);
    }
    if (!cramSrsLevelBtns || !cramSrsLevelBtns.length) return;

    const allBtn = cramSrsLevelBtns.find(b => (b.dataset.srslevel||"").toLowerCase() === "all") || null;

    const isAll = (!srsLevelFilter || srsLevelFilter.size === 0);

    if (isAll){
      // Treat empty filter as ALL selected (light up all buttons)
      if (allBtn) allBtn.classList.add("active");
      cramSrsLevelBtns.forEach(b=>{
        const k = (b.dataset.srslevel||"").toLowerCase();
        if (k !== "all") b.classList.add("active");
      });
      return;
    }

    if (allBtn) allBtn.classList.remove("active");
    cramSrsLevelBtns.forEach(b=>{
      const lvl = (b.dataset.srslevel||"").toUpperCase();
      if (!lvl || lvl === "ALL") return;
      b.classList.toggle("active", srsLevelFilter.has(lvl));
    });
  }

  function ensureCramSrsOnly(){
    if (cramSrsMode === "only") return;
    cramSrsMode = "only";
    if (cramSrsBtns && cramSrsBtns.length){
      cramSrsBtns.forEach(b=>b.classList.remove("active"));
      const onlyBtn = cramSrsBtns.find(b=> (b.dataset.srs||"") === "only");
      (onlyBtn || cramSrsBtns[0])?.classList.add("active");
    }
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
      const settings = Storage.settings || {};
    const srsEnabled = !!settings.srsEnabled;

    const sMin = srsEnabled ? 0 : Number(scoreMinEl?.value || 0);
    const sMax = srsEnabled ? CONST.SCORE_MAX : Number(scoreMaxEl?.value || CONST.SCORE_MAX);
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
function resetCramFiltersToDefault(){
  // Search
  if (searchEl) searchEl.value = "";

  // Stars
  starFilter = "any";
  if (starBtns && starBtns.length){
    starBtns.forEach(b=>{
      const isAny = (b.dataset.star || "any") === "any";
      b.classList.toggle("active", isAny);
    });
  }

  // SRS
  if (srsDiffMinEl) srsDiffMinEl.value = "1";
  if (srsDiffMaxEl) srsDiffMaxEl.value = "10";
  normalizeSrsDiffRange();

  setCramSrsMode("any");
}

function selectAllInActiveLevels(){
  if (!window.App.State?.flat) return;
  const lvls = levelFilter || new Set();
  window.App.State.flat.forEach(gp=>{
    if (!lvls.has(gp.level)) return;
    const gKey = grammarKeyOf(gp);
    if (!hasExamples(gKey)) return;
    selected.add(exampleIdOf(gp));
  });
  refreshSelectedCount();
  buildList();
}




  function computeTotalCards(){
    const per = getItemsPerGrammar();
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

  function formatPickPreviewHtml(counts){
    const grammar = counts.grammar || 0;
    const by = counts.byLevel || {};
    const breakdown = ["N5","N4","N3","N2","N1"].map(lvl => {
      const n = by[lvl] || 0;
      return `<span class="cram-level-count ${lvl}" aria-label="${lvl} ${n}">${n}</span>`;
    }).join(`<span class="cram-level-sep">,</span> `);

    return `
      <span class="cram-pick-label">Grammar:</span>
      <span class="cram-emph-num">${grammar}</span>
      <span class="cram-pick-label">JLPT Breakdown:</span>
      <span class="cram-pick-breakdown">${breakdown}</span>
    `.trim();
  }


  function getItemsPerGrammar(){
    const n = Number(itemsPerGrammarEl?.value || 1);
    if (!Number.isFinite(n) || n <= 0) return 1;
    return Math.max(1, Math.min(10, Math.round(n)));
  }

  function computePickCounts(kind){
    // kind: "quick" or "filter"
    if (!window.App.State?.flat) return { grammar:0, cards:0, byLevel:{N5:0,N4:0,N3:0,N2:0,N1:0} };

    const ud = Storage.userData;
    const itemsPer = getItemsPerGrammar();

    const byLevel = { N5:0, N4:0, N3:0, N2:0, N1:0 };
    let grammar = 0;

    const q = (searchEl?.value || "").trim().toLowerCase();
    const sMin = Number(scoreMinEl?.value || 0);
    const sMax = Number(scoreMaxEl?.value || CONST.SCORE_MAX);

    const settings = Storage.settings || {};
    const srsEnabled = !!settings.srsEnabled;
    const useSrsDiff = (kind === "filter") && srsEnabled && srsDiffEnabled;
    const srsDiffBounds = useSrsDiff ? getSrsDifficultyBounds() : null;

    window.App.State.flat.forEach(gp=>{
      if (!gp || !gp.level) return;

      if (!levelFilter.has(gp.level)) return;

      const gKey = grammarKeyOf(gp);
      if (!hasExamples(gKey)) return;

      if (kind === "filter"){
        const exId = exampleIdOf(gp);

        const starred = !!ud.seenExamples[exId];
        if (starFilter === "starred" && !starred) return;

        // SRS membership filter
        if (cramSrsMode === "only" || cramSrsMode === "not"){
          const srsApi = window.App.SRS;
          const inSrs = !!(srsApi && srsApi.hasGrammarKey && srsApi.hasGrammarKey(gKey));
          if (cramSrsMode === "only"){
            if (!inSrs) return;
            if (srsLevelFilter && srsLevelFilter.size > 0 && !srsLevelFilter.has(gp.level)) return;
          } else {
            if (inSrs) return;
          }
        }

        if (useSrsDiff){
          const srsApi = window.App.SRS;
          if (!(srsApi && srsApi.hasGrammarKey && srsApi.getCard)) return;
          if (!srsApi.hasGrammarKey(gKey)) return;
          const card = srsApi.getCard(gKey);
          const diff = Number(card && card.difficulty);
          if (Number.isFinite(diff) && diff > 0){
            const { dMin, dMax } = srsDiffBounds;
            if (diff < dMin || diff > dMax) return;
          }
        }

        const score = getScore(exId);
        if (score < sMin || score > sMax) return;

        const hay = `${gp.grammar} ${gp.romaji||""} ${gp.meaning||""}`.toLowerCase();
        if (q && !hay.includes(q)) return;
      }

      grammar += 1;
      if (byLevel[gp.level] !== undefined) byLevel[gp.level] += 1;
    });

    return { grammar, cards: grammar * itemsPer, byLevel };
  }

  function updatePickPreviews(){
    if (quickPickPreviewEl){
      const c = computePickCounts("quick");
      quickPickPreviewEl.innerHTML = formatPickPreviewHtml(c);
    }
    if (filterPickPreviewEl){
      const c = computePickCounts("filter");
      filterPickPreviewEl.innerHTML = formatPickPreviewHtml(c);
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
    selectedByLevelEl.innerHTML = `JLPT Breakdown: ` +
      ["N5","N4","N3","N2","N1"].map(lvl => {
        const n = counts[lvl]||0;
        return `<span class="cram-level-count ${lvl}" aria-label="${lvl} ${n}">${n}</span>`;
      }).join(`<span class="cram-level-sep">,</span> `);
  }

function refreshSelectedCount(){
    if (selectedCountEl) selectedCountEl.innerHTML = `Grammar: <span class="cram-emph-num">${selected.size}</span>`;
    if (totalCardsEl) totalCardsEl.innerHTML = `Unique Cards: <span class="cram-emph-num">${computeTotalCards()}</span>`;
    refreshSelectedByLevel();
    if (startBtn) startBtn.disabled = selected.size === 0;
    updateCustomListButtons();
    updatePickPreviews();
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


  function applySrsUiVisibility(){
    const settings = Storage.settings || {};
    const srsEnabled = !!settings.srsEnabled;

    // When SRS scheduling is enabled, self-rating score range is not relevant.
    if (scoreRangeGroupEl) scoreRangeGroupEl.hidden = srsEnabled;
    if (srsFilterGroupEl) srsFilterGroupEl.hidden = !srsEnabled;

    if (!srsEnabled){
      // Reset SRS-only filter if SRS is disabled.
      cramSrsMode = "any";
      if (srsLevelFilter) srsLevelFilter.clear();
      setSrsDifficultyEnabled(false);
      updateSrsLevelFilterUI();

      if (cramSrsBtns && cramSrsBtns.length){
        cramSrsBtns.forEach(b=>b.classList.remove("active"));
        const anyBtn = cramSrsBtns.find(b=> (b.dataset.srs||"") === "any") || cramSrsBtns[0];
        anyBtn && anyBtn.classList.add("active");
      }
    } else {
      // Ensure score range doesn't accidentally filter when hidden.
      if (scoreMinEl) scoreMinEl.value = "0";
      if (scoreMaxEl) scoreMaxEl.value = String(CONST.SCORE_MAX);
    }
  }

function buildList(){
    if (!listEl || !window.App.State?.flat) return;
    listEl.innerHTML = "";

    const ud = Storage.userData;
    const q = (searchEl?.value || "").trim().toLowerCase();

    const sMin = Number(scoreMinEl?.value || 0);
    const sMax = Number(scoreMaxEl?.value || CONST.SCORE_MAX);

    const settings = Storage.settings || {};
    const srsEnabled = !!settings.srsEnabled;
    const useSrsDiff = srsEnabled && srsDiffEnabled;
    const srsDiffBounds = useSrsDiff ? getSrsDifficultyBounds() : null;

    let anyShown = false;

    window.App.State.flat.forEach(gp => {
      const exId = exampleIdOf(gp);
      const gKey = grammarKeyOf(gp);

      if (!levelFilter.has(gp.level)) return;

      const starred = !!ud.seenExamples[exId];
      if (starFilter === "starred" && !starred) return;

      if (cramSrsMode === "only" || cramSrsMode === "not"){
        const srsApi = window.App.SRS;
        const inSrs = !!(srsApi && srsApi.hasGrammarKey && srsApi.hasGrammarKey(gKey));
        if (cramSrsMode === "only"){
          if (!inSrs) return;
          if (srsLevelFilter && srsLevelFilter.size > 0 && !srsLevelFilter.has(gp.level)) return;
        } else {
          if (inSrs) return;
        }
      }

      if (useSrsDiff){
        const srsApi = window.App.SRS;
        if (!(srsApi && srsApi.hasGrammarKey && srsApi.getCard)) return;
        if (!srsApi.hasGrammarKey(gKey)) return;
        const card = srsApi.getCard(gKey);
        const diff = Number(card && card.difficulty);
          if (Number.isFinite(diff) && diff > 0){
            const { dMin, dMax } = srsDiffBounds;
            if (diff < dMin || diff > dMax) return;
          }
      }

      const score = getScore(exId);
      if (score < sMin || score > sMax) return;

      const hay = `${gp.grammar} ${gp.romaji||""} ${gp.meaning||""}`.toLowerCase();
      if (q && !hay.includes(q)) return;

      const canUse = hasExamples(gKey);

      // Match main/viewall: show SRS badge when scheduling enabled; otherwise show personal score emoji.
      const srsUiEnabled = !!settings.srsEnabled;
      let srsButtonHtml = "";
      if (srsUiEnabled){
        const srsApi = window.App.SRS;
        const inSrs = !!(srsApi && srsApi.hasGrammarKey && srsApi.hasGrammarKey(gKey));
        if (inSrs && srsApi && typeof srsApi.getEmojiForKey === "function"){
          const e = srsApi.getEmojiForKey(gKey);
          const emoji = (e && e.emoji) ? e.emoji : (window.App.CONST?.SCORE_EMOJIS?.[0] || "🌑");
          const tip = (e && e.title) ? e.title : "In SRS";
          srsButtonHtml = `<button class="srs-add-btn srs-added" type="button" title="${Utils.escapeHtml(tip)}">${emoji}</button>`;
        } else {
          srsButtonHtml = `<button class="srs-add-btn${inSrs ? " srs-added" : ""}" type="button" title="${inSrs ? "In SRS" : "Add to SRS"}">＋</button>`;
        }
      }


      const item = document.createElement("div");
      item.className =
        `cram-item level-${gp.level}` +
        (selected.has(exId) ? " selected" : "") +
        (!canUse ? " no-examples" : "");
      item.tabIndex = 0;

      item.innerHTML = `
        <div class="cram-item-main">
          <div class="cram-item-info">
            <div class="cram-item-title">${Utils.escapeHtml(gp.grammar)}</div>
            <div class="cram-item-meaning">${Utils.escapeHtml(gp.meaning || "")}</div>
          </div>
          <div class="cram-item-controls">
            ${srsButtonHtml}
            <span class="star-toggle ${starred ? "seen":""}" title="Mark as seen">★</span>
          </div>
        </div>
      `;

      const controlsEl = item.querySelector(".cram-item-controls");
      const starEl = item.querySelector(".star-toggle");

      // Only show self-rating emoji scores when SRS scheduling is OFF.
      if (!!settings.scoresEnabled && !srsUiEnabled && window.App.Scores){
        const scoreWrap = window.App.Scores.build(exId);
        if (scoreWrap && controlsEl && starEl) controlsEl.insertBefore(scoreWrap, starEl);
      }

      // Wire up SRS toggle in this list (stopPropagation so it doesn't select/deselect the item).
      const srsBtn = item.querySelector(".srs-add-btn");
      if (srsBtn && srsUiEnabled){
        srsBtn.addEventListener("click",(ev)=>{
          ev.stopPropagation();
          const srsApi = window.App.SRS;
          if (!srsApi) return;
          const inSrsNow = srsApi.hasGrammarKey && srsApi.hasGrammarKey(gKey);
          if (!inSrsNow){
            const added = srsApi.addGrammarKey(gKey);
            if (added){
              srsBtn.classList.add("srs-added");
              if (srsApi.getEmojiForKey){
                const e = srsApi.getEmojiForKey(gKey);
                if (e && e.emoji) srsBtn.textContent = e.emoji;
                if (e && e.title) srsBtn.title = e.title;
                else srsBtn.title = "In SRS";
              } else {
                srsBtn.title = "In SRS";
              }
              // Keep list filters honest (SRS-only mode etc)
              const st = listEl ? listEl.scrollTop : 0;
              buildList();
              if (listEl) listEl.scrollTop = st;
            }
          } else {
            srsApi.beginToggle && srsApi.beginToggle(gKey, srsBtn);
            // beginToggle may remove; refresh after a tick
            setTimeout(()=>{
              const st = listEl ? listEl.scrollTop : 0;
              buildList();
              if (listEl) listEl.scrollTop = st;
            }, 10);
          }
        });
      }

      // Star toggle (matches main/viewall)
      if (starEl){
        starEl.addEventListener("click",(ev)=>{
          ev.stopPropagation();
          const cur = !!Storage.userData.seenExamples[exId];
          if (cur) delete Storage.userData.seenExamples[exId];
          else Storage.userData.seenExamples[exId] = true;
          Storage.saveUserData();
          starEl.classList.toggle("seen", !cur);
          const st = listEl ? listEl.scrollTop : 0;
          buildList();
          if (listEl) listEl.scrollTop = st;
        });
      }


      item.addEventListener("click", () => {
        if (!canUse) return;
        if (selected.has(exId)) selected.delete(exId);
        else selected.add(exId);
        refreshSelectedCount();
        const st = listEl ? listEl.scrollTop : 0;
        buildList();
        if (listEl) listEl.scrollTop = st;
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

    updatePickPreviews();
  }

  function open(){
    if (!modalEl) return;
    // Start Cram with the same level filters as the main page
    syncLevelFilterFromMain();

    updatePickPreviews();

    isOpen = true;
    modalEl.hidden = false;
    applySrsUiVisibility();
    updateSrsLevelFilterUI();
    refreshCustomListDropdown(true);
    refreshSelectedCount();
    buildList();
    if (searchEl) searchEl.focus();
  }

  function close(){
    if (!modalEl) return;
    isOpen = false;
    modalEl.hidden = true;
    const ymd = document.querySelector("#viewDate")?.value || Utils.dateToYMD(new Date());
    window.App.Daily?.render?.(ymd);
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

  
  function setTopCollapsed(on){
    topCollapsed = !!on;
    if (modalEl) modalEl.classList.toggle("cram-top-collapsed", topCollapsed);
    if (collapseBtnEl) collapseBtnEl.textContent = topCollapsed ? "▾" : "▴";
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

    // Build a quick lookup so we don't linearly scan the full grammar list for every card.
    const byExId = new Map();
    window.App.State.flat.forEach(x=>{
      const id = `${x.level}_${x.index}`;
      if (!byExId.has(id)) byExId.set(id, x);
    });

    // Rebuild deck with fresh gp references
    const rebuilt = [];
    (s.deck || []).forEach(it => {
      const exId = String(it?.exId || "");
      const gp = byExId.get(exId);
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
      const gp = byExId.get(exId);
      if (!gp) return;
      const key = String(w?.key || grammarKeyOf(gp));
      wrongGrammarMap.set(key, { gp, exId, count: Math.max(1, Number(w?.count || 1)) });
    });

    wrongExampleIds = new Set((s.wrongExampleIds || []).map(String));

    hasManualSave = true;

    undoState = null;
    // Close selection modal if it was open and jump straight into the session
    close();
    showSession(true);
    renderCard();
    return true;
  }


  function endSession(){
    clearSavedSession();
    hasManualSave = false;
    undoState = null;
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



  function quitSession(){
    // Expected behavior: quitting should keep progress.
    // - If a session is in progress, save a resumable snapshot and close the overlay.
    // - If the session is already finished (results screen), clear the snapshot.
    if (deck && deck.length){
      saveSessionSnapshot();
      hasManualSave = true;
      showSession(false);
      setSaveButtonState();
    } else {
      endSession();
    }
  }

  function buildDeckFromExampleIds(exampleIds, itemsPerGrammarOverride){
    const itemsPerGrammar = Math.max(1, Math.min(10, Number((itemsPerGrammarOverride ?? itemsPerGrammarEl?.value)) || 1));
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

    hasManualSave = false;
    undoState = null;
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
          <input id="cramRetryItemsPerGrammar" class="cram-select cram-number" type="number" min="1" max="10" step="1" value="${Number(itemsPerGrammarEl?.value || 1)}" />
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

        <div class="cram-results-save-row cram-results-save-scope">
          <label class="cram-radio">
            <input type="radio" name="cramResultsScope" value="all" checked />
            <span>All from this session</span>
          </label>
          <label class="cram-radio">
            <input type="radio" name="cramResultsScope" value="failed" ${wrongItems.length ? "" : "disabled"} />
            <span>Only failed this session</span>
          </label>
        </div>

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
      const per = Math.max(1, Math.min(10, Number(cardEl.querySelector('#cramRetryItemsPerGrammar')?.value || itemsPerGrammarEl?.value || 1)));
      restartWithExampleIds(wrongExampleIds, per);
    });

    cardEl.querySelector('[data-action="pick-wrong"]')?.addEventListener('click', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      const per = Math.max(1, Math.min(10, Number(cardEl.querySelector('#cramRetryItemsPerGrammar')?.value || itemsPerGrammarEl?.value || 1)));
      openCramWithPreselected(wrongExampleIds, per);
    });


    // Save list controls
    const resultsNewNameEl = cardEl.querySelector('#cramResultsNewListName');
    const resultsSelectEl = cardEl.querySelector('#cramResultsListSelect');
    const resultsHintEl = cardEl.querySelector('#cramResultsSaveHint');
    const saveNewBtn = cardEl.querySelector('[data-action="save-new-list"]');
    const addBtn = cardEl.querySelector('[data-action="add-to-list"]');
    const scopeInputs = Array.from(cardEl.querySelectorAll('input[name="cramResultsScope"]'));

    function setResultsHint(t){
      if (resultsHintEl){
        resultsHintEl.textContent = t || "Save the grammar from this session to a custom list.";
      }
    }

    function getScopedExampleIds(){
      const scope = (scopeInputs.find(r => r.checked)?.value) || "all";
      if (scope === "failed"){
        return Array.from(wrongExampleIds || []);
      }
      return Array.from(sessionExampleIds || []);
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

      Object.keys(lists)
        .sort((a,b)=>a.localeCompare(b, undefined, { sensitivity:"base" }))
        .forEach(name=>{
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
      const ids = getScopedExampleIds();
      const hasSomething = !!(ids && ids.length);
      const newNameOk = !!((resultsNewNameEl?.value || "").trim());
      const hasChosen = !!(resultsSelectEl && resultsSelectEl.value);

      if (saveNewBtn) saveNewBtn.disabled = !(hasSomething && newNameOk);
      if (addBtn) addBtn.disabled = !(hasSomething && hasChosen);
    }

    populateResultsLists(false);
    updateResultsSaveButtons();

    resultsNewNameEl?.addEventListener("input", updateResultsSaveButtons);
    resultsSelectEl?.addEventListener("change", updateResultsSaveButtons);
    scopeInputs.forEach(radio => {
      radio.addEventListener("change", () => {
        const ids = getScopedExampleIds();
        if (radio.value === "failed" && (!ids || !ids.length)){
          setResultsHint("No failed grammar to save this run.");
        } else {
          setResultsHint("");
        }
        updateResultsSaveButtons();
      });
    });

    saveNewBtn?.addEventListener("click", (e)=>{
      e.preventDefault();
      e.stopPropagation();
      const name = (resultsNewNameEl?.value || "").trim();
      if (!name){
        setResultsHint("Enter a new list name first.");
        updateResultsSaveButtons();
        return;
      }

      const ids = Array.from(new Set(getScopedExampleIds().map(String)));
      if (!ids.length){
        setResultsHint("Nothing to save.");
        updateResultsSaveButtons();
        return;
      }

      const lists = { ...getCramLists() };
      if (lists[name]){
        setResultsHint(`That list name already exists: "${name}".`);
        return;
      }

      lists[name] = ids;
      saveCramLists(lists);
      populateResultsLists(true);
      if (resultsSelectEl) resultsSelectEl.value = name;
      setResultsHint(`Saved as "${name}".`);
      if (resultsNewNameEl) resultsNewNameEl.value = "";
      updateResultsSaveButtons();
    });

    addBtn?.addEventListener("click", (e)=>{
      e.preventDefault();
      e.stopPropagation();
      const name = resultsSelectEl?.value || "";
      if (!name){
        setResultsHint("Choose a list to add to.");
        updateResultsSaveButtons();
        return;
      }

      const ids = Array.from(new Set(getScopedExampleIds().map(String)));
      if (!ids.length){
        setResultsHint("Nothing to add.");
        updateResultsSaveButtons();
        return;
      }

      const lists = { ...getCramLists() };
      const existing = new Set((lists[name] || []).map(String));
      ids.forEach(id => existing.add(String(id)));
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


  function setCompletionUI(isComplete){
    const done = !!isComplete;

    // Hide the top-right quit button on completion, and show a centered quit below the card.
    if (quitBtn) quitBtn.hidden = done;
    if (completeQuitRowEl) completeQuitRowEl.hidden = !done;

    // Hide the action row buttons on completion (the card itself becomes the focus).
    if (wrongBtn) wrongBtn.hidden = done;
    if (rightBtn) rightBtn.hidden = done;
    if (nextBtn) nextBtn.hidden = true;
  }



  function cloneDeckCardForUndo(c){
    if (!c) return null;
    const out = {
      exId: c.exId,
      gp: c.gp,
      jpHtml: c.jpHtml,
      enHtml: c.enHtml,
      _exampleIndex: c._exampleIndex
    };
    if (c._example){
      out._example = { jpHtml: c._example.jpHtml || "", enHtml: c._example.enHtml || "" };
    }
    return out;
  }

  function serializeWrongGrammarMap(){
    const arr = [];
    try{
      wrongGrammarMap.forEach((v, k) => {
        arr.push({ key: String(k), exId: String(v?.exId || ""), count: Number(v?.count || 1) });
      });
    }catch(e){ /* ignore */ }
    return arr;
  }

  function restoreWrongGrammarMap(serialized){
    const flat = window.App.State?.flat || [];
    const map = new Map();
    (serialized || []).forEach(w => {
      const exId = String(w?.exId || "");
      const gp = flat.find(x => `${x.level}_${x.index}` === exId);
      if (!gp) return;
      const key = String(w?.key || grammarKeyOf(gp));
      map.set(key, { gp, exId, count: Math.max(1, Number(w?.count || 1)) });
    });
    return map;
  }

  function snapshotForUndo(extra){
    return {
      deck: (deck || []).map(cloneDeckCardForUndo),
      wrongCount,
      rightCount,
      totalInitial,
      showingBack,
      awaitingNext,
      wrongGrammar: serializeWrongGrammarMap(),
      wrongExampleIds: Array.from(wrongExampleIds || []).map(String),
      studyLogUndo: extra && extra.studyLogUndo ? extra.studyLogUndo : null
    };
  }

  function canUndo(){
    return !!undoState;
  }

  function setUndoEnabled(){
    if (!undoBtn) return;
    const enabled = canUndo();
    undoBtn.disabled = !enabled;
  }

  function pushUndoSnapshot(extra){
    undoState = snapshotForUndo(extra);
    setUndoEnabled();
  }

  function undoLast(){
    if (!undoState) return;
    const s = undoState;
    undoState = null;

    // Restore Study Log counters for the day.
    try{ window.App?.Heatmap?.applyStudyUndo?.(s.studyLogUndo); }catch(e){}

    deck = (s.deck || []).map(c => {
      const out = {
        exId: c.exId,
        gp: c.gp,
        jpHtml: c.jpHtml,
        enHtml: c.enHtml
      };
      if (c._exampleIndex != null) out._exampleIndex = c._exampleIndex;
      if (c._example) out._example = { jpHtml: c._example.jpHtml || "", enHtml: c._example.enHtml || "" };
      return out;
    });

    wrongCount = Number(s.wrongCount || 0);
    rightCount = Number(s.rightCount || 0);
    totalInitial = Number(s.totalInitial || 0);
    showingBack = !!s.showingBack;
    awaitingNext = !!s.awaitingNext;

    wrongGrammarMap = restoreWrongGrammarMap(s.wrongGrammar);
    wrongExampleIds = new Set((s.wrongExampleIds || []).map(String));

    renderCard();
    setUndoEnabled();
  }

  function syncActionButtons(){
    setUndoEnabled();
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
function stepBackExampleCram(card, dir){
  if (!card || !card.gp) return;
  const gKey = grammarKeyOf(card.gp);
  const usable = getUsableNotes(gKey);
  if (usable.length < 2) return;

  const base = card._example
    ? card._example
    : { jpHtml: card.jpHtml || "", enHtml: card.enHtml || "" };

  const baseSig = `${base.jpHtml || ""}||${base.enHtml || ""}`;

  let idx = Number.isFinite(card._exampleIndex) ? card._exampleIndex : -1;
  if (idx < 0){
    idx = usable.findIndex(n => `${n.jpHtml || ""}||${n.enHtml || ""}` === baseSig);
  }
  if (idx < 0) idx = 0;

  idx = idx + (Number(dir) || 0);
  idx = idx % usable.length;
  if (idx < 0) idx += usable.length;

  const pick = usable[idx];
  card._exampleIndex = idx;
  card._example = { jpHtml: pick.jpHtml || "", enHtml: pick.enHtml || "" };

  renderCard();
}


  function renderCard(){
    if (!cardEl) return;

    if (deck.length === 0){
      setCompletionUI(true);
      // Session completed: do not leave a resumable save behind.
      clearSavedSession();
      hasManualSave = false;
      awaitingNext = false;
      if (flipHintEl) flipHintEl.hidden = true;
      setSaveButtonState();
      renderResultsCard();
      syncActionButtons();
      renderFooter();
      return;
    }

    setCompletionUI(false);

    const c = deck[0];
const gp = c.gp;

const gpHtml = gp.primaryLink
  ? `<a href="${gp.primaryLink}" target="_blank" rel="noopener">${Utils.escapeHtml(gp.grammar)}</a>`
  : Utils.escapeHtml(gp.grammar);

const gKey = grammarKeyOf(gp);
const usable = showingBack ? getUsableNotes(gKey) : [];
const usableCount = showingBack ? usable.length : 0;

let backJp = c.jpHtml;
let backEn = c.enHtml || "";

if (showingBack && usableCount){
  const base = c._example ? c._example : { jpHtml: c.jpHtml || "", enHtml: c.enHtml || "" };
  const baseSig = `${base.jpHtml || ""}||${base.enHtml || ""}`;

  let idx = Number.isFinite(c._exampleIndex) ? c._exampleIndex : -1;
  if (idx < 0){
    idx = usable.findIndex(n => `${n.jpHtml || ""}||${n.enHtml || ""}` === baseSig);
  }
  if (idx < 0) idx = 0;

  c._exampleIndex = idx;
  const pick = usable[idx];
  c._example = { jpHtml: pick.jpHtml || "", enHtml: pick.enHtml || "" };

  backJp = c._example.jpHtml || backJp;
  backEn = c._example.enHtml || backEn;
}

const navCountText = (showingBack && usableCount > 1)
  ? `${(Number.isFinite(c._exampleIndex) ? c._exampleIndex : 0) + 1}/${usableCount}`
  : "";

const navHtml = (showingBack && usableCount > 1) ? `
  <div class="card-ex-nav">
    <span class="card-ex-count">${navCountText}</span>
    <button type="button" class="card-ex-btn" data-ex-nav="prev" aria-label="Previous example">&lt;</button>
    <button type="button" class="card-ex-btn" data-ex-nav="next" aria-label="Next example">&gt;</button>
  </div>
` : "";

if (!showingBack){
  cardEl.innerHTML = `<div class="cram-front">${c.jpHtml}</div>`;
} else {
  cardEl.innerHTML = `
    <div class="cram-back">
      <div class="jp">${backJp}</div>
      <div class="en">${backEn || ""}</div>
      <div class="gp level-${gp.level}">${gpHtml}</div>
      <div class="desc">${Utils.escapeHtml(gp.meaning || "")}</div>
      ${navHtml}
    </div>
  `;
}

    attachCardFontControls(cardEl);

    cardEl.onclick = () => {
  if (!showingBack){
    showingBack = true;
    renderCard();
  }
};

if (showingBack && usableCount > 1){
  const prevBtn = cardEl.querySelector('[data-ex-nav="prev"]');
  const nextBtn = cardEl.querySelector('[data-ex-nav="next"]');
  if (prevBtn){
    prevBtn.onclick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      stepBackExampleCram(deck[0], -1);
    };
  }
  if (nextBtn){
    nextBtn.onclick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      stepBackExampleCram(deck[0], +1);
    };
  }
}

    if (flipHintEl){ flipHintEl.hidden = false; flipHintEl.textContent = "Click the card to flip."; }

    syncActionButtons();
    renderFooter();
    setSaveButtonState();
  }

  function beginSession(){
    clearSavedSession();
    hasManualSave = false;
    undoState = null;
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

    const studyLogUndo = window.App?.Heatmap?.recordCramActivity?.() || null;
    pushUndoSnapshot({ studyLogUndo });

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

    const studyLogUndo = window.App?.Heatmap?.recordCramActivity?.() || null;
    pushUndoSnapshot({ studyLogUndo });
    rightCount++;
    deck.shift();
    showingBack = false;
    renderCard();
  }


  Cram.refreshIfOpen = () => { if (isOpen){ applySrsUiVisibility();
    updateSrsLevelFilterUI(); buildList(); } };

  Cram.init = () => {
    const openBtn = Utils.qs("#openCramBtn");
    modalEl = Utils.qs("#cramModalBackdrop");
    listEl = Utils.qs("#cramList");
    searchEl = Utils.qs("#cramSearch");
    collapseBtnEl = Utils.qs("#cramCollapseBtn");
    startBtn = Utils.qs("#cramStartBtn");
    selectedCountEl = Utils.qs("#cramSelectedCount");
    totalCardsEl = Utils.qs("#cramTotalCards");
    selectedByLevelEl = Utils.qs("#cramSelectedByLevel");
    const closeBtn = Utils.qs("#closeCramBtn");

    levelFiltersEl = Utils.qs("#cramLevelFilters");
    selectTodayBtn = Utils.qs("#cramSelectTodayBtn");
    deselectAllBtn = Utils.qs("#cramDeselectAllBtn");
    selectLevelsBtn = Utils.qs("#cramSelectLevelsBtn");
    selectMatchesBtn = Utils.qs("#cramSelectMatchesBtn");
    quickPickPreviewEl = Utils.qs("#cramQuickPickPreview");
    filterPickPreviewEl = Utils.qs("#cramFilterPickPreview");
    scoreRangeGroupEl = Utils.qs("#cramScoreRangeGroup");
    srsFilterGroupEl = Utils.qs("#cramSrsFilterGroup");

    scoreMinEl = Utils.qs("#cramScoreMin");
    scoreMaxEl = Utils.qs("#cramScoreMax");
    itemsPerGrammarEl = Utils.qs("#cramItemsPerGrammar");

    // SRS difficulty filter controls
    srsDiffBtn = Utils.qs("#cramSrsDifficultyBtn");
    srsDiffPanelEl = Utils.qs("#cramSrsDifficultyPanel");
    srsDiffMinEl = Utils.qs("#cramSrsDifficultyMin");
    srsDiffMaxEl = Utils.qs("#cramSrsDifficultyMax");
    srsDiffTextEl = Utils.qs("#cramSrsDifficultyText");
    srsDiffHardValEl = Utils.qs("#cramSrsDifficultyHardVal");
    srsDiffEasyValEl = Utils.qs("#cramSrsDifficultyEasyVal");
    srsDiffDualEl = Utils.qs("#cramSrsDifficultyDual");
    srsDiffSelectBtn = Utils.qs("#cramSrsDifficultySelectBtn");
    srsDiffResetBtn = Utils.qs("#cramSrsDifficultyResetBtn");


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

    completeQuitRowEl = Utils.qs("#cramCompleteQuitRow");
    completeQuitBtnEl = Utils.qs("#cramCompleteQuitBtn");
    undoBtn = Utils.qs("#cramUndoBtn");
    progressEl = Utils.qs("#cramProgressText");
    scoreEl = Utils.qs("#cramScoreText");
    flipHintEl = Utils.qs("#cramFlipHint");

    // Resume prompt elements
    resumeBackdropEl = Utils.qs("#cramResumeBackdrop");
    resumeContinueBtn = Utils.qs("#cramResumeBtn");
    resumeStartNewBtn = Utils.qs("#cramDiscardBtn");
    resumeCloseBtn = Utils.qs("#cramResumeCloseBtn");

    // Only "Stars" filter buttons (avoid mixing with SRS buttons)
    starBtns = Array.from((modalEl || document).querySelectorAll(".cram-star-btn[data-star]"));

    cramSrsBtns = Array.from((modalEl || document).querySelectorAll("#cramSrsFilterGroup [data-srs]"));

    cramSrsLevelBtns = Array.from((modalEl || document).querySelectorAll("#cramSrsLevelFilters [data-srslevel]"));

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
    collapseBtnEl?.addEventListener("click",(ev)=>{ ev.stopPropagation(); setTopCollapsed(!topCollapsed); });
    // Ensure correct initial arrow state
    setTopCollapsed(topCollapsed);

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

    // Score range (removed from UI; keep defaults so nothing filters)
    if (scoreMinEl && scoreMaxEl){
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
  
    }

    searchEl?.addEventListener("input", Utils.debounce(buildList, 80));
    selectTodayBtn?.addEventListener("click", selectTodaysGrammar);
    deselectAllBtn?.addEventListener("click", ()=>{
      selected.clear();
      refreshSelectedCount();
      buildList();
    });

    // Quick select: ignore extra filters and grab everything in the chosen levels.
    selectLevelsBtn?.addEventListener("click", ()=>{
      resetCramFiltersToDefault();
      selectAllInActiveLevels();
    });

    // Filter select: add everything that matches the current filters + search.
    selectMatchesBtn?.addEventListener("click", ()=>{
      if (srsDiffEnabled) normalizeSrsDiffRange();
      selectAllMatchingCurrentFilters();
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
    levelFiltersEl.appendChild(allBtn);
    allLevelBtn = allBtn;

    // Per-level toggles (selection is handled by the "Select levels" button)
    CONST.LEVEL_ORDER.forEach(lvl=>{
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
      levelFiltersEl.appendChild(b);
      levelBtns.set(lvl, b);
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

    // SRS filter (Any / Not in SRS / SRS Items)
    cramSrsBtns.forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const next = (btn.dataset.srs || "any").toLowerCase();
        setCramSrsMode(next);
        buildList();
      });
    });

// Started SRS level filter buttons
    if (cramSrsLevelBtns && cramSrsLevelBtns.length){
      cramSrsLevelBtns.forEach(btn=>{
        btn.addEventListener("click", ()=>{
          const raw = (btn.dataset.srslevel || "").toLowerCase();
          if (raw === "all"){
            srsLevelFilter.clear();
            // Keep current SRS mode; ALL means "no extra level restriction".
            updateSrsLevelFilterUI();
            buildList();
            return;
          }

          // Selecting specific levels implies "In SRS"
          ensureCramSrsOnly();

          const lvl = (btn.dataset.srslevel || "").toUpperCase();
          if (!lvl) return;
          if (srsLevelFilter.has(lvl)) srsLevelFilter.delete(lvl);
          else srsLevelFilter.add(lvl);

          // If user toggles everything off, treat it as ALL
          if (srsLevelFilter.size === 0){
            srsLevelFilter.clear();
          }

          updateSrsLevelFilterUI();
          buildList();
        });
      });
    }
function onSrsDiffInput(){
      normalizeSrsDiffRange();
      if (srsDiffEnabled) buildList();
    }
    srsDiffMinEl?.addEventListener("input", onSrsDiffInput);
    srsDiffMaxEl?.addEventListener("input", onSrsDiffInput);
    srsDiffResetBtn?.addEventListener("click", ()=>{
      if (srsDiffMinEl) srsDiffMinEl.value = "1";
      if (srsDiffMaxEl) srsDiffMaxEl.value = "10";
      normalizeSrsDiffRange();
      if (srsDiffEnabled) buildList();
    });

    srsDiffSelectBtn?.addEventListener("click", ()=>{
      // Select all items that match the current filters (including difficulty),
      // without clearing any existing selection.
      if (!srsDiffEnabled) return;
      normalizeSrsDiffRange();
      selectAllMatchingCurrentFilters();
    });

    saveBtn?.addEventListener("click", () => {
      // Manual save: creates a resumable session for later.
      saveSessionSnapshot();
      hasManualSave = true;

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

    quitBtn?.addEventListener("click", quitSession);

    completeQuitBtnEl?.addEventListener("click", quitSession);

    wrongBtn?.addEventListener("click", markWrong);
    rightBtn?.addEventListener("click", markRight);
    nextBtn?.addEventListener("click", nextAfterWrong);

    undoBtn?.addEventListener("click", undoLast);

    refreshSelectedCount();
  };

  window.App.Cram = Cram;
})();
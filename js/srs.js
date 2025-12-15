(function(){
  window.App = window.App || {};
  const { Utils, Storage, Tooltip, CONST } = window.App;

  const SRS = {};
  let overlayEl, openBtn, quitBtn;
  let cardEl, wrongBtn, rightBtn, undoBtn, nextBtn;
  let progressEl, scoreEl, flipHintEl;
  let modeGrammarBtn, modeSentencesBtn, examplesPerGrammarInput, examplesAllBtn;
  let statsBackdropEl, statsCloseBtn, statsSummaryEl, statsGraphEl, statsBtn;
  let statsNewCountEl, statsReviewCountEl, statsStartNewBtn, statsReviewDueBtn, editFsrsBtn;
  let fsrsBackdropEl, fsrsCloseBtn, fsrsHintEl, fsrsAutoAdjustBtn, fsrsSaveBtn, fsrsResetBtn;
  let fsrsGrowthRateInput, fsrsLapsePenaltyInput, fsrsDiffUpInput, fsrsDiffDownInput, fsrsInitStabGoodInput, fsrsInitStabBadInput, fsrsMaxIntervalInput;
  let fsrsRetireEnabledInput, fsrsRetireAfterDaysInput;
  let fsrsModalSnapshot = null;
  let fsrsReturnToStats = false;
  let toggleBackdropEl, toggleKeepBtn, togglePullTodayBtn, toggleKnownBtn, toggleDeleteBtn, toggleCancelBtn, toggleStatsEl;
  let pendingToggleKey = null;
  let pendingToggleButtons = [];
  let sessionType = "due"; // "due" or "new"

  function todayYmd(){
    return Utils.dateToYMD(new Date());
  }
  function addDays(ymd, days){
    const d = Utils.ymdToDate(ymd);
    d.setDate(d.getDate() + days);
    return Utils.dateToYMD(d);
  }

  let isOpen = false;
  let deck = [];
  const answeredOnceThisSession = new Set();
  let showingBack = false;
  let awaitingNext = false;
  let wrongCount = 0;
  let rightCount = 0;
  let totalInitial = 0;

  let undoState = null; // last pre-answer snapshot for UNDO

  let grammarMap = null; // grammarKey -> gp

  function clamp(n, min, max){
    const x = Number(n);
    if (!Number.isFinite(x)) return min;
    return Math.max(min, Math.min(max, x));
  }


  function ensureSrsConfig(){
    const ud = Storage.userData || (Storage.userData = {});
    if (!ud.srs || typeof ud.srs !== "object") ud.srs = {};
    const srs = ud.srs;
    if (!srs.cardsByKey || typeof srs.cardsByKey !== "object") srs.cardsByKey = {};
    if (!Array.isArray(srs.grammarKeys)) srs.grammarKeys = [];
    srs.grammarKeys = srs.grammarKeys.map(String);
    if (srs.mode !== "grammar" && srs.mode !== "sentences") srs.mode = "grammar";
    const eg = Number(srs.examplesPerGrammar || 3);
    srs.examplesPerGrammar = Number.isFinite(eg) ? Math.max(1, Math.min(10, eg)) : 3;
    srs.examplesPerGrammarAll = !!srs.examplesPerGrammarAll;

    // FSRS tuning (simple parameters used by applyReview)
    if (!srs.fsrsSettings || typeof srs.fsrsSettings !== "object") srs.fsrsSettings = {};
    const fs = srs.fsrsSettings;
    const num = (v, d)=> (typeof v === "number" && Number.isFinite(v)) ? v : d;
    fs.growthRate = clamp(num(fs.growthRate, 0.25), 0.01, 1);
    fs.lapsePenalty = clamp(num(fs.lapsePenalty, 0.5), 0.05, 1);
    fs.diffUp = clamp(num(fs.diffUp, 0.5), 0, 5);
    fs.diffDown = clamp(num(fs.diffDown, 0.1), 0, 5);
    fs.initStabilityGood = clamp(num(fs.initStabilityGood, 2.5), 0.1, 50);
    fs.initStabilityBad = clamp(num(fs.initStabilityBad, 1.0), 0.1, 50);
    fs.maxInterval = clamp(num(fs.maxInterval, 3650), 1, 99999);
    
    fs.retireEnabled = !!fs.retireEnabled;
    fs.retireAfterDays = clamp(num(fs.retireAfterDays, 365), 1, 99999);
return srs;
  }

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  function intervalDaysFromCard(card){
    if (!card || !card.last || !card.due) return 0;
    const lastDate = Utils.ymdToDate(card.last);
    const dueDate = Utils.ymdToDate(card.due);
    const days = Math.round((dueDate.getTime() - lastDate.getTime()) / ONE_DAY_MS);
    return Number.isFinite(days) ? Math.max(0, days) : 0;
  }

  function isAutoRetiredByInterval(card, srsCfg){
    const srs = srsCfg || ensureSrsConfig();
    const fs = (srs && srs.fsrsSettings) ? srs.fsrsSettings : {};
    if (!fs || !fs.retireEnabled) return false;
    const limit = Number(fs.retireAfterDays);
    if (!Number.isFinite(limit) || limit <= 0) return false;
    const ivl = intervalDaysFromCard(card);
    return ivl > limit;
  }

  function isRetiredCard(card, srsCfg){
    // Manual retire ("known") always wins, regardless of the interval setting.
    if (card && card.known === true) return true;
    return isAutoRetiredByInterval(card, srsCfg);
  }

  function shuffleInPlace(arr){
    for (let i = arr.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
  }

  function buildGrammarMap(){
    if (grammarMap) return grammarMap;
    grammarMap = new Map();
    const flat = window.App.State?.flat || [];
    flat.forEach(gp=>{
      const key = `${gp.level}_${gp.grammar}`;
      if (!grammarMap.has(key)) grammarMap.set(key, gp);
    });
    return grammarMap;
  }

  function getGrammarPoint(grammarKey){
    const map = buildGrammarMap();
    return map.get(grammarKey) || null;
  }

  function getUsableNotes(grammarKey){
    const notes = window.App.Notes ? window.App.Notes.getNotes(grammarKey) : [];
    return notes
      .map(n=>({ jpHtml: n.jpHtml || "", enHtml: n.enHtml || "" }))
      .filter(n => Utils.htmlToText(n.jpHtml).length > 0);
  }


  function getCard(grammarKey){
    const srs = ensureSrsConfig();
    const key = String(grammarKey || "");
    if (!key) return null;
    if (!srs.cardsByKey || typeof srs.cardsByKey !== "object") srs.cardsByKey = {};
    let card = srs.cardsByKey[key];
    if (!card){
      const today = todayYmd();
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      card = {
        due: today,
        // New cards should be due "as of now" (not midnight).
        dueMinutes: nowMinutes,
        last: null,
        lastMinutes: null,
        stability: 0,
        difficulty: 5,
        reps: 0,
        lapses: 0,
        performance: 0,
        known: false
      };
          srs.cardsByKey[key] = card;
    } else {
      if (typeof card.dueMinutes !== "number" || !Number.isFinite(card.dueMinutes)){
        card.dueMinutes = 0;
      }
      if (typeof card.lastMinutes !== "number" || !Number.isFinite(card.lastMinutes)){
        card.lastMinutes = null;
      }
      if (typeof card.performance !== "number" || !Number.isFinite(card.performance)){
        card.performance = 0;
      }
      if (typeof card.known !== "boolean"){
        card.known = false;
      }
    }
    return card;
  }

  function applyReview(grammarKey, isRight){
    const srs = ensureSrsConfig();
    const key = String(grammarKey || "");
    if (!key) return;
    const card = getCard(key);
    const today = todayYmd();

    // Capture "newness" BEFORE we mutate the card.
    const wasNew = (!card.last) && (Number(card.reps || 0) === 0);

    let stability = Number(card.stability || 0) || 0;
    let difficulty = Number(card.difficulty || 5) || 5;
    let reps = Number(card.reps || 0) || 0;
    let lapses = Number(card.lapses || 0) || 0;

    const grade = isRight ? 1 : 0; // 0 = wrong, 1 = right

    const fs = (srs && srs.fsrsSettings) ? srs.fsrsSettings : {};
    const growthRate = clamp(Number(fs.growthRate), 0.01, 1);
    const lapsePenalty = clamp(Number(fs.lapsePenalty), 0.05, 1);
    const diffUp = clamp(Number(fs.diffUp), 0, 5);
    const diffDown = clamp(Number(fs.diffDown), 0, 5);
    const initGood = clamp(Number(fs.initStabilityGood), 0.1, 50);
    const initBad = clamp(Number(fs.initStabilityBad), 0.1, 50);
    const maxInterval = clamp(Number(fs.maxInterval), 1, 99999);

    let interval = 1;

    if (!reps){
      reps = 1;
      if (grade === 0){
        lapses = 1;
        stability = initBad;
        difficulty = clamp(difficulty + 1, 1, 10);
        interval = 1;
      } else {
        stability = initGood;
        difficulty = clamp(difficulty, 1, 10);
        interval = 1;
      }
    } else {
      reps += 1;
      if (grade === 0){
        lapses += 1;
        difficulty = clamp(difficulty + diffUp, 1, 10);
        stability = Math.max(1, stability * lapsePenalty);
        interval = 1;
      } else {
        difficulty = clamp(difficulty - diffDown, 1, 10);
        const factor = 1 + growthRate * (11 - difficulty) / 10;
        stability = Math.max(1, stability * factor);
        interval = Math.round(stability);
      }
    }

    interval = Math.max(1, Math.min(maxInterval, Math.round(interval)));

    card.stability = stability;
    card.difficulty = difficulty;
    card.reps = reps;
    card.lapses = lapses;

    // Track last review time-of-day and schedule due time within that future day.
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    card.last = today;
    card.lastMinutes = nowMinutes;

    const dueYmd = addDays(today, interval);
    card.due = dueYmd;
    card.dueMinutes = nowMinutes;

    // Update score index (uses the same emoji ladder as the self-rating system)
    const currentScore = (typeof card.performance === "number" && Number.isFinite(card.performance))
      ? Math.max(CONST.SCORE_MIN, Math.min(CONST.SCORE_MAX, Math.round(card.performance)))
      : CONST.SCORE_MIN;

    if (wasNew){
      // First ever result sets the starting rung.
      card.performance = (grade === 1) ? Math.min(CONST.SCORE_MAX, CONST.SCORE_MIN + 1) : CONST.SCORE_MIN;
    } else {
      // Normal progression: right moves up one rung, wrong moves down one rung.
      const delta = (grade === 1) ? 1 : -1;
      card.performance = Math.max(CONST.SCORE_MIN, Math.min(CONST.SCORE_MAX, currentScore + delta));
    }

    srs.cardsByKey[key] = card;
    Storage.saveUserData();
  }

  function buildDeck(){
    const srs = ensureSrsConfig();
    const keys = Array.isArray(srs.grammarKeys) ? srs.grammarKeys : [];
    deck = [];
    wrongCount = 0;
    rightCount = 0;
    showingBack = false;
    awaitingNext = false;
    totalInitial = 0;

    if (!keys.length) return;

    const mode = srs.mode === "sentences" ? "sentences" : "grammar";
    const today = todayYmd();

    const sourceKeys = [];
    if (sessionType === "new"){
      keys.forEach(grammarKey=>{
        const card = getCard(grammarKey);
        if (isRetiredCard(card, srs)) return;
        const reps = Number(card.reps || 0);
        if (!reps) sourceKeys.push(grammarKey);
      });
    } else {
      // collect grammar keys that are due (or overdue) including time-of-day
      const now = new Date();
      const todayDate = Utils.ymdToDate(today);
      const nowMinutes = now.getHours() * 60 + now.getMinutes();

      keys.forEach(grammarKey=>{
        const card = getCard(grammarKey);
        if (isRetiredCard(card, srs)) return;
        const dueYmd = card.due || today;
        const dueDate = Utils.ymdToDate(dueYmd);
        const dueMinutes = (typeof card.dueMinutes === "number" && Number.isFinite(card.dueMinutes))
          ? card.dueMinutes
          : 0;

        let isDue = false;
        if (dueDate < todayDate){
          isDue = true;
        } else if (dueDate > todayDate){
          isDue = false;
        } else {
          // same calendar day
          isDue = dueMinutes <= nowMinutes;
        }

        if (isDue) sourceKeys.push(grammarKey);
      });
    }

    if (!sourceKeys.length) return;

    if (mode === "sentences"){
      const all = !!srs.examplesPerGrammarAll;
      let itemsPerGrammar = 3;

      if (!all){
        const raw = Number(examplesPerGrammarInput?.value || srs.examplesPerGrammar || 3);
        itemsPerGrammar = Number.isFinite(raw) ? Math.max(1, Math.min(10, raw)) : 3;
        srs.examplesPerGrammar = itemsPerGrammar;
        if (examplesPerGrammarInput) examplesPerGrammarInput.value = String(itemsPerGrammar);
      } else {
        // "ALL" ignores the numeric cap; we just take every usable sentence for each grammar point.
        itemsPerGrammar = Number.POSITIVE_INFINITY;
        if (examplesPerGrammarInput){
          const v = Number(srs.examplesPerGrammar || 3);
          const safe = Number.isFinite(v) ? Math.max(1, Math.min(10, v)) : 3;
          examplesPerGrammarInput.value = String(safe);
        }
      }

      sourceKeys.forEach(grammarKey=>{
        const gp = getGrammarPoint(grammarKey);
        if (!gp) return;
        const usable = getUsableNotes(grammarKey);
        if (!usable.length) return;
        const picks = usable.slice();
        shuffleInPlace(picks);
        picks.slice(0, itemsPerGrammar).forEach(n=>{
          deck.push({
            type:"sentence",
            grammarKey,
            gp,
            jpHtml:n.jpHtml,
            enHtml:n.enHtml
          });
        });
      });

      shuffleInPlace(deck);
      totalInitial = deck.length;
    } else {
      sourceKeys.forEach(grammarKey=>{
        const gp = getGrammarPoint(grammarKey);
        if (!gp) return;
        const usable = getUsableNotes(grammarKey);
        if (!usable.length) return;
        deck.push({
          type:"grammar",
          grammarKey,
          gp
        });
      });
      shuffleInPlace(deck);
      totalInitial = deck.length;
    }
  }

  function updateStats(){
    if (!progressEl || !scoreEl) return;
    const srs = Storage.userData?.srs || {};
    const keys = Array.isArray(srs.grammarKeys) ? srs.grammarKeys : [];
    if (!keys.length){
      progressEl.textContent = "No SRS items yet.";
    } else if (!totalInitial){
      progressEl.textContent = "No usable sentences for current mode.";
    } else {
      progressEl.textContent = `Remaining ${deck.length} / ${totalInitial}`;
    }
    scoreEl.textContent = `Wrong ${wrongCount} • Right ${rightCount}`;
  }

  function cloneDeckCardForUndo(c){
    if (!c) return null;
    const out = {
      type: c.type,
      grammarKey: c.grammarKey,
      gp: c.gp
    };
    if (c.jpHtml != null) out.jpHtml = c.jpHtml;
    if (c.enHtml != null) out.enHtml = c.enHtml;
    if (c._exampleIndex != null) out._exampleIndex = c._exampleIndex;
    if (c._example){
      out._example = { jpHtml: c._example.jpHtml || "", enHtml: c._example.enHtml || "" };
    }
    return out;
  }

  function snapshotForUndo(extra){
    return {
      deck: (deck || []).map(cloneDeckCardForUndo),
      wrongCount,
      rightCount,
      totalInitial,
      showingBack,
      awaitingNext,
      answeredOnce: Array.from(answeredOnceThisSession || []).map(String),
      reviewUndo: extra && extra.reviewUndo ? extra.reviewUndo : null
    };
  }

  function canUndo(){
    return !!undoState;
  }

  function setUndoEnabled(){
    if (!undoBtn) return;
    undoBtn.disabled = !canUndo();
  }

  function pushUndoSnapshot(extra){
    undoState = snapshotForUndo(extra);
    setUndoEnabled();
  }

  function makeReviewUndo(grammarKey){
    const srs = ensureSrsConfig();
    const key = String(grammarKey || "");
    if (!key) return null;
    const cardsByKey = srs.cardsByKey || (srs.cardsByKey = {});
    const existed = Object.prototype.hasOwnProperty.call(cardsByKey, key);
    const prevCard = existed ? jsonClone(cardsByKey[key]) : null;
    return { grammarKey: key, existed, prevCard };
  }

  function restoreReviewUndo(reviewUndo){
    if (!reviewUndo) return;
    const srs = ensureSrsConfig();
    const key = String(reviewUndo.grammarKey || "");
    if (!key) return;
    const cardsByKey = srs.cardsByKey || (srs.cardsByKey = {});
    if (reviewUndo.existed){
      cardsByKey[key] = reviewUndo.prevCard ? reviewUndo.prevCard : cardsByKey[key];
    } else {
      delete cardsByKey[key];
    }
    Storage.saveUserData();
  }

  function jsonClone(obj){
    try{ return JSON.parse(JSON.stringify(obj)); }catch(e){ return obj ? { ...obj } : obj; }
  }

  function undoLast(){
    if (!undoState) return;
    const s = undoState;
    undoState = null;

    // Restore SRS card state first so badges/schedule reflect immediately.
    restoreReviewUndo(s.reviewUndo);

    deck = (s.deck || []).map(c => {
      const out = { type: c.type, grammarKey: c.grammarKey, gp: c.gp };
      if (c.jpHtml != null) out.jpHtml = c.jpHtml;
      if (c.enHtml != null) out.enHtml = c.enHtml;
      if (c._exampleIndex != null) out._exampleIndex = c._exampleIndex;
      if (c._example) out._example = { jpHtml: c._example.jpHtml || "", enHtml: c._example.enHtml || "" };
      return out;
    });

    wrongCount = Number(s.wrongCount || 0);
    rightCount = Number(s.rightCount || 0);
    totalInitial = Number(s.totalInitial || 0);
    showingBack = !!s.showingBack;
    awaitingNext = !!s.awaitingNext;

    answeredOnceThisSession.clear();
    (s.answeredOnce || []).forEach(k => answeredOnceThisSession.add(String(k)));

    renderCard();
    setUndoEnabled();
  }

  function renderEmptyCard(){
    if (!cardEl) return;
    const srs = Storage.userData?.srs || {};
    const keys = Array.isArray(srs.grammarKeys) ? srs.grammarKeys : [];
    if (!keys.length){
      cardEl.innerHTML = `
        <div class="cram-back">
          <div class="jp">No SRS items yet.</div>
          <div class="en">Use the ＋ buttons next to grammar points to add them to SRS.</div>
        </div>
      `;
    } else {
      cardEl.innerHTML = `
        <div class="cram-back">
          <div class="jp">No sentences available.</div>
          <div class="en">Add example sentences to these grammar points to start SRS practice.</div>
        </div>
      `;
    }
    if (flipHintEl) flipHintEl.hidden = true;
  }

  function renderCompletedCard(){
    if (!cardEl) return;
    cardEl.innerHTML = `
      <div class="cram-back">
        <div class="jp">SRS session complete.</div>
        <div class="en">Wrong ${wrongCount} • Right ${rightCount}</div>
      </div>
    `;
    if (flipHintEl) flipHintEl.hidden = true;
  }


  function setCompletionUI(isComplete){
    const done = !!isComplete;

    if (quitBtn) quitBtn.hidden = done;
    if (completeQuitRowEl) completeQuitRowEl.hidden = !done;

    if (wrongBtn) wrongBtn.hidden = done;
    if (rightBtn) rightBtn.hidden = done;
    if (nextBtn) nextBtn.hidden = true;
  }

  
  function getPerformanceFor(grammarKey){
    const card = getCard(grammarKey);
    return (card && typeof card.performance === "number" && Number.isFinite(card.performance))
      ? Math.max(CONST.SCORE_MIN, Math.min(CONST.SCORE_MAX, Math.round(card.performance)))
      : CONST.SCORE_MIN;
  }

  
  
  function perfMessage(score){
    // Human-friendly status based on the emoji rung (0..SCORE_MAX)
    const s = (typeof score === "number" && Number.isFinite(score)) ? score : CONST.SCORE_MIN;
    const pct = (s - CONST.SCORE_MIN) / Math.max(1, (CONST.SCORE_MAX - CONST.SCORE_MIN));

    if (pct >= 0.85) return { headline: "Locked in", short: "Locked in", sub: "This looks well-learned. You’re reliably hitting it." };
    if (pct >= 0.65) return { headline: "Going well", short: "Going well", sub: "Mostly solid. Keep the streak going to fully cement it." };
    if (pct >= 0.45) return { headline: "Getting there", short: "Getting there", sub: "Progress is building, but it still needs a few clean wins." };
    if (pct >= 0.25) return { headline: "A bit shaky", short: "A bit shaky", sub: "It’s slipping in and out. A short extra pass will help." };
    if (pct >= 0.10) return { headline: "Needs work", short: "Needs work", sub: "This is missing often. Focus on it for a couple of sessions." };
    return { headline: "High priority", short: "High priority", sub: "This one isn’t sticking yet. Give it targeted attention." };
  }

  function formatDueLabel(card){
    const due = card && card.due ? card.due : null;
    if (!due) return "—";
    const mins = (typeof card.dueMinutes === "number" && Number.isFinite(card.dueMinutes)) ? card.dueMinutes : 0;
    const h = Math.floor(mins/60);
    const m = mins%60;
    const ampm = h >= 12 ? "pm" : "am";
    const hr12 = ((h + 11) % 12) + 1;
    const mm = String(m).padStart(2,"0");
    return `${due} ${hr12}:${mm}${ampm}`;
  }

  function renderToggleStats(grammarKey){
    if (!toggleStatsEl) return;
    const srs = ensureSrsConfig();
    const card = getCard(grammarKey);
    const score = scoreFromCard(card);
    const reps = (card && typeof card.reps === "number" && Number.isFinite(card.reps)) ? card.reps : 0;
    const lapses = (card && typeof card.lapses === "number" && Number.isFinite(card.lapses)) ? card.lapses : 0;
    const diff = (card && typeof card.difficulty === "number" && Number.isFinite(card.difficulty)) ? card.difficulty : 0;
    const stab = (card && typeof card.stability === "number" && Number.isFinite(card.stability)) ? card.stability : 0;

    const intervalDays = (card && card.last && card.due)
      ? Math.max(0, Math.round((Utils.ymdToDate(card.due) - Utils.ymdToDate(card.last)) / 86400000))
      : null;

    const isNew = !!card && (!card.last) && (reps === 0);
    const isKnown = !!(card && card.known === true);
    const isAutoRetired = (!isKnown) && isAutoRetiredByInterval(card, srs);

    let msg;
    if (isKnown){
      msg = { headline: "Known", short: "Known", sub: "Retired (won’t appear in SRS sessions)." };
    } else if (isAutoRetired){
      const ivl = intervalDaysFromCard(card);
      msg = { headline: "Retired", short: "Retired", sub: `Retired automatically (interval ${ivl} days).` };
    } else if (isNew){
      msg = { headline: "New in SRS", short: "New in SRS", sub: "Added to SRS, waiting for its first review." };
    } else {
      msg = perfMessage(score);
    }

    const tips = {
      status:
        "A quick summary label based on your Emoji Score.\n\n" +
        "Possible states:\n" +
        "• New in SRS — added, but not reviewed yet\n" +
        "• Known — retired manually (trophy)\n" +
        "• Retired — retired by interval (trophy)\n" +
        "• High priority — missing often (very low score)\n" +
        "• Needs work — low score; still unreliable\n" +
        "• A bit shaky — mixed results\n" +
        "• Getting there — improving, but not consistent yet\n" +
        "• Going well — mostly solid\n" +
        "• Locked in — very reliable",
      emoji: "Your position on the emoji ladder. Higher generally means it’s sticking better.",
      due: "When this item is scheduled to be reviewed next.",
      interval: "How many days this item is currently scheduled out for (due date minus last review date).",
      retired: "Retired cards are removed from SRS sessions and shown as a trophy.",
      reviews: "How many SRS reviews you’ve done for this grammar point.",
      misses: "How many times you marked it wrong in SRS.",
      stability: "FSRS estimate of how long you’ll remember it. Higher = longer.",
      difficulty: "FSRS estimate of how hard this item is for you. Higher = harder."
    };

    const retiredLabel = isKnown ? "Known" : (isAutoRetired ? "By interval" : "No");

    toggleStatsEl.innerHTML = `
      <div class="headline">${Utils.escapeHtml(msg.headline)}</div>
      <div class="sub">${Utils.escapeHtml(msg.sub)}</div>
      <div class="grid">
        <div class="k" data-tip="${Utils.escapeHtml(tips.status)}">SRS status</div><div class="v">${Utils.escapeHtml(msg.headline)}</div>
        <div class="k" data-tip="${Utils.escapeHtml(tips.emoji)}">Emoji Score</div><div class="v">${score + 1}/${CONST.SCORE_MAX + 1}</div>
        <div class="k" data-tip="${Utils.escapeHtml(tips.due)}">Due</div><div class="v">${Utils.escapeHtml(formatDueLabel(card))}</div>
        <div class="k" data-tip="${Utils.escapeHtml(tips.interval)}">Interval (days)</div><div class="v">${intervalDays === null ? "—" : intervalDays}</div>
        <div class="k" data-tip="${Utils.escapeHtml(tips.retired)}">Retired</div><div class="v">${Utils.escapeHtml(retiredLabel)}</div>
        <div class="k" data-tip="${Utils.escapeHtml(tips.reviews)}">Reviews</div><div class="v">${reps}</div>
        <div class="k" data-tip="${Utils.escapeHtml(tips.misses)}">Misses</div><div class="v">${lapses}</div>
        <div class="k" data-tip="${Utils.escapeHtml(tips.stability)}">Stability</div><div class="v">${stab ? stab.toFixed(2) : "0.00"}</div>
        <div class="k" data-tip="${Utils.escapeHtml(tips.difficulty)}">Difficulty</div><div class="v">${diff ? diff.toFixed(2) : "0.00"}</div>
      </div>
    `;

    // Wire tooltips for the stat keys.
    toggleStatsEl.querySelectorAll('.k[data-tip]').forEach((k)=>{
      k.addEventListener("mousemove", (ev)=>Tooltip.show(k.dataset.tip, ev.clientX, ev.clientY));
      k.addEventListener("mouseleave", Tooltip.hide);
    });

    // Only show “Pull next review to today” when the item is currently in SRS.
    // Disable it for brand-new cards (no review history yet).
    const inSrs = Array.isArray(Storage.userData?.srs?.grammarKeys) && Storage.userData.srs.grammarKeys.includes(String(grammarKey));

    if (togglePullTodayBtn){
      const canPull = inSrs && reps > 0;
      togglePullTodayBtn.hidden = !inSrs;
      togglePullTodayBtn.disabled = !canPull;
      togglePullTodayBtn.title = canPull
        ? "Force this item to be due right now"
        : "Available after your first SRS review";
    }

    if (toggleKnownBtn){
      toggleKnownBtn.hidden = !inSrs;
      if (inSrs){
        const knownNow = !!(card && card.known === true);
        toggleKnownBtn.disabled = knownNow;
        toggleKnownBtn.textContent = knownNow ? "Known ✓" : "Mark as known";
        toggleKnownBtn.title = knownNow
          ? "This card is retired as known"
          : "Retire this card (trophy) and remove it from SRS sessions";
      }
    }
  }

function getEmojiForKey(grammarKey){
    const srs = ensureSrsConfig();
    const card = getCard(grammarKey);
    const score = scoreFromCard(card);
    const lvl = (card && typeof card.reps === "number" && Number.isFinite(card.reps)) ? Math.max(0, Math.min(99, card.reps)) : 0;

    // Manual retire ("known") should always show the trophy, even if the card has no review history yet.
    if (card && card.known === true){
      return {
        emoji: "🏆",
        title: "Known · Retired"
      };
    }

    const isNew = !!card && (!card.last) && (lvl === 0);
    if (isNew){
      return {
        emoji: "🆕",
        title: "New in SRS · Ready for its first review"
      };
    }

    if (isAutoRetiredByInterval(card, srs)){
      const ivl = intervalDaysFromCard(card);
      return {
        emoji: "🏆",
        title: `Retired · Interval ${ivl} days`
      };
    }

    return {
      emoji: emojiFromScore(score),
      title: `${perfMessage(score).headline} · Level ${lvl} · ${perfMessage(score).short}`
    };
  }


  function scoreFromCard(card){
    const n = (card && typeof card.performance === "number" && Number.isFinite(card.performance))
      ? Math.round(card.performance)
      : CONST.SCORE_MIN;
    return Math.max(CONST.SCORE_MIN, Math.min(CONST.SCORE_MAX, n));
  }

  function emojiFromScore(score){
    // Same emoji set as self-rating, but ordered for a more intuitive "new → waxing → full → sun" progression.
    const LADDER = [
      "🌑","🌒","🌓","🌔","🌝","🌖","🌗","🌘",
      "💫","⭐","🌟","🌌","🌃","🌆","🌇","☁️","🌥️","🌤️","🌞"
    ];
    const s = Math.max(CONST.SCORE_MIN, Math.min(CONST.SCORE_MAX, score));
    return LADDER[s] || LADDER[CONST.SCORE_MIN];
  }



function buildSrsEmojiBadge(grammarKey){
    const info = getEmojiForKey(grammarKey);
    const span = document.createElement("span");
    span.className = "srs-emoji-badge";
    span.textContent = info.emoji || "";
    span.title = info.title || "";
    return span;
  }

  function getCardFontScale(){
    const settings = window.App.Storage?.settings || {};
    const s = typeof settings.cardFontScale === "number" && Number.isFinite(settings.cardFontScale)
      ? settings.cardFontScale
      : 1;
    return Math.max(0.6, Math.min(1.6, s));
  }

  function setCardFontScale(next){
    const settings = window.App.Storage?.settings || {};
    const clamped = Math.max(0.6, Math.min(1.6, next));
    settings.cardFontScale = clamped;
    window.App.Storage.saveSettings();
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
        const next = setCardFontScale(s - 0.1);
        applyCardFontScale(root);
      });
      inc.addEventListener("click",(ev)=>{
        ev.stopPropagation();
        const s = getCardFontScale();
        const next = setCardFontScale(s + 0.1);
        applyCardFontScale(root);
      });
    }
    applyCardFontScale(root);
  }

function renderCard(){
    if (!cardEl) return;

    if (!deck.length){
      setCompletionUI(!!totalInitial);
      if (!totalInitial){
        renderEmptyCard();
      } else {
        renderCompletedCard();
      }
      updateStats();
      return;
    }

    setCompletionUI(false);

    const c = deck[0];
    const gp = c.gp;
    const grammarKey = c.grammarKey;

    const gpHtml = gp.primaryLink
      ? `<a href="${gp.primaryLink}" target="_blank" rel="noopener">${Utils.escapeHtml(gp.grammar)}</a>`
      : Utils.escapeHtml(gp.grammar);

    let jpHtml = "";
    let enHtml = "";

    // Persist the chosen example so front/back stay in sync, and so we can cycle examples on the back.
    if (c.type === "grammar"){
      if (!c._example){
        const usable = getUsableNotes(grammarKey);
        if (!usable.length){
          c._example = {
            jpHtml: Utils.escapeHtml(gp.grammar),
            enHtml: Utils.escapeHtml(gp.meaning || "")
          };
        } else {
          const picks = usable.slice();
          shuffleInPlace(picks);
          const n = picks[0];
          c._example = { jpHtml: n.jpHtml || "", enHtml: n.enHtml || "" };
        }
      }
      jpHtml = c._example.jpHtml || "";
      enHtml = c._example.enHtml || "";
    } else {
      if (showingBack && c._example && Utils.htmlToText(c._example.jpHtml || "").length > 0){
        jpHtml = c._example.jpHtml || "";
        enHtml = c._example.enHtml || "";
      } else {
        jpHtml = c.jpHtml || "";
        enHtml = c.enHtml || "";
      }
    }


    const cardsByKey = (Storage.userData?.srs && Storage.userData.srs.cardsByKey) || {};
    const cardState = cardsByKey[grammarKey];
    const srsLevel = cardState && Number(cardState.reps || 0) > 0
      ? Math.max(1, Math.min(99, Number(cardState.reps || 0)))
      : 0;
    const levelBadge = srsLevel ? `<div class="srs-level-badge">${srsLevel}</div>` : "";
const usable = showingBack ? getUsableNotes(grammarKey) : [];
const usableCount = showingBack ? usable.length : 0;
let navCountText = "";
if (showingBack && usableCount > 1){
  const base = c._example ? c._example : { jpHtml: jpHtml || "", enHtml: enHtml || "" };
  const baseSig = `${base.jpHtml || ""}||${base.enHtml || ""}`;
  let idx = Number.isFinite(c._exampleIndex) ? c._exampleIndex : -1;
  if (idx < 0){
    idx = usable.findIndex(n => `${n.jpHtml || ""}||${n.enHtml || ""}` === baseSig);
  }
  if (idx < 0) idx = 0;
  c._exampleIndex = idx;
  navCountText = `${idx + 1}/${usableCount}`;
}
const navHtml = (showingBack && usableCount > 1) ? `
  <div class="card-ex-nav">
    <span class="card-ex-count">${navCountText}</span>
    <button type="button" class="card-ex-btn" data-ex-nav="prev" aria-label="Previous example">&lt;</button>
    <button type="button" class="card-ex-btn" data-ex-nav="next" aria-label="Next example">&gt;</button>
  </div>
` : "";

    if (!showingBack){
      cardEl.innerHTML = `
        <div class="cram-front">
          ${levelBadge}
          <div class="cram-front-inner">${jpHtml}</div>
        </div>
      `;
    } else {
      cardEl.innerHTML = `
        <div class="cram-back">
          ${levelBadge}
          <div class="jp">${jpHtml}</div>
          <div class="en">${enHtml}</div>
          <div class="gp level-${gp.level}">${gpHtml}</div>
          <div class="desc">${Utils.escapeHtml(gp.meaning || "")}</div>
          ${navHtml}
        </div>
      `;
    }

    attachCardFontControls(cardEl);

    if (flipHintEl){
      flipHintEl.hidden = false;
      if (!showingBack){
        flipHintEl.textContent = "Click the card to flip.";
      } else {
        flipHintEl.textContent = usableCount > 1 ? "Use < > to browse examples." : "Use Wrong/Right to continue.";
      }
    }

    cardEl.onclick = () => {
  if (!deck.length) return;
  if (!showingBack){
    showingBack = true;
    renderCard();
  }
};

if (showingBack && usableCount > 1){
  const current = deck[0];
  const prevBtn = cardEl.querySelector('[data-ex-nav="prev"]');
  const nextBtn = cardEl.querySelector('[data-ex-nav="next"]');
  if (prevBtn){
    prevBtn.onclick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      stepBackExample(current, -1);
    };
  }
  if (nextBtn){
    nextBtn.onclick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      stepBackExample(current, +1);
    };
  }
}

    syncActionButtons();
    updateStats();
  }

  function stepBackExample(card, dir){
  if (!card) return;
  const grammarKey = card.grammarKey;
  const usable = getUsableNotes(grammarKey);
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

  // Keep the user on the back; just swap the example content.
  renderCard();
}


  function syncActionButtons(){
    setUndoEnabled();
    if (!wrongBtn || !rightBtn || !nextBtn) return;
    const hasDeck = deck.length > 0;
    if (!hasDeck){
      wrongBtn.disabled = true;
      rightBtn.disabled = true;
      nextBtn.disabled = true;
      nextBtn.hidden = true;
      return;
    }
    if (awaitingNext){
      wrongBtn.hidden = true;
      rightBtn.hidden = true;
      nextBtn.hidden = false;
      nextBtn.disabled = false;
    } else {
      wrongBtn.hidden = false;
      rightBtn.hidden = false;
      wrongBtn.disabled = false;
      rightBtn.disabled = false;
      nextBtn.hidden = true;
    }
  }

  function markWrong(){
    if (!deck.length || awaitingNext) return;
    const current = deck[0];

    const reviewUndo = !answeredOnceThisSession.has(current.grammarKey) ? makeReviewUndo(current.grammarKey) : null;
    pushUndoSnapshot({ reviewUndo });

    // Score should only change once per grammar point, based on the first answer given.
    if (!answeredOnceThisSession.has(current.grammarKey)){
      answeredOnceThisSession.add(current.grammarKey);
      applyReview(current.grammarKey, false);
    }

    wrongCount++;
    awaitingNext = true;
    showingBack = true;
    renderCard();
  }

  function nextAfterWrong(){
    if (!deck.length || !awaitingNext) return;
    const c = deck.shift();
    if (c) delete c._example;
    deck.push(c);
    shuffleInPlace(deck);
    awaitingNext = false;
    showingBack = false;
    renderCard();
  }

  function markRight(){
    if (!deck.length || awaitingNext) return;
    const current = deck[0];

    const reviewUndo = !answeredOnceThisSession.has(current.grammarKey) ? makeReviewUndo(current.grammarKey) : null;
    pushUndoSnapshot({ reviewUndo });

    // Score should only change once per grammar point, based on the first answer given.
    if (!answeredOnceThisSession.has(current.grammarKey)){
      answeredOnceThisSession.add(current.grammarKey);
      applyReview(current.grammarKey, true);
    }
    rightCount++;
    const removed = deck.shift();
    if (removed) delete removed._example;
    showingBack = false;
    if (!deck.length){
      setCompletionUI(!!totalInitial);
      renderCompletedCard();
      syncActionButtons();
      updateStats();
    } else {
      renderCard();
    }
  }

  function applyModeToUi(){
    const srs = ensureSrsConfig();
    const mode = srs.mode;
    if (modeGrammarBtn){
      modeGrammarBtn.classList.toggle("active", mode === "grammar");
    }
    if (modeSentencesBtn){
      modeSentencesBtn.classList.toggle("active", mode === "sentences");
    }

    const disabled = mode !== "sentences";

    if (examplesPerGrammarInput){
      examplesPerGrammarInput.disabled = disabled;
      const group = examplesPerGrammarInput.closest(".srs-count-group");
      if (group) group.classList.toggle("disabled", disabled);
      if (!disabled){
        const v = srs.examplesPerGrammar;
        examplesPerGrammarInput.value = String(v);
      }
    }

    if (examplesAllBtn){
      examplesAllBtn.disabled = disabled;
      examplesAllBtn.classList.toggle("active", !disabled && !!srs.examplesPerGrammarAll);
    }
  }

  function setMode(mode){
    const srs = ensureSrsConfig();
    if (mode !== "grammar" && mode !== "sentences") return;
    srs.mode = mode;
    Storage.saveUserData();
    applyModeToUi();
    if (isOpen){
      buildDeck();
      renderCard();
    }
  }

  function examplesPerGrammarChanged(){
    const srs = ensureSrsConfig();
    if (!examplesPerGrammarInput) return;

    // If the user touches the number selector, assume they want the numeric option (not ALL).
    if (srs.examplesPerGrammarAll){
      srs.examplesPerGrammarAll = false;
    }

    const raw = Number(examplesPerGrammarInput.value || srs.examplesPerGrammar || 3);
    const v = Number.isFinite(raw) ? Math.max(1, Math.min(10, raw)) : 3;
    srs.examplesPerGrammar = v;
    examplesPerGrammarInput.value = String(v);
    Storage.saveUserData();
    applyModeToUi();

    if (srs.mode === "sentences" && isOpen){
      buildDeck();
      renderCard();
    }
  }

  function toggleAllExamples(){
    const srs = ensureSrsConfig();
    if (srs.mode !== "sentences") return;

    srs.examplesPerGrammarAll = !srs.examplesPerGrammarAll;
    Storage.saveUserData();
    applyModeToUi();

    if (isOpen){
      buildDeck();
      renderCard();
    }
  }

  function open(){
    if (!overlayEl) return;
    isOpen = true;
    answeredOnceThisSession.clear();
    undoState = null;
    setUndoEnabled();
    overlayEl.hidden = false;
    overlayEl.style.display = "block";
    applyModeToUi();
    buildDeck();
    if (!totalInitial){
      renderEmptyCard();
      updateStats();
      syncActionButtons();
    } else {
      renderCard();
    }
  }

  function close(){
    isOpen = false;
    answeredOnceThisSession.clear();
    undoState = null;
    setUndoEnabled();
    if (overlayEl){
      overlayEl.hidden = true;
      overlayEl.style.display = "none";
    }
    // Ensure the main list reflects the latest SRS state immediately.
    const ymd = document.querySelector("#viewDate")?.value || Utils.dateToYMD(new Date());
    window.App.Daily?.render?.(ymd);
  }

  SRS.addGrammarKey = (grammarKey) => {
    const key = String(grammarKey || "");
    if (!key) return false;
    const srs = ensureSrsConfig();
    if (!Array.isArray(srs.grammarKeys)) srs.grammarKeys = [];
    if (!srs.grammarKeys.includes(key)){
      srs.grammarKeys.push(key);

      // Create the card immediately so "Due" records the time you added it,
      // and so badges (🆕 / emoji ladder) can render consistently right away.
      getCard(key);

      Storage.saveUserData();
      if (isOpen){
        buildDeck();
        renderCard();
      }
      return true;
    }
    return false;
  };

  SRS.hasGrammarKey = (grammarKey) => {
    const srs = Storage.userData?.srs;
    const arr = srs && Array.isArray(srs.grammarKeys) ? srs.grammarKeys : [];
    return arr.includes(String(grammarKey || ""));
  };


  function buildForecast(days=7){
  const srs = ensureSrsConfig();
  const keys = Array.isArray(srs.grammarKeys) ? srs.grammarKeys : [];
  const today = todayYmd();
  const todayDate = Utils.ymdToDate(today);

  const buckets = [];
  for (let i = 0; i < days; i++){
    const d = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
    d.setDate(d.getDate() + i);
    buckets.push({
      ymd: Utils.dateToYMD(d),
      count: 0,
      hourly: {},
      overdue: 0,
      unknown: 0
    });
  }

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  let newCount = 0;

  keys.forEach((grammarKey)=>{
    const card = getCard(grammarKey);

    // Retired cards are treated as completed and do not appear in reviews.
    // This also prevents a manually-retired (known) card from being counted as "new".
    if (isRetiredCard(card, srs)){
      return;
    }

    const reps = card && typeof card.reps === "number" ? card.reps : 0;
    const hasHistory = !!(card && (reps > 0 || card.last || card.started));
    const isNewCard = !hasHistory;

    // Count "new" cards separately and DO NOT treat them as review cards.
    if (isNewCard){
      newCount += 1;
      return;
    }

    // From here on, we are dealing only with review cards
    const dueYmd = (card && card.due) ? card.due : today;
    const dueDate = Utils.ymdToDate(dueYmd);

    const offsetDays = Math.round((dueDate.getTime() - todayDate.getTime()) / ONE_DAY_MS);

    // Anything scheduled before today is overdue and goes into today's bucket
    let bucketIndex;
    if (offsetDays < 0){
      bucketIndex = 0;
    } else if (offsetDays >= days){
      // beyond the forecast window; ignore
      return;
    } else {
      bucketIndex = offsetDays;
    }

    const bucket = buckets[bucketIndex];
    if (!bucket) return;

    bucket.count += 1;

    const dueMinutes = (card && typeof card.dueMinutes === "number" && Number.isFinite(card.dueMinutes))
      ? card.dueMinutes
      : null;

    if (dueMinutes == null){
      bucket.unknown += 1;
    } else {
      const hour = Math.max(0, Math.min(23, Math.floor(dueMinutes / 60)));
      bucket.hourly[hour] = (bucket.hourly[hour] || 0) + 1;
    }

    // Overdue logic for today's bucket (index 0)
    if (bucketIndex === 0){
      const isBeforeToday = offsetDays < 0;
      const isTodayAndPast = (offsetDays === 0) &&
        (dueMinutes == null || dueMinutes <= nowMinutes);

      if (isBeforeToday || isTodayAndPast){
        bucket.overdue = (bucket.overdue || 0) + 1;
      }
    }
  });

  const totalActive = keys.length;
  let reviewCount = 0;
  if (buckets.length){
    const todayBucket = buckets[0];
    reviewCount = todayBucket.overdue || 0;
  }

  return { totalActive, newCount, reviewCount, days: buckets };
}




  function formatHourLabel(hour){
    const h = Number(hour);
    if (!Number.isFinite(h) || h < 0) return "";
    const suffix = h >= 12 ? "pm" : "am";
    const h12 = h === 0 ? 12 : (h > 12 ? h - 12 : h);
    return `${h12}${suffix}`;
  }

  function buildForecastDayTooltip(dayBucket, index){
    const total = dayBucket.count || 0;
    const hourly = dayBucket.hourly || {};
    const overdue = dayBucket.overdue || 0;
    const unknown = dayBucket.unknown || 0;

    if (!total){
      if (index === 0) return "No cards due today. 🎉";
      if (index === 1) return "No cards due tomorrow.";
      return "No cards due on this day.";
    }

    const lines = [];
    if (overdue > 0){
      lines.push(`Overdue: ${overdue} due`);
    }

    const hours = Object.keys(hourly).sort((a,b)=>Number(a)-Number(b));
    hours.forEach(h=>{
      const count = hourly[h];
      if (!count) return;
      const label = formatHourLabel(h);
      lines.push(`${label}: ${count} due`);
    });

    if (!hours.length && unknown > 0){
      lines.push(`Any time: ${unknown} due`);
    } else if (unknown > 0){
      lines.push(`${unknown} due with no time set`);
    }

    if (!lines.length){
      lines.push(`Total: ${total} due`);
    }

    return lines.join("\n");
  }

  function buildForecastWeekGroups(dayBuckets){
    const buckets = Array.isArray(dayBuckets) ? dayBuckets : [];
    const map = new Map();

    buckets.forEach(b=>{
      if (!b || !b.ymd) return;
      const dt = Utils.ymdToDate(b.ymd);
      const ws = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
      const dow = ws.getDay(); // 0=Sun
      const diff = (dow + 6) % 7; // Monday start
      ws.setDate(ws.getDate() - diff);

      const key = Utils.dateToYMD(ws);
      if (!map.has(key)){
        map.set(key, {
          type: "week",
          weekStartYmd: key,
          weekStart: ws,
          weekEnd: null,
          weekEndYmd: null,
          count: 0,
          days: []
        });
      }
      const g = map.get(key);
      g.days.push(b);
      g.count += (b.count || 0);
    });

    const groups = Array.from(map.values()).sort((a,b)=>String(a.weekStartYmd).localeCompare(String(b.weekStartYmd)));
    groups.forEach(g=>{
      const end = new Date(g.weekStart.getFullYear(), g.weekStart.getMonth(), g.weekStart.getDate());
      end.setDate(end.getDate() + 6);
      g.weekEnd = end;
      g.weekEndYmd = Utils.dateToYMD(end);
      // sort child days by date
      g.days.sort((a,b)=>String(a.ymd).localeCompare(String(b.ymd)));
    });
    return groups;
  }

  function buildForecastWeekTooltip(weekGroup){
    if (!weekGroup) return "";
    const total = weekGroup.count || 0;
    const lines = [];
    if (weekGroup.weekStart && weekGroup.weekEnd){
      lines.push(`Week: ${Utils.formatDMYShort(weekGroup.weekStart)} – ${Utils.formatDMYShort(weekGroup.weekEnd)}`);
    } else if (weekGroup.weekStartYmd && weekGroup.weekEndYmd){
      lines.push(`Week: ${weekGroup.weekStartYmd} – ${weekGroup.weekEndYmd}`);
    } else if (weekGroup.weekStartYmd){
      lines.push(`Week starting ${weekGroup.weekStartYmd}`);
    }

    if (!total){
      lines.push("No cards due this week.");
      return lines.join("\n");
    }

    lines.push(`Total: ${total} due`);

    const days = Array.isArray(weekGroup.days) ? weekGroup.days : [];
    days.forEach(d=>{
      const c = (d && d.count) || 0;
      if (!c) return;
      const dt = Utils.ymdToDate(d.ymd);
      lines.push(`${Utils.formatDMYShort(dt)}: ${c} due`);
    });

    return lines.join("\n");
  }


  function pullDayToMidnight(ymd){
    const srs = ensureSrsConfig();
    const keys = Array.isArray(srs.grammarKeys) ? srs.grammarKeys : [];
    if (!keys.length || !ymd) return;

    keys.forEach(grammarKey=>{
      const card = getCard(grammarKey);
      if (!card || !card.due) return;
      if (card.due !== ymd) return;
      card.dueMinutes = 0;
      srs.cardsByKey[String(grammarKey)] = card;
    });

    Storage.saveUserData();
    updateStats();
    // Re-render stats modal contents with updated forecast
    if (statsBackdropEl && !statsBackdropEl.hidden){
      openStatsModal();
    }
  }

  function openStatsModal(){
    if (!statsBackdropEl || !statsSummaryEl || !statsGraphEl) return;
    const data = buildForecast(180);
    const totalActive = data.totalActive;
    const newCount = data.newCount;
    const reviewCount = data.reviewCount;
    const days = data.days;
    const DAILY_CUTOFF = 14;
    const dailyDays = Array.isArray(days) ? days.slice(0, DAILY_CUTOFF) : [];
    const laterDays = Array.isArray(days) ? days.slice(DAILY_CUTOFF) : [];
    const weekGroups = buildForecastWeekGroups(laterDays);


    if (!totalActive){
      statsSummaryEl.textContent = "No SRS items yet. Use the ＋ buttons next to grammar points to add them to SRS.";
    } else {
      statsSummaryEl.textContent = `${totalActive} grammar points in SRS.`;
    }

    if (statsNewCountEl) statsNewCountEl.textContent = String(newCount || 0);
    if (statsReviewCountEl) statsReviewCountEl.textContent = String(reviewCount || 0);

    if (statsStartNewBtn){
      const disabled = !newCount;
      statsStartNewBtn.disabled = disabled;
      statsStartNewBtn.classList.toggle("disabled", disabled);
    }
    if (statsReviewDueBtn){
      const disabled = !reviewCount;
      statsReviewDueBtn.disabled = disabled;
      statsReviewDueBtn.classList.toggle("disabled", disabled);
    }

        statsGraphEl.innerHTML = "";

        const dailyMax = dailyDays.reduce((m,d)=>Math.max(m,(d && d.count) || 0),0) || 1;

        const dailyHdr = document.createElement("div");
        dailyHdr.className = "srs-graph-section-title";
        dailyHdr.textContent = "Next 14 days";
        statsGraphEl.appendChild(dailyHdr);

                const dailyGrid = document.createElement("div");
                dailyGrid.className = "srs-heatmap";

                dailyDays.forEach((d, idx)=>{
                  const chip = document.createElement("div");
                  chip.className = "srs-heatmap-chip";

                  const total = (d && d.count) ? Number(d.count) : 0;
                  const dueNow = (idx === 0) ? Number(d.overdue || 0) : total;
                  const later = (idx === 0) ? Math.max(0, total - dueNow) : 0;

                  const ratio = total / dailyMax;
                  let level = 0;
                  if (total > 0){
                    if (ratio <= 0.25) level = 1;
                    else if (ratio <= 0.50) level = 2;
                    else if (ratio <= 0.75) level = 3;
                    else level = 4;
                  }
                  chip.classList.add(`lv${level}`);
                  if (!total) chip.classList.add("empty");
                  if (idx === 0) chip.classList.add("is-today");

                  const label = document.createElement("div");
                  label.className = "label";
                  if (idx === 0) label.textContent = "Today";
                  else if (idx === 1) label.textContent = "Tomorrow";
                  else {
                    const date = Utils.ymdToDate(d.ymd);
                    label.textContent = Utils.formatDMYShort(date);
                  }

                  const countEl = document.createElement("div");
                  countEl.className = "count";
                  countEl.textContent = String(idx === 0 ? dueNow : total);

                  const sub = document.createElement("div");
                  sub.className = "sub";
                  if (idx === 0 && later > 0){
                    sub.textContent = `+${later} later`;
                  } else {
                    sub.textContent = "";
                  }

                  if (idx === 0){
                    const nowBtn = document.createElement("button");
                    nowBtn.type = "button";
                    nowBtn.className = "srs-heatmap-now";
                    nowBtn.textContent = "Now";
                    nowBtn.addEventListener("click",(ev)=>{
                      ev.stopPropagation();
                      Tooltip.hide();
                      pullDayToMidnight(d.ymd);
                    });
                    chip.appendChild(nowBtn);
                  }

                  chip.appendChild(label);
                  chip.appendChild(countEl);
                  chip.appendChild(sub);

                  const tooltipText = buildForecastDayTooltip(d, idx);
                  chip.addEventListener("mousemove",(ev)=>{
                    Tooltip.show(tooltipText, ev.clientX, ev.clientY);
                  });
                  chip.addEventListener("mouseleave", Tooltip.hide);

                  dailyGrid.appendChild(chip);
                });

                statsGraphEl.appendChild(dailyGrid);

        const nonEmptyWeeks = weekGroups.filter(w => (w && (w.count || 0) > 0));
        if (nonEmptyWeeks.length){
          const weekHdr = document.createElement("div");
          weekHdr.className = "srs-graph-section-title";
          weekHdr.textContent = "Later (weekly)";
          statsGraphEl.appendChild(weekHdr);

                    const weekMax = nonEmptyWeeks.reduce((m,w)=>Math.max(m,(w && w.count) || 0),0) || 1;

                    const weekGrid = document.createElement("div");
                    weekGrid.className = "srs-weekmap";

                    nonEmptyWeeks.forEach((w)=>{
                      const chip = document.createElement("div");
                      chip.className = "srs-weekmap-chip";

                      const count = (w && w.count) ? Number(w.count) : 0;
                      const ratio = count / weekMax;
                      let level = 0;
                      if (count > 0){
                        if (ratio <= 0.25) level = 1;
                        else if (ratio <= 0.50) level = 2;
                        else if (ratio <= 0.75) level = 3;
                        else level = 4;
                      }
                      chip.classList.add(`lv${level}`);
                      if (!count) chip.classList.add("empty");

                      const label = document.createElement("div");
                      label.className = "label";
                      if (w && w.weekStart){
                        const dd = String(w.weekStart.getDate()).padStart(2,"0");
                        const mm = String(w.weekStart.getMonth()+1).padStart(2,"0");
                        label.textContent = `Wk ${dd}/${mm}`;
                      } else if (w && w.weekStartYmd){
                        label.textContent = `Wk ${String(w.weekStartYmd).slice(5,10)}`;
                      } else {
                        label.textContent = "Week";
                      }

                      const countEl = document.createElement("div");
                      countEl.className = "count";
                      countEl.textContent = String(count);

                      chip.appendChild(label);
                      chip.appendChild(countEl);

                      const tooltipText = buildForecastWeekTooltip(w);
                      chip.addEventListener("mousemove",(ev)=>{
                        Tooltip.show(tooltipText, ev.clientX, ev.clientY);
                      });
                      chip.addEventListener("mouseleave", Tooltip.hide);

                      weekGrid.appendChild(chip);
                    });

                    statsGraphEl.appendChild(weekGrid);
        }

    statsBackdropEl.hidden = false;
  }

  function closeStatsModal(){
    if (statsBackdropEl){
      statsBackdropEl.hidden = true;
    }
  }


  function getHistoryStats(){
    const srs = ensureSrsConfig();
    const cards = (srs && srs.cardsByKey) ? srs.cardsByKey : {};
    let totalReviews = 0;
    let totalLapses = 0;
    let cardsWithHistory = 0;
    let cardsWith3Plus = 0;

    Object.keys(cards).forEach(k=>{
      const c = cards[k];
      if (!c) return;
      const r = Number(c.reps || 0);
      if (!Number.isFinite(r) || r <= 0) return;
      cardsWithHistory += 1;
      totalReviews += r;
      const l = Number(c.lapses || 0);
      if (Number.isFinite(l) && l > 0) totalLapses += l;
      if (r >= 3) cardsWith3Plus += 1;
    });

    const accuracy = totalReviews ? (totalReviews - totalLapses) / totalReviews : 0;
    return { totalReviews, totalLapses, cardsWithHistory, cardsWith3Plus, accuracy };
  }

  function snapshotFsrsConfig(){
    const srs = ensureSrsConfig();
    fsrsModalSnapshot = {
      fsrsSettings: (srs && srs.fsrsSettings) ? JSON.parse(JSON.stringify(srs.fsrsSettings)) : {}
    };
  }

  function restoreFsrsConfigSnapshot(){
    if (!fsrsModalSnapshot) return;
    const srs = ensureSrsConfig();
    srs.fsrsSettings = fsrsModalSnapshot.fsrsSettings || {};
    Storage.saveUserData();
  }

  function setFsrsHint(msg){
    if (!fsrsHintEl) return;
    fsrsHintEl.textContent = String(msg || "");
  }

  function loadFsrsUiFromConfig(){
    const srs = ensureSrsConfig();
    const fs = srs.fsrsSettings || {};
    if (fsrsGrowthRateInput) fsrsGrowthRateInput.value = String(fs.growthRate ?? 0.25);
    if (fsrsLapsePenaltyInput) fsrsLapsePenaltyInput.value = String(fs.lapsePenalty ?? 0.5);
    if (fsrsDiffUpInput) fsrsDiffUpInput.value = String(fs.diffUp ?? 0.5);
    if (fsrsDiffDownInput) fsrsDiffDownInput.value = String(fs.diffDown ?? 0.1);
    if (fsrsInitStabGoodInput) fsrsInitStabGoodInput.value = String(fs.initStabilityGood ?? 2.5);
    if (fsrsInitStabBadInput) fsrsInitStabBadInput.value = String(fs.initStabilityBad ?? 1.0);
    if (fsrsMaxIntervalInput) fsrsMaxIntervalInput.value = String(fs.maxInterval ?? 3650);
    if (fsrsRetireEnabledInput) fsrsRetireEnabledInput.checked = !!fs.retireEnabled;
    if (fsrsRetireAfterDaysInput) {
      fsrsRetireAfterDaysInput.value = String(fs.retireAfterDays ?? 365);
      fsrsRetireAfterDaysInput.disabled = !((fsrsRetireEnabledInput && fsrsRetireEnabledInput.checked) ? true : false);
    }

    // Auto-adjust availability
    const hs = getHistoryStats();
    const enough = (hs.totalReviews >= 50) && (hs.cardsWith3Plus >= 10);
    if (fsrsAutoAdjustBtn){
      fsrsAutoAdjustBtn.disabled = !enough;
      fsrsAutoAdjustBtn.classList.toggle("disabled", !enough);
      const tip = !enough
        ? `Needs more history: ${hs.totalReviews} reviews, ${hs.cardsWith3Plus} cards with 3+ reps (min 50 / 10).`
        : "Auto-adjust FSRS using your SRS history";
      fsrsAutoAdjustBtn.title = tip;
    }
    if (!enough){
      setFsrsHint(`Auto-adjust needs more history (at least 50 reviews across 10 grammar points with 3+ reps). Current: ${hs.totalReviews} reviews, ${hs.cardsWith3Plus} cards.`);
    } else {
      const pct = Math.round((hs.accuracy || 0) * 100);
      setFsrsHint(`Your history: ${hs.totalReviews} reviews across ${hs.cardsWithHistory} cards (accuracy ~${pct}%).`);
    }
  }

  function saveFsrsConfigFromUi(){
    const srs = ensureSrsConfig();
    const fs = srs.fsrsSettings || (srs.fsrsSettings = {});
    fs.growthRate = clamp(parseFloat(fsrsGrowthRateInput?.value), 0.01, 1);
    fs.lapsePenalty = clamp(parseFloat(fsrsLapsePenaltyInput?.value), 0.05, 1);
    fs.diffUp = clamp(parseFloat(fsrsDiffUpInput?.value), 0, 5);
    fs.diffDown = clamp(parseFloat(fsrsDiffDownInput?.value), 0, 5);
    fs.initStabilityGood = clamp(parseFloat(fsrsInitStabGoodInput?.value), 0.1, 50);
    fs.initStabilityBad = clamp(parseFloat(fsrsInitStabBadInput?.value), 0.1, 50);
    fs.maxInterval = clamp(parseFloat(fsrsMaxIntervalInput?.value), 1, 99999);
    fs.retireEnabled = !!(fsrsRetireEnabledInput && fsrsRetireEnabledInput.checked);
    {
      const v = parseFloat(fsrsRetireAfterDaysInput?.value);
      fs.retireAfterDays = clamp(Number.isFinite(v) ? v : 365, 1, 99999);
    }
    Storage.saveUserData();
  }

  function resetFsrsDefaults(){
    const srs = ensureSrsConfig();
    const fs = srs.fsrsSettings || (srs.fsrsSettings = {});
    fs.growthRate = 0.25;
    fs.lapsePenalty = 0.5;
    fs.diffUp = 0.5;
    fs.diffDown = 0.1;
    fs.initStabilityGood = 2.5;
    fs.initStabilityBad = 1.0;
    fs.maxInterval = 3650;
    fs.retireEnabled = false;
    fs.retireAfterDays = 365;
    Storage.saveUserData();
    loadFsrsUiFromConfig();
    setFsrsHint("Reset to defaults.");
  }

  function openFsrsSettingsModal(fromStats=true){
    if (!fsrsBackdropEl) return;
    fsrsReturnToStats = !!fromStats;
    snapshotFsrsConfig();
    loadFsrsUiFromConfig();
    if (fromStats && statsBackdropEl) statsBackdropEl.hidden = true;
    fsrsBackdropEl.hidden = false;
  }

  function closeFsrsSettingsModal(reopenStats=true){
    if (!fsrsBackdropEl) return;
    fsrsBackdropEl.hidden = true;
    const shouldReturn = fsrsReturnToStats && reopenStats;
    fsrsReturnToStats = false;
    if (shouldReturn){
      openStatsModal();
    }
  }

  function autoAdjustFsrsToHistory(){
    const hs = getHistoryStats();
    const enough = (hs.totalReviews >= 50) && (hs.cardsWith3Plus >= 10);
    if (!enough){
      // This should normally be unreachable because the button is disabled,
      // but keep the guard here so auto-adjust can never run without enough data.
      loadFsrsUiFromConfig();
      return;
    }

    const srs = ensureSrsConfig();
    const fs = srs.fsrsSettings || (srs.fsrsSettings = {});
    const acc = clamp(hs.accuracy || 0, 0, 1);
    const delta = acc - 0.8; // relative to 80% baseline

    fs.growthRate = clamp(0.25 + delta * 0.45, 0.05, 0.8);
    fs.lapsePenalty = clamp(0.5 + delta * 0.35, 0.2, 0.95);
    fs.diffUp = clamp(0.5 - delta * 0.6, 0.1, 2.0);
    fs.diffDown = clamp(0.1 + delta * 0.25, 0.02, 0.6);
    fs.initStabilityGood = clamp(2.5 + delta * 2.0, 1.0, 8.0);
    fs.initStabilityBad = clamp(1.0 + delta * 1.0, 0.5, 4.0);
    fs.maxInterval = clamp(Number(fs.maxInterval || 3650), 1, 99999);

    Storage.saveUserData();
    loadFsrsUiFromConfig();

    // Treat auto-adjust as an explicit action. Update the snapshot so closing
    // the modal via ✕ / backdrop doesn't immediately undo the adjustment.
    snapshotFsrsConfig();

    const pct = Math.round(acc * 100);
    setFsrsHint(`Auto-adjusted and saved (accuracy ~${pct}%).`);
  }


  function openToggleModal(grammarKey, buttonEl){
    pendingToggleKey = String(grammarKey || "");
    pendingToggleButtons = [];
    if (buttonEl) pendingToggleButtons.push(buttonEl);
    if (!pendingToggleKey || !toggleBackdropEl) return;
    toggleBackdropEl.hidden = false;
    renderToggleStats(pendingToggleKey);

  }

  function closeToggleModal(){
    if (toggleBackdropEl){
      toggleBackdropEl.hidden = true;
    }
    pendingToggleKey = null;
    pendingToggleButtons = [];
  }

  function disableCurrentKeepHistory(){
    const srs = ensureSrsConfig();
    const key = pendingToggleKey;
    if (!key){
      closeToggleModal();
      return;
    }
    if (Array.isArray(srs.grammarKeys)){
      srs.grammarKeys = srs.grammarKeys.filter(k=>k !== key);
    }
    Storage.saveUserData();

    pendingToggleButtons.forEach(btn=>{
      btn.classList.remove("srs-added");
      btn.title = "Add to SRS";
      btn.textContent = "＋";

      // If the button sits inside View All, keep the SRS filter state accurate.
      const viewAllItem = btn.closest?.(".viewall-item");
      if (viewAllItem) viewAllItem.dataset.inSrs = "0";
    });

    if (isOpen){
      buildDeck();
      if (!totalInitial){
        renderEmptyCard();
        syncActionButtons();
      }else{
        renderCard();
      }
    }

    closeToggleModal();
  }

  
  function pullCurrentDueToToday(){
    const srs = ensureSrsConfig();
    const key = pendingToggleKey;
    if (!key){
      closeToggleModal();
      return;
    }
    const inSrs = Array.isArray(srs.grammarKeys) && srs.grammarKeys.includes(key);
    if (!inSrs) return;

    const now = new Date();
    const today = Utils.dateToYMD(now);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (!srs.cardsByKey || typeof srs.cardsByKey !== "object") srs.cardsByKey = {};
    const card = srs.cardsByKey[key] || (srs.cardsByKey[key] = {});
    card.due = today;
    card.dueMinutes = nowMinutes;

    Storage.saveUserData();
    updateStats();
    renderToggleStats(key);

    // Refresh the main list so any SRS badges / counts stay accurate.
    const ymd = document.querySelector("#viewDate")?.value || Utils.dateToYMD(new Date());
    window.App.Daily?.render?.(ymd);
  }

  function markCurrentAsKnown(){
    const srs = ensureSrsConfig();
    const key = pendingToggleKey;
    if (!key){
      closeToggleModal();
      return;
    }
    const inSrs = Array.isArray(srs.grammarKeys) && srs.grammarKeys.includes(key);
    if (!inSrs) return;

    const card = getCard(key);
    card.known = true;
    if (!srs.cardsByKey || typeof srs.cardsByKey !== "object") srs.cardsByKey = {};
    srs.cardsByKey[String(key)] = card;

    Storage.saveUserData();
    updateStats();
    renderToggleStats(key);

    // Update any bound SRS buttons (Daily / View All / Cram selection) so the trophy shows immediately.
    pendingToggleButtons.forEach(btn=>{
      if (!btn) return;
      try{
        const e = getEmojiForKey(key);
        if (e && e.emoji) btn.textContent = e.emoji;
        if (e && e.title) btn.title = e.title;
        btn.classList.add("srs-added");
      }catch(_e){/* ignore */}
    });

    // If a session is open, rebuild in case this card was due/new in the deck.
    if (isOpen){
      buildDeck();
      if (!totalInitial){
        renderEmptyCard();
        syncActionButtons();
      } else {
        renderCard();
      }
    }

    // Refresh the main list so badges/trophy show immediately.
    const ymd = document.querySelector("#viewDate")?.value || Utils.dateToYMD(new Date());
    window.App.Daily?.render?.(ymd);
  }

function deleteCurrentHistory(){
    const ok = confirm("Remove this item from SRS?\n\nThis will delete its SRS history for this grammar point.");
    if (!ok) return;
    const srs = ensureSrsConfig();
    const key = pendingToggleKey;
    if (!key){
      closeToggleModal();
      return;
    }
    if (Array.isArray(srs.grammarKeys)){
      srs.grammarKeys = srs.grammarKeys.filter(k=>k !== key);
    }
    if (srs.cardsByKey && srs.cardsByKey[key]){
      delete srs.cardsByKey[key];
    }
    Storage.saveUserData();

    pendingToggleButtons.forEach(btn=>{
      btn.classList.remove("srs-added");
      btn.title = "Add to SRS";
      btn.textContent = "＋";
    });

    if (isOpen){
      buildDeck();
      if (!totalInitial){
        renderEmptyCard();
        syncActionButtons();
      }else{
        renderCard();
      }
    }

    closeToggleModal();
  }



  SRS.init = () => {
    openBtn = document.querySelector("#openSrsBtn");
    overlayEl = document.querySelector("#srsSessionOverlay");

    if (!overlayEl || !openBtn) return;

    quitBtn = document.querySelector("#srsQuitBtn");
    cardEl = document.querySelector("#srsCard");
    wrongBtn = document.querySelector("#srsWrongBtn");
    rightBtn = document.querySelector("#srsRightBtn");
    nextBtn = document.querySelector("#srsNextBtn");
    undoBtn = document.querySelector("#srsUndoBtn");

    completeQuitRowEl = document.querySelector("#srsCompleteQuitRow");
    completeQuitBtnEl = document.querySelector("#srsCompleteQuitBtn");
    progressEl = document.querySelector("#srsProgressText");
    scoreEl = document.querySelector("#srsScoreText");
    flipHintEl = document.querySelector("#srsFlipHint");
    modeGrammarBtn = document.querySelector("#srsModeGrammar");
    modeSentencesBtn = document.querySelector("#srsModeSentences");
    examplesPerGrammarInput = document.querySelector("#srsExamplesPerGrammar");
    examplesAllBtn = document.querySelector("#srsExamplesAllBtn");
    statsBtn = document.querySelector("#srsStatsBtn");
    statsBackdropEl = document.querySelector("#srsStatsBackdrop");
    statsCloseBtn = document.querySelector("#srsStatsCloseBtn");
    statsSummaryEl = document.querySelector("#srsStatsSummary");
    statsGraphEl = document.querySelector("#srsStatsGraph");
    statsNewCountEl = document.querySelector("#srsNewCount");
    statsReviewCountEl = document.querySelector("#srsReviewCount");
    editFsrsBtn = document.querySelector("#srsEditFsrsBtn");
    fsrsBackdropEl = document.querySelector("#fsrsSettingsBackdrop");
    fsrsCloseBtn = document.querySelector("#fsrsSettingsCloseBtn");
    fsrsHintEl = document.querySelector("#fsrsSettingsHint");
    fsrsGrowthRateInput = document.querySelector("#fsrsGrowthRate");
    fsrsLapsePenaltyInput = document.querySelector("#fsrsLapsePenalty");
    fsrsDiffUpInput = document.querySelector("#fsrsDiffUp");
    fsrsDiffDownInput = document.querySelector("#fsrsDiffDown");
    fsrsInitStabGoodInput = document.querySelector("#fsrsInitStabGood");
    fsrsInitStabBadInput = document.querySelector("#fsrsInitStabBad");
    fsrsMaxIntervalInput = document.querySelector("#fsrsMaxInterval");
    fsrsRetireEnabledInput = document.querySelector("#fsrsRetireEnabled");
    fsrsRetireAfterDaysInput = document.querySelector("#fsrsRetireAfterDays");
    fsrsAutoAdjustBtn = document.querySelector("#fsrsAutoAdjustBtn");
    fsrsResetBtn = document.querySelector("#fsrsResetBtn");
    fsrsSaveBtn = document.querySelector("#fsrsSaveBtn");
    statsStartNewBtn = document.querySelector("#srsStartNewBtn");
    statsReviewDueBtn = document.querySelector("#srsReviewDueBtn");
    toggleBackdropEl = document.querySelector("#srsToggleBackdrop");
    toggleKeepBtn = document.querySelector("#srsToggleKeepBtn");
    togglePullTodayBtn = document.querySelector("#srsTogglePullTodayBtn");
    toggleKnownBtn = document.querySelector("#srsToggleKnownBtn");
    toggleDeleteBtn = document.querySelector("#srsToggleDeleteBtn");
    toggleCancelBtn = document.querySelector("#srsToggleCancelBtn");
    toggleStatsEl = document.querySelector("#srsToggleStats");

    overlayEl.hidden = true;
    overlayEl.style.display = "none";

    ensureSrsConfig();
    applyModeToUi();
    updateStats();
    renderEmptyCard();
    syncActionButtons();

    openBtn.addEventListener("click", openStatsModal);

    editFsrsBtn?.addEventListener("click", ()=>{
      openFsrsSettingsModal(true);
    });

    fsrsCloseBtn?.addEventListener("click", ()=>{
      // cancel changes
      restoreFsrsConfigSnapshot();
      closeFsrsSettingsModal(true);
    });
    fsrsSaveBtn?.addEventListener("click", ()=>{
      saveFsrsConfigFromUi();
      closeFsrsSettingsModal(true);
    });

    fsrsRetireEnabledInput?.addEventListener("change", ()=>{
      if (fsrsRetireAfterDaysInput) fsrsRetireAfterDaysInput.disabled = !fsrsRetireEnabledInput.checked;
    });
    fsrsResetBtn?.addEventListener("click", ()=>{
      resetFsrsDefaults();
    });
    fsrsAutoAdjustBtn?.addEventListener("click", ()=>{
      autoAdjustFsrsToHistory();
    });
    fsrsBackdropEl?.addEventListener("click", (ev)=>{
      if (ev.target === fsrsBackdropEl){
        restoreFsrsConfigSnapshot();
        closeFsrsSettingsModal(true);
      }
    });
    quitBtn?.addEventListener("click", close);
    completeQuitBtnEl?.addEventListener("click", close);

    wrongBtn?.addEventListener("click", markWrong);
    rightBtn?.addEventListener("click", markRight);
    nextBtn?.addEventListener("click", nextAfterWrong);

    undoBtn?.addEventListener("click", undoLast);

    modeGrammarBtn?.addEventListener("click", ()=>setMode("grammar"));
    modeSentencesBtn?.addEventListener("click", ()=>setMode("sentences"));
    examplesPerGrammarInput?.addEventListener("change", examplesPerGrammarChanged);
    examplesAllBtn?.addEventListener("click", toggleAllExamples);

    statsBtn?.addEventListener("click", ()=>{
      // During an active SRS session, "Stats" should open the per-item Modify SRS window
      // for the current grammar point (and sit above everything).
      if (!isOpen){
        openStatsModal();
        return;
      }
      const current = deck && deck.length ? deck[0] : null;
      const key = current?.grammarKey ? String(current.grammarKey) : "";
      if (!key){
        openStatsModal();
        return;
      }
      openToggleModal(key);
    });
    statsCloseBtn?.addEventListener("click", closeStatsModal);
    statsBackdropEl?.addEventListener("click", (ev)=>{
      if (ev.target === statsBackdropEl) closeStatsModal();
    });

    statsStartNewBtn?.addEventListener("click", ()=>{
      closeStatsModal();
      sessionType = "new";
      open();
    });

    statsReviewDueBtn?.addEventListener("click", ()=>{
      if (statsReviewDueBtn.disabled) return;
      closeStatsModal();
      sessionType = "due";
      open();
    });

    toggleKeepBtn?.addEventListener("click", disableCurrentKeepHistory);
    togglePullTodayBtn?.addEventListener("click", pullCurrentDueToToday);
    toggleKnownBtn?.addEventListener("click", markCurrentAsKnown);
    toggleDeleteBtn?.addEventListener("click", deleteCurrentHistory);
    toggleCancelBtn?.addEventListener("click", closeToggleModal);
    toggleBackdropEl?.addEventListener("click", (ev)=>{
      if (ev.target === toggleBackdropEl) closeToggleModal();
    });

      };

  SRS.beginToggle = (grammarKey, buttonEl) => openToggleModal(grammarKey, buttonEl);
  SRS.getCard = getCard;
  SRS.buildEmojiBadge = buildSrsEmojiBadge;
  SRS.getEmojiForKey = getEmojiForKey;

  window.App.SRS = SRS;
})();
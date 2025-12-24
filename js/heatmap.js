(function(){
  window.App = window.App || {};
  const { CONST, Utils, Storage, Tooltip } = window.App;

  const Heatmap = {};

  const HEATMAP_PALETTES = [
    { key:"mint",   name:"Mint",   border:"rgba(34,197,94,.88)",  fill:"rgba(34,197,94,.55)" },
    { key:"ocean",  name:"Ocean",  border:"rgba(59,130,246,.88)", fill:"rgba(59,130,246,.55)" },
    { key:"amber",  name:"Amber",  border:"rgba(245,158,11,.9)",  fill:"rgba(245,158,11,.52)" },
    { key:"rose",   name:"Rose",   border:"rgba(244,63,94,.9)",   fill:"rgba(244,63,94,.52)" },
    { key:"violet", name:"Violet", border:"rgba(168,85,247,.9)",  fill:"rgba(168,85,247,.52)" }
  ];

  let panel, openSettingsBtn, openMonthlyBtn, hmGrid, hmMonthLabels, hmPrevYearBtn, hmNextYearBtn, hmYearLabel;
  let hmFirstVisitWrap, hmStreakWrap, hmTotalWrap, hmFirstVisitVal, hmStreakVal, hmTotalVal;

  let settingsBackdrop, closeSettingsBtn, hmShowFirstVisit, hmShowStreak, hmShowTotal, hmShowMonthTitles, hmPaletteOptions;
  let monthlyBackdrop, closeMonthlyBtn, hmMonthlyList, hmMonthlyPrevBtn, hmMonthlyNextBtn, hmMonthlyLabel, hmMonthlySummary;
  let hmMonthlyBarsGrammar, hmMonthlyBarsSentences, hmMonthlyBarsCram;
  let selectedMonthKey = null; // "YYYY-MM"
  let goalsListEl, addGoalBtn, goalEditorEl;

  let goalCycleTimer = null;
  let goalCycleToken = 0; // bump to cancel pending fades on re-render
  let goalMarkers = []; // {emojiEl, emojis, idx}

  // --- Snake mini-game (hold today's cell for 5s) ---
  let snakeOverlay = null;
  let snakeBackdrop = null;
  let snakeQuitBtn = null;
  let snakeScoreEl = null;
  let snakeScoreCurEl = null;
  let snakeScoreHiEl = null;
  let snakeCenterEl = null;
  let snakeSubEl = null;
  let snakeFireCanvas = null;
  let snakeFireCtx = null;

  // Rainbow should follow the snake as it moves
  let snakeRainbowUntil = 0;
  let snakeRainbowApplied = new Set();

  // Win fireworks
  let snakeFireActive = false;
  let snakeFireRaf = null;
  let snakeFireLastTs = 0;
  let snakeFireRockets = [];
  let snakeFireSparks = [];

  let snakeActive = false;
  let snakeCountdownActive = false;
  let snakeHoldTimer = null;
  let snakeCountdownTimer = null;
  let snakeTickTimer = null;
  let snakeRainbowTimer = null;
  let suppressClicksUntil = 0;

  let snake = [];            // indices into hmGrid children, [head, ...]
  let snakeSet = new Set();  // quick collision checks
  let snakeDir = { dx: 1, dy: 0 };
  let snakeDirQueue = []; // queued direction inputs (max 2) applied one per tick
  let snakeCols = 0;
  let snakeRows = 7;
  let snakeTargetIdx = -1;
  let snakeTargetEl = null;
  let snakeTargetCellIdx = -1;
  let snakeScore = 0;
  let snakeGameOver = false;

  const SNAKE_TARGET_EMOJIS = ["🍙","📚","📝","✨","🎯","🧠","⭐","🔥","🍡","🌙","💿","🕹️"];

  let state = {
    visible: true,                // enabled by default
    viewYear: new Date().getFullYear(),
    showMonthTitles: false,
    showFirstVisit: true,
    showStreak: true,
    showTotal: true,
    paletteKey: "mint",
    visitedDays: {},
    // Per-day study totals used for tooltips + monthly charts.
    // Shape: { [ymd]: { srsSentences:number, crammed:number, srsGrammarKeys:{[grammarKey]:true} } }
    dayStats: {},
    goals: [] // [{id, ymd, emoji, text}]
  };
function stopGoalEmojiCycler(){
  if (goalCycleTimer) clearInterval(goalCycleTimer);
  goalCycleTimer = null;
}
function startGoalEmojiCycler(){
  stopGoalEmojiCycler();

  // Only run if there are any multi-goal cells on screen
  const hasAny = document.querySelector(".hm-goal-emoji[data-cycle='1']");
  if (!hasAny) return;

  goalCycleTimer = setInterval(() => {
    document.querySelectorAll(".hm-goal-emoji[data-cycle='1']").forEach(el => {
      let emojis;
      try { emojis = JSON.parse(el.dataset.emojis || "[]"); } catch { emojis = []; }
      if (!Array.isArray(emojis) || emojis.length < 2) return;

      const cur = parseInt(el.dataset.idx || "0", 10) || 0;
      const next = (cur + 1) % emojis.length;

      // fade out -> swap -> fade in
      el.style.opacity = "0";
      setTimeout(() => {
        el.textContent = emojis[next];
        el.dataset.idx = String(next);
        el.style.opacity = "1";
      }, 140);
    });
  }, 2000);
}
  function save(){
    localStorage.setItem(CONST.STORAGE_KEYS.HEATMAP, JSON.stringify(state));
  }
  function load(){
    try{
      const raw = localStorage.getItem(CONST.STORAGE_KEYS.HEATMAP);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object"){
        state = { ...state, ...parsed };
        if (!state.visitedDays || typeof state.visitedDays !== "object") state.visitedDays = {};
        if (!state.dayStats || typeof state.dayStats !== "object") state.dayStats = {};
        if (!Array.isArray(state.goals)) state.goals = [];
        if (typeof state.visible !== "boolean") state.visible = true;
      }
    }catch{}
  }

  function applyPalette(){
    const pal = HEATMAP_PALETTES.find(p=>p.key===state.paletteKey) || HEATMAP_PALETTES[0];
    document.documentElement.style.setProperty("--hm-border", pal.border);
    document.documentElement.style.setProperty("--hm-fill", pal.fill);
  }

  function applyVisibility(){
    if (!panel) return;
    panel.hidden = !state.visible;
  }

  function dowMon0(d){ return (d.getDay() + 6) % 7; }

  function daysInYear(year){
    const start = new Date(year,0,1);
    const end = new Date(year+1,0,1);
    return Math.round((end - start) / (24*60*60*1000));
  }

  function fitHeatmapToWidth(cols){
    const wrap = panel?.querySelector(".hm-grid-wrap");
    if (!wrap) return;
    const available = Math.max(240, wrap.clientWidth - 4);
    const gap = 3;
    const cell = Math.floor((available - (cols - 1) * gap) / cols);
    const clampCell = Math.max(9, Math.min(16, cell));
    document.documentElement.style.setProperty("--hm-gap", `${gap}px`);
    document.documentElement.style.setProperty("--hm-cell", `${clampCell}px`);
  }

  function recordTodayVisit(){
    const todayYMD = Utils.dateToYMD(new Date());
    if (!state.visitedDays[todayYMD]){
      state.visitedDays[todayYMD] = true;
      save();
    }
  }

  function getActiveVisitedYMDs(){
    return Object.keys(state.visitedDays||{}).filter(k=>!!state.visitedDays[k]).sort();
  }

  function computeFirstVisit(){
    const list = getActiveVisitedYMDs();
    return list.length ? list[0] : null;
  }

  function computeStreak(){
    const todayYMD = Utils.dateToYMD(new Date());
    if (!state.visitedDays[todayYMD]) return 0;
    let streak = 0;
    let d = new Date();
    while(true){
      const ymd = Utils.dateToYMD(d);
      if (!state.visitedDays[ymd]) break;
      streak++;
      d.setDate(d.getDate()-1);
    }
    return streak;
  }

  function computeTotal(){ return getActiveVisitedYMDs().length; }

  // ------------------------
  // Day stats (SRS / CRAM)
  // ------------------------
  function ensureDayStats(ymd){
    const k = String(ymd || "");
    if (!k) return null;
    state.dayStats = state.dayStats && typeof state.dayStats === "object" ? state.dayStats : {};
    const cur = state.dayStats[k];
    if (cur && typeof cur === "object") return cur;
    const init = { srsSentences: 0, crammed: 0, srsGrammarKeys: {} };
    state.dayStats[k] = init;
    return init;
  }

  function countGrammarKeys(obj){
    return obj && typeof obj === "object" ? Object.keys(obj).length : 0;
  }

  function getCountsForYMD(ymd){
    const ds = state.dayStats && typeof state.dayStats === "object" ? state.dayStats[String(ymd || "")] : null;
    if (!ds || typeof ds !== "object") return { grammar: 0, sentences: 0, crammed: 0 };
    return {
      grammar: countGrammarKeys(ds.srsGrammarKeys),
      sentences: Math.max(0, Number(ds.srsSentences || 0)),
      crammed: Math.max(0, Number(ds.crammed || 0))
    };
  }

  function applyStudyUndo(undo){
    if (!undo || typeof undo !== "object") return;
    const ymd = String(undo.ymd || "");
    if (!ymd) return;
    const ds = ensureDayStats(ymd);
    if (!ds) return;

    const d = undo.delta && typeof undo.delta === "object" ? undo.delta : {};
    if (d.srsSentences) ds.srsSentences = Math.max(0, Number(ds.srsSentences || 0) - Number(d.srsSentences || 0));
    if (d.crammed) ds.crammed = Math.max(0, Number(ds.crammed || 0) - Number(d.crammed || 0));

    const gk = String(undo.addedGrammarKey || "");
    if (gk && ds.srsGrammarKeys && typeof ds.srsGrammarKeys === "object"){
      delete ds.srsGrammarKeys[gk];
    }

    // Tidy empty records
    const empty = (Number(ds.srsSentences || 0) <= 0) && (Number(ds.crammed || 0) <= 0) && (countGrammarKeys(ds.srsGrammarKeys) === 0);
    if (empty){
      delete state.dayStats[ymd];
    }

    save();
  }

  // Public helpers used by SRS/CRAM so these totals can be shown in tooltips + monthly charts.
  Heatmap.recordSrsActivity = (info) => {
    try{
      const ymd = Utils.dateToYMD(new Date());
      const ds = ensureDayStats(ymd);
      if (!ds) return null;

      // Always count a sentence/card interaction.
      ds.srsSentences = Number(ds.srsSentences || 0) + 1;

      // Track unique grammar keys per day.
      let addedGrammarKey = null;
      const gk = String(info && info.grammarKey ? info.grammarKey : "");
      if (gk){
        ds.srsGrammarKeys = ds.srsGrammarKeys && typeof ds.srsGrammarKeys === "object" ? ds.srsGrammarKeys : {};
        if (!ds.srsGrammarKeys[gk]){
          ds.srsGrammarKeys[gk] = true;
          addedGrammarKey = gk;
        }
      }

      // Mark today as visited (in case the user hasn't opened the page earlier).
      state.visitedDays[ymd] = true;

      save();
      return { ymd, delta: { srsSentences: 1 }, addedGrammarKey };
    }catch(e){
      return null;
    }
  };

  Heatmap.recordCramActivity = () => {
    try{
      const ymd = Utils.dateToYMD(new Date());
      const ds = ensureDayStats(ymd);
      if (!ds) return null;
      ds.crammed = Number(ds.crammed || 0) + 1;
      state.visitedDays[ymd] = true;
      save();
      return { ymd, delta: { crammed: 1 }, addedGrammarKey: null };
    }catch(e){
      return null;
    }
  };

  Heatmap.applyStudyUndo = applyStudyUndo;

  // ------------------------
  // Snake mini-game helpers
  // ------------------------
  function ensureSnakeOverlay(){
  // Backdrop provides the blur/dim layer. UI overlay sits above the Study Log.
  if (!snakeBackdrop){
    snakeBackdrop = document.createElement("div");
    snakeBackdrop.className = "hm-snake-backdrop";
    snakeBackdrop.hidden = true;
    document.body.appendChild(snakeBackdrop);
  }

  if (snakeOverlay) return;

  snakeOverlay = document.createElement("div");
  snakeOverlay.className = "hm-snake-overlay";
  snakeOverlay.hidden = true;
  snakeOverlay.innerHTML = `
    <button type="button" class="chip-btn hm-snake-quit">QUIT</button>
    <div class="hm-snake-score">Score: <span class="hm-snake-score-cur">0</span> · Hi: <span class="hm-snake-score-hi">0</span></div>
    <canvas class="hm-snake-fireworks" width="1" height="1" aria-hidden="true"></canvas>
    <div class="hm-snake-center" aria-live="polite">
      <div class="hm-snake-center-main">3</div>
      <div class="hm-snake-center-sub"></div>
    </div>
  `;

  document.body.appendChild(snakeOverlay);
  snakeQuitBtn = snakeOverlay.querySelector(".hm-snake-quit");
  snakeScoreEl = snakeOverlay.querySelector(".hm-snake-score");
  snakeScoreCurEl = snakeOverlay.querySelector(".hm-snake-score-cur");
  snakeScoreHiEl = snakeOverlay.querySelector(".hm-snake-score-hi");
  snakeFireCanvas = snakeOverlay.querySelector(".hm-snake-fireworks");
  snakeFireCtx = null;
  snakeCenterEl = snakeOverlay.querySelector(".hm-snake-center-main");
  snakeSubEl = snakeOverlay.querySelector(".hm-snake-center-sub");

  snakeQuitBtn.addEventListener("click", ()=>stopSnakeGame());
  snakeQuitBtn.addEventListener("contextmenu", (ev)=>{ ev.preventDefault(); });
}

  function showSnakeOverlay(){
    ensureSnakeOverlay();
    document.body.classList.add("snake-mode");
    // Dim studied days + hide goals while snake is running/counting down.
    try { hmGrid?.classList.add("snake-running"); } catch {}
    if (snakeBackdrop) snakeBackdrop.hidden = false;
    if (snakeOverlay) snakeOverlay.hidden = false;
  }

  function hideSnakeOverlay(){
    document.body.classList.remove("snake-mode");
    try { hmGrid?.classList.remove("snake-running"); } catch {}
    if (snakeBackdrop) snakeBackdrop.hidden = true;
    if (!snakeOverlay) return;
    snakeOverlay.hidden = true;
    snakeOverlay.classList.remove("playing");
    snakeOverlay.classList.remove("gameover");
    snakeOverlay.classList.remove("win");
  }

  function updateSnakeScoreUI(){
    const cur = Math.max(0, Math.floor(Number(snakeScore) || 0));
    let hi = Number(Storage?.ui?.snakeHiScore);
    hi = Number.isFinite(hi) ? Math.max(0, Math.floor(hi)) : 0;

    if (cur > hi){
      hi = cur;
      if (Storage && Storage.ui){
        Storage.ui.snakeHiScore = hi;
        Storage.saveUi?.();
      }
    }

    if (snakeScoreCurEl) snakeScoreCurEl.textContent = String(cur);
    if (snakeScoreHiEl) snakeScoreHiEl.textContent = String(hi);

    // Fallback for older DOM shapes (just in case)
    if (!snakeScoreCurEl || !snakeScoreHiEl){
      if (snakeScoreEl) snakeScoreEl.textContent = `Score: ${cur} · Hi: ${hi}`;
    }
  }

  function applySnakeRainbow(cells){
    if (!cells || !cells.length) return;
    const now = Date.now();

    const active = (snakeRainbowUntil && now < snakeRainbowUntil);
    if (!active){
      if (snakeRainbowApplied.size){
        snakeRainbowApplied.forEach(idx=>{
          try{ cells[idx]?.classList.remove("snake-rainbow"); }catch{}
          try{ cells[idx]?.style?.removeProperty?.("--snake-rainbow-phase"); }catch{}
        });
        snakeRainbowApplied.clear();
      }
      snakeRainbowUntil = 0;
      return;
    }

    // Add rainbow to all current snake segments (including head as it moves)
    // Update each segment every tick so longer snakes don't "drift" into a different look.
    for (let i=0;i<snake.length;i++){
      const idx = snake[i];
      const el = cells[idx];
      if (!el) continue;
      try{ el.classList.add("snake-rainbow"); }catch{}
      // Phase-shift the hue animation along the body so the whole snake has the same lively feel.
      try{ el.style.setProperty("--snake-rainbow-phase", String(i)); }catch{}
      snakeRainbowApplied.add(idx);
    }

    // Remove rainbow from segments that have moved off the body
    for (const idx of Array.from(snakeRainbowApplied)){
      if (snakeSet.has(idx)) continue;
      try{ cells[idx]?.classList.remove("snake-rainbow"); }catch{}
      try{ cells[idx]?.style?.removeProperty?.("--snake-rainbow-phase"); }catch{}
      snakeRainbowApplied.delete(idx);
    }
  }

  function snakeFireResize(){
    if (!snakeFireCanvas) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    snakeFireCanvas.width = Math.floor(w * dpr);
    snakeFireCanvas.height = Math.floor(h * dpr);
    snakeFireCanvas.style.width = w + "px";
    snakeFireCanvas.style.height = h + "px";
    if (!snakeFireCtx){
      try{ snakeFireCtx = snakeFireCanvas.getContext("2d"); }catch{ snakeFireCtx = null; }
    }
    if (snakeFireCtx) snakeFireCtx.setTransform(dpr,0,0,dpr,0,0);
  }

  function stopSnakeFireworks(){
    snakeFireActive = false;
    if (snakeFireRaf) cancelAnimationFrame(snakeFireRaf);
    snakeFireRaf = null;
    snakeFireLastTs = 0;
    snakeFireRockets = [];
    snakeFireSparks = [];
    try{ window.removeEventListener("resize", snakeFireResize); }catch{}
    try{ if (snakeFireCtx) snakeFireCtx.clearRect(0,0,window.innerWidth,window.innerHeight); }catch{}
  }

  function startSnakeFireworks(){
    ensureSnakeOverlay();
    if (!snakeFireCanvas) return;
    snakeFireResize();
    if (!snakeFireCtx) return;

    stopSnakeFireworks();
    snakeFireActive = true;

    try{ window.addEventListener("resize", snakeFireResize); }catch{}

    // kick off a few rockets immediately
    for (let i=0;i<3;i++) snakeFireRockets.push(makeSnakeRocket(true));

    snakeFireRaf = requestAnimationFrame(snakeFireTick);
  }

  function makeSnakeRocket(burst){
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const x = Math.random() * w;
    const y = h + 10;
    const vx = (Math.random()-0.5) * 40;
    const vy = -(320 + Math.random()*260);
    const hue = Math.floor(Math.random()*360);
    const apex = (h*0.18) + Math.random()*(h*0.35);
    return { x, y, vx, vy, hue, apex, ttl: burst ? 1.8 : 2.6 };
  }

  function explodeSnakeRocket(r){
    const n = 26 + Math.floor(Math.random()*24);
    for (let i=0;i<n;i++){
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random()*220;
      const vx = Math.cos(a) * sp;
      const vy = Math.sin(a) * sp;
      const life = 0.9 + Math.random()*0.9;
      snakeFireSparks.push({ x:r.x, y:r.y, vx, vy, hue:r.hue, life, max:life });
    }
  }

  function snakeFireTick(ts){
    if (!snakeFireActive || !snakeFireCtx){ return; }
    if (!snakeFireLastTs) snakeFireLastTs = ts;
    const dt = Math.min(0.033, (ts - snakeFireLastTs) / 1000);
    snakeFireLastTs = ts;

    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);

    // soft fade for trails
    snakeFireCtx.fillStyle = "rgba(2,6,23,0.18)";
    snakeFireCtx.fillRect(0,0,w,h);

    // spawn new rockets
    if (snakeFireRockets.length < 6 && Math.random() < 0.10) snakeFireRockets.push(makeSnakeRocket(false));

    const g = 520; // gravity px/s^2

    // update rockets
    for (let i=snakeFireRockets.length-1;i>=0;i--){
      const r = snakeFireRockets[i];
      r.ttl -= dt;
      r.vy += g * dt * 0.12;
      r.x += r.vx * dt;
      r.y += r.vy * dt;

      // draw rocket
      snakeFireCtx.globalAlpha = 0.95;
      snakeFireCtx.fillStyle = `hsl(${r.hue},100%,70%)`;
      snakeFireCtx.beginPath();
      snakeFireCtx.arc(r.x, r.y, 2.2, 0, Math.PI*2);
      snakeFireCtx.fill();

      if (r.y <= r.apex || r.ttl <= 0){
        explodeSnakeRocket(r);
        snakeFireRockets.splice(i,1);
      }
    }

    // update sparks
    for (let i=snakeFireSparks.length-1;i>=0;i--){
      const p = snakeFireSparks[i];
      p.life -= dt;
      if (p.life <= 0){ snakeFireSparks.splice(i,1); continue; }
      p.vy += g * dt * 0.55;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.985;
      p.vy *= 0.985;

      const a = Math.max(0, Math.min(1, p.life / p.max));
      snakeFireCtx.globalAlpha = a;
      snakeFireCtx.fillStyle = `hsl(${p.hue},100%,65%)`;
      snakeFireCtx.beginPath();
      snakeFireCtx.arc(p.x, p.y, 1.9, 0, Math.PI*2);
      snakeFireCtx.fill();
    }

    snakeFireCtx.globalAlpha = 1;
    snakeFireRaf = requestAnimationFrame(snakeFireTick);
  }

  function snakeIdxFromColRow(col, row){
    const c = (col + snakeCols) % snakeCols;
    const r = (row + snakeRows) % snakeRows;
    return c * snakeRows + r;
  }

  function clearSnakeVisuals(cells){
    (snake||[]).forEach(idx=>{
      const el = cells[idx];
      if (!el) return;
      el.classList.remove("snake", "snake-head");
    });
    snake = [];
    snakeSet = new Set();

    if (snakeTargetEl && snakeTargetEl.parentNode) snakeTargetEl.parentNode.removeChild(snakeTargetEl);
    snakeTargetEl = null;
    snakeTargetIdx = -1;

    // Clear target cell marker
    if (snakeTargetCellIdx >= 0 && cells[snakeTargetCellIdx]){
      cells[snakeTargetCellIdx].classList.remove("snake-target-cell");
    }
    snakeTargetCellIdx = -1;
  }

  function placeSnakeTarget(cells){
    if (snakeTargetEl && snakeTargetEl.parentNode) snakeTargetEl.parentNode.removeChild(snakeTargetEl);
    snakeTargetEl = null;
    snakeTargetIdx = -1;

    if (snakeTargetCellIdx >= 0 && cells[snakeTargetCellIdx]){
      cells[snakeTargetCellIdx].classList.remove("snake-target-cell");
    }
    snakeTargetCellIdx = -1;

    const inYear = [];
    for (let i=0;i<cells.length;i++){
      if (cells[i]?.dataset?.inyear === "1") inYear.push(i);
    }
    const candidates = inYear.filter(i=>!snakeSet.has(i));
    if (!candidates.length){
      snakeGameOver = true;
      if (snakeTickTimer) clearInterval(snakeTickTimer);
      snakeTickTimer = null;
      snakeOverlay?.classList.add("gameover");
      snakeCenterEl.textContent = "YOU WIN";
      snakeSubEl.textContent = "Press R to restart, or QUIT.";
      return;
    }

    snakeTargetIdx = candidates[Math.floor(Math.random() * candidates.length)];
    snakeTargetCellIdx = snakeTargetIdx;
    snakeTargetEl = document.createElement("div");
    snakeTargetEl.className = "hm-snake-target";
    snakeTargetEl.textContent = SNAKE_TARGET_EMOJIS[Math.floor(Math.random() * SNAKE_TARGET_EMOJIS.length)];
    try { cells[snakeTargetIdx]?.classList.add("snake-target-cell"); } catch {}
    cells[snakeTargetIdx].appendChild(snakeTargetEl);
  }

  function snakeEatPop(cell){
    if (!cell) return;

    // Head pulse
    try {
      cell.classList.add("snake-eat");
      setTimeout(()=>{ try{ cell.classList.remove("snake-eat"); } catch{} }, 340);
    } catch {}

    // Sparkle pop
    try {
      const pop = document.createElement("div");
      pop.className = "hm-snake-pop";
      pop.textContent = "✨";
      cell.appendChild(pop);
      setTimeout(()=>{ try{ pop.remove(); } catch{} }, 650);
    } catch {}
  }

  function triggerSnakeRainbow(cells){
    if (!cells || !cells.length) return;
    if (snakeRainbowTimer) clearTimeout(snakeRainbowTimer);
    snakeRainbowTimer = null;

    // Randomise base hue each celebration
    try{ hmGrid?.style?.setProperty("--snake-hue-base", String(Math.floor(Math.random()*360))); }catch{}

    // Mark rainbow active for a short window; applied each tick so it follows the moving head
    snakeRainbowUntil = Date.now() + 2000;
    applySnakeRainbow(cells);

    // Ensure it clears even if the game stops (eg win/gameover) during the effect
    snakeRainbowTimer = setTimeout(()=>{
      snakeRainbowUntil = 0;
      applySnakeRainbow(cells);
      snakeRainbowTimer = null;
    }, 2000);
  }

  function startSnakeCountdown(){
    // Only in the real current year
    const now = new Date();
    const curYear = now.getFullYear();
    if (Number(state.viewYear) !== curYear) return;
    if (snakeActive || snakeCountdownActive) return;

    ensureSnakeOverlay();
    stopGoalCycleTimer();
    Tooltip.hide();

    snakeCountdownActive = true;
    snakeGameOver = false;
    snakeScore = Math.min(Math.max(1, computeStreak()), 50);
    updateSnakeScoreUI();

    showSnakeOverlay();
    snakeOverlay.classList.remove("playing", "gameover");
    snakeCenterEl.textContent = "3";
    snakeSubEl.textContent = "Get ready…";

    let remaining = 3;
    if (snakeCountdownTimer) clearInterval(snakeCountdownTimer);
    snakeCountdownTimer = setInterval(()=>{
      remaining -= 1;
      if (remaining > 0){
        snakeCenterEl.textContent = String(remaining);
        return;
      }
      clearInterval(snakeCountdownTimer);
      snakeCountdownTimer = null;
      snakeCenterEl.textContent = "GO";
      setTimeout(()=>startSnakeGame(), 150);
    }, 1000);
  }

  function onSnakeKey(ev){
    if (!snakeActive && !snakeCountdownActive) return;

    const k = ev.key;
    if (k === "Escape"){
      ev.preventDefault();
      stopSnakeGame();
      return;
    }

    // Restart (only after game over)
    if (snakeGameOver && (k === "r" || k === "R" || k === "Enter")){
      ev.preventDefault();
      startSnakeGame();
      return;
    }

    if (!snakeActive || snakeGameOver) return;

    let next = null;
    if (k === "ArrowUp" || k === "w" || k === "W") next = { dx:0, dy:-1 };
    if (k === "ArrowDown" || k === "s" || k === "S") next = { dx:0, dy:1 };
    if (k === "ArrowLeft" || k === "a" || k === "A") next = { dx:-1, dy:0 };
    if (k === "ArrowRight" || k === "d" || k === "D") next = { dx:1, dy:0 };

    if (!next) return;

    // Queue inputs so "down then left quickly" becomes two separate turns across two ticks
    // (prevents unfair neck-collisions when multiple keys are pressed between ticks)
    const base = (snakeDirQueue.length ? snakeDirQueue[snakeDirQueue.length-1] : snakeDir);

    // prevent 180° reversal relative to the most recently committed/queued direction
    if (next.dx === -base.dx && next.dy === -base.dy) return;

    // ignore duplicates
    if (next.dx === base.dx && next.dy === base.dy) return;

    // keep a small buffer for responsiveness without letting spam create weird paths
    if (snakeDirQueue.length < 2) snakeDirQueue.push(next);

    ev.preventDefault();
}

  function snakeTick(cells){
    if (!snakeActive || snakeGameOver) return;

    // Apply at most one queued direction change per movement tick
    if (snakeDirQueue.length) snakeDir = snakeDirQueue.shift();

    const headIdx = snake[0];
    const headCol = Math.floor(headIdx / snakeRows);
    const headRow = headIdx % snakeRows;

    const nextCol = (headCol + snakeDir.dx + snakeCols) % snakeCols;
    const nextRow = (headRow + snakeDir.dy + snakeRows) % snakeRows;
    const nextIdx = nextCol * snakeRows + nextRow;

    const tailIdx = snake[snake.length-1];
    const willEat = (nextIdx === snakeTargetIdx);

    // Self-collision (tail is allowed if it's moving away this tick)
    if (snakeSet.has(nextIdx) && !(!willEat && nextIdx === tailIdx)){
      snakeGameOver = true;
      if (snakeTickTimer) clearInterval(snakeTickTimer);
      snakeTickTimer = null;

      snakeOverlay?.classList.add("gameover");
      snakeCenterEl.textContent = "GAME OVER";
      snakeSubEl.textContent = "Press R to restart, or QUIT.";
      return;
    }

    const prevHead = snake[0];
    // advance
    snake.unshift(nextIdx);
    snakeSet.add(nextIdx);

    // visuals
    const nextCell = cells[nextIdx];
    if (nextCell) nextCell.classList.add("snake", "snake-head");
    const prevHeadCell = cells[prevHead];
    if (prevHeadCell) prevHeadCell.classList.remove("snake-head");

    if (!willEat){
      const removed = snake.pop();
      snakeSet.delete(removed);
      const removedCell = cells[removed];
      if (removedCell) removedCell.classList.remove("snake", "snake-head");
    } else {
      snakeScore += 1;
      updateSnakeScoreUI();

      // Fun feedback
      snakeEatPop(nextCell);
      if (snakeScore % 10 === 0) triggerSnakeRainbow(cells);

      // If the player fills the entire board, celebrate and end the game
      if (snake.length >= cells.length){
        snakeGameOver = true;
        snakeActive = false;
        if (snakeTickTimer) clearInterval(snakeTickTimer);
        snakeTickTimer = null;

        // Remove remaining target if any
        try{ if (snakeTargetEl && snakeTargetEl.parentNode) snakeTargetEl.parentNode.removeChild(snakeTargetEl); }catch{}
        snakeTargetEl = null;
        snakeTargetIdx = -1;

        snakeOverlay?.classList.add("win");
        snakeOverlay?.classList.add("gameover");
        snakeCenterEl.textContent = "CONGRATULATIONS!";
        snakeSubEl.textContent = "You filled every square. Press R to play again, or QUIT.";
        startSnakeFireworks();
        return;
      }

      if (snakeTargetEl && snakeTargetEl.parentNode) snakeTargetEl.parentNode.removeChild(snakeTargetEl);
      snakeTargetEl = null;
      placeSnakeTarget(cells);
    }

    // Keep rainbow effect on the whole body as it moves (including head)
    if (snakeRainbowUntil || snakeRainbowApplied.size) applySnakeRainbow(cells);
  }

  function startSnakeGame(){
    const now = new Date();
    const curYear = now.getFullYear();
    if (Number(state.viewYear) !== curYear){
      // Do not start in other years
      stopSnakeGame();
      return;
    }

    ensureSnakeOverlay();
    showSnakeOverlay();
    snakeOverlay.classList.add("playing");
    snakeOverlay.classList.remove("gameover");
    snakeOverlay.classList.remove("win");
    stopSnakeFireworks();

    // (Re)build from the currently rendered grid
    const cells = Array.from(hmGrid?.querySelectorAll(".hm-cell-btn") || []);
    if (!cells.length){
      stopSnakeGame();
      return;
    }

    // clear any previous run
    clearSnakeVisuals(cells);
    if (snakeTickTimer) clearInterval(snakeTickTimer);
    snakeTickTimer = null;

    snakeCols = parseInt(hmGrid?.dataset?.cols || "0", 10) || Math.ceil(cells.length / 7);
    snakeRows = 7;
    snakeDir = { dx: 1, dy: 0 };
    snakeDirQueue = [];

    const headIdx = cells.findIndex(c=>c.classList.contains("today"));
    if (headIdx < 0){
      stopSnakeGame();
      return;
    }

    const headCol = Math.floor(headIdx / snakeRows);
    const headRow = headIdx % snakeRows;

    const maxLen = Math.min(50, headCol + 1);
    const streakLen = Math.min(Math.max(1, computeStreak()), maxLen);

    snake = [];
    for (let i=0;i<streakLen;i++){
      snake.push(snakeIdxFromColRow(headCol - i, headRow));
    }
    snakeSet = new Set(snake);

    // visuals
    snake.forEach(idx=>cells[idx]?.classList.add("snake"));
    cells[snake[0]]?.classList.add("snake-head");

    snakeScore = streakLen;
    snakeGameOver = false;
    updateSnakeScoreUI();

    // Hide center text while playing
    snakeCenterEl.textContent = "";
    snakeSubEl.textContent = "";

    placeSnakeTarget(cells);

    snakeCountdownActive = false;
    snakeActive = true;

    document.addEventListener("keydown", onSnakeKey, true);

    const speed = 140; // ms
    snakeTickTimer = setInterval(()=>snakeTick(cells), speed);
  }

  function stopSnakeGame(){
    // cancel any pending holds/countdown
    if (snakeHoldTimer) clearTimeout(snakeHoldTimer);
    snakeHoldTimer = null;

    if (snakeCountdownTimer) clearInterval(snakeCountdownTimer);
    snakeCountdownTimer = null;

    if (snakeTickTimer) clearInterval(snakeTickTimer);
    snakeTickTimer = null;

    if (snakeRainbowTimer) clearTimeout(snakeRainbowTimer);
    snakeRainbowTimer = null;

	  stopSnakeFireworks();
	  snakeRainbowUntil = 0;

    snakeActive = false;
    snakeCountdownActive = false;
    snakeGameOver = false;

    document.removeEventListener("keydown", onSnakeKey, true);

	  const cells = Array.from(hmGrid?.querySelectorAll(".hm-cell-btn") || []);
	  if (cells.length) applySnakeRainbow(cells);
    if (cells.length) clearSnakeVisuals(cells);

    hideSnakeOverlay();
    startGoalCycleIfNeeded();
  }

  function applyStatsUI(){
    hmShowFirstVisit.checked = !!state.showFirstVisit;
    hmShowStreak.checked = !!state.showStreak;
    hmShowTotal.checked = !!state.showTotal;
    hmShowMonthTitles.checked = !!state.showMonthTitles;

    hmFirstVisitWrap.style.display = state.showFirstVisit ? "" : "none";
    hmStreakWrap.style.display = state.showStreak ? "" : "none";
    hmTotalWrap.style.display = state.showTotal ? "" : "none";
  }

  function renderStats(){
    const first = computeFirstVisit();
    hmFirstVisitVal.textContent = first ? Utils.formatDMYShort(Utils.ymdToDate(first)) : "—";
    hmStreakVal.textContent = String(computeStreak());
    hmTotalVal.textContent = String(computeTotal());
  }

  function buildMonthLabels(year, shift, cols){
    hmMonthLabels.innerHTML = "";
    if (!state.showMonthTitles){
      hmMonthLabels.style.display = "none";
      return;
    }
    hmMonthLabels.style.display = "grid";
    hmMonthLabels.style.gridTemplateColumns = `repeat(${cols}, var(--hm-cell))`;
    hmMonthLabels.style.columnGap = "var(--hm-gap)";

    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const starts = [];
    for (let m=0;m<12;m++){
      const d = new Date(year,m,1);
      const dayOfYear = Math.floor((d - new Date(year,0,1)) / (24*60*60*1000));
      const col = Math.floor((shift + dayOfYear) / 7);
      starts.push({m,col});
    }

    for (let i=0;i<starts.length;i++){
      const cur = starts[i];
      const nextCol = (i < starts.length-1) ? starts[i+1].col : cols;
      const span = Math.max(1, nextCol - cur.col);

      const el = document.createElement("div");
      el.className = "hm-month-label";
      el.textContent = monthNames[cur.m];
      el.style.gridColumn = `${cur.col + 1} / span ${span}`;
      hmMonthLabels.appendChild(el);
    }
  }

  function goalsForYMD(ymd){
    return (state.goals||[]).filter(g=>g.ymd===ymd);
  }

  // ------------------------
  // Monthly totals modal
  // ------------------------
  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function monthKeyFromDate(d){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    return `${y}-${m}`;
  }

  function parseMonthKey(k){
    const s = String(k || "");
    const m = s.match(/^(\d{4})-(\d{2})$/);
    if (!m) return null;
    const year = Number(m[1]);
    const monthIndex = Math.max(0, Math.min(11, Number(m[2]) - 1));
    return { year, monthIndex };
  }

  function monthKeyAdd(k, deltaMonths){
    const parsed = parseMonthKey(k);
    if (!parsed) return monthKeyFromDate(new Date());
    const d = new Date(parsed.year, parsed.monthIndex, 1);
    d.setMonth(d.getMonth() + Number(deltaMonths || 0));
    return monthKeyFromDate(d);
  }

  function monthLabel(k){
    const p = parseMonthKey(k);
    if (!p) return "—";
    return `${MONTH_NAMES[p.monthIndex]} ${p.year}`;
  }

  function computeMonthTotals(k){
    const p = parseMonthKey(k);
    if (!p) return { grammar: 0, sentences: 0, crammed: 0, days: 0 };

    const prefix = `${p.year}-${String(p.monthIndex+1).padStart(2,"0")}-`;
    const dsObj = state.dayStats && typeof state.dayStats === "object" ? state.dayStats : {};
    let sentences = 0;
    let crammed = 0;
    const grammarSet = new Set();
    const daysSet = new Set();

    Object.keys(dsObj).forEach(ymd => {
      if (!String(ymd).startsWith(prefix)) return;
      const ds = dsObj[ymd];
      if (!ds || typeof ds !== "object") return;

      const s = Math.max(0, Number(ds.srsSentences || 0));
      const c = Math.max(0, Number(ds.crammed || 0));
      const gk = ds.srsGrammarKeys && typeof ds.srsGrammarKeys === "object" ? ds.srsGrammarKeys : null;

      if (s <= 0 && c <= 0 && countGrammarKeys(gk) === 0) return;

      sentences += s;
      crammed += c;
      daysSet.add(ymd);
      if (gk) Object.keys(gk).forEach(key => grammarSet.add(key));
    });

    return { grammar: grammarSet.size, sentences, crammed, days: daysSet.size };
  }

  function listMonthsWithAnyTotals(){
    const dsObj = state.dayStats && typeof state.dayStats === "object" ? state.dayStats : {};
    const set = new Set();
    Object.keys(dsObj).forEach(ymd => {
      const ds = dsObj[ymd];
      if (!ds || typeof ds !== "object") return;
      const has = (Math.max(0, Number(ds.srsSentences || 0)) > 0) || (Math.max(0, Number(ds.crammed || 0)) > 0) || (countGrammarKeys(ds.srsGrammarKeys) > 0);
      if (!has) return;
      const mk = String(ymd).slice(0,7);
      if (/^\d{4}-\d{2}$/.test(mk)) set.add(mk);
    });
    const arr = Array.from(set);
    arr.sort((a,b)=> b.localeCompare(a));
    return arr;
  }

  function buildMonthSummaryLine(t){
    const parts = [];
    if (t.grammar > 0) parts.push(`Grammar ${t.grammar}`);
    if (t.sentences > 0) parts.push(`Sentences ${t.sentences}`);
    if (t.crammed > 0) parts.push(`Crammed ${t.crammed}`);
    if (!parts.length) parts.push("No totals yet");
    return parts.join(" · ");
  }

  function renderMonthlyList(){
    if (!hmMonthlyList) return;
    hmMonthlyList.innerHTML = "";
    const months = listMonthsWithAnyTotals();
    if (!months.length){
      const d = document.createElement("div");
      d.className = "modal-hint";
      d.textContent = "No study totals yet.";
      hmMonthlyList.appendChild(d);
      return;
    }

    months.forEach(mk => {
      const totals = computeMonthTotals(mk);
      const item = document.createElement("div");
      item.className = "hm-monthly-item" + (mk === selectedMonthKey ? " active" : "");
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");

      const left = document.createElement("div");
      const m = document.createElement("div");
      m.className = "m";
      m.textContent = monthLabel(mk);
      const s = document.createElement("div");
      s.className = "s";
      s.textContent = buildMonthSummaryLine(totals);
      left.appendChild(m);
      left.appendChild(s);

      const right = document.createElement("div");
      right.className = "s";
      right.textContent = totals.days > 0 ? `${totals.days} days` : "";

      item.appendChild(left);
      item.appendChild(right);

      const select = () => {
        selectedMonthKey = mk;
        renderMonthlyList();
        renderMonthlyRight();
      };
      item.addEventListener("click", select);
      item.addEventListener("keydown", (ev)=>{
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(); }
      });

      hmMonthlyList.appendChild(item);
    });
  }

  function fillBars(container, values, maxVal, labelPrefix){
    if (!container) return;
    container.innerHTML = "";
    const max = Math.max(1, Number(maxVal || 1));
    (values || []).forEach(v => {
      const bar = document.createElement("div");
      bar.className = "hm-monthly-bar" + (v.value <= 0 ? " zero" : "");
      const pct = Math.max(0, Math.min(100, (v.value / max) * 100));
      bar.style.height = `${pct}%`;
      bar.title = `${labelPrefix} ${v.dateLabel}: ${v.value}`;
      container.appendChild(bar);
    });
  }

  function renderMonthlyRight(){
    if (!hmMonthlyLabel || !hmMonthlySummary) return;
    if (!selectedMonthKey) selectedMonthKey = monthKeyFromDate(new Date());

    hmMonthlyLabel.textContent = monthLabel(selectedMonthKey);

    const totals = computeMonthTotals(selectedMonthKey);
    const lines = [];
    if (totals.days > 0) lines.push(`Days with activity: ${totals.days}`);
    if (totals.grammar > 0) lines.push(`Grammar: ${totals.grammar}`);
    if (totals.sentences > 0) lines.push(`Sentences: ${totals.sentences}`);
    if (totals.crammed > 0) lines.push(`Crammed: ${totals.crammed}`);
    hmMonthlySummary.textContent = lines.length ? lines.join(" · ") : "No totals for this month.";

    const p = parseMonthKey(selectedMonthKey);
    if (!p) return;
    const daysInMonth = new Date(p.year, p.monthIndex + 1, 0).getDate();

    const gramVals = [];
    const senVals = [];
    const cramVals = [];
    let gramMax = 0, senMax = 0, cramMax = 0;
    for (let day=1; day<=daysInMonth; day++){
      const ymd = `${p.year}-${String(p.monthIndex+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
      const dateObj = new Date(p.year, p.monthIndex, day);
      const dateLabel = Utils.formatDMYShort(dateObj);
      const c = getCountsForYMD(ymd);
      gramMax = Math.max(gramMax, c.grammar);
      senMax = Math.max(senMax, c.sentences);
      cramMax = Math.max(cramMax, c.crammed);
      gramVals.push({ value: c.grammar, dateLabel });
      senVals.push({ value: c.sentences, dateLabel });
      cramVals.push({ value: c.crammed, dateLabel });
    }

    fillBars(hmMonthlyBarsGrammar, gramVals, gramMax, "Grammar");
    fillBars(hmMonthlyBarsSentences, senVals, senMax, "Sentences");
    fillBars(hmMonthlyBarsCram, cramVals, cramMax, "Crammed");
  }

  function openMonthlyModal(){
    if (!monthlyBackdrop) return;
    selectedMonthKey = selectedMonthKey || monthKeyFromDate(new Date());
    renderMonthlyList();
    renderMonthlyRight();
    monthlyBackdrop.hidden = false;
  }

  function closeMonthlyModal(){
    if (!monthlyBackdrop) return;
    monthlyBackdrop.hidden = true;
  }

  function tooltipTextForDay(d, ymd){
    const lines = [Utils.formatDMYShort(d)];
    const goals = goalsForYMD(ymd);
    if (goals.length){
      goals.forEach(g=>{
        const msg = (g.text||"").trim();
        lines.push(`${g.emoji || "🎯"} ${msg}`.trim());
      });
    }

    // Activity totals (only show non-zero lines)
    const counts = getCountsForYMD(ymd);
    if (counts.grammar > 0) lines.push(`Grammar: ${counts.grammar}`);
    if (counts.sentences > 0) lines.push(`Sentences: ${counts.sentences}`);
    if (counts.crammed > 0) lines.push(`Crammed: ${counts.crammed}`);
    return lines.join("\n");
  }

  function stopGoalCycleTimer(){
    if (goalCycleTimer) clearInterval(goalCycleTimer);
    goalCycleTimer = null;
    goalCycleToken++; // invalidate any pending setTimeout fades
  }

  function resetGoalCycle(){
    stopGoalCycleTimer();
    goalMarkers = [];
  }

  function startGoalCycleIfNeeded(){
    // keep goalMarkers (built during renderYear); just restart the timer
    stopGoalCycleTimer();

    const multi = goalMarkers.filter(m => Array.isArray(m.emojis) && m.emojis.length > 1);
    if (!multi.length) return;

    const token = goalCycleToken;
    const FADE_MS = 260; // should match/approx CSS transition time

    goalCycleTimer = setInterval(()=>{
      multi.forEach(m=>{
        if (!m.emojiEl || !m.emojiEl.isConnected) return;

        const len = m.emojis.length;
        const next = (m.idx + 1) % len;

        // fade out -> swap -> fade in
        m.emojiEl.classList.add("fading");

        setTimeout(()=>{
          if (token !== goalCycleToken) return;
          if (!m.emojiEl || !m.emojiEl.isConnected) return;

          m.idx = next;
          m.emojiEl.textContent = m.emojis[m.idx];

          // give the browser a frame to paint the swapped emoji at opacity 0
          requestAnimationFrame(()=>{
            if (token !== goalCycleToken) return;
            if (!m.emojiEl || !m.emojiEl.isConnected) return;
            m.emojiEl.classList.remove("fading");
          });
        }, FADE_MS);
      });
    }, 2000);
  }


  function renderYear(year){
    resetGoalCycle();

    const totalDays = daysInYear(year);
    const jan1 = new Date(year,0,1);
    const shift = dowMon0(jan1);
    const totalCells = shift + totalDays;
    const cols = Math.ceil(totalCells / 7);

    // Expose current grid geometry for the snake game
    if (hmGrid){
      hmGrid.dataset.year = String(year);
      hmGrid.dataset.cols = String(cols);
      hmGrid.dataset.rows = "7";
    }

    fitHeatmapToWidth(cols);
    hmYearLabel.textContent = String(year);

    hmGrid.innerHTML = "";
    const now = new Date();
    const todayYMD = Utils.dateToYMD(now);
    const curYearForSnake = now.getFullYear();

    buildMonthLabels(year, shift, cols);

    for (let col=0; col<cols; col++){
      for (let row=0; row<7; row++){
        const linear = col*7 + row;
        const dayOffset = linear - shift;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "hm-cell-btn";

        if (dayOffset < 0 || dayOffset >= totalDays){
          btn.classList.add("out");
          btn.dataset.inyear = "0";
          btn.tabIndex = -1;
          hmGrid.appendChild(btn);
          continue;
        }

        const d = new Date(year,0,1 + dayOffset);
        const ymd = Utils.dateToYMD(d);
        btn.dataset.inyear = "1";
        btn.dataset.ymd = ymd;

        const visited = !!state.visitedDays[ymd];
        if (visited) btn.classList.add("visited");
        if (ymd === todayYMD) btn.classList.add("today");
        if (d.getDate() === 1) btn.classList.add("month-boundary");

        btn.setAttribute("aria-label", `Study log ${Utils.formatDMYShort(d)}`);

        // Goal overlay (non-interactive)
        const goals = goalsForYMD(ymd);
        if (goals.length){
          const holder = document.createElement("div");
          holder.className = "hm-goal";

          const emojiEl = document.createElement("span");
          emojiEl.className = "hm-goal-emoji";
          const emojis = goals.map(g=>g.emoji || "🎯");
          emojiEl.textContent = emojis[0];

          holder.appendChild(emojiEl);
          btn.appendChild(holder);

          goalMarkers.push({ emojiEl, emojis, idx:0 });
        }

        btn.addEventListener("click",(ev)=>{
          ev.stopPropagation();
          // prevent toggles during the snake mini-game, and suppress the post-hold click
          if (snakeActive || snakeCountdownActive || Date.now() < suppressClicksUntil) return;

          if (state.visitedDays[ymd]) delete state.visitedDays[ymd];
          else state.visitedDays[ymd] = true;
          save();
          btn.classList.toggle("visited", !!state.visitedDays[ymd]);
          renderStats();
        });

        btn.addEventListener("mousemove",(ev)=>{
          if (snakeActive || snakeCountdownActive) return;
          Tooltip.show(tooltipTextForDay(d, ymd), ev.clientX, ev.clientY);
        });
        btn.addEventListener("mouseleave", ()=>{
          if (snakeActive || snakeCountdownActive) return;
          Tooltip.hide();
        });

        // Snake easter egg: hold left click on today's cell for 5 seconds
        if (year === curYearForSnake && ymd === todayYMD){
          const cancelHold = ()=>{
            if (snakeHoldTimer) clearTimeout(snakeHoldTimer);
            snakeHoldTimer = null;
          };

          btn.addEventListener("pointerdown", (ev)=>{
            if (ev.button !== 0) return;
            if (snakeActive || snakeCountdownActive) return;
            cancelHold();
            try { btn.setPointerCapture(ev.pointerId); } catch {}
            snakeHoldTimer = setTimeout(()=>{
              snakeHoldTimer = null;
              suppressClicksUntil = Date.now() + 1500;
              startSnakeCountdown();
            }, 5000);
          }, { passive:true });

          btn.addEventListener("pointerup", cancelHold);
          btn.addEventListener("pointercancel", cancelHold);
          btn.addEventListener("pointerleave", cancelHold);
        }

        hmGrid.appendChild(btn);
      }
    }

    startGoalCycleIfNeeded();
  }

  function render(){
    if (!state.visible) return;
    const year = Number(state.viewYear || new Date().getFullYear());
    state.viewYear = year;
    save();
    renderYear(year);
  }

  function renderPaletteOptions(){
    hmPaletteOptions.innerHTML = "";
    HEATMAP_PALETTES.forEach(p=>{
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hm-palette-btn";
      btn.classList.toggle("active", state.paletteKey===p.key);

      const sw = document.createElement("span");
      sw.className = "hm-palette-swatch";
      sw.style.setProperty("--hm-border", p.border);
      sw.style.setProperty("--hm-fill", p.fill);

      const label = document.createElement("span");
      label.textContent = p.name;

      btn.appendChild(sw);
      btn.appendChild(label);

      btn.addEventListener("click", ()=>{
        state.paletteKey = p.key;
        save();
        applyPalette();
        renderPaletteOptions();
        render();
      });

      hmPaletteOptions.appendChild(btn);
    });
  }

  function goalsSort(){
    state.goals.sort((a,b)=>String(a.ymd).localeCompare(String(b.ymd)));
  }

  function renderGoalsList(){
    goalsListEl.innerHTML = "";
    goalsSort();

    if (!state.goals.length){
      const hint = document.createElement("div");
      hint.className = "modal-hint";
      hint.textContent = "No goals yet.";
      goalsListEl.appendChild(hint);
      return;
    }

    state.goals.forEach(g=>{
      const item = document.createElement("div");
      item.className = "hm-goal-item";

      const meta = document.createElement("div");
      meta.className = "meta";

      const line1 = document.createElement("div");
      line1.className = "line1";
      line1.textContent = `${g.ymd} • ${(g.emoji||"🎯")}`;

      const line2 = document.createElement("div");
      line2.className = "line2";
      line2.textContent = String(g.text||"").trim() || "(no text)";

      meta.appendChild(line1);
      meta.appendChild(line2);

      const actions = document.createElement("div");
      actions.className = "actions";

      const edit = document.createElement("button");
      edit.className = "modal-btn";
      edit.textContent = "Edit";
      edit.addEventListener("click", ()=>openGoalEditor(g));

      const del = document.createElement("button");
      del.className = "modal-btn";
      del.textContent = "Delete";
      del.addEventListener("click", ()=>{
        state.goals = state.goals.filter(x=>x.id!==g.id);
        save();
        renderGoalsList();
        render();
      });

      actions.appendChild(edit);
      actions.appendChild(del);

      item.appendChild(meta);
      item.appendChild(actions);

      goalsListEl.appendChild(item);
    });
  }

  function newGoalId(){
    return `g_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  }

  function openGoalEditor(goal){
    goalEditorEl.hidden = false;
    const isEdit = !!goal;

    const ymd = goal?.ymd || Utils.dateToYMD(new Date());
    const emoji = goal?.emoji || "🎯";
    const text = goal?.text || "";

    goalEditorEl.innerHTML = `
      <div class="row">
        <input id="hmGoalDate" type="date" value="${Utils.escapeHtml(ymd)}" />
        <input id="hmGoalEmoji" class="emoji" type="text" inputmode="text" maxlength="4" value="${Utils.escapeHtml(emoji)}" />
        <input id="hmGoalText" type="text" placeholder="Goal text…" value="${Utils.escapeHtml(text)}" />
      </div>
      <div class="btns">
        <button id="hmGoalSave" class="modal-btn primary">${isEdit ? "Save changes" : "Add goal"}</button>
        <button id="hmGoalCancel" class="modal-btn">Cancel</button>
      </div>
    `;

    const dateEl = Utils.qs("#hmGoalDate", goalEditorEl);
    const emojiEl = Utils.qs("#hmGoalEmoji", goalEditorEl);
    const textEl = Utils.qs("#hmGoalText", goalEditorEl);

    // Force ONE emoji
    emojiEl.addEventListener("input", ()=>{
      const one = Utils.firstGrapheme(emojiEl.value);
      emojiEl.value = one;
    });

    Utils.qs("#hmGoalCancel", goalEditorEl).addEventListener("click", ()=>{
      goalEditorEl.hidden = true;
      goalEditorEl.innerHTML = "";
    });

    Utils.qs("#hmGoalSave", goalEditorEl).addEventListener("click", ()=>{
      const y = Utils.dateToYMD(Utils.ymdToDate(dateEl.value));
      const e = Utils.firstGrapheme(emojiEl.value) || "🎯";
      const t = String(textEl.value||"").trim();

      if (goal){
        goal.ymd = y;
        goal.emoji = e;
        goal.text = t;
      } else {
        state.goals.push({ id:newGoalId(), ymd:y, emoji:e, text:t });
      }

      save();
      renderGoalsList();
      render();
      goalEditorEl.hidden = true;
      goalEditorEl.innerHTML = "";
    });
  }

  Heatmap.setVisible = (on) => {
    state.visible = !!on;
    save();
    applyVisibility();
    if (state.visible){
      renderStats();
      render();
    }
  };

  Heatmap.exportState = () => JSON.parse(JSON.stringify(state));
  Heatmap.importState = (incoming) => {
    if (!incoming || typeof incoming !== "object") return;
    state = { ...state, ...incoming };
    if (!state.visitedDays || typeof state.visitedDays !== "object") state.visitedDays = {};
    if (!state.dayStats || typeof state.dayStats !== "object") state.dayStats = {};
    if (!Array.isArray(state.goals)) state.goals = [];
    if (typeof state.visible !== "boolean") state.visible = true;
    save();

    applyPalette();
    applyVisibility();
    applyStatsUI();
    renderPaletteOptions();
    renderGoalsList();
    renderStats();
    render();
  };

  Heatmap.init = () => {
    panel = Utils.qs("#heatmapPanel");
    openSettingsBtn = Utils.qs("#openHeatmapSettingsBtn");
    openMonthlyBtn = Utils.qs("#openHeatmapMonthlyBtn");
    hmGrid = Utils.qs("#hmGrid");
    hmMonthLabels = Utils.qs("#hmMonthLabels");
    hmPrevYearBtn = Utils.qs("#hmPrevYearBtn");
    hmNextYearBtn = Utils.qs("#hmNextYearBtn");
    hmYearLabel = Utils.qs("#hmYearLabel");

    hmFirstVisitWrap = Utils.qs("#hmFirstVisitWrap");
    hmStreakWrap = Utils.qs("#hmStreakWrap");
    hmTotalWrap = Utils.qs("#hmTotalWrap");
    hmFirstVisitVal = Utils.qs("#hmFirstVisitVal");
    hmStreakVal = Utils.qs("#hmStreakVal");
    hmTotalVal = Utils.qs("#hmTotalVal");

    settingsBackdrop = Utils.qs("#heatmapSettingsModalBackdrop");
    closeSettingsBtn = Utils.qs("#closeHeatmapSettingsBtn");
    hmShowFirstVisit = Utils.qs("#hmShowFirstVisit");
    hmShowStreak = Utils.qs("#hmShowStreak");
    hmShowTotal = Utils.qs("#hmShowTotal");
    hmShowMonthTitles = Utils.qs("#hmShowMonthTitles");
    hmPaletteOptions = Utils.qs("#hmPaletteOptions");

    monthlyBackdrop = Utils.qs("#heatmapMonthlyModalBackdrop");
    closeMonthlyBtn = Utils.qs("#closeHeatmapMonthlyBtn");
    hmMonthlyList = Utils.qs("#hmMonthlyList");
    hmMonthlyPrevBtn = Utils.qs("#hmMonthlyPrevBtn");
    hmMonthlyNextBtn = Utils.qs("#hmMonthlyNextBtn");
    hmMonthlyLabel = Utils.qs("#hmMonthlyLabel");
    hmMonthlySummary = Utils.qs("#hmMonthlySummary");
    hmMonthlyBarsGrammar = Utils.qs("#hmMonthlyBarsGrammar");
    hmMonthlyBarsSentences = Utils.qs("#hmMonthlyBarsSentences");
    hmMonthlyBarsCram = Utils.qs("#hmMonthlyBarsCram");

    goalsListEl = Utils.qs("#hmGoalsList");
    addGoalBtn = Utils.qs("#hmAddGoalBtn");
    goalEditorEl = Utils.qs("#hmGoalEditor");

    load();
    applyPalette();
    applyVisibility();

    // Auto record real "today" visit
    recordTodayVisit();

    applyStatsUI();
    renderPaletteOptions();
    renderGoalsList();
    renderStats();
    render();

    openSettingsBtn?.addEventListener("click", ()=>{ settingsBackdrop.hidden = false; });
    closeSettingsBtn?.addEventListener("click", ()=>{ settingsBackdrop.hidden = true; goalEditorEl.hidden = true; goalEditorEl.innerHTML=""; });
    settingsBackdrop?.addEventListener("click",(ev)=>{ if (ev.target === settingsBackdrop) { settingsBackdrop.hidden = true; goalEditorEl.hidden = true; goalEditorEl.innerHTML=""; } });

    openMonthlyBtn?.addEventListener("click", ()=>openMonthlyModal());
    closeMonthlyBtn?.addEventListener("click", ()=>closeMonthlyModal());
    monthlyBackdrop?.addEventListener("click",(ev)=>{ if (ev.target === monthlyBackdrop) closeMonthlyModal(); });

    hmMonthlyPrevBtn?.addEventListener("click", ()=>{
      selectedMonthKey = monthKeyAdd(selectedMonthKey || monthKeyFromDate(new Date()), -1);
      renderMonthlyList();
      renderMonthlyRight();
    });
    hmMonthlyNextBtn?.addEventListener("click", ()=>{
      selectedMonthKey = monthKeyAdd(selectedMonthKey || monthKeyFromDate(new Date()), +1);
      renderMonthlyList();
      renderMonthlyRight();
    });

    hmShowFirstVisit.addEventListener("change", ()=>{ state.showFirstVisit = !!hmShowFirstVisit.checked; save(); applyStatsUI(); });
    hmShowStreak.addEventListener("change", ()=>{ state.showStreak = !!hmShowStreak.checked; save(); applyStatsUI(); });
    hmShowTotal.addEventListener("change", ()=>{ state.showTotal = !!hmShowTotal.checked; save(); applyStatsUI(); });
    hmShowMonthTitles.addEventListener("change", ()=>{ state.showMonthTitles = !!hmShowMonthTitles.checked; save(); render(); });

    hmPrevYearBtn.addEventListener("click", ()=>{
      if (snakeActive || snakeCountdownActive) return;
      state.viewYear = Number(state.viewYear) - 1;
      save();
      render();
    });
    hmNextYearBtn.addEventListener("click", ()=>{
      if (snakeActive || snakeCountdownActive) return;
      state.viewYear = Number(state.viewYear) + 1;
      save();
      render();
    });

    addGoalBtn.addEventListener("click", ()=>openGoalEditor(null));

    window.addEventListener("resize", ()=>{
      if (!state.visible) return;
      if (snakeActive || snakeCountdownActive) return;
      render();
    });
  };

  window.App.Heatmap = Heatmap;
  window.Heatmap = Heatmap; // alias for your export/import snippet
})();

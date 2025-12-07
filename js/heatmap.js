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

  let panel, openSettingsBtn, hmGrid, hmMonthLabels, hmPrevYearBtn, hmNextYearBtn, hmYearLabel;
  let hmFirstVisitWrap, hmStreakWrap, hmTotalWrap, hmFirstVisitVal, hmStreakVal, hmTotalVal;

  let settingsBackdrop, closeSettingsBtn, hmShowFirstVisit, hmShowStreak, hmShowTotal, hmShowMonthTitles, hmPaletteOptions;
  let goalsListEl, addGoalBtn, goalEditorEl;

  let goalCycleTimer = null;
  let goalCycleToken = 0; // bump to cancel pending fades on re-render
  let goalMarkers = []; // {emojiEl, emojis, idx}

  let state = {
    visible: true,                // enabled by default
    viewYear: new Date().getFullYear(),
    showMonthTitles: false,
    showFirstVisit: true,
    showStreak: true,
    showTotal: true,
    paletteKey: "mint",
    visitedDays: {},
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

  function tooltipTextForDay(d, ymd){
    const lines = [Utils.formatDMYShort(d)];
    const goals = goalsForYMD(ymd);
    if (goals.length){
      goals.forEach(g=>{
        const msg = (g.text||"").trim();
        lines.push(`${g.emoji || "🎯"} ${msg}`.trim());
      });
    }
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

    fitHeatmapToWidth(cols);
    hmYearLabel.textContent = String(year);

    hmGrid.innerHTML = "";
    const todayYMD = Utils.dateToYMD(new Date());

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
          btn.tabIndex = -1;
          hmGrid.appendChild(btn);
          continue;
        }

        const d = new Date(year,0,1 + dayOffset);
        const ymd = Utils.dateToYMD(d);

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
          if (state.visitedDays[ymd]) delete state.visitedDays[ymd];
          else state.visitedDays[ymd] = true;
          save();
          btn.classList.toggle("visited", !!state.visitedDays[ymd]);
          renderStats();
        });

        btn.addEventListener("mousemove",(ev)=>{
          Tooltip.show(tooltipTextForDay(d, ymd), ev.clientX, ev.clientY);
        });
        btn.addEventListener("mouseleave", Tooltip.hide);

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

    hmShowFirstVisit.addEventListener("change", ()=>{ state.showFirstVisit = !!hmShowFirstVisit.checked; save(); applyStatsUI(); });
    hmShowStreak.addEventListener("change", ()=>{ state.showStreak = !!hmShowStreak.checked; save(); applyStatsUI(); });
    hmShowTotal.addEventListener("change", ()=>{ state.showTotal = !!hmShowTotal.checked; save(); applyStatsUI(); });
    hmShowMonthTitles.addEventListener("change", ()=>{ state.showMonthTitles = !!hmShowMonthTitles.checked; save(); render(); });

    hmPrevYearBtn.addEventListener("click", ()=>{ state.viewYear = Number(state.viewYear) - 1; save(); render(); });
    hmNextYearBtn.addEventListener("click", ()=>{ state.viewYear = Number(state.viewYear) + 1; save(); render(); });

    addGoalBtn.addEventListener("click", ()=>openGoalEditor(null));

    window.addEventListener("resize", ()=>{ if (state.visible) render(); });
  };

  window.App.Heatmap = Heatmap;
  window.Heatmap = Heatmap; // alias for your export/import snippet
})();

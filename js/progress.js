(function(){
  window.App = window.App || {};
  const { CONST, Utils, Storage, Heatmap } = window.App;

  const Progress = {};

  // This modal shows **SRS progress** only.
  // - Denominator is the full JLPT level grammar list
  // - Started counts ONLY active SRS items (keys present in srs.grammarKeys)
  // - Retired items are excluded from totals (and shown separately)
  // - Ignores stars / seenExamples entirely
  // - Does NOT count "paused" items that only exist in cardsByKey

  let openBtn, backdrop, closeBtn, contentEl, celebrationBtn;
  let celebrationLevelsNow = [];


  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  function normalizeSrs(){
    const srs = (Storage.userData && Storage.userData.srs && typeof Storage.userData.srs === "object")
      ? Storage.userData.srs
      : {};
    const keys = Array.isArray(srs.grammarKeys) ? srs.grammarKeys.map(String) : [];
    const cardsByKey = (srs.cardsByKey && typeof srs.cardsByKey === "object") ? srs.cardsByKey : {};
    const fs = (srs.fsrsSettings && typeof srs.fsrsSettings === "object") ? srs.fsrsSettings : {};
    return { keys, cardsByKey, fs };
  }


  function ensureSrsLevelCompletions(){
    const ud = Storage.userData || (Storage.userData = {});
    if (!ud.achievements || typeof ud.achievements !== "object") ud.achievements = {};
    const ach = ud.achievements;

    if (!Array.isArray(ach.srsLevelCompletions)) ach.srsLevelCompletions = [];
    const allowed = new Set((CONST.LEVEL_ORDER || ["N5","N4","N3","N2","N1"]).map(String));
    const seen = new Set();
    ach.srsLevelCompletions = ach.srsLevelCompletions
      .map(x=>String(x))
      .filter(x=>allowed.has(x))
      .filter(x=>{ if (seen.has(x)) return false; seen.add(x); return true; });
    return ach.srsLevelCompletions;
  }

  function markSrsLevelCompleted(level){
    const arr = ensureSrsLevelCompletions();
    const lvl = String(level);
    if (arr.includes(lvl)) return false;
    arr.push(lvl);
    Storage.saveUserData?.();
    return true;
  }

  function ensureSrsLevelCelebrated(){
    const ud = Storage.userData || (Storage.userData = {});
    if (!ud.achievements || typeof ud.achievements !== "object") ud.achievements = {};
    const ach = ud.achievements;

    if (!Array.isArray(ach.srsLevelCelebrated)) ach.srsLevelCelebrated = [];
    const allowed = new Set((CONST.LEVEL_ORDER || ["N5","N4","N3","N2","N1"]).map(String));
    const seen = new Set();
    ach.srsLevelCelebrated = ach.srsLevelCelebrated
      .map(x=>String(x))
      .filter(x=>allowed.has(x))
      .filter(x=>{ if (seen.has(x)) return false; seen.add(x); return true; });
    return ach.srsLevelCelebrated;
  }

  function markSrsLevelCelebrated(level){
    const arr = ensureSrsLevelCelebrated();
    const lvl = String(level);
    if (arr.includes(lvl)) return false;
    arr.push(lvl);
    Storage.saveUserData?.();
    return true;
  }


  function isLevelComplete(s){
    return !!(s && s.activeTotal > 0 && s.remaining === 0 && s.started >= s.activeTotal && s.pct >= 100);
  }

  function intervalDaysFromCard(card){
    if (!card || !card.last || !card.due) return 0;
    try{
      const lastDate = Utils.ymdToDate(card.last);
      const dueDate = Utils.ymdToDate(card.due);
      const days = Math.round((dueDate.getTime() - lastDate.getTime()) / ONE_DAY_MS);
      return Number.isFinite(days) ? Math.max(0, days) : 0;
    }catch(_e){
      return 0;
    }
  }

  function isAutoRetired(card, fs){
    if (!card) return false;
    if (!fs || !fs.retireEnabled) return false;
    const limit = Number(fs.retireAfterDays);
    if (!Number.isFinite(limit) || limit <= 0) return false;
    return intervalDaysFromCard(card) > limit;
  }

  function isRetired(card, fs){
    // Manual retire wins
    if (card && card.known === true) return true;
    return isAutoRetired(card, fs);
  }

  function hasHistory(card){
    if (!card) return false;
    const reps = Number(card.reps || 0);
    return (Number.isFinite(reps) && reps > 0) || !!card.last || !!card.started;
  }

  function calcLevelStats(level){
    const { keys, cardsByKey, fs } = normalizeSrs();

    const prefix = `${level}_`;

    // Total grammar points available for this JLPT level (from CSV)
    const totalAll = (window.App.State && window.App.State.byLevel && window.App.State.byLevel[level])
      ? window.App.State.byLevel[level].length
      : 0;

    // Retired items (manual Known or auto-retired) are excluded from totals.
    // Count retirement across all saved cards (even if not active in srs.grammarKeys).
    let retired = 0;
    Object.keys(cardsByKey).forEach(k=>{
      if (!String(k).startsWith(prefix)) return;
      const card = cardsByKey[String(k)] || null;
      if (isRetired(card, fs)) retired += 1;
    });

    const activeTotal = Math.max(0, totalAll - retired);

    // Started only counts active SRS items (not paused) and only if they have history.
    const activeKeys = keys.filter(k=>String(k).startsWith(prefix));
    let started = 0;
    activeKeys.forEach(k=>{
      const card = cardsByKey[String(k)] || null;
      if (isRetired(card, fs)) return; // retired items are excluded from totals
      if (hasHistory(card)) started += 1;
    });

    started = Math.min(started, activeTotal);
    const pct = activeTotal ? Math.round((started / activeTotal) * 1000) / 10 : 0; // 1 decimal
    const remaining = Math.max(0, activeTotal - started);
    return { level, totalAll, activeTotal, started, retired, remaining, pct };
  }

  function encouragementMessage(level, pct){
    const tier = Math.min(10, Math.max(0, Math.floor(Number(pct || 0) / 10)));
    const M = {
      N5: [
        "Fresh start — pick one easy point today and get the ball rolling.",
        "Nice start — you’ve begun building the foundation.",
        "Good momentum — those basics add up quickly.",
        "Solid progress — the core patterns are starting to feel familiar.",
        "You’re closing on halfway — keep stacking small wins.",
        "Halfway mark — that’s real consistency.",
        "Strong run — you’re turning knowledge into habit.",
        "Great pace — the finish line is in sight.",
        "Final stretch — you’ve done the hard part already.",
        "Almost there — just a few loose ends to tidy up.",
        "Complete — you’ve started every active N5 point. Brilliant work." 
      ],
      N4: [
        "Warm-up phase — start a couple and let momentum do the rest.",
        "Good start — you’re stepping up from the basics.",
        "Nice progress — you’re building range and flexibility.",
        "Solid momentum — this is where confidence grows.",
        "Nearly halfway — you’re staying on track.",
        "Halfway — strong, steady progress.",
        "Great work — you’re making N4 feel normal.",
        "Excellent pace — you’re getting close.",
        "Final stretch — keep your rhythm and you’ll cruise in.",
        "Almost finished — finish the last few with confidence.",
        "Complete — you’ve started every active N4 point. Excellent work." 
      ],
      N3: [
        "Starting N3 is a big move — one step at a time.",
        "Good start — you’ve begun bridging into intermediate patterns.",
        "Nice momentum — you’re pushing into the everyday zone.",
        "Solid progress — you’re building real comprehension power.",
        "Closing on halfway — this is where it starts to click.",
        "Halfway — you’re doing the heavy lifting now.",
        "Strong work — your pattern recognition is sharpening.",
        "Great pace — you’re moving into the top end of N3.",
        "Final stretch — keep going, you’re nearly through.",
        "Almost there — finish strong.",
        "Complete — you’ve started every active N3 point. Outstanding." 
      ],
      N2: [
        "N2 is serious territory — start small and keep it consistent.",
        "Good start — you’re stepping into advanced grammar.",
        "Nice progress — you’re building precision and nuance.",
        "Solid momentum — this is real skill-building.",
        "Nearly halfway — you’re proving you can do N2.",
        "Halfway — strong commitment pays off here.",
        "Great work — your Japanese is getting sharper and denser.",
        "Excellent pace — you’re in the top half now.",
        "Final stretch — keep your consistency and you’ll land it.",
        "Almost finished — you’re very close.",
        "Complete — you’ve started every active N2 point. Exceptional work." 
      ],
      N1: [
        "N1 begins with a single foothold — start one and build from there.",
        "Good start — you’ve entered mastery-level grammar.",
        "Nice progress — you’re developing real nuance control.",
        "Solid momentum — this is high-level pattern work.",
        "Nearly halfway — you’re doing something most people never attempt.",
        "Halfway — that’s a massive milestone.",
        "Strong work — your comprehension ceiling is rising.",
        "Great pace — you’re getting close to completing active N1.",
        "Final stretch — keep steady and finish proud.",
        "Almost there — polish the last few.",
        "Complete — you’ve started every active N1 point. Truly impressive." 
      ]
    };
    const arr = M[level] || M.N5;
    return arr[tier] || arr[arr.length - 1];
  }

  function metaLines(s){
    const lines = [];
    if (!s.totalAll){
      return ["No grammar data loaded for this level."];
    }

    const notStarted = Math.max(0, s.activeTotal - s.started);

    // Totals overview (retired excluded from the denominator)
    lines.push(`Total points: ${s.totalAll} • Active: ${s.activeTotal} • Retired: ${s.retired} (retired excluded)`);
    const DAILY_TARGET = 5;
    if (s.activeTotal){
      const totalDays = Math.ceil(s.activeTotal / DAILY_TARGET);
      if (s.remaining > 0){
        const daysToGo = Math.ceil(s.remaining / DAILY_TARGET);
        lines.push(`${s.activeTotal} Grammar points at ${DAILY_TARGET} a day takes ${totalDays} days to complete! You have ${daysToGo} days to go!`);
      }else{
        lines.push(`This level would've taken ${totalDays} days at ${DAILY_TARGET} a day!`);
      }
    }

    // Encouragement line (tiered by 10% bands, unique per level)
    if (s.activeTotal){
      const msg = encouragementMessage(s.level, s.pct);
      const suffix = s.remaining > 0
        ? `(${s.remaining} left in this level)`
        : "(nothing left active)";
      lines.push(`${msg} ${suffix}`);
    }else if (s.retired > 0){
      lines.push("Everything in this level is retired — nicely done.");
    }else{
      lines.push("Nothing active to work on here yet.");
    }

    return lines;
  }

  function render(){
    if (!contentEl) return;
    contentEl.innerHTML = "";

    const frag = document.createDocumentFragment();

    const toCelebrate = [];
    const alreadyCompleted = new Set(ensureSrsLevelCompletions());
    const celebrated = new Set(ensureSrsLevelCelebrated());

    const completedNow = [];

    (CONST.LEVEL_ORDER || ["N5","N4","N3","N2","N1"]).forEach(level=>{
      const s = calcLevelStats(level);

      if (isLevelComplete(s)) completedNow.push(level);

      if (isLevelComplete(s)){
        if (!alreadyCompleted.has(level)){
          if (markSrsLevelCompleted(level)){
            alreadyCompleted.add(level);
            toCelebrate.push(level);
          }
        }else if (!celebrated.has(level)){
          // Level was completed previously but never celebrated (e.g., fireworks function missing).
          toCelebrate.push(level);
        }
      }

      const row = document.createElement("div");
      row.className = "progress-level-row";

      const head = document.createElement("div");
      head.className = "progress-level-head";

      const title = document.createElement("div");
      title.className = "progress-level-title";
      title.textContent = level;

      const count = document.createElement("div");
      count.className = "progress-level-count";
      count.textContent = s.totalAll ? `${s.started} / ${s.activeTotal} started • Retired: ${s.retired}` : "—";

      const pct = document.createElement("div");
      pct.className = "progress-level-pct";
      pct.textContent = s.activeTotal ? `${s.pct}%` : "0%";

      head.appendChild(title);
      head.appendChild(count);
      head.appendChild(pct);

      const bar = document.createElement("div");
      bar.className = "progress-bar";

      const fill = document.createElement("div");
      fill.className = `progress-bar-fill ${level}`;
      fill.style.width = s.activeTotal ? `${Math.max(0, Math.min(100, (s.started / s.activeTotal) * 100))}%` : "0%";
      bar.appendChild(fill);

      const meta = document.createElement("div");
      meta.className = "progress-meta";
      metaLines(s).forEach(line=>{
        const d = document.createElement("div");
        d.textContent = line;
        meta.appendChild(d);
      });

      row.appendChild(head);
      row.appendChild(bar);
      row.appendChild(meta);

      frag.appendChild(row);
    });


    // Fireworks celebration when a level reaches 100%.
    // Also backfills celebrations that were missed previously.
    if (toCelebrate.length && Heatmap && typeof Heatmap.playLevelCompletionFireworks === "function"){
      const completed = ensureSrsLevelCompletions(); // ordered completion list
      const msg = (toCelebrate.length === 1)
        ? `Congratulations! ${toCelebrate[0]} is at 100% SRS progress 🎉`
        : `Congratulations! ${toCelebrate.join(" + ")} are at 100% SRS progress 🎉`;

      try{
        Heatmap.playLevelCompletionFireworks(
          completed,
          msg + "  (Click anywhere for more fireworks, or QUIT to close.)"
        );
        // Mark as celebrated only after the fireworks call succeeds.
        toCelebrate.forEach(lvl=>{
          if (markSrsLevelCelebrated(lvl)) celebrated.add(lvl);
        });
      }catch(_e){}
    }

    contentEl.appendChild(frag);

    // Header button: appears once any level is at 100%.
    celebrationLevelsNow = completedNow;
    if (celebrationBtn) celebrationBtn.hidden = celebrationLevelsNow.length === 0;
  }

  function open(){
    render();
    backdrop.hidden = false;
  }
  function close(){
    backdrop.hidden = true;
  }

  Progress.init = () => {
    openBtn = Utils.qs("#openProgressStatsBtn");
    backdrop = Utils.qs("#progressStatsModalBackdrop");
    closeBtn = Utils.qs("#closeProgressStatsBtn");
    contentEl = Utils.qs("#progressStatsContent");
    celebrationBtn = Utils.qs("#openCelebrationRoomBtn");

    if (!openBtn || !backdrop || !closeBtn || !contentEl) return;

    openBtn.addEventListener("click", open);
    closeBtn.addEventListener("click", close);

    if (celebrationBtn){
      celebrationBtn.addEventListener("click", ()=>{
        if (!celebrationLevelsNow || !celebrationLevelsNow.length) return;
        if (!(Heatmap && typeof Heatmap.playLevelCompletionFireworks === "function")) return;

        // Hide the progress window before entering the celebration room.
        close();
        // Randomise the *order* just to make it feel fresh; palette is still derived from completed levels.
        const levels = [...celebrationLevelsNow].sort(()=>Math.random() - 0.5);
        const msg = `Celebration room 🎉  (Colours: ${levels.join(" + ")})  — click anywhere for more fireworks, or QUIT to close.`;
        try{ Heatmap.playLevelCompletionFireworks(levels, msg); }catch(_e){}
      });
    }

    // Click outside closes
    backdrop.addEventListener("click", (ev)=>{
      if (ev.target === backdrop) close();
    });

    // ESC closes
    document.addEventListener("keydown", (ev)=>{
      if (backdrop.hidden) return;
      if (ev.key === "Escape") close();
    });
  };

  window.App.Progress = Progress;
})();
(function(){
  window.App = window.App || {};
  const { CONST, Utils, Storage } = window.App;

  const Progress = {};

  const PER_DAY = 5;

  let openBtn, backdrop, closeBtn, contentEl;

  function ceilDiv(a,b){ return Math.ceil(a / b); }

  function calcLevelStats(level){
    const items = window.App.State?.byLevel?.[level] || [];
    const total = items.length;

    let seen = 0;
    const seenMap = Storage.userData?.seenExamples || {};

    for (const it of items){
      const exampleId = `${level}_${it.index}`;
      if (seenMap[exampleId]) seen++;
    }

    const pct = total ? Math.round((seen / total) * 1000) / 10 : 0; // 1 decimal
    const totalDays = total ? ceilDiv(total, PER_DAY) : 0;
    const remaining = Math.max(0, total - seen);
    const remainingDays = remaining ? ceilDiv(remaining, PER_DAY) : 0;

    return { level, total, seen, pct, totalDays, remaining, remainingDays };
  }

  function metaLines(s){
    if (!s.total) return ["No items loaded for this level."];
    if (s.seen <= 0){
      return [`At ${PER_DAY}/day: ${s.totalDays} day${s.totalDays === 1 ? "" : "s"} to finish.`];
    }
    if (s.remaining <= 0){
      return ["Completed 🎉"];
    }
    const lines = [];
    lines.push(`At ${PER_DAY}/day (full level): ${s.totalDays} day${s.totalDays === 1 ? "" : "s"}.`);
    lines.push(`From where you are now at ${PER_DAY}/day: ${s.remainingDays} day${s.remainingDays === 1 ? "" : "s"} remaining.`);
    return lines;
  }

  function render(){
    if (!contentEl) return;
    contentEl.innerHTML = "";

    const frag = document.createDocumentFragment();

    (CONST.LEVEL_ORDER || ["N5","N4","N3","N2","N1"]).forEach(level=>{
      const s = calcLevelStats(level);

      const row = document.createElement("div");
      row.className = "progress-level-row";

      const head = document.createElement("div");
      head.className = "progress-level-head";

      const title = document.createElement("div");
      title.className = "progress-level-title";
      title.textContent = level;

      const count = document.createElement("div");
      count.className = "progress-level-count";
      count.textContent = s.total ? `${s.seen} / ${s.total} seen` : "—";

      const pct = document.createElement("div");
      pct.className = "progress-level-pct";
      pct.textContent = s.total ? `${s.pct}%` : "0%";

      head.appendChild(title);
      head.appendChild(count);
      head.appendChild(pct);

      const bar = document.createElement("div");
      bar.className = "progress-bar";

      const fill = document.createElement("div");
      fill.className = `progress-bar-fill ${level}`;
      fill.style.width = s.total ? `${Math.max(0, Math.min(100, (s.seen / s.total) * 100))}%` : "0%";
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

    contentEl.appendChild(frag);
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

    if (!openBtn || !backdrop || !closeBtn || !contentEl) return;

    openBtn.addEventListener("click", open);
    closeBtn.addEventListener("click", close);

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
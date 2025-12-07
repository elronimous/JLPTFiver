(function(){
  window.App = window.App || {};
  const { CONST, Utils, Storage, Notes, Scores } = window.App;

  const ViewAll = {};
  let openBtn, modal, closeBtn, contentEl, searchEl, seenBtn, unseenBtn;
  let starFilter = null;

  function updateStarUI(){
    seenBtn.classList.toggle("active", starFilter === "seen");
    unseenBtn.classList.toggle("active", starFilter === "unseen");
  }

  function applyFilters(){
    if (modal.hidden) return;

    const q = (searchEl.value||"").trim().toLowerCase();
    const items = Utils.qsa(".viewall-item", contentEl);

    items.forEach(el=>{
      const exampleId = el.dataset.exampleId;
      const isSeen = !!Storage.userData.seenExamples[exampleId];

      const okStar = !starFilter || (starFilter === "seen" ? isSeen : !isSeen);
      const okText = !q || el.textContent.toLowerCase().includes(q);

      el.style.display = (okStar && okText) ? "" : "none";
    });

    const sections = Utils.qsa(".level-section", contentEl);
    let anyVisible = false;

    sections.forEach(sec=>{
      const visibleInSection = Utils.qsa(".viewall-item", sec).some(it=>it.style.display !== "none");
      sec.style.display = visibleInSection ? "" : "none";
      if (visibleInSection) anyVisible = true;
    });

    const existing = Utils.qs(".viewall-noresults", contentEl);
    if (!anyVisible){
      if (!existing){
        const msg = document.createElement("div");
        msg.className = "viewall-noresults";
        msg.textContent = "No matching items.";
        contentEl.prepend(msg);
      }
    } else {
      existing?.remove();
    }
  }

  function build(){
    contentEl.innerHTML = "";

    const byLevel = window.App.State?.byLevel || {};
    for (const level of CONST.LEVEL_ORDER){
      const items = byLevel[level];
      if (!items || !items.length) continue;

      const section = document.createElement("section");
      section.className = `level-section level-${level}`;

      const head = document.createElement("div");
      head.className = "viewall-level-heading";
      head.innerHTML = `
        <div class="level-left">
          <div class="level-pill"></div>
          <div class="level-title">${level}</div>
        </div>
      `;
      section.appendChild(head);

      const body = document.createElement("div");
      body.className = "viewall-level-body";

      items.forEach(item=>{
        const exampleId = `${item.level}_${item.index}`;
        const grammarKey = `${item.level}_${item.grammar}`;
        const seen = !!Storage.userData.seenExamples[exampleId];

        const titleHtml = item.primaryLink
          ? `<a href="${item.primaryLink}" target="_blank" rel="noopener">${Utils.escapeHtml(item.grammar)}</a>`
          : Utils.escapeHtml(item.grammar);

        const el = document.createElement("div");
        el.className = "viewall-item";
        el.dataset.exampleId = exampleId;

        el.innerHTML = `
          <div class="viewall-item-header">
            <div>
              <div class="viewall-item-title">${titleHtml}</div>
              <div class="viewall-item-meaning">${Utils.escapeHtml(item.meaning||"")}</div>
            </div>
            <div class="viewall-item-controls">
              <span class="star-toggle ${seen ? "seen":""}" title="Mark as seen">★</span>
              <span class="viewall-toggle">＋</span>
            </div>
          </div>
        `;

        const controls = Utils.qs(".viewall-item-controls", el);
        const starEl = Utils.qs(".star-toggle", el);
        const scoreWrap = Scores.build(exampleId);
        controls.insertBefore(scoreWrap, starEl);

        const notes = Notes.buildEditor({ level: item.level, grammarKey });
        notes.section.hidden = true;
        el.appendChild(notes.section);

        starEl.addEventListener("click",(ev)=>{
          ev.stopPropagation();
          const cur = !!Storage.userData.seenExamples[exampleId];
          if (cur) delete Storage.userData.seenExamples[exampleId];
          else Storage.userData.seenExamples[exampleId] = true;
          Storage.saveUserData();
          starEl.classList.toggle("seen", !cur);
          applyFilters();
          window.App.Cram?.refreshIfOpen?.();
        });

        const toggleEl = Utils.qs(".viewall-toggle", el);
        const headerEl = Utils.qs(".viewall-item-header", el);

        function setOpen(open){
          notes.section.hidden = !open;
          toggleEl.textContent = open ? "－" : "＋";
          toggleEl.classList.toggle("open", open);
          if (open) notes.ensureDefaultApplied();
        }

        headerEl.addEventListener("click", ()=>setOpen(notes.section.hidden));
        body.appendChild(el);
      });

      section.appendChild(body);
      contentEl.appendChild(section);
    }

    Scores.applyEnabled(Storage.settings.scoresEnabled);
  }

  ViewAll.open = () => {
    build();
    modal.hidden = false;
    updateStarUI();
    applyFilters();
    searchEl.focus();
  };

  ViewAll.close = () => { modal.hidden = true; };

  ViewAll.init = () => {
    openBtn = Utils.qs("#openViewAllBtn");
    modal = Utils.qs("#viewAllModal");
    closeBtn = Utils.qs("#closeViewAllBtn");
    contentEl = Utils.qs("#viewAllContent");
    searchEl = Utils.qs("#viewAllSearch");
    seenBtn = Utils.qs("#viewAllFilterSeen");
    unseenBtn = Utils.qs("#viewAllFilterUnseen");

    openBtn.addEventListener("click", ViewAll.open);
    closeBtn.addEventListener("click", ViewAll.close);
    modal.addEventListener("click",(ev)=>{ if (ev.target === modal) ViewAll.close(); });

    let t=null;
    searchEl.addEventListener("input", ()=>{
      if (t) clearTimeout(t);
      t = setTimeout(applyFilters, 80);
    });

    seenBtn.addEventListener("click", ()=>{
      starFilter = (starFilter === "seen") ? null : "seen";
      updateStarUI(); applyFilters();
    });
    unseenBtn.addEventListener("click", ()=>{
      starFilter = (starFilter === "unseen") ? null : "unseen";
      updateStarUI(); applyFilters();
    });
  };

  window.App.ViewAll = ViewAll;
})();

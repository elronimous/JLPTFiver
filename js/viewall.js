(function(){
  window.App = window.App || {};
  const { CONST, Utils, Storage, Notes, Scores, SRS } = window.App;

  const ViewAll = {};
  let openBtn, modal, closeBtn, contentEl, searchEl, seenBtn, unseenBtn, srsBtn;
  let srsFilter = false;
  let starFilter = null;
  let cachedSections = [];
  let dirty = false;

  function updateStarUI(){
    seenBtn.classList.toggle("active", starFilter === "seen");
    unseenBtn.classList.toggle("active", starFilter === "unseen");
    if (srsBtn) srsBtn.classList.toggle("active", !!srsFilter);
  }

  function applyFilters(){
    if (modal.hidden) return;

    const q = (searchEl.value || "").trim().toLowerCase();

    let anyVisible = false;

    (cachedSections || []).forEach(sec=>{
      const body = sec.__viewallBody;
      const items = sec.__viewallItems || [];
      let visibleInSection = 0;

      items.forEach(el=>{
        const isSeen = el.dataset.seen === "1";
        const inSrs = el.dataset.inSrs === "1";

        const okStar = !starFilter || (starFilter === "seen" ? isSeen : !isSeen);
        const okSrs = !srsFilter || inSrs;

        const hay = el.dataset.searchText || "";
        const okText = !q || hay.includes(q);

        const show = (okStar && okSrs && okText);
        const next = show ? "" : "none";
        if (el.style.display !== next) el.style.display = next;
        if (show) visibleInSection++;
      });

      // Hide whole section if nothing visible inside
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
    cachedSections = [];

    const settings = Storage.settings || {};
    const srsUiEnabled = !!settings.srsEnabled;
    const showScores = !!settings.scoresEnabled && !srsUiEnabled;

    const byLevel = window.App.State?.byLevel || {};
    const frag = document.createDocumentFragment();

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
      if (Storage?.ui?.expanded?.[level]) body.classList.add("expanded");
      section.appendChild(body);

      // Keep references for fast filtering.
      section.__viewallBody = body;
      section.__viewallItems = [];
      cachedSections.push(section);

      head.addEventListener("click", ()=>{
        const isExpanded = body.classList.toggle("expanded");
        if (Storage?.ui?.expanded){
          Storage.ui.expanded[level] = isExpanded;
          Storage.saveUi?.();
        }
      });

      const srsArr = Array.isArray(Storage.userData?.srs?.grammarKeys) ? Storage.userData.srs.grammarKeys : [];
      const srsSet = new Set(srsArr.map(String));

      items.forEach(item=>{
        const exampleId = `${item.level}_${item.index}`;
        const grammarKey = `${item.level}_${item.grammar}`;
        const seen = !!Storage.userData.seenExamples[exampleId];
        const inSrs = srsUiEnabled ? srsSet.has(grammarKey) : false;

        // Keep SRS badge visuals consistent with the main page.
        let srsButtonHtml = "";
        if (srsUiEnabled){
          if (inSrs && window.App.SRS && typeof window.App.SRS.getEmojiForKey === "function"){
            const e = window.App.SRS.getEmojiForKey(grammarKey);
            const emoji = (e && e.emoji) ? e.emoji : (window.App.CONST?.SCORE_EMOJIS?.[0] || "🌑");
            const tip = (e && e.title) ? e.title : "In SRS";
            srsButtonHtml = `<button class="srs-add-btn srs-added" type="button" title="${Utils.escapeHtml(tip)}">${emoji}</button>`;
          } else {
            srsButtonHtml = `<button class="srs-add-btn${inSrs ? " srs-added":""}" type="button" title="${inSrs ? "In SRS" : "Add to SRS"}">＋</button>`;
          }
        }

        const titleHtml = item.primaryLink
          ? `<a href="${item.primaryLink}" target="_blank" rel="noopener">${Utils.escapeHtml(item.grammar)}</a>`
          : Utils.escapeHtml(item.grammar);

        const el = document.createElement("div");
        el.className = "grammar-item viewall-item";
        el.dataset.exampleId = exampleId;
        el.dataset.inSrs = inSrs ? "1" : "0";
        el.dataset.seen = seen ? "1" : "0";
        el.dataset.searchText = `${level} ${item.grammar||""} ${item.meaning||""}`.toLowerCase();

        el.innerHTML = `
          <div class="viewall-item-header">
            <div>
              <div class="viewall-item-title">${titleHtml}</div>
              <div class="viewall-item-meaning">${Utils.escapeHtml(item.meaning||"")}</div>
            </div>
            <div class="viewall-item-controls">
              ${srsButtonHtml}
              <span class="star-toggle ${seen ? "seen":""}" title="Mark as seen">★</span>
            </div>
          </div>
          <div class="viewall-item-body"></div>
        `;

        const controls = Utils.qs(".viewall-item-controls", el);
        const srsBtnEl = Utils.qs(".srs-add-btn", el);
        const starEl = Utils.qs(".star-toggle", el);
        const details = Utils.qs(".viewall-item-body", el);

        // Start fully collapsed for speed.
        details.hidden = true;
        details.classList.remove("expanded");
        details.dataset.built = "0";

        // Only show self-rating emoji scores when SRS scheduling is OFF.
        if (showScores){
          const scoreWrap = Scores.build(exampleId);
          controls.insertBefore(scoreWrap, starEl);
        }

        let notesApi = null;
        function ensureNotesBuilt(){
          if (details.dataset.built === "1") return;
          notesApi = Notes.buildEditor({ level: item.level, grammarKey });
          notesApi.section.hidden = false;
          details.appendChild(notesApi.section);
          notesApi.ensureDefaultApplied?.();
          details.dataset.built = "1";
        }

        const headerEl = Utils.qs(".viewall-item-header", el);
        headerEl.addEventListener("click", ()=>{
          const willOpen = details.hidden;
          if (willOpen){
            ensureNotesBuilt();
            details.hidden = false;
            details.classList.add("expanded");
          } else {
            details.hidden = true;
            details.classList.remove("expanded");
          }
        });

        // Prevent header toggle when interacting with controls/links.
        controls.addEventListener("click", (ev)=>ev.stopPropagation());
        const titleLink = Utils.qs(".viewall-item-title a", el);
        titleLink?.addEventListener("click", (ev)=>ev.stopPropagation());

        if (srsBtnEl){
          srsBtnEl.addEventListener("click", (ev)=>{
            ev.stopPropagation();
            dirty = true;
            const srsApi = window.App.SRS;
            if (!srsApi) return;
            const inSrsNow = srsApi.hasGrammarKey && srsApi.hasGrammarKey(grammarKey);
            if (!inSrsNow){
              const added = srsApi.addGrammarKey(grammarKey);
              if (added){
                srsBtnEl.classList.add("srs-added");
                el.dataset.inSrs = "1";
                if (srsApi.getEmojiForKey){
                  const e = srsApi.getEmojiForKey(grammarKey);
                  if (e && e.emoji) srsBtnEl.textContent = e.emoji;
                  srsBtnEl.title = (e && e.title) ? e.title : "In SRS";
                } else {
                  srsBtnEl.title = "In SRS";
                }
              }
            } else {
              srsApi.beginToggle && srsApi.beginToggle(grammarKey, srsBtnEl);
            }
            applyFilters();
          });
        }

        starEl.addEventListener("click", (ev)=>{
          ev.stopPropagation();
          dirty = true;
          const cur = el.dataset.seen === "1";
          if (cur) delete Storage.userData.seenExamples[exampleId];
          else Storage.userData.seenExamples[exampleId] = true;
          Storage.saveUserData();
          el.dataset.seen = cur ? "0" : "1";
          starEl.classList.toggle("seen", !cur);
          applyFilters();
          window.App.Cram?.refreshIfOpen?.();
        });

        body.appendChild(el);
        section.__viewallItems.push(el);
      });

      frag.appendChild(section);
    }

    contentEl.appendChild(frag);
  }

  ViewAll.open = () => {
    const settings = Storage.settings || {};
    const srsUiEnabled = !!settings.srsEnabled;
    if (srsBtn){
      srsBtn.hidden = !srsUiEnabled;
      if (!srsUiEnabled) srsFilter = false;
    }
    build();
    modal.hidden = false;
    updateStarUI();
    applyFilters();
    searchEl.focus();
  };

  ViewAll.close = () => {
    modal.hidden = true;
    if (dirty){
      const ymd = document.querySelector("#viewDate")?.value || Utils.dateToYMD(new Date());
      window.App.Daily?.render?.(ymd);
      dirty = false;
    }
  };

  ViewAll.init = () => {
    openBtn = Utils.qs("#openViewAllBtn");
    modal = Utils.qs("#viewAllModal");
    closeBtn = Utils.qs("#closeViewAllBtn");
    contentEl = Utils.qs("#viewAllContent");
    searchEl = Utils.qs("#viewAllSearch");
    seenBtn = Utils.qs("#viewAllFilterSeen");
    unseenBtn = Utils.qs("#viewAllFilterUnseen");
    srsBtn = Utils.qs("#viewAllFilterSrs");

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
    if (srsBtn){
      srsBtn.addEventListener("click", ()=>{
        srsFilter = !srsFilter;
        updateStarUI();
        applyFilters();
      });
    }

  };

  window.App.ViewAll = ViewAll;
})();

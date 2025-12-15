(function(){
  window.App = window.App || {};
  const { CONST, Utils, Storage, Notes, Scores } = window.App;

  const Daily = {};
  let outputEl;

  function levelsToShow(){
    const byLevel = window.App.State?.byLevel || {};
    const active = Object.keys(Storage.ui.filters).filter(k=>Storage.ui.filters[k]);

    if (active.includes("ALL")){
      return CONST.LEVEL_ORDER.filter(lvl => byLevel[lvl] && byLevel[lvl].length);
    }
    return active
      .filter(lvl => byLevel[lvl] && byLevel[lvl].length)
      .sort((a,b)=>CONST.LEVEL_ORDER.indexOf(a)-CONST.LEVEL_ORDER.indexOf(b));
  }

  function render(viewYMD){
    const byLevel = window.App.State?.byLevel || {};
    const permutations = window.App.State?.permutations || {};
    const viewDate = Utils.ymdToDate(viewYMD);

    outputEl.innerHTML = "";

    const lvls = levelsToShow();
    if (!lvls.length){
      outputEl.innerHTML = '<div class="empty-note">No levels selected</div>';
      return;
    }

    const randomStart = Utils.ymdToDate(CONST.RANDOM_START_YMD);
    const randomOffsetDays = Utils.daysBetween(randomStart, viewDate);

    lvls.forEach(level=>{
      const items = byLevel[level];
      if (!items || !items.length) return;

      const section = document.createElement("section");
      section.className = `level-section level-${level}`;
      section.innerHTML = `
        <div class="level-heading">
          <div class="level-left">
            <div class="level-pill"></div>
            <div class="level-title">${level}</div>
          </div>
        </div>
        <div class="level-body ${Storage.ui.expanded[level] ? "expanded":""}"></div>
      `;
      const body = section.querySelector(".level-body");

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
        const perm = permutations[level] || items.map((_,i)=>i);
        const slice = Utils.mod(randomOffsetDays * CONST.ITEMS_PER_DAY, items.length);
        for (let i=0;i<CONST.ITEMS_PER_DAY;i++){
          indices.push(perm[(slice + i) % items.length]);
        }
      }

      indices.forEach(idx=>{
        const item = items[idx];
        const exampleId = `${item.level}_${item.index}`;
        const grammarKey = `${item.level}_${item.grammar}`;
        const seen = !!Storage.userData.seenExamples[exampleId];

        const grammarLink = item.primaryLink
          ? `<a href="${item.primaryLink}" target="_blank" rel="noopener">${Utils.escapeHtml(item.grammar)}</a>`
          : Utils.escapeHtml(item.grammar);

        const extraLinkIcons = (item.extraLinks||[]).map((link,i)=>
          `<a href="${link}" target="_blank" rel="noopener" class="extra-link" title="Link ${i+2}">↗</a>`
        ).join("");

        const srsArr = Array.isArray(Storage.userData?.srs?.grammarKeys) ? Storage.userData.srs.grammarKeys : [];
        const inSrs = srsArr.includes(grammarKey);
        const cardsByKey = (Storage.userData?.srs && Storage.userData.srs.cardsByKey) || {};
        const cardState = cardsByKey[grammarKey];
        const perf = inSrs && cardState && typeof cardState.performance === "number" && Number.isFinite(cardState.performance)
          ? cardState.performance
          : null;

        const card = document.createElement("div");
        card.className = "grammar-item";
        const settings = Storage.settings || {};
        const srsUiEnabled = !!settings.srsEnabled;

        let srsButtonHtml = "";
        if (srsUiEnabled){
          if (inSrs && window.App.SRS && typeof window.App.SRS.getEmojiForKey === "function"){
            const e = window.App.SRS.getEmojiForKey(grammarKey);
            const emoji = e && e.emoji ? e.emoji : (window.App.CONST?.SCORE_EMOJIS?.[0] || "🌑");
            const tip = e && e.title ? e.title : "In SRS";
            srsButtonHtml = `<button class="srs-add-btn srs-added" type="button" title="${Utils.escapeHtml(tip)}">${emoji}</button>`;
          } else {
            srsButtonHtml = `<button class="srs-add-btn${inSrs ? " srs-added":""}" type="button" title="${inSrs ? "In SRS" : "Add to SRS"}">＋</button>`;
          }
        }

        card.innerHTML = `
          <div class="grammar-main-area">
            <div class="grammar-info">
              <div class="grammar-main">${grammarLink}${extraLinkIcons}</div>
              <div class="grammar-meaning">${Utils.escapeHtml(item.meaning||"")}</div>
            </div>            <div class="grammar-right-controls">
              ${srsButtonHtml}
              <span class="star-toggle ${seen ? "seen":""}" title="Mark as seen">★</span>
            </div>
          </div>
        `;

        const controls = card.querySelector(".grammar-right-controls");
        const srsBtn = card.querySelector(".srs-add-btn");
        const starEl = card.querySelector(".star-toggle");

        // Only show self-rating emoji scores when SRS scheduling is OFF.
        if (!!settings.scoresEnabled && !srsUiEnabled){
          const scoreWrap = Scores.build(exampleId);
          controls.insertBefore(scoreWrap, starEl);
        }


        const notes = Notes.buildEditor({ level:item.level, grammarKey });
        notes.section.hidden = true;
        card.appendChild(notes.section);

        if (srsBtn){
          srsBtn.addEventListener("click",(ev)=>{
            ev.stopPropagation();
            const srsApi = window.App.SRS;
            if (!srsApi) return;
            const inSrsNow = srsApi.hasGrammarKey && srsApi.hasGrammarKey(grammarKey);
            if (!inSrsNow){
              const added = srsApi.addGrammarKey(grammarKey);
              if (added){
                srsBtn.classList.add("srs-added");
                if (srsApi.getEmojiForKey){
                  const e = srsApi.getEmojiForKey(grammarKey);
                  if (e && e.emoji) srsBtn.textContent = e.emoji;
                  if (e && e.title) srsBtn.title = e.title;
                  else srsBtn.title = "In SRS";
                } else {
                  srsBtn.title = "In SRS";
                }
              }
            }else{
              srsApi.beginToggle && srsApi.beginToggle(grammarKey, srsBtn);
            }
          });
        }

        starEl.addEventListener("click",(ev)=>{
          ev.stopPropagation();
          const cur = !!Storage.userData.seenExamples[exampleId];
          if (cur) delete Storage.userData.seenExamples[exampleId];
          else Storage.userData.seenExamples[exampleId] = true;
          Storage.saveUserData();
          starEl.classList.toggle("seen", !cur);
          window.App.Cram?.refreshIfOpen?.();
        });

        const mainArea = card.querySelector(".grammar-main-area");
        mainArea.addEventListener("click", ()=>{
          const willOpen = notes.section.hidden;
          notes.section.hidden = !notes.section.hidden;
          if (willOpen) notes.ensureDefaultApplied();
        });

        body.appendChild(card);
      });

      section.querySelector(".level-heading").addEventListener("click", ()=>{
        const isExpanded = body.classList.toggle("expanded");
        Storage.ui.expanded[level] = isExpanded;
        Storage.saveUi();
      });

      outputEl.appendChild(section);
    });

    Scores.applyEnabled(Storage.settings.scoresEnabled && !Storage.settings.srsEnabled);
  }

  Daily.init = () => { outputEl = Utils.qs("#output"); };
  Daily.render = render;

  window.App.Daily = Daily;
})();
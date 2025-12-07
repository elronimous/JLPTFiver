(function(){
  window.App = window.App || {};
  const { CONST, Utils, Storage } = window.App;

  document.addEventListener("DOMContentLoaded", async () => {
    // Keep the fixed top header from covering the page content
    const syncHeaderOffset = () => {
      const hb = Utils.qs(".header-bar");
      if (!hb) return;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const gap = 1.1 * rem; // matches the old header bottom spacing
      document.documentElement.style.setProperty("--header-offset", (hb.offsetHeight + gap) + "px");
    };
    const syncHeaderOffsetDebounced = Utils.debounce(syncHeaderOffset, 60);
    syncHeaderOffset();
    requestAnimationFrame(()=>requestAnimationFrame(syncHeaderOffset));
    window.addEventListener("resize", syncHeaderOffsetDebounced);

    // Tooltip first
    window.App.Tooltip?.init();

    // Load grammar
    await window.App.Csv.load();

    // Init modules
    window.App.Scores?.applyEnabled(Storage.settings.scoresEnabled);
    window.App.Notes?.init();
    window.App.Daily?.init();
    window.App.ViewAll?.init();
    window.App.Cram?.init();

    // Heatmap init (and global alias usage)
    if (window.Heatmap) Heatmap.init();

    // DOM
    const viewDateInput = Utils.qs("#viewDate");
    const prevBtn = Utils.qs("#prevDayBtn");
    const nextBtn = Utils.qs("#nextDayBtn");
    const todayBtn = Utils.qs("#todayBtn");
    const openCalendarBtn = Utils.qs("#openCalendarBtn");
    const infoDate = Utils.qs("#infoDate");

    // Only the MAIN page filter row should control global JLPT filters.
    // (Cram modal also uses .level-filter-btn for its own local filters.)
    const filterButtons = Utils.qsa(".level-filter-row .level-filter-btn");

    // Settings modal
    const openSettingsBtn = Utils.qs("#openSettingsBtn");
    const settingsBackdrop = Utils.qs("#settingsModalBackdrop");
    const closeSettingsBtn = Utils.qs("#closeSettingsBtn");

    const toggleHeatmapVisible = Utils.qs("#toggleHeatmapVisible");
    const toggleHideEnglishNotes = Utils.qs("#toggleHideEnglishNotes");
    const toggleEmojiScores = Utils.qs("#toggleEmojiScores");

    const toggleProgressiveMode = Utils.qs("#toggleProgressiveMode");
    const progressiveDatesWrap = Utils.qs("#progressiveDatesWrap");
    const progressiveDatesGrid = Utils.qs("#progressiveDatesGrid");

    // Export / Import
    const exportBtn = Utils.qs("#exportDataBtn");
    const importBtn = Utils.qs("#importDataBtn");
    const importFileInput = Utils.qs("#importFileInput");

    function setTodayButtonLabel(viewStr){
      const todayYMD = Utils.dateToYMD(new Date());
      if (viewStr === todayYMD){
        todayBtn.textContent = "Today";
      } else {
        const d = Utils.ymdToDate(viewStr);
        const dd = String(d.getDate()).padStart(2,"0");
        const mm = String(d.getMonth()+1).padStart(2,"0");
        todayBtn.textContent = `${dd}/${mm}`;
      }
    }

    function updateFilterButtons(){
      filterButtons.forEach(btn=>{
        btn.classList.toggle("active", !!Storage.ui.filters[btn.dataset.level]);
      });
    }

    function render(){
      const ymd = viewDateInput.value;
      if (!ymd) return;
      infoDate.textContent = ymd;
      setTodayButtonLabel(ymd);
      window.App.Daily.render(ymd);
    }

    // Date controls
    viewDateInput.value = Utils.dateToYMD(new Date());
    setTodayButtonLabel(viewDateInput.value);

    prevBtn.addEventListener("click", ()=>{
      const d = Utils.ymdToDate(viewDateInput.value);
      d.setDate(d.getDate()-1);
      viewDateInput.value = Utils.dateToYMD(d);
      render();
    });
    nextBtn.addEventListener("click", ()=>{
      const d = Utils.ymdToDate(viewDateInput.value);
      d.setDate(d.getDate()+1);
      viewDateInput.value = Utils.dateToYMD(d);
      render();
    });
    todayBtn.addEventListener("click", ()=>{
      viewDateInput.value = Utils.dateToYMD(new Date());
      render();
    });
    openCalendarBtn.addEventListener("click", ()=>{
      viewDateInput.showPicker?.() || viewDateInput.click();
    });
    viewDateInput.addEventListener("change", render);

    // Close score pickers on outside click
    document.addEventListener("click", ()=>window.App.Scores?.closeAllPickers?.());

    // Filters
    filterButtons.forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const level = btn.dataset.level;
        Storage.ui.filters[level] = !Storage.ui.filters[level];

        if (level === "ALL"){
          const allOn = Storage.ui.filters.ALL;
          CONST.LEVEL_ORDER.forEach(lvl=>{
            Storage.ui.filters[lvl] = allOn;
            Storage.ui.expanded[lvl] = allOn;
          });
        } else {
          Storage.ui.filters.ALL = CONST.LEVEL_ORDER.every(lvl => Storage.ui.filters[lvl]);
          Storage.ui.expanded[level] = Storage.ui.filters[level];
        }

        Storage.saveUi();
        updateFilterButtons();
        render();
      });
    });

    // Settings modal open/close
    function openSettings(){ settingsBackdrop.hidden = false; }
    function closeSettings(){ settingsBackdrop.hidden = true; }
    openSettingsBtn.addEventListener("click", openSettings);
    closeSettingsBtn.addEventListener("click", closeSettings);
    settingsBackdrop.addEventListener("click",(ev)=>{ if (ev.target === settingsBackdrop) closeSettings(); });

    // Apply initial settings UI
    toggleHideEnglishNotes.checked = !!Storage.settings.hideEnglishDefault;
    toggleEmojiScores.checked = !!Storage.settings.scoresEnabled;

    // Study Log enabled by default
    toggleHeatmapVisible.checked = true;
    // If heatmap already has saved state, reflect that:
    if (window.Heatmap){
      const hmState = Heatmap.exportState();
      toggleHeatmapVisible.checked = !!hmState.visible;
    }

    toggleHeatmapVisible.addEventListener("change", ()=>{
      if (window.Heatmap) Heatmap.setVisible(!!toggleHeatmapVisible.checked);
    });

    toggleHideEnglishNotes.addEventListener("change", ()=>{
      Storage.settings.hideEnglishDefault = !!toggleHideEnglishNotes.checked;
      Storage.saveSettings();
    });

    toggleEmojiScores.addEventListener("change", ()=>{
      Storage.settings.scoresEnabled = !!toggleEmojiScores.checked;
      Storage.saveSettings();
      window.App.Scores.applyEnabled(Storage.settings.scoresEnabled);

      // refresh screens that show score widgets
      render();
      if (!Utils.qs("#viewAllModal").hidden) window.App.ViewAll.open(); // rebuild in-place feel
      window.App.Cram?.refreshIfOpen?.();
    });

    // Progressive mode UI
    function buildProgressiveGrid(){
      progressiveDatesGrid.innerHTML = "";
      CONST.LEVEL_ORDER.forEach(lvl=>{
        const row = document.createElement("div");
        row.className = "progressive-row";
        row.innerHTML = `
          <div class="lvl">${lvl}</div>
          <button type="button" class="chip-btn today-mini">Today</button>
          <input type="date" />
        `;
        const todayMini = row.querySelector(".today-mini");
        const dateInput = row.querySelector('input[type="date"]');

        const cur = Storage.settings.progressiveStartByLevel?.[lvl] || "";
        dateInput.value = cur;

        todayMini.addEventListener("click", ()=>{
          dateInput.value = Utils.dateToYMD(new Date());
          Storage.settings.progressiveStartByLevel[lvl] = dateInput.value;
          Storage.saveSettings();
          render();
        });

        dateInput.addEventListener("change", ()=>{
          Storage.settings.progressiveStartByLevel[lvl] = dateInput.value;
          Storage.saveSettings();
          render();
        });

        progressiveDatesGrid.appendChild(row);
      });
    }

    toggleProgressiveMode.checked = !!Storage.settings.progressiveEnabled;
    progressiveDatesWrap.hidden = !toggleProgressiveMode.checked;
    if (!progressiveDatesWrap.hidden) buildProgressiveGrid();

    toggleProgressiveMode.addEventListener("change", ()=>{
      Storage.settings.progressiveEnabled = !!toggleProgressiveMode.checked;
      Storage.saveSettings();

      progressiveDatesWrap.hidden = !Storage.settings.progressiveEnabled;
      if (!progressiveDatesWrap.hidden){
        // Fill blanks with today for convenience
        Storage.settings.progressiveStartByLevel = Storage.settings.progressiveStartByLevel || {};
        CONST.LEVEL_ORDER.forEach(lvl=>{
          if (!Storage.settings.progressiveStartByLevel[lvl]){
            Storage.settings.progressiveStartByLevel[lvl] = Utils.dateToYMD(new Date());
          }
        });
        Storage.saveSettings();
        buildProgressiveGrid();
      }
      render();
    });

    // Export / Import (uses Heatmap.exportState() / Heatmap.importState())
    exportBtn.addEventListener("click", ()=>{
      const payload = {
        ...Storage.exportPayload(),
        heatmap: (window.Heatmap ? Heatmap.exportState() : null)
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "jlpt-user-data.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    importBtn.addEventListener("click", ()=>importFileInput.click());
    importFileInput.addEventListener("change",(ev)=>{
      const file = ev.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e)=>{
        try{
          const parsed = JSON.parse(e.target.result);

          Storage.importPayload(parsed);

          // Heatmap import
          if (parsed.heatmap && window.Heatmap) {
            Heatmap.importState(parsed.heatmap);
          }

          // Update settings UI
          toggleHideEnglishNotes.checked = !!Storage.settings.hideEnglishDefault;
          toggleEmojiScores.checked = !!Storage.settings.scoresEnabled;
          toggleProgressiveMode.checked = !!Storage.settings.progressiveEnabled;
          progressiveDatesWrap.hidden = !toggleProgressiveMode.checked;
          if (!progressiveDatesWrap.hidden) buildProgressiveGrid();

          // Heatmap visibility UI
          if (window.Heatmap){
            toggleHeatmapVisible.checked = !!Heatmap.exportState().visible;
          }

          updateFilterButtons();
          window.App.Scores.applyEnabled(Storage.settings.scoresEnabled);
          render();
          if (!Utils.qs("#viewAllModal").hidden) window.App.ViewAll.open();
          window.App.Cram?.refreshIfOpen?.();
        }catch{
          alert("Invalid JSON file.");
        }
      };
      reader.readAsText(file);
      importFileInput.value = "";
    });

    // Initial UI + render
    updateFilterButtons();
    render();
  });
})();

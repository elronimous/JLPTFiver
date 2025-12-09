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


    const deleteAllDataBtn = Utils.qs("#deleteAllDataBtn");

    // Export options modal
    const exportOptionsBackdrop = Utils.qs("#exportOptionsModalBackdrop");
    const closeExportOptionsBtn = Utils.qs("#closeExportOptionsBtn");
    const exportSelectedBtn = Utils.qs("#exportSelectedBtn");
    const exportSelectAllBtn = Utils.qs("#exportSelectAllBtn");
    const exportSelectNoneBtn = Utils.qs("#exportSelectNoneBtn");
    const exSeen = Utils.qs("#exSeen");
    const exNotes = Utils.qs("#exNotes");
    const exScores = Utils.qs("#exScores");
    const exSettings = Utils.qs("#exSettings");
    const exHeatmap = Utils.qs("#exHeatmap");
    const exUi = Utils.qs("#exUi");
    const exCramLists = Utils.qs("#exCramLists");

    // Import options modal
    const importOptionsBackdrop = Utils.qs("#importOptionsModalBackdrop");
    const closeImportOptionsBtn = Utils.qs("#closeImportOptionsBtn");
    const importSummaryHint = Utils.qs("#importSummaryHint");
    const importModeOverwrite = Utils.qs("#importModeOverwrite");
    const importModeMerge = Utils.qs("#importModeMerge");
    const applyImportBtn = Utils.qs("#applyImportBtn");
    const importSelectAllBtn = Utils.qs("#importSelectAllBtn");
    const importSelectNoneBtn = Utils.qs("#importSelectNoneBtn");
    const imSeen = Utils.qs("#imSeen");
    const imNotes = Utils.qs("#imNotes");
    const imScores = Utils.qs("#imScores");
    const imSettings = Utils.qs("#imSettings");
    const imHeatmap = Utils.qs("#imHeatmap");
    const imUi = Utils.qs("#imUi");
    const imCramLists = Utils.qs("#imCramLists");

    // Delete options modal
    const deleteOptionsBackdrop = Utils.qs("#deleteOptionsModalBackdrop");
    const closeDeleteOptionsBtn = Utils.qs("#closeDeleteOptionsBtn");
    const deleteSelectedBtn = Utils.qs("#deleteSelectedBtn");
    const deleteSelectAllBtn = Utils.qs("#deleteSelectAllBtn");
    const deleteSelectNoneBtn = Utils.qs("#deleteSelectNoneBtn");
    const delSeen = Utils.qs("#delSeen");
    const delNotes = Utils.qs("#delNotes");
    const delScores = Utils.qs("#delScores");
    const delSettings = Utils.qs("#delSettings");
    const delHeatmap = Utils.qs("#delHeatmap");
    const delUi = Utils.qs("#delUi");
    const delCramLists = Utils.qs("#delCramLists");
    const delCramSession = Utils.qs("#delCramSession");

    let pendingImport = null; // { parsed, inspect }

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

    // Export / Import (selection + merge/overwrite)
    function downloadJson(payload, filename){
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    function openExportOptions(){ exportOptionsBackdrop.hidden = false; }
    function closeExportOptions(){ exportOptionsBackdrop.hidden = true; }
    exportBtn.addEventListener("click", openExportOptions);
    closeExportOptionsBtn.addEventListener("click", closeExportOptions);
    exportOptionsBackdrop.addEventListener("click", (ev)=>{ if (ev.target === exportOptionsBackdrop) closeExportOptions(); });

    function setExportChecks(val){
      [exSeen, exNotes, exScores, exSettings, exHeatmap, exUi, exCramLists].forEach(cb=>{ if (cb) cb.checked = !!val; });
    }
    exportSelectAllBtn.addEventListener("click", ()=>setExportChecks(true));
    exportSelectNoneBtn.addEventListener("click", ()=>setExportChecks(false));

    exportSelectedBtn.addEventListener("click", ()=>{
      const any = !!(exSeen.checked || exNotes.checked || exScores.checked || exSettings.checked || exHeatmap.checked || exUi.checked || exCramLists.checked);
      if (!any){
        alert("Select at least one thing to export.");
        return;
      }

      const payload = {
        meta: {
          app: "JLPTFiver",
          schemaVersion: 2,
          exportedAt: new Date().toISOString()
        }
      };

      if (exSeen.checked) payload.seenExamples = Storage.userData.seenExamples;
      if (exNotes.checked) payload.notesByGrammar = Storage.userData.notesByGrammar;
      if (exScores.checked) payload.scoresByExample = Storage.userData.scoresByExample;
      if (exSettings.checked) payload.settings = Storage.settings;

      if (exUi.checked || exCramLists.checked){
        payload.ui = {};
        if (exUi.checked){
          payload.ui.filters = Storage.ui.filters;
          payload.ui.expanded = Storage.ui.expanded;
        }
        if (exCramLists.checked){
          payload.ui.cramLists = Storage.ui.cramLists;
        }
      }

      if (exHeatmap.checked && window.Heatmap){
        payload.heatmap = Heatmap.exportState();
      }

      // Give the export a date so multiple backups don't overwrite each other
      const stamp = Utils.dateToYMD(new Date()).replaceAll("-", "");
      downloadJson(payload, `jlptfiver-export-${stamp}.json`);
      closeExportOptions();
    });

    function openImportOptions(){ importOptionsBackdrop.hidden = false; }
    function closeImportOptions(){
      importOptionsBackdrop.hidden = true;
      pendingImport = null;
    }
    closeImportOptionsBtn.addEventListener("click", closeImportOptions);
    importOptionsBackdrop.addEventListener("click", (ev)=>{ if (ev.target === importOptionsBackdrop) closeImportOptions(); });

    function setImportChecks(val){
      [imSeen, imNotes, imScores, imSettings, imHeatmap, imUi, imCramLists].forEach(cb=>{
        if (!cb) return;
        if (cb.disabled) return;
        cb.checked = !!val;
      });
    }
    importSelectAllBtn.addEventListener("click", ()=>setImportChecks(true));
    importSelectNoneBtn.addEventListener("click", ()=>setImportChecks(false));

    function summarizeIncoming(inspect){
      const n = inspect.normalized;
      const parts = [];
      const count = (x)=> x && typeof x === "object" ? Object.keys(x).length : 0;
      if (inspect.hasSeen) parts.push(`Stars: ${count(n.seenExamples)}`);
      if (inspect.hasNotes) parts.push(`Notes: ${count(n.notesByGrammar)} grammar points`);
      if (inspect.hasScores) parts.push(`Scores: ${count(n.scoresByExample)}`);
      if (inspect.hasSettings) parts.push(`Settings: ${count(n.settings)} keys`);
      if (inspect.hasUi) parts.push(`UI: ${count(n.ui?.filters)} filters / ${count(n.ui?.expanded)} expanded`);
      if (inspect.hasCramLists) parts.push(`Cram lists: ${count(n.ui?.cramLists)}`);
      if (inspect.hasHeatmap) parts.push(`Study Log: ${count(n.heatmap?.visitedDays)} days`);
      return parts.length ? `File contains: ${parts.join(" • ")}` : "This file doesn't contain any data I recognise.";
    }

    function mergeHeatmapState(existing, incoming){
      const out = JSON.parse(JSON.stringify(existing || {}));
      const inc = incoming && typeof incoming === "object" ? incoming : {};

      // Only merge content, not presentation settings
      out.visitedDays = out.visitedDays && typeof out.visitedDays === "object" ? out.visitedDays : {};
      if (inc.visitedDays && typeof inc.visitedDays === "object"){
        Object.keys(inc.visitedDays).forEach(ymd=>{
          if (out.visitedDays[ymd] === undefined) out.visitedDays[ymd] = !!inc.visitedDays[ymd];
        });
      }

      out.goals = Array.isArray(out.goals) ? out.goals : [];
      const curIds = new Set(out.goals.map(g=>g && g.id).filter(Boolean));
      const curSig = new Set(out.goals.map(g=>`${g?.ymd||""}|||${g?.emoji||""}|||${g?.text||""}`));
      const incGoals = Array.isArray(inc.goals) ? inc.goals : [];
      incGoals.forEach(g=>{
        if (!g || typeof g !== "object") return;
        if (g.id && curIds.has(g.id)) return;
        const sig = `${g?.ymd||""}|||${g?.emoji||""}|||${g?.text||""}`;
        if (curSig.has(sig)) return;
        out.goals.push(g);
        if (g.id) curIds.add(g.id);
        curSig.add(sig);
      });

      return out;
    }

    importBtn.addEventListener("click", ()=>importFileInput.click());
    importFileInput.addEventListener("change", (ev)=>{
      const file = ev.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e)=>{
        try{
          const parsed = JSON.parse(e.target.result);
          const inspect = Storage.inspectPayload(parsed);
          pendingImport = { parsed, inspect };

          // Fill summary + enable/disable options based on availability
          importSummaryHint.textContent = summarizeIncoming(inspect);

          const setOpt = (cb, has)=>{
            cb.disabled = !has;
            cb.checked = !!has;
          };
          setOpt(imSeen, inspect.hasSeen);
          setOpt(imNotes, inspect.hasNotes);
          setOpt(imScores, inspect.hasScores);
          setOpt(imSettings, inspect.hasSettings);
          setOpt(imUi, inspect.hasUi);
          setOpt(imCramLists, inspect.hasCramLists);
          setOpt(imHeatmap, inspect.hasHeatmap);

          // Default mode
          importModeOverwrite.checked = true;
          importModeMerge.checked = false;

          openImportOptions();
        }catch{
          alert("Invalid JSON file.");
        }
      };
      reader.readAsText(file);
      importFileInput.value = "";
    });

    applyImportBtn.addEventListener("click", ()=>{
      if (!pendingImport) return;

      const mode = importModeMerge.checked ? "merge" : "overwrite";
      const include = {
        seen: !!imSeen.checked,
        notes: !!imNotes.checked,
        scores: !!imScores.checked,
        settings: !!imSettings.checked,
        ui: !!imUi.checked,
        cramLists: !!imCramLists.checked
      };
      const any = Object.values(include).some(Boolean) || !!imHeatmap.checked;
      if (!any){
        alert("Select at least one thing to import.");
        return;
      }

      // Storage import (handles merge/overwrite)
      Storage.importSelected(pendingImport.parsed, { mode, include });

      // Heatmap import/merge
      if (imHeatmap.checked && window.Heatmap && pendingImport.inspect.normalized.heatmap){
        const incomingHm = pendingImport.inspect.normalized.heatmap;
        if (mode === "overwrite"){
          Heatmap.importState(incomingHm);
        } else {
          const merged = mergeHeatmapState(Heatmap.exportState(), incomingHm);
          Heatmap.importState(merged);
        }
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

      closeImportOptions();
    });
    // Delete data (with a checkbox picker)
    function setDeleteChecks(val){
      [delSeen, delNotes, delScores, delSettings, delHeatmap, delUi, delCramLists, delCramSession].forEach(cb=>{
        if (cb) cb.checked = !!val;
      });
    }

    function openDeleteOptions(){
      if (!deleteOptionsBackdrop) return;
      setDeleteChecks(true);
      deleteOptionsBackdrop.hidden = false;
    }
    function closeDeleteOptions(){
      if (!deleteOptionsBackdrop) return;
      deleteOptionsBackdrop.hidden = true;
    }

    deleteAllDataBtn.addEventListener("click", openDeleteOptions);
    closeDeleteOptionsBtn?.addEventListener("click", closeDeleteOptions);
    deleteOptionsBackdrop?.addEventListener("click", (ev)=>{ if (ev.target === deleteOptionsBackdrop) closeDeleteOptions(); });
    deleteSelectAllBtn?.addEventListener("click", ()=>setDeleteChecks(true));
    deleteSelectNoneBtn?.addEventListener("click", ()=>setDeleteChecks(false));

    function deleteSelected(){
      const items = [
        { cb: delSeen, label: "Stars / Seen items" },
        { cb: delNotes, label: "Custom sentences (Notes)" },
        { cb: delScores, label: "Emoji scores" },
        { cb: delSettings, label: "App settings" },
        { cb: delHeatmap, label: "Study Log (heatmap)" },
        { cb: delUi, label: "UI (filters + expanded sections)" },
        { cb: delCramLists, label: "Custom cram lists" },
        { cb: delCramSession, label: "Saved cram session" },
      ];
      const picked = items.filter(x=>x.cb && x.cb.checked);
      if (!picked.length){
        alert("Select at least one thing to delete.");
        return;
      }

      const list = picked.map(x=>`• ${x.label}`).join('\n');
      const ok1 = confirm(`Delete the selected data?\n\n${list}\n\nThis cannot be undone.`);
      if (!ok1) return;
      const ok2 = confirm("Really delete? This cannot be undone.");
      if (!ok2) return;

      const allChecked = items.every(x=>x.cb && x.cb.checked);
      if (allChecked){
        Object.values(CONST.STORAGE_KEYS).forEach(k=>localStorage.removeItem(k));
        closeDeleteOptions();
        location.reload();
        return;
      }

      let userDataChanged = false;
      if (delSeen?.checked){ Storage.userData.seenExamples = {}; userDataChanged = true; }
      if (delNotes?.checked){ Storage.userData.notesByGrammar = {}; userDataChanged = true; }
      if (delScores?.checked){ Storage.userData.scoresByExample = {}; userDataChanged = true; }
      if (userDataChanged) Storage.saveUserData();

      if (delSettings?.checked){
        Storage.settings = {
          hideEnglishDefault: false,
          scoresEnabled: true,
          progressiveEnabled: false,
          progressiveStartByLevel: {}
        };
        Storage.saveSettings();
      }

      if (delUi?.checked){
        Storage.ui.filters = { ALL:true, N5:true, N4:true, N3:true, N2:true, N1:true };
        Storage.ui.expanded = { N5:true, N4:true, N3:true, N2:true, N1:true };
        Storage.saveUi();
      }

      if (delCramLists?.checked){
        Storage.ui.cramLists = {};
        Storage.saveUi();
      }

      if (delHeatmap?.checked){
        localStorage.removeItem(CONST.STORAGE_KEYS.HEATMAP);
      }
      if (delCramSession?.checked){
        localStorage.removeItem(CONST.STORAGE_KEYS.CRAM_SESSION);
      }

      closeDeleteOptions();
      location.reload();
    }

    deleteSelectedBtn?.addEventListener("click", deleteSelected);
    // Initial UI + render
    updateFilterButtons();
    render();
  });
})();

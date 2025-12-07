(function(){
  window.App = window.App || {};
  const { CONST, Utils } = window.App;

  const Storage = {};

  function loadJSON(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    }catch{
      return fallback;
    }
  }
  function saveJSON(key, val){
    localStorage.setItem(key, JSON.stringify(val));
  }

  // UI state
  Storage.ui = {
    filters: loadJSON(CONST.STORAGE_KEYS.FILTERS, {ALL:true,N5:true,N4:true,N3:true,N2:true,N1:true}),
    expanded: loadJSON(CONST.STORAGE_KEYS.EXPANDED, {N5:true,N4:true,N3:true,N2:true,N1:true})
  };

  // Settings
  Storage.settings = loadJSON(CONST.STORAGE_KEYS.SETTINGS, null) || {
    hideEnglishDefault: false,
    scoresEnabled: true,
    progressiveEnabled: false,
    progressiveStartByLevel: {} // level -> "YYYY-MM-DD"
  };

  // User data
  Storage.userData = loadJSON(CONST.STORAGE_KEYS.USERDATA, null) || {
    seenExamples: {},      // exampleId -> true
    notesByGrammar: {},    // grammarKey -> [{jpHtml,enHtml}]
    scoresByExample: {}    // exampleId -> 0..SCORE_MAX
  };

  // Migrations / shape fixes
  function migrate(){
    const ud = Storage.userData;

    // Older exports might call this "stars"
    if (!ud.seenExamples && ud.stars){
      ud.seenExamples = ud.stars;
      delete ud.stars;
    }
    if (!ud.notesByGrammar || typeof ud.notesByGrammar !== "object") ud.notesByGrammar = {};
    Object.keys(ud.notesByGrammar).forEach(k=>{
      const arr = Array.isArray(ud.notesByGrammar[k]) ? ud.notesByGrammar[k] : [];
      ud.notesByGrammar[k] = arr.map(n=>{
        if (n && (typeof n.jpHtml === "string" || typeof n.enHtml === "string")){
          return { jpHtml: String(n.jpHtml||""), enHtml: String(n.enHtml||"") };
        }
        const jp = n && typeof n.jp === "string" ? n.jp : "";
        const en = n && typeof n.en === "string" ? n.en : "";
        return { jpHtml: Utils.escapeHtml(jp), enHtml: Utils.escapeHtml(en) };
      });
    });

    if (!ud.scoresByExample || typeof ud.scoresByExample !== "object") ud.scoresByExample = {};
    Object.keys(ud.scoresByExample).forEach(k=>{
      const n = parseInt(ud.scoresByExample[k],10);
      if (!Number.isFinite(n)) delete ud.scoresByExample[k];
      else ud.scoresByExample[k] = Math.max(0, Math.min(CONST.SCORE_MAX, n));
    });

    if (typeof Storage.settings.hideEnglishDefault !== "boolean") Storage.settings.hideEnglishDefault = false;
    if (typeof Storage.settings.scoresEnabled !== "boolean") Storage.settings.scoresEnabled = true;
    if (typeof Storage.settings.progressiveEnabled !== "boolean") Storage.settings.progressiveEnabled = false;
    if (!Storage.settings.progressiveStartByLevel || typeof Storage.settings.progressiveStartByLevel !== "object"){
      Storage.settings.progressiveStartByLevel = {};
    }
  }
  migrate();

  Storage.saveUi = () => {
    saveJSON(CONST.STORAGE_KEYS.FILTERS, Storage.ui.filters);
    saveJSON(CONST.STORAGE_KEYS.EXPANDED, Storage.ui.expanded);
  };

  Storage.saveSettings = () => saveJSON(CONST.STORAGE_KEYS.SETTINGS, Storage.settings);
  Storage.saveUserData = () => saveJSON(CONST.STORAGE_KEYS.USERDATA, Storage.userData);

  Storage.exportPayload = () => ({
    seenExamples: Storage.userData.seenExamples,
    notesByGrammar: Storage.userData.notesByGrammar,
    scoresByExample: Storage.userData.scoresByExample,
    settings: Storage.settings,
    ui: Storage.ui
  });

  Storage.importPayload = (parsed) => {
    if (!parsed || typeof parsed !== "object") return;

    // Allow both shapes
    if (parsed.seenExamples || parsed.notesByGrammar || parsed.scoresByExample){
      Storage.userData.seenExamples = parsed.seenExamples || {};
      Storage.userData.notesByGrammar = parsed.notesByGrammar || {};
      Storage.userData.scoresByExample = parsed.scoresByExample || {};
    } else if (parsed.userData){
      Storage.userData = parsed.userData;
    }

    if (parsed.settings) Storage.settings = { ...Storage.settings, ...parsed.settings };
    if (parsed.ui){
      if (parsed.ui.filters) Storage.ui.filters = parsed.ui.filters;
      if (parsed.ui.expanded) Storage.ui.expanded = parsed.ui.expanded;
    }

    migrate();
    Storage.saveUserData();
    Storage.saveSettings();
    Storage.saveUi();
  };

  window.App.Storage = Storage;
})();

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
  const uiExtras = loadJSON(CONST.STORAGE_KEYS.UI_EXTRAS, {});
  Storage.ui = {
    filters: loadJSON(CONST.STORAGE_KEYS.FILTERS, {ALL:true,N5:true,N4:true,N3:true,N2:true,N1:true}),
    expanded: loadJSON(CONST.STORAGE_KEYS.EXPANDED, {N5:true,N4:true,N3:true,N2:true,N1:true}),
    cramLists: loadJSON(CONST.STORAGE_KEYS.CRAM_LISTS, {}),
    // Snake mini-game (Study Log Easter egg)
    snakeHiScore: (Number.isFinite(Number(uiExtras?.snakeHiScore)) ? Math.max(0, Math.floor(Number(uiExtras.snakeHiScore))) : 0),
    // Mini games (Invaders / Asteroids)
    invadersHiScore: (Number.isFinite(Number(uiExtras?.invadersHiScore)) ? Math.max(0, Math.floor(Number(uiExtras.invadersHiScore))) : 0),
    asteroidsHiScore: (Number.isFinite(Number(uiExtras?.asteroidsHiScore)) ? Math.max(0, Math.floor(Number(uiExtras.asteroidsHiScore))) : 0)
  };

  // Settings
  Storage.settings = loadJSON(CONST.STORAGE_KEYS.SETTINGS, null) || {
    hideEnglishDefault: false,
    scoresEnabled: true,
    progressiveEnabled: false,
    progressiveStartByLevel: {}, // level -> "YYYY-MM-DD"
    srsEnabled: false,
    cardFontScale: 1
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


    // SRS deck + history (user data)
    if (!ud.srs || typeof ud.srs !== "object") ud.srs = {};
    const srs = ud.srs;
    if (!srs.cardsByKey || typeof srs.cardsByKey !== "object") srs.cardsByKey = {};
    if (!srs.fsrsSettings || typeof srs.fsrsSettings !== "object") srs.fsrsSettings = {};
    const gArr = Array.isArray(srs.grammarKeys) ? srs.grammarKeys.map(String) : [];
    const gSeen = new Set();
    srs.grammarKeys = gArr.filter(k=>{
      if (!k) return false;
      if (gSeen.has(k)) return false;
      gSeen.add(k);
      return true;
    });
    if (srs.mode !== "grammar" && srs.mode !== "sentences") srs.mode = "grammar";
    const eg = Number(srs.examplesPerGrammar || 3);
    srs.examplesPerGrammar = Number.isFinite(eg) ? Math.max(1, Math.min(10, eg)) : 3;
    srs.examplesPerGrammarAll = !!srs.examplesPerGrammarAll;

    // Normalise card records (keep unknown fields as-is)
    if (srs.cardsByKey && typeof srs.cardsByKey === "object"){
      Object.keys(srs.cardsByKey).forEach(k=>{
        const c = srs.cardsByKey[k];
        if (!c || typeof c !== "object") { delete srs.cardsByKey[k]; return; }
        if (typeof c.known !== "boolean") c.known = false;
        if (typeof c.performance !== "number" || !Number.isFinite(c.performance)) c.performance = 0;
        // dueMinutes/lastMinutes are optional; keep if valid
        if (c.dueMinutes !== null && c.dueMinutes !== undefined){
          const dm = Number(c.dueMinutes);
          c.dueMinutes = Number.isFinite(dm) ? dm : 0;
        }
        if (c.lastMinutes !== null && c.lastMinutes !== undefined){
          const lm = Number(c.lastMinutes);
          c.lastMinutes = Number.isFinite(lm) ? lm : null;
        }
      });
    }

    if (typeof Storage.settings.hideEnglishDefault !== "boolean") Storage.settings.hideEnglishDefault = false;
    if (typeof Storage.settings.scoresEnabled !== "boolean") Storage.settings.scoresEnabled = true;
    if (typeof Storage.settings.progressiveEnabled !== "boolean") Storage.settings.progressiveEnabled = false;
    if (!Storage.settings.progressiveStartByLevel || typeof Storage.settings.progressiveStartByLevel !== "object"){
      Storage.settings.progressiveStartByLevel = {};
    }

    if (typeof Storage.settings.srsEnabled !== "boolean") Storage.settings.srsEnabled = false;
    if (typeof Storage.settings.cardFontScale !== "number" || !Number.isFinite(Storage.settings.cardFontScale)){
      Storage.settings.cardFontScale = 1;
    }

    // Cram custom lists (UI)
    if (!Storage.ui.cramLists || typeof Storage.ui.cramLists !== "object") Storage.ui.cramLists = {};
    Object.keys(Storage.ui.cramLists).forEach(name=>{
      const arr = Array.isArray(Storage.ui.cramLists[name]) ? Storage.ui.cramLists[name] : [];
      const seen = new Set();
      Storage.ui.cramLists[name] = arr.map(x=>String(x)).filter(x=>{
        if (!x) return false;
        if (seen.has(x)) return false;
        seen.add(x);
        return true;
      });
    });

    // Snake hi-score (UI)
    const hs = Number(Storage.ui.snakeHiScore);
    Storage.ui.snakeHiScore = (Number.isFinite(hs) ? Math.max(0, Math.floor(hs)) : 0);
  }
  migrate();

  Storage.saveUi = () => {
    saveJSON(CONST.STORAGE_KEYS.FILTERS, Storage.ui.filters);
    saveJSON(CONST.STORAGE_KEYS.EXPANDED, Storage.ui.expanded);
    saveJSON(CONST.STORAGE_KEYS.CRAM_LISTS, Storage.ui.cramLists);
    saveJSON(CONST.STORAGE_KEYS.UI_EXTRAS, { snakeHiScore: Storage.ui.snakeHiScore, invadersHiScore: Storage.ui.invadersHiScore, asteroidsHiScore: Storage.ui.asteroidsHiScore });
  };

  Storage.saveSettings = () => saveJSON(CONST.STORAGE_KEYS.SETTINGS, Storage.settings);
  Storage.saveUserData = () => saveJSON(CONST.STORAGE_KEYS.USERDATA, Storage.userData);

  Storage.exportPayload = () => ({
    seenExamples: Storage.userData.seenExamples,
    notesByGrammar: Storage.userData.notesByGrammar,
    scoresByExample: Storage.userData.scoresByExample,
    srs: Storage.userData.srs,
    settings: Storage.settings,
    ui: Storage.ui
  });

  Storage.importPayload = (parsed) => {
    if (!parsed || typeof parsed !== "object") return;

    // Allow both shapes
    if (parsed.seenExamples || parsed.notesByGrammar || parsed.scoresByExample || parsed.srs){
      Storage.userData.seenExamples = parsed.seenExamples || {};
      Storage.userData.notesByGrammar = parsed.notesByGrammar || {};
      Storage.userData.scoresByExample = parsed.scoresByExample || {};
      if (parsed.srs) Storage.userData.srs = parsed.srs;
    } else if (parsed.userData){
      Storage.userData = parsed.userData;
    }

    if (parsed.settings) Storage.settings = { ...Storage.settings, ...parsed.settings };
    if (parsed.ui){
      if (parsed.ui.filters) Storage.ui.filters = parsed.ui.filters;
      if (parsed.ui.expanded) Storage.ui.expanded = parsed.ui.expanded;
      if (parsed.ui.cramLists) Storage.ui.cramLists = parsed.ui.cramLists;
      if (parsed.ui.snakeHiScore !== undefined) Storage.ui.snakeHiScore = parsed.ui.snakeHiScore;
      if (parsed.ui.invadersHiScore !== undefined) Storage.ui.invadersHiScore = parsed.ui.invadersHiScore;
      if (parsed.ui.asteroidsHiScore !== undefined) Storage.ui.asteroidsHiScore = parsed.ui.asteroidsHiScore;
    }

    migrate();
    Storage.saveUserData();
    Storage.saveSettings();
    Storage.saveUi();
  };



  function normalizeIncoming(parsed){
    // Supports full exports, partial exports, and older shapes.
    // Returns a canonical object with nulls for missing sections.
    const out = {
      meta: (parsed && typeof parsed === "object") ? (parsed.meta || null) : null,
      seenExamples: null,
      notesByGrammar: null,
      scoresByExample: null,
      settings: null,
      ui: null,
      heatmap: null,
      srs: null
    };
    if (!parsed || typeof parsed !== "object") return out;

    // Some old exports nest inside userData
    const srcUser = (parsed.userData && typeof parsed.userData === "object") ? parsed.userData : parsed;

    const seen = srcUser.seenExamples || srcUser.stars || parsed.seenExamples || parsed.stars;
    const notes = srcUser.notesByGrammar || parsed.notesByGrammar;
    const scores = srcUser.scoresByExample || parsed.scoresByExample;
    const srs = srcUser.srs || parsed.srs;

    if (seen && typeof seen === "object") out.seenExamples = seen;
    if (notes && typeof notes === "object") out.notesByGrammar = notes;
    if (scores && typeof scores === "object") out.scoresByExample = scores;
    if (srs && typeof srs === "object") out.srs = srs;

    const settings = parsed.settings || srcUser.settings;
    if (settings && typeof settings === "object") out.settings = settings;

    const ui = parsed.ui || srcUser.ui || {
      filters: parsed.filters || srcUser.filters,
      expanded: parsed.expanded || srcUser.expanded,
      cramLists: parsed.cramLists || srcUser.cramLists,
      snakeHiScore: parsed.snakeHiScore || srcUser.snakeHiScore,
      invadersHiScore: parsed.invadersHiScore || srcUser.invadersHiScore,
      asteroidsHiScore: parsed.asteroidsHiScore || srcUser.asteroidsHiScore
    };
    if (ui && typeof ui === "object") out.ui = ui;

    if (parsed.heatmap && typeof parsed.heatmap === "object") out.heatmap = parsed.heatmap;

    return out;
  }

  Storage.inspectPayload = (parsed) => {
    const n = normalizeIncoming(parsed);
    const isObj = (x)=>!!x && typeof x === "object";
    return {
      normalized: n,
      hasSeen: isObj(n.seenExamples),
      hasNotes: isObj(n.notesByGrammar),
      hasScores: isObj(n.scoresByExample),
      hasSrs: isObj(n.srs),
      hasSettings: isObj(n.settings),
      hasUi: isObj(n.ui) && (isObj(n.ui.filters) || isObj(n.ui.expanded) || isObj(n.ui.cramLists) || Number.isFinite(Number(n.ui.snakeHiScore)) || Number.isFinite(Number(n.ui.invadersHiScore)) || Number.isFinite(Number(n.ui.asteroidsHiScore))),
      hasCramLists: isObj(n.ui) && isObj(n.ui.cramLists),
      hasHeatmap: isObj(n.heatmap)
    };
  };

  function normalizeSrsShape(srsIn){
    const s = (srsIn && typeof srsIn === "object") ? JSON.parse(JSON.stringify(srsIn)) : {};
    if (!s.cardsByKey || typeof s.cardsByKey !== "object") s.cardsByKey = {};
    if (!Array.isArray(s.grammarKeys)) s.grammarKeys = [];
    s.grammarKeys = s.grammarKeys.map(String);
    // de-dupe
    const seen = new Set();
    s.grammarKeys = s.grammarKeys.filter(k=>{
      if (!k) return false;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (s.mode !== "grammar" && s.mode !== "sentences") s.mode = "grammar";
    const eg = Number(s.examplesPerGrammar || 3);
    s.examplesPerGrammar = Number.isFinite(eg) ? Math.max(1, Math.min(10, eg)) : 3;
    s.examplesPerGrammarAll = !!s.examplesPerGrammarAll;
    if (!s.fsrsSettings || typeof s.fsrsSettings !== "object") s.fsrsSettings = {};
    return s;
  }

  function mergeSrs(existing, incoming){
    const cur = normalizeSrsShape(existing);
    const inc = normalizeSrsShape(incoming);

    // Keys: union
    const set = new Set(cur.grammarKeys || []);
    (inc.grammarKeys || []).forEach(k=>{ if (k && !set.has(k)) set.add(k); });
    cur.grammarKeys = Array.from(set);

    // Cards: add missing only
    cur.cardsByKey = cur.cardsByKey && typeof cur.cardsByKey === "object" ? cur.cardsByKey : {};
    const incCards = inc.cardsByKey && typeof inc.cardsByKey === "object" ? inc.cardsByKey : {};
    Object.keys(incCards).forEach(k=>{
      if (cur.cardsByKey[k] === undefined) cur.cardsByKey[k] = incCards[k];
    });

    // FSRS settings: apply incoming values (global tuning)
    cur.fsrsSettings = cur.fsrsSettings && typeof cur.fsrsSettings === "object" ? cur.fsrsSettings : {};
    if (inc.fsrsSettings && typeof inc.fsrsSettings === "object"){
      cur.fsrsSettings = { ...cur.fsrsSettings, ...inc.fsrsSettings };
    }

    return cur;
  }

  function mergeObjectAddMissing(target, incoming){
    if (!incoming || typeof incoming !== "object") return;
    Object.keys(incoming).forEach(k=>{
      if (target[k] === undefined) target[k] = incoming[k];
    });
  }

  function mergeSeenExamples(target, incoming){
    if (!incoming || typeof incoming !== "object") return;
    Object.keys(incoming).forEach(id=>{
      if (target[id] === undefined) target[id] = !!incoming[id];
    });
  }

  function mergeScores(target, incoming){
    if (!incoming || typeof incoming !== "object") return;
    Object.keys(incoming).forEach(id=>{
      if (target[id] === undefined) target[id] = incoming[id];
    });
  }

  function mergeNotes(target, incoming){
    if (!incoming || typeof incoming !== "object") return;
    Object.keys(incoming).forEach(gk=>{
      const incArr = Array.isArray(incoming[gk]) ? incoming[gk] : [];
      if (!target[gk]){
        target[gk] = incArr;
        return;
      }
      const curArr = Array.isArray(target[gk]) ? target[gk] : [];
      const seen = new Set(curArr.map(n=>`${n?.jpHtml||""}|||${n?.enHtml||""}`));
      incArr.forEach(n=>{
        const key = `${n?.jpHtml||""}|||${n?.enHtml||""}`;
        if (!seen.has(key)){
          seen.add(key);
          curArr.push(n)
        }
      });
      target[gk] = curArr;
    });
  }

  function mergeCramLists(target, incoming){
    if (!incoming || typeof incoming !== "object") return;
    Object.keys(incoming).forEach(name=>{
      const incArr = Array.isArray(incoming[name]) ? incoming[name].map(String) : [];
      if (!target[name]){
        target[name] = incArr;
        return;
      }
      const curArr = Array.isArray(target[name]) ? target[name].map(String) : [];
      const set = new Set(curArr);
      incArr.forEach(k=>{ if (k && !set.has(k)) { set.add(k); curArr.push(k); } });
      target[name] = curArr;
    });
  }

  Storage.importSelected = (parsed, opts) => {
    if (!parsed || typeof parsed !== "object") return;
    const mode = (opts && opts.mode === "merge") ? "merge" : "overwrite";
    const include = (opts && opts.include) ? opts.include : {};
    const n = normalizeIncoming(parsed);

    // User data
    if (include.seen && n.seenExamples){
      if (mode === "overwrite") Storage.userData.seenExamples = n.seenExamples;
      else mergeSeenExamples(Storage.userData.seenExamples, n.seenExamples);
    }
    if (include.notes && n.notesByGrammar){
      if (mode === "overwrite") Storage.userData.notesByGrammar = n.notesByGrammar;
      else {
        Storage.userData.notesByGrammar = Storage.userData.notesByGrammar || {};
        // Add only missing sentences; avoid duplicates by jp+en content
        Object.keys(n.notesByGrammar).forEach(gk=>{
          const incArr = Array.isArray(n.notesByGrammar[gk]) ? n.notesByGrammar[gk] : [];
          const curArr = Array.isArray(Storage.userData.notesByGrammar[gk]) ? Storage.userData.notesByGrammar[gk] : [];
          const seen = new Set(curArr.map(x=>`${x?.jpHtml||""}|||${x?.enHtml||""}`));
          incArr.forEach(x=>{
            const key = `${x?.jpHtml||""}|||${x?.enHtml||""}`;
            if (!seen.has(key)){
              seen.add(key);
              curArr.push(x);
            }
          });
          Storage.userData.notesByGrammar[gk] = curArr;
        });
      }
    }
    if (include.scores && n.scoresByExample){
      if (mode === "overwrite") Storage.userData.scoresByExample = n.scoresByExample;
      else mergeScores(Storage.userData.scoresByExample, n.scoresByExample);
    }

    // SRS
    if (include.srs && n.srs){
      if (mode === "overwrite") Storage.userData.srs = normalizeSrsShape(n.srs);
      else Storage.userData.srs = mergeSrs(Storage.userData.srs, n.srs);
    }

    // Settings
    if (include.settings && n.settings){
      if (mode === "overwrite") Storage.settings = { ...Storage.settings, ...n.settings };
      else {
        Storage.settings = Storage.settings || {};
        mergeObjectAddMissing(Storage.settings, n.settings);
      }
    }

    // UI
    if (include.ui && n.ui){
      if (n.ui.filters && typeof n.ui.filters === "object"){
        if (mode === "overwrite") Storage.ui.filters = n.ui.filters;
        else mergeObjectAddMissing(Storage.ui.filters, n.ui.filters);
      }
      if (n.ui.expanded && typeof n.ui.expanded === "object"){
        if (mode === "overwrite") Storage.ui.expanded = n.ui.expanded;
        else mergeObjectAddMissing(Storage.ui.expanded, n.ui.expanded);
      }

      // Snake mini-game hi score (keep the highest score in merge mode)
      if (n.ui.snakeHiScore !== null && n.ui.snakeHiScore !== undefined){
        const incoming = Number(n.ui.snakeHiScore);
        if (Number.isFinite(incoming)){
          const inc = Math.max(0, Math.floor(incoming));
          if (mode === "overwrite") Storage.ui.snakeHiScore = inc;
          else Storage.ui.snakeHiScore = Math.max(Number(Storage.ui.snakeHiScore) || 0, inc);
        }
      }
    }
    if (include.cramLists && n.ui && n.ui.cramLists){
      if (mode === "overwrite") Storage.ui.cramLists = n.ui.cramLists;
      else mergeCramLists(Storage.ui.cramLists, n.ui.cramLists);
    }

    migrate();
    Storage.saveUserData();
    Storage.saveSettings();
    Storage.saveUi();
  };
  window.App.Storage = Storage;
})();
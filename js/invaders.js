(function(){
  window.App = window.App || {};
  const { Utils } = window.App;

  const Invaders = {};

  const HOLD_MS = 5000;
  const MODE = { INVADERS: "invaders", ASTEROIDS: "asteroids" };

  let inited = false;

  // long-press trigger state
  let holdTimer = null;
  let holdBtn = null;
  let holdLevel = null;
  let suppressClickUntil = 0;

  // mode picker
  let pickerBackdrop = null;
  let picker = null;
  let pendingLevel = null;
  let pendingLevels = null; // Set<string>

  // overlay DOM
  let backdrop = null;
  let overlay = null;
  let quitBtn = null;
  let scoreEl = null;
  let livesEl = null;
  let defEl = null;
  let centerEl = null;
  // flashcard UI (after a correct hit)
  let cardWrapEl = null;
  let cardTitleEl = null;
  let cardDescEl = null;
  let cardJpEl = null;
  let cardEnEl = null;
  let cardHintEl = null;
    let cardFontControlsEl = null;
  let cardExNavEl = null;
  let cardExCountEl = null;
  let cardExPrevBtn = null;
  let cardExNextBtn = null;
  let cardFontMinusBtn = null;
  let cardFontPlusBtn = null;

  let cardGp = null;
  let cardNotes = [];
  let cardNoteIndex = 0;
let canvas = null;
  let ctx = null;

  // common game state
  let active = false;
  let mode = null;
  let gameOver = false;
  let level = null; // legacy single-level label (used for display)
  let levelsSelected = []; // string[]
  let pool = [];
  let correct = null;
  let score = 0;
  let lives = 5;

  // invaders-only pause (show flashcard after correct)
  let invCardActive = false;

  let rafId = 0;
  let lastT = 0;
  let resizeHandler = null;
  let blurHandler = null;

  // round pacing (avoids setTimeout freezes)
  let roundCooldown = 0;

  // ------------------------
  // Invaders-specific
  // ------------------------
  const inv = {
    enemies: [], // {item, x, y, vy, w, h}
    bullets: [], // {x, y, vy}
    ship: { x: 0, y: 0, w: 54, h: 16, speed: 520 },
    keys: { left:false, right:false },
    lastShotAt: 0,
    shotCooldownMs: 220,
  };

  // ------------------------
  // Asteroids-specific
  // ------------------------
  const ast = {
    rocks: [],   // {item, x,y, vx,vy, r}
    bullets: [], // {x,y, vx,vy, ttl}
    ship: { x: 0, y: 0, vx: 0, vy: 0, ang: -Math.PI/2, r: 14 },
    keys: { left:false, right:false, thrust:false },
    lastShotAt: 0,
    shotCooldownMs: 180,
  };

  // ------------------------
  // Trigger logic
  // ------------------------
  function clearHold(){
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
    if (holdBtn) holdBtn.classList.remove("invaders-holding");
    holdBtn = null;
    holdLevel = null;
  }

  function startHold(btn, lvl){
    if (active || (picker && !picker.hidden)) return;
    clearHold();
    holdBtn = btn;
    holdLevel = lvl;
    btn.classList.add("invaders-holding");
    holdTimer = setTimeout(() => {
      suppressClickUntil = Date.now() + 900;
      clearHold();
      showModePicker(lvl);
    }, HOLD_MS);
  }

  function attachTriggers(){
    const btns = Utils.qsa(".level-filter-row .level-filter-btn")
      .filter(b => /^N[1-5]$/.test(b?.dataset?.level || ""));

    btns.forEach(btn => {
      const lvl = btn.dataset.level;

      // Prevent filter toggle click after successful long-press
      btn.addEventListener("click", (ev)=>{
        if (Date.now() < suppressClickUntil){
          ev.preventDefault();
          ev.stopImmediatePropagation();
        }
      }, true);

      btn.addEventListener("pointerdown", (ev)=>{
        if (ev.button != null && ev.button !== 0) return;
        startHold(btn, lvl);
      }, { passive:true });

      const cancel = ()=>clearHold();
      btn.addEventListener("pointerup", cancel);
      btn.addEventListener("pointercancel", cancel);
      btn.addEventListener("pointerleave", cancel);
      btn.addEventListener("contextmenu", (ev)=>{
        if (holdTimer || active || (picker && !picker.hidden)) ev.preventDefault();
      });
    });
  }

  // ------------------------
  // Overlay + UI
  // ------------------------
  function ensureOverlay(){
    if (!backdrop){
      backdrop = document.createElement("div");
      backdrop.className = "invaders-backdrop";
      backdrop.hidden = true;
      document.body.appendChild(backdrop);
    }

    if (overlay) return;

    overlay = document.createElement("div");
    overlay.className = "invaders-overlay";
    overlay.hidden = true;

    overlay.innerHTML = `
      <button type="button" class="chip-btn invaders-quit">QUIT</button>
      <div class="invaders-lives">Lives: 5</div>
      <div class="invaders-score">Score: 0</div>
      <div class="invaders-center" aria-live="polite"></div>
      <div class="invaders-definition" aria-live="polite"></div>
      <div class="invaders-flashcard" hidden>
        <div class="invaders-flashcard-card">
          <div class="invaders-flashcard-jp"></div>
          <div class="invaders-flashcard-en"></div>
          <div class="invaders-flashcard-title"></div>
          <div class="invaders-flashcard-desc"></div>

          <div class="card-font-controls">
            <button type="button" class="card-font-btn" data-delta="-1" aria-label="Smaller text">−</button>
            <button type="button" class="card-font-btn" data-delta="1" aria-label="Larger text">+</button>
          </div>

          <div class="card-ex-nav" hidden>
            <button type="button" class="card-ex-btn" data-dir="-1" aria-label="Previous sentence">‹</button>
            <span class="card-ex-count">1/1</span>
            <button type="button" class="card-ex-btn" data-dir="1" aria-label="Next sentence">›</button>
          </div>

          <div class="invaders-flashcard-hint">Press Space to continue</div>
        </div>
      </div>
      <canvas class="invaders-canvas" aria-label="JLPT mini-game"></canvas>
    `;

    document.body.appendChild(overlay);

    quitBtn = overlay.querySelector(".invaders-quit");
    scoreEl = overlay.querySelector(".invaders-score");
    livesEl = overlay.querySelector(".invaders-lives");
    defEl = overlay.querySelector(".invaders-definition");
    centerEl = overlay.querySelector(".invaders-center");
    cardWrapEl = overlay.querySelector(".invaders-flashcard");
    cardTitleEl = overlay.querySelector(".invaders-flashcard-title");
    cardDescEl = overlay.querySelector(".invaders-flashcard-desc");
    cardJpEl = overlay.querySelector(".invaders-flashcard-jp");
    cardEnEl = overlay.querySelector(".invaders-flashcard-en");
    cardHintEl = overlay.querySelector(".invaders-flashcard-hint");
    cardFontControlsEl = overlay.querySelector(".card-font-controls");
    cardExNavEl = overlay.querySelector(".card-ex-nav");
    cardExCountEl = overlay.querySelector(".card-ex-count");
    cardExPrevBtn = overlay.querySelector(".card-ex-btn[data-dir=\"-1\"]");
    cardExNextBtn = overlay.querySelector(".card-ex-btn[data-dir=\"1\"]");
    cardFontMinusBtn = overlay.querySelector(".card-font-btn[data-delta=\"-1\"]");
    cardFontPlusBtn = overlay.querySelector(".card-font-btn[data-delta=\"1\"]");

    // Font size controls (shared setting with Cram/SRS)
    if (cardFontMinusBtn){
      cardFontMinusBtn.addEventListener("click",(ev)=>{
        ev.preventDefault();
        ev.stopPropagation();
        const s = getCardFontScale();
        setCardFontScale(s - 0.1);
        applyInvadersCardFontScale();
      });
    }
    if (cardFontPlusBtn){
      cardFontPlusBtn.addEventListener("click",(ev)=>{
        ev.preventDefault();
        ev.stopPropagation();
        const s = getCardFontScale();
        setCardFontScale(s + 0.1);
        applyInvadersCardFontScale();
      });
    }

    // Sentence navigation
    if (cardExPrevBtn){
      cardExPrevBtn.addEventListener("click",(ev)=>{
        ev.preventDefault();
        ev.stopPropagation();
        if (!invCardActive) return;
        setCardSentence(cardNoteIndex - 1);
      });
    }
    if (cardExNextBtn){
      cardExNextBtn.addEventListener("click",(ev)=>{
        ev.preventDefault();
        ev.stopPropagation();
        if (!invCardActive) return;
        setCardSentence(cardNoteIndex + 1);
      });
    }

    canvas = overlay.querySelector(".invaders-canvas");
    ctx = canvas.getContext("2d");

    quitBtn.addEventListener("click", ()=>stopGame());
    quitBtn.addEventListener("contextmenu", (ev)=>{ ev.preventDefault(); });
  }

  function showOverlay(){
    ensureOverlay();
    document.body.classList.add("invaders-mode");
    document.body.classList.toggle("asteroids-mode", mode === MODE.ASTEROIDS);
    backdrop.hidden = false;
    overlay.hidden = false;
  }

  function hideOverlay(){
    document.body.classList.remove("invaders-mode");
    document.body.classList.remove("asteroids-mode");
    if (backdrop) backdrop.hidden = true;
    if (overlay) overlay.hidden = true;
  }

  function setCenter(msg){
    if (!centerEl) return;
    centerEl.textContent = msg || "";
  }

  function setDefinition(text){
    if (!defEl) return;
    defEl.textContent = text || "";
  }

  function hideFlashcard(){
    invCardActive = false;
    cardGp = null;
    cardNotes = [];
    cardNoteIndex = 0;
    if (cardWrapEl) cardWrapEl.hidden = true;
  }

  function getCardFontScale(){
    const settings = window.App.Storage?.settings || {};
    const s = (typeof settings.cardFontScale === "number" && Number.isFinite(settings.cardFontScale)) ? settings.cardFontScale : 1;
    return Math.max(0.6, Math.min(1.6, s));
  }

  function setCardFontScale(next){
    const settings = window.App.Storage?.settings || {};
    const clamped = Math.max(0.6, Math.min(1.6, next));
    settings.cardFontScale = clamped;
    if (window.App.Storage && typeof window.App.Storage.saveSettings === "function"){
      window.App.Storage.saveSettings();
    }
    return clamped;
  }

  function applyInvadersCardFontScale(){
    const scale = getCardFontScale();
    // Match the feel of Cram/SRS sizing, but tuned for the mini-game overlay
    const baseJp = 1.15;
    const baseEn = 1.05;
    const baseTitle = 1.4;
    const baseDesc = 1.05;

    if (cardJpEl) cardJpEl.style.fontSize = (baseJp * scale) + "rem";
    if (cardEnEl) cardEnEl.style.fontSize = (baseEn * scale) + "rem";
    if (cardTitleEl) cardTitleEl.style.fontSize = (baseTitle * scale) + "rem";
    if (cardDescEl) cardDescEl.style.fontSize = (baseDesc * scale) + "rem";
  }

  function getFlashcardNotes(gp){
    const grammarKey = gp ? `${gp.level}_${gp.grammar}` : "";
    const notesApi = window.App?.Notes;
    const notes = (notesApi && typeof notesApi.getNotes === "function") ? (notesApi.getNotes(grammarKey) || []) : [];
    if (!Array.isArray(notes)) return [];
    return notes.map(n=>({
      jpHtml: String(n?.jpHtml || ""),
      enHtml: String(n?.enHtml || ""),
    }));
  }

  function setCardSentence(idx){
    const count = Array.isArray(cardNotes) ? cardNotes.length : 0;

    if (!count){
      if (cardJpEl) cardJpEl.innerHTML = "<div style=\"opacity:.92\">No JP sentence yet.</div>";
      if (cardEnEl) cardEnEl.innerHTML = "<div style=\"opacity:.85\">Add example sentences in Notes to show them here.</div>";
      if (cardExNavEl) cardExNavEl.hidden = true;
      return;
    }

    cardNoteIndex = ((idx % count) + count) % count;
    const n = cardNotes[cardNoteIndex] || {};

    if (cardJpEl) cardJpEl.innerHTML = n.jpHtml || "";
    if (cardEnEl) cardEnEl.innerHTML = n.enHtml || "";

    if (cardExNavEl){
      if (count > 1){
        cardExNavEl.hidden = false;
        if (cardExCountEl) cardExCountEl.textContent = `${cardNoteIndex + 1}/${count}`;
      } else {
        cardExNavEl.hidden = true;
      }
    }
  }

  function showFlashcard(gp){
    if (!gp) return;
    cardGp = gp;
    invCardActive = true;

    // hide the big prompt behind the card
    setDefinition("");
    setCenter("");

    // wipe the playfield behind the card to avoid confusion
    inv.enemies = [];
    inv.bullets = [];
    ast.rocks = [];
    ast.bullets = [];

    const CONST = window.App?.CONST;
    const col = CONST?.LEVEL_COLORS?.[gp.level] || "rgba(226,232,240,.95)";

    if (cardTitleEl){
      cardTitleEl.textContent = gp.grammar || "";
      cardTitleEl.style.color = col;
    }
    if (cardDescEl) cardDescEl.textContent = gp.meaning || "";

    cardNotes = getFlashcardNotes(gp);
    cardNoteIndex = cardNotes.length ? randInt(cardNotes.length) : 0;
    setCardSentence(cardNoteIndex);

    applyInvadersCardFontScale();

    if (cardHintEl) cardHintEl.textContent = "Press Space to continue";
    if (cardWrapEl) cardWrapEl.hidden = false;
  }

  function updateHud(){
    if (scoreEl) scoreEl.textContent = `Score: ${score}`;
    if (livesEl) livesEl.textContent = `Lives: ${lives}`;
  }

  function resizeCanvas(){
    if (!canvas || !ctx) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = window.innerWidth;
    const h = window.innerHeight;

    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Set defaults for each mode
    inv.ship.y = Math.max(120, h - 68);
    inv.ship.x = Math.min(Math.max(inv.ship.x || w/2, inv.ship.w/2 + 14), w - inv.ship.w/2 - 14);

    ast.ship.x = ast.ship.x || (w * 0.5);
    ast.ship.y = ast.ship.y || (h * 0.62);
  }

  // ------------------------
  // Mode picker
  // ------------------------
  function ensureModePicker(){
    if (!pickerBackdrop){
      pickerBackdrop = document.createElement("div");
      pickerBackdrop.className = "invaders-picker-backdrop";
      pickerBackdrop.hidden = true;
      document.body.appendChild(pickerBackdrop);
    }

    if (picker) return;

    picker = document.createElement("div");
    picker.className = "invaders-picker";
    picker.hidden = true;
    picker.innerHTML = `
      <div class="invaders-picker-card">
        <div class="invaders-picker-title">Asteroids or Invaders?</div>
        <div class="invaders-picker-sub" aria-live="polite"></div>
        <div class="invaders-picker-levels" aria-label="Select JLPT levels">
          <div class="invaders-picker-levels-label">Levels</div>
          <div class="invaders-picker-levels-row">
            <button type="button" class="level-filter-btn N5 invaders-pick-level" data-lvl="N5">N5</button>
            <button type="button" class="level-filter-btn N4 invaders-pick-level" data-lvl="N4">N4</button>
            <button type="button" class="level-filter-btn N3 invaders-pick-level" data-lvl="N3">N3</button>
            <button type="button" class="level-filter-btn N2 invaders-pick-level" data-lvl="N2">N2</button>
            <button type="button" class="level-filter-btn N1 invaders-pick-level" data-lvl="N1">N1</button>
          </div>
        </div>
        <div class="invaders-picker-btns">
          <button type="button" class="chip-btn invaders-pick invaders-pick-asteroids">Asteroids</button>
          <button type="button" class="chip-btn invaders-pick invaders-pick-invaders">Invaders</button>
        </div>
        <button type="button" class="chip-btn invaders-picker-cancel invaders-pick-cancel">Cancel</button>
      </div>
    `;

    document.body.appendChild(picker);

    const sub = picker.querySelector(".invaders-picker-sub");
    const btnA = picker.querySelector(".invaders-pick-asteroids");
    const btnI = picker.querySelector(".invaders-pick-invaders");
    const btnC = picker.querySelector(".invaders-pick-cancel");

    const lvlBtns = Array.from(picker.querySelectorAll(".invaders-pick-level"));

    function refreshPicker(){
      const sel = pendingLevels ? Array.from(pendingLevels) : [];
      lvlBtns.forEach(b=>{
        const lvl = b?.dataset?.lvl;
        b.classList.toggle("active", !!(lvl && pendingLevels && pendingLevels.has(lvl)));
      });
      const hasAny = sel.length > 0;
      btnA.disabled = !hasAny;
      btnI.disabled = !hasAny;
      const label = sel.length ? sel.join(", ") : "(none)";
      picker._setSub?.(`Levels: ${label}  •  (A = Asteroids, I = Invaders, Esc = cancel)`);
    }

    lvlBtns.forEach(b=>{
      b.addEventListener("click", ()=>{
        const lvl = b?.dataset?.lvl;
        if (!lvl) return;
        pendingLevels = pendingLevels || new Set();
        if (pendingLevels.has(lvl)) pendingLevels.delete(lvl);
        else pendingLevels.add(lvl);
        refreshPicker();
      });
    });

    btnA.addEventListener("click", ()=>{
      const lvls = pendingLevels ? Array.from(pendingLevels) : [];
      if (!lvls.length) return;
      hideModePicker();
      startGame(lvls, MODE.ASTEROIDS);
    });
    btnI.addEventListener("click", ()=>{
      const lvls = pendingLevels ? Array.from(pendingLevels) : [];
      if (!lvls.length) return;
      hideModePicker();
      startGame(lvls, MODE.INVADERS);
    });
    btnC.addEventListener("click", ()=>{ hideModePicker(); });

    picker.addEventListener("pointerdown", (ev)=>{
      // click outside card closes
      if (ev.target === picker) hideModePicker();
    });

    // keyboard shortcuts while picker is open
    document.addEventListener("keydown", (ev)=>{
      if (!picker || picker.hidden) return;
      if (ev.key === "Escape") { ev.preventDefault(); hideModePicker(); return; }
      if (ev.key === "a" || ev.key === "A") {
        ev.preventDefault();
        const lvls = pendingLevels ? Array.from(pendingLevels) : [];
        if (!lvls.length) return;
        hideModePicker();
        startGame(lvls, MODE.ASTEROIDS);
        return;
      }
      if (ev.key === "i" || ev.key === "I") {
        ev.preventDefault();
        const lvls = pendingLevels ? Array.from(pendingLevels) : [];
        if (!lvls.length) return;
        hideModePicker();
        startGame(lvls, MODE.INVADERS);
        return;
      }
    }, true);

    picker._setSub = (txt)=>{ if (sub) sub.textContent = txt || ""; };
    picker._refresh = refreshPicker;
  }

  function showModePicker(lvl){
    ensureModePicker();
    pendingLevel = lvl;
    pendingLevels = new Set([lvl]);
    pickerBackdrop.hidden = false;
    picker.hidden = false;
    picker._refresh?.();
  }

  function hideModePicker(){
    pendingLevel = null;
    pendingLevels = null;
    if (pickerBackdrop) pickerBackdrop.hidden = true;
    if (picker) picker.hidden = true;
  }

  // ------------------------
  // Shared helpers
  // ------------------------
  function randInt(n){ return Math.floor(Math.random() * n); }

  function shuffle(arr){
    for (let i=arr.length-1;i>0;i--){
      const j = randInt(i+1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function clipText(text, maxChars){
    const t = String(text || "");
    if (t.length <= maxChars) return t;
    return t.slice(0, Math.max(0, maxChars-1)) + "…";
  }

  function roundedRect(x, y, w, h, r){
    const rr = Math.max(2, Math.min(r, Math.min(w,h)/2));
    ctx.beginPath();
    ctx.moveTo(x+rr, y);
    ctx.arcTo(x+w, y, x+w, y+h, rr);
    ctx.arcTo(x+w, y+h, x, y+h, rr);
    ctx.arcTo(x, y+h, x, y, rr);
    ctx.arcTo(x, y, x+w, y, rr);
    ctx.closePath();
  }

  function pickRoundItems(){
    if (!pool.length) return { correct:null, items:[] };

    const c = pool[randInt(pool.length)];
    const want = Math.min(6, pool.length);
    const picked = [c];
    const used = new Set([c.index]);

    while (picked.length < want){
      const it = pool[randInt(pool.length)];
      const k = it.index;
      if (used.has(k)) continue;
      used.add(k);
      picked.push(it);
    }

    return { correct:c, items: shuffle(picked) };
  }

  function scheduleNextRound(seconds, msg){
    roundCooldown = Math.max(0, seconds || 0);
    if (msg) setCenter(msg);
  }

  function loseLife(reason){
    lives = Math.max(0, lives - 1);
    updateHud();

    if (lives <= 0){
      gameOver = true;
      setCenter("GAME OVER  •  Press R to restart, or QUIT");
      setDefinition("");
      return;
    }

    const msg = (reason === "wrong") ? "Wrong!" : (reason === "hit") ? "Ouch!" : "Missed!";
    scheduleNextRound(0.45, `${msg}  •  Lives: ${lives}`);
  }

  function winPoint(){
    score += 1;
    updateHud();
    // Pause and show the same grammar card used in Invaders
    showFlashcard(correct);
  }

  // ------------------------
  // Invaders mode
  // ------------------------
  function invadersFire(){
    const now = Date.now();
    if (now - inv.lastShotAt < inv.shotCooldownMs) return;
    inv.lastShotAt = now;
    inv.bullets.push({ x: inv.ship.x, y: inv.ship.y - inv.ship.h/2 - 6, vy: -720 });
  }

  function startRoundInvaders(){
    hideFlashcard();
    const w = window.innerWidth;
    const r = pickRoundItems();
    correct = r.correct;
    const items = r.items;

    setDefinition(correct?.meaning || "");

    const paddingX = 22;
    const topSpawn = -120;
    const gap = 10;

    const cols = Math.max(4, Math.min(6, items.length || 4));
    const colW = (w - paddingX*2 - gap*(cols-1)) / cols;
    const colIdxs = shuffle(Array.from({length:cols},(_,i)=>i));

    inv.enemies = (items.length ? items : []).slice(0, cols).map((it, i)=>{
      const col = colIdxs[i % colIdxs.length];
      const x = paddingX + col*(colW + gap) + colW/2;
      const y = topSpawn - randInt(240);
      const vy = 52 + Math.random()*38 + (score * 0.7);
      return {
        item: it,
        x, y,
        vy,
        w: Math.min(260, Math.max(120, colW)),
        h: 34
      };
    });

    inv.bullets = [];
    scheduleNextRound(0, "\u2190 / \u2192 move  •  Space shoot");
  }

  function updateInvaders(dt, w, h){
    if (invCardActive) return;

    // during cooldown, freeze motion but keep drawing
    if (roundCooldown > 0){
      roundCooldown = Math.max(0, roundCooldown - dt);
      if (roundCooldown === 0 && !gameOver) startRoundInvaders();
      return;
    }

    if (inv.keys.left) inv.ship.x -= inv.ship.speed * dt;
    if (inv.keys.right) inv.ship.x += inv.ship.speed * dt;
    inv.ship.x = Math.min(Math.max(inv.ship.x, inv.ship.w/2 + 14), w - inv.ship.w/2 - 14);

    inv.enemies.forEach(e=>{ e.y += e.vy * dt; });

    inv.bullets.forEach(b=>{ b.y += b.vy * dt; });
    inv.bullets = inv.bullets.filter(b=>b.y > -50);

    // Ground rule: only fail if the *correct* answer hits the ground.
    const groundY = h - 12;
    for (let ei=inv.enemies.length-1; ei>=0; ei--){
      const e = inv.enemies[ei];
      if ((e.y + e.h/2) >= groundY){
        const isCorrect = (e.item && correct) ? (e.item.index === correct.index) : false;
        if (isCorrect){
          loseLife("miss");
          return;
        }
        // wrong answer reached the ground: remove it (no penalty)
        inv.enemies.splice(ei, 1);
      }
    }

    // Bullet collisions
    for (let bi=inv.bullets.length-1; bi>=0; bi--){
      const b = inv.bullets[bi];
      for (let ei=inv.enemies.length-1; ei>=0; ei--){
        const e = inv.enemies[ei];
        const halfW = e.w/2;
        const halfH = e.h/2;
        if (
          b.x >= e.x - halfW && b.x <= e.x + halfW &&
          b.y >= e.y - halfH && b.y <= e.y + halfH
        ){
          inv.bullets.splice(bi, 1);
          const isCorrect = (e.item && correct) ? (e.item.index === correct.index) : false;
          if (isCorrect){
            score += 1;
            updateHud();
            setCenter("Correct! +1");
            showFlashcard(correct);
          } else {
            loseLife("wrong");
          }
          return;
        }
      }
    }
  }

  function drawInvaders(w, h){
    if (!ctx) return;
    ctx.clearRect(0,0,w,h);

    // Subtle grid
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    const step = 48;
    for (let x=0;x<=w;x+=step){ ctx.moveTo(x,0); ctx.lineTo(x,h); }
    for (let y=0;y<=h;y+=step){ ctx.moveTo(0,y); ctx.lineTo(w,y); }
    ctx.strokeStyle = "rgba(148,163,184,.10)";
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Ship
    const shipX = inv.ship.x - inv.ship.w/2;
    const shipY = inv.ship.y - inv.ship.h/2;
    roundedRect(shipX, shipY, inv.ship.w, inv.ship.h, 8);
    ctx.fillStyle = "rgba(56,189,248,.20)";
    ctx.fill();
    ctx.strokeStyle = "rgba(56,189,248,.85)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Cannon
    roundedRect(inv.ship.x - 7, shipY - 10, 14, 12, 5);
    ctx.fillStyle = "rgba(56,189,248,.22)";
    ctx.fill();
    ctx.strokeStyle = "rgba(56,189,248,.75)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Bullets
    inv.bullets.forEach(b=>{
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3.2, 0, Math.PI*2);
      ctx.fillStyle = "rgba(226,232,240,.95)";
      ctx.fill();
    });

    // Enemies
    ctx.font = "700 16px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    inv.enemies.forEach(e=>{
      const x = e.x - e.w/2;
      const y = e.y - e.h/2;

      roundedRect(x, y, e.w, e.h, 12);
      ctx.fillStyle = "rgba(2,6,23,.55)";
      ctx.fill();
      ctx.strokeStyle = "rgba(148,163,184,.28)";
      ctx.lineWidth = 1;
      ctx.stroke();

      const txt = clipText(e.item?.grammar || "", 22);
      ctx.fillStyle = "rgba(226,232,240,.95)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(txt, e.x, e.y);
    });

    // Game over overlay
    if (gameOver){
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = "rgba(2,6,23,.85)";
      ctx.fillRect(0,0,w,h);
      ctx.globalAlpha = 1;

      ctx.font = "1000 44px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillStyle = "rgba(226,232,240,.95)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("GAME OVER", w/2, h/2 - 20);

      ctx.font = "700 16px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillStyle = "rgba(148,163,184,.95)";
      ctx.fillText("Press R to restart • or QUIT", w/2, h/2 + 22);
    }
  }

  // ------------------------
  // Asteroids mode
  // ------------------------
  function wrapPos(o, w, h){
    if (o.x < 0) o.x += w;
    if (o.x > w) o.x -= w;
    if (o.y < 0) o.y += h;
    if (o.y > h) o.y -= h;
  }

  function asteroidsFire(){
    const now = Date.now();
    if (now - ast.lastShotAt < ast.shotCooldownMs) return;
    ast.lastShotAt = now;
    const spd = 760;
    const vx = Math.cos(ast.ship.ang) * spd + ast.ship.vx;
    const vy = Math.sin(ast.ship.ang) * spd + ast.ship.vy;
    ast.bullets.push({ x: ast.ship.x, y: ast.ship.y, vx, vy, ttl: 1.25 });
  }

  function startRoundAsteroids(){
    const w = window.innerWidth;
    const h = window.innerHeight;

    const r = pickRoundItems();
    correct = r.correct;
    const items = r.items;

    setDefinition(correct?.meaning || "");
    scheduleNextRound(0, "Rotate: \u2190/\u2192  •  Thrust: \u2191  •  Space shoot");

    // reset ship near lower-middle so the definition stays readable
    ast.ship.x = w * 0.5;
    ast.ship.y = h * 0.68;
    ast.ship.vx = 0;
    ast.ship.vy = 0;
    ast.ship.ang = -Math.PI/2;

    ast.bullets = [];

    // build rocks
    const want = Math.max(4, Math.min(6, items.length || 4));
    const picked = (items.length ? items : []).slice(0, want);

    ast.rocks = picked.map((it, i)=>{
      // place around the upper half, away from ship
      let x = (Math.random() * w);
      let y = (Math.random() * (h * 0.45));
      const vx = (Math.random() * 180 - 90);
      const vy = (Math.random() * 180 - 40);
      const r = 34 + Math.random()*14;
      // Avoid immediate overlap with ship
      if (Math.hypot(x - ast.ship.x, y - ast.ship.y) < 120){
        x = (x + w*0.25) % w;
        y = (y + h*0.25) % h;
      }
      return { item: it, x, y, vx, vy, r };
    });
  }

  function updateAsteroids(dt, w, h){
    if (invCardActive) return;

    if (roundCooldown > 0){
      roundCooldown = Math.max(0, roundCooldown - dt);
      if (roundCooldown === 0 && !gameOver) startRoundAsteroids();
      return;
    }

    // ship rotation
    const rot = 3.6; // rad/s
    if (ast.keys.left) ast.ship.ang -= rot * dt;
    if (ast.keys.right) ast.ship.ang += rot * dt;

    // thrust
    if (ast.keys.thrust){
      const acc = 520;
      ast.ship.vx += Math.cos(ast.ship.ang) * acc * dt;
      ast.ship.vy += Math.sin(ast.ship.ang) * acc * dt;
    }

    // light damping
    ast.ship.vx *= Math.pow(0.985, dt * 60);
    ast.ship.vy *= Math.pow(0.985, dt * 60);

    // integrate
    ast.ship.x += ast.ship.vx * dt;
    ast.ship.y += ast.ship.vy * dt;
    wrapPos(ast.ship, w, h);

    // rocks
    ast.rocks.forEach(r=>{
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      wrapPos(r, w, h);
    });

    // bullets
    ast.bullets.forEach(b=>{
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.ttl -= dt;
      wrapPos(b, w, h);
    });
    ast.bullets = ast.bullets.filter(b=>b.ttl > 0);

    // ship collision
    for (const r of ast.rocks){
      const d = Math.hypot(r.x - ast.ship.x, r.y - ast.ship.y);
      if (d <= (r.r + ast.ship.r)){
        loseLife("hit");
        return;
      }
    }

    // bullet collision
    for (let bi=ast.bullets.length-1; bi>=0; bi--){
      const b = ast.bullets[bi];
      for (let ri=ast.rocks.length-1; ri>=0; ri--){
        const r = ast.rocks[ri];
        const d = Math.hypot(r.x - b.x, r.y - b.y);
        if (d <= r.r){
          ast.bullets.splice(bi, 1);
          const isCorrect = (r.item && correct) ? (r.item.index === correct.index) : false;
          if (isCorrect) winPoint();
          else loseLife("wrong");
          return;
        }
      }
    }

    // if somehow no rocks (tiny pool), just respawn
    if (!ast.rocks.length && !gameOver){
      startRoundAsteroids();
    }
  }

  function drawAsteroids(w, h){
    if (!ctx) return;
    ctx.clearRect(0,0,w,h);

    // faint starfield dots
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "rgba(226,232,240,.55)";
    for (let i=0;i<70;i++){
      const x = (i * 173) % w;
      const y = (i * 97) % h;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.globalAlpha = 1;

    // rocks
    ctx.font = "800 16px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ast.rocks.forEach(r=>{
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI*2);
      ctx.fillStyle = "rgba(2,6,23,.45)";
      ctx.fill();
      ctx.strokeStyle = "rgba(148,163,184,.30)";
      ctx.lineWidth = 2;
      ctx.stroke();

      const txt = clipText(r.item?.grammar || "", 18);
      ctx.fillStyle = "rgba(226,232,240,.95)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(txt, r.x, r.y);
    });

    // bullets
    ast.bullets.forEach(b=>{
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.8, 0, Math.PI*2);
      ctx.fillStyle = "rgba(226,232,240,.95)";
      ctx.fill();
    });

    // ship (triangle)
    const sx = ast.ship.x;
    const sy = ast.ship.y;
    const a = ast.ship.ang;

    const p1 = { x: sx + Math.cos(a) * 18, y: sy + Math.sin(a) * 18 };
    const p2 = { x: sx + Math.cos(a + 2.55) * 14, y: sy + Math.sin(a + 2.55) * 14 };
    const p3 = { x: sx + Math.cos(a - 2.55) * 14, y: sy + Math.sin(a - 2.55) * 14 };

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.closePath();

    ctx.fillStyle = "rgba(56,189,248,.14)";
    ctx.fill();
    ctx.strokeStyle = "rgba(56,189,248,.85)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // game over overlay
    if (gameOver){
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = "rgba(2,6,23,.85)";
      ctx.fillRect(0,0,w,h);
      ctx.globalAlpha = 1;

      ctx.font = "1000 44px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillStyle = "rgba(226,232,240,.95)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("GAME OVER", w/2, h/2 - 20);

      ctx.font = "700 16px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillStyle = "rgba(148,163,184,.95)";
      ctx.fillText("Press R to restart • or QUIT", w/2, h/2 + 22);
    }
  }

  // ------------------------
  // Main loop
  // ------------------------
  function loop(t){
    if (!active) return;

    try{
      if (!lastT) lastT = t;
      let dt = (t - lastT) / 1000;
      lastT = t;
      if (!isFinite(dt) || dt <= 0) dt = 0.016;
      dt = Math.min(0.04, dt);

      const w = window.innerWidth;
      const h = window.innerHeight;

      if (!gameOver){
        if (mode === MODE.INVADERS) updateInvaders(dt, w, h);
        else if (mode === MODE.ASTEROIDS) updateAsteroids(dt, w, h);
      }

      // draw even when paused / game over
      if (mode === MODE.INVADERS) drawInvaders(w, h);
      else if (mode === MODE.ASTEROIDS) drawAsteroids(w, h);

    } catch (err){
      console.error("Mini-game error:", err);
      gameOver = true;
      setCenter("Something went wrong • Press R to restart, or QUIT");
    }

    rafId = requestAnimationFrame(loop);
  }

  // ------------------------
  // Controls
  // ------------------------
  function clearKeyStates(){
    inv.keys.left = false;
    inv.keys.right = false;
    ast.keys.left = false;
    ast.keys.right = false;
    ast.keys.thrust = false;
  }

  function onKeyDown(ev){
    if (!active) return;

    const k = ev.key;
    if (k === "Escape"){
      stopGame();
      ev.preventDefault();
      return;
    }

    if (k === "r" || k === "R"){
      if (gameOver) restartGame();
      ev.preventDefault();
      return;
    }

    if (mode === MODE.INVADERS){
      if (invCardActive){
        if (k === " " || k === "Spacebar"){
          hideFlashcard();
          if (!gameOver){
            // immediate next round on continue
            roundCooldown = 0;
            startRoundInvaders();
          }
          ev.preventDefault();
        }
        return;
      }
      if (k === "ArrowLeft" || k === "a" || k === "A"){
        inv.keys.left = true;
        ev.preventDefault();
      } else if (k === "ArrowRight" || k === "d" || k === "D"){
        inv.keys.right = true;
        ev.preventDefault();
      } else if (k === " " || k === "Spacebar"){
        if (!gameOver) invadersFire();
        ev.preventDefault();
      }
      return;
    }

    if (mode === MODE.ASTEROIDS){
      if (invCardActive){
        if (k === " " || k === "Spacebar"){
          hideFlashcard();
          if (!gameOver){
            // immediate next round on continue
            roundCooldown = 0;
            startRoundAsteroids();
          }
          ev.preventDefault();
        }
        return;
      }

      if (k === "ArrowLeft" || k === "a" || k === "A"){
        ast.keys.left = true;
        ev.preventDefault();
      } else if (k === "ArrowRight" || k === "d" || k === "D"){
        ast.keys.right = true;
        ev.preventDefault();
      } else if (k === "ArrowUp" || k === "w" || k === "W"){
        ast.keys.thrust = true;
        ev.preventDefault();
      } else if (k === " " || k === "Spacebar"){
        if (!gameOver) asteroidsFire();
        ev.preventDefault();
      }
    }
  }

  function onKeyUp(ev){
    if (!active) return;
    const k = ev.key;

    if (mode === MODE.INVADERS){
      if (k === "ArrowLeft" || k === "a" || k === "A") inv.keys.left = false;
      else if (k === "ArrowRight" || k === "d" || k === "D") inv.keys.right = false;
      return;
    }

    if (mode === MODE.ASTEROIDS){
      if (k === "ArrowLeft" || k === "a" || k === "A") ast.keys.left = false;
      else if (k === "ArrowRight" || k === "d" || k === "D") ast.keys.right = false;
      else if (k === "ArrowUp" || k === "w" || k === "W") ast.keys.thrust = false;
    }
  }

  // ------------------------
  // Lifecycle
  // ------------------------
  function restartGame(){
    score = 0;
    lives = 5;
    gameOver = false;
    roundCooldown = 0;
    hideFlashcard();
    updateHud();

    if (mode === MODE.INVADERS){
      inv.ship.x = window.innerWidth / 2;
      inv.ship.y = Math.max(120, window.innerHeight - 68);
      inv.bullets = [];
      inv.enemies = [];
      startRoundInvaders();
    } else {
      ast.bullets = [];
      ast.rocks = [];
      startRoundAsteroids();
    }
  }

  function startGame(lvlOrLvls, chosenMode){
    const byLevel = window.App?.State?.byLevel;
    const lvls = Array.isArray(lvlOrLvls) ? lvlOrLvls.filter(Boolean) : [lvlOrLvls].filter(Boolean);
    const uniqueLvls = Array.from(new Set(lvls.map(x=>String(x).toUpperCase()).filter(x=>/^N[1-5]$/.test(x))));
    const list = byLevel ? uniqueLvls.flatMap(lvl => (byLevel[lvl] || [])) : [];
    if (!list.length) return;

    // in case a picker is open
    hideModePicker();

    levelsSelected = uniqueLvls;
    level = uniqueLvls.join(",");
    pool = list;
    mode = chosenMode || MODE.INVADERS;

    active = true;
    gameOver = false;
    score = 0;
    lives = 5;
    roundCooldown = 0;
    hideFlashcard();

    clearKeyStates();

    showOverlay();
    resizeCanvas();

    inv.ship.x = window.innerWidth / 2;
    updateHud();

    const lvlLabel = uniqueLvls.length ? uniqueLvls.join("+") : "";
    if (mode === MODE.INVADERS){
      setCenter(`${lvlLabel} INVADERS  •  Match the description`);
      setDefinition("Loading…");
      startRoundInvaders();
    } else {
      setCenter(`${lvlLabel} ASTEROIDS  •  Shoot the matching grammar`);
      setDefinition("Loading…");
      startRoundAsteroids();
    }

    window.addEventListener("keydown", onKeyDown, { passive:false });
    window.addEventListener("keyup", onKeyUp, { passive:true });

    resizeHandler = ()=>resizeCanvas();
    window.addEventListener("resize", resizeHandler);

    blurHandler = ()=>{ clearKeyStates(); };
    window.addEventListener("blur", blurHandler);

    lastT = 0;
    rafId = requestAnimationFrame(loop);
  }

  function stopGame(){
    if (!active) return;

    active = false;
    gameOver = false;
    roundCooldown = 0;

    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;

    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);

    if (resizeHandler){
      window.removeEventListener("resize", resizeHandler);
      resizeHandler = null;
    }

    if (blurHandler){
      window.removeEventListener("blur", blurHandler);
      blurHandler = null;
    }

    clearKeyStates();

    hideFlashcard();

    inv.enemies = [];
    inv.bullets = [];
    ast.rocks = [];
    ast.bullets = [];
    correct = null;

    setCenter("");
    setDefinition("");

    hideOverlay();
  }

  Invaders.init = () => {
    if (inited) return;
    inited = true;
    attachTriggers();
  };

  window.App.Invaders = Invaders;
})();

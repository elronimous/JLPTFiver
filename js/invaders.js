(function(){
  window.App = window.App || {};
  const { Utils } = window.App;

  const Invaders = {};

  const HOLD_MS = 5000;
  const MODE = { INVADERS: "invaders", ASTEROIDS: "asteroids", MISSILE: "missile" };

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
  // Current question (sentence prompt + answer + options)
  let currentQ = null;
  let correctGp = null;
  let correctAnswer = "";
  let score = 0;
  let lives = 5;

  function hiKey(){
    return mode === MODE.ASTEROIDS ? "asteroidsHiScore" : "invadersHiScore";
  }

  function getHiScore(){
    const st = window.App && window.App.Storage;
    const v = st && st.ui ? st.ui[hiKey()] : 0;
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }

  function setHiScore(v){
    const st = window.App && window.App.Storage;
    if (!st || !st.ui) return;
    const n = Number(v);
    st.ui[hiKey()] = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    if (typeof st.saveUi === "function") st.saveUi();
  }

  // pause state (flashcard overlay is showing)
  let invCardActive = false;

  let rafId = 0;
  let lastT = 0;
  let resizeHandler = null;
  let blurHandler = null;

  // round pacing (avoids setTimeout freezes)
  let roundCooldown = 0;

  // per-round count-in (freeze motion while showing 3..2..1)
  let countIn = 0;
  let lastCountInShown = null;

  // cache usable sentence examples per grammar point
  const exampleCache = new Map();

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
  // Missile Command (purely fun)
  // ------------------------
  const mc = {
    wave: 1,
    groundY: 0,
    cities: [],   // {x, y, w, h, alive}
    bases: [],    // {x, y}
    incoming: [], // {sx, sy, tx, ty, x, y, vx, vy, speed, alive}
    shots: [],    // {sx, sy, tx, ty, x, y, vx, vy, speed, alive}
    explosions: [], // {x, y, r, vr, maxR, ttl}
    spawnTimer: 0,
    pointer: { x: 0, y: 0, has: false },
    keys: { left:false, right:false, up:false, down:false },
    crosshair: { x: 0, y: 0, speed: 520 },
    citiesAlive: 0,
    citiesTotal: 0,
    fireLockMs: 0,
  };

  function mcInitLayout(w, h){
    mc.groundY = Math.max(220, h - 86);
    const cityY = mc.groundY - 18;
    const baseY = mc.groundY + 12;

    const cityCount = 6;
    const padding = Math.max(40, Math.min(90, w * 0.06));
    const span = Math.max(1, w - padding * 2);
    const step = span / (cityCount - 1);

    mc.cities = [];
    for (let i=0;i<cityCount;i++){
      const cx = padding + step * i;
      mc.cities.push({ x: cx, y: cityY, w: 26, h: 16, alive: true });
    }

    mc.bases = [
      { x: Math.max(55, w * 0.14), y: baseY },
      { x: w * 0.50, y: baseY },
      { x: Math.min(w - 55, w * 0.86), y: baseY },
    ];

    mc.citiesTotal = mc.cities.length;
    mc.citiesAlive = mc.cities.filter(c=>c.alive).length;

    // crosshair starts mid-screen
    mc.crosshair.x = w * 0.5;
    mc.crosshair.y = Math.min(h * 0.45, mc.groundY - 90);
    mc.pointer.has = false;
  }

  function startMissileCommand(){
    const w = window.innerWidth;
    const h = window.innerHeight;

    mc.wave = 1;
    mc.spawnTimer = 0;
    mc.incoming = [];
    mc.shots = [];
    mc.explosions = [];
    mc.fireLockMs = 0;

    mcInitLayout(w, h);
    mcUpdateCityHud();

    setCenter("MISSILE COMMAND");
    setDefinitionHtml(`<div class="mini-q-en" style="opacity:.9">Click/tap to fire interceptors • Protect the cities</div>`);
  }

  function mcUpdateCityHud(){
    mc.citiesAlive = mc.cities.filter(c=>c.alive).length;
    mc.citiesTotal = mc.cities.length;
    updateHud();
  }

  function mcChooseTarget(){
    const alive = mc.cities.filter(c=>c.alive);
    if (alive.length){
      const c = alive[Math.floor(Math.random()*alive.length)];
      return { x: c.x, y: c.y };
    }
    // fallback: random ground
    return { x: Math.random()*window.innerWidth, y: mc.groundY - 10 };
  }

  function mcSpawnIncoming(w, h){
    const srcX = Math.random()*w;
    const srcY = -10;
    const t = mcChooseTarget();
    const dx = t.x - srcX;
    const dy = t.y - srcY;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const speed = 90 + mc.wave * 12; // px/s
    const vx = (dx/dist) * speed;
    const vy = (dy/dist) * speed;
    mc.incoming.push({ sx:srcX, sy:srcY, tx:t.x, ty:t.y, x:srcX, y:srcY, vx, vy, speed, alive:true });
  }

  function mcPickBaseFor(x){
    // choose closest base by x
    let best = mc.bases[0], bestD = Math.abs(mc.bases[0].x - x);
    for (let i=1;i<mc.bases.length;i++){
      const d = Math.abs(mc.bases[i].x - x);
      if (d < bestD){ best = mc.bases[i]; bestD = d; }
    }
    return best;
  }

  function mcFireAt(x, y){
    const now = Date.now();
    if (mc.fireLockMs && now < mc.fireLockMs) return;
    mc.fireLockMs = now + 80; // mild rate limit

    const w = window.innerWidth;
    const h = window.innerHeight;
    const tx = Math.max(0, Math.min(w, x));
    const ty = Math.max(0, Math.min(mc.groundY - 20, y));

    const base = mcPickBaseFor(tx);
    const sx = base.x;
    const sy = base.y;

    const dx = tx - sx;
    const dy = ty - sy;
    const dist = Math.max(1, Math.hypot(dx, dy));
    // Missile-feel: starts slower, accelerates, has a slight wobble, and leaves smoke.
    // Travel time scales gently with distance so long shots still feel snappy.
    const travel = Math.max(0.22, Math.min(0.62, dist / 1050));
    const wobAmp = 3 + Math.random()*5;
    const wobFreq = 5 + Math.random()*5;
    const wobPhase = Math.random() * Math.PI * 2;
    mc.shots.push({
      sx, sy, tx, ty,
      dx, dy, dist,
      t: 0, travel,
      wobAmp, wobFreq, wobPhase,
      x: sx, y: sy,
      px: sx, py: sy,
      trail: [],
      alive: true,
    });
  }

  function mcExplode(x, y, maxR){
    mc.explosions.push({ x, y, r: 2, vr: 360, maxR: maxR || 58, ttl: 0.55 });
  }

  function mcUpdate(w, h, dt){
    // dt seconds
    mc.groundY = Math.max(220, h - 86);

    // crosshair follows pointer if present
    if (mc.pointer.has){
      mc.crosshair.x = mc.pointer.x;
      mc.crosshair.y = mc.pointer.y;
    } else {
      const sp = mc.crosshair.speed * dt;
      if (mc.keys.left) mc.crosshair.x -= sp;
      if (mc.keys.right) mc.crosshair.x += sp;
      if (mc.keys.up) mc.crosshair.y -= sp;
      if (mc.keys.down) mc.crosshair.y += sp;
      mc.crosshair.x = Math.max(0, Math.min(w, mc.crosshair.x));
      mc.crosshair.y = Math.max(0, Math.min(mc.groundY - 20, mc.crosshair.y));
    }

    // spawn
    const baseRate = Math.max(0.35, 1.25 - mc.wave * 0.08); // seconds per missile
    mc.spawnTimer -= dt;
    while (mc.spawnTimer <= 0){
      mc.spawnTimer += baseRate;
      mcSpawnIncoming(w, h);
      if (mc.incoming.length > 14 + mc.wave * 2) break;
    }

    // move incoming
    mc.incoming.forEach(m=>{
      if (!m.alive) return;
      m.x += m.vx * dt;
      m.y += m.vy * dt;

      // hit ground / city
      const reached = ( (m.vx >= 0 && m.x >= m.tx) || (m.vx < 0 && m.x <= m.tx) ) &&
                      ( (m.vy >= 0 && m.y >= m.ty) || (m.vy < 0 && m.y <= m.ty) );
      if (reached){
        m.alive = false;
        mcExplode(m.tx, m.ty, 66);

        // damage cities within radius
        const r = 34;
        mc.cities.forEach(c=>{
          if (!c.alive) return;
          const d = Math.hypot(c.x - m.tx, c.y - m.ty);
          if (d <= r) c.alive = false;
        });
        mcUpdateCityHud();
        if (mc.citiesAlive <= 0){
          gameOver = true;
          setCenter("GAME OVER");
        }
      }
    });

    // move shots (accelerate + wobble)
    mc.shots.forEach(s=>{
      if (!s.alive) return;

      s.px = s.x; s.py = s.y;

      // progress 0..1
      s.t += (dt / Math.max(0.12, s.travel || 0.3));
      const u = Math.max(0, Math.min(1, s.t));

      // acceleration curve (starts slower, speeds up)
      const ease = u * u;

      // wobble perpendicular to the path; taper to zero at the target so it lands clean
      const nx = (-s.dy / s.dist);
      const ny = ( s.dx / s.dist);
      const wob = Math.sin(u * s.wobFreq * Math.PI * 2 + s.wobPhase) * s.wobAmp * (1 - u);

      const x = s.sx + s.dx * ease + nx * wob;
      const y = s.sy + s.dy * ease + ny * wob;

      s.x = x; s.y = y;

      // smoke trail
      s.trail.push({ x, y, life: 0.34, max: 0.34, r: 5 + Math.random()*3 });
      if (s.trail.length > 24) s.trail.shift();
      for (let i=0;i<s.trail.length;i++) s.trail[i].life -= dt;
      s.trail = s.trail.filter(p=>p.life > 0);

      if (u >= 1){
        s.alive = false;
        mcExplode(s.tx, s.ty, 62);
      }
    });

    // explosions
    mc.explosions.forEach(ex=>{
      if (ex.ttl <= 0) return;
      ex.ttl -= dt;
      ex.r += ex.vr * dt;
      if (ex.r > ex.maxR) ex.r = ex.maxR;
    });
    // remove expired explosions
    mc.explosions = mc.explosions.filter(ex=>ex.ttl > 0);

    // collision: incoming within explosions
    const killed = [];
    for (const ex of mc.explosions){
      const r = ex.r;
      for (const m of mc.incoming){
        if (!m.alive) continue;
        const d = Math.hypot(m.x - ex.x, m.y - ex.y);
        if (d <= r){
          m.alive = false;
          score += 10;
          killed.push({ x: m.x, y: m.y });
        }
      }
    }
    // When an incoming missile is hit, give it its own expanding blast (classic chain-reaction feel)
    for (const k of killed) mcExplode(k.x, k.y, 54);
    // clear dead missiles
    mc.incoming = mc.incoming.filter(m=>m.alive);
    mc.shots = mc.shots.filter(s=>s.alive);

    // wave progression
    if (!gameOver && mc.incoming.length === 0){
      // if enough time passed since start, avoid instant multi-waves
      mc.wave += 1;
      setCenter(`WAVE ${mc.wave}`);
      // small grace to display message (re-using roundCooldown in main logic)
      roundCooldown = Math.max(roundCooldown, 0.6);
    }

    updateHud();
  }

  function mcDraw(w, h){
    if (!ctx) return;

    ctx.clearRect(0,0,w,h);

    // sky
    ctx.fillStyle = "rgba(2,6,23,.92)";
    ctx.fillRect(0,0,w,h);

    // ground
    ctx.strokeStyle = "rgba(148,163,184,.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, mc.groundY);
    ctx.lineTo(w, mc.groundY);
    ctx.stroke();

    // cities
    mc.cities.forEach(c=>{
      if (!c.alive) return;
      ctx.fillStyle = "rgba(56,189,248,.9)";
      ctx.fillRect(c.x - c.w/2, c.y - c.h, c.w, c.h);
      ctx.fillStyle = "rgba(226,232,240,.85)";
      ctx.fillRect(c.x - c.w/2 + 4, c.y - c.h + 4, 3, 3);
    });

    // bases
    mc.bases.forEach(b=>{
      ctx.fillStyle = "rgba(16,185,129,.9)";
      ctx.beginPath();
      ctx.arc(b.x, b.y, 8, 0, Math.PI*2);
      ctx.fill();
    });

    // incoming missiles
    ctx.strokeStyle = "rgba(244,114,182,.92)";
    ctx.lineWidth = 2;
    mc.incoming.forEach(m=>{
      if (!m.alive) return;
      ctx.beginPath();
      ctx.moveTo(m.sx, m.sy);
      ctx.lineTo(m.x, m.y);
      ctx.stroke();
      // head
      ctx.fillStyle = "rgba(253,230,138,.9)";
      ctx.beginPath();
      ctx.arc(m.x, m.y, 2.6, 0, Math.PI*2);
      ctx.fill();
    });

    // player shots (missile-looking with wobble + smoke)
    mc.shots.forEach(s=>{
      // smoke trail
      if (s.trail && s.trail.length){
        for (const p of s.trail){
          const a = Math.max(0, Math.min(1, (p.life || 0) / (p.max || 0.34)));
          ctx.fillStyle = `rgba(148,163,184,${0.18 * a})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, (p.r || 6) * (0.6 + 0.8*(1-a)), 0, Math.PI*2);
          ctx.fill();
        }
      }

      // missile body/head
      const dx = (s.x - (s.px ?? s.sx));
      const dy = (s.y - (s.py ?? s.sy));
      const ang = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(ang);

      // faint contrail line behind the head
      ctx.strokeStyle = "rgba(34,211,238,.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.lineTo(-4, 0);
      ctx.stroke();

      // missile head
      ctx.fillStyle = "rgba(226,232,240,.95)";
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-6, -4);
      ctx.lineTo(-6, 4);
      ctx.closePath();
      ctx.fill();

      // little engine glow
      ctx.fillStyle = "rgba(34,211,238,.35)";
      ctx.beginPath();
      ctx.arc(-6, 0, 4.2, 0, Math.PI*2);
      ctx.fill();

      ctx.restore();
    });

    // explosions
    mc.explosions.forEach(ex=>{
      ctx.fillStyle = "rgba(251,191,36,.2)";
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, ex.r, 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle = "rgba(251,191,36,.55)";
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // crosshair
    const cx = mc.crosshair.x;
    const cy = mc.crosshair.y;
    ctx.strokeStyle = "rgba(226,232,240,.85)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI*2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx-14, cy);
    ctx.lineTo(cx+14, cy);
    ctx.moveTo(cx, cy-14);
    ctx.lineTo(cx, cy+14);
    ctx.stroke();

    if (gameOver){
      ctx.fillStyle = "rgba(15,23,42,.78)";
      ctx.fillRect(0,0,w,h);
      ctx.fillStyle = "rgba(226,232,240,.95)";
      ctx.font = "800 32px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.textAlign = "center";
      ctx.fillText("GAME OVER", w/2, h/2 - 26);
      ctx.font = "600 16px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillStyle = "rgba(148,163,184,.95)";
      ctx.fillText("Press R to restart • or QUIT", w/2, h/2 + 10);
    }
  }

  function onCanvasPointerMove(ev){
    if (!active || mode !== MODE.MISSILE) return;
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    mc.pointer.x = Math.max(0, Math.min(window.innerWidth, x));
    mc.pointer.y = Math.max(0, Math.min(mc.groundY - 20, y));
    mc.pointer.has = true;
  }

  function onCanvasPointerDown(ev){
    if (!active || mode !== MODE.MISSILE) return;
    // left click / touch
    if (ev.button != null && ev.button !== 0) return;
    ev.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    mcFireAt(x, y);
  }

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

    // Missile Command pointer controls (safe for other modes)
    if (!canvas._mcBound){
      canvas.addEventListener("pointermove", onCanvasPointerMove, { passive:true });
      canvas.addEventListener("pointerdown", onCanvasPointerDown, { passive:false });
      canvas._mcBound = true;
    }

    quitBtn.addEventListener("click", ()=>stopGame());
    quitBtn.addEventListener("contextmenu", (ev)=>{ ev.preventDefault(); });
  }

  function showOverlay(){
    ensureOverlay();
    document.body.classList.add("invaders-mode");
    document.body.classList.toggle("asteroids-mode", mode === MODE.ASTEROIDS);
    document.body.classList.toggle("missile-mode", mode === MODE.MISSILE);
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

  // Some rounds render a richer prompt (JP with missing segment + EN).
  // Use innerHTML intentionally here because Notes already store HTML.
  function setDefinitionHtml(html){
    if (!defEl) return;
    defEl.innerHTML = html || "";
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

  function showFlashcard(gp, opts){
    if (!gp) return;
    opts = opts || {};
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

    // Prefer showing the exact example sentence used in the question (if provided).
    if (opts.example && cardNotes.length){
      const sig = `${String(opts.example.jpHtml || "")}||${String(opts.example.enHtml || "")}`;
      const idx = cardNotes.findIndex(n => `${String(n?.jpHtml||"")}||${String(n?.enHtml||"")}` === sig);
      cardNoteIndex = (idx >= 0) ? idx : randInt(cardNotes.length);
    } else {
      cardNoteIndex = cardNotes.length ? randInt(cardNotes.length) : 0;
    }
    setCardSentence(cardNoteIndex);

    applyInvadersCardFontScale();

    if (cardHintEl){
      if (opts.correctAnswer){
        cardHintEl.textContent = `Correct answer: ${opts.correctAnswer}  •  Press Space to continue`;
      } else {
        cardHintEl.textContent = "Press Space to continue";
      }
    }
    if (cardWrapEl) cardWrapEl.hidden = false;
  }

  function updateHud(){
    if (!scoreEl || !livesEl) return;

    if (mode === MODE.MISSILE){
      scoreEl.textContent = `Score: ${score}`;
      livesEl.textContent = `Cities: ${mc.citiesAlive}/${mc.citiesTotal}`;
      return;
    }

    scoreEl.textContent = `Score: ${score}  •  Hi: ${getHiScore()}`;
    livesEl.textContent = `Lives: ${lives}`;
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

    if (mode === MODE.MISSILE){
      mcInitLayout(w, h);
    }
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
        <div class="invaders-picker-title">Pick a mini-game</div>
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
          <button type="button" class="chip-btn invaders-pick invaders-pick-missile">Missile Command</button>
        </div>
        <button type="button" class="chip-btn invaders-picker-cancel invaders-pick-cancel">Cancel</button>
      </div>
    `;

    document.body.appendChild(picker);

    const sub = picker.querySelector(".invaders-picker-sub");
    const btnA = picker.querySelector(".invaders-pick-asteroids");
    const btnI = picker.querySelector(".invaders-pick-invaders");
    const btnM = picker.querySelector(".invaders-pick-missile");
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
      if (btnM) btnM.disabled = !hasAny;
      const label = sel.length ? sel.join(", ") : "(none)";
      picker._setSub?.(`Levels: ${label}  •  (A = Asteroids, I = Invaders, M = Missile Command, Esc = cancel)`);
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

    if (btnM){
      btnM.addEventListener("click", ()=>{
        const lvls = pendingLevels ? Array.from(pendingLevels) : [];
        if (!lvls.length) return;
        hideModePicker();
        startGame(lvls, MODE.MISSILE);
      });
    }
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
      if (ev.key === "m" || ev.key === "M") {
        ev.preventDefault();
        const lvls = pendingLevels ? Array.from(pendingLevels) : [];
        if (!lvls.length) return;
        hideModePicker();
        startGame(lvls, MODE.MISSILE);
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

  function htmlToDiv(html){
    const d = document.createElement("div");
    d.innerHTML = String(html || "");
    return d;
  }

  function extractHighlightedAnswerFromHtml(html){
    // Prefer segments that have explicit colour styling applied by the Notes editor (JLPT colour or custom),
    // but also support legacy highlight markers.
    const div = htmlToDiv(html);
    const isMarked = (el)=>{
      if (!el || el.nodeType !== 1) return false;
      const name = el.nodeName.toLowerCase();
      if (name === "font" && el.getAttribute("color")) return true;
      if (name === "span"){
        const c = (el.style && el.style.color) ? String(el.style.color).trim() : "";
        if (c && c.toLowerCase() !== "inherit") return true;
        if (el.getAttribute("data-jlptfiver-hl") === "1") return true;
        if (el.classList && el.classList.contains("jlptfiver-hl")) return true;
      }
      return false;
    };

    const candidates = Array.from(div.querySelectorAll("span, font")).filter(isMarked);

    // Only keep leaf-ish marked nodes to avoid double counting when nesting occurs.
    const marked = candidates.filter(el=>{
      try{
        const hasChildMarked = !!el.querySelector("span[style*='color'], span[data-jlptfiver-hl='1'], span.jlptfiver-hl, font[color]");
        return !hasChildMarked;
      }catch{
        return true;
      }
    });

    const parts = [];
    marked.forEach(s=>{
      const t = (s.textContent || "").trim();
      if (t) parts.push(t);
    });

    const answer = parts.join("");
    return { answer, parts };
  }

  function maskHighlightedJapaneseHtml(jpHtml){
    const div = htmlToDiv(jpHtml);
    // Mask coloured / highlighted segments (answer part) so the player has to pick it.
    const nodes = Array.from(div.querySelectorAll("span, font")).filter(el=>{
      if (!el || el.nodeType !== 1) return false;
      const name = el.nodeName.toLowerCase();
      if (name === "font" && el.getAttribute("color")) return true;
      if (name === "span"){
        const c = (el.style && el.style.color) ? String(el.style.color).trim() : "";
        if (c && c.toLowerCase() !== "inherit") return true;
        if (el.getAttribute("data-jlptfiver-hl") === "1") return true;
        if (el.classList && el.classList.contains("jlptfiver-hl")) return true;
      }
      return false;
    }).filter(el=>{
      // leaf-ish only
      try{
        const hasChildMarked = !!el.querySelector("span[style*='color'], span[data-jlptfiver-hl='1'], span.jlptfiver-hl, font[color]");
        return !hasChildMarked;
      }catch{
        return true;
      }
    });

    nodes.forEach(s=>{
      s.textContent = "＿＿＿";
      if (s.style){
        s.style.color = "inherit";
        s.style.fontWeight = "700";
      }
      if (s.classList){
        s.classList.remove("jlptfiver-hl");
        s.classList.add("jlptfiver-missing");
      }
      if (s.removeAttribute){
        s.removeAttribute("data-jlptfiver-hl");
        // font[color]
        if (s.nodeName && s.nodeName.toLowerCase() === "font") s.removeAttribute("color");
      }
    });
    return div.innerHTML;
  }

  function getExampleCacheKey(gp){
    if (!gp) return "";
    // Prefer stable numeric index if present
    if (gp.index !== undefined && gp.index !== null) return String(gp.index);
    // Fall back to level+grammar
    return `${gp.level || ""}__${gp.grammar || ""}`;
  }

  
  function stripBracketedFromText(text, removeSquare){
    let s = String(text || "");
    // Common bracket styles
    s = s.replace(/\([^)]*\)/g, "");
    s = s.replace(/（[^）]*）/g, "");
    if (removeSquare){
      s = s.replace(/\[[^\]]*\]/g, "");
      s = s.replace(/［[^］]*］/g, "");
    }
    // Clean up spacing artifacts
    s = s.replace(/\s{2,}/g, " ");
    return s;
  }

  function stripBracketedFromHtml(html, removeSquare){
    if (!html) return "";
    try{
      const div = htmlToDiv(html);
      const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT, null);
      let node = walker.nextNode();
      while (node){
        node.nodeValue = stripBracketedFromText(node.nodeValue, removeSquare);
        node = walker.nextNode();
      }
      return div.innerHTML;
    } catch (e){
      // Fallback (best-effort): only strip () / （） from the raw string to avoid nuking style attrs that contain parentheses
      return String(html).replace(/（[^）]*）/g, "").replace(/\([^)]*\)/g, "");
    }
  }

function getUsableExamplesForGp(gp){
    if (!gp) return [];
    const key = getExampleCacheKey(gp);
    if (exampleCache.has(key)) return exampleCache.get(key) || [];

    const notes = getFlashcardNotes(gp);
    const usable = (Array.isArray(notes) ? notes : []).map(n=>{
      const jpRaw = String(n?.jpHtml || "");
      const enRaw = String(n?.enHtml || "");
      const jpHtml = stripBracketedFromHtml(jpRaw, false);
      const enHtml = stripBracketedFromHtml(enRaw, true);
      const ex = extractHighlightedAnswerFromHtml(jpHtml);
      const answer = stripBracketedFromText((ex?.answer || "").trim(), false).trim();
      if (!answer) return null;
      return {
        jpHtml,
        enHtml,
        jpMaskedHtml: maskHighlightedJapaneseHtml(jpHtml),
        answer
      };
    }).filter(Boolean);

    exampleCache.set(key, usable);
    return usable;
  }

  function pickExampleWithAnswer(gp){
    const usable = getUsableExamplesForGp(gp);
    if (!usable.length) return null;
    return usable[randInt(usable.length)];
  }

  function renderSentencePrompt(q){
    const jp = q?.jpMaskedHtml || "";
    const en = q?.enHtml || "";
    const jpBlock = jp ? `<div class="mini-q-jp">${jp}</div>` : `<div class="mini-q-jp" style="opacity:.8">(No JP sentence)</div>`;
    const enBlock = en ? `<div class="mini-q-en">${en}</div>` : "";
    setDefinitionHtml(jpBlock + enBlock);
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

  function pickRoundQuestion(){
    if (!pool.length) return null;

    // Require a sentence that contains a highlighted answer.
    let gp = null;
    let ex = null;

    for (let tries=0; tries<60; tries++){
      const cand = pool[randInt(pool.length)];
      const picked = pickExampleWithAnswer(cand);
      if (picked){
        gp = cand;
        ex = picked;
        break;
      }
    }

    if (!gp || !ex) return null;

    const answer = (ex.answer || "").trim();
    if (!answer) return null;

    const jpHtml = ex.jpHtml || "";
    const enHtml = ex.enHtml || "";
    const jpMaskedHtml = ex.jpMaskedHtml || "";

    // Build answer options (strings) from OTHER grammar points' example sentences.
    const want = Math.max(4, Math.min(6, pool.length));
    const usedAnswers = new Set();
    const options = [];

    usedAnswers.add(answer);
    options.push({ answer, gp, isCorrect: true });

    let attempts = 0;
    while (options.length < want && attempts < 600){
      attempts++;
      const cand = pool[randInt(pool.length)];
      if (!cand || (gp && cand.index === gp.index)) continue;

      const picked = pickExampleWithAnswer(cand);
      const a = (picked?.answer || "").trim();
      if (!a) continue;
      if (usedAnswers.has(a)) continue;

      usedAnswers.add(a);
      options.push({ answer: a, gp: cand, isCorrect: false });
    }

    shuffle(options);

    return { gp, answer, jpHtml, enHtml, jpMaskedHtml, options };
  }

  function scheduleNextRound(seconds, msg){
    roundCooldown = Math.max(0, seconds || 0);
    if (msg) setCenter(msg);
  }  function beginCountIn(seconds){
    countIn = Math.max(0, Number(seconds) || 0);
    lastCountInShown = null;
    if (countIn > 0){
      // show immediately
      const n = Math.ceil(countIn);
      lastCountInShown = n;
      setCenter(String(n));
    } else {
      setCenter("");
    }
  }

  function tickCountIn(dt){
    if (countIn <= 0) return false;
    countIn = Math.max(0, countIn - dt);
    const n = countIn > 0 ? Math.ceil(countIn) : 0;
    if (n !== lastCountInShown){
      lastCountInShown = n;
      setCenter(n > 0 ? String(n) : "");
    }
    return countIn > 0;
  }

  function loseLife(reason){
    lives = Math.max(0, lives - 1);
    updateHud();

    // clear playfield
    inv.enemies = [];
    inv.bullets = [];
    ast.rocks = [];
    ast.bullets = [];

    if (lives <= 0){
      gameOver = true;
      setCenter("GAME OVER  •  Press R to restart, or QUIT");
      setDefinition("");
      return;
    }

    // Immediately move to the next sentence prompt (with a 3-second count-in).
    if (mode === MODE.ASTEROIDS) startRoundAsteroids();
    else startRoundInvaders();
  }

  function correctSelection(){
    score += 1;
    if (score > getHiScore()) setHiScore(score);
    updateHud();

    // Clear playfield and immediately move on to the next sentence prompt
    // (movement is frozen during the 3-second count-in).
    inv.enemies = [];
    inv.bullets = [];
    ast.rocks = [];
    ast.bullets = [];

    if (mode === MODE.ASTEROIDS) startRoundAsteroids();
    else startRoundInvaders();
  }

  function wrongSelection(){
    // Only called when the player *selects/hits* a wrong option.
    lives = Math.max(0, lives - 1);
    updateHud();

    if (lives <= 0){
      gameOver = true;
      setCenter("GAME OVER  •  Press R to restart, or QUIT");
      setDefinition("");
      return;
    }

    setCenter("Wrong!");
    // Show the flashcard (with the correct answer revealed) only on wrong selection.
    const ex = currentQ ? { jpHtml: currentQ.jpHtml, enHtml: currentQ.enHtml } : null;
    showFlashcard(correctGp, { correctAnswer, example: ex });
  }

  // ------------------------
  // Invaders mode
  // ------------------------
  function invadersFire(){
    if (gameOver || invCardActive || roundCooldown > 0 || countIn > 0) return;
    const now = Date.now();
    if (now - inv.lastShotAt < inv.shotCooldownMs) return;
    inv.lastShotAt = now;
    inv.bullets.push({ x: inv.ship.x, y: inv.ship.y - inv.ship.h/2 - 6, vy: -720 });
  }

  function startRoundInvaders(){
    hideFlashcard();
    const w = window.innerWidth;

    const q = pickRoundQuestion();
    if (!q){
      currentQ = null;
      correctGp = null;
      correctAnswer = "";
      inv.enemies = [];
      inv.bullets = [];
      setDefinitionHtml(`<div class="mini-q-jp" style="opacity:.9">No sentence targets found.</div><div class="mini-q-en" style="opacity:.85">Add at least one example sentence in Notes with a coloured segment.</div>`);
      setCenter("—");
      return;
    }

    currentQ = q;
    correctGp = q.gp;
    correctAnswer = q.answer || "";

    renderSentencePrompt(q);

    const options = Array.isArray(q.options) ? q.options : [];

    const paddingX = 22;
    const topSpawn = -120;
    const gap = 10;

    const cols = Math.max(4, Math.min(6, options.length || 4));
    const colW = (w - paddingX*2 - gap*(cols-1)) / cols;
    const colIdxs = shuffle(Array.from({length:cols},(_,i)=>i));

    inv.enemies = (options.length ? options : []).slice(0, cols).map((opt, i)=>{
      const col = colIdxs[i % colIdxs.length];
      const x = paddingX + col*(colW + gap) + colW/2;
      const y = topSpawn - randInt(240);
      const vy = 52 + Math.random()*38 + (score * 0.7);
      return {
        opt,
        x, y,
        vy,
        w: Math.min(260, Math.max(120, colW)),
        h: 34
      };
    });

    inv.bullets = [];
    roundCooldown = 0;

    // 3-second count-in before movement starts
    beginCountIn(3);
  }

  function updateInvaders(dt, w, h){
    if (invCardActive) return;

    // during cooldown, freeze motion but keep drawing
    if (roundCooldown > 0){
      roundCooldown = Math.max(0, roundCooldown - dt);
      if (roundCooldown === 0 && !gameOver) startRoundInvaders();
      return;
    }

    // 3-second count-in at the start of each question
    const counting = tickCountIn(dt);

    if (inv.keys.left) inv.ship.x -= inv.ship.speed * dt;
    if (inv.keys.right) inv.ship.x += inv.ship.speed * dt;
    inv.ship.x = Math.min(Math.max(inv.ship.x, inv.ship.w/2 + 14), w - inv.ship.w/2 - 14);

    
    // Allow movement during count-in, but don't allow shooting or enemy motion until it finishes.
    if (counting) return;

inv.enemies.forEach(e=>{ e.y += e.vy * dt; });

    inv.bullets.forEach(b=>{ b.y += b.vy * dt; });
    inv.bullets = inv.bullets.filter(b=>b.y > -50);

    // Ground rule: only fail if the *correct* answer hits the ground.
    const groundY = h - 12;
    for (let ei=inv.enemies.length-1; ei>=0; ei--){
      const e = inv.enemies[ei];
      if ((e.y + e.h/2) >= groundY){
        const isCorrect = !!e.opt?.isCorrect;
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
          const isCorrect = !!e.opt?.isCorrect;
          if (isCorrect) correctSelection();
          else wrongSelection();
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

      const txt = clipText(e.opt?.answer || "", 22);
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
    if (gameOver || invCardActive || roundCooldown > 0 || countIn > 0) return;
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

    hideFlashcard();

    const q = pickRoundQuestion();
    if (!q){
      currentQ = null;
      correctGp = null;
      correctAnswer = "";
      ast.rocks = [];
      ast.bullets = [];
      setDefinitionHtml(`<div class="mini-q-jp" style="opacity:.9">No sentence targets found.</div><div class="mini-q-en" style="opacity:.85">Add at least one example sentence in Notes with a coloured segment.</div>`);
      setCenter("—");
      return;
    }

    currentQ = q;
    correctGp = q.gp;
    correctAnswer = q.answer || "";

    renderSentencePrompt(q);

    // reset ship near lower-middle so the definition stays readable
    ast.ship.x = w * 0.5;
    ast.ship.y = h * 0.68;
    ast.ship.vx = 0;
    ast.ship.vy = 0;
    ast.ship.ang = -Math.PI/2;

    ast.bullets = [];

    // build rocks
    const options = Array.isArray(q.options) ? q.options : [];
    const want = Math.max(4, Math.min(6, options.length || 4));
    const picked = (options.length ? options : []).slice(0, want);

    ast.rocks = picked.map((opt, i)=>{
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
      return { opt, x, y, vx, vy, r };
    });

    roundCooldown = 0;

    // 3-second count-in before movement starts
    beginCountIn(3);
  }

  function updateAsteroids(dt, w, h){
    if (invCardActive) return;

    if (roundCooldown > 0){
      roundCooldown = Math.max(0, roundCooldown - dt);
      if (roundCooldown === 0 && !gameOver) startRoundAsteroids();
      return;
    }

    // 3-second count-in at the start of each question
    const counting = tickCountIn(dt);

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

    // Allow movement during count-in, but don't allow shooting until it finishes.
    if (counting) return;


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
          const isCorrect = !!r.opt?.isCorrect;
          if (isCorrect) correctSelection();
          else wrongSelection();
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

      const txt = clipText(r.opt?.answer || "", 18);
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
        else if (mode === MODE.MISSILE) mcUpdate(w, h, dt);
      }

      // draw even when paused / game over
      if (mode === MODE.INVADERS) drawInvaders(w, h);
      else if (mode === MODE.ASTEROIDS) drawAsteroids(w, h);
      else if (mode === MODE.MISSILE) mcDraw(w, h);

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

    mc.keys.left = mc.keys.right = mc.keys.up = mc.keys.down = false;
    mc.pointer.has = false;
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
            // next round (with 3-second count-in)
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
            // next round (with 3-second count-in)
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
      return;
    }

    if (mode === MODE.MISSILE){
      if (k === "ArrowLeft" || k === "a" || k === "A"){ mc.keys.left = true; ev.preventDefault(); }
      else if (k === "ArrowRight" || k === "d" || k === "D"){ mc.keys.right = true; ev.preventDefault(); }
      else if (k === "ArrowUp" || k === "w" || k === "W"){ mc.keys.up = true; ev.preventDefault(); }
      else if (k === "ArrowDown" || k === "s" || k === "S"){ mc.keys.down = true; ev.preventDefault(); }
      else if (k === " " || k === "Spacebar"){ if (!gameOver) mcFireAt(mc.crosshair.x, mc.crosshair.y); ev.preventDefault(); }
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
      return;
    }

    if (mode === MODE.MISSILE){
      if (k === "ArrowLeft" || k === "a" || k === "A") mc.keys.left = false;
      else if (k === "ArrowRight" || k === "d" || k === "D") mc.keys.right = false;
      else if (k === "ArrowUp" || k === "w" || k === "W") mc.keys.up = false;
      else if (k === "ArrowDown" || k === "s" || k === "S") mc.keys.down = false;
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
    countIn = 0;
    lastCountInShown = null;
    hideFlashcard();
    updateHud();

    if (mode === MODE.INVADERS){
      inv.ship.x = window.innerWidth / 2;
      inv.ship.y = Math.max(120, window.innerHeight - 68);
      inv.bullets = [];
      inv.enemies = [];
      startRoundInvaders();
    } else if (mode === MODE.ASTEROIDS){
      ast.bullets = [];
      ast.rocks = [];
      startRoundAsteroids();
    } else if (mode === MODE.MISSILE){
      score = 0;
      gameOver = false;
      startMissileCommand();
    }
  }

  function startGame(lvlOrLvls, chosenMode){
    const byLevel = window.App?.State?.byLevel;
    const lvls = Array.isArray(lvlOrLvls) ? lvlOrLvls.filter(Boolean) : [lvlOrLvls].filter(Boolean);
    const uniqueLvls = Array.from(new Set(lvls.map(x=>String(x).toUpperCase()).filter(x=>/^N[1-5]$/.test(x))));
    const list = byLevel ? uniqueLvls.flatMap(lvl => (byLevel[lvl] || [])) : [];
    if (chosenMode !== MODE.MISSILE && !list.length) return;

    // Only use grammar points that have at least one example sentence with a highlighted target.
    exampleCache.clear();
    const eligible = (chosenMode === MODE.MISSILE) ? [] : list.filter(gp => getUsableExamplesForGp(gp).length > 0);

    // in case a picker is open
    hideModePicker();

    levelsSelected = uniqueLvls;
    level = uniqueLvls.join(",");
    pool = eligible;
    mode = chosenMode || MODE.INVADERS;

    active = true;
    gameOver = false;
    score = 0;
    lives = 5;
    roundCooldown = 0;
    countIn = 0;
    lastCountInShown = null;
    hideFlashcard();

    clearKeyStates();

    showOverlay();
    resizeCanvas();

    inv.ship.x = window.innerWidth / 2;
    updateHud();

    const lvlLabel = uniqueLvls.length ? uniqueLvls.join("+") : "";
    if (mode === MODE.MISSILE){
      setCenter("MISSILE COMMAND");
      setDefinitionHtml(`<div class="mini-q-en" style="opacity:.9">Click/tap to fire interceptors • Protect the cities</div>`);
      startMissileCommand();
    } else if (mode === MODE.INVADERS){
      setCenter(`${lvlLabel} INVADERS  •  Hit the missing text`);
      if (!pool.length){
        setDefinitionHtml(`<div class="mini-q-jp" style="opacity:.9">No sentence targets available for ${lvlLabel || "these levels"}.</div><div class="mini-q-en" style="opacity:.85">Add example sentences in Notes and highlight the target text.</div>`);
        setCenter("No sentence targets");
      } else {
        setDefinition("Loading…");
        startRoundInvaders();
      }
    } else {
      setCenter(`${lvlLabel} ASTEROIDS  •  Shoot the missing text`);
      if (!pool.length){
        setDefinitionHtml(`<div class="mini-q-jp" style="opacity:.9">No sentence targets available for ${lvlLabel || "these levels"}.</div><div class="mini-q-en" style="opacity:.85">Add example sentences in Notes and highlight the target text.</div>`);
        setCenter("No sentence targets");
      } else {
        setDefinition("Loading…");
        startRoundAsteroids();
      }
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
    currentQ = null;
    correctGp = null;
    correctAnswer = "";

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

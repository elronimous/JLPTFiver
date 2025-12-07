(function(){
  window.App = window.App || {};
  const { CONST, Utils, Storage, Tooltip } = window.App;

  const Scores = {};

  function get(exampleId){
    const n = parseInt(Storage.userData.scoresByExample?.[exampleId], 10);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(CONST.SCORE_MAX, n));
  }

  function set(exampleId, score){
    const clamped = Math.max(0, Math.min(CONST.SCORE_MAX, parseInt(score,10) || 0));
    Storage.userData.scoresByExample[exampleId] = clamped;
    Storage.saveUserData();
  }

  function scoreTooltipText(score){
    if (score <= 0) return "New!";
    if (score >= CONST.SCORE_MAX) return "Should be good at this now!";
    return `Score: ${score}`;
  }

  function closeAllPickers(){
    Utils.qsa(".score-wrap.editing").forEach(el => el.classList.remove("editing"));
  }

  function setEmojiInWrap(wrap, exampleId){
    const em = wrap.querySelector(".score-emoji");
    const dec = wrap.querySelector(".score-arrow.dec");
    const inc = wrap.querySelector(".score-arrow.inc");
    const score = get(exampleId);
    em.textContent = CONST.SCORE_EMOJIS[score] || CONST.SCORE_EMOJIS[0];
    if (dec) dec.disabled = (score <= 0);
    if (inc) inc.disabled = (score >= CONST.SCORE_MAX);
  }

  function updateEverywhere(exampleId){
    Utils.qsa(`.score-wrap[data-example-id="${CSS.escape(exampleId)}"]`).forEach(wrap=>{
      setEmojiInWrap(wrap, exampleId);
    });
  }

  function build(exampleId){
    const wrap = document.createElement("span");
    wrap.className = "score-wrap";
    wrap.dataset.exampleId = exampleId;

    const dec = document.createElement("button");
    dec.type = "button";
    dec.className = "score-arrow dec";
    dec.textContent = "‹";

    const em = document.createElement("span");
    em.className = "score-emoji";
    em.dataset.exampleId = exampleId;

    const inc = document.createElement("button");
    inc.type = "button";
    inc.className = "score-arrow inc";
    inc.textContent = "›";

    wrap.appendChild(dec);
    wrap.appendChild(em);
    wrap.appendChild(inc);

    setEmojiInWrap(wrap, exampleId);

    em.addEventListener("mousemove", (ev)=>Tooltip.show(scoreTooltipText(get(exampleId)), ev.clientX, ev.clientY));
    em.addEventListener("mouseleave", Tooltip.hide);

    em.addEventListener("click", (ev)=>{
      ev.stopPropagation();
      closeAllPickers();
      wrap.classList.add("editing");
      setEmojiInWrap(wrap, exampleId);
    });

    dec.addEventListener("click", (ev)=>{
      ev.stopPropagation();
      const cur = get(exampleId);
      if (cur > 0) set(exampleId, cur - 1);
      wrap.classList.add("editing");
      updateEverywhere(exampleId);
    });

    inc.addEventListener("click", (ev)=>{
      ev.stopPropagation();
      const cur = get(exampleId);
      if (cur < CONST.SCORE_MAX) set(exampleId, cur + 1);
      wrap.classList.add("editing");
      updateEverywhere(exampleId);
    });

    wrap.addEventListener("click", (ev)=>ev.stopPropagation());
    return wrap;
  }

  Scores.get = get;
  Scores.set = set;
  Scores.build = build;
  Scores.closeAllPickers = closeAllPickers;

  Scores.applyEnabled = (on) => {
    document.body.classList.toggle("no-scores", !on);
  };

  window.App.Scores = Scores;
})();

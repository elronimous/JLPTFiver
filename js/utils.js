(function(){
  window.App = window.App || {};
  const Utils = {};

  Utils.qs = (sel, root=document) => root.querySelector(sel);
  Utils.qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  Utils.escapeHtml = (str) => String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");

  Utils.dateToYMD = (d) =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

  Utils.ymdToDate = (ymd) => {
    const [y,m,dd] = String(ymd||"").split("-").map(n=>parseInt(n,10));
    return new Date(y||1970, (m||1)-1, dd||1);
  };

  Utils.formatDMYShort = (d) => {
    const dd = String(d.getDate()).padStart(2,"0");
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
  };

  Utils.daysBetween = (startDate, targetDate) => {
    const msPerDay = 24*60*60*1000;
    const a = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
    const b = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();
    return Math.floor((b - a) / msPerDay);
  };

  Utils.mod = (n,m) => ((n % m) + m) % m;

  Utils.debounce = (fn, ms=80) => {
    let t = null;
    return (...args) => {
      if (t) clearTimeout(t);
      t = setTimeout(()=>fn(...args), ms);
    };
  };

  Utils.htmlToText = (html) => {
    const div = document.createElement("div");
    div.innerHTML = String(html||"");
    return (div.textContent || "").trim();
  };

  // One "emoji" / grapheme cluster (best-effort).
  Utils.firstGrapheme = (s) => {
    const str = String(s || "").trim();
    if (!str) return "";
    try{
      if (window.Intl && Intl.Segmenter){
        const seg = new Intl.Segmenter(undefined, {granularity:"grapheme"});
        const it = seg.segment(str)[Symbol.iterator]();
        const first = it.next();
        return first && !first.done ? first.value.segment : str.slice(0,1);
      }
    }catch{}
    return str.slice(0,1);
  };

  window.App.Utils = Utils;
})();

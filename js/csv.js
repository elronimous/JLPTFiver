(function(){
  window.App = window.App || {};
  const { CONST, Utils } = window.App;

  const Csv = {};

  function parseCSV(text){
    const lines = String(text||"").split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    const rows = [];
    for (const line of lines){
      const parts = [];
      let cur = "";
      let inQuotes = false;
      for (let i=0;i<line.length;i++){
        const c = line[i];
        if (c === '"') inQuotes = !inQuotes;
        else if (c === ',' && !inQuotes){
          parts.push(cur.trim());
          cur = "";
        } else cur += c;
      }
      parts.push(cur.trim());
      rows.push(parts);
    }
    return rows;
  }

  function groupByLevel(rows){
    const byLevel = {};
    for (const row of rows){
      if (row.length < 5) continue;
      const level = row[0].trim().toUpperCase();
      if (!/^N[1-5]$/.test(level)) continue;
      byLevel[level] = byLevel[level] || [];

      const links = [];
      for (let i=5;i<row.length;i++){
        if (row[i] && row[i].trim()) links.push(row[i].trim());
      }
      const primaryLink = links.length ? links[0] : null;
      const extraLinks = links.slice(1);

      byLevel[level].push({
        level,
        index: parseInt(row[1],10) || (byLevel[level].length + 1),
        grammar: row[2].trim(),
        romaji: row[3].trim() || "",
        meaning: row[4].trim() || "",
        primaryLink,
        extraLinks
      });
    }
    CONST.LEVEL_ORDER.forEach(lvl=>{
      if (byLevel[lvl]) byLevel[lvl].sort((a,b)=>a.index-b.index);
    });
    return byLevel;
  }

  // ORIGINAL shuffle (matches your snippet): seed depends ONLY on len
  function shuffleArray(len){
    const arr = Array.from({length:len},(_,i)=>i);
    let seed = 1234567 + len * 31;
    for (let i = len - 1; i > 0; i--){
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const j = Math.floor((seed / 0x80000000) * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  Csv.load = async () => {
    let text = "";
    try{
      const res = await fetch("data/grammar.csv", { cache:"no-store" });
      if (!res.ok) throw new Error("Fetch failed");
      text = await res.text();
    }catch{
      const fallback = Utils.qs("#csvDataFallback");
      text = fallback ? fallback.content.textContent : "";
    }

    const rows = parseCSV(text);
    const byLevel = groupByLevel(rows);

    const flat = [];
    CONST.LEVEL_ORDER.forEach(lvl=>{
      (byLevel[lvl]||[]).forEach(it=>flat.push(it));
    });

    const permutations = {};
    Object.keys(byLevel).forEach(level=>{
      permutations[level] = shuffleArray(byLevel[level].length);
    });

    window.App.State = window.App.State || {};
    window.App.State.byLevel = byLevel;
    window.App.State.flat = flat;
    window.App.State.permutations = permutations;
  };

  window.App.Csv = Csv;
})();

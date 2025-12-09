(function(){
  window.App = window.App || {};
  const { CONST, Utils, Storage, Tooltip } = window.App;

  const Notes = {};
  let notesImportModalBackdrop, closeNotesImportBtn, notesImportTextarea, applyNotesImportBtn, cancelNotesImportBtn;
  let importContext = null;

  function looksEnglishLine(s){ return /[A-Za-z]/.test(s); }

  // Convert Bunpro HTML (span.text-primary-accent / <strong> / <b>) into plain text with #...# highlights.
  // Also used by the bulk notes importer paste handler.
  const NOTES_MARK_SELECTOR = "span.text-primary-accent, strong, b";

  function notesSanitizeHtml(html){
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(html||""), "text/html");

    doc.querySelectorAll("script, style, link, meta, iframe, object, embed, noscript").forEach(n => n.remove());

    doc.querySelectorAll("*").forEach(el => {
      [...el.attributes].forEach(attr => {
        const name = attr.name.toLowerCase();
        const value = (attr.value || "").trim();
        if (name.startsWith("on")) el.removeAttribute(attr.name);
        if ((name === "href" || name === "src") && value.toLowerCase().startsWith("javascript:")) {
          el.removeAttribute(attr.name);
        }
      });
    });

    return doc.body ? doc.body.innerHTML : "";
  }

  function notesCleanPlainText(text){
    let t = String(text||"").replace(/\r\n/g, "\n");
    t = t
      .split("\n")
      .map(l => l.replace(/[ \t]+$/g, "")) // trim right
      .filter(l => l.trim() !== "")        // remove blank lines
      .join("\n");
    return t.trim();
  }

  function notesHtmlToPlainTextWithHashtags(html){
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="__root__">${html}</div>`, "text/html");
    const root = doc.getElementById("__root__");
    if (!root) return "";

    function walk(node, inMark=false){
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
      if (node.nodeType !== Node.ELEMENT_NODE) return "";

      const el = node;
      const tag = (el.tagName || "").toUpperCase();
      if (tag === "BR") return "\n";

      const isMark = !!(el.matches && el.matches(NOTES_MARK_SELECTOR));
      const nextInMark = inMark || isMark;

      let out = "";
      for (const child of el.childNodes) out += walk(child, nextInMark);

      // Only wrap the outermost mark element to avoid ##double-wrapping##
      if (isMark && !inMark) out = `#${out}#`;

      // Reasonable newlines after block-ish elements
      if (["P","DIV","SECTION","ARTICLE","HEADER","FOOTER","ASIDE","NAV"].includes(tag)) out += "\n";
      if (tag === "LI") out += "\n";
      if (tag === "TR") out += "\n";
      if (tag === "TD" || tag === "TH") out += "\t";

      return out;
    }

    let text = walk(root);

    // cleanup + remove blank lines
    text = text.replace(/\r\n/g, "\n");
    text = text.replace(/[ \t]+\n/g, "\n");
    text = text.replace(/\n{3,}/g, "\n\n");

    text = text
      .split("\n")
      .map(line => line.replace(/[ \t]+$/g, ""))
      .filter(line => line.trim() !== "")
      .join("\n");

    return text.trim();
  }

  function notesClipboardToImportText(e){
    const html = e.clipboardData?.getData("text/html") || "";
    const text = e.clipboardData?.getData("text/plain") || "";

    const cleanedText = notesCleanPlainText(text);

    // If the user is pasting already-formatted markup text, keep it exactly (apart from blank-line cleanup).
    if (/#.+?#/.test(cleanedText) || cleanedText.includes("#")) return cleanedText;

    if (html) {
      const safeHtml = notesSanitizeHtml(html);

      // Only "Bunpro-style" convert when those mark elements exist.
      const hasMarkElements =
        /text-primary-accent/i.test(safeHtml) ||
        /<(strong|b)\b/i.test(safeHtml);

      if (hasMarkElements) {
        const converted = notesHtmlToPlainTextWithHashtags(safeHtml);
        return converted || cleanedText;
      }
    }

    return cleanedText;
  }

  function notesInsertAtTextareaCursor(textarea, insertText){
    const ta = textarea;
    const value = String(ta.value || "");
    const start = typeof ta.selectionStart === "number" ? ta.selectionStart : value.length;
    const end   = typeof ta.selectionEnd === "number" ? ta.selectionEnd : value.length;

    const next = value.slice(0, start) + insertText + value.slice(end);
    ta.value = next;

    const caret = start + insertText.length;
    try { ta.setSelectionRange(caret, caret); } catch {}
  }

  function notesInsertHtmlAtCaret(el, insertHtml){
    const target = el;
    try { target.focus(); } catch {}
    const sel = window.getSelection();
    let range = null;
    if (sel && sel.rangeCount){
      range = sel.getRangeAt(0);
      if (!target.contains(range.commonAncestorContainer)){
        range = document.createRange();
        range.selectNodeContents(target);
        range.collapse(false);
      }
    } else {
      range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
    }

    range.deleteContents();
    const frag = range.createContextualFragment(String(insertHtml||""));
    const last = frag.lastChild;
    range.insertNode(frag);

    if (sel){
      const r = document.createRange();
      if (last){
        r.setStartAfter(last);
      } else {
        r.selectNodeContents(target);
      }
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }
  function notesClipboardToInlineHtml(e, level){
    const markup = notesClipboardToImportText(e);
    // Convert #...# markup into styled spans (no clipboard formatting is kept).
    let html = toHighlightedHtml(markup, level);
    // Preserve line breaks if any
    html = html.replace(/\n/g, "<br>");
    return html;
  }


  function toHighlightedHtml(raw, level){
    const color = CONST.LEVEL_COLORS[level] || "#e5e7eb";
    const parts = String(raw||"").split("#");
    let out = "";
    for (let i=0;i<parts.length;i++){
      const seg = Utils.escapeHtml(parts[i]);
      if (i % 2 === 1) out += `<span style="color:${color};font-weight:800">${seg}</span>`;
      else out += seg;
    }
    return out;
  }

  function clampEmpty(el){
    if (!el) return;
    if (el.textContent.trim() === "") el.innerHTML = "";
  }

  function applyLevelColorToSelection(level){
    const color = CONST.LEVEL_COLORS[level] || "#e5e7eb";
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return false;

    let node = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    const editor = node && node.closest ? node.closest('.note-field[contenteditable="true"]') : null;
    if (!editor) return false;

    editor.focus();
    try{
      // Keep your styling consistent with importer: colour + font-weight:800
      const span = document.createElement("span");
      span.style.color = color;
      span.style.fontWeight = "800";
      range.surroundContents(span);
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    }catch{
      try{
        document.execCommand("styleWithCSS", false, true);
        document.execCommand("foreColor", false, color);
        document.execCommand("bold", false, null);
        return true;
      }catch{
        return false;
      }
    }
  }

  // Remove formatting ONLY within selection (best-effort).
  function stripFormattingInSelection(){
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return false;

    let node = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    const editor = node && node.closest ? node.closest('.note-field[contenteditable="true"]') : null;
    if (!editor) return false;

    const frag = range.extractContents();

    const walk = (n) => {
      if (n.nodeType === 1){
        // unwrap spans / strong / b but keep text + <br>
        const name = n.nodeName.toLowerCase();
        if (name === "span" || name === "b" || name === "strong"){
          // move children up
          const parent = n.parentNode;
          while (n.firstChild) parent.insertBefore(n.firstChild, n);
          parent.removeChild(n);
          return;
        }
        // strip inline style that affects highlighting but keep other tags
        if (n.hasAttribute && n.hasAttribute("style")){
          n.removeAttribute("style");
        }
        // recurse
        Array.from(n.childNodes).forEach(walk);
      }
    };
    Array.from(frag.childNodes).forEach(walk);

    range.insertNode(frag);
    sel.removeAllRanges();
    return true;
  }

  function openImportModal({ level, grammarKey, afterApply }){
    importContext = { level, grammarKey, afterApply };
    notesImportTextarea.value = "";
    notesImportModalBackdrop.hidden = false;
    notesImportTextarea.focus();
  }
  function closeImportModal(){
    notesImportModalBackdrop.hidden = true;
    importContext = null;
    notesImportTextarea.value = "";
  }

  function importNotesFromTextarea(){
    if (!importContext) return;
    const { level, grammarKey } = importContext;

    const rawLines = notesImportTextarea.value.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length>0);
    if (!rawLines.length){ closeImportModal(); return; }

    const hasEnglish = rawLines.some(looksEnglishLine);
    const pairs = [];
    if (!hasEnglish){
      rawLines.forEach(jp=>pairs.push([jp,""]));
    }else{
      for (let i=0;i<rawLines.length;i+=2){
        pairs.push([rawLines[i]||"", rawLines[i+1]||""]);
      }
    }

    if (!Array.isArray(Storage.userData.notesByGrammar[grammarKey])) Storage.userData.notesByGrammar[grammarKey] = [];
    pairs.forEach(([jp,en])=>{
      Storage.userData.notesByGrammar[grammarKey].push({
        jpHtml: toHighlightedHtml(jp, level),
        enHtml: toHighlightedHtml(en, level)
      });
    });
    Storage.saveUserData();

    if (typeof importContext.afterApply === "function") importContext.afterApply();
    closeImportModal();
  }

  Notes.init = () => {
    notesImportModalBackdrop = Utils.qs("#notesImportModalBackdrop");
    closeNotesImportBtn = Utils.qs("#closeNotesImportBtn");
    notesImportTextarea = Utils.qs("#notesImportTextarea");
    applyNotesImportBtn = Utils.qs("#applyNotesImportBtn");
    cancelNotesImportBtn = Utils.qs("#cancelNotesImportBtn");

    closeNotesImportBtn?.addEventListener("click", closeImportModal);
    cancelNotesImportBtn?.addEventListener("click", closeImportModal);
    notesImportModalBackdrop?.addEventListener("click", (ev)=>{ if (ev.target === notesImportModalBackdrop) closeImportModal(); });
    // Paste helper: if clipboard includes Bunpro HTML (accent/bold), convert it into #...# markup.
    notesImportTextarea?.addEventListener("paste", (e) => {
      try{
        if (!e.clipboardData) return;
        e.preventDefault();
        const insertText = notesClipboardToImportText(e);
        notesInsertAtTextareaCursor(notesImportTextarea, insertText);
      }catch{
        // If anything goes wrong, fall back to the browser default paste behaviour.
      }
    });

    applyNotesImportBtn?.addEventListener("click", importNotesFromTextarea);
  };

  Notes.getNotes = (grammarKey) => {
    const arr = Storage.userData.notesByGrammar[grammarKey];
    if (!Array.isArray(arr)) return [];
    return arr.map(n=>({jpHtml:String(n.jpHtml||""), enHtml:String(n.enHtml||"")}));
  };

  Notes.buildEditor = ({ level, grammarKey }) => {
    const section = document.createElement("div");
    section.className = "notes-section";

    const list = document.createElement("div");
    list.className = "notes-list";

    const footer = document.createElement("div");
    footer.className = "notes-footer";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "notes-icon-btn";
    editBtn.title = "Toggle edit mode";
    editBtn.textContent = "✎";

    const enBtn = document.createElement("button");
    enBtn.type = "button";
    enBtn.className = "notes-icon-btn notes-en-toggle";
    enBtn.title = "Toggle English (this dropdown)";
    enBtn.textContent = "EN";

    const colorBtn = document.createElement("button");
    colorBtn.type = "button";
    colorBtn.className = "notes-icon-btn";
    colorBtn.title = "Colour selected text (adds weight 800)";
    colorBtn.textContent = "🎨";

    const eraseBtn = document.createElement("button");
    eraseBtn.type = "button";
    eraseBtn.className = "notes-icon-btn";
    eraseBtn.title = "Remove formatting from selected text only";
    eraseBtn.textContent = "🧽";

    const importBtn = document.createElement("button");
    importBtn.type = "button";
    importBtn.className = "notes-icon-btn";
    importBtn.title = "Import sentences";
    importBtn.textContent = "📄";

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "notes-add-btn";
    addBtn.innerHTML = "<span>＋</span><span>Add</span>";

    // Only visible in edit mode
    addBtn.style.display = "none";
    colorBtn.style.display = "none";
    importBtn.style.display = "none";
    eraseBtn.style.display = "none";

    footer.appendChild(editBtn);
    footer.appendChild(enBtn);
    footer.appendChild(colorBtn);
    footer.appendChild(eraseBtn);
    footer.appendChild(importBtn);
    footer.appendChild(addBtn);

    section.appendChild(list);
    section.appendChild(footer);

    let editMode = false;
    let englishHidden = false;
    let defaultApplied = false;

    function setEnglishHidden(hidden){
      englishHidden = !!hidden;
      section.classList.toggle("en-hidden", englishHidden);
      enBtn.classList.toggle("showing", !englishHidden);
    }
    function ensureDefaultApplied(){
      if (defaultApplied) return;
      defaultApplied = true;
      setEnglishHidden(!!Storage.settings.hideEnglishDefault);
    }

    function getNotes(){
      if (!Array.isArray(Storage.userData.notesByGrammar[grammarKey])) Storage.userData.notesByGrammar[grammarKey] = [];
      Storage.userData.notesByGrammar[grammarKey] = Storage.userData.notesByGrammar[grammarKey].map(n=>({
        jpHtml: String(n.jpHtml||""),
        enHtml: String(n.enHtml||"")
      }));
      return Storage.userData.notesByGrammar[grammarKey];
    }

    function syncFromDOM(){
      const rows = [...list.querySelectorAll(".note-row")];
      const newNotes = [];
      for (const r of rows){
        const jp = r.querySelector(".note-field.note-jp");
        const en = r.querySelector(".note-field.note-en");
        clampEmpty(jp); clampEmpty(en);
        const jpText = (jp?.textContent||"").trim();
        const enText = (en?.textContent||"").trim();
        if (jpText || enText){
          newNotes.push({ jpHtml: jp ? jp.innerHTML : "", enHtml: en ? en.innerHTML : "" });
        }
      }
      Storage.userData.notesByGrammar[grammarKey] = newNotes;
      Storage.saveUserData();
    }

    function render(){
      list.innerHTML = "";
      const notes = getNotes();

      if (notes.length === 0 && !editMode){
        const hint = document.createElement("div");
        hint.className = "notes-empty-hint";
        hint.textContent = "No example sentences yet.";
        list.appendChild(hint);
        return;
      }

      notes.forEach((note, idx)=>{
        const row = document.createElement("div");
        row.className = "note-row";

        const jp = document.createElement("div");
        jp.className = "note-field note-jp";
        jp.dataset.placeholder = "Japanese";
        jp.contentEditable = editMode ? "true" : "false";
        jp.innerHTML = note.jpHtml || "";
        clampEmpty(jp);

        const en = document.createElement("div");
        en.className = "note-field note-en";
        en.dataset.placeholder = "English";
        en.contentEditable = editMode ? "true" : "false";
        en.innerHTML = note.enHtml || "";
        clampEmpty(en);

        row.appendChild(jp);
        row.appendChild(en);

        if (editMode){
          const del = document.createElement("span");
          del.className = "note-delete-btn";
          del.title = "Delete";
          del.textContent = "✕";
          del.addEventListener("click",(ev)=>{
            ev.stopPropagation();
            const listNotes = getNotes();
            listNotes.splice(idx,1);
            Storage.userData.notesByGrammar[grammarKey] = listNotes;
            Storage.saveUserData();
            render();
          });
          row.appendChild(del);

          const bind = (el)=>{
            el.addEventListener("input", syncFromDOM);
            el.addEventListener("blur", syncFromDOM);
            el.addEventListener("paste", (e)=>{
              // For JP/EN single-line editors: paste as plain text (no formatting),
              // but still support Bunpro-style highlights via #...# markup conversion.
              try{
                if (!e.clipboardData) return;
                e.preventDefault();
                const html = notesClipboardToInlineHtml(e, level);
                notesInsertHtmlAtCaret(el, html);
                setTimeout(syncFromDOM,0);
              } catch {
                // If anything goes wrong, fall back to plain text paste.
                try{
                  e.preventDefault();
                  const plain = e.clipboardData.getData("text/plain") || "";
                  const safe = Utils.escapeHtml(String(plain||"")).replace(/\n/g, "<br>");
                  notesInsertHtmlAtCaret(el, safe);
                  setTimeout(syncFromDOM,0);
                } catch {}
              }
            });
          };
          bind(jp); bind(en);
        }

        list.appendChild(row);
      });
    }

    editBtn.addEventListener("click",(ev)=>{
      ev.stopPropagation();
      editMode = !editMode;
      editBtn.classList.toggle("active", editMode);

      addBtn.style.display = editMode ? "inline-flex" : "none";
      colorBtn.style.display = editMode ? "inline-flex" : "none";
      importBtn.style.display = editMode ? "inline-flex" : "none";
      eraseBtn.style.display = editMode ? "inline-flex" : "none";

      render();
    });

    enBtn.addEventListener("click",(ev)=>{
      ev.stopPropagation();
      setEnglishHidden(!englishHidden);
    });

    addBtn.addEventListener("click",(ev)=>{
      ev.stopPropagation();
      const notes = getNotes();
      notes.push({ jpHtml:"", enHtml:"" });
      Storage.userData.notesByGrammar[grammarKey] = notes;
      Storage.saveUserData();
      render();
      const last = list.querySelector(".note-row:last-child .note-jp");
      last?.focus();
    });

    colorBtn.addEventListener("click",(ev)=>{
      ev.stopPropagation();
      const ok = applyLevelColorToSelection(level);
      if (ok) syncFromDOM();
    });

    eraseBtn.addEventListener("click",(ev)=>{
      ev.stopPropagation();
      const ok = stripFormattingInSelection();
      if (ok) syncFromDOM();
    });

    importBtn.addEventListener("click",(ev)=>{
      ev.stopPropagation();
      openImportModal({ level, grammarKey, afterApply: render });
    });

    section.addEventListener("click",(ev)=>ev.stopPropagation());

    setEnglishHidden(false);
    render();

    return { section, ensureDefaultApplied, rerender: render, sync: syncFromDOM };
  };

  window.App.Notes = Notes;
})();

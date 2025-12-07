(function(){
  window.App = window.App || {};
  const { Utils } = window.App;

  const Tooltip = {};
  let el = null;

  Tooltip.init = () => { el = Utils.qs("#appTooltip"); };

  Tooltip.show = (text, x, y) => {
    if (!el) return;
    el.textContent = String(text || "");
    el.classList.add("show");

    const pad = 10;
    const gutter = 8;

    const rect = el.getBoundingClientRect();
    let left = x + pad;
    let top = y + pad;

    const maxLeft = window.innerWidth - rect.width - gutter;
    const maxTop = window.innerHeight - rect.height - gutter;

    if (left > maxLeft) left = Math.max(gutter, x - pad - rect.width);
    if (top > maxTop) top = Math.max(gutter, y - pad - rect.height);

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  };

  Tooltip.hide = () => { if (el) el.classList.remove("show"); };

  window.App.Tooltip = Tooltip;
})();

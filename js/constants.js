(function(){
  window.App = window.App || {};

  const CONST = {
    LEVEL_ORDER: ["N5","N4","N3","N2","N1"],
    ITEMS_PER_DAY: 5,

    // Hard locked key start date (DD/MM/YYYY requested: 01/12/2025)
    RANDOM_START_YMD: "2025-12-01",

    SCORE_EMOJIS: ["🌑","🌘","🌗","🌖","🌝","🌔","🌓","🌒","💫","⭐","🌟","🌌","🌃","🌆","🌇","☁️","🌥️","🌤️","🌞"],
    SCORE_MAX: 18,

    STORAGE_KEYS: {
      FILTERS: "jlpt-active-filters",
      EXPANDED: "jlpt-expanded-sections",
      USERDATA: "jlpt-user-data",
      SETTINGS: "jlpt-global-settings",
      HEATMAP: "jlpt-heatmap-state",
      CRAM_LISTS: "jlpt-cram-custom-lists",
      CRAM_SESSION: "jlpt-cram-session"
    },

    LEVEL_COLORS: {
      N5: "#22c55e",
      N4: "#3b82f6",
      N3: "#f97316",
      N2: "#ef4444",
      N1: "#a855f7"
    }
  };

  window.App.CONST = CONST;
})();
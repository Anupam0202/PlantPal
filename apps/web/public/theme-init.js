// Applies saved appearance before first paint (no inline scripts, CSP-friendly).
(function () {
  try {
    var p = JSON.parse(localStorage.getItem('pp-prefs') || '{}');
    var d = document.documentElement;
    if (p.theme === 'light' || p.theme === 'dark') d.dataset.theme = p.theme;
    if (p.contrast === 'more') d.dataset.contrast = 'more';
    if (p.motion === 'reduce') d.dataset.motion = 'reduce';
    if (p.locale) d.lang = p.locale;
  } catch (e) {
    /* storage unavailable: defaults apply */
  }
})();

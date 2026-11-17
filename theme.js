// Apply saved theme before first paint.
(function () {
  var t; try { t = localStorage.getItem('depot-theme'); } catch (e) {}
  if (!t || t === 'system') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
})();

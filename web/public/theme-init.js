// Apply the saved theme before styles and React load to avoid a light flash.
(function () {
  var saved;
  try { saved = localStorage.getItem('photowall-theme'); } catch (_) {}
  var dark = saved === 'dark' || (saved !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#141b19' : '#f8f7f2';
})();

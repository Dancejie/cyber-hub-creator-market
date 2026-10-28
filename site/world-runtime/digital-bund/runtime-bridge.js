// Adapt the existing runtime to the Hub's source-checked message protocol.
// Keep the generated Three.js bundle unchanged.
(() => {
  if (window.parent === window) return;
  const loadingScreen = document.getElementById('loading-screen');
  const returnButton = document.getElementById('return-hub');
  let ready = false;

  function post(type) {
    window.parent.postMessage({ source: 'world-runtime', type, worldId: 'digital-bund' }, window.location.origin);
  }

  function checkReady() {
    if (ready || !loadingScreen?.classList.contains('is-complete')) return;
    ready = true;
    post('WORLD_READY');
    observer.disconnect();
  }

  const observer = new MutationObserver(checkReady);
  if (loadingScreen) observer.observe(loadingScreen, { attributes: true, attributeFilter: ['class'] });
  checkReady();
  returnButton?.addEventListener('click', () => post('WORLD_EXIT'));
})();

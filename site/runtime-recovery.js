// Recovery UI for a world whose embedded runtime has not become visible.
// This stays outside the compiled Hub bundle and does not change its routing.
(() => {
  const root = document.getElementById('root');
  if (!root) return;

  const DELAY_MS = 15000;
  const RUNTIME_VERSION = '20261028-1';
  let frame = null;
  let frameSrc = '';
  let timeout = 0;
  let recovery = null;

  function dismiss() {
    clearTimeout(timeout);
    timeout = 0;
    recovery?.remove();
    recovery = null;
  }

  function runtimeUrl(candidate) {
    if (!candidate) return null;
    try {
      const url = new URL(candidate.getAttribute('src'), location.href);
      return url.origin === location.origin && url.pathname === '/world-runtime/digital-bund/index.html' ? url : null;
    } catch {
      return null;
    }
  }

  function visible(candidate) {
    return candidate?.isConnected && getComputedStyle(candidate).opacity === '1';
  }

  function showRecovery(expectedFrame) {
    const url = runtimeUrl(expectedFrame);
    if (frame !== expectedFrame || !url || visible(expectedFrame) || recovery) return;

    recovery = document.createElement('section');
    recovery.className = 'runtime-recovery';
    recovery.setAttribute('role', 'status');
    recovery.setAttribute('aria-label', '世界加载选项');

    const heading = document.createElement('strong');
    heading.textContent = '这个世界加载较慢';
    const text = document.createElement('p');
    text.textContent = '可以独立打开，继续体验。';
    const actions = document.createElement('div');
    actions.className = 'runtime-recovery__actions';
    const direct = document.createElement('a');
    direct.className = 'runtime-recovery__direct';
    direct.href = url.href;
    direct.textContent = '独立打开世界 ↗';
    const back = document.createElement('a');
    back.href = '/worlds';
    back.textContent = '返回世界列表';
    actions.append(direct, back);
    recovery.append(heading, text, actions);
    document.body.append(recovery);
  }

  function reconcile() {
    const next = root.querySelector('iframe[src]');
    const nextUrl = runtimeUrl(next);
    // The compiled registry retains an old version: refresh only this runtime's
    // HTML so existing visitors receive its mobile layout and protocol bridge.
    if (nextUrl && nextUrl.searchParams.get('v') !== RUNTIME_VERSION) {
      nextUrl.searchParams.set('v', RUNTIME_VERSION);
      next.setAttribute('src', nextUrl.href);
    }
    const nextSrc = next?.getAttribute('src') || '';
    if (next !== frame || nextSrc !== frameSrc) {
      dismiss();
      frame?.removeEventListener('transitionend', reconcile);
      frame = next;
      frameSrc = nextSrc;
      frame?.addEventListener('transitionend', reconcile);
      if (runtimeUrl(frame) && !visible(frame)) {
        const expectedFrame = frame;
        timeout = window.setTimeout(() => showRecovery(expectedFrame), DELAY_MS);
      }
    } else if (visible(frame)) {
      dismiss();
    }
  }

  const observer = new MutationObserver(reconcile);
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'class'] });
  reconcile();
})();

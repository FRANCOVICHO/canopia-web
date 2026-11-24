/* A confirmed account action becomes Canopia's full-screen welcome. */
(() => {
  const originals = new WeakMap();
  let activeMoment = null;
  const check = '<svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><path d="M22 51 41 70 79 30" pathLength="1"/></svg>';

  function reset(button) {
    const original = originals.get(button);
    if (!original) return;
    button.innerHTML = original;
    button.removeAttribute('aria-busy');
    button.classList.remove('account-is-loading');
    originals.delete(button);
  }

  function pending(button, mode) {
    if (!originals.has(button)) originals.set(button, button.innerHTML);
    button.setAttribute('aria-busy', 'true');
    button.classList.add('account-is-loading');
    button.innerHTML = `<span class="account-spinner" aria-hidden="true"></span><span>${mode === 'register' ? 'Creando tu cuenta' : 'Verificando tus datos'}</span>`;
  }

  async function success(button, reveal, mode) {
    if (activeMoment) return activeMoment;
    activeMoment = play(button, reveal, mode);
    try { await activeMoment; } finally { activeMoment = null; }
  }

  async function play(button, reveal, mode) {
    if (!button.getClientRects().length || !document.querySelector('#auth-panel.is-open')) {
      reveal();
      reset(button);
      return;
    }
    const rect = button.getBoundingClientRect();
    const origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const layer = document.createElement('div');
    layer.className = 'account-moment';
    layer.setAttribute('role', 'status');
    layer.setAttribute('aria-live', 'polite');
    layer.innerHTML = `<div class="account-moment-ink"></div><div class="account-moment-check">${check}</div><div class="account-moment-content"><p>${mode === 'register' ? 'Ya tenés tu lugar.' : 'Qué bueno verte.'}</p><span>${mode === 'register' ? 'Tu cuenta Canopia está lista.' : 'Ya estás en tu Canopia.'}</span></div>`;
    document.body.append(layer);
    const ink = layer.querySelector('.account-moment-ink');
    const content = layer.querySelector('.account-moment-content');
    const mark = layer.querySelector('.account-moment-check');
    const originalVisibility = button.style.visibility;
    const animations = [];
    let revealed = false;
    let skipped = false;
    function showAccount() {
      if (revealed) return;
      revealed = true;
      reveal();
      const heading = document.querySelector('#auth-view-profile:not([hidden]) .auth-dialog-head, #auth-view-courier:not([hidden]) h2');
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    }
    function skip(event) {
      if (event.key !== 'Escape') return;
      skipped = true;
      animations.forEach(animation => animation.cancel());
    }
    const animate = async (element, frames, options) => {
      if (skipped) return;
      const animation = element.animate(frames, { fill: 'forwards', ...options });
      animations.push(animation);
      await animation.finished.catch(() => {});
    };
    document.addEventListener('keydown', skip, true);
    try {
      if (!layer.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        layer.classList.add('is-reduced');
        showAccount();
        if (layer.animate) await animate(layer, [{ opacity: 1 }, { opacity: 0 }], { duration: 180, delay: 320 });
        return;
      }
      // A real circular layer scales on the compositor throughout the journey.
      // Its radius reaches the furthest viewport corner from the submit button.
      const radius = Math.ceil(Math.hypot(
        Math.max(origin.x, innerWidth - origin.x),
        Math.max(origin.y, innerHeight - origin.y),
      )) + 2;
      const center = { x: innerWidth / 2, y: innerHeight * .43 };
      const circlePose = (x, y, scale) => `translate3d(${x - radius}px, ${y - radius}px, 0) scale(${scale})`;
      const checkPose = (x, y, scale) => `translate3d(${x - 80}px, ${y - 80}px, 0) scale(${scale})`;
      const smallScale = Math.min(rect.height / 2, 28) / radius;
      const easing = 'cubic-bezier(.4,0,.2,1)';
      ink.style.width = `${radius * 2}px`;
      ink.style.height = `${radius * 2}px`;
      ink.style.transform = circlePose(origin.x, origin.y, smallScale);
      content.style.opacity = '0';
      mark.style.transform = checkPose(origin.x, origin.y, .2);
      await Promise.all([
        animate(button, [{ opacity: 1 }, { opacity: 0 }], { duration: 140 }),
        animate(ink, [
          { transform: circlePose(origin.x, origin.y, smallScale) },
          { transform: circlePose(origin.x, origin.y, 1) },
        ], { duration: 720, easing }),
        animate(mark, [
          { transform: checkPose(origin.x, origin.y, .2) },
          { transform: checkPose(center.x, center.y, 1) },
        ], { duration: 720, easing }),
        animate(mark.querySelector('path'), [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 320, easing: 'cubic-bezier(.4,0,.2,1)' }),
        animate(content, [{ opacity: 0, transform: 'translate3d(0,8px,0)' }, { opacity: 1, transform: 'translate3d(0,0,0)' }], { duration: 280, delay: 400, easing: 'cubic-bezier(.16,1,.3,1)' }),
      ]);
      showAccount();
      const target = document.querySelector('#open-auth').getBoundingClientRect();
      const x = target.left + target.width / 2;
      const y = target.top + target.height / 2;
      await Promise.all([
        animate(content, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, delay: 140 }),
        animate(ink, [
          { transform: circlePose(origin.x, origin.y, 1) },
          { transform: circlePose(x, y, .5 / radius) },
        ], { duration: 540, delay: 140, easing }),
        animate(mark, [
          { transform: checkPose(center.x, center.y, 1) },
          { transform: checkPose(x, y, .14) },
        ], { duration: 540, delay: 140, easing }),
        animate(mark, [{ opacity: 1 }, { opacity: 0 }], { duration: 120, delay: 560 }),
      ]);
    } catch (error) {
      console.warn('Canopia: no se pudo completar la animación de bienvenida.', error);
    } finally {
      try { showAccount(); } finally {
        document.removeEventListener('keydown', skip, true);
        animations.forEach(animation => animation.cancel());
        layer.remove();
        button.style.visibility = originalVisibility;
        button.classList.remove('account-is-confirmed');
        reset(button);
      }
    }
  }
  window.CanopiaAccountMoment = { pending, reset, success };
})();

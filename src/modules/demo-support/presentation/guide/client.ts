import { GUIDE_STORAGE_KEY, readGuideState, type GuideState, type GuideStore } from './state';
import { guideStepIndex, guideSteps } from './steps';

export function initDemoAssistant(): void {
  const root = document.querySelector<HTMLElement>('[data-demo-assistant]');
  // Las fichas comerciales embeben tiendas: la guía no interrumpe su preview.
  if (!root || window.self !== window.top) return;
  const fallback = JSON.parse(root.dataset['guideStore'] ?? '{}') as GuideStore;
  let stored: string | null = null;
  try { stored = sessionStorage.getItem(GUIDE_STORAGE_KEY); } catch { /* Pestaña sin almacenamiento. */ }
  let state: GuideState = readGuideState(stored, fallback);
  if (root.dataset['guideInStore'] === 'true') state.store = fallback;
  if (new URLSearchParams(location.search).get('tour') === '1') {
    state.status = 'active';
    // Consumir la entrada explícita evita reabrir una guía cerrada al recargar.
    const url = new URL(location.href);
    url.searchParams.delete('tour');
    history.replaceState(history.state, '', url);
  }
  const find = <T extends HTMLElement>(selector: string): T => root.querySelector<T>(selector)!;
  const card = find<HTMLElement>('[data-guide-card]');
  const launcher = find<HTMLButtonElement>('[data-guide-launch]');
  const next = find<HTMLAnchorElement>('[data-guide-next]');
  const finish = find<HTMLButtonElement>('[data-guide-finish]');
  const steps = guideSteps(state.store);
  const index = guideStepIndex(location.pathname, state.store);
  const step = steps[index]!;
  const isLogin = location.pathname === '/demo/admin/login';
  const isThanks = location.pathname === state.store.thanks;
  const isExtra = location.pathname.startsWith('/demo/admin/') && index === 4 && !isLogin;
  let highlighted: HTMLElement | null = null;
  let highlightTimer: number | undefined;

  // Usar enlaces que ya existen en pantalla: nunca inventar un pedido de fixture.
  const orderLink = document.querySelector<HTMLAnchorElement>('a[href^="/demo/admin/pedidos/"]');
  if (orderLink) state.orderHref = orderLink.pathname;
  if (index === 5) state.orderHref = location.pathname;
  if (state.orderHref) steps[5]!.href = state.orderHref;
  // En una ficha elegida por el visitante, «Producto» vuelve a esa misma ficha.
  if (index === 1) steps[1]!.href = location.pathname;

  const save = () => {
    try { sessionStorage.setItem(GUIDE_STORAGE_KEY, JSON.stringify(state)); } catch { /* La guía sigue en memoria. */ }
  };
  const clearHighlight = () => {
    highlighted?.classList.remove('demo-guide-highlight');
    highlighted = null;
    window.clearTimeout(highlightTimer);
  };
  const updateHeight = () => {
    const height = (card.hidden ? launcher : card).getBoundingClientRect().height + 24;
    document.documentElement.style.setProperty('--demo-guide-height', `${height}px`);
  };
  const focusLauncher = () => launcher.focus({ preventScroll: true });
  const render = (focus = false) => {
    clearHighlight();
    const open = state.status === 'active';
    card.hidden = !open;
    launcher.hidden = open;
    launcher.setAttribute('aria-expanded', String(open));
    document.documentElement.classList.add('demo-guide-available');
    document.documentElement.classList.toggle('demo-guide-visible', open);
    find('[data-guide-launch-label]').textContent = state.status === 'minimized' ? 'Reanudar guía' : state.status === 'complete' ? 'Recorrido completado · abrir guía' : 'Guía de la demo';
    find('[data-guide-progress]').textContent = `Paso ${index + 1} de ${steps.length} · ${step.label}`;
    find('[data-guide-title]').textContent = isLogin ? 'Entra al gestor de ejemplo' : isThanks ? 'Tu prueba termina aquí; el comercio continúa' : isExtra ? 'Más herramientas para la operación' : step.title;
    find('[data-guide-description]').textContent = isLogin
      ? 'Este acceso sirve para conocer el panel. Usa la contraseña «demo» que aparece en la pantalla. Después seguiré contigo dentro del gestor.'
      : isThanks ? 'La confirmación pertenece solo a este navegador. No ha creado un pedido, descontado stock ni enviado un email. El panel que veremos ahora usa otros datos ficticios.'
      : isExtra ? 'Esta pantalla muestra ejemplos de un módulo operativo. En un proyecto real, el panel solo presenta las herramientas que necesita el comercio.' : step.description;
    find('[data-guide-task]').textContent = isLogin ? 'Escribe «demo» y pulsa «Entrar al panel». La guía no introduce ni envía contraseñas por ti.' : isExtra ? 'Puedes explorar esta vista o volver al recorrido de pedidos.' : step.task;
    const last = index === steps.length - 1;
    next.hidden = last;
    finish.hidden = !last;
    if (!last) {
      next.href = steps[index + 1]!.href;
      next.textContent = index === 3 ? 'Ver el gestor →' : `Ver ${steps[index + 1]!.label.toLowerCase()} →`;
      if (isLogin) { next.href = '/demo/admin'; next.textContent = 'Volver a intentar acceso →'; }
      if (isExtra) { next.href = '/demo/admin'; next.textContent = 'Ver pedidos →'; }
      if (index === 4 && !isLogin && !isExtra && !orderLink) {
        next.href = steps[6]!.href; next.textContent = 'Ver envíos →';
      }
    }
    const nav = find('[data-guide-steps]');
    nav.replaceChildren(...steps.map((item, position) => {
      const link = document.createElement('a');
      link.href = item.href;
      link.textContent = `${position + 1}. ${item.label}`;
      if (position === index) link.setAttribute('aria-current', 'step');
      return link;
    }));
    save();
    updateHeight();
    if (focus && open) find<HTMLButtonElement>('[data-guide-minimize]').focus({ preventScroll: true });
  };
  const setStatus = (status: GuideState['status']) => { state.status = status; render(); focusLauncher(); };
  launcher.addEventListener('click', () => { state.status = 'active'; render(true); });
  find('[data-guide-minimize]').addEventListener('click', () => setStatus('minimized'));
  find('[data-guide-close]').addEventListener('click', () => setStatus('closed'));
  find('[data-guide-finish]').addEventListener('click', () => setStatus('complete'));
  find('[data-guide-restart]').addEventListener('click', () => {
    state.status = 'active'; save(); location.assign(state.store.catalog);
  });
  find('[data-guide-show]').addEventListener('click', () => {
    clearHighlight();
    const selector = isLogin ? 'form' : isThanks || isExtra ? '[data-guide-surface]' : index === 0 ? `a[href="${state.store.product}"]` : step.target;
    const candidates = document.querySelectorAll<HTMLElement>(selector);
    highlighted = [...candidates].find((el) => el.getBoundingClientRect().height > 0)
      ?? document.querySelector<HTMLElement>('[data-guide-surface]');
    highlighted?.classList.add('demo-guide-highlight');
    highlighted?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    // En móvil se recoge para dejar visible la zona señalada.
    if (matchMedia('(max-width: 639px)').matches) {
      state.status = 'minimized'; save(); card.hidden = true; launcher.hidden = false;
      launcher.setAttribute('aria-expanded', 'false');
      find('[data-guide-launch-label]').textContent = 'Reanudar guía';
      document.documentElement.classList.remove('demo-guide-visible');
      updateHeight(); focusLauncher();
    }
    highlightTimer = window.setTimeout(clearHighlight, 4000);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.status === 'active' && !document.querySelector('dialog[open]')) {
      setStatus('minimized');
    }
  });
  new ResizeObserver(updateHeight).observe(card);
  window.addEventListener('pageshow', () => {
    // El historial puede restaurar una tarjeta desde la caché del navegador.
    try { state.status = readGuideState(sessionStorage.getItem(GUIDE_STORAGE_KEY), fallback).status; } catch { /* Sin persistencia. */ }
    render();
  });
  render();
}

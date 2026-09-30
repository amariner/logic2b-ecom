import { GUIDE_STORAGE_KEY, readGuideState, type GuideState, type GuideStore } from './state';
import { guideStepIndex, guideSteps } from './steps';
import { GUIDE_CUSTOMER, guideCartWithSample } from './cart';
import { addToCart, readCart } from '../../../../lib/cart-client';
import { DEMO_POSTAL_STORAGE_KEY } from '../../../../lib/demo-commerce';
import { demoAdminEntryHref } from '../../../../shared-kernel/demo-guide-routes';

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
  const isExtra = location.pathname.startsWith('/demo/admin/') && step.id === 'orders' && !isLogin;
  let highlighted: HTMLElement | null = null;
  let highlightTimer: number | undefined;

  // Usar enlaces que ya existen en pantalla: nunca inventar un pedido de fixture.
  const orderLink = document.querySelector<HTMLAnchorElement>('a[href^="/demo/admin/pedidos/"]');
  if (orderLink) state.orderHref = orderLink.pathname;
  if (step.id === 'order') state.orderHref = location.pathname;
  if (state.orderHref) steps.find((item) => item.id === 'order')!.href = state.orderHref;
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
  const hrefFor = (path: string) => path.startsWith('/demo/admin') ? demoAdminEntryHref(path) : path;
  const feedback = (message: string) => {
    const element = find('[data-guide-feedback]');
    element.textContent = message; element.hidden = false;
  };
  const prepareCart = (addSelected = false) => {
    const slug = root.dataset['guideProduct'];
    if (!slug) throw new Error('No hay un producto de ejemplo disponible.');
    const lines = readCart();
    if ((addSelected || lines.length === 0) && guideCartWithSample(lines, slug).length !== lines.length) addToCart(slug);
    if (!localStorage.getItem(DEMO_POSTAL_STORAGE_KEY)?.trim()) {
      localStorage.setItem(DEMO_POSTAL_STORAGE_KEY, GUIDE_CUSTOMER.postal_code);
    }
  };
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
    find('[data-guide-title]').textContent = isLogin ? 'Entra directamente al gestor de ejemplo' : isExtra ? 'Más herramientas para la operación' : step.title;
    find('[data-guide-description]').textContent = isLogin
      ? 'La guía puede abrir el panel ficticio sin pedir contraseña. Entra desde el botón de avance para continuar el recorrido de solo lectura.'
      : isExtra ? 'Esta pantalla muestra ejemplos de un módulo operativo. En un proyecto real, el panel solo presenta las herramientas que necesita el comercio.' : step.description;
    find('[data-guide-task]').textContent = isLogin ? 'Pulsa «Entrar al gestor». Solo este entorno público de demostración permite el acceso directo.' : isExtra ? 'Puedes explorar esta vista o volver al recorrido de pedidos.' : step.task;
    const adminLink = find<HTMLAnchorElement>('[data-guide-admin]');
    adminLink.href = demoAdminEntryHref();
    adminLink.hidden = location.pathname.startsWith('/demo/admin');
    const last = index === steps.length - 1;
    next.hidden = last;
    finish.hidden = !last;
    if (!last) {
      next.href = hrefFor(steps[index + 1]!.href);
      next.textContent = step.id === 'product' ? 'Añadir y ver carrito →' : step.id === 'checkout' ? 'Simular compra de ejemplo →' : isThanks ? 'Entrar al gestor →' : `Ver ${steps[index + 1]!.label.toLowerCase()} →`;
      if (isLogin) { next.href = demoAdminEntryHref(); next.textContent = 'Entrar al gestor →'; }
      if (isExtra) { next.href = demoAdminEntryHref(); next.textContent = 'Ver pedidos →'; }
      if (step.id === 'orders' && !isLogin && !isExtra && !orderLink) {
        next.href = demoAdminEntryHref(steps.find((item) => item.id === 'shipping')!.href); next.textContent = 'Ver envíos →';
      }
    }
    const nav = find('[data-guide-steps]');
    nav.replaceChildren(...steps.map((item, position) => {
      const link = document.createElement('a');
      link.href = hrefFor(item.href);
      link.textContent = `${position + 1}. ${item.label}`;
      if (position === index) link.setAttribute('aria-current', 'step');
      return link;
    }));
    save();
    updateHeight();
    if (focus && open) find<HTMLButtonElement>('[data-guide-minimize]').focus({ preventScroll: true });
  };
  const setStatus = (status: GuideState['status']) => { state.status = status; render(); focusLauncher(); };
  root.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
    if (!link || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const destination = new URL(link.href).pathname;
    if (destination === state.store.cart || destination === state.store.checkout) {
      try { prepareCart(step.id === 'product' && destination === state.store.cart); } catch {
        event.preventDefault();
        feedback('No se ha podido preparar la cesta en este navegador. Puedes ir directamente al gestor de ejemplo.');
      }
    }
    if (link === next && step.id === 'checkout') {
      event.preventDefault();
      const form = document.querySelector<HTMLFormElement>('[data-checkout-form]');
      if (!form) { feedback('Puedes continuar directamente al gestor de ejemplo.'); return; }
      for (const [name, value] of Object.entries(GUIDE_CUSTOMER)) {
        const input = form.elements.namedItem(name);
        if (input instanceof HTMLInputElement && !input.value.trim()) input.value = value;
      }
      form.querySelector<HTMLInputElement>('[name="postal_code"]')?.dispatchEvent(new Event('input', { bubbles: true }));
      const submit = form.querySelector<HTMLButtonElement>('[data-checkout-submit]');
      if (!submit?.disabled) { save(); form.requestSubmit(); }
      const error = form.querySelector<HTMLElement>('[data-checkout-error]');
      if (error && !error.classList.contains('hidden')) feedback('Revisa la cesta o pulsa «Ir directamente al gestor» para seguir la demo.');
    }
  });
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

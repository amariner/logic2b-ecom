import { describe, expect, it, vi } from 'vitest';
import {
  captureAndCleanPasswordlessFragment,
  createPasswordlessConfirmationController,
  parsePasswordlessFragment,
  safeCustomerAccountRedirect,
  type PasswordlessConfirmationState,
} from '../src/modules/customers/presentation/customer-passwordless-confirm';

const CHALLENGE = 'auth_challenge:browser-1';
const PROOF = 'A'.repeat(43);
const CSRF = 'B'.repeat(43);
const ENCODED_CHALLENGE = encodeURIComponent(CHALLENGE);
const FRAGMENT = `#challenge=${ENCODED_CHALLENGE}&proof=${PROOF}`;

describe('confirmación passwordless en navegador', () => {
  it('acepta únicamente el fragmento canónico exacto', () => {
    expect(parsePasswordlessFragment(FRAGMENT)).toEqual({ challenge: CHALLENGE, proof: PROOF });

    for (const invalid of [
      '',
      FRAGMENT.slice(1),
      `${FRAGMENT}&extra=1`,
      `${FRAGMENT}&proof=${PROOF}`,
      `#proof=${PROOF}&challenge=${ENCODED_CHALLENGE}`,
      `#challenge=${CHALLENGE}&proof=${PROOF}`,
      `#challenge=${ENCODED_CHALLENGE.replace('%3A', '%3a')}&proof=${PROOF}`,
      `#challenge=${encodeURIComponent(ENCODED_CHALLENGE)}&proof=${PROOF}`,
      `#challenge=${ENCODED_CHALLENGE}&proof=${PROOF}=`,
      `#challenge=${ENCODED_CHALLENGE}&proof=${'A'.repeat(42)}`,
      `#challenge=${encodeURIComponent('auth_challenge:' + 'a'.repeat(180))}&proof=${PROOF}`,
    ]) {
      expect(parsePasswordlessFragment(invalid), invalid).toBeNull();
    }
  });

  it('limpia siempre la URL antes de preparar UI o red', async () => {
    const events: string[] = [];
    const credential = captureAndCleanPasswordlessFragment(FRAGMENT, (path) => {
      events.push(`clean:${path}`);
    });
    const controller = createPasswordlessConfirmationController({
      credential,
      csrfToken: CSRF,
      post: async () => {
        events.push('post');
        return '/cuenta/sesiones';
      },
      navigate: (path) => events.push(`navigate:${path}`),
      render: (state) => events.push(`render:${state}`),
    });

    expect(events).toEqual([
      'clean:/cuenta/acceso/confirmar',
      'render:ready',
    ]);
    await controller.confirm();
    expect(events).toEqual([
      'clean:/cuenta/acceso/confirmar',
      'render:ready',
      'render:submitting',
      'post',
      'render:complete',
      'navigate:/cuenta/sesiones',
    ]);
  });

  it('limpia también fragments ausentes o manipulados', () => {
    for (const fragment of ['', '#proof=nope', '#challenge=x&proof=y']) {
      const replaceState = vi.fn();
      expect(captureAndCleanPasswordlessFragment(fragment, replaceState)).toBeNull();
      expect(replaceState).toHaveBeenCalledOnce();
      expect(replaceState).toHaveBeenCalledWith('/cuenta/acceso/confirmar');
    }
  });

  it('solo envía tras confirmación explícita y como máximo una vez', async () => {
    const post = vi.fn(async () => '/cuenta/sesiones');
    const navigate = vi.fn();
    const states: PasswordlessConfirmationState[] = [];
    const controller = createPasswordlessConfirmationController({
      credential: parsePasswordlessFragment(FRAGMENT),
      csrfToken: CSRF,
      post,
      navigate,
      render: (state) => states.push(state),
    });

    expect(post).not.toHaveBeenCalled();
    expect(states).toEqual(['ready']);
    await expect(controller.confirm()).resolves.toBe(true);
    await expect(controller.confirm()).resolves.toBe(false);
    expect(post).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledWith({ challenge: CHALLENGE, proof: PROOF, csrfToken: CSRF });
    expect(navigate).toHaveBeenCalledOnce();
  });

  it('no envía con proof, challenge o CSRF inválidos y no reintenta un fallo', async () => {
    for (const input of [
      { credential: null, csrfToken: CSRF },
      { credential: parsePasswordlessFragment(FRAGMENT), csrfToken: 'nope' },
    ]) {
      const post = vi.fn(async () => '/cuenta/sesiones');
      const states: PasswordlessConfirmationState[] = [];
      const controller = createPasswordlessConfirmationController({
        ...input,
        post,
        navigate: vi.fn(),
        render: (state) => states.push(state),
      });
      await expect(controller.confirm()).resolves.toBe(false);
      expect(post).not.toHaveBeenCalled();
      expect(states).toEqual(['invalid']);
    }

    const failedPost = vi.fn(async () => null);
    const failedController = createPasswordlessConfirmationController({
      credential: parsePasswordlessFragment(FRAGMENT),
      csrfToken: CSRF,
      post: failedPost,
      navigate: vi.fn(),
      render: vi.fn(),
    });
    await expect(failedController.confirm()).resolves.toBe(false);
    await expect(failedController.confirm()).resolves.toBe(false);
    expect(failedPost).toHaveBeenCalledOnce();
  });

  it('solo acepta redirecciones limpias de la allowlist y del origen esperado', () => {
    const origin = 'https://shop.example';
    expect(safeCustomerAccountRedirect('https://shop.example/cuenta/sesiones', origin))
      .toBe('/cuenta/sesiones');
    expect(safeCustomerAccountRedirect('/cuenta/acceso', origin)).toBe('/cuenta/acceso');

    for (const unsafe of [
      'https://evil.example/cuenta/sesiones',
      '//evil.example/cuenta/sesiones',
      '/cuenta/sesiones?token=nope',
      '/cuenta/sesiones#proof=nope',
      '/demo/admin',
    ]) {
      expect(safeCustomerAccountRedirect(unsafe, origin), unsafe).toBeNull();
    }
  });
});

import { CUSTOMER_ACCOUNT_ROUTES } from './customer-account-http';

const CHALLENGE_PATTERN = /^[a-z][a-z0-9]*(?:[_:-][a-z0-9]+)+$/u;
const TOKEN_256_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const EXACT_FRAGMENT_PATTERN = /^#challenge=([^&]+)&proof=([A-Za-z0-9_-]{43})$/u;
const MAX_CHALLENGE_LENGTH = 180;
const MAX_FRAGMENT_LENGTH = 512;
const CLEAN_CONFIRMATION_PATH = CUSTOMER_ACCOUNT_ROUTES.confirmAccess;
const ALLOWED_REDIRECT_PATHS = new Set<string>([
  CUSTOMER_ACCOUNT_ROUTES.access,
  CUSTOMER_ACCOUNT_ROUTES.sessions,
]);

export type PasswordlessBrowserCredential = Readonly<{
  challenge: string;
  proof: string;
}>;

export type PasswordlessConfirmationPayload = PasswordlessBrowserCredential & Readonly<{
  csrfToken: string;
}>;

export type PasswordlessConfirmationState = 'invalid' | 'ready' | 'submitting' | 'failed' | 'complete';

export function parsePasswordlessFragment(fragment: string): PasswordlessBrowserCredential | null {
  if (fragment.length > MAX_FRAGMENT_LENGTH) return null;
  const match = EXACT_FRAGMENT_PATTERN.exec(fragment);
  if (match === null) return null;
  const encodedChallenge = match[1];
  const proof = match[2];
  if (encodedChallenge === undefined || proof === undefined) return null;
  let challenge: string;
  try {
    challenge = decodeURIComponent(encodedChallenge);
  } catch {
    return null;
  }
  if (encodeURIComponent(challenge) !== encodedChallenge || challenge.length > MAX_CHALLENGE_LENGTH ||
      !CHALLENGE_PATTERN.test(challenge) || !TOKEN_256_PATTERN.test(proof)) {
    return null;
  }
  return Object.freeze({ challenge, proof });
}

/**
 * Captura el fragmento y limpia la URL incluso si su forma es inválida. El
 * callback se ejecuta en `finally` para que ninguna interacción de UI ni red
 * pueda suceder antes de `history.replaceState`.
 */
export function captureAndCleanPasswordlessFragment(
  fragment: string,
  replaceState: (cleanPath: string) => void,
): PasswordlessBrowserCredential | null {
  try {
    return parsePasswordlessFragment(fragment);
  } finally {
    replaceState(CLEAN_CONFIRMATION_PATH);
  }
}

export function safeCustomerAccountRedirect(value: string, expectedOrigin: string): string | null {
  try {
    const url = new URL(value, expectedOrigin);
    if (url.origin !== expectedOrigin || url.username !== '' || url.password !== '' ||
        url.search !== '' || url.hash !== '' || !ALLOWED_REDIRECT_PATHS.has(url.pathname)) {
      return null;
    }
    return url.pathname;
  } catch {
    return null;
  }
}

export function createPasswordlessConfirmationController(input: Readonly<{
  credential: PasswordlessBrowserCredential | null;
  csrfToken: string;
  post: (payload: PasswordlessConfirmationPayload) => Promise<string | null>;
  navigate: (path: string) => void;
  render: (state: PasswordlessConfirmationState) => void;
}>): Readonly<{ confirm: () => Promise<boolean> }> {
  let credential = input.credential;
  let csrfToken: string | null = TOKEN_256_PATTERN.test(input.csrfToken) ? input.csrfToken : null;
  let submitted = false;

  input.render(credential !== null && csrfToken !== null ? 'ready' : 'invalid');

  return Object.freeze({
    async confirm(): Promise<boolean> {
      if (submitted || credential === null || csrfToken === null) return false;
      submitted = true;
      input.render('submitting');

      const payload: PasswordlessConfirmationPayload = Object.freeze({
        challenge: credential.challenge,
        proof: credential.proof,
        csrfToken,
      });
      credential = null;
      csrfToken = null;

      try {
        const redirectPath = await input.post(payload);
        if (redirectPath === null) {
          input.render('failed');
          return false;
        }
        input.render('complete');
        input.navigate(redirectPath);
        return true;
      } catch {
        input.render('failed');
        return false;
      }
    },
  });
}

async function postConfirmation(payload: PasswordlessConfirmationPayload): Promise<string | null> {
  const response = await fetch(CUSTOMER_ACCOUNT_ROUTES.confirmAccess, {
    method: 'POST',
    headers: {
      accept: 'text/html',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'follow',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok || !response.redirected) return null;
  return safeCustomerAccountRedirect(response.url, window.location.origin);
}

export function initialisePasswordlessConfirmation(): void {
  const credential = captureAndCleanPasswordlessFragment(
    window.location.hash,
    (cleanPath) => window.history.replaceState(null, '', cleanPath),
  );

  // No acceso al DOM antes de limpiar el fragmento.
  const root = document.querySelector<HTMLElement>('[data-customer-auth-confirm]');
  const form = root?.querySelector<HTMLFormElement>('[data-customer-auth-confirm-form]') ?? null;
  const button = root?.querySelector<HTMLButtonElement>('[data-customer-auth-confirm-button]') ?? null;
  const status = root?.querySelector<HTMLElement>('[data-customer-auth-confirm-status]') ?? null;
  if (root === null || form === null || button === null || status === null) return;

  const csrfToken = root.dataset.customerAuthCsrf ?? '';
  root.removeAttribute('data-customer-auth-csrf');

  const render = (state: PasswordlessConfirmationState): void => {
    root.dataset.customerAuthState = state;
    button.disabled = state !== 'ready';
    status.textContent = {
      invalid: 'Este enlace no se puede confirmar. Solicita uno nuevo desde la página de acceso.',
      ready: 'El enlace está listo. Confirma solo si tú solicitaste el acceso.',
      submitting: 'Confirmando el acceso…',
      failed: 'No se ha podido confirmar. Solicita un enlace nuevo para volver a intentarlo.',
      complete: 'Acceso confirmado. Te llevamos a tu cuenta…',
    }[state];
  };

  const controller = createPasswordlessConfirmationController({
    credential,
    csrfToken,
    post: postConfirmation,
    navigate: (path) => window.location.replace(path),
    render,
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void controller.confirm();
  });
}

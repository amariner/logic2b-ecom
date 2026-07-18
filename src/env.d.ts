/// <reference types="astro/client" />

type Env = {
  DB: D1Database;
  DEMO_MODE: string;
  /** Si falta, el checkout simula el pago (demo). Con clave → Stripe real. */
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  ADMIN_COOKIE_SECRET: string;
  /** Solo producción: si falta (o DEMO_MODE=true), los emails se quedan en la outbox. */
  RESEND_API_KEY?: string;
};

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}

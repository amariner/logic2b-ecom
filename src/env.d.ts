/// <reference types="astro/client" />

type Env = {
  DB: D1Database;
  DEMO_MODE: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  ADMIN_COOKIE_SECRET: string;
};

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}

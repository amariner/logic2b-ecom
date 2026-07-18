#!/usr/bin/env bash
#
# Bootstrap del Logic2B Commerce Kit.
#
#   ./scripts/bootstrap.sh            → entorno LOCAL: deps, .dev.vars, D1 local
#                                       migrada y sembrada. Listo para `pnpm dev`.
#   ./scripts/bootstrap.sh --remote   → además, aprovisiona Cloudflare: crea la D1
#                                       remota (y fija su database_id en
#                                       wrangler.jsonc), migra, siembra, despliega
#                                       y pide los secretos de Stripe.
#
# Idempotente: se puede relanzar sin romper nada (no pisa .dev.vars ni la D1 ya creada).

set -euo pipefail
cd "$(dirname "$0")/.."

REMOTE=false
[[ "${1:-}" == "--remote" ]] && REMOTE=true

say()  { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ── Requisitos ────────────────────────────────────────────────────────────────
command -v node >/dev/null || fail "Falta Node.js (≥ 22.18): https://nodejs.org"
command -v pnpm >/dev/null || fail "Falta pnpm (≥ 10): corepack enable && corepack prepare pnpm@latest --activate"

DB_NAME=$(sed -n 's/.*"database_name": *"\([^"]*\)".*/\1/p' wrangler.jsonc | head -1)
[[ -n "$DB_NAME" ]] || fail "No encuentro database_name en wrangler.jsonc"

say "Instalando dependencias"
pnpm install

# ── .dev.vars (secretos locales, gitignored) ─────────────────────────────────
if [[ -f .dev.vars ]]; then
  say ".dev.vars ya existe — no lo toco"
else
  say "Creando .dev.vars"
  echo "Claves TEST de Stripe (dashboard.stripe.com → modo test → Developers → API keys)."
  echo "Enter para dejarlas pendientes y rellenarlas a mano después."
  read -r -p "  STRIPE_SECRET_KEY (sk_test_…): " SK || true
  read -r -p "  STRIPE_WEBHOOK_SECRET (whsec_…, lo imprime 'stripe listen'): " WHSEC || true
  ADMIN_SECRET=$( (openssl rand -hex 32 2>/dev/null) || node -e "console.log(crypto.randomUUID()+crypto.randomUUID())" )
  cat > .dev.vars <<EOF
DEMO_MODE=true
STRIPE_SECRET_KEY=${SK:-sk_test_xxx}
STRIPE_WEBHOOK_SECRET=${WHSEC:-whsec_xxx}
ADMIN_COOKIE_SECRET=${ADMIN_SECRET}
EOF
  echo "  → .dev.vars escrito"
fi

# ── D1 local: migraciones + seed ─────────────────────────────────────────────
say "D1 local: migraciones + seed ($DB_NAME)"
pnpm db:reset

say "Tests"
pnpm test

if ! $REMOTE; then
  say "Entorno local listo 🎉"
  echo "  pnpm dev      → http://localhost:4321"
  echo "  Checkout E2E  → ver README (stripe listen)"
  echo "  Cloudflare    → ./scripts/bootstrap.sh --remote"
  exit 0
fi

# ── Cloudflare: cuenta ───────────────────────────────────────────────────────
say "Cloudflare: comprobando sesión de wrangler"
pnpm exec wrangler whoami >/dev/null 2>&1 || pnpm exec wrangler login

# ── D1 remota ────────────────────────────────────────────────────────────────
if grep -q '"database_id": *"local-placeholder"' wrangler.jsonc; then
  say "Creando D1 remota '$DB_NAME'"
  pnpm exec wrangler d1 create "$DB_NAME" || true   # puede existir de un intento previo
  DB_ID=$(pnpm exec wrangler d1 info "$DB_NAME" --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).uuid))")
  [[ -n "$DB_ID" ]] || fail "No pude obtener el uuid de la D1 remota"
  node -e "const fs=require('fs');const f='wrangler.jsonc';fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('local-placeholder','$DB_ID'))"
  echo "  → database_id fijado en wrangler.jsonc: $DB_ID"
else
  say "wrangler.jsonc ya tiene database_id — no creo la D1"
fi

say "D1 remota: migraciones + seed"
pnpm exec wrangler d1 migrations apply "$DB_NAME" --remote
mkdir -p .wrangler
node seed/generate.ts > .wrangler/seed.sql
pnpm exec wrangler d1 execute "$DB_NAME" --remote --file .wrangler/seed.sql

say "Build + deploy"
pnpm deploy

say "Secretos del Worker (claves TEST en la demo; live solo en tienda real)"
for s in STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET ADMIN_COOKIE_SECRET; do
  echo "  $s:"
  pnpm exec wrangler secret put "$s"
done

say "Aprovisionado 🎉 — quedan 2 pasos manuales (ver README, 'Después del primer deploy'):"
echo "  1. Custom domain en el dashboard de Cloudflare (ecom.logic2b.com)"
echo "  2. Endpoint del webhook en Stripe → https://<dominio>/api/webhooks/stripe"
echo "     (checkout.session.completed + checkout.session.expired; su whsec va en STRIPE_WEBHOOK_SECRET)"
echo "Para una tienda de cliente real: docs/PRODUCCION.md"

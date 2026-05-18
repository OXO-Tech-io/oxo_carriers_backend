# Logging & Config Conventions

## Config — `src/config/env.ts`

All environment variables are validated at startup by Zod. Reading
`process.env.X` directly anywhere new is **discouraged** — import the typed
`env` object instead:

```ts
import { env } from '@/config/env';

const port = env.PORT;             // number, default 5000
const isProd = env.IS_PRODUCTION;  // derived boolean
const dbSsl = env.DB_SSL;          // boolean, coerced from 'true'/'false'/'1'/'0'
```

If validation fails (missing required var, bad type), the process exits at
boot with a list of issues. Defaults are baked in so dev still works without
a `.env`.

### Adding a new variable

1. Add a field to the Zod `Schema` in
   [src/config/env.ts](../src/config/env.ts).
2. Add it to `.env` and `.env.sample` with a comment explaining its purpose.
3. Read it as `env.MY_VAR` — that's it. TypeScript will pick up the new type.

Pre-existing direct `process.env.X` reads in
`src/config/database.ts`, `src/db/index.ts`, `src/middleware/keycloakAuth.ts`,
`src/services/keycloakAdmin.service.ts`, etc. still work — `env.ts` runs
`dotenv.config()` before they execute. Migrate them opportunistically.

## Logging — `src/lib/logger.ts`

Pino is the only logger. Two flavors based on `NODE_ENV`:

- **dev**: colored, multi-line pretty output via `pino-pretty`.
- **prod**: single-line JSON for log aggregators.

### App-level logs

```ts
import { logger } from '@/lib/logger';

logger.info({ userId: 42 }, 'User logged in');
logger.warn({ origin }, 'CORS: blocked origin');
logger.error({ err }, 'Failed to send email');
```

First arg is a context object (preferred), second is the message. The
context object becomes structured JSON fields in production.

### Request-scoped logs

`pino-http` is wired in [src/app.ts](../src/app.ts) and attaches a child
logger with a request ID to every request. Inside route handlers, prefer
`req.log` so the entry is correlated with the access log:

```ts
app.get('/things/:id', (req, res) => {
  req.log.info({ id: req.params.id }, 'Fetching thing');
  // ... req.log auto-includes req.id, req.method, req.url
});
```

### Log levels

- `fatal` — process is exiting.
- `error` — request failed unexpectedly; should be alertable.
- `warn` — unexpected but recoverable (CORS block, 404, soft validation fail).
- `info` — normal events (startup, login, business actions).
- `debug` — verbose dev-only output. Default in dev; off in prod.
- `trace` — very fine-grained; off by default.

Override at runtime with `LOG_LEVEL=debug pnpm dev`.

### Redaction

The logger redacts sensitive fields automatically:

- `req.headers.authorization`, `req.headers.cookie`, `req.headers["x-api-key"]`
- `res.headers["set-cookie"]`
- Any field named `password`, `token`, `access_token`, `refresh_token`
  anywhere in the log object.

If you log new sensitive data, add its path to `redact.paths` in
`src/lib/logger.ts`.

## Migrating console.* in existing controllers

Most controllers still use `console.log` / `console.error`. They'll continue
working — `console.log` goes to stdout regardless. To get structured logging
and request correlation, migrate gradually:

```ts
// before
console.log(`[UserController] Found user: ${user.email}`);
console.error('Create user error:', error);

// after
req.log.info({ email: user.email }, 'Found user');
req.log.error({ err: error }, 'Create user failed');
```

In service/model files that don't have a `req`, use the top-level `logger`:

```ts
import { logger } from '@/lib/logger';
logger.error({ err }, 'Failed to provision Keycloak user');
```

# Hybrid Routing Demo Server

Standalone Node + Hapi runtime that demonstrates progressive rollout from a legacy renderer to a NextGen React Router/Remix renderer.

## Runtime behavior

- Legacy entry page: `GET /cdp/{productCategory}/` (always legacy HTML).
- Product detail page: `GET /pdp/{productCategory}/{productName}/{productId}/` (dual-stack via `resolveRouteController`).
- Checkout page: `GET /checkout/` (always legacy HTML).
- Wildcard fallback: `GET|POST /{path*}`.

NextGen vs legacy selection is resolved by `shouldUseNextGenRouter` using:
- per-session routing state (`routingMode`),
- NextGen path allowlist (`NEXTGEN_ENABLED_ROUTES`),
- explicit fallback query (`legacy=true`).

NextGen is served through Vite in `middlewareMode` and mounted into Hapi request lifecycle.

## Demo utility endpoints

- `GET /health`
- `GET /routing-events`
- `GET /resolve/{productId}`
- `POST /session-touch`
- `POST /pdp/{productCategory}/{productName}/{productId}/`

## Session model

- State is scoped by `demoSessionId`.
- Session TTL is 60 minutes (sliding window via `lastSeenAt`).
- On expiration, defaults are restored (including feature-flag state).

## Run locally

```bash
nvm use
npm install
npm run start
```

Defaults:
- Host: `0.0.0.0`
- Port: `4001` (or `PORT`/`HAPI_RUNTIME_PORT` if provided)

## Query parameters used by the demo

- `demoSessionId`
- `legacy=true` (forces legacy fallback)
- `colorCode` (product visual variant)

Optional compatibility params still accepted by server context:
- `routingMode=nextgen|legacy`
- `simulateFailure=true|false`

## Render deployment

- Build command: `npm install`
- Start command: `npm run start`
- Uses `PORT` provided by Render.

## Note on stack choices

This repository intentionally keeps runtime controllers and routing modules in JavaScript (`.mjs`) to mirror a legacy production pattern, while NextGen app code can use TypeScript/TSX.

# Hybrid Routing Demo Server

Standalone Node server to demo progressive rollout between legacy routing and NextGen runtime.

## What it does

- Exposes `/listings/{site}/{imtId}/`.
- Decides between NextGen and legacy based on query flags.
- NextGen is served through `vite` in `middlewareMode`.
- Legacy is plain HTML served by Hapi.

## Run locally

```bash
npm install
npm run start
```

Server defaults to `http://localhost:4001`.

## Query flags

- `routingMode=nextgen|legacy`
- `simulateFailure=true|false`
- `legacy=true|false`

Example:

`http://localhost:4001/listings/demo-site/imt-8712/?routingMode=nextgen&simulateFailure=false&legacy=false`

## Render deployment

- Build command: `npm install`
- Start command: `npm run start`
- The service reads `PORT` automatically.

import Hapi from "@hapi/hapi";
import { createServer as createVite } from "vite";
import reactPlugin from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_PORT = Number(process.env.PORT ?? process.env.HAPI_RUNTIME_PORT ?? "4001");
const SERVER_HOST = process.env.HOST ?? "0.0.0.0";
const NEXTGEN_ROOT = path.resolve(__dirname, "nextgen-app");

const FRAME_ANCESTORS = process.env.FRAME_ANCESTORS ?? "'self' https://cromagnoli.github.io http://localhost:3000 http://127.0.0.1:3000";

let hapiServer;
let viteServer;

const evaluateRouting = ({ imtId, routingMode, simulateFailure, legacyQuery }) => {
  const evaluation = {
    route: "nextgen",
    reason: "nextgen-active",
    fallback: false,
    queryLegacy: legacyQuery,
    manifestInjected: true,
    singletonActive: true,
    imtId,
  };

  if (legacyQuery) {
    evaluation.route = "legacy";
    evaluation.reason = "forced-by-query";
    evaluation.manifestInjected = false;
    evaluation.singletonActive = false;
  } else if (routingMode === "legacy") {
    evaluation.route = "legacy";
    evaluation.reason = "feature-flag-off";
    evaluation.manifestInjected = false;
    evaluation.singletonActive = false;
  } else if (simulateFailure) {
    evaluation.route = "legacy";
    evaluation.reason = "nextgen-error";
    evaluation.fallback = true;
  }

  return evaluation;
};

const parseContext = (request) => ({
  imtId: String(request.params.imtId ?? "imt-unknown"),
  routingMode: request.query.routingMode === "legacy" ? "legacy" : "nextgen",
  simulateFailure: request.query.simulateFailure === "true",
  legacyQuery: request.query.legacy === "true",
});

const renderLegacyPage = (context, evaluation) => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Legacy Hapi Listing</title>
    <style>
      body { background: #020617; color: #f8fafc; font-family: "Helvetica Neue", Arial, sans-serif; padding: 32px; }
      .legacy-shell { border: 1px solid #475569; padding: 24px; border-radius: 6px; background: linear-gradient(135deg, rgba(248,113,113,0.15), #020617); }
      .legacy-shell h1 { font-size: 32px; margin-bottom: 12px; }
      .legacy-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px,1fr)); gap: 8px; margin-top: 16px; }
      .legacy-cell { background: rgba(15,23,42,.6); padding: 10px; border-radius: 4px; border: 1px solid rgba(148,163,184,.3); font-size: .85rem; }
    </style>
  </head>
  <body>
    <div class="legacy-shell">
      <h1>Legacy Hapi Listing</h1>
      <p>IMT ID: ${context.imtId}</p>
      <p>Variant ID: HAPI-LEG-02</p>
      <p>Status: ${evaluation.fallback ? "Fallback triggered" : "Static legacy page"}</p>
      <div class="legacy-grid">
        <div class="legacy-cell">Route decision: ${evaluation.route}</div>
        <div class="legacy-cell">Reason: ${evaluation.reason}</div>
        <div class="legacy-cell">Fallback: ${evaluation.fallback ? "yes" : "no"}</div>
        <div class="legacy-cell">Query legacy: ${evaluation.queryLegacy ? "yes" : "no"}</div>
      </div>
    </div>
  </body>
</html>
`;

const ensureViteServer = async () => {
  if (viteServer) {
    return viteServer;
  }

  const allowedHosts = (process.env.VITE_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);

  viteServer = await createVite({
    root: NEXTGEN_ROOT,
    appType: "custom",
    server: {
      middlewareMode: true,
      allowedHosts: allowedHosts.length ? allowedHosts : true,
    },
    plugins: [reactPlugin()],
  });

  console.log("[hybrid-demo] Vite server created (middlewareMode)");
  return viteServer;
};

const runViteMiddleware = async (request, h) => {
  const vite = await ensureViteServer();
  const rawReq = request.raw.req;
  const rawRes = request.raw.res;

  await new Promise((resolve, reject) => {
    vite.middlewares(rawReq, rawRes, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  if (rawRes.writableEnded) {
    return h.abandon;
  }

  return null;
};

const serveNextGen = async (request, h) => {
  const vite = await ensureViteServer();
  const templatePath = path.resolve(NEXTGEN_ROOT, "index.html");
  const rawTemplate = await readFile(templatePath, "utf8");
  const html = await vite.transformIndexHtml(request.path, rawTemplate);

  return h
    .response(html)
    .type("text/html")
    .header("Content-Security-Policy", `frame-ancestors ${FRAME_ANCESTORS}`)
    .header("X-Frame-Options", null);
};

const start = async () => {
  await ensureViteServer();

  hapiServer = Hapi.server({
    host: SERVER_HOST,
    port: SERVER_PORT,
    routes: {
      cors: { origin: ["*"] },
      security: {
        hsts: false,
        xframe: false
      },
    },
  });

  hapiServer.route({
    method: "GET",
    path: "/health",
    handler: () => ({ ok: true }),
  });

  hapiServer.route({
    method: "GET",
    path: "/resolve/{imtId}",
    handler: (request, h) => {
      const context = parseContext(request);
      return h.response(evaluateRouting(context)).type("application/json");
    },
  });

  hapiServer.route({
    method: ["GET", "POST"],
    path: "/listings/{site}/{imtId}/",
    handler: async (request, h) => {
      const context = parseContext(request);
      const evaluation = evaluateRouting(context);

      console.log("[hybrid-demo] incoming request", {
        path: request.path,
        method: request.method,
        query: request.query,
        decision: evaluation.route,
        reason: evaluation.reason,
      });

      if (evaluation.route === "nextgen" && !evaluation.fallback && !evaluation.queryLegacy) {
        console.log("[hybrid-demo] Serving NextGen view via Vite middleware", { imtId: context.imtId });
        return serveNextGen(request, h);
      }

      console.log("[hybrid-demo] Serving legacy Hapi HTML", {
        imtId: context.imtId,
        reason: evaluation.reason,
      });

      return h
        .response(renderLegacyPage(context, evaluation))
        .type("text/html")
        .header("Content-Security-Policy", `frame-ancestors ${FRAME_ANCESTORS}`)
        .header("X-Frame-Options", null);
    },
  });

  hapiServer.route({
    method: ["GET", "POST"],
    path: "/{path*}",
    handler: async (request, h) => {
      const result = await runViteMiddleware(request, h);
      return result ?? h.response("Not found").code(404);
    },
  });

  await hapiServer.start();
  console.log(`[hybrid-demo] running on http://${SERVER_HOST}:${SERVER_PORT}`);
};

const stop = async () => {
  if (hapiServer) {
    await hapiServer.stop();
    hapiServer = undefined;
  }
  if (viteServer) {
    await viteServer.close();
    viteServer = undefined;
  }
};

process.on("SIGTERM", async () => {
  await stop();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await stop();
  process.exit(0);
});

start().catch(async (error) => {
  console.error("[hybrid-demo] Failed to start runtime-server", error);
  await stop();
  process.exit(1);
});

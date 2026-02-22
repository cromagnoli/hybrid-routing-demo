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

const DEFAULT_PRODUCT_NAME = "White Loop Runner";
const FRAME_ANCESTORS =
  process.env.FRAME_ANCESTORS ??
  "'self' https://cromagnoli.github.io http://localhost:3000 http://127.0.0.1:3000";

let hapiServer;
let viteServer;

const productNameByProductId = new Map();
const routingStateByProductId = new Map();

let routingEventSeq = 0;
const routingEvents = [];
const MAX_ROUTING_EVENTS = 250;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const sanitizeProductName = (value) => {
  if (typeof value !== "string") {
    return DEFAULT_PRODUCT_NAME;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_PRODUCT_NAME;
  }

  return trimmed.slice(0, 80);
};

const evaluateRouting = ({ productId, routingMode, legacyQuery }) => {
  const evaluation = {
    route: "nextgen",
    reason: "nextgen-active",
    fallback: false,
    queryLegacy: legacyQuery,
    manifestInjected: true,
    singletonActive: true,
    productId,
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
  }

  return evaluation;
};

const parseContext = (request) => {
  const productId = String(request.params.productId ?? "product-unknown");
  const stored = getRoutingState(productId);

  const queryRoutingMode = resolveRoutingModeInput(request.query.routingMode);
  const querySimulateFailure = resolveBooleanInput(request.query.simulateFailure);

  return {
    productId,
    routingMode: queryRoutingMode ?? stored.routingMode,
    simulateFailure: querySimulateFailure ?? stored.simulateFailure,
    legacyQuery: request.query.legacy === "true",
  };
};

const resolvePostedProductName = (request) => {
  const payload = request.payload;

  if (!payload) {
    return DEFAULT_PRODUCT_NAME;
  }

  if (typeof payload === "object" && payload !== null) {
    return sanitizeProductName(payload.productName);
  }

  return DEFAULT_PRODUCT_NAME;
};

const getStoredProductName = (productId) =>
  productNameByProductId.get(productId) ?? DEFAULT_PRODUCT_NAME;

const setStoredProductName = (productId, productName) => {
  productNameByProductId.set(productId, sanitizeProductName(productName));
};

const getRoutingState = (productId) => {
  if (!routingStateByProductId.has(productId)) {
    routingStateByProductId.set(productId, {
      routingMode: "nextgen",
      simulateFailure: false,
    });
  }

  return routingStateByProductId.get(productId);
};

const setRoutingState = (productId, patch) => {
  const current = getRoutingState(productId);
  routingStateByProductId.set(productId, {
    ...current,
    ...patch,
  });
};

const resolveRoutingModeInput = (value) => {
  if (value === "legacy") {
    return "legacy";
  }
  if (value === "nextgen") {
    return "nextgen";
  }
  return null;
};

const resolveBooleanInput = (value) => {
  if (value === true || value === "true" || value === "1" || value == 1) {
    return true;
  }
  if (value === false || value === "false" || value === "0" || value == 0) {
    return false;
  }
  return null;
};

const appendRoutingEvent = ({ context, evaluation, method, path }) => {
  routingEventSeq += 1;
  routingEvents.push({
    id: routingEventSeq,
    at: new Date().toISOString(),
    method: String(method).toUpperCase(),
    path,
    productId: context.productId,
    route: evaluation.route,
    reason: evaluation.reason,
    fallback: evaluation.fallback,
    legacyQuery: evaluation.queryLegacy,
    routingMode: context.routingMode,
    simulateFailure: context.simulateFailure,
  });

  if (routingEvents.length > MAX_ROUTING_EVENTS) {
    routingEvents.shift();
  }
};

const renderLegacyPage = (context, evaluation) => {
  const safeProductName = escapeHtml(context.productName);

  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>BuyMeNot Sneaker Detail (Legacy)</title>
    <style>
      body {
        margin: 0;
        background: #021a2f;
        color: #f6f1c7;
        font-family: "Verdana", "Tahoma", sans-serif;
      }
      .page {
        max-width: 980px;
        margin: 18px auto;
        border: 3px ridge #95b0d7;
        background: #13355d;
        box-shadow: 0 0 0 4px #0b2440;
      }
      .topbar {
        background: linear-gradient(90deg, #264f86, #1b3562);
        border-bottom: 2px solid #8da8cf;
        padding: 8px 12px;
      }
      .logo-wrap {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .iso {
        width: 26px;
        height: 26px;
        border: 1px solid #b8cbe8;
        background: #102a4a;
        font-size: 16px;
        line-height: 26px;
        text-align: center;
        color: #e9f0ff;
        font-weight: bold;
      }
      .wordmark {
        color: #ffffff;
        letter-spacing: 0.08em;
        font-weight: bold;
        font-size: 13px;
      }
      .wordmark .cap {
        font-size: 1.25em;
      }
      .variant {
        float: right;
        color: #d4e2ff;
        font-size: 11px;
        margin-top: 7px;
      }
      .content {
        padding: 12px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        background: #0f2f55;
      }
      td {
        border: 1px solid #5e7cab;
        vertical-align: top;
        padding: 10px;
      }
      .left {
        width: 56%;
        background: #0d2a4b;
      }
      .right {
        width: 44%;
        background: #112f52;
      }
      .legacy-shoe {
        width: 100%;
        height: 260px;
        border: 1px dashed #9ab2d8;
        background: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .legacy-shoe img {
        width: 100%;
        max-height: 240px;
        object-fit: contain;
        display: block;
      }
      .title {
        margin: 0 0 6px;
        font-size: 25px;
        color: #ffffff;
      }
      .subtitle {
        margin: 0 0 12px;
        color: #d4e2ff;
        font-size: 12px;
      }
      .price {
        color: #fff3af;
        font-size: 30px;
        font-weight: bold;
      }
      .old {
        color: #b8c3d8;
        text-decoration: line-through;
        font-size: 14px;
        margin-left: 8px;
      }
      .meta {
        margin-top: 12px;
        font-size: 12px;
        line-height: 1.55;
        color: #e6efff;
      }
      .status {
        margin-top: 10px;
        padding: 8px;
        border: 1px solid #88a4cf;
        background: #123861;
        color: #f7fbff;
        font-size: 12px;
      }
      .blink {
        animation: legacy-blink 1s steps(1, end) infinite;
      }
      @keyframes legacy-blink {
        50% { opacity: 0.15; }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="topbar">
        <div class="logo-wrap">
          <div class="iso">B</div>
          <div class="wordmark"><span class="cap">B</span>uy<span class="cap">M</span>e<span class="cap">N</span>ot</div>
        </div>
        <span class="variant">Legacy Product Detail</span>
      </div>
      <div class="content">
        <table>
          <tr>
            <td class="left">
              <div class="legacy-shoe"><img src="/images/sneakers-ffffff.png" alt="BuyMeNot White Loop Runner"/></div>
            </td>
            <td class="right">
              <h1 class="title">${safeProductName}</h1>
              <p class="subtitle">Classic HTML table layout for legacy storefront.</p>
              <div>
                <span class="price">$118.00</span>
                <span class="old">$138.00</span>
              </div>
              <div class="meta">
                SKU: LEG-WHT-0065<br/>
                Size: 6.5 US<br/>
                Color: White<br/>
                Product ID: ${escapeHtml(context.productId)}
              </div>
              <div class="status">
                Route decision: ${escapeHtml(evaluation.route)}<br/>
                Reason: ${escapeHtml(evaluation.reason)}<br/>
                Fallback: ${evaluation.fallback ? "yes" : "no"}<br/>
                Query legacy: ${evaluation.queryLegacy ? "yes" : "no"}<br/>
                <span class="blink">Legacy renderer active</span>
              </div>
            </td>
          </tr>
        </table>
      </div>
    </div>
    <script>
      (function () {
        var sendSnapshot = function () {
          try {
            window.parent.postMessage(
              {
                type: "IFRAME_HTML_SNAPSHOT",
                html: document.documentElement.outerHTML,
              },
              "*"
            );
          } catch (e) {}
        };

        window.addEventListener("message", function (event) {
          if (event && event.data && event.data.type === "REQUEST_HTML_SNAPSHOT") {
            sendSnapshot();
          }
        });

        sendSnapshot();
      })();
    </script>
  </body>
</html>
`;
};

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

const injectBootstrapContext = (html, context) => {
  const bootstrapPayload = JSON.stringify({
    productName: context.productName,
    simulateFailure: context.simulateFailure,
  }).replace(
    /<\//g,
    "<\\/"
  );
  const tag = `<script>window.__PDP_CONTEXT__=${bootstrapPayload};</script>`;
  return html.includes("</body>") ? html.replace("</body>", `${tag}\n</body>`) : `${html}${tag}`;
};

const withFrameHeaders = (response) =>
  response
    .type("text/html")
    .header("Content-Security-Policy", `frame-ancestors ${FRAME_ANCESTORS}`)
    .header("X-Frame-Options", null);

const serveNextGen = async (request, h, context) => {
  const vite = await ensureViteServer();
  const templatePath = path.resolve(NEXTGEN_ROOT, "index.html");
  const rawTemplate = await readFile(templatePath, "utf8");
  const transformedHtml = await vite.transformIndexHtml(request.path, rawTemplate);
  const html = injectBootstrapContext(transformedHtml, context);

  return withFrameHeaders(h.response(html));
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
        xframe: false,
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
    path: "/routing-events",
    handler: (request, h) => {
      const after = Number(request.query.after ?? "0");
      const events = Number.isFinite(after) && after > 0
        ? routingEvents.filter((event) => event.id > after)
        : routingEvents;

      return h.response({
        events,
        latestId: routingEvents.length ? routingEvents[routingEvents.length - 1].id : 0,
      }).type("application/json");
    },
  });

  hapiServer.route({
    method: "GET",
    path: "/resolve/{productId}",
    handler: (request, h) => {
      const context = parseContext(request);
      return h
        .response({
          ...evaluateRouting(context),
          productName: getStoredProductName(context.productId),
          routingMode: context.routingMode,
          simulateFailure: context.simulateFailure,
        })
        .type("application/json");
    },
  });

  hapiServer.route({
    method: ["GET", "POST"],
    path: "/pdp/{productCategory}/{productName}/{productId}/",
    handler: async (request, h) => {
      const context = parseContext(request);
      const evaluation = evaluateRouting(context);
      appendRoutingEvent({
        context,
        evaluation,
        method: request.method,
        path: request.path,
      });

      if (request.method === "post") {
        const payload = request.payload && typeof request.payload === "object" ? request.payload : {};

        if (Object.prototype.hasOwnProperty.call(payload, "productName")) {
          const postedName = resolvePostedProductName(request);
          setStoredProductName(context.productId, postedName);
        }

        const postedRoutingMode = resolveRoutingModeInput(payload.routingMode);
        if (postedRoutingMode) {
          setRoutingState(context.productId, { routingMode: postedRoutingMode });
        }

        const postedSimulateFailure = resolveBooleanInput(payload.simulateFailure);
        if (postedSimulateFailure !== null) {
          setRoutingState(context.productId, { simulateFailure: postedSimulateFailure });
        }
      }

      const effectiveProductName = getStoredProductName(context.productId);
      const pageContext = {
        ...context,
        productName: effectiveProductName,
      };

      const reactivePost =
        request.method === "post" && request.query.reactive === "1";

      if (reactivePost && evaluation.route === "nextgen") {
        await sleep(650);
        return h.response({ ok: true, productName: effectiveProductName }).type("application/json");
      }

      if (request.method === "post" && evaluation.route === "legacy") {
        await sleep(1000);
      }

      if (evaluation.route === "nextgen" && !evaluation.fallback && !evaluation.queryLegacy) {
        return serveNextGen(request, h, pageContext);
      }

      return withFrameHeaders(h.response(renderLegacyPage(pageContext, evaluation)));
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

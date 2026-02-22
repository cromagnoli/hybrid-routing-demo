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
const DEFAULT_COLOR_CODE = "ffffff";
const ALLOWED_COLOR_CODES = ["ffffff", "444444", "22c55e"];
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
let currentDemoSessionId = null;

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
    selectedColorCode:
      resolveColorCodeInput(request.query.colorCode) ?? DEFAULT_COLOR_CODE,
    legacyQuery: request.query.legacy === "true",
    demoSessionId:
      typeof request.query.demoSessionId === "string" && request.query.demoSessionId
        ? request.query.demoSessionId
        : "session-unknown",
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

const resolveColorCodeInput = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return ALLOWED_COLOR_CODES.includes(normalized) ? normalized : null;
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
  const sessionId = context.demoSessionId ?? "session-unknown";

  if (currentDemoSessionId !== sessionId) {
    if (currentDemoSessionId !== null) {
      routingEventSeq += 1;
      routingEvents.push({
        id: routingEventSeq,
        at: new Date().toISOString(),
        method: "INFO",
        path: "",
        productId: context.productId,
        route: "legacy",
        reason: "session-end",
        fallback: false,
        legacyQuery: false,
        routingMode: context.routingMode,
        simulateFailure: context.simulateFailure,
        marker: "SESSION_END",
        sessionId: currentDemoSessionId,
      });
    }

    routingEventSeq += 1;
    routingEvents.push({
      id: routingEventSeq,
      at: new Date().toISOString(),
      method: "INFO",
      path: "",
      productId: context.productId,
      route: "legacy",
      reason: "session-beginning",
      fallback: false,
      legacyQuery: false,
      routingMode: context.routingMode,
      simulateFailure: context.simulateFailure,
      marker: "SESSION_BEGINNING",
      sessionId,
    });

    currentDemoSessionId = sessionId;
  }

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
    sessionId,
  });

  while (routingEvents.length > MAX_ROUTING_EVENTS) {
    routingEvents.shift();
  }
};


const LEGACY_SNAPSHOT_SCRIPT = `
    <script>
      (function () {
        var sendSnapshot = function () {
          try {
            window.parent.postMessage(
              {
                type: "IFRAME_HTML_SNAPSHOT",
                html: document.documentElement.outerHTML,
                href: window.location.href,
              },
              "*"
            );
          } catch (e) {}
        };

        var notifyNavigationStart = function () {
          try {
            window.parent.postMessage({ type: "IFRAME_NAVIGATION_START" }, "*");
          } catch (e) {}
        };

        document.addEventListener(
          "click",
          function (event) {
            var target = event.target;
            if (!target || !(target instanceof Element)) {
              return;
            }
            var link = target.closest("a[href]");
            if (link) {
              notifyNavigationStart();
            }
          },
          true
        );

        document.addEventListener(
          "submit",
          function () {
            notifyNavigationStart();
          },
          true
        );

        window.addEventListener("message", function (event) {
          if (event && event.data && event.data.type === "REQUEST_HTML_SNAPSHOT") {
            sendSnapshot();
          }
        });

        sendSnapshot();
      })();
    </script>
`;

const renderLegacyPage = (context, evaluation) => {
  const safeProductName = escapeHtml(context.productName);
  const safeSessionId = encodeURIComponent(context.demoSessionId ?? "session-unknown");
  const selectedColorCode =
    resolveColorCodeInput(context.selectedColorCode) ?? DEFAULT_COLOR_CODE;
  const colorMeta = {
    ffffff: "White",
    "444444": "Graphite",
    "22c55e": "Vivid Green",
  };
  const selectedColorName = colorMeta[selectedColorCode] ?? "White";
  const productImageUrl = `/images/sneakers-${selectedColorCode}.png`;
  const colorLinks = ALLOWED_COLOR_CODES.map((code) => {
    const isSelected = code === selectedColorCode;
    const colorQuery = new URLSearchParams({
      demoSessionId: String(context.demoSessionId ?? "session-unknown"),
      colorCode: code,
    });
    if (context.simulateFailure) {
      colorQuery.set("simulateFailure", "true");
    }
    const colorHref = `/pdp/running-sneakers/white-loop-runner/${encodeURIComponent(
      context.productId
    )}/?${colorQuery.toString()}`;

    return `<a href="${colorHref}" class="color-btn-link ${
      isSelected ? "active" : ""
    }" title="${colorMeta[code] ?? code}"><span style="background:#${code};"></span></a>`;
  }).join("");

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
      .back-link {
        display: inline-block;
        margin: 0 0 10px;
        padding: 6px 10px;
        color: #fff3af;
        font-size: 12px;
        font-weight: bold;
        text-decoration: none;
        border: 1px solid #9ab2d8;
        background: #0f2f55;
        animation: legacy-blink 1s steps(1, end) infinite;
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
      .color-form {
        margin: 10px 0 12px;
      }
      .color-form-label {
        margin-bottom: 6px;
        font-size: 12px;
        color: #d4e2ff;
      }
      .color-grid {
        display: flex;
        gap: 8px;
      }
      .color-btn-link {
        width: 28px;
        height: 28px;
        border: 1px solid #6e8bbb;
        background: #0f2f55;
        padding: 2px;
        display: inline-block;
        text-decoration: none;
      }
      .color-btn-link span {
        display: block;
        width: 100%;
        height: 100%;
      }
      .color-btn-link.active {
        border-color: #fff3af;
        box-shadow: 0 0 0 1px #fff3af inset;
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
              <div class="legacy-shoe"><img src="${productImageUrl}" alt="BuyMeNot ${selectedColorName} Loop Runner"/></div>
            </td>
            <td class="right">
              <a class="back-link" href="/cdp/running-sneakers/white-loop-runner/${encodeURIComponent(context.productId)}/?demoSessionId=${safeSessionId}">Back to product category</a>
              <h1 class="title">${safeProductName}</h1>
              <p class="subtitle">Classic HTML table layout for legacy storefront.</p>
              <div>
                <span class="price">$118.00</span>
                <span class="old">$138.00</span>
              </div>
              <div class="color-form">
                <div class="color-form-label">Color (full page reload via querystring)</div>
                <div class="color-grid">${colorLinks}</div>
              </div>
              <div class="meta">
                SKU: LEG-WHT-0065<br/>
                Size: 6.5 US<br/>
                Color: ${escapeHtml(selectedColorName)}<br/>
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
${LEGACY_SNAPSHOT_SCRIPT}
  </body>
</html>
`;
};

const renderLegacyCategoryPage = ({
  productCategory,
  productSlug,
  productId,
  simulateFailure,
  demoSessionId,
}) => {
  const readableCategory = productCategory
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  const safeCategory = escapeHtml(readableCategory || "Product Category");
  const safeProductName = escapeHtml(getStoredProductName(productId));
  const href = `/pdp/${encodeURIComponent(productCategory)}/${encodeURIComponent(productSlug)}/${encodeURIComponent(productId)}/`;
  const queryParams = new URLSearchParams();
  if (simulateFailure) {
    queryParams.set("simulateFailure", "true");
  }
  if (demoSessionId) {
    queryParams.set("demoSessionId", String(demoSessionId));
  }
  const query = queryParams.toString() ? `?${queryParams.toString()}` : "";

  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>BuyMeNot Legacy Category</title>
    <style>
      body {
        margin: 0;
        background: #041e35;
        color: #f6f1c7;
        font-family: "Verdana", "Tahoma", sans-serif;
      }
      .page {
        max-width: 980px;
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
        padding: 16px;
      }
      .section-title {
        margin: 0 0 10px;
        color: #ffffff;
        font-size: 18px;
      }
      .section-subtitle {
        margin: 0 0 14px;
        color: #d4e2ff;
        font-size: 12px;
      }
      .section-subtitle.blink {
        animation: legacy-blink 1s steps(1, end) infinite;
      }
      .blink {
        animation: legacy-blink 1s steps(1, end) infinite;
      }
      @keyframes legacy-blink {
        50% { opacity: 0.15; }
      }
      .tiles {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      .card-link {
        display: block;
        width: 240px;
        flex: 0 0 240px;
        box-sizing: border-box;
        text-decoration: none;
      }
      .card {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #7f9dcc;
        background: #0d2a4b;
        padding: 10px;
      }
      .card-link:hover .card {
        border-color: #a9bde0;
      }
      .card-muted {
        width: 240px;
        flex: 0 0 240px;
        box-sizing: border-box;
        border: 1px solid #5f7499;
        background: #19365c;
        padding: 10px;
        opacity: 0.45;
        filter: grayscale(0.8);
      }
      .thumb {
        width: 100%;
        height: 190px;
        background: #ffffff;
        border: 1px dashed #9ab2d8;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .thumb img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }
      .product-title {
        margin: 10px 0 6px;
        font-size: 16px;
        color: #ffffff;
      }
      .link {
        color: #fff3af;
        font-size: 13px;
        font-weight: bold;
        text-decoration: underline;
      }
      .meta {
        margin-top: 8px;
        font-size: 11px;
        color: #dbe7ff;
      }
      .notice {
        margin-top: 14px;
        font-size: 12px;
        color: #f6f1c7;
      }
      .pager {
        margin-top: 12px;
        font-size: 12px;
        color: #d4e2ff;
      }
      .pager span {
        display: inline-block;
        margin-right: 8px;
        padding: 2px 6px;
        border: 1px solid #7f9dcc;
        background: #10335a;
      }
      .pager .active {
        color: #fff3af;
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
        <span class="variant">Legacy Product Category</span>
      </div>
      <div class="content">
        <h1 class="section-title">${safeCategory}</h1>
        <p class="section-subtitle blink">Legacy entry page. Click the product to open the product detail page.</p>
        <div class="tiles">
          <a class="card-link" href="${href}${query}">
            <div class="card">
              <div class="thumb"><img src="/images/sneakers-ffffff.png" alt="BuyMeNot White Loop Runner"/></div>
              <h2 class="product-title">${safeProductName}</h2>
              <div class="link">Open product detail page</div>
              <div class="meta">Product ID: ${escapeHtml(productId)}</div>
            </div>
          </a>
          <div class="card-muted" aria-hidden="true">
            <div class="thumb"><img src="/images/sneakers-22c55e.png" alt="Decorative product tile"/></div>
            <h2 class="product-title">BuyMeNot Street Drift</h2>
            <div class="link">Coming soon</div>
            <div class="meta">Product ID: prod9912</div>
          </div>
        </div>
        <div class="notice blink">Routing mode is resolved when the product detail page is requested.</div>
        <div class="pager" aria-hidden="true">
          <span class="active">1</span><span>2</span><span>3</span><span>Next »</span>
        </div>
      </div>
    </div>
${LEGACY_SNAPSHOT_SCRIPT}
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
    selectedColorCode: context.selectedColorCode,
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
          selectedColorCode: context.selectedColorCode,
          routingMode: context.routingMode,
          simulateFailure: context.simulateFailure,
        })
        .type("application/json");
    },
  });

  hapiServer.route({
    method: "GET",
    path: "/cdp/{productCategory}/{productName}/{productId}/",
    handler: (request, h) => {
      const context = parseContext(request);
      const productCategory = String(request.params.productCategory ?? "running-sneakers");
      const productSlug = String(request.params.productName ?? "white-loop-runner");

      const evaluation = {
        route: "legacy",
        reason: "legacy-category-entry",
        fallback: false,
        queryLegacy: false,
      };

      appendRoutingEvent({
        context,
        evaluation,
        method: request.method,
        path: request.path,
      });

      return withFrameHeaders(
        h.response(
          renderLegacyCategoryPage({
            productCategory,
            productSlug,
            productId: context.productId,
            simulateFailure: context.simulateFailure,
            demoSessionId: context.demoSessionId,
          })
        )
      );
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
        selectedColorCode: context.selectedColorCode
      };

      if (request.method === "post") {
        await sleep(650);
        return h
          .response({
            ok: true,
            productName: effectiveProductName,
            selectedColorCode: pageContext.selectedColorCode,
          })
          .type("application/json");
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

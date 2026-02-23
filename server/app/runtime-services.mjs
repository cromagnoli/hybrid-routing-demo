import Hapi from "@hapi/hapi";
import {
  shouldRunViteDevServer,
  registerViteDevMiddlewares,
  tearDownViteDevServer,
} from "./hybrid-routing/vite.mjs";

const SERVER_PORT = Number(process.env.PORT ?? process.env.HAPI_RUNTIME_PORT ?? "4001");
const SERVER_HOST = process.env.HOST ?? "0.0.0.0";

const DEFAULT_PRODUCT_NAME = "White Loop Runner";
const DEFAULT_COLOR_CODE = "ffffff";
const ALLOWED_COLOR_CODES = ["ffffff", "444444", "22c55e"];
const FRAME_ANCESTORS =
  process.env.FRAME_ANCESTORS ??
  "'self' https://cromagnoli.github.io http://localhost:3000 http://127.0.0.1:3000";

let hapiServer;

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
  const checkoutHref = `/checkout/${encodeURIComponent(
    context.productId
  )}/?demoSessionId=${safeSessionId}`;
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
    <link rel="stylesheet" href="/legacy-pdp.css" />
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
              <a class="buy-now" href="${checkoutHref}">Buy now</a>
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

const renderLegacyCheckoutPage = ({
  productId,
  productName,
  demoSessionId,
  simulateFailure,
}) => {
  const safeProductId = escapeHtml(productId);
  const safeProductName = escapeHtml(productName);
  const safeSessionId = encodeURIComponent(demoSessionId ?? "session-unknown");
  const backQuery = new URLSearchParams({
    demoSessionId: String(demoSessionId ?? "session-unknown"),
  });
  if (simulateFailure) {
    backQuery.set("simulateFailure", "true");
  }
  const backHref = `/pdp/running-sneakers/white-loop-runner/${encodeURIComponent(
    productId
  )}/?${backQuery.toString()}`;
  const backToCategoryHref = `/cdp/running-sneakers/white-loop-runner/${encodeURIComponent(
    productId
  )}/?demoSessionId=${safeSessionId}`;

  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>BuyMeNot Checkout (Legacy)</title>
    <link rel="stylesheet" href="/legacy-checkout.css" />
  </head>
  <body>
    <div class="page">
      <div class="topbar">
        <span class="title">Legacy Checkout</span>
      </div>
      <div class="content">
        <div class="checkout-box">
          <div><strong>Product:</strong> ${safeProductName}</div>
          <div><strong>Product ID:</strong> ${safeProductId}</div>
          <div><strong>Flow:</strong> legacy → (nextgen/legacy) → legacy</div>
          <a class="cta" href="#" onclick="alert('Fake order placed!'); return false;">Place order</a>
          <a class="back" href="${backHref}">Back to product detail</a>
          <a class="back" href="${backToCategoryHref}">Back to category</a>
        </div>
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
    <link rel="stylesheet" href="/legacy-category.css" />
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


const runViteMiddleware = async (request, h) =>
  registerViteDevMiddlewares({ hapiRequest: request, hapiHandler: h });

const withFrameHeaders = (response) =>
  response
    .type("text/html")
    .header("Content-Security-Policy", `frame-ancestors ${FRAME_ANCESTORS}`)
    .header("X-Frame-Options", null);

const shouldBypassViteOnRequest = (request) => {
  const path = request?.path ?? "";
  return (
    path === "/health" ||
    path.startsWith("/routing-events") ||
    path.startsWith("/resolve/")
  );
};

const startRuntime = async (registerRoutes) => {
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

  if (shouldRunViteDevServer()) {
    /**
     * Register Vite middleware directly (onRequest) to avoid catch-all route conflicts.
     */
    hapiServer.ext("onRequest", async (request, handler) => {
      if (shouldBypassViteOnRequest(request)) {
        return handler.continue;
      }
      return registerViteDevMiddlewares({ hapiRequest: request, hapiHandler: handler });
    });
  }

  registerRoutes(hapiServer);

  await hapiServer.start();
  console.log(`[hybrid-demo] running on http://${SERVER_HOST}:${SERVER_PORT}`);
};

const stopRuntime = async () => {
  if (hapiServer) {
    await hapiServer.stop();
    hapiServer = undefined;
  }
  await tearDownViteDevServer();
};

export {
  startRuntime,
  stopRuntime,
  routingEvents,
  parseContext,
  evaluateRouting,
  getStoredProductName,
  setStoredProductName,
  resolvePostedProductName,
  resolveRoutingModeInput,
  setRoutingState,
  resolveBooleanInput,
  sleep,
  appendRoutingEvent,
  renderLegacyCategoryPage,
  withFrameHeaders,
  renderLegacyPage,
  renderLegacyCheckoutPage,
  runViteMiddleware,
  registerViteDevMiddlewares,
  shouldRunViteDevServer,
};

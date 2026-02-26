import {
  parseContext,
  evaluateRoutingForDemo,
  appendRoutingEvent,
  getStoredProductName,
  setStoredProductName,
  withFrameHeaders,
  renderLegacyPage,
  resolvePostedProductName,
  resolveRoutingModeInput,
  setRoutingState,
  resolveBooleanInput,
  sleep,
} from "../demo-runtime-services.mjs";

const pdp = {
  getLegacy: {
    handler: (request, h) => {
      const context = parseContext(request);
      const evaluation = evaluateRoutingForDemo(context);
      if (request.query?.fallbackReason === "error-boundary") {
        setRoutingState(context.demoSessionId, { simulateFailure: false });
      }
      appendRoutingEvent({
        context,
        evaluation,
        method: request.method,
        path: request.path,
      });

      const pageContext = {
        ...context,
        productName: getStoredProductName(context.demoSessionId),
        selectedColorCode: context.selectedColorCode,
      };

      return withFrameHeaders(h.response(renderLegacyPage(pageContext, evaluation)));
    },
  },
  post: {
    handler: async (request, h) => {
      const context = parseContext(request);
      const evaluation = evaluateRoutingForDemo(context);
      appendRoutingEvent({
        context,
        evaluation,
        method: request.method,
        path: request.path,
      });

      const payload = request.payload && typeof request.payload === "object" ? request.payload : {};

      if (Object.prototype.hasOwnProperty.call(payload, "productName")) {
        const postedName = resolvePostedProductName(request);
        setStoredProductName(context.demoSessionId, postedName);
      }

      const postedRoutingMode = resolveRoutingModeInput(payload.routingMode);
      if (postedRoutingMode) {
        setRoutingState(context.demoSessionId, { routingMode: postedRoutingMode });
      }

      const postedSimulateFailure = resolveBooleanInput(payload.simulateFailure);
      if (postedSimulateFailure !== null) {
        setRoutingState(context.demoSessionId, { simulateFailure: postedSimulateFailure });
      }

      await sleep(650);
      return h
        .response({
          ok: true,
          productName: getStoredProductName(context.demoSessionId),
          selectedColorCode: context.selectedColorCode,
        })
        .type("application/json");
    },
  },
};

export default pdp;

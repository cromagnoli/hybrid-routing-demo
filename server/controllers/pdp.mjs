import {
  parseContext,
  evaluateRouting,
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
} from "../app/runtime-services.mjs";

const pdp = {
  getLegacy: {
    handler: (request, h) => {
      const context = parseContext(request);
      const evaluation = evaluateRouting(context);
      appendRoutingEvent({
        context,
        evaluation,
        method: request.method,
        path: request.path,
      });

      const pageContext = {
        ...context,
        productName: getStoredProductName(context.productId),
        selectedColorCode: context.selectedColorCode,
      };

      return withFrameHeaders(h.response(renderLegacyPage(pageContext, evaluation)));
    },
  },
  post: {
    handler: async (request, h) => {
      const context = parseContext(request);
      const evaluation = evaluateRouting(context);
      appendRoutingEvent({
        context,
        evaluation,
        method: request.method,
        path: request.path,
      });

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

      await sleep(650);
      return h
        .response({
          ok: true,
          productName: getStoredProductName(context.productId),
          selectedColorCode: context.selectedColorCode,
        })
        .type("application/json");
    },
  },
};

export default pdp;

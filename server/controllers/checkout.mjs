import {
  parseContext,
  appendRoutingEvent,
  withFrameHeaders,
  renderLegacyCheckoutPage,
  getStoredProductName,
} from "../demo-runtime-services.mjs";

const checkout = {
  get: {
    handler: (request, h) => {
      const context = parseContext(request);
      const evaluation = {
        route: "legacy",
        reason: "legacy-checkout-final",
        fallback: false,
        queryLegacy: true,
      };

      appendRoutingEvent({
        context,
        evaluation,
        method: request.method,
        path: request.path,
      });

      return withFrameHeaders(
        h.response(
          renderLegacyCheckoutPage({
            productId: context.productId,
            productName: getStoredProductName(context.demoSessionId),
            demoSessionId: context.demoSessionId,
            simulateFailure: context.simulateFailure,
          })
        )
      );
    },
  },
};

export default checkout;

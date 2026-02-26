import {
  parseContext,
  appendRoutingEvent,
  renderLegacyCategoryPage,
  withFrameHeaders,
} from "../demo-runtime-services.mjs";

const cdp = {
  get: {
    handler: (request, h) => {
      const baseContext = parseContext(request);
      const productId = "prod1234";
      const context = { ...baseContext, productId };
      const productCategory = String(request.params.productCategory ?? "running-sneakers");
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
            productId: context.productId,
            simulateFailure: context.simulateFailure,
            demoSessionId: context.demoSessionId,
          })
        )
      );
    },
  },
};

export default cdp;

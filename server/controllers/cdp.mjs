import {
  parseContext,
  appendRoutingEvent,
  renderLegacyCategoryPage,
  withFrameHeaders,
} from "../app/runtime-services.mjs";

const cdp = {
  get: {
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
  },
};

export default cdp;

import {
  parseContext,
  evaluateRoutingForDemo,
  getStoredProductName,
} from "../app/runtime-services.mjs";

const resolve = {
  handler: (request, h) => {
    const context = parseContext(request);
    return h
      .response({
        ...evaluateRoutingForDemo(context),
        productName: getStoredProductName(context.productId),
        selectedColorCode: context.selectedColorCode,
        routingMode: context.routingMode,
        simulateFailure: context.simulateFailure,
      })
      .type("application/json");
  },
};

export default resolve;

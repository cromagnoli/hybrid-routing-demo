import {
  parseContext,
  evaluateRoutingForDemo,
  getStoredProductName,
  getDemoSessionInfo,
} from "../demo-runtime-services.mjs";

const resolve = {
  handler: (request, h) => {
    const context = parseContext(request);
    const sessionInfo = getDemoSessionInfo(context.demoSessionId);
    return h
      .response({
        ...evaluateRoutingForDemo(context),
        productName: getStoredProductName(context.demoSessionId),
        selectedColorCode: context.selectedColorCode,
        routingMode: context.routingMode,
        simulateFailure: context.simulateFailure,
        sessionExpired: context.sessionExpired || sessionInfo.sessionExpired,
        sessionExpiresAt: sessionInfo.sessionExpiresAt,
      })
      .type("application/json");
  },
};

export default resolve;

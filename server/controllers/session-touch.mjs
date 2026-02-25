import {
  resolveDemoSessionId,
  touchDemoSession,
} from "../app/runtime-services.mjs";

const sessionTouch = {
  handler: (request, h) => {
    const demoSessionId = resolveDemoSessionId(request);
    const touch = touchDemoSession(demoSessionId);

    return h
      .response({
        ok: true,
        demoSessionId,
        sessionExpired: touch.sessionExpired,
        sessionExpiresAt: touch.sessionExpiresAt,
      })
      .type("application/json");
  },
};

export default sessionTouch;

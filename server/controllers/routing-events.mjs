import { routingEvents as runtimeRoutingEvents } from "../demo-runtime-services.mjs";

const routingEvents = {
  handler: (request, h) => {
    const after = Number(request.query.after ?? "0");
    const events = Number.isFinite(after) && after > 0
      ? runtimeRoutingEvents.filter((event) => event.id > after)
      : runtimeRoutingEvents;

    return h.response({
      events,
      latestId: runtimeRoutingEvents.length
        ? runtimeRoutingEvents[runtimeRoutingEvents.length - 1].id
        : 0,
    }).type("application/json");
  },
};

export default routingEvents;

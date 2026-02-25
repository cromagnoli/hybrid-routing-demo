import cdp from "../controllers/cdp.mjs";
import pdp from "../controllers/pdp.mjs";
import checkout from "../controllers/checkout.mjs";
import fallback from "../controllers/fallback.mjs";
import health from "../controllers/health.mjs";
import routingEvents from "../controllers/routing-events.mjs";
import resolve from "../controllers/resolve.mjs";
import * as routing from "../app/hybrid-routing/routing.mjs";

const registerRoutes = (server) => {
  const routes = [
    {
      method: "GET",
      path: "/cdp/{productCategory}/",
      config: cdp.get,
    },
    {
      method: "GET",
      path: "/pdp/{productCategory}/{productName}/{productId}/",
      config: routing.resolveRouteController(
        pdp.getLegacy,
        "/pdp/{productCategory}/{productName}/{productId}/"
      ),
    },
    { method: "GET", path: "/checkout/", config: checkout.get },
    {
      method: ["GET", "POST"],
      path: "/{path*}",
      config: routing.resolveRouteController(fallback.unmatched, "/{path*}"),
    },
  ];

  const demoUtilityRoutes = [
    { method: "GET", path: "/health", config: health },
    { method: "GET", path: "/routing-events", config: routingEvents },
    { method: "GET", path: "/resolve/{productId}", config: resolve },
    {
      method: "POST",
      path: "/pdp/{productCategory}/{productName}/{productId}/",
      config: pdp.post,
    },
  ];

  const hapiRoutes = [...routes, ...demoUtilityRoutes].map((route) => {
    const { handler, ...restConfig } = route.config;
    return {
      method: route.method,
      path: route.path,
      options: {
        ...restConfig,
        handler,
      },
    };
  });

  server.route(hapiRoutes);
};

export default registerRoutes;

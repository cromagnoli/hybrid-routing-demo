import { parseContext, evaluateRouting } from "../runtime-services.mjs";
import { createRequestHandler } from "./react-router-request-response.adapter.mjs";
import { getViteBuild } from "./vite.mjs";
import { DualPaths, InternalPaths } from "./paths.mjs";
import { notFound } from "../../controllers/errors.mjs";

const serializeLogSegment = (segment) => {
  try {
    return JSON.stringify(segment);
  } catch {
    return String(segment);
  }
};

const splitPathSegments = (path) => path.split("/").filter(Boolean);

const removeTrailingSlash = (path) => path.endsWith("/") ? path.slice(0, -1) : path;

const isDynamicSegment = (segment) => segment.startsWith(":");

const logger = {
  info: (scope, message, meta = []) => console.info(scope, message, meta),
  error: (scope, message, meta = []) => console.error(scope, message, meta),
};

const CLIENT_NAVIGATION_PATH_SUFFIX = ".data";
const internalPaths = Object.values(InternalPaths);

const reactRouterAvailablePaths = {
  ...DualPaths,
};

/**
 * Checks if a route pattern matches the given path segments
 */
const doesRoutePatternMatch = (routePattern, pathSegments) => {
  const normalizedPattern = removeTrailingSlash(routePattern);
  const patternSegments = splitPathSegments(normalizedPattern);

  if (pathSegments.length !== patternSegments.length) {
    return false;
  }

  return patternSegments.every((patternSegment, index) => {
    const pathSegment = pathSegments[index];

    if (isDynamicSegment(patternSegment)) {
      return true; // Dynamic segments (e.g., :id) match any value
    }

    // For static segments, they must match exactly
    return patternSegment === pathSegment;
  });
};

/**
 * Finds the route key that matches the given path
 */
const findMatchingRouteKey = (pathSegments) => {
  const matchingEntry = Object.entries(reactRouterAvailablePaths).find(([, routePattern]) => (
      doesRoutePatternMatch(routePattern, pathSegments)
  ));

  return matchingEntry ? matchingEntry[0] : null;
};

/**
 * Determines if a given request path should be handled via Next Gen Router
 * @param reqPath - The incoming request path
 * @param nextGenEnabledPages - Array of route keys that are enabled for React Router
 * @returns true if the path should be handled by React Router, false otherwise
 */
const canRouteViaNextGen = (reqPath, nextGenEnabledPages = []) => {
  if (reqPath?.endsWith(CLIENT_NAVIGATION_PATH_SUFFIX) || internalPaths.includes(reqPath)) {
    return true;
  }

  const normalizedPath = removeTrailingSlash(reqPath || "");
  const pathSegments = splitPathSegments(normalizedPath);
  const matchingRouteKey = findMatchingRouteKey(pathSegments);

  return matchingRouteKey !== null && nextGenEnabledPages.includes(matchingRouteKey);
};

export const resolveRouteController = (legacyController, pathDebugId) => ({
  ...legacyController,
  handler: async (...handlerArgs) => {
    try {
      const [request] = handlerArgs;

      if (shouldUseNextGenRouter(request)) {
        logger.info("resolveRouteController", "Running modern routing for", [
          request?.method?.toUpperCase(),
          request?.url?.href,
          serializeLogSegment({ pathDebugId }),
        ]);

        const reactRouterRoutesHandler = await getReactRouterRoutesHandler(request);

        return reactRouterRoutesHandler(...handlerArgs);
      }

      logger.info("resolveRouteController", "Running legacy routing for", [
        request?.method?.toUpperCase(),
        request?.url?.href,
        serializeLogSegment({ pathDebugId }),
      ]);

      if (typeof legacyController.handler === "function") {
        return legacyController.handler(...handlerArgs);
      }

      throw new Error("Handler is undefined for legacyController");
    } catch (error) {
      logger.error(
        "resolveRouteController",
        "Failure resolving Hapi/ReactRouter route handler. Routing to Hapi 404 page...",
        [serializeLogSegment(error)]
      );

      return notFound.handler(...handlerArgs);
    }
  },
});

/**
 * Determines whether to use the NextGen router based on feature flags and path availability.
 * In this demo, availability is inferred from runtime routing state and legacy query fallback.
 * @param {import("@hapi/hapi").Request} request
 * @returns {boolean}
 */
const shouldUseNextGenRouter = (request) => {
  const hasLegacyFallbackQuery = request?.url?.searchParams?.get("legacy");

  if (hasLegacyFallbackQuery) {
    return false;
  }

  const context = parseContext(request);
  const evaluation = evaluateRouting(context);
  const isNextGenEnabled =
    evaluation.route === "nextgen" &&
    !evaluation.fallback &&
    !evaluation.queryLegacy;
  const nextGenEnabledPages = ["ProductDetail"] || [];
  const isPathAvailable = canRouteViaNextGen(request.path, nextGenEnabledPages);

  return isNextGenEnabled && isPathAvailable;
};

const createReactRouterRoutesHandler = async (request) => {
  const build = await getViteBuild();

  return createRequestHandler({
    build,
    getLoadContext: async () => ({
      request,
    }),
  });
};

export const getReactRouterRoutesHandler = async (request) => {
  return await createReactRouterRoutesHandler(request);
};

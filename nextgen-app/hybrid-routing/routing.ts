import { logger, serializeLogSegment } from "../../server/resources/helpers/logger.mjs";
import type { ResponseToolkit, ServerRoute } from '@hapi/hapi';
import { Request as HapiRequest } from '@hapi/hapi';
import { notFound } from "../../server/controllers/errors.mjs";
import { NEXTGEN_ENABLED_ROUTES } from "./fake-feature-flag.js";
import { parseContext, evaluateRoutingForDemo } from "../../server/demo-runtime-services.mjs";
import { DualPaths, InternalPaths } from "./paths.js";
import { createRequestHandler } from "./react-router-request-response.adapter.js";
import { getViteBuild } from "./vite.js";

const splitPathSegments = (path: string) => path.split('/').filter(Boolean);

const removeTrailingSlash = (path: string) => path.endsWith('/') ? path.slice(0, -1) : path;

const isDynamicSegment = (segment: string) => segment.startsWith(':');

const CLIENT_NAVIGATION_PATH_SUFFIX = '.data';
const internalPaths = Object.values(InternalPaths);

/**
 * Serves as source of truth for RR-enabled paths in the hybrid resolver.
 */
const reactRouterAvailablePaths = {
  ...DualPaths,
};

/**
 * Checks if a route pattern matches the given path segments.
 */
const doesRoutePatternMatch = (routePattern: string, pathSegments: string[]): boolean => {
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
 * Finds the route key that matches the given path.
 */
const findMatchingRouteKey = (pathSegments: string[]): string | null => {
  const matchingEntry = Object.entries(reactRouterAvailablePaths).find(([_, routePattern]) =>
    doesRoutePatternMatch(routePattern, pathSegments)
  );

  return matchingEntry ? matchingEntry[0] : null;
};

/**
 * Determines if a given request path should be handled via Next Gen Router.
 */
const isNextGenPathAvailable = (reqPath: string, nextGenEnabledPages: string[] = []): boolean => {
  const internalPaths = Object.values(InternalPaths);

  if (reqPath?.endsWith(CLIENT_NAVIGATION_PATH_SUFFIX) || internalPaths.includes(reqPath)) {
    return true;
  }

  const normalizedPath = removeTrailingSlash(reqPath);
  const pathSegments = splitPathSegments(normalizedPath);
  const matchingRouteKey = findMatchingRouteKey(pathSegments);

  return matchingRouteKey !== null && nextGenEnabledPages.includes(matchingRouteKey);
};

export const resolveRouteController = (legacyController: ServerRoute, pathDebugId: string) => ({
  ...legacyController,
  handler: async (...handlerArgs: [HapiRequest, ResponseToolkit]) => {
    try {
      const [request] = handlerArgs;

      if (shouldUseNextGenRouter(request)) {
        logger.info('resolveRouteController', 'Running modern routing for', [
          request?.method?.toUpperCase(),
          request?.url?.href,
          serializeLogSegment({ pathDebugId })
        ]);

        const reactRouterRoutesHandler = await getReactRouterRoutesHandler(request);

        return reactRouterRoutesHandler(...handlerArgs);
      }

      logger.info('resolveRouteController', 'Running legacy routing for', [
        request?.method?.toUpperCase(),
        request?.url?.href,
        serializeLogSegment({ pathDebugId })
      ]);

      if (typeof legacyController.handler === 'function') {
        return legacyController.handler(...handlerArgs);
      }

      throw new Error('Handler is undefined for legacyController');
    } catch (error) {
      logger.error(
        'resolveRouteController',
        'Failure resolving Hapi/ReactRouter route handler. Routing to Hapi 404 page...',
        [serializeLogSegment(error)]
      );

      return notFound.handler(...handlerArgs);
    }
  }
});

const isNextGenRoutingEnabled = (context: ReturnType<typeof parseContext>) => {
  const evaluation = evaluateRoutingForDemo(context);

  // These conditions are meant for demo only – Actual implementation was different
  return (
      evaluation.route === 'nextgen' &&
      !evaluation.fallback &&
      !evaluation.queryLegacy
  );
};

/**
 * Determines whether to use the NextGen router based on feature flags and path availability.
 */
export const shouldUseNextGenRouter = (request: HapiRequest): boolean => {
  const hasLegacyFallbackQuery = request?.url?.searchParams?.get('legacy');

  if (hasLegacyFallbackQuery) {
    return false;
  }

  const context = parseContext(request);
  const isPathAvailable = isNextGenPathAvailable(request.path, NEXTGEN_ENABLED_ROUTES);

  return isNextGenRoutingEnabled(context) && isPathAvailable;
};

const createReactRouterRoutesHandler = async (request: HapiRequest) => {
  const build = await getViteBuild();

  return createRequestHandler({
    build,
    getLoadContext: async () => ({
      request
    })
  });
};

export const getReactRouterRoutesHandler = async (request: HapiRequest): Promise<ReturnType<typeof createRequestHandler>> => {
  return await createReactRouterRoutesHandler(request);
};

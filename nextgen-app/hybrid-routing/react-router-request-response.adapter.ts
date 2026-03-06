import type * as http from "node:http";
import type {
  Request as HapiRequest,
  ResponseToolkit,
  ResponseValue,
} from "@hapi/hapi";
import { createReadableStreamFromReadable, readableStreamToString } from "@react-router/node";
import type { AppLoadContext, ServerBuild } from "react-router";
import { createRequestHandler as createReactRouterRequestHandler } from "react-router";
import { logger, serializeLogSegment } from "../../server/resources/helpers/logger.mjs";

// Original from: https://github.com/mcansh/remix-node-http-server/blob/main/packages/remix-raw-http/src/server.ts

/**
 * Returns the value to use as `context` in route `loader` and `action` functions.
 */
export type GetLoadContextFunction = (
  req: HapiRequest,
  res: ResponseToolkit
) => Promise<AppLoadContext>;

/**
 * Returns a request handler for Hapi that serves the response using React Router.
 */
export const createRequestHandler = ({
  build,
  getLoadContext,
  mode = process.env.NODE_ENV,
}: {
  build: ServerBuild;
  getLoadContext?: GetLoadContextFunction;
  mode?: string;
}) => {
  const handleRequest = createReactRouterRequestHandler(build, mode);

  return async (hapiReq: HapiRequest, h: ResponseToolkit) => {
    try {
      const request = createReactRouterRequest(hapiReq);
      const loadContext = await getLoadContext?.(hapiReq, h);
      const response = await handleRequest(request, loadContext);

      return await sendReactRouterResponse(h, response);
    } catch (error) {
      logger.error("createRequestHandler", "Failure adapting request to React Router", [
        serializeLogSegment({
          method: hapiReq?.method?.toUpperCase?.() ?? hapiReq?.method,
          path: hapiReq?.path,
        }),
        serializeLogSegment(error),
      ]);

      throw error;
    }
  };
};

const createReactRouterHeaders = (requestHeaders: http.IncomingHttpHeaders): Headers => {
  const headers = new Headers();

  for (const [key, values] of Object.entries(requestHeaders)) {
    if (!values) {
      continue;
    }

    if (Array.isArray(values)) {
      for (const value of values) {
        headers.append(key, value);
      }
      continue;
    }

    headers.set(key, values);
  }

  return headers;
};

const getUrl = (rawReq: http.IncomingMessage): URL =>
  new URL(`http://${rawReq.headers.host}${rawReq.url}`);

const isContentTypeFormUrlEncoded = (rawReq: http.IncomingMessage): boolean => {
  const contentType = rawReq.headers["content-type"] || "";

  return contentType.includes("application/x-www-form-urlencoded");
};

const createReactRouterRequest = (hapiReq: HapiRequest): Request => {
  const rawReq = hapiReq.raw.req;
  const rawRes = hapiReq.raw.res;

  const url = getUrl(rawReq);

  // Abort action/loaders once we can no longer write a response.
  const controller = new AbortController();
  rawRes.on("close", () => controller.abort());

  const init: RequestInit = {
    method: rawReq.method,
    headers: createReactRouterHeaders(rawReq.headers),
    signal: controller.signal,
  };

  if (rawReq.method !== "GET" && rawReq.method !== "HEAD") {
    let body: BodyInit;

    if (isContentTypeFormUrlEncoded(rawReq)) {
      const payloadObject =
        hapiReq.payload && typeof hapiReq.payload === "object"
          ? (hapiReq.payload as Record<string, string>)
          : {};
      const params = new URLSearchParams(payloadObject);
      body = params.toString();
    } else {
      body = createReadableStreamFromReadable(rawReq);
      (init as RequestInit & { duplex: "half" }).duplex = "half";
    }

    init.body = body;
  }

  return new Request(url.href, init);
};

const sendReactRouterResponse = async (
  h: ResponseToolkit,
  nodeResponse: Response
): Promise<ResponseValue> => {
  const headers: Record<string, string> = {};

  nodeResponse.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const hapiReq = h.request;
  const rawReq = hapiReq.raw.req;

  let body: ResponseValue = "";

  if (nodeResponse.body) {
    if (isContentTypeFormUrlEncoded(rawReq)) {
      body = await nodeResponse.text();
    } else {
      body = await readableStreamToString(nodeResponse.body);
    }
  } else {
    h.request.raw.res.end();
  }

  const response = h
    .response(body)
    .code(nodeResponse.status)
    .message(nodeResponse.statusText);

  Object.entries(headers).forEach(([key, value]) => {
    response.header(key, value);
  });

  return response;
};

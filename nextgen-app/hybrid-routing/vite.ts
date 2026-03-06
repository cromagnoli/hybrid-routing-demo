import type { Request, ResponseToolkit } from "@hapi/hapi";
import type { ServerBuild } from "react-router";
import type { ViteDevServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const NEXTGEN_ROOT = path.resolve(__dirname, "..");

/** Demo runtime always uses Vite dev server (no static build mode in this repo). */
export const shouldRunViteDevServer = () => true;

const createViteServer = async (): Promise<ViteDevServer> => {
  const viteModule = await import("vite");

  const allowedHosts = (process.env.VITE_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  return viteModule.createServer({
    root: NEXTGEN_ROOT,
    configFile: path.resolve(NEXTGEN_ROOT, "vite.config.ts"),
    appType: "custom",
    server: {
      middlewareMode: true,
      allowedHosts: allowedHosts.length ? allowedHosts : true,
    },
  });
};

let vite: ViteDevServer | null = null;

const viteDevServerSingleton = async (): Promise<ViteDevServer> => {
  if (!vite) {
    vite = await createViteServer();
  }

  return vite;
};

export const getViteDevServer = viteDevServerSingleton;

export const tearDownViteDevServer = async () => {
  if (vite) {
    await vite.close();
    vite = null;
  }
};

/** Registers Vite middlewares in Hapi request lifecycle. */
export const registerViteDevMiddlewares = async ({
  hapiRequest,
  hapiHandler,
}: {
  hapiRequest: Request;
  hapiHandler: ResponseToolkit;
}) => {
  const viteDevServer = await getViteDevServer();

  return new Promise((resolve, reject) => {
    viteDevServer.middlewares(
      hapiRequest.raw.req,
      hapiRequest.raw.res,
      (error: Error | null | undefined) => {
        if (error) {
          reject(error);
        } else {
          resolve(hapiHandler.continue);
        }
      }
    );
  });
};

export const getViteBuild = async (): Promise<ServerBuild> => {
  /**
   * Kept intentionally commented to preserve the original production branching shape.
   * This demo runs exclusively on Vite dev middleware (no static build artifact pipeline),
   * so we force the dev path while leaving the static branch as reference for docs parity.
   */
  // if (shouldRunViteDevServer()) {
    const viteDevServer = await getViteDevServer();

    return (await viteDevServer.ssrLoadModule(
      "virtual:react-router/server-build"
    )) as ServerBuild;
  // }

  // const viteStaticBuild = await import('../../build/server/index.mjs');

  // return viteStaticBuild.importBuild();
};

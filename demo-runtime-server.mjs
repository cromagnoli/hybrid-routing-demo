import registerRoutes from "./server/init/routes.mjs";
import { startRuntime, stopRuntime } from "./server/demo-runtime-services.mjs";

process.on("SIGTERM", async () => {
  await stopRuntime();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await stopRuntime();
  process.exit(0);
});

startRuntime(registerRoutes).catch(async (error) => {
  console.error("[hybrid-demo] Failed to start runtime-server", error);
  await stopRuntime();
  process.exit(1);
});

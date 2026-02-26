import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const nextgenPathsEntry = path.resolve(repoRoot, "nextgen-app/hybrid-routing/paths.ts");
const nextgenPathsOut = path.resolve(repoRoot, "nextgen-app/hybrid-routing/paths.js");
const hybridRoutingEntry = path.resolve(repoRoot, "nextgen-app/hybrid-routing/routing.ts");
const hybridRoutingOut = path.resolve(repoRoot, "nextgen-app/hybrid-routing/routing.js");
const hybridFeatureFlagEntry = path.resolve(repoRoot, "nextgen-app/hybrid-routing/fake-feature-flag.ts");
const hybridFeatureFlagOut = path.resolve(repoRoot, "nextgen-app/hybrid-routing/fake-feature-flag.js");
const hybridViteEntry = path.resolve(repoRoot, "nextgen-app/hybrid-routing/vite.ts");
const hybridViteOut = path.resolve(repoRoot, "nextgen-app/hybrid-routing/vite.js");
const hybridAdapterEntry = path.resolve(repoRoot, "nextgen-app/hybrid-routing/react-router-request-response.adapter.ts");
const hybridAdapterOut = path.resolve(repoRoot, "nextgen-app/hybrid-routing/react-router-request-response.adapter.js");

await build({
  entryPoints: [nextgenPathsEntry],
  outfile: nextgenPathsOut,
  bundle: false,
  format: "esm",
  platform: "node",
  target: "node20",
  sourcemap: false,
  logLevel: "info",
});

await build({
  entryPoints: [hybridRoutingEntry],
  outfile: hybridRoutingOut,
  bundle: false,
  format: "esm",
  platform: "node",
  target: "node20",
  sourcemap: false,
  logLevel: "info",
});

await build({
  entryPoints: [hybridFeatureFlagEntry],
  outfile: hybridFeatureFlagOut,
  bundle: false,
  format: "esm",
  platform: "node",
  target: "node20",
  sourcemap: false,
  logLevel: "info",
});

await build({
  entryPoints: [hybridViteEntry],
  outfile: hybridViteOut,
  bundle: false,
  format: "esm",
  platform: "node",
  target: "node20",
  sourcemap: false,
  logLevel: "info",
});

await build({
  entryPoints: [hybridAdapterEntry],
  outfile: hybridAdapterOut,
  bundle: false,
  format: "esm",
  platform: "node",
  target: "node20",
  sourcemap: false,
  logLevel: "info",
});

console.log(
  `[build-shared-ts] Built ${path.relative(repoRoot, nextgenPathsOut)}, ${path.relative(repoRoot, hybridRoutingOut)} and ${path.relative(repoRoot, hybridFeatureFlagOut)}, ${path.relative(repoRoot, hybridViteOut)} and ${path.relative(repoRoot, hybridAdapterOut)}`
);

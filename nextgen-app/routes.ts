import { type RouteConfig, route } from '@react-router/dev/routes';
import { DualPaths } from "./hybrid-routing/paths";

export default [
  route(DualPaths.ProductDetail, "routes/pdp.tsx"),
] satisfies RouteConfig;

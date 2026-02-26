export enum DualPaths {
  ProductDetail = "/pdp/:productCategory/:productName/:productId",
}

// Exclude RR internal paths from legacy resolver.
export enum InternalPaths {
  ReactRouterManifest = "/__manifest",
}
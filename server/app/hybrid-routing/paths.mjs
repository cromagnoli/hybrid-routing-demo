const DualPaths = {
  ProductDetail: "/pdp/:productCategory/:productName/:productId",
};

// Exclude RR internal paths from Hapi legacy routing.
const InternalPaths = {
  ReactRouterManifest: "/__manifest",
};

export { DualPaths, InternalPaths };

import { runViteMiddleware } from "../demo-runtime-services.mjs";

const fallback = {
  unmatched: {
    handler: async (request, h) => {
      const result = await runViteMiddleware(request, h);
      return result ?? h.response("Not found").code(404);
    },
  },
};

export default fallback;

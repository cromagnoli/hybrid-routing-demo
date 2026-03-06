const fallback = {
  unmatched: {
    handler: async (_request, h) => h.response("Not found").code(404),
  },
};

export default fallback;

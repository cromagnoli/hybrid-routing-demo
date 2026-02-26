const fallback = {
  unmatched: {
    handler: async (request, h) => result ?? h.response("Not found").code(404),
  },
};

export default fallback;

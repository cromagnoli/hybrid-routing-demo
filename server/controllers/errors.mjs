const notFound = {
  handler: (request, h) =>
    h
      .response(`Not found: ${request.path}`)
      .code(404)
      .type("text/plain"),
};

export { notFound };

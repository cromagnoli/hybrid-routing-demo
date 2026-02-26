export const logger = {
    info: (scope, message, meta = []) =>
        console.info(scope, message, meta),
    error: (scope, message, meta = []) =>
        console.error(scope, message, meta),
};

export const serializeLogSegment = (segment) => {
    try {
        return JSON.stringify(segment);
    } catch {
        return String(segment);
    }
};
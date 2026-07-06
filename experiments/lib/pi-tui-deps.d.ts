/**
 * Ambient shim for a transitive dependency of pi's TUI source.
 *
 * The experiments package typechecks against pi source through tsconfig `paths`.
 * That pulls in `highlight.js/lib/index.js`, which has no bundled declaration in
 * this local install. Keep the shim here rather than patching `pi/`.
 */
declare module "highlight.js/lib/index.js";
declare module "highlight.js/lib/core";

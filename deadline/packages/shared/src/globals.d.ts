/**
 * Minimal ambient declarations so @deadline/shared can compile without pulling
 * in either the DOM or Node type libraries: the package is isomorphic and must
 * stay usable from the browser bundle and the game server alike.
 */
declare const console: {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
};

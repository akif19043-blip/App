// Shared tooling configuration package. Consumers reference the JSON/CJS files
// directly (e.g. "extends": "@deadline/config/tsconfig.lib.json").
export const configRoot = new URL('.', import.meta.url).pathname;

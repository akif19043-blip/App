/** Demo helpers (fake InPost delivery etc.) — on for local dev, opt-in elsewhere. */
export function demoToolsEnabled(): boolean {
  if (process.env.ENABLE_DEMO_TOOLS) return process.env.ENABLE_DEMO_TOOLS === "true";
  return !process.env.DATABASE_URL;
}

export function livekitConfig() {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  return url && apiKey && apiSecret ? { url, apiKey, apiSecret } : null;
}

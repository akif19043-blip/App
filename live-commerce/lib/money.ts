const pln = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });
const plnWhole = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  maximumFractionDigits: 0,
});

/** 12345 → "123,45 zł"; whole amounts drop the ",00". */
export function formatPLN(grosze: number): string {
  return grosze % 100 === 0 ? plnWhole.format(grosze / 100) : pln.format(grosze / 100);
}

/** "123,45" / "123.45" / "123" → 12345. Returns null for anything else. */
export function parsePLN(input: string): number | null {
  const m = input.trim().replace(/\s|zł/gi, "").match(/^(\d{1,7})(?:[.,](\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
}

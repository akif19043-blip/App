import { describe, expect, it } from "vitest";
import { formatPLN, parsePLN } from "@/lib/money";
import { isValidBlikCode, MockPrzelewy24Provider } from "@/lib/payments/blik";
import { createShipment, generateTrackingNumber } from "@/lib/shipping/inpost";
import { isValidPaczkomatId, PACZKOMATY, searchPaczkomaty } from "@/lib/shipping/lockers";

describe("money", () => {
  it("formats grosze as Polish złoty", () => {
    expect(formatPLN(5_000).replace(/\s/g, " ")).toBe("50 zł");
    expect(formatPLN(123_456).replace(/\s/g, " ")).toBe("1234,56 zł"); // pl-PL does not group 4 digits
    expect(formatPLN(12_345_678).replace(/\s/g, " ")).toBe("123 456,78 zł");
  });
  it.each([
    ["50", 5_000],
    ["50,5", 5_050],
    ["50.05", 5_005],
    ["1 200 zł", 120_000],
  ])("parses %s", (input, grosze) => expect(parsePLN(input)).toBe(grosze));
  it.each(["", "-5", "abc", "1,234", "12.345"])("rejects %j", (input) => expect(parsePLN(input)).toBeNull());
});

describe("BLIK mock (Przelewy24 sandbox rules)", () => {
  const p24 = new MockPrzelewy24Provider(0);
  const base = { orderId: "o1", amount: 5_000, description: "test" };

  it("validates the 6-digit format", () => {
    expect(isValidBlikCode("123456")).toBe(true);
    for (const bad of ["12345", "1234567", "12a456", " 123456"]) expect(isValidBlikCode(bad)).toBe(false);
  });

  it("approves a normal code and can register a OneClick alias", async () => {
    const r = await p24.chargeBlik({ ...base, code: "777123", registerAlias: true });
    expect(r).toMatchObject({ status: "approved", reference: expect.stringMatching(/^P24-/) });
    if (r.status === "approved") expect(r.alias).toMatch(/^blik_ua_[0-9a-f]{24}$/);
  });

  it("declines 000000 and expires 111111", async () => {
    expect(await p24.chargeBlik({ ...base, code: "000000" })).toEqual({ status: "declined", reason: "declined" });
    expect(await p24.chargeBlik({ ...base, code: "111111" })).toEqual({ status: "declined", reason: "expired" });
  });

  it("charges a known alias and refuses an unknown one", async () => {
    expect(await p24.chargeBlik({ ...base, alias: "blik_ua_x", knownAlias: "blik_ua_x" })).toMatchObject({
      status: "approved",
    });
    expect(await p24.chargeBlik({ ...base, alias: "blik_ua_x", knownAlias: "blik_ua_y" })).toEqual({
      status: "declined",
      reason: "alias_invalid",
    });
  });
});

describe("InPost", () => {
  it("every sample locker has a valid id, and ids are unique", () => {
    for (const p of PACZKOMATY) expect(isValidPaczkomatId(p.id), p.id).toBe(true);
    expect(new Set(PACZKOMATY.map((p) => p.id)).size).toBe(PACZKOMATY.length);
  });

  it("validates locker ids", () => {
    for (const ok of ["WAW123M", "KRA01N", "POZ08A"]) expect(isValidPaczkomatId(ok)).toBe(true);
    for (const bad of ["waw123m", "WA123M", "WAW12345M", "WAW123", "123WAW"]) expect(isValidPaczkomatId(bad)).toBe(false);
  });

  it("searches by city ignoring Polish diacritics", () => {
    const hits = searchPaczkomaty({ query: "lodz" });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.city === "Łódź")).toBe(true);
    expect(searchPaczkomaty({ query: "WAW123M" }).map((h) => h.id)).toEqual(["WAW123M"]);
  });

  it("sorts by distance when a position is given", () => {
    const krakowMarket = { lat: 50.0617, lng: 19.9373 };
    const hits = searchPaczkomaty({ near: krakowMarket, limit: 3 });
    expect(hits.map((h) => h.city)).toEqual(["Kraków", "Kraków", "Kraków"]);
    expect(hits[0].distanceKm!).toBeLessThanOrEqual(hits[1].distanceKm!);
  });

  it("generates 24-digit tracking numbers and refuses unknown lockers", () => {
    expect(generateTrackingNumber()).toMatch(/^6\d{23}$/);
    expect(createShipment("WAW123M")).toMatchObject({ lockerCode: "WAW123M", parcelSize: "A" });
    expect(() => createShipment("XXX1X")).toThrow();
  });
});

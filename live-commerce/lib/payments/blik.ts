import { randomBytes, randomUUID } from "node:crypto";

// BLIK via a Przelewy24-style gateway. The real integration is an HTTP call to
// the P24 "charge by code" / "charge by alias" endpoints followed by a webhook;
// this mock keeps the same contract so a real adapter can be dropped in.
//
// Sandbox codes (mirroring P24's test behaviour):
//   000000 → declined by the bank
//   111111 → code expired
//   any other 6 digits → approved (after the simulated "confirm in bank app")

export type BlikResult =
  | { status: "approved"; reference: string; alias: string | null }
  | { status: "declined"; reason: "declined" | "expired" | "alias_invalid" };

export interface BlikChargeRequest {
  orderId: string;
  amount: number; // grosze
  description: string;
  /** 6-digit code from the buyer's banking app… */
  code?: string;
  /** …or a OneClick alias registered on an earlier payment. */
  alias?: string;
  /** Register a OneClick alias with this payment. */
  registerAlias?: boolean;
  /** The alias the buyer currently has on file, for alias payments. */
  knownAlias?: string | null;
}

export interface PaymentProvider {
  chargeBlik(req: BlikChargeRequest): Promise<BlikResult>;
}

export const BLIK_CODE_PATTERN = /^\d{6}$/;

export function isValidBlikCode(code: string): boolean {
  return BLIK_CODE_PATTERN.test(code);
}

export class MockPrzelewy24Provider implements PaymentProvider {
  /** Simulates the buyer confirming the payment in their bank app. */
  constructor(private readonly confirmDelayMs = Number(process.env.BLIK_MOCK_DELAY_MS ?? 1500)) {}

  async chargeBlik(req: BlikChargeRequest): Promise<BlikResult> {
    if (this.confirmDelayMs > 0) await new Promise((r) => setTimeout(r, this.confirmDelayMs));

    if (req.alias) {
      if (!req.knownAlias || req.alias !== req.knownAlias) return { status: "declined", reason: "alias_invalid" };
      return { status: "approved", reference: this.reference(), alias: req.alias };
    }

    if (!req.code || !isValidBlikCode(req.code)) return { status: "declined", reason: "declined" };
    if (req.code === "000000") return { status: "declined", reason: "declined" };
    if (req.code === "111111") return { status: "declined", reason: "expired" };

    const alias = req.registerAlias ? `blik_ua_${randomBytes(12).toString("hex")}` : null;
    return { status: "approved", reference: this.reference(), alias };
  }

  private reference() {
    return `P24-${randomUUID().slice(0, 8).toUpperCase()}`;
  }
}

export const BLIK_DECLINE_MESSAGES: Record<Extract<BlikResult, { status: "declined" }>["reason"], string> = {
  declined: "Bank odrzucił płatność BLIK. Spróbuj ponownie z nowym kodem.",
  expired: "Kod BLIK wygasł. Wygeneruj nowy kod w aplikacji banku.",
  alias_invalid: "Płatność jednym kliknięciem jest niedostępna. Użyj kodu BLIK.",
};

let provider: PaymentProvider | null = null;
export function getPaymentProvider(): PaymentProvider {
  provider ??= new MockPrzelewy24Provider();
  return provider;
}
export function setPaymentProvider(p: PaymentProvider) {
  provider = p;
}

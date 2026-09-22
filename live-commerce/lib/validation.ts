import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Podaj poprawny adres e-mail."),
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_.]{3,24}$/, "Nazwa: 3–24 znaki, litery, cyfry, _ lub ."),
  password: z.string().min(8, "Hasło musi mieć co najmniej 8 znaków.").max(200),
  role: z.enum(["buyer", "seller"]).default("buyer"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Podaj poprawny adres e-mail."),
  password: z.string().min(1, "Podaj hasło."),
});

export const createStreamSchema = z.object({
  title: z.string().trim().min(3, "Tytuł musi mieć co najmniej 3 znaki.").max(120),
  category: z.string().trim().min(2, "Podaj kategorię.").max(40),
});

export const streamStatusSchema = z.object({ status: z.enum(["live", "ended"]) });

export const addProductSchema = z.object({
  title: z.string().trim().min(2, "Podaj nazwę przedmiotu.").max(120),
  description: z.string().trim().max(2000).default(""),
  startingPrice: z
    .number()
    .int()
    .min(100, "Cena wywoławcza to co najmniej 1 zł.")
    .max(10_000_000, "Cena wywoławcza to najwyżej 100 000 zł."),
  imageUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || v.startsWith("/") || /^https:\/\//.test(v), "Adres zdjęcia musi zaczynać się od https://")
    .optional(),
});

export const bidSchema = z.object({ amount: z.number().int().positive() });

export const chatSchema = z.object({ body: z.string().trim().min(1).max(280, "Maksymalnie 280 znaków.") });

export const lockerSchema = z.object({
  lockerCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}[0-9]{1,4}[A-Z]{1,3}$/, "Nieprawidłowy kod Paczkomatu."),
  remember: z.boolean().optional(),
});

export const blikSchema = z.union([
  z.object({ code: z.string().regex(/^\d{6}$/, "Kod BLIK musi mieć 6 cyfr."), rememberAlias: z.boolean().optional() }),
  z.object({ useAlias: z.literal(true) }),
]);

export const profileSchema = z.object({
  defaultPaczkomatId: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}[0-9]{1,4}[A-Z]{1,3}$/)
    .nullable()
    .optional(),
  forgetBlik: z.boolean().optional(),
});

export const inpostWebhookSchema = z.object({
  tracking_number: z.string().regex(/^\d{24}$/),
  status: z.enum(["ready_to_pickup", "delivered"]),
});

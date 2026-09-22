"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { api, ApiError } from "@/lib/client";
import { cn } from "@/lib/utils";

export function AuthForm({ mode, demoHint }: { mode: "login" | "register"; demoHint?: boolean }) {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [role, setRole] = useState<"buyer" | "seller">("buyer");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const { user } = await api<{ user: { role: string } }>(`/api/auth/${mode}`, {
        body: {
          email: form.get("email"),
          password: form.get("password"),
          ...(mode === "register" ? { username: form.get("username"), role } : {}),
        },
      });
      // Only follow same-site relative paths.
      const target = next?.startsWith("/") && !next.startsWith("//") ? next : user.role === "seller" ? "/seller" : "/";
      router.push(target);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Brak połączenia. Spróbuj ponownie.");
      setPending(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">{mode === "login" ? "Zaloguj się" : "Załóż konto"}</CardTitle>
        <CardDescription>
          {mode === "login" ? "Wróć do licytacji." : "Licytuj albo sprzedawaj na żywo — w minutę."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          {mode === "register" && (
            <>
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Rodzaj konta">
                {(["buyer", "seller"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={role === r}
                    onClick={() => setRole(r)}
                    className={cn(
                      "rounded-md py-2 text-sm font-semibold transition",
                      role === r ? "bg-card shadow-sm" : "text-muted-foreground",
                    )}
                  >
                    {r === "buyer" ? "Kupuję" : "Sprzedaję"}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Nazwa użytkownika</Label>
                <Input id="username" name="username" required minLength={3} maxLength={24} autoComplete="username" />
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Hasło</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={mode === "register" ? 8 : 1}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>
          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {mode === "login" ? "Zaloguj" : "Załóż konto"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {mode === "login" ? (
            <>
              Nie masz konta?{" "}
              <Link href="/register" className="font-semibold text-primary">
                Zarejestruj się
              </Link>
            </>
          ) : (
            <>
              Masz już konto?{" "}
              <Link href="/login" className="font-semibold text-primary">
                Zaloguj się
              </Link>
            </>
          )}
        </p>
        {demoHint && mode === "login" && (
          <div className="mt-4 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">Konta demo (hasło: demo1234)</p>
            <p>sprzedawca@demo.pl — sprzedawca</p>
            <p>kupujacy@demo.pl, kupujacy2@demo.pl — kupujący</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

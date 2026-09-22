import { Gavel, Package, Radio, UserRound } from "lucide-react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { LogoutButton } from "./logout-button";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-extrabold tracking-tight">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Gavel className="size-4" />
      </span>
      <span className="text-lg">Młotek</span>
    </Link>
  );
}

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
        <Logo />
        <nav className="ml-auto flex items-center gap-1 text-sm">
          {user?.role === "seller" || user?.role === "admin" ? (
            <Link href="/seller" className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium hover:bg-accent">
              <Radio className="size-4" />
              <span className="hidden sm:inline">Panel sprzedawcy</span>
            </Link>
          ) : null}
          {user ? (
            <>
              <Link href="/orders" className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium hover:bg-accent">
                <Package className="size-4" />
                <span className="hidden sm:inline">Zamówienia</span>
              </Link>
              <Link href="/account" className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium hover:bg-accent">
                <UserRound className="size-4" />
                <span className="max-w-24 truncate">{user.username}</span>
              </Link>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-md px-3 py-1.5 font-medium hover:bg-accent">
                Zaloguj
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Załóż konto
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

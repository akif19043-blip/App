"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Wyloguj"
      className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
      onClick={async () => {
        await api("/api/auth/logout", { body: {} });
        router.push("/");
        router.refresh();
      }}
    >
      <LogOut className="size-4" />
    </button>
  );
}

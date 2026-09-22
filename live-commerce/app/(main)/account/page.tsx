import type { Metadata } from "next";
import { AccountSettings } from "@/components/account/account-settings";
import { requirePageUser } from "@/lib/auth/page-guard";

export const metadata: Metadata = { title: "Konto" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requirePageUser("/account");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">@{user.username}</h1>
        <p className="text-muted-foreground">
          {user.email} · {user.role === "seller" ? "Sprzedawca" : user.role === "admin" ? "Administrator" : "Kupujący"}
        </p>
      </div>
      <AccountSettings initial={user} />
    </div>
  );
}

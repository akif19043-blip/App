import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { demoToolsEnabled } from "@/lib/config";

export const metadata: Metadata = { title: "Logowanie" };

export default function LoginPage() {
  return (
    <Suspense>
      <AuthForm mode="login" demoHint={demoToolsEnabled()} />
    </Suspense>
  );
}

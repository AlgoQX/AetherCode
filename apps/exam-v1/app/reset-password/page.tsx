import { redirect } from "next/navigation";
import { ResetPasswordForm } from "./reset-password-form";
import { Logo } from "@/components/ui";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) redirect("/forgot-password");

  return (
    <main className="relative isolate grid min-h-dvh place-items-center px-4 py-10">
      <div className="hero-glow absolute inset-0 -z-10 opacity-70" />
      <div className="w-full max-w-sm">
        <Logo className="mb-8" />
        <h1 className="font-display text-3xl font-semibold tracking-tight">Set new password</h1>
        <p className="mb-8 mt-2 text-sm text-muted">Choose a new password for your account.</p>
        <ResetPasswordForm token={token} />
      </div>
    </main>
  );
}

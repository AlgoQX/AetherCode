import type { Metadata } from "next";
import Image from "next/image";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col items-center px-5 pt-[14vh] pb-10">
      <div className="w-full max-w-[520px] animate-enter">
        <Image src="/logo.png" alt="AetherCode" width={44} height={44} priority className="mx-auto" />
        <h1 className="display mt-7 text-center text-[2.1rem] text-ink sm:text-[2.5rem]">Sign in to AetherCode</h1>
        <p className="mx-auto mt-3 max-w-[34ch] text-center text-[15px] leading-relaxed text-ink-muted">
          Use your roll number or username and the password from your college.
        </p>
        <div className="mx-auto max-w-[360px]">
          <LoginForm next={next ?? ""} />
        </div>
      </div>
      <p className="mt-auto pt-16 text-center text-xs text-ink-subtle">Trouble signing in? Ask your faculty or invigilator to reset your password.</p>
    </main>
  );
}

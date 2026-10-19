"use client";

import { Check, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Attempt } from "@/lib/api-types";
import { api } from "@/lib/client/api";
import { formatDateTime } from "@/lib/utils";

// Marks stay hidden until faculty release results (roadmap M6); this page
// confirms the submission and follows grading.
export function AttemptStatus({ tenantId, attemptId }: { tenantId: string; attemptId: string }) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    async function poll() {
      try {
        const latest = await api<Attempt>(`/submission/v1/tenants/${tenantId}/attempts/${attemptId}`);
        if (stopped) return;
        setAttempt(latest);
        if (latest.lifecycle_state === "active" || latest.lifecycle_state === "submitted" || latest.lifecycle_state === "grading") {
          setTimeout(poll, 3000);
        }
      } catch (caught) {
        if (!stopped) setError(caught instanceof Error ? caught.message : "Could not load your attempt.");
      }
    }
    void poll();
    return () => {
      stopped = true;
    };
  }, [tenantId, attemptId]);

  const pending = !attempt || attempt.lifecycle_state === "active";
  const graded = attempt?.lifecycle_state === "graded";

  return (
    <div className="mx-auto max-w-md animate-enter pt-6 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-success-soft text-success">
        {pending ? <LoaderCircle className="size-5 animate-spin" /> : <Check className="size-5" strokeWidth={2.25} />}
      </div>
      <h1 className="display mt-6 text-[2.2rem] text-ink">{pending ? "Handing in your work" : "Exam submitted"}</h1>
      {error ? (
        <p className="mt-3 text-sm text-danger">{error}</p>
      ) : (
        <p className="mx-auto mt-3 max-w-[36ch] text-[15px] leading-relaxed text-ink-muted">
          {pending
            ? "Submitting the code you saved last."
            : graded
              ? "Your answers have been graded. Your faculty will publish the results."
              : "Your answers are being graded. You can close this page."}
        </p>
      )}
      {attempt?.submitted_at && <p className="mt-2 text-[13px] text-ink-subtle">Received {formatDateTime(attempt.submitted_at)}</p>}
      <Button asChild variant="secondary" className="mt-9">
        <Link href="/student">Back to my exams</Link>
      </Button>
    </div>
  );
}

import { ArrowLeft, CalendarClock, Clock3 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Markdown } from "@/components/markdown";
import { LoadError, PageHeader } from "@/components/staff/page-header";
import type { ExamVersionContent, QuestionVersion } from "@/lib/api-types";
import { latestVersion } from "@/lib/server/exams";
import { gateway } from "@/lib/server/gateway";
import { requireCollege } from "@/lib/server/staff";
import { formatDuration, formatScoreText, formatWindow, languageName } from "@/lib/utils";

export const metadata: Metadata = { title: "Preview" };

/** The exam as a student reads it: instructions, then each question in order. */
export default async function PreviewPage({ params }: { params: Promise<{ examId: string }> }) {
  const staff = await requireCollege();
  const { examId } = await params;
  let data;
  try {
    const version = await latestVersion(staff.tenantId, examId);
    if (!version) throw new Error("This exam has no version.");
    const content = await gateway<ExamVersionContent>(`/assessment/v1/tenants/${staff.tenantId}/exam-versions/${version.id}/content`);
    const items = content.sections
      .toSorted((a, b) => a.position - b.position)
      .flatMap((section) => section.items.toSorted((a, b) => a.position - b.position));
    const questions = await Promise.all(items.map((item) => gateway<QuestionVersion>(`/question-bank/v1/question-versions/${item.question_version_id}`)));
    data = { version, items, questions };
  } catch (error) {
    return (
      <>
        <PageHeader title="Preview" />
        <LoadError error={error} />
      </>
    );
  }
  const { version, items, questions } = data;

  return (
    <div className="mx-auto max-w-[760px]">
      <Link href={`/staff/exams/${examId}`} className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" strokeWidth={1.75} />
        Back to the exam
      </Link>
      <p className="rounded-[var(--radius-control)] bg-brand-soft px-4 py-2 text-sm text-brand-soft-ink">Preview: this is what students read. Nothing here is saved.</p>

      <h1 className="display mt-8 text-[2.1rem] text-ink">{version.title}</h1>
      <div className="mt-4 flex flex-wrap gap-2 text-[13px] text-ink-muted">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1">
          <CalendarClock className="size-3.5" strokeWidth={1.75} />
          {formatWindow(version.opens_at, version.closes_at)}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1">
          <Clock3 className="size-3.5" strokeWidth={1.75} />
          {formatDuration(version.duration_seconds)}
        </span>
      </div>
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-ink-muted">Instructions</h2>
        <Markdown>{version.instructions_markdown}</Markdown>
      </section>

      {questions.map((question, index) => (
        <article key={items[index]!.id} className="mt-12 border-t border-line pt-8">
          <p className="text-[13px] text-ink-muted">
            Question {index + 1} of {questions.length}
          </p>
          <h2 className="display mt-1.5 text-[1.75rem] text-ink">{question.title}</h2>
          <p className="mt-3 flex flex-wrap gap-2 text-[13px] text-ink-muted">
            <span className="rounded-full bg-brand-soft px-2.5 py-0.5 font-medium text-brand-soft-ink">{formatScoreText(Number(items[index]!.maximum_score))} marks</span>
            <span className="rounded-full bg-hover px-2.5 py-0.5">Time limit {question.time_limit_ms / 1000} s</span>
            <span className="rounded-full bg-hover px-2.5 py-0.5">Memory {Math.round(question.memory_limit_kib / 1024)} MB</span>
            <span className="rounded-full bg-hover px-2.5 py-0.5">{question.supported_languages.map(languageName).join(", ")}</span>
          </p>
          <Markdown className="mt-6">{question.prompt_markdown}</Markdown>
          <p className="mt-4 text-[13px] text-ink-subtle">
            {question.sample_test_case_count} sample test{question.sample_test_case_count === 1 ? "" : "s"} shown to students on Run, {question.hidden_test_case_count} hidden.
          </p>
        </article>
      ))}
    </div>
  );
}

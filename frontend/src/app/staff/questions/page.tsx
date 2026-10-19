import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, LoadError, PageHeader } from "@/components/staff/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import type { Page, QuestionDetail } from "@/lib/api-types";
import { gateway } from "@/lib/server/gateway";
import { requireStaff } from "@/lib/server/staff";
import { cn, languageName } from "@/lib/utils";

export const metadata: Metadata = { title: "Questions" };

const DIFFICULTY_TONE = { easy: "success", medium: "warning", hard: "danger" } as const;

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireStaff();
  const drafts = (await searchParams).tab === "drafts";
  let questions: QuestionDetail[];
  try {
    questions = (await gateway<Page<QuestionDetail>>(`/question-bank/v1/questions?limit=100${drafts ? "&status=draft" : ""}`)).items;
  } catch (error) {
    return (
      <>
        <PageHeader title="Questions" />
        <LoadError error={error} />
      </>
    );
  }
  return (
    <>
      <PageHeader
        title="Questions"
        description="One question bank shared by every college. Published questions can be added to any exam."
        actions={
          <Button asChild>
            <Link href="/staff/questions/new">
              <Plus />
              New question
            </Link>
          </Button>
        }
      />
      <nav aria-label="Question lists" className="mb-4 flex gap-1.5">
        {[
          { href: "/staff/questions", label: "Published", active: !drafts },
          { href: "/staff/questions?tab=drafts", label: "My drafts", active: drafts },
        ].map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={cn("rounded-full px-3 py-1 text-[13px]", tab.active ? "bg-ink text-canvas" : "bg-hover text-ink-muted hover:text-ink")}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {questions.length === 0 ? (
        <EmptyState>{drafts ? "You have no drafts." : "No published questions yet. Write one and publish it."}</EmptyState>
      ) : (
        <ul className="overflow-hidden rounded-[var(--radius-surface)] border border-line bg-surface">
          {questions.map(({ question, question_version: version }, index) => (
            <li key={version.id} className={cn(index > 0 && "border-t border-line")}>
              <Link href={`/staff/questions/${version.id}`} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-hover">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-ink">{version.title}</p>
                  <p className="mt-0.5 truncate text-[13px] text-ink-muted">
                    {question.slug}, {version.supported_languages.map(languageName).join(", ")}, {version.sample_test_case_count} sample and{" "}
                    {version.hidden_test_case_count} hidden tests
                  </p>
                </div>
                <Badge tone={DIFFICULTY_TONE[version.difficulty]}>{version.difficulty}</Badge>
                {version.status === "draft" && <Badge>Draft v{version.version_number}</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

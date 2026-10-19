"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/staff/form";
import type { QuestionDetail, QuestionVersion } from "@/lib/api-types";
import { actionError } from "@/lib/server/actions";
import { gateway } from "@/lib/server/gateway";
import { requireStaff } from "@/lib/server/staff";

/** The version fields shared by a new question and a new draft version. */
function versionContent(form: FormData) {
  return {
    title: String(form.get("title") ?? "").trim(),
    prompt_markdown: String(form.get("prompt_markdown") ?? ""),
    difficulty: String(form.get("difficulty") ?? "easy"),
    supported_languages: form.getAll("languages").map(String),
    time_limit_ms: Math.round(Number(form.get("time_limit_seconds") ?? 2) * 1000),
    memory_limit_kib: Math.round(Number(form.get("memory_limit_mb") ?? 256) * 1024),
    tags: [],
  };
}

export async function createQuestion(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireStaff();
  const content = versionContent(form);
  if (content.supported_languages.length === 0) return { error: "Choose at least one language." };
  const slug =
    String(form.get("slug") ?? "").trim() ||
    content.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  let created: QuestionDetail;
  try {
    created = await gateway<QuestionDetail>("/question-bank/v1/questions", { method: "POST", body: { slug, ...content } });
  } catch (error) {
    return { error: actionError(error) };
  }
  redirect(`/staff/questions/${created.question_version.id}`);
}

export type Test = { input: string; expected_output: string; sample: boolean; weight: number };

export async function saveTests(versionId: string, expectedVersion: number, tests: Test[]): Promise<ActionState> {
  await requireStaff();
  if (!tests.some((test) => test.sample)) return { error: "Mark at least one test as a sample, so students can run their code." };
  if (!tests.some((test) => !test.sample)) return { error: "Add at least one hidden test. Hidden tests decide the marks." };
  try {
    await gateway<QuestionVersion>(`/question-bank/v1/question-versions/${versionId}/tests`, {
      method: "PUT",
      body: { expected_question_version: expectedVersion, tests },
    });
  } catch (error) {
    return { error: actionError(error) };
  }
  revalidatePath(`/staff/questions/${versionId}`);
  return { error: null, message: `${tests.length} tests saved and encrypted.` };
}

export async function publishQuestion(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireStaff();
  const versionId = String(form.get("version_id"));
  try {
    await gateway(`/question-bank/v1/question-versions/${versionId}/publish`, {
      method: "POST",
      body: { expected_question_version: Number(form.get("expected_version")) },
    });
  } catch (error) {
    return { error: actionError(error) };
  }
  revalidatePath(`/staff/questions/${versionId}`);
  revalidatePath("/staff/questions");
  return { error: null, message: "Published. Faculty in every college can now add it to exams." };
}

/** Starts an editable draft from a published question, copying its content. */
export async function draftNewVersion(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireStaff();
  const questionId = String(form.get("question_id"));
  let created: QuestionDetail;
  try {
    const current = await gateway<QuestionDetail>(`/question-bank/v1/questions/${questionId}`);
    const version = current.question_version;
    created = await gateway<QuestionDetail>(`/question-bank/v1/questions/${questionId}/versions`, {
      method: "POST",
      body: {
        expected_question_revision: current.question.version,
        title: version.title,
        prompt_markdown: version.prompt_markdown,
        difficulty: version.difficulty,
        supported_languages: version.supported_languages,
        time_limit_ms: version.time_limit_ms,
        memory_limit_kib: version.memory_limit_kib,
        tags: [],
      },
    });
  } catch (error) {
    return { error: actionError(error) };
  }
  redirect(`/staff/questions/${created.question_version.id}`);
}

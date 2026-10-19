import "server-only";
import type { Exam, ExamVersion, Page } from "@/lib/api-types";
import { gateway } from "./gateway";

/** An exam with its newest version (title, window and status live on versions). */
export type ExamWithVersion = { exam: Exam; version: ExamVersion | null };

export async function latestVersion(tenantId: string, examId: string): Promise<ExamVersion | null> {
  const versions = (await gateway<Page<ExamVersion>>(`/assessment/v1/tenants/${tenantId}/exams/${examId}/versions?limit=100`)).items;
  return versions.reduce<ExamVersion | null>((newest, version) => (!newest || version.version_number > newest.version_number ? version : newest), null);
}

export async function listExams(tenantId: string): Promise<ExamWithVersion[]> {
  const exams = (await gateway<Page<Exam>>(`/assessment/v1/tenants/${tenantId}/exams?limit=100`)).items;
  return Promise.all(exams.map(async (exam) => ({ exam, version: await latestVersion(tenantId, exam.id) })));
}

import "server-only";
import type { Exam, ExamVersion, Page } from "@/lib/api-types";
import { gateway } from "./gateway";

/** An exam with its newest version (title, window and status live on versions). */
export type ExamWithVersion = { exam: Exam; version: ExamVersion | null };

export async function latestVersion(tenantId: string, examId: string): Promise<ExamVersion | null> {
  const versions = (await gateway<Page<ExamVersion>>(`/assessment/v1/tenants/${tenantId}/exams/${examId}/versions?limit=100`)).items;
  return versions.reduce<ExamVersion | null>((newest, version) => (!newest || version.version_number > newest.version_number ? version : newest), null);
}

/**
 * Every exam of a college with its newest version. The list carries each
 * exam's latest version (ADR-0043), so this is one request per 100 exams,
 * not one per exam; the per-exam call remains for an older Assessment.
 */
export async function listExams(tenantId: string): Promise<ExamWithVersion[]> {
  const exams: (Exam & { latest_version?: ExamVersion })[] = [];
  let cursor = "";
  for (let page = 0; page < 20; page++) {
    const result = await gateway<Page<Exam & { latest_version?: ExamVersion }>>(
      `/assessment/v1/tenants/${tenantId}/exams?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    exams.push(...result.items);
    if (!result.next_cursor) break;
    cursor = result.next_cursor;
  }
  return mapLimit(exams, 6, async ({ latest_version, ...exam }) => ({
    exam,
    version: latest_version ?? (await latestVersion(tenantId, exam.id)),
  }));
}

/** Maps with at most `limit` calls in flight, to stay under the gateway's per-user rate limit. */
export async function mapLimit<T, R>(items: T[], limit: number, map: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await map(items[index]!);
      }
    }),
  );
  return results;
}

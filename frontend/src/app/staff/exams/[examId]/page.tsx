import { Activity, ArrowLeft, BarChart3, Download, Eye } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field, Select, TextArea, TextInput } from "@/components/staff/form";
import { EmptyState, LoadError, PageHeader, Section, Table } from "@/components/staff/page-header";
import { Button } from "@/components/ui/button";
import { Badge, Panel } from "@/components/ui/card";
import type { ExamVersionContent, Page, QuestionDetail, SebPolicy } from "@/lib/api-types";
import { departmentLabel, listBatches, listDepartments, listPlacement } from "@/lib/server/directory";
import { latestVersion } from "@/lib/server/exams";
import { GatewayError, gateway } from "@/lib/server/gateway";
import { requireCollege } from "@/lib/server/staff";
import { formatDuration, formatScoreText, formatWindow, isoToCollegeTime } from "@/lib/utils";
import { addQuestion, duplicateExam, publishExam, saveSebPolicy } from "../actions";
import { AssignForm } from "./assign-form";

export const metadata: Metadata = { title: "Exam" };

const TARGET_LABEL = { batch: "Batch", department: "College department", placement_department: "Placement department", student: "Student" };

async function sebPolicy(tenantId: string, examId: string): Promise<SebPolicy | null> {
  try {
    return await gateway<SebPolicy>(`/seb/v1/tenants/${tenantId}/exams/${examId}/seb-policy`);
  } catch (error) {
    if (error instanceof GatewayError && error.status === 404) return null;
    throw error;
  }
}

export default async function ExamPage({ params }: { params: Promise<{ examId: string }> }) {
  const staff = await requireCollege();
  const { examId } = await params;
  let data;
  try {
    const version = await latestVersion(staff.tenantId, examId);
    if (!version) throw new Error("This exam has no version.");
    const [content, questions, batches, departments, placement, seb] = await Promise.all([
      gateway<ExamVersionContent>(`/assessment/v1/tenants/${staff.tenantId}/exam-versions/${version.id}/content`),
      gateway<Page<QuestionDetail>>("/question-bank/v1/questions?limit=100"),
      listBatches(staff.tenantId),
      listDepartments(staff.tenantId),
      listPlacement(),
      sebPolicy(staff.tenantId, examId),
    ]);
    data = { version, content, questions: questions.items, batches, departments, placement, seb };
  } catch (error) {
    return (
      <>
        <PageHeader title="Exam" />
        <LoadError error={error} />
      </>
    );
  }
  const { version, content, questions, batches, departments, placement, seb } = data;
  const draft = version.status === "draft";
  const items = content.sections.flatMap((section) => section.items);
  const total = items.reduce((sum, item) => sum + Number(item.maximum_score), 0);
  const targetName = new Map<string, string>([
    ...batches.map((batch) => [batch.id, batch.name] as const),
    ...departments.map((department) => [department.id, departmentLabel(department)] as const),
    ...placement.organizations.flatMap((organization) => organization.departments.map((department) => [department.id, departmentLabel(department)] as const)),
  ]);

  return (
    <>
      <Link href="/staff/exams" className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" strokeWidth={1.75} />
        Exams
      </Link>
      <PageHeader
        title={version.title}
        description={`${formatWindow(version.opens_at, version.closes_at)}, ${formatDuration(version.duration_seconds)} per student`}
        actions={
          <>
            <Badge tone={draft ? "neutral" : "success"}>{draft ? "Draft" : "Published"}</Badge>
            {items.length > 0 && (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/staff/exams/${examId}/preview`}>
                  <Eye />
                  Preview
                </Link>
              </Button>
            )}
            {!draft && (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/staff/exams/${examId}/monitor`}>
                  <Activity />
                  Live monitor
                </Link>
              </Button>
            )}
            {!draft && (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/staff/exams/${examId}/results`}>
                  <BarChart3 />
                  Results
                </Link>
              </Button>
            )}
          </>
        }
      />

      <Section title={`Questions, ${formatScoreText(total)} marks in total`}>
        {items.length === 0 ? (
          <EmptyState>No questions yet.</EmptyState>
        ) : (
          <Table head={["#", "Question", "Marks"]}>
            {items.map((item) => (
              <tr key={item.id}>
                <td className="w-10 px-4 py-2.5 text-ink-muted">{item.position}</td>
                <td className="px-4 py-2.5 text-ink">{item.question_title ?? "Question"}</td>
                <td className="px-4 py-2.5 tabular-nums text-ink">{formatScoreText(Number(item.maximum_score))}</td>
              </tr>
            ))}
          </Table>
        )}
        {draft && (
          <div className="mt-4 grid gap-4 md:grid-cols-[1.4fr_1fr]">
            <Panel className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-ink">Add a question</h3>
              {questions.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  Publish a question first, in <Link href="/staff/questions" className="text-brand hover:underline">Questions</Link>.
                </p>
              ) : (
                <ActionForm action={addQuestion} submitLabel="Add question">
                  <input type="hidden" name="exam_id" value={examId} />
                  <input type="hidden" name="version_id" value={version.id} />
                  <div className="grid grid-cols-[1fr_7rem] gap-3">
                    <Field label="Published question" htmlFor="add-question">
                      <Select id="add-question" name="question_version_id" required>
                        {questions.map(({ question_version: question }) => (
                          <option key={question.id} value={question.id}>
                            {question.title} ({question.difficulty})
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Marks" htmlFor="add-marks">
                      <TextInput id="add-marks" name="maximum_score" type="number" min={1} max={1000} defaultValue={10} required />
                    </Field>
                  </div>
                </ActionForm>
              )}
            </Panel>
            <Panel className="p-5">
              <h3 className="mb-2 text-sm font-semibold text-ink">Publish</h3>
              <p className="mb-4 text-[13px] text-ink-muted">A published exam cannot change. Check the questions and marks first.</p>
              {items.length > 0 ? (
                <ActionForm action={publishExam} submitLabel="Publish exam">
                  <input type="hidden" name="exam_id" value={examId} />
                  <input type="hidden" name="version_id" value={version.id} />
                </ActionForm>
              ) : (
                <p className="text-[13px] text-ink-muted">Add at least one question.</p>
              )}
            </Panel>
          </div>
        )}
      </Section>

      {!draft && (
        <Section title="Assigned to" description="Students in a target see the exam on their dashboard. New students who join later get it too.">
          {content.assignment_rules.length > 0 && (
            <div className="mb-4">
              <Table head={["Target", "Window", "Students"]}>
                {content.assignment_rules.map((rule) => (
                  <tr key={rule.id}>
                    <td className="px-4 py-2.5 text-ink">
                      {TARGET_LABEL[rule.target_type]}: {targetName.get(rule.target_id) ?? rule.target_id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-2.5 text-ink-muted">{formatWindow(rule.available_from, rule.available_until)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-ink">{rule.assigned_candidates}</td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
          <Panel className="p-5">
            <AssignForm
              examId={examId}
              versionId={version.id}
              opens={isoToCollegeTime(version.opens_at)}
              closes={isoToCollegeTime(version.closes_at)}
              targets={{
                batch: batches.map((batch) => ({ id: batch.id, label: `${batch.name} (${batch.academic_year})` })),
                department: departments.filter((department) => department.department_type === "college").map((department) => ({ id: department.id, label: departmentLabel(department) })),
                placement_department: placement.organizations.flatMap((organization) =>
                  organization.departments.map((department) => ({ id: department.id, label: `${departmentLabel(department)}, ${organization.legal_name}` })),
                ),
              }}
            />
          </Panel>
        </Section>
      )}

      <Section title="Duplicate" description="A new draft with these questions, marks, instructions and duration, for another sitting. Assignments and lab lock are not copied.">
        <Panel className="p-5">
          <ActionForm action={duplicateExam} submitLabel="Duplicate exam">
            <input type="hidden" name="version_id" value={version.id} />
            <Field label="Title" htmlFor="copy-title">
              <TextInput id="copy-title" name="title" defaultValue={`${version.title} (copy)`} maxLength={300} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Opens" htmlFor="copy-opens">
                <TextInput id="copy-opens" name="opens_at" type="datetime-local" defaultValue={isoToCollegeTime(version.opens_at)} required />
              </Field>
              <Field label="Closes" htmlFor="copy-closes">
                <TextInput id="copy-closes" name="closes_at" type="datetime-local" defaultValue={isoToCollegeTime(version.closes_at)} required />
              </Field>
            </div>
          </ActionForm>
        </Panel>
      </Section>

      <Section title="Safe Exam Browser" description="Lock the exam to the lab's Safe Exam Browser. Students then start it from the launch file.">
        <Panel className="p-5">
          <ActionForm action={saveSebPolicy} submitLabel="Save lock settings">
            <input type="hidden" name="exam_id" value={examId} />
            <input type="hidden" name="title" value={version.title} />
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="enabled" defaultChecked={seb?.enabled ?? false} className="accent-[var(--brand)]" />
              Require Safe Exam Browser
            </label>
            <Field label="Browser Exam Keys or Config Keys" htmlFor="seb-keys" hint="From Safe Exam Browser on a lab machine. One per line.">
              <TextArea id="seb-keys" name="accepted_keys" defaultValue={(seb?.accepted_keys ?? []).join("\n")} className="font-mono text-xs" spellCheck={false} />
            </Field>
          </ActionForm>
          {seb?.enabled && (
            <Button asChild variant="secondary" size="sm" className="mt-4">
              <a href={`/api/seb/v1/tenants/${staff.tenantId}/exams/${examId}/seb-policy/launch-file`} download>
                <Download />
                Download launch file
              </a>
            </Button>
          )}
        </Panel>
      </Section>
    </>
  );
}

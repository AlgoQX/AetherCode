import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader, Table } from "@/components/staff/page-header";
import { Badge } from "@/components/ui/card";
import { gateway } from "@/lib/server/gateway";
import { requireStaff } from "@/lib/server/staff";
import { formatTime } from "@/lib/utils";

export const metadata: Metadata = { title: "System status" };

/** What each service does, as staff would describe it. */
const SERVICES = [
  ["identity", "Sign-in and passwords"],
  ["tenant", "Colleges, departments and batches"],
  ["user", "Accounts, students and permissions"],
  ["question-bank", "Questions and test cases"],
  ["assessment", "Exams and assignments"],
  ["submission", "Attempts, runs and grading"],
  ["seb", "Safe Exam Browser lockdown"],
  ["notification", "Notifications"],
  ["analytics", "Results and reports"],
] as const;

type Check = { service: string; purpose: string; ready: boolean; milliseconds: number };

/** A service is ready when it and its database answer; readiness carries nothing else. */
async function check(service: string, purpose: string): Promise<Check> {
  const started = performance.now();
  const ready = await gateway(`/${service}/readyz`).then(
    () => true,
    () => false,
  );
  return { service, purpose, ready, milliseconds: Math.round(performance.now() - started) };
}

export default async function StatusPage() {
  const staff = await requireStaff();
  if (!staff.canManageAccounts) redirect("/staff");
  const checks = await Promise.all(SERVICES.map(([service, purpose]) => check(service, purpose)));
  const down = checks.filter((entry) => !entry.ready);

  return (
    <>
      <PageHeader
        title="System status"
        description={`Checked ${formatTime(new Date())}. Reload to check again. The code-execution engine is checked by grading itself: a run that never finishes shows on the exam screen.`}
        actions={<Badge tone={down.length ? "danger" : "success"}>{down.length ? `${down.length} not ready` : "All services ready"}</Badge>}
      />
      <Table head={["Service", "What it does", "Status", "Response"]}>
        {checks.map((entry) => (
          <tr key={entry.service}>
            <td className="px-4 py-2.5 font-mono text-[13px] text-ink">{entry.service}</td>
            <td className="px-4 py-2.5 text-ink-muted">{entry.purpose}</td>
            <td className="px-4 py-2.5">
              <Badge tone={entry.ready ? "success" : "danger"}>{entry.ready ? "Ready" : "Not ready"}</Badge>
            </td>
            <td className="px-4 py-2.5 font-mono tabular-nums text-ink-muted">{entry.milliseconds} ms</td>
          </tr>
        ))}
      </Table>
    </>
  );
}

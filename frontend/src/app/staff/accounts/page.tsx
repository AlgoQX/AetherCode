import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoadError, PageHeader } from "@/components/staff/page-header";
import { Panel } from "@/components/ui/card";
import { listDepartments } from "@/lib/server/directory";
import { requireCollege } from "@/lib/server/staff";
import { CreateStaffForm } from "./create-staff-form";

export const metadata: Metadata = { title: "Staff accounts" };

export default async function StaffAccountsPage() {
  const staff = await requireCollege();
  if (!staff.canManageAccounts) redirect("/staff");
  let departments;
  try {
    departments = (await listDepartments(staff.tenantId)).filter((department) => department.department_type === "college");
  } catch (error) {
    return (
      <>
        <PageHeader title="Staff accounts" />
        <LoadError error={error} />
      </>
    );
  }
  return (
    <>
      <PageHeader
        title="Staff accounts"
        description="Faculty author questions and run exams for their department. College administrators also manage students, staff and departments."
      />
      <Panel className="p-5 sm:p-6">
        <CreateStaffForm departments={departments} />
      </Panel>
    </>
  );
}

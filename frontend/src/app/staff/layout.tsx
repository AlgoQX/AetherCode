import { AppShell } from "@/components/app-shell";
import type { NavItem } from "@/components/nav-links";
import { TenantSwitcher } from "@/components/staff/tenant-switcher";
import { requireStaff } from "@/lib/server/staff";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const nav: NavItem[] = [
    { href: "/staff", label: "Overview", icon: "home" },
    { href: "/staff/exams", label: "Exams", icon: "exams" },
    { href: "/staff/questions", label: "Questions", icon: "questions" },
  ];
  if (staff.canManageAccounts) {
    nav.push(
      { href: "/staff/students", label: "Students", icon: "students" },
      { href: "/staff/organisation", label: "Departments", icon: "organisation" },
      { href: "/staff/accounts", label: "Staff accounts", icon: "accounts" },
    );
  }
  return (
    <AppShell viewer={staff.viewer} nav={nav} wide>
      {staff.isPlatformAdmin && <TenantSwitcher tenants={staff.tenants} current={staff.tenantId} />}
      {children}
    </AppShell>
  );
}

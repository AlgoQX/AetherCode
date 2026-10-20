import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireViewer } from "@/lib/server/session";
import { isStaff, isStudent } from "@/lib/viewer";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  if (!isStudent(viewer) && isStaff(viewer)) redirect("/staff");
  return (
    <AppShell viewer={viewer} nav={[
          { href: "/student", label: "My exams", icon: "exams" },
          { href: "/student/help", label: "Help", icon: "help" },
        ]}>
      {children}
    </AppShell>
  );
}

"use client";

import { BookOpen, Building2, House, NotebookPen, UserCog, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ICONS = { exams: NotebookPen, home: House, questions: BookOpen, students: Users, organisation: Building2, accounts: UserCog };

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        // "/staff" is everyone's parent, so it is active only on its own page.
        const active = pathname === item.href || (item.href !== "/staff" && pathname.startsWith(`${item.href}/`));
        const Icon = ICONS[item.icon];
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 text-sm transition-colors",
                active ? "bg-hover font-medium text-ink" : "text-ink-muted hover:bg-hover hover:text-ink",
              )}
            >
              <Icon className="size-[18px]" strokeWidth={1.75} />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

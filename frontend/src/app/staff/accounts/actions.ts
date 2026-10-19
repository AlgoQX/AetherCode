"use server";

import type { ActionState } from "@/components/staff/form";
import { actionError } from "@/lib/server/actions";
import { gateway } from "@/lib/server/gateway";
import { requireCollege } from "@/lib/server/staff";

export type StaffState = ActionState & { created?: { username: string; name: string; password: string } };

export async function createStaff(_previous: StaffState, form: FormData): Promise<StaffState> {
  const { tenantId } = await requireCollege();
  const role = String(form.get("role"));
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const name = String(form.get("display_name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  try {
    const result = await gateway<{ password: string }>(`/user/v1/tenants/${tenantId}/staff`, {
      method: "POST",
      body: {
        username,
        display_name: name,
        role,
        ...(email ? { email } : {}),
        ...(role === "department_user" ? { department_id: String(form.get("department_id")) } : {}),
      },
    });
    return { error: null, message: `${name} can now sign in as ${username}.`, created: { username, name, password: result.password } };
  } catch (error) {
    return { error: actionError(error) };
  }
}

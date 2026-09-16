"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { setFeedbackStatus } from "@/lib/feedback";

/**
 * The console's only write. A server action is a public POST endpoint, so it
 * checks for an admin itself rather than trusting the page that rendered the
 * button.
 */
export async function setStatus(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id");
  const status = formData.get("status");
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(id)) return;
  if (status !== "new" && status !== "resolved") return;
  await setFeedbackStatus(id, status);
  revalidatePath("/admin/feedback");
}

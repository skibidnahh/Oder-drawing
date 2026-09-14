import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db/schema";

export async function audit(
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  details?: Record<string, unknown>,
): Promise<void> {
  await db.insert(auditLogsTable).values({
    actorId,
    action,
    entityType,
    entityId,
    details: details ?? null,
  });
}
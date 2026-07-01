import { AuditAction, AuditResource } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../config/logger";

export async function createAuditLog(params: {
  userId: string;
  externalCustomerId?: string | null;
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        externalCustomerId: params.externalCustomerId ?? null,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId ?? null,
        metadata: params.metadata ? (params.metadata as import("@prisma/client").Prisma.InputJsonValue) : undefined,
      },
    });
  } catch (err) {
    // Audit log failure must never break the main operation
    logger.error({ err, params }, "Failed to write audit log");
  }
}

export async function listAuditLogs(
  userId: string,
  filters: {
    externalCustomerId?: string;
    resource?: AuditResource;
    action?: AuditAction;
    page?: number;
    limit?: number;
  }
) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const skip = (page - 1) * limit;

  const where = {
    userId,
    ...(filters.externalCustomerId ? { externalCustomerId: filters.externalCustomerId } : {}),
    ...(filters.resource ? { resource: filters.resource } : {}),
    ...(filters.action ? { action: filters.action } : {}),
  };

  const [total, data] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return { data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

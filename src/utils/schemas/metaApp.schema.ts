import { z } from "zod";

export const createMetaAppSchema = z.object({
  appId: z.string().regex(/^\d+$/, "Meta App ID must be numeric"),
  appSecret: z.string().min(1),
  label: z.string().min(1).max(120).optional(),
});

export const metaAppIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type CreateMetaAppInput = z.infer<typeof createMetaAppSchema>;

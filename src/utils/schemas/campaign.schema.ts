import { z } from "zod";

const objectiveEnum = z.enum(["AWARENESS", "TRAFFIC", "ENGAGEMENT", "LEADS", "APP_PROMOTION", "SALES"]);
const statusEnum = z.enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED", "DRAFT"]);

export const createCampaignSchema = z.object({
  metaAccountId: z.string().uuid(),
  name: z.string().min(1).max(255),
  objective: objectiveEnum,
  status: statusEnum.default("DRAFT"),
  dailyBudgetCents: z.number().int().positive().optional(),
  lifetimeBudgetCents: z.number().int().positive().optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
});

export const updateCampaignSchema = createCampaignSchema.partial().omit({ metaAccountId: true });

export const campaignIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

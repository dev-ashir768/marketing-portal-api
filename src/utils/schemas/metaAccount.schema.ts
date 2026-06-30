import { z } from "zod";

export const connectMetaAccountSchema = z.object({
  metaAdAccountId: z.string().regex(/^act_\d+$/, "Must be a Meta ad account id like act_123456"),
  businessName: z.string().min(1).max(255).optional(),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
  tokenExpiresAt: z.coerce.date().optional(),
  // Reference to a server-to-server integrator's own customer/tenant — opaque to us.
  externalCustomerId: z.string().min(1).max(255).optional(),
});

export type ConnectMetaAccountInput = z.infer<typeof connectMetaAccountSchema>;

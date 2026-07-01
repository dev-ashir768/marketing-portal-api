import { FacebookAdsApi, AdAccount, Campaign } from "facebook-nodejs-business-sdk";
import { env } from "../config/env";
import { decryptToken } from "../utils/crypto";
import { AppError } from "../utils/AppError";
import { MetaAccount } from "@prisma/client";
import { deactivateMetaAccount } from "./metaAccount.service";
import { logger } from "../config/logger";

// Meta's OAuthException error code for an invalid/expired/revoked access token.
const META_INVALID_TOKEN_CODE = 190;

function isMetaAuthError(err: unknown): boolean {
  const code = (err as { response?: { error?: { code?: number } } })?.response?.error?.code;
  return code === META_INVALID_TOKEN_CODE;
}

// Initializes a scoped FacebookAdsApi + AdAccount instance per request,
// using the account's decrypted access token. Never caches a global/shared
// API instance across tenants — each call gets its own isolated client.
export class MetaAccountClient {
  private readonly adAccount: InstanceType<typeof AdAccount>;
  private readonly metaAccountId: string;

  constructor(metaAccount: MetaAccount) {
    if (!metaAccount.isActive) {
      throw new AppError("This Meta account is disconnected. Please reconnect via OAuth.", 401);
    }
    if (metaAccount.tokenExpiresAt && metaAccount.tokenExpiresAt.getTime() < Date.now()) {
      throw new AppError("This Meta account's access token has expired. Please reconnect via OAuth.", 401);
    }

    this.metaAccountId = metaAccount.id;

    const accessToken = decryptToken({
      ciphertext: metaAccount.accessTokenEncrypted,
      iv: metaAccount.accessTokenIv,
      authTag: metaAccount.accessTokenAuthTag,
    });

    const api = FacebookAdsApi.init(accessToken);

    this.adAccount = new AdAccount(metaAccount.metaAdAccountId, undefined, api);
  }

  // Centralizes the "Meta says this token is dead" handling: mark the row
  // inactive so future requests fail fast instead of repeatedly hitting Meta,
  // and surface a clear 401 telling the caller to reconnect.
  private async handleMetaError(err: unknown, fallbackMessage: string): Promise<never> {
    if (isMetaAuthError(err)) {
      await deactivateMetaAccount(this.metaAccountId);
      logger.warn({ metaAccountId: this.metaAccountId }, "Meta access token invalid/expired — account deactivated");
      throw new AppError("Meta access token is no longer valid. Please reconnect this account.", 401);
    }
    throw new AppError(fallbackMessage, 502, err);
  }

  async createCampaign(params: {
    name: string;
    objective: string;
    status: "ACTIVE" | "PAUSED";
    dailyBudgetCents?: number;
  }) {
    try {
      const fields: string[] = [];
      const createParams: Record<string, unknown> = {
        name: params.name,
        objective: params.objective,
        status: params.status,
        special_ad_categories: [],
      };
      if (params.dailyBudgetCents) {
        createParams.daily_budget = params.dailyBudgetCents;
      }

      const campaign = await this.adAccount.createCampaign(fields, createParams);
      return campaign as InstanceType<typeof Campaign>;
    } catch (err) {
      return this.handleMetaError(err, "Failed to create campaign on Meta");
    }
  }

  async listCampaigns() {
    try {
      return await this.adAccount.getCampaigns(["id", "name", "status", "objective"]);
    } catch (err) {
      return this.handleMetaError(err, "Failed to fetch campaigns from Meta");
    }
  }

  async syncCampaigns(): Promise<Array<{ id: string; name: string; status: string; objective: string; daily_budget?: string; lifetime_budget?: string; start_time?: string; stop_time?: string }>> {
    try {
      const campaigns = await this.adAccount.getCampaigns([
        "id", "name", "status", "objective",
        "daily_budget", "lifetime_budget", "start_time", "stop_time",
      ]);
      return campaigns as unknown as Array<{ id: string; name: string; status: string; objective: string; daily_budget?: string; lifetime_budget?: string; start_time?: string; stop_time?: string }>;
    } catch (err) {
      return this.handleMetaError(err, "Failed to sync campaigns from Meta");
    }
  }
}

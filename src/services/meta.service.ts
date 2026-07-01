import { FacebookAdsApi, AdAccount } from "facebook-nodejs-business-sdk";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Campaign, AdSet, Ad } = require("facebook-nodejs-business-sdk") as {
  Campaign: new (id: string) => any;
  AdSet: new (id: string) => any;
  Ad: new (id: string) => any;
};
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
      return campaign as { id: string; name: string };
    } catch (err) {
      return this.handleMetaError(err, "Failed to create campaign on Meta");
    }
  }

  async createAdSet(params: {
    metaCampaignId: string;
    name: string;
    status: string;
    dailyBudgetCents?: number;
    lifetimeBudgetCents?: number;
    billingEvent: string;
    optimizationGoal: string;
    targeting: Record<string, unknown>;
    startTime?: string;
    endTime?: string;
  }) {
    try {
      const createParams: Record<string, unknown> = {
        name: params.name,
        campaign_id: params.metaCampaignId,
        status: params.status,
        billing_event: params.billingEvent,
        optimization_goal: params.optimizationGoal,
        targeting: params.targeting,
      };
      if (params.dailyBudgetCents) createParams.daily_budget = params.dailyBudgetCents;
      if (params.lifetimeBudgetCents) createParams.lifetime_budget = params.lifetimeBudgetCents;
      if (params.startTime) createParams.start_time = params.startTime;
      if (params.endTime) createParams.end_time = params.endTime;

      const acc: any = this.adAccount;
      const result = await acc.createAdSet([], createParams);
      const id = result._data?.id ?? result.id;
      if (!id) throw new Error("Meta did not return ad set ID");
      return { id: String(id) };
    } catch (err) {
      return this.handleMetaError(err, "Failed to create ad set on Meta");
    }
  }

  async createAd(params: {
    metaAdSetId: string;
    name: string;
    status: string;
    metaCreativeId: string;
  }) {
    try {
      const acc: any = this.adAccount;
      const result = await acc.createAd([], {
        name: params.name,
        adset_id: params.metaAdSetId,
        status: params.status,
        creative: { creative_id: params.metaCreativeId },
      });
      const id = result._data?.id ?? result.id;
      if (!id) throw new Error("Meta did not return ad ID");
      return { id: String(id) };
    } catch (err) {
      return this.handleMetaError(err, "Failed to create ad on Meta");
    }
  }

  async updateCampaign(metaCampaignId: string, params: {
    name?: string;
    status?: string;
    dailyBudgetCents?: number | null;
    lifetimeBudgetCents?: number | null;
  }) {
    try {
      const campaign: any = new Campaign(metaCampaignId);
      const updateParams: Record<string, unknown> = {};
      if (params.name !== undefined) updateParams.name = params.name;
      if (params.status !== undefined) updateParams.status = params.status;
      if (params.dailyBudgetCents !== undefined && params.dailyBudgetCents !== null) {
        updateParams.daily_budget = params.dailyBudgetCents;
      }
      if (params.lifetimeBudgetCents !== undefined && params.lifetimeBudgetCents !== null) {
        updateParams.lifetime_budget = params.lifetimeBudgetCents;
      }
      await campaign.update([], updateParams);
    } catch (err) {
      return this.handleMetaError(err, "Failed to update campaign on Meta");
    }
  }

  async updateAdSet(metaAdSetId: string, params: {
    name?: string;
    status?: string;
    dailyBudgetCents?: number | null;
    lifetimeBudgetCents?: number | null;
  }) {
    try {
      const adSet: any = new AdSet(metaAdSetId);
      const updateParams: Record<string, unknown> = {};
      if (params.name !== undefined) updateParams.name = params.name;
      if (params.status !== undefined) updateParams.status = params.status;
      if (params.dailyBudgetCents !== undefined && params.dailyBudgetCents !== null) {
        updateParams.daily_budget = params.dailyBudgetCents;
      }
      if (params.lifetimeBudgetCents !== undefined && params.lifetimeBudgetCents !== null) {
        updateParams.lifetime_budget = params.lifetimeBudgetCents;
      }
      await adSet.update([], updateParams);
    } catch (err) {
      return this.handleMetaError(err, "Failed to update ad set on Meta");
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

  async uploadImage(fileBuffer: Buffer, filename: string): Promise<{ imageHash: string }> {
    try {
      const acc: any = this.adAccount;
      const result = await acc.createAdImage([], {
        bytes: fileBuffer.toString("base64"),
        filename,
      });
      const images = result._data?.images ?? result.images ?? {};
      const first = Object.values(images)[0] as any;
      if (!first?.hash) throw new Error("Meta did not return image hash");
      return { imageHash: first.hash };
    } catch (err) {
      return this.handleMetaError(err, "Failed to upload image to Meta");
    }
  }

  async uploadVideo(fileBuffer: Buffer, filename: string, title: string): Promise<{ videoId: string }> {
    try {
      const acc: any = this.adAccount;
      const result = await acc.createAdVideo([], {
        bytes: fileBuffer.toString("base64"),
        title,
        filename,
      });
      const videoId = result._data?.id ?? result.id;
      if (!videoId) throw new Error("Meta did not return video ID");
      return { videoId: String(videoId) };
    } catch (err) {
      return this.handleMetaError(err, "Failed to upload video to Meta");
    }
  }

  async createAdCreative(params: {
    name: string;
    imageHash?: string;
    videoId?: string;
    headline?: string;
    body?: string;
    callToAction?: string;
    linkUrl?: string;
  }): Promise<{ metaCreativeId: string }> {
    try {
      const acc: any = this.adAccount;
      const objectStorySpec: Record<string, unknown> = {
        page_id: undefined, // Meta requires a page_id — pulled from account if possible
      };

      if (params.imageHash) {
        objectStorySpec.link_data = {
          image_hash: params.imageHash,
          message: params.body,
          link: params.linkUrl ?? "https://facebook.com",
          call_to_action: params.callToAction
            ? { type: params.callToAction }
            : undefined,
          name: params.headline,
        };
      } else if (params.videoId) {
        objectStorySpec.video_data = {
          video_id: params.videoId,
          message: params.body,
          call_to_action: params.callToAction
            ? { type: params.callToAction, value: { link: params.linkUrl ?? "https://facebook.com" } }
            : undefined,
          title: params.headline,
        };
      }

      const result = await acc.createAdCreative([], {
        name: params.name,
        object_story_spec: objectStorySpec,
      });
      const metaCreativeId = result._data?.id ?? result.id;
      if (!metaCreativeId) throw new Error("Meta did not return creative ID");
      return { metaCreativeId: String(metaCreativeId) };
    } catch (err) {
      return this.handleMetaError(err, "Failed to create ad creative on Meta");
    }
  }

  async syncAdSets(metaCampaignId: string): Promise<Array<{
    id: string; name: string; status: string;
    daily_budget?: string; lifetime_budget?: string;
    start_time?: string; end_time?: string;
  }>> {
    try {
      const campaign: any = new Campaign(metaCampaignId);
      const adSets = await campaign.getAdSets([
        "id", "name", "status",
        "daily_budget", "lifetime_budget", "start_time", "end_time",
      ]);
      return adSets as Array<{ id: string; name: string; status: string; daily_budget?: string; lifetime_budget?: string; start_time?: string; end_time?: string }>;
    } catch (err) {
      return this.handleMetaError(err, "Failed to sync ad sets from Meta");
    }
  }

  async syncAds(metaAdSetId: string): Promise<Array<{ id: string; name: string; status: string }>> {
    try {
      const adSet = new AdSet(metaAdSetId);
      const ads = await adSet.getAds(["id", "name", "status"]);
      return ads as Array<{ id: string; name: string; status: string }>;
    } catch (err) {
      return this.handleMetaError(err, "Failed to sync ads from Meta");
    }
  }

  async getInsights(params: {
    level: "account" | "campaign" | "adset" | "ad";
    objectId?: string;
    datePreset?: string;
    since?: string;
    until?: string;
  }): Promise<Array<Record<string, string>>> {
    try {
      const fields = [
        "impressions", "clicks", "spend",
        "ctr", "cpm", "cpp", "reach",
        "actions", "cost_per_action_type",
        "date_start", "date_stop",
      ];
      const insightParams: Record<string, unknown> = {
        level: params.level,
        date_preset: params.datePreset ?? "last_30d",
      };
      if (params.since && params.until) {
        insightParams.time_range = { since: params.since, until: params.until };
        delete insightParams.date_preset;
      }

      let insights: unknown;
      if (params.objectId && params.level === "campaign") {
        const obj: any = new Campaign(params.objectId);
        insights = await obj.getInsights(fields, insightParams);
      } else if (params.objectId && params.level === "adset") {
        const obj = new AdSet(params.objectId);
        insights = await obj.getInsights(fields, insightParams);
      } else if (params.objectId && params.level === "ad") {
        const obj = new Ad(params.objectId);
        insights = await obj.getInsights(fields, insightParams);
      } else {
        const acc: any = this.adAccount;
        insights = await acc.getInsights(fields, insightParams);
      }

      return insights as Array<Record<string, string>>;
    } catch (err) {
      return this.handleMetaError(err, "Failed to fetch insights from Meta");
    }
  }
}

// The real package exports these as named CJS exports (module.exports = { FacebookAdsApi, ... }),
// not a default export — declaring a `default` here breaks esModuleInterop at runtime
// (TS/tsx would look for a literal `.default` property that doesn't exist).
declare module "facebook-nodejs-business-sdk" {
  export class FacebookAdsApi {
    static init(accessToken: string): FacebookAdsApi;
    setApiVersion(version: string): void;
  }

  export class Campaign {
    id: string;
    name: string;
    status: string;
    objective: string;
  }

  export class AdAccount {
    constructor(id: string, parentId?: unknown, api?: FacebookAdsApi);
    createCampaign(fields: string[], params: Record<string, unknown>): Promise<Campaign>;
    getCampaigns(fields: string[]): Promise<Campaign[]>;
  }
}

import { initSentry } from "./config/sentry";

initSentry();

import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { startSyncJob } from "./jobs/syncCampaigns.job";

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`Server listening on port ${env.PORT} [${env.NODE_ENV}]`);
  if (env.NODE_ENV === "production") {
    startSyncJob(30); // sync every 30 minutes in production
  }
});

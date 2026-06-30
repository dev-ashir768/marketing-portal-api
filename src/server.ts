import { initSentry } from "./config/sentry";

initSentry();

import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`Server listening on port ${env.PORT} [${env.NODE_ENV}]`);
});

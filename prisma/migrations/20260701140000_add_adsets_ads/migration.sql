-- AlterEnum: Add OUTCOME_ variants to CampaignObjective (keep old ones for safety)
ALTER TABLE `ad_campaigns` MODIFY COLUMN `objective` ENUM('AWARENESS','TRAFFIC','ENGAGEMENT','LEADS','APP_PROMOTION','SALES','OUTCOME_AWARENESS','OUTCOME_TRAFFIC','OUTCOME_ENGAGEMENT','OUTCOME_LEADS','OUTCOME_APP_PROMOTION','OUTCOME_SALES') NOT NULL;

-- Update existing rows to OUTCOME_ format
UPDATE `ad_campaigns` SET `objective` = CONCAT('OUTCOME_', `objective`) WHERE `objective` IN ('AWARENESS','TRAFFIC','ENGAGEMENT','LEADS','APP_PROMOTION','SALES');

-- Now drop old values
ALTER TABLE `ad_campaigns` MODIFY COLUMN `objective` ENUM('OUTCOME_AWARENESS','OUTCOME_TRAFFIC','OUTCOME_ENGAGEMENT','OUTCOME_LEADS','OUTCOME_APP_PROMOTION','OUTCOME_SALES') NOT NULL;

-- AddColumn: Remove refreshToken fields if they exist (safe — IGNORE error if already gone)
ALTER TABLE `meta_accounts`
  DROP COLUMN IF EXISTS `refreshTokenEncrypted`,
  DROP COLUMN IF EXISTS `refreshTokenIv`,
  DROP COLUMN IF EXISTS `refreshTokenAuthTag`;

-- CreateTable: ad_sets
CREATE TABLE `ad_sets` (
    `id` VARCHAR(191) NOT NULL,
    `metaAccountId` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `metaAdSetId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE','PAUSED','DELETED','ARCHIVED') NOT NULL DEFAULT 'PAUSED',
    `dailyBudgetCents` INTEGER NULL,
    `lifetimeBudgetCents` INTEGER NULL,
    `startTime` DATETIME(3) NULL,
    `endTime` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ad_sets_metaAdSetId_key`(`metaAdSetId`),
    INDEX `ad_sets_metaAccountId_idx`(`metaAccountId`),
    INDEX `ad_sets_campaignId_idx`(`campaignId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: ads
CREATE TABLE `ads` (
    `id` VARCHAR(191) NOT NULL,
    `metaAccountId` VARCHAR(191) NOT NULL,
    `adSetId` VARCHAR(191) NOT NULL,
    `metaAdId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE','PAUSED','DELETED','ARCHIVED') NOT NULL DEFAULT 'PAUSED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ads_metaAdId_key`(`metaAdId`),
    INDEX `ads_metaAccountId_idx`(`metaAccountId`),
    INDEX `ads_adSetId_idx`(`adSetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey: ad_sets → meta_accounts
ALTER TABLE `ad_sets` ADD CONSTRAINT `ad_sets_metaAccountId_fkey`
    FOREIGN KEY (`metaAccountId`) REFERENCES `meta_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: ad_sets → ad_campaigns
ALTER TABLE `ad_sets` ADD CONSTRAINT `ad_sets_campaignId_fkey`
    FOREIGN KEY (`campaignId`) REFERENCES `ad_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: ads → meta_accounts
ALTER TABLE `ads` ADD CONSTRAINT `ads_metaAccountId_fkey`
    FOREIGN KEY (`metaAccountId`) REFERENCES `meta_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: ads → ad_sets
ALTER TABLE `ads` ADD CONSTRAINT `ads_adSetId_fkey`
    FOREIGN KEY (`adSetId`) REFERENCES `ad_sets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

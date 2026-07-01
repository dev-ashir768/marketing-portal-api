-- Add creativeId to ads table
ALTER TABLE `ads` ADD COLUMN `creativeId` VARCHAR(191) NULL;

-- CreateTable: ad_creatives
CREATE TABLE `ad_creatives` (
    `id`             VARCHAR(191) NOT NULL,
    `metaAccountId`  VARCHAR(191) NOT NULL,
    `metaCreativeId` VARCHAR(191) NULL,
    `mediaType`      ENUM('IMAGE','VIDEO') NOT NULL,
    `imageHash`      VARCHAR(191) NULL,
    `videoId`        VARCHAR(191) NULL,
    `headline`       VARCHAR(191) NULL,
    `body`           TEXT NULL,
    `callToAction`   VARCHAR(191) NULL,
    `linkUrl`        TEXT NULL,
    `createdAt`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`      DATETIME(3) NOT NULL,

    UNIQUE INDEX `ad_creatives_metaCreativeId_key`(`metaCreativeId`),
    INDEX `ad_creatives_metaAccountId_idx`(`metaAccountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey: ad_creatives → meta_accounts
ALTER TABLE `ad_creatives` ADD CONSTRAINT `ad_creatives_metaAccountId_fkey`
    FOREIGN KEY (`metaAccountId`) REFERENCES `meta_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: ads.creativeId → ad_creatives
ALTER TABLE `ads` ADD CONSTRAINT `ads_creativeId_fkey`
    FOREIGN KEY (`creativeId`) REFERENCES `ad_creatives`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

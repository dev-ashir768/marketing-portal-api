-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'ADMIN', 'MEMBER') NOT NULL DEFAULT 'OWNER',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `meta_apps` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `appId` VARCHAR(191) NOT NULL,
    `appSecretEncrypted` TEXT NOT NULL,
    `appSecretIv` VARCHAR(191) NOT NULL,
    `appSecretAuthTag` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `meta_apps_appId_key`(`appId`),
    INDEX `meta_apps_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `meta_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `metaAppId` VARCHAR(191) NULL,
    `metaAdAccountId` VARCHAR(191) NOT NULL,
    `businessName` VARCHAR(191) NULL,
    `accessTokenEncrypted` TEXT NOT NULL,
    `accessTokenIv` VARCHAR(191) NOT NULL,
    `accessTokenAuthTag` VARCHAR(191) NOT NULL,
    `refreshTokenEncrypted` TEXT NULL,
    `refreshTokenIv` VARCHAR(191) NULL,
    `refreshTokenAuthTag` VARCHAR(191) NULL,
    `tokenExpiresAt` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `meta_accounts_metaAdAccountId_key`(`metaAdAccountId`),
    INDEX `meta_accounts_userId_idx`(`userId`),
    INDEX `meta_accounts_metaAppId_idx`(`metaAppId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ad_campaigns` (
    `id` VARCHAR(191) NOT NULL,
    `metaAccountId` VARCHAR(191) NOT NULL,
    `metaCampaignId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `objective` ENUM('AWARENESS', 'TRAFFIC', 'ENGAGEMENT', 'LEADS', 'APP_PROMOTION', 'SALES') NOT NULL,
    `status` ENUM('ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED', 'DRAFT') NOT NULL DEFAULT 'DRAFT',
    `dailyBudgetCents` INTEGER NULL,
    `lifetimeBudgetCents` INTEGER NULL,
    `startTime` DATETIME(3) NULL,
    `endTime` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ad_campaigns_metaCampaignId_key`(`metaCampaignId`),
    INDEX `ad_campaigns_metaAccountId_idx`(`metaAccountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `meta_apps` ADD CONSTRAINT `meta_apps_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meta_accounts` ADD CONSTRAINT `meta_accounts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meta_accounts` ADD CONSTRAINT `meta_accounts_metaAppId_fkey` FOREIGN KEY (`metaAppId`) REFERENCES `meta_apps`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ad_campaigns` ADD CONSTRAINT `ad_campaigns_metaAccountId_fkey` FOREIGN KEY (`metaAccountId`) REFERENCES `meta_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: audit_logs
CREATE TABLE `audit_logs` (
    `id`                 VARCHAR(191) NOT NULL,
    `userId`             VARCHAR(191) NOT NULL,
    `externalCustomerId` VARCHAR(191) NULL,
    `action`             ENUM('CREATE','UPDATE','DELETE','SYNC') NOT NULL,
    `resource`           ENUM('CAMPAIGN','AD_SET','AD','CREATIVE','META_ACCOUNT') NOT NULL,
    `resourceId`         VARCHAR(191) NULL,
    `metadata`           JSON NULL,
    `createdAt`          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_userId_idx`(`userId`),
    INDEX `audit_logs_externalCustomerId_idx`(`externalCustomerId`),
    INDEX `audit_logs_resource_idx`(`resource`),
    INDEX `audit_logs_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey: audit_logs → users
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

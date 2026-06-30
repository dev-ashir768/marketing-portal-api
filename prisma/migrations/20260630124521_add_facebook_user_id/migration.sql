-- AlterTable
ALTER TABLE `meta_accounts` ADD COLUMN `facebookUserId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `meta_accounts_facebookUserId_idx` ON `meta_accounts`(`facebookUserId`);

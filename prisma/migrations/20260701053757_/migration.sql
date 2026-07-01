/*
  Warnings:

  - A unique constraint covering the columns `[apiKeyPrefix]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `meta_accounts` ADD COLUMN `externalCustomerId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `apiKeyHash` VARCHAR(191) NULL,
    ADD COLUMN `apiKeyPrefix` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `meta_accounts_externalCustomerId_idx` ON `meta_accounts`(`externalCustomerId`);

-- CreateIndex
CREATE UNIQUE INDEX `users_apiKeyPrefix_key` ON `users`(`apiKeyPrefix`);

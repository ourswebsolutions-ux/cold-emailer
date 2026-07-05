/*
  Warnings:

  - A unique constraint covering the columns `[userId,senderEmail]` on the table `SMTPConfig` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE `smtpconfig` DROP FOREIGN KEY `SMTPConfig_userId_fkey`;

-- DropIndex
DROP INDEX `SMTPConfig_userId_key` ON `smtpconfig`;

-- AlterTable
ALTER TABLE `smtpconfig` ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX `SMTPConfig_userId_senderEmail_key` ON `SMTPConfig`(`userId`, `senderEmail`);

-- AddForeignKey
ALTER TABLE `SMTPConfig` ADD CONSTRAINT `SMTPConfig_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

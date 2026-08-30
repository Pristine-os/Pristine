-- AlterTable
ALTER TABLE "Garment" ADD COLUMN     "printTag" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "nextTagNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "tagPrintingEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "GarmentTag" (
    "id" TEXT NOT NULL,
    "garmentId" TEXT NOT NULL,
    "tagNumber" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GarmentTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GarmentTag_tagNumber_key" ON "GarmentTag"("tagNumber");

-- CreateIndex
CREATE UNIQUE INDEX "GarmentTag_garmentId_sequence_key" ON "GarmentTag"("garmentId", "sequence");

-- AddForeignKey
ALTER TABLE "GarmentTag" ADD CONSTRAINT "GarmentTag_garmentId_fkey" FOREIGN KEY ("garmentId") REFERENCES "Garment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "rackId" TEXT;

-- CreateTable
CREATE TABLE "Rack" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "barcodeValue" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Rack_organizationId_barcodeValue_key" ON "Rack"("organizationId", "barcodeValue");

-- CreateIndex
CREATE UNIQUE INDEX "Rack_organizationId_name_key" ON "Rack"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "Rack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rack" ADD CONSTRAINT "Rack_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

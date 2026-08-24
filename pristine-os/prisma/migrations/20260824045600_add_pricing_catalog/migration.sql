-- CreateTable
CREATE TABLE "Price" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "garmentType" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Price_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Price_organizationId_garmentType_service_key" ON "Price"("organizationId", "garmentType", "service");

-- AddForeignKey
ALTER TABLE "Price" ADD CONSTRAINT "Price_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

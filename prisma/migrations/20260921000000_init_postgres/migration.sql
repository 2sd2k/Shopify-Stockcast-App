
-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopConfig" (
    "shop" TEXT NOT NULL,
    "primaryLocationId" TEXT,
    "primaryLocationName" TEXT,
    "windowDays" INTEGER NOT NULL DEFAULT 30,
    "reorderCycleDays" INTEGER NOT NULL DEFAULT 14,
    "onboardedAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopConfig_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "ShopLocation" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFulfillmentService" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ShopLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSetting" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "leadTimeDays" INTEGER,
    "safetyBufferUnits" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CachedVelocity" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "variantId" TEXT,
    "productTitle" TEXT NOT NULL,
    "variantTitle" TEXT,
    "unitsSold" INTEGER NOT NULL,
    "windowDays" INTEGER NOT NULL,
    "currentInventory" INTEGER NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CachedVelocity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopLocation_shop_idx" ON "ShopLocation"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "ShopLocation_shop_locationId_key" ON "ShopLocation"("shop", "locationId");

-- CreateIndex
CREATE INDEX "ProductSetting_shop_idx" ON "ProductSetting"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSetting_shop_sku_key" ON "ProductSetting"("shop", "sku");

-- CreateIndex
CREATE INDEX "CachedVelocity_shop_idx" ON "CachedVelocity"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "CachedVelocity_shop_sku_key" ON "CachedVelocity"("shop", "sku");


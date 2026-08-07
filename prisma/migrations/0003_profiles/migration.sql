-- Migration: 0003_profiles
-- Batch 3 — Profiles (Spec Section 12)
-- FK dependency order: professional_categories (exists) →
--   homeowner_profiles → professional_profiles → service_areas →
--   professional_category_map
--
-- NOTE: hand-authored to match schema.prisma exactly.
-- The conditional CHECK on service_areas.radius_km is hand-authored here
-- because Prisma cannot express conditional CHECK constraints declaratively.

-- Enums
CREATE TYPE "VerificationLevel" AS ENUM ('unverified', 'level_1', 'level_2');
CREATE TYPE "CoverageType" AS ENUM ('locality', 'radius');

-- homeowner_profiles
CREATE TABLE "homeowner_profiles" (
    "id"          TEXT        NOT NULL,
    "user_id"     TEXT        NOT NULL,
    "full_name"   TEXT        NOT NULL,
    "locality_id" TEXT,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "homeowner_profiles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "homeowner_profiles_user_id_key"    ON "homeowner_profiles"("user_id");
CREATE INDEX        "homeowner_profiles_locality_id_idx" ON "homeowner_profiles"("locality_id");

ALTER TABLE "homeowner_profiles"
    ADD CONSTRAINT "homeowner_profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "homeowner_profiles"
    ADD CONSTRAINT "homeowner_profiles_locality_id_fkey"
    FOREIGN KEY ("locality_id") REFERENCES "localities"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- professional_profiles
CREATE TABLE "professional_profiles" (
    "id"                 TEXT                NOT NULL,
    "user_id"            TEXT                NOT NULL,
    "business_name"      TEXT                NOT NULL,
    "slug"               TEXT                NOT NULL,
    "bio"                TEXT,
    "years_experience"   INTEGER,
    "primary_locality_id" TEXT               NOT NULL,
    "verification_level" "VerificationLevel" NOT NULL DEFAULT 'unverified',
    "verified_at"        TIMESTAMP(3),
    "is_published"       BOOLEAN             NOT NULL DEFAULT false,
    "average_rating"     DECIMAL(3,2)        NOT NULL DEFAULT 0,
    "review_count"       INTEGER             NOT NULL DEFAULT 0,
    "deleted_at"         TIMESTAMP(3),
    "created_at"         TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"         TIMESTAMP(3)        NOT NULL,
    CONSTRAINT "professional_profiles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "professional_profiles_user_id_key" ON "professional_profiles"("user_id");
CREATE UNIQUE INDEX "professional_profiles_slug_key"    ON "professional_profiles"("slug");
CREATE INDEX "professional_profiles_is_published_primary_locality_id_idx"
    ON "professional_profiles"("is_published", "primary_locality_id");
CREATE INDEX "professional_profiles_is_published_average_rating_idx"
    ON "professional_profiles"("is_published", "average_rating" DESC);

ALTER TABLE "professional_profiles"
    ADD CONSTRAINT "professional_profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "professional_profiles"
    ADD CONSTRAINT "professional_profiles_primary_locality_id_fkey"
    FOREIGN KEY ("primary_locality_id") REFERENCES "localities"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- service_areas
CREATE TABLE "service_areas" (
    "id"              TEXT            NOT NULL,
    "professional_id" TEXT            NOT NULL,
    "locality_id"     TEXT            NOT NULL,
    "coverage_type"   "CoverageType" NOT NULL DEFAULT 'locality',
    "radius_km"       DECIMAL(5,2),
    "created_at"      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "service_areas_pkey" PRIMARY KEY ("id"),
    -- Spec Section 12: conditional CHECK — Prisma cannot express this declaratively
    CONSTRAINT "service_areas_radius_km_check"
        CHECK (
            ("coverage_type" = 'radius' AND "radius_km" IS NOT NULL AND "radius_km" > 0)
            OR
            ("coverage_type" = 'locality' AND "radius_km" IS NULL)
        )
);
CREATE UNIQUE INDEX "service_areas_professional_id_locality_id_key"
    ON "service_areas"("professional_id", "locality_id");
CREATE INDEX "service_areas_locality_id_professional_id_idx"
    ON "service_areas"("locality_id", "professional_id");

ALTER TABLE "service_areas"
    ADD CONSTRAINT "service_areas_professional_id_fkey"
    FOREIGN KEY ("professional_id") REFERENCES "professional_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_areas"
    ADD CONSTRAINT "service_areas_locality_id_fkey"
    FOREIGN KEY ("locality_id") REFERENCES "localities"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- professional_category_map
CREATE TABLE "professional_category_map" (
    "id"              TEXT         NOT NULL,
    "professional_id" TEXT         NOT NULL,
    "category_id"     TEXT         NOT NULL,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "professional_category_map_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "professional_category_map_professional_id_category_id_key"
    ON "professional_category_map"("professional_id", "category_id");
CREATE INDEX "professional_category_map_category_id_idx"
    ON "professional_category_map"("category_id");

ALTER TABLE "professional_category_map"
    ADD CONSTRAINT "professional_category_map_professional_id_fkey"
    FOREIGN KEY ("professional_id") REFERENCES "professional_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "professional_category_map"
    ADD CONSTRAINT "professional_category_map_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "professional_categories"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

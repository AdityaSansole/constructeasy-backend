-- Migration: 0005_portfolio_and_media
-- Batch 5 — Portfolio & Media Showcase

-- Add project_count to professional_profiles
ALTER TABLE "professional_profiles" ADD COLUMN "project_count" INTEGER NOT NULL DEFAULT 0;

-- portfolio_projects
CREATE TABLE "portfolio_projects" (
    "id"              TEXT                  NOT NULL,
    "professional_id" TEXT                  NOT NULL,
    "title"           TEXT                  NOT NULL,
    "slug"            TEXT                  NOT NULL,
    "description"     TEXT,
    "project_type"    TEXT,
    "completion_year" INTEGER,
    "cost_inr"        DECIMAL(12,2),
    "locality_id"     TEXT,
    "is_featured"     BOOLEAN               NOT NULL DEFAULT false,
    "is_published"    BOOLEAN               NOT NULL DEFAULT true,
    "display_order"   INTEGER               NOT NULL DEFAULT 0,
    "created_at"      TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3)          NOT NULL,
    CONSTRAINT "portfolio_projects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "portfolio_projects_slug_key" ON "portfolio_projects"("slug");
CREATE INDEX "portfolio_projects_professional_id_is_published_display_order_idx" ON "portfolio_projects"("professional_id", "is_published", "display_order");
CREATE INDEX "portfolio_projects_locality_id_idx" ON "portfolio_projects"("locality_id");

ALTER TABLE "portfolio_projects"
    ADD CONSTRAINT "portfolio_projects_professional_id_fkey"
    FOREIGN KEY ("professional_id") REFERENCES "professional_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "portfolio_projects"
    ADD CONSTRAINT "portfolio_projects_locality_id_fkey"
    FOREIGN KEY ("locality_id") REFERENCES "localities"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- portfolio_media
CREATE TABLE "portfolio_media" (
    "id"                   TEXT         NOT NULL,
    "portfolio_project_id" TEXT         NOT NULL,
    "file_key"             TEXT         NOT NULL,
    "original_filename"    TEXT         NOT NULL,
    "mime_type"            TEXT         NOT NULL,
    "file_size"            INTEGER      NOT NULL,
    "width"                INTEGER,
    "height"               INTEGER,
    "caption"              TEXT,
    "display_order"        INTEGER      NOT NULL DEFAULT 0,
    "is_cover"             BOOLEAN      NOT NULL DEFAULT false,
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3) NOT NULL,
    CONSTRAINT "portfolio_media_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "portfolio_media_portfolio_project_id_display_order_idx" ON "portfolio_media"("portfolio_project_id", "display_order");

-- Partial unique index enforcing at most one cover image per portfolio project at the DB engine level
CREATE UNIQUE INDEX "portfolio_media_project_cover_idx"
    ON "portfolio_media"("portfolio_project_id")
    WHERE "is_cover" = true;

ALTER TABLE "portfolio_media"
    ADD CONSTRAINT "portfolio_media_portfolio_project_id_fkey"
    FOREIGN KEY ("portfolio_project_id") REFERENCES "portfolio_projects"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

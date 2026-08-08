-- Migration: 0006_contacts
-- Batch 7 — Milestone 5: Lead Generation

-- Create Enum ContactStatus
CREATE TYPE "ContactStatus" AS ENUM ('pending', 'accepted', 'declined', 'canceled', 'archived');

-- Create Table contacts
CREATE TABLE "contacts" (
    "id"              TEXT            NOT NULL,
    "homeowner_id"    TEXT            NOT NULL,
    "professional_id" TEXT            NOT NULL,
    "project_id"      TEXT,
    "locality_id"     TEXT,
    "status"          "ContactStatus" NOT NULL DEFAULT 'pending',
    "message"         TEXT            NOT NULL,
    "phone"           TEXT,
    "email"           TEXT,
    "budget_inr"      DECIMAL(12,2),
    "timeline"        TEXT,
    "declined_reason" TEXT,
    "responded_at"    TIMESTAMP(3),
    "created_at"      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3)    NOT NULL,
    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- Create Table contact_history
CREATE TABLE "contact_history" (
    "id"            TEXT            NOT NULL,
    "contact_id"    TEXT            NOT NULL,
    "from_status"   "ContactStatus",
    "to_status"     "ContactStatus" NOT NULL,
    "actor_user_id" TEXT            NOT NULL,
    "reason"        TEXT,
    "created_at"    TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contact_history_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "contacts_homeowner_id_status_idx" ON "contacts"("homeowner_id", "status");
CREATE INDEX "contacts_professional_id_status_idx" ON "contacts"("professional_id", "status");
CREATE INDEX "contact_history_contact_id_idx" ON "contact_history"("contact_id");

-- Partial Unique Index enforcing at most ONE active pending contact per homeowner/professional pair
CREATE UNIQUE INDEX "contacts_active_pending_idx"
    ON "contacts"("homeowner_id", "professional_id")
    WHERE "status" = 'pending';

-- Foreign Keys
ALTER TABLE "contacts"
    ADD CONSTRAINT "contacts_homeowner_id_fkey"
    FOREIGN KEY ("homeowner_id") REFERENCES "homeowner_profiles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contacts"
    ADD CONSTRAINT "contacts_professional_id_fkey"
    FOREIGN KEY ("professional_id") REFERENCES "professional_profiles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contacts"
    ADD CONSTRAINT "contacts_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "portfolio_projects"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contacts"
    ADD CONSTRAINT "contacts_locality_id_fkey"
    FOREIGN KEY ("locality_id") REFERENCES "localities"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contact_history"
    ADD CONSTRAINT "contact_history_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contact_history"
    ADD CONSTRAINT "contact_history_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

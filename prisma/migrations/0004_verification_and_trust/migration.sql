-- Migration: 0004_verification_and_trust
-- Batch 4 — Verification & Trust (Spec Section 13)

-- Enums (PascalCase quoted per project standard)
CREATE TYPE "VerificationStatus" AS ENUM ('draft', 'pending', 'info_requested', 'approved', 'rejected', 'suspended');
CREATE TYPE "DocumentType" AS ENUM ('identity_proof', 'gstin_certificate', 'council_of_architecture_reg', 'engineering_council_reg', 'degree_certificate', 'trade_license', 'incorporation_certificate');
CREATE TYPE "DocumentStatus" AS ENUM ('pending', 'verified', 'rejected');

-- verification_records
CREATE TABLE "verification_records" (
    "id"              TEXT                  NOT NULL,
    "professional_id" TEXT                  NOT NULL,
    "status"          "VerificationStatus"  NOT NULL DEFAULT 'draft',
    "version"         INTEGER               NOT NULL DEFAULT 1,
    "reviewed_by"     TEXT,
    "reviewer_notes"  TEXT,
    "submitted_at"    TIMESTAMP(3),
    "reviewed_at"     TIMESTAMP(3),
    "created_at"      TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3)          NOT NULL,
    CONSTRAINT "verification_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "verification_records_professional_id_idx" ON "verification_records"("professional_id");
CREATE INDEX "verification_records_status_idx"          ON "verification_records"("status");

-- Spec Section 3: Partial unique index enforcing at most one active application per professional
CREATE UNIQUE INDEX "verification_records_active_professional_idx"
    ON "verification_records" ("professional_id")
    WHERE "status" IN ('draft', 'pending', 'info_requested');

ALTER TABLE "verification_records"
    ADD CONSTRAINT "verification_records_professional_id_fkey"
    FOREIGN KEY ("professional_id") REFERENCES "professional_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "verification_records"
    ADD CONSTRAINT "verification_records_reviewed_by_fkey"
    FOREIGN KEY ("reviewed_by") REFERENCES "admin_users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- verification_documents
CREATE TABLE "verification_documents" (
    "id"                     TEXT              NOT NULL,
    "verification_record_id" TEXT              NOT NULL,
    "document_type"          "DocumentType"    NOT NULL,
    "document_number"        TEXT,
    "file_key"               TEXT              NOT NULL,
    "original_filename"      TEXT              NOT NULL,
    "mime_type"              TEXT              NOT NULL,
    "file_size"              INTEGER           NOT NULL,
    "checksum"               TEXT,
    "status"                 "DocumentStatus"  NOT NULL DEFAULT 'pending',
    "rejection_reason"       TEXT,
    "created_at"             TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"             TIMESTAMP(3)      NOT NULL,
    CONSTRAINT "verification_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "verification_documents_verification_record_id_document_type_key"
    ON "verification_documents"("verification_record_id", "document_type");
CREATE INDEX "verification_documents_verification_record_id_idx"
    ON "verification_documents"("verification_record_id");

ALTER TABLE "verification_documents"
    ADD CONSTRAINT "verification_documents_verification_record_id_fkey"
    FOREIGN KEY ("verification_record_id") REFERENCES "verification_records"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- verification_history
CREATE TABLE "verification_history" (
    "id"                     TEXT                 NOT NULL,
    "verification_record_id" TEXT                 NOT NULL,
    "from_status"            "VerificationStatus" NOT NULL,
    "to_status"              "VerificationStatus" NOT NULL,
    "actor_user_id"          TEXT                 NOT NULL,
    "reason"                 TEXT,
    "created_at"             TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "verification_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "verification_history_verification_record_id_idx"
    ON "verification_history"("verification_record_id");

ALTER TABLE "verification_history"
    ADD CONSTRAINT "verification_history_verification_record_id_fkey"
    FOREIGN KEY ("verification_record_id") REFERENCES "verification_records"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "verification_history"
    ADD CONSTRAINT "verification_history_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

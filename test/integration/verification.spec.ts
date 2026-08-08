import { INestApplication } from '@nestjs/common';
import { DocumentStatus, DocumentType, VerificationStatus } from '@prisma/client';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { VerificationService } from '../../src/modules/verification/verification.service';
import { AdminVerificationService } from '../../src/modules/verification/admin-verification.service';
import {
  bootstrapTestApp,
  closeTestApp,
} from './helpers';

describe('Verification & Trust — integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let moduleRef: any;
  let verificationService: VerificationService;
  let adminVerificationService: AdminVerificationService;

  let localityId: string;
  let categoryArchitectId: string;

  beforeAll(async () => {
    ({ app, prisma, moduleRef } = await bootstrapTestApp());

    verificationService = moduleRef.get(VerificationService);
    adminVerificationService = moduleRef.get(AdminVerificationService);

    const locality = await prisma.locality.findFirst();
    if (!locality) throw new Error('Integration test requires seeded locality');
    localityId = locality.id;

    const architectCat = await prisma.professionalCategory.findFirst({
      where: { slug: 'architect' },
    });
    if (!architectCat) throw new Error('Integration test requires seeded architect category');
    categoryArchitectId = architectCat.id;
  });

  afterAll(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE verification_history, verification_documents, verification_records, professional_category_map, service_areas, professional_profiles, homeowner_profiles, webhook_events, user_roles, admin_users, users RESTART IDENTITY CASCADE`;
    await closeTestApp(app, moduleRef);
  });

  async function createUser(clerkUserId: string): Promise<string> {
    const user = await prisma.user.create({
      data: { clerkUserId, email: `${clerkUserId}@test.com` },
    });
    return user.id;
  }

  async function assignRole(userId: string, roleName: string): Promise<void> {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new Error(`Role '${roleName}' not seeded`);
    await prisma.userRole.create({ data: { userId, roleId: role.id } });
  }

  async function createProfessionalProfile(userId: string, businessName: string, categoryId: string) {
    const profile = await prisma.professionalProfile.create({
      data: {
        userId,
        businessName,
        slug: `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
        primaryLocalityId: localityId,
      },
    });
    await prisma.professionalCategoryMap.create({
      data: { professionalId: profile.id, categoryId },
    });
    return profile;
  }

  async function createAdminUser(clerkUserId: string): Promise<{ userId: string; adminId: string }> {
    const userId = await createUser(clerkUserId);
    await assignRole(userId, 'verification_admin');
    const adminUser = await prisma.adminUser.create({ data: { userId } });
    return { userId, adminId: adminUser.id };
  }

  // ---------------------------------------------------------------------------
  // Scenario 1: Partial unique index — single active application restriction
  // ---------------------------------------------------------------------------
  describe('Scenario 1: Single active application restriction', () => {
    it('prevents creating a second active draft for the same professional via DB partial index', async () => {
      const userId = await createUser('clerk-v-dup');
      await assignRole(userId, 'professional');
      const profile = await createProfessionalProfile(userId, 'Dup Biz', categoryArchitectId);

      await prisma.verificationRecord.create({
        data: { professionalId: profile.id, status: VerificationStatus.draft },
      });

      // Second active insert fails
      await expect(
        prisma.verificationRecord.create({
          data: { professionalId: profile.id, status: VerificationStatus.draft },
        }),
      ).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: End-to-end professional submit & admin decisioning transaction
  // ---------------------------------------------------------------------------
  describe('Scenario 2: End-to-end verification submission & admin decisioning', () => {
    it('executes full workflow: draft -> submit -> individual document verify -> admin approve -> profile verified', async () => {
      const profUserId = await createUser('clerk-v-e2e');
      await assignRole(profUserId, 'professional');
      const profile = await createProfessionalProfile(profUserId, 'E2E Architect', categoryArchitectId);

      const { userId: adminUserId } = await createAdminUser('clerk-v-admin');

      // 1. Create draft application
      const record = await verificationService.createApplication(profUserId, ['professional']);
      expect(record.status).toBe(VerificationStatus.draft);

      // 2. Attach required documents for Architect (identity_proof + council_of_architecture_reg)
      await verificationService.attachDocument(profUserId, {
        documentType: DocumentType.identity_proof,
        fileKey: `docs/${profile.id}/id.pdf`,
        originalFilename: 'id.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
      });

      await verificationService.attachDocument(profUserId, {
        documentType: DocumentType.council_of_architecture_reg,
        fileKey: `docs/${profile.id}/coa.pdf`,
        originalFilename: 'coa.pdf',
        mimeType: 'application/pdf',
        fileSize: 2048,
      });

      // 3. Submit application
      const submitted = await verificationService.submitApplication(profUserId);
      expect(submitted.status).toBe(VerificationStatus.pending);
      expect(submitted.submittedAt).toBeDefined();

      // 4. Admin individually verifies both required documents
      const docs = submitted.documents;
      for (const d of docs) {
        await adminVerificationService.patchDocumentStatus(d.id, {
          status: DocumentStatus.verified,
        });
      }

      // 5. Admin submits approval decision
      const decision = await adminVerificationService.submitDecision(adminUserId, submitted.id, {
        targetStatus: VerificationStatus.approved,
        expectedVersion: submitted.version,
        reviewerNotes: 'All evidence verified successfully.',
      });

      expect(decision.status).toBe(VerificationStatus.approved);

      // 6. Check ProfessionalProfile updated via transaction & level resolver
      const updatedProfile = await prisma.professionalProfile.findUnique({
        where: { id: profile.id },
      });
      expect(updatedProfile?.isPublished).toBe(true);
      expect(updatedProfile?.verificationLevel).toBe('level_2');
      expect(updatedProfile?.verifiedAt).toBeDefined();

      // 7. Check VerificationHistory created
      const history = await prisma.verificationHistory.findMany({
        where: { verificationRecordId: submitted.id },
      });
      expect(history.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: Precondition check — Approval fails if required documents unverified
  // ---------------------------------------------------------------------------
  describe('Scenario 3: Approval precondition validation', () => {
    it('rejects approval if required documents are not verified', async () => {
      const profUserId = await createUser('clerk-v-precond');
      await assignRole(profUserId, 'professional');
      const profile = await createProfessionalProfile(profUserId, 'Precond Biz', categoryArchitectId);

      const { userId: adminUserId } = await createAdminUser('clerk-v-admin-2');

      await verificationService.createApplication(profUserId, ['professional']);
      await verificationService.attachDocument(profUserId, {
        documentType: DocumentType.identity_proof,
        fileKey: `docs/${profile.id}/id.pdf`,
        originalFilename: 'id.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
      });
      await verificationService.attachDocument(profUserId, {
        documentType: DocumentType.council_of_architecture_reg,
        fileKey: `docs/${profile.id}/coa.pdf`,
        originalFilename: 'coa.pdf',
        mimeType: 'application/pdf',
        fileSize: 2048,
      });

      const submitted = await verificationService.submitApplication(profUserId);

      // Attempt to approve without marking documents verified -> throws ValidationException
      await expect(
        adminVerificationService.submitDecision(adminUserId, submitted.id, {
          targetStatus: VerificationStatus.approved,
          expectedVersion: submitted.version,
          reviewerNotes: 'Premature approval attempt',
        }),
      ).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 4: Optimistic locking version conflict
  // ---------------------------------------------------------------------------
  describe('Scenario 4: Optimistic locking version conflict', () => {
    it('throws StateConflictException when expectedVersion does not match', async () => {
      const profUserId = await createUser('clerk-v-optlock');
      await assignRole(profUserId, 'professional');
      const profile = await createProfessionalProfile(profUserId, 'OptLock Biz', categoryArchitectId);

      const { userId: adminUserId } = await createAdminUser('clerk-v-admin-3');

      await verificationService.createApplication(profUserId, ['professional']);
      await verificationService.attachDocument(profUserId, {
        documentType: DocumentType.identity_proof,
        fileKey: `docs/${profile.id}/id.pdf`,
        originalFilename: 'id.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
      });
      await verificationService.attachDocument(profUserId, {
        documentType: DocumentType.council_of_architecture_reg,
        fileKey: `docs/${profile.id}/coa.pdf`,
        originalFilename: 'coa.pdf',
        mimeType: 'application/pdf',
        fileSize: 2048,
      });

      const submitted = await verificationService.submitApplication(profUserId);

      // Stale expectedVersion passed
      await expect(
        adminVerificationService.submitDecision(adminUserId, submitted.id, {
          targetStatus: VerificationStatus.rejected,
          expectedVersion: submitted.version - 1,
          reviewerNotes: 'Stale update attempt',
        }),
      ).rejects.toThrow();
    });
  });
});

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { ContactsService } from '../../src/modules/contacts/contacts.service';
import { ContactStatus, VerificationLevel } from '@prisma/client';
import {
  bootstrapTestApp,
  closeTestApp,
} from './helpers';

describe('Contacts & Lead Generation — integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let moduleRef: any;
  let contactsService: ContactsService;

  let localityId: string;

  beforeAll(async () => {
    ({ app, prisma, moduleRef } = await bootstrapTestApp());
    contactsService = moduleRef.get(ContactsService);

    const locality = await prisma.locality.findFirst();
    if (!locality) throw new Error('Integration test requires seeded locality');
    localityId = locality.id;
  });

  afterAll(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE contact_history, contacts, portfolio_media, portfolio_projects, verification_history, verification_documents, verification_records, professional_category_map, service_areas, professional_profiles, homeowner_profiles, webhook_events, user_roles, admin_users, users RESTART IDENTITY CASCADE`;
    await closeTestApp(app, moduleRef);
  });

  async function createUser(clerkUserId: string): Promise<string> {
    const user = await prisma.user.create({
      data: { clerkUserId, email: `${clerkUserId}@test.com` },
    });
    return user.id;
  }

  async function createHomeowner(clerkId: string, fullName: string) {
    const userId = await createUser(clerkId);
    const profile = await prisma.homeownerProfile.create({
      data: { userId, fullName, localityId },
    });
    return { userId, profile };
  }

  async function createProfessional(
    clerkId: string,
    businessName: string,
    verificationLevel: VerificationLevel = VerificationLevel.level_1,
    isPublished = true,
  ) {
    const userId = await createUser(clerkId);
    const profile = await prisma.professionalProfile.create({
      data: {
        userId,
        businessName,
        slug: `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
        primaryLocalityId: localityId,
        verificationLevel,
        isPublished,
      },
    });
    return { userId, profile };
  }

  describe('Lead Submission & Verification Gating', () => {
    it('allows homeowner to send lead inquiry to published, verified professional', async () => {
      const homeowner = await createHomeowner('clerk-home-1', 'Alice Homeowner');
      const prof = await createProfessional('clerk-prof-1', 'Verified Builder', VerificationLevel.level_2, true);

      const contact = await contactsService.createContact(homeowner.userId, ['homeowner'], {
        professionalId: prof.profile.id,
        message: 'Looking for villa construction quote.',
        phone: '+919876543210',
        email: 'alice@example.com',
        budgetInr: 5000000,
      });

      expect(contact.status).toBe(ContactStatus.pending);
      expect(contact.homeownerId).toBe(homeowner.profile.id);
      expect(contact.professionalId).toBe(prof.profile.id);

      // Verify lifecycle audit history created (NULL -> pending)
      const history = await prisma.contactHistory.findMany({
        where: { contactId: contact.id },
      });
      expect(history.length).toBe(1);
      expect(history[0].fromStatus).toBeNull();
      expect(history[0].toStatus).toBe(ContactStatus.pending);
    });

    it('rejects lead inquiry to unverified professional', async () => {
      const homeowner = await createHomeowner('clerk-home-unv', 'Bob Homeowner');
      const unvProf = await createProfessional('clerk-prof-unv', 'Unverified Builder', VerificationLevel.unverified, true);

      await expect(
        contactsService.createContact(homeowner.userId, ['homeowner'], {
          professionalId: unvProf.profile.id,
          message: 'Hello',
        }),
      ).rejects.toThrow();
    });

    it('prevents duplicate active pending lead via database partial unique index', async () => {
      const homeowner = await createHomeowner('clerk-home-dup', 'Charlie Homeowner');
      const prof = await createProfessional('clerk-prof-dup', 'Dup Builder', VerificationLevel.level_1, true);

      await contactsService.createContact(homeowner.userId, ['homeowner'], {
        professionalId: prof.profile.id,
        message: 'First inquiry',
      });

      // Second attempt to send pending lead throws ConflictException (409)
      await expect(
        contactsService.createContact(homeowner.userId, ['homeowner'], {
          professionalId: prof.profile.id,
          message: 'Second inquiry',
        }),
      ).rejects.toThrow();
    });
  });

  describe('State Machine Transitions & Audit History', () => {
    it('allows professional to accept lead and sets respondedAt timestamp', async () => {
      const homeowner = await createHomeowner('clerk-home-acc', 'David Homeowner');
      const prof = await createProfessional('clerk-prof-acc', 'Accepting Arch', VerificationLevel.level_1, true);

      const contact = await contactsService.createContact(homeowner.userId, ['homeowner'], {
        professionalId: prof.profile.id,
        message: 'Project inquiry',
      });

      const accepted = await contactsService.acceptContact(prof.userId, contact.id);
      expect(accepted?.status).toBe(ContactStatus.accepted);
      expect(accepted?.respondedAt).not.toBeNull();

      // Check audit history updated
      const histories = await prisma.contactHistory.findMany({
        where: { contactId: contact.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(histories.length).toBe(2);
      expect(histories[1].fromStatus).toBe(ContactStatus.pending);
      expect(histories[1].toStatus).toBe(ContactStatus.accepted);
    });

    it('allows professional to decline lead with reason', async () => {
      const homeowner = await createHomeowner('clerk-home-dec', 'Eve Homeowner');
      const prof = await createProfessional('clerk-prof-dec', 'Busy Arch', VerificationLevel.level_1, true);

      const contact = await contactsService.createContact(homeowner.userId, ['homeowner'], {
        professionalId: prof.profile.id,
        message: 'Project inquiry',
      });

      const declined = await contactsService.declineContact(prof.userId, contact.id, {
        reason: 'Fully booked until next year.',
      });
      expect(declined?.status).toBe(ContactStatus.declined);
      expect(declined?.declinedReason).toBe('Fully booked until next year.');
    });

    it('allows homeowner to cancel pending lead', async () => {
      const homeowner = await createHomeowner('clerk-home-can', 'Frank Homeowner');
      const prof = await createProfessional('clerk-prof-can', 'Target Builder', VerificationLevel.level_1, true);

      const contact = await contactsService.createContact(homeowner.userId, ['homeowner'], {
        professionalId: prof.profile.id,
        message: 'Project inquiry',
      });

      const canceled = await contactsService.cancelContact(homeowner.userId, contact.id);
      expect(canceled?.status).toBe(ContactStatus.canceled);
    });

    it('allows archiving accepted, declined, or canceled contacts but blocks pending contacts', async () => {
      const homeowner = await createHomeowner('clerk-home-arc', 'Grace Homeowner');
      const prof = await createProfessional('clerk-prof-arc', 'Archive Builder', VerificationLevel.level_1, true);

      const contact = await contactsService.createContact(homeowner.userId, ['homeowner'], {
        professionalId: prof.profile.id,
        message: 'Project inquiry',
      });

      // Archiving pending contact is blocked -> throws StateConflictException
      await expect(contactsService.archiveContact(homeowner.userId, contact.id)).rejects.toThrow();

      // Cancel contact then archive -> succeeds
      await contactsService.cancelContact(homeowner.userId, contact.id);
      const archived = await contactsService.archiveContact(homeowner.userId, contact.id);
      expect(archived?.status).toBe(ContactStatus.archived);
    });
  });

  describe('IDOR & PII Isolation', () => {
    it('returns NotFoundException (404) when an unrelated user attempts to fetch contact details', async () => {
      const homeowner = await createHomeowner('clerk-home-pii', 'Henry Homeowner');
      const prof = await createProfessional('clerk-prof-pii', 'PII Builder', VerificationLevel.level_1, true);
      const intruder = await createHomeowner('clerk-intruder', 'Intruder User');

      const contact = await contactsService.createContact(homeowner.userId, ['homeowner'], {
        professionalId: prof.profile.id,
        message: 'Secret lead details',
      });

      // Intruder receives 404 NotFoundException
      await expect(contactsService.getContactDetail(intruder.userId, contact.id)).rejects.toThrow();
    });
  });
});

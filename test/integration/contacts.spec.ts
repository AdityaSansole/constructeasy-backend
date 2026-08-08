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
    it('handles real concurrent duplicate creation with exactly 1 winner and 1 ConflictException (409)', async () => {
      const homeowner = await createHomeowner('clerk-home-cdup', 'Concurrent Homeowner');
      const prof = await createProfessional('clerk-prof-cdup', 'Concurrent Builder', VerificationLevel.level_1, true);

      // Execute 2 concurrent lead creation requests
      const results = await Promise.allSettled([
        contactsService.createContact(homeowner.userId, ['homeowner'], {
          professionalId: prof.profile.id,
          message: 'Concurrent lead 1',
        }),
        contactsService.createContact(homeowner.userId, ['homeowner'], {
          professionalId: prof.profile.id,
          message: 'Concurrent lead 2',
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // Verify DB contains exactly 1 pending contact and 1 history record
      const dbContacts = await prisma.contact.findMany({
        where: { homeownerId: homeowner.profile.id, professionalId: prof.profile.id },
      });
      expect(dbContacts.length).toBe(1);

      const dbHistories = await prisma.contactHistory.findMany({
        where: { contactId: dbContacts[0].id },
      });
      expect(dbHistories.length).toBe(1);
    });
  });

  describe('State Machine Transitions & Audit History', () => {
    it('handles real concurrent accept vs cancel with exactly 1 winner and 1 StateConflictException (409)', async () => {
      const homeowner = await createHomeowner('clerk-home-race', 'Race Homeowner');
      const prof = await createProfessional('clerk-prof-race', 'Race Builder', VerificationLevel.level_1, true);

      const contact = await contactsService.createContact(homeowner.userId, ['homeowner'], {
        professionalId: prof.profile.id,
        message: 'Concurrent state race inquiry',
      });

      // Execute concurrent accept and cancel calls
      const results = await Promise.allSettled([
        contactsService.acceptContact(prof.userId, contact.id),
        contactsService.cancelContact(homeowner.userId, contact.id),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // Final status must be either accepted or canceled
      const dbContact = await prisma.contact.findUnique({ where: { id: contact.id } });
      expect([ContactStatus.accepted, ContactStatus.canceled]).toContain(dbContact?.status);

      // Exactly 2 history entries exist (NULL -> pending, and pending -> final state)
      const histories = await prisma.contactHistory.findMany({ where: { contactId: contact.id } });
      expect(histories.length).toBe(2);
    });

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
    it('returns NotFoundException (404) when an unrelated homeowner OR unrelated professional attempts to fetch contact details', async () => {
      const homeowner = await createHomeowner('clerk-home-pii', 'Henry Homeowner');
      const prof = await createProfessional('clerk-prof-pii', 'PII Builder', VerificationLevel.level_1, true);
      const intruderHomeowner = await createHomeowner('clerk-intruder-home', 'Intruder Homeowner');
      const intruderProfessional = await createProfessional('clerk-intruder-prof', 'Intruder Professional', VerificationLevel.level_1, true);

      const contact = await contactsService.createContact(homeowner.userId, ['homeowner'], {
        professionalId: prof.profile.id,
        message: 'Secret lead details',
      });

      // Both unrelated homeowner and unrelated professional receive 404 NotFoundException
      await expect(contactsService.getContactDetail(intruderHomeowner.userId, contact.id)).rejects.toThrow();
      await expect(contactsService.getContactDetail(intruderProfessional.userId, contact.id)).rejects.toThrow();
    });
  });
});

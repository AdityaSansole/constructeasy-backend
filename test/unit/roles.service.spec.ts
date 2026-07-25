import { Test } from '@nestjs/testing';
import { RolesService } from '../../src/modules/lookups/roles/roles.service';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';

describe('RolesService', () => {
  let service: RolesService;
  const mockPrisma = { role: { findMany: jest.fn() } };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [RolesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = moduleRef.get(RolesService);
  });

  it('returns only homeowner and professional public role names', async () => {
    mockPrisma.role.findMany.mockResolvedValue([]);
    await service.findPublicRoles();
    expect(mockPrisma.role.findMany).toHaveBeenCalledWith({
      where: { name: { in: ['homeowner', 'professional'] } },
      select: { id: true, name: true },
    });
  });
});

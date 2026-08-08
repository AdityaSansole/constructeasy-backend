import { DocumentStatus, DocumentType, VerificationLevel } from '@prisma/client';
import { VerificationLevelResolver } from '../../src/modules/verification/verification-level.resolver';

describe('VerificationLevelResolver', () => {
  let resolver: VerificationLevelResolver;

  beforeEach(() => {
    resolver = new VerificationLevelResolver();
  });

  it('returns unverified if no documents are verified', () => {
    const level = resolver.resolveLevel(['architect'], [
      { documentType: DocumentType.identity_proof, status: DocumentStatus.pending },
    ]);
    expect(level).toBe(VerificationLevel.unverified);
  });

  it('returns level_1 for general category with identity verified', () => {
    const level = resolver.resolveLevel(['interior-designer'], [
      { documentType: DocumentType.identity_proof, status: DocumentStatus.verified },
      { documentType: DocumentType.trade_license, status: DocumentStatus.verified },
    ]);
    expect(level).toBe(VerificationLevel.level_1);
  });

  it('returns level_2 for architect with verified council of architecture registration', () => {
    const level = resolver.resolveLevel(['architect'], [
      { documentType: DocumentType.identity_proof, status: DocumentStatus.verified },
      { documentType: DocumentType.council_of_architecture_reg, status: DocumentStatus.verified },
    ]);
    expect(level).toBe(VerificationLevel.level_2);
  });
});

import { DocumentStatus, DocumentType } from '@prisma/client';
import { VerificationPolicyService } from '../../src/modules/verification/verification-policy.service';
import { ValidationException } from '../../src/common/errors/domain.exception';

describe('VerificationPolicyService', () => {
  let policyService: VerificationPolicyService;

  beforeEach(() => {
    policyService = new VerificationPolicyService();
  });

  describe('getRequiredDocumentTypes', () => {
    it('returns identity_proof by default for empty or unknown category', () => {
      const types = policyService.getRequiredDocumentTypes([]);
      expect(types).toEqual([DocumentType.identity_proof]);
    });

    it('returns architect required documents', () => {
      const types = policyService.getRequiredDocumentTypes(['architect']);
      expect(types).toContain(DocumentType.identity_proof);
      expect(types).toContain(DocumentType.council_of_architecture_reg);
    });

    it('returns contractor required documents', () => {
      const types = policyService.getRequiredDocumentTypes(['contractor']);
      expect(types).toContain(DocumentType.identity_proof);
      expect(types).toContain(DocumentType.gstin_certificate);
      expect(types).toContain(DocumentType.trade_license);
    });

    it('returns combined document types for multiple category slugs', () => {
      const types = policyService.getRequiredDocumentTypes(['architect', 'contractor']);
      expect(types).toContain(DocumentType.identity_proof);
      expect(types).toContain(DocumentType.council_of_architecture_reg);
      expect(types).toContain(DocumentType.gstin_certificate);
      expect(types).toContain(DocumentType.trade_license);
    });
  });

  describe('assertAllRequiredDocumentsPresent', () => {
    it('passes when all required documents are present', () => {
      expect(() =>
        policyService.assertAllRequiredDocumentsPresent(['architect'], [
          { documentType: DocumentType.identity_proof },
          { documentType: DocumentType.council_of_architecture_reg },
        ]),
      ).not.toThrow();
    });

    it('throws ValidationException when a required document is missing', () => {
      expect(() =>
        policyService.assertAllRequiredDocumentsPresent(['architect'], [
          { documentType: DocumentType.identity_proof },
        ]),
      ).toThrow(ValidationException);
    });
  });

  describe('assertAllRequiredDocumentsVerified', () => {
    it('passes when all required documents are verified', () => {
      expect(() =>
        policyService.assertAllRequiredDocumentsVerified(['architect'], [
          { documentType: DocumentType.identity_proof, status: DocumentStatus.verified },
          { documentType: DocumentType.council_of_architecture_reg, status: DocumentStatus.verified },
        ]),
      ).not.toThrow();
    });

    it('throws ValidationException when a required document is pending or rejected', () => {
      expect(() =>
        policyService.assertAllRequiredDocumentsVerified(['architect'], [
          { documentType: DocumentType.identity_proof, status: DocumentStatus.verified },
          { documentType: DocumentType.council_of_architecture_reg, status: DocumentStatus.pending },
        ]),
      ).toThrow(ValidationException);
    });
  });
});

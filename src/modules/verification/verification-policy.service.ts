import { Injectable } from '@nestjs/common';
import { DocumentStatus, DocumentType } from '@prisma/client';
import { ValidationException } from '../../common/errors/domain.exception';

@Injectable()
export class VerificationPolicyService {
  /**
   * Returns mandatory document types for a list of professional category slugs.
   * Policy matrix per Section 3 of Batch 4 spec. Extensible.
   */
  getRequiredDocumentTypes(categorySlugs: string[]): DocumentType[] {
    const required = new Set<DocumentType>();
    required.add(DocumentType.identity_proof);

    for (const slug of categorySlugs) {
      switch (slug.toLowerCase()) {
        case 'architect':
          required.add(DocumentType.council_of_architecture_reg);
          break;
        case 'contractor':
          required.add(DocumentType.gstin_certificate);
          required.add(DocumentType.trade_license);
          break;
        case 'interior-designer':
          required.add(DocumentType.trade_license);
          break;
        case 'engineer':
          required.add(DocumentType.engineering_council_reg);
          required.add(DocumentType.degree_certificate);
          break;
        case 'builder':
          required.add(DocumentType.gstin_certificate);
          required.add(DocumentType.incorporation_certificate);
          break;
      }
    }

    return Array.from(required);
  }

  /**
   * Asserts that all mandatory documents for the professional's categories are attached.
   */
  assertAllRequiredDocumentsPresent(
    categorySlugs: string[],
    attachedDocuments: { documentType: DocumentType }[],
  ): void {
    const requiredTypes = this.getRequiredDocumentTypes(categorySlugs);
    const attachedTypes = new Set(attachedDocuments.map((d) => d.documentType));

    const missing = requiredTypes.filter((req) => !attachedTypes.has(req));
    if (missing.length > 0) {
      throw new ValidationException(
        `Application cannot be submitted. Missing required documents for categories: ${missing.join(', ')}.`,
      );
    }
  }

  /**
   * Asserts that all mandatory documents for the professional's categories are individually marked 'verified'.
   */
  assertAllRequiredDocumentsVerified(
    categorySlugs: string[],
    attachedDocuments: { documentType: DocumentType; status: DocumentStatus }[],
  ): void {
    const requiredTypes = this.getRequiredDocumentTypes(categorySlugs);
    const verifiedTypes = new Set(
      attachedDocuments
        .filter((d) => d.status === DocumentStatus.verified)
        .map((d) => d.documentType),
    );

    const unverified = requiredTypes.filter((req) => !verifiedTypes.has(req));
    if (unverified.length > 0) {
      throw new ValidationException(
        `Application cannot be approved until every required document is individually verified. Unverified required document types: ${unverified.join(', ')}.`,
      );
    }
  }
}

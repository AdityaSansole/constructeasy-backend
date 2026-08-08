import { Injectable } from '@nestjs/common';
import { DocumentStatus, DocumentType, VerificationLevel } from '@prisma/client';

@Injectable()
export class VerificationLevelResolver {
  /**
   * Resolves the VerificationLevel dynamically based on category map and verified documents.
   */
  resolveLevel(
    categorySlugs: string[],
    documents: { documentType: DocumentType; status: DocumentStatus }[],
  ): VerificationLevel {
    const verifiedTypes = new Set(
      documents
        .filter((d) => d.status === DocumentStatus.verified)
        .map((d) => d.documentType),
    );

    if (verifiedTypes.size === 0) {
      return VerificationLevel.unverified;
    }

    const hasProfessionalReg =
      verifiedTypes.has(DocumentType.council_of_architecture_reg) ||
      verifiedTypes.has(DocumentType.engineering_council_reg) ||
      verifiedTypes.has(DocumentType.incorporation_certificate);

    const isHighTierCategory = categorySlugs.some((slug) =>
      ['architect', 'engineer', 'builder'].includes(slug.toLowerCase()),
    );

    if (isHighTierCategory && hasProfessionalReg) {
      return VerificationLevel.level_2;
    }

    return VerificationLevel.level_1;
  }
}

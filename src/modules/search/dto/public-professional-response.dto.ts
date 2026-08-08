export interface PublicLocationDto {
  localityId: string;
  localityName: string;
  cityId: string;
  cityName: string;
  citySlug: string;
  stateName: string;
}

export interface PublicCategoryDto {
  id: string;
  name: string;
  slug: string;
}

export interface PublicServiceAreaDto {
  localityId: string;
  localityName: string;
  cityName: string;
}

export interface PublicCoverImageDto {
  url: string;
  caption?: string | null;
}

export interface PublicFeaturedProjectDto {
  id: string;
  title: string;
  slug: string;
  projectType?: string | null;
  completionYear?: number | null;
  costInr?: number | null;
  coverImageUrl?: string | null;
}

export class PublicProfessionalResponseDto {
  id!: string;
  businessName!: string;
  slug!: string;
  bio?: string | null;
  yearsExperience?: number | null;
  verificationLevel!: string; // 'unverified' | 'level_1' | 'level_2'
  verifiedAt?: Date | null;
  averageRating!: number;
  reviewCount!: number;
  projectCount!: number;
  primaryLocation?: PublicLocationDto;
  categories!: PublicCategoryDto[];
  serviceAreas!: PublicServiceAreaDto[];
  coverImage?: PublicCoverImageDto | null;
  featuredProjects?: PublicFeaturedProjectDto[];
  createdAt!: Date;
}

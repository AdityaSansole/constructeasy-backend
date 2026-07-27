import { IsEnum } from 'class-validator';

export enum OnboardingRole {
  HOMEOWNER = 'homeowner',
  PROFESSIONAL = 'professional',
}

export class CompleteOnboardingDto {
  @IsEnum(OnboardingRole)
  role!: OnboardingRole;
}

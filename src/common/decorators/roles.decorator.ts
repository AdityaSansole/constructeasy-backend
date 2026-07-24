import { SetMetadata } from '@nestjs/common';

/**
 * Declares which roles may access a route. Pure metadata — no DB dependency,
 * so it's safe to define in Batch 0. The RolesGuard that reads this metadata
 * and checks it against `req.user.roles` is implemented in Batch 2 (Users &
 * Auth), once `user_roles`/`roles` Prisma models exist — same sequencing
 * rationale as ClerkAuthGuard's split (see Batch 0 review).
 *
 * Usage (from Batch 2 onward):
 *   @Roles('verification_admin', 'super_admin')
 *   @UseGuards(ClerkAuthGuard, RolesGuard)
 *   async approve(...) { ... }
 */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

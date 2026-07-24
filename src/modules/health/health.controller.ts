import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/**
 * GET /api/v1/health — Phase 3 Plan Section 7.
 * Public, unauthenticated, used by the ECS Fargate load balancer health
 * check (Architecture Blueprint Section 17). Deliberately bypasses the
 * standard response envelope interceptor's success wrapping expectations
 * are still fine here (envelope applies uniformly) — kept simple and fast.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const dbHealthy = await this.prisma.isHealthy();

    if (!dbHealthy) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'unhealthy', database: 'down' };
    }

    return { status: 'ok', database: 'up' };
  }
}

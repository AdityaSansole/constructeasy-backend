import { Controller, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('clerk')
  async handleClerkWebhook(@Req() req: Request) {
    const event = await this.webhooksService.handleClerkWebhook({
      rawBody: req.body,
      headers: req.headers,
    });

    if (!event) {
      return { status: 'ok' };
    }

    return {
      status: 'ok',
      eventId: event.eventId,
      createdAt: event.receivedAt,
    };
  }
}

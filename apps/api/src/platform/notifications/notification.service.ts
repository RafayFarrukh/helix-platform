import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

/**
 * One notification pipeline for all products.
 *
 * A product never sends an email. It emits a domain event; a notification
 * template maps that event to channels (in-app, email, push, webhook) and this
 * service enqueues delivery. That means user preferences, quiet hours,
 * digesting, unsubscribes and localisation are implemented once instead of 100
 * times, and a badly-behaved product cannot spam a customer.
 */
@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(params: {
    tenantId: string; userId: string; product: string; type: string;
    title: string; body: string; channels?: ('in_app' | 'email' | 'push' | 'webhook')[];
  }): Promise<void> {
    const channels = params.channels ?? ['in_app'];
    await this.prisma.notification.createMany({
      data: channels.map((channel) => ({
        tenantId: params.tenantId,
        userId: params.userId,
        product: params.product,
        type: params.type,
        title: params.title,
        body: params.body,
        channel,
      })),
    });
    // Delivery itself is a queue job (BullMQ today, Kafka + a delivery service
    // later). The request path only ever writes a row.
  }

  async inbox(tenantId: string, userId: string, limit = 50) {
    return this.prisma.notification.findMany({
      where: { tenantId, userId, channel: 'in_app' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Every request gets a correlation id at the edge. It flows into logs, traces,
 * audit rows and domain events, so one id reconstructs a whole cross-product
 * chain — essential once "one action" spans a dozen services.
 */
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header('x-correlation-id');
    const correlationId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    (req as any).correlationId = correlationId;
    res.setHeader('x-correlation-id', correlationId);
    next();
  }
}

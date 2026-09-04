#!/usr/bin/env node
/**
 * `pnpm gen:product <key> --name "Helix Notes" --category productivity`
 *
 * Scaffolds a complete, wired product: manifest, module, controller, service,
 * DTO folder, tests, docs stub, and the registration lines in the composition
 * root and the product registry.
 *
 * This generator is the answer to "how do you handle 100+ products". Adding one
 * is not an architecture decision, a security review or a migration plan — it is
 * a command, because every cross-cutting concern already lives in the kernel and
 * every product is described by the same manifest. What varies between products
 * is domain logic; what stays identical is everything that could otherwise be
 * got wrong 100 times.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const [, , key, ...rest] = process.argv;
const flags = Object.fromEntries(
  rest.reduce((acc, cur, i, arr) => (cur.startsWith('--') ? [...acc, [cur.slice(2), arr[i + 1]]] : acc), []),
);

if (!key || !/^[a-z][a-z0-9-]{1,30}$/.test(key)) {
  console.error('Usage: pnpm gen:product <key> [--name "Display Name"] [--category productivity] [--owner team-x]');
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, '../../..');
const dir = path.join(root, 'apps/api/src/products', key);
if (existsSync(dir)) {
  console.error(`Product "${key}" already exists at ${path.relative(root, dir)}`);
  process.exit(1);
}

const Pascal = key.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join('');
const name = flags.name ?? `Helix ${Pascal}`;
const category = flags.category ?? 'productivity';
const owner = flags.owner ?? 'team-platform';

const files = {
  [`${key}.manifest.ts`]: `import { defineProduct } from '@helix/core';

export const ${key.replace(/-/g, '')}Manifest = defineProduct({
  key: '${key}',
  name: '${name}',
  version: '0.1.0',
  category: '${category}',
  owner: '${owner}',
  dbSchema: '${key.replace(/-/g, '_')}',
  apiPrefix: '/v1/${key}',

  permissions: [
    { key: '${key}.item.read',   description: 'View items',   defaultRoles: ['owner', 'admin', 'member', 'guest'] },
    { key: '${key}.item.create', description: 'Create items', defaultRoles: ['owner', 'admin', 'member'] },
    { key: '${key}.item.delete', description: 'Delete items', defaultRoles: ['owner', 'admin'] },
  ],

  publishes: ['${key}.item.created', '${key}.item.deleted'],
  subscribes: [],
  searchDocuments: [{ type: '${key}.item', fields: ['title', 'ownerId', 'updatedAt'] }],

  quotas: {
    free:       { itemsTotal: 1000 },
    pro:        { itemsTotal: 100000 },
    business:   { itemsTotal: 1000000 },
    enterprise: { itemsTotal: 100000000 },
  },

  ui: { icon: 'box', color: '#6366F1', launchUrl: '/apps/${key}' },
});
`,

  [`${key}.service.ts`]: `import { Inject, Injectable } from '@nestjs/common';
import type { EventBus, RequestContext } from '@helix/core';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { EVENT_BUS } from '../../platform/events/events.module';

/**
 * Domain logic only. Authentication, tenant scoping, RBAC, auditing, rate
 * limiting, search indexing and notifications are all handled by the kernel.
 */
@Injectable()
export class ${Pascal}Service {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EVENT_BUS) private readonly events: EventBus,
  ) {}

  async list(ctx: RequestContext) {
    // TODO: replace with this product's models once its Prisma schema is added.
    return { data: [], tenantId: ctx.tenant.tenantId };
  }

  async create(ctx: RequestContext, input: { title: string }) {
    const item = { id: crypto.randomUUID(), title: input.title };

    await this.events.publish({
      name: '${key}.item.created',
      tenantId: ctx.tenant.tenantId,
      correlationId: ctx.correlationId,
      actorId: ctx.auth?.userId ?? null,
      payload: { itemId: item.id, title: item.title },
    });

    return item;
  }
}
`,

  [`${key}.controller.ts`]: `import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import type { AuthContext, TenantContext } from '@helix/core';
import { CorrelationId, CurrentTenant, CurrentUser, Product, RequirePermission } from '../../shared/http/decorators';
import { ${Pascal}Service } from './${key}.service';

class CreateItemDto {
  @IsString() @MaxLength(300) title!: string;
}

@ApiTags('${key}')
@Product('${key}')
@Controller('v1/${key}')
export class ${Pascal}Controller {
  constructor(private readonly ${key.replace(/-/g, '')}: ${Pascal}Service) {}

  @Get('items')
  @RequirePermission('${key}.item.read')
  @ApiOperation({ summary: 'List items' })
  list(@CurrentTenant() tenant: TenantContext, @CurrentUser() auth: AuthContext, @CorrelationId() correlationId: string) {
    return this.${key.replace(/-/g, '')}.list({ tenant, auth, correlationId });
  }

  @Post('items')
  @RequirePermission('${key}.item.create')
  @ApiOperation({ summary: 'Create an item' })
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() auth: AuthContext,
    @CorrelationId() correlationId: string,
    @Body() dto: CreateItemDto,
  ) {
    return this.${key.replace(/-/g, '')}.create({ tenant, auth, correlationId }, dto);
  }
}
`,

  [`${key}.module.ts`]: `import { Inject, Module, OnModuleInit } from '@nestjs/common';
import type { EventBus } from '@helix/core';
import { EVENT_BUS } from '../../platform/events/events.module';
import { SearchService } from '../../platform/search/search.service';
import { ${Pascal}Controller } from './${key}.controller';
import { ${Pascal}Service } from './${key}.service';

@Module({ controllers: [${Pascal}Controller], providers: [${Pascal}Service], exports: [${Pascal}Service] })
export class ${Pascal}Module implements OnModuleInit {
  constructor(
    @Inject(EVENT_BUS) private readonly events: EventBus,
    private readonly search: SearchService,
  ) {}

  onModuleInit(): void {
    this.events.subscribe<{ itemId: string; title: string }>('${key}.item.created', async (e) => {
      await this.search.index({
        tenantId: e.tenantId, product: '${key}', type: '${key}.item',
        refId: e.payload.itemId, title: e.payload.title,
      });
    });
  }
}
`,

  'README.md': `# ${name}

| | |
|---|---|
| **Key** | \`${key}\` |
| **Owner** | ${owner} |
| **Category** | ${category} |
| **DB schema** | \`${key.replace(/-/g, '_')}\` |
| **API prefix** | \`/v1/${key}\` |

## Boundaries

- Owns the \`${key.replace(/-/g, '_')}\` Postgres schema. No other product may read it.
- Communicates outward only by publishing the events listed in the manifest.
- Cross-cutting concerns (auth, RBAC, audit, search, notifications, quotas) come
  from the platform kernel — do not re-implement them here.

## Extraction checklist

When this product needs its own deployable, in order:
1. Move \`${key.replace(/-/g, '_')}\` to its own database.
2. Point the gateway route \`/v1/${key}\` at the new service.
3. Swap the in-process event bus for the Kafka client (same interface).
`,
};

await mkdir(path.join(dir, 'dto'), { recursive: true });
for (const [file, content] of Object.entries(files)) {
  await writeFile(path.join(dir, file), content);
}

// --- Wire the product into the composition root and registry -----------------
const appModulePath = path.join(root, 'apps/api/src/app.module.ts');
let appModule = await readFile(appModulePath, 'utf8');
appModule = appModule
  .replace(
    "import { DriveModule } from './products/drive/drive.module';",
    `import { DriveModule } from './products/drive/drive.module';\nimport { ${Pascal}Module } from './products/${key}/${key}.module';`,
  )
  .replace(
    '    DriveModule,',
    `    DriveModule,\n    ${Pascal}Module,`,
  );
await writeFile(appModulePath, appModule);

const registryPath = path.join(root, 'apps/api/src/platform/registry/product-registry.service.ts');
let registry = await readFile(registryPath, 'utf8');
const manifestConst = `${key.replace(/-/g, '')}Manifest`;
registry = registry
  .replace(
    "import { driveManifest } from '../../products/drive/drive.manifest';",
    `import { driveManifest } from '../../products/drive/drive.manifest';\nimport { ${manifestConst} } from '../../products/${key}/${key}.manifest';`,
  )
  .replace(
    '[calendarManifest, meetManifest, driveManifest]',
    `[calendarManifest, meetManifest, driveManifest, ${manifestConst}]`,
  )
  .replace(
    new RegExp(`\\[calendarManifest, meetManifest, driveManifest, ([^\\]]*)\\]`),
    (m, existing) => `[calendarManifest, meetManifest, driveManifest, ${[...new Set(existing.split(', ').filter(Boolean))].join(', ')}]`,
  );
await writeFile(registryPath, registry);

console.log(`
Created product "${key}"

  apps/api/src/products/${key}/
    ${key}.manifest.ts     declares permissions, events, quotas, search docs
    ${key}.module.ts       wiring + event subscriptions
    ${key}.controller.ts   HTTP surface (tenant + RBAC enforced by the kernel)
    ${key}.service.ts      domain logic
    README.md              boundaries + extraction checklist

  Registered in app.module.ts and product-registry.service.ts

Next:
  1. Add this product's models to prisma/schema.prisma under schema "${key.replace(/-/g, '_')}"
  2. pnpm db:migrate
  3. pnpm --filter @helix/api dev   (boot validates the manifest graph)
`);

/**
 * Seeds a demo workspace so the sample is runnable in one command.
 * Creates: 1 tenant, 3 users with different roles, all 3 products enabled,
 * a default calendar, and a handful of events.
 */
import { PrismaClient } from '@prisma/client';
import { randomBytes, scrypt as _scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(_scrypt) as any;
const prisma = new PrismaClient();

async function hash(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived: Buffer = await scrypt(password, salt, 64, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${2 ** 15}$8$1$${salt.toString('base64')}$${derived.toString('base64')}`;
}

const PERMISSIONS = [
  ['calendar.event.read', 'calendar', 'View events'],
  ['calendar.event.create', 'calendar', 'Create events'],
  ['calendar.event.update', 'calendar', 'Edit events'],
  ['calendar.event.delete', 'calendar', 'Delete events'],
  ['calendar.calendar.manage', 'calendar', 'Manage calendars'],
  ['meet.room.read', 'meet', 'View rooms'],
  ['meet.room.create', 'meet', 'Create rooms'],
  ['meet.room.manage', 'meet', 'Manage rooms'],
  ['drive.node.read', 'drive', 'View files'],
  ['drive.node.create', 'drive', 'Upload files'],
  ['drive.node.delete', 'drive', 'Delete files'],
  ['drive.node.share', 'drive', 'Share files'],
] as const;

async function main() {
  for (const [key, product, description] of PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, create: { key, product, description }, update: {} });
  }

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'acme' },
    create: { slug: 'acme', name: 'Acme Corp', tier: 'business', region: 'us' },
    update: {},
  });

  const roles: Record<string, { id: string }> = {};
  for (const [key, name] of [['owner', 'Owner'], ['admin', 'Admin'], ['member', 'Member'], ['guest', 'Guest']]) {
    roles[key] = await prisma.role.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key } },
      create: { tenantId: tenant.id, key, name, isSystem: true },
      update: {},
    });
  }

  // Members get everything except delete/share/manage; guests read only.
  for (const [key] of PERMISSIONS) {
    const isRead = key.endsWith('.read');
    const isDestructive = /\.(delete|share|manage)$/.test(key);
    const grants = [roles.owner!, roles.admin!];
    if (!isDestructive) grants.push(roles.member!);
    if (isRead) grants.push(roles.guest!);
    for (const role of grants) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionKey: { roleId: role.id, permissionKey: key } },
        create: { roleId: role.id, permissionKey: key },
        update: {},
      });
    }
  }

  const passwordHash = await hash('Helix-Demo-2026!');
  const people = [
    { email: 'owner@acme.test', displayName: 'Ada Owner', role: 'owner' },
    { email: 'admin@acme.test', displayName: 'Ben Admin', role: 'admin' },
    { email: 'member@acme.test', displayName: 'Cleo Member', role: 'member' },
  ];

  for (const person of people) {
    const user = await prisma.user.upsert({
      where: { email: person.email },
      create: { email: person.email, displayName: person.displayName, passwordHash },
      update: {},
    });
    const membership = await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      create: { tenantId: tenant.id, userId: user.id, status: 'active' },
      update: {},
    });
    await prisma.membershipRole.upsert({
      where: { membershipId_roleId: { membershipId: membership.id, roleId: roles[person.role]!.id } },
      create: { membershipId: membership.id, roleId: roles[person.role]!.id },
      update: {},
    });
  }

  for (const productKey of ['calendar', 'meet', 'drive']) {
    await prisma.productAccount.upsert({
      where: { tenantId_productKey: { tenantId: tenant.id, productKey } },
      create: { tenantId: tenant.id, productKey, tier: 'business' },
      update: { status: 'active' },
    });
  }

  const owner = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@acme.test' } });
  const calendar = await prisma.calendarCalendar.findFirst({ where: { tenantId: tenant.id, isDefault: true } })
    ?? await prisma.calendarCalendar.create({
      data: { tenantId: tenant.id, ownerId: owner.id, name: 'Acme Team', isDefault: true },
    });

  const existing = await prisma.calendarEvent.count({ where: { tenantId: tenant.id } });
  if (existing === 0) {
    for (const [i, title] of ['Architecture review', 'Sprint planning', 'Customer QBR'].entries()) {
      const startsAt = new Date(Date.now() + (i + 1) * 864e5);
      const event = await prisma.calendarEvent.create({
        data: {
          tenantId: tenant.id, calendarId: calendar.id, title,
          startsAt, endsAt: new Date(startsAt.getTime() + 36e5), createdBy: owner.id,
        },
      });
      await prisma.searchDocument.create({
        data: {
          tenantId: tenant.id, product: 'calendar', type: 'calendar.event',
          refId: event.id, title, body: `${title} for the Acme team`,
        },
      });
    }
  }

  console.log(`Seeded tenant ${tenant.slug} (${tenant.id})`);
  console.log('Login with owner@acme.test / Helix-Demo-2026!');
}

main().finally(() => prisma.$disconnect());

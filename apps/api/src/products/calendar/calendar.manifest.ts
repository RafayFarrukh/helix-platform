import { defineProduct } from '@helix/core';

/**
 * Everything the platform needs to know about Calendar. Routing, RBAC, search
 * indexing, quotas, billing tiers and the app launcher entry are all derived
 * from this file — there is no second place to register a product.
 */
export const calendarManifest = defineProduct({
  key: 'calendar',
  name: 'Helix Calendar',
  version: '1.0.0',
  category: 'productivity',
  owner: 'team-productivity',
  dbSchema: 'calendar',
  apiPrefix: '/v1/calendar',

  permissions: [
    { key: 'calendar.event.read',   description: 'View events',            defaultRoles: ['owner', 'admin', 'member', 'guest'] },
    { key: 'calendar.event.create', description: 'Create events',          defaultRoles: ['owner', 'admin', 'member'] },
    { key: 'calendar.event.update', description: 'Edit events',            defaultRoles: ['owner', 'admin', 'member'] },
    { key: 'calendar.event.delete', description: 'Delete events',          defaultRoles: ['owner', 'admin'] },
    { key: 'calendar.calendar.manage', description: 'Manage calendars',    defaultRoles: ['owner', 'admin'] },
  ],

  publishes: ['calendar.event.created', 'calendar.event.updated', 'calendar.event.cancelled'],

  // Calendar reacts to Meet without importing a line of Meet's code.
  subscribes: ['meet.room.scheduled', 'platform.user.joined'],

  searchDocuments: [{ type: 'calendar.event', fields: ['title', 'body', 'ownerId', 'updatedAt'] }],

  quotas: {
    free:       { eventsPerMonth: 500,   calendars: 3 },
    pro:        { eventsPerMonth: 10000, calendars: 25 },
    business:   { eventsPerMonth: 100000, calendars: 200 },
    enterprise: { eventsPerMonth: 1000000, calendars: 5000 },
  },

  ui: { icon: 'calendar', color: '#4F46E5', launchUrl: '/apps/calendar' },
  softDependencies: ['meet'],
});

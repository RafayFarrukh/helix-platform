import { defineProduct } from '@helix/core';

export const meetManifest = defineProduct({
  key: 'meet',
  name: 'Helix Meet',
  version: '1.0.0',
  category: 'communication',
  owner: 'team-realtime',
  dbSchema: 'meet',
  apiPrefix: '/v1/meet',

  permissions: [
    { key: 'meet.room.read',   description: 'View rooms',    defaultRoles: ['owner', 'admin', 'member', 'guest'] },
    { key: 'meet.room.create', description: 'Create rooms',  defaultRoles: ['owner', 'admin', 'member'] },
    { key: 'meet.room.manage', description: 'End rooms, manage recordings', defaultRoles: ['owner', 'admin'] },
  ],

  publishes: ['meet.room.scheduled', 'meet.room.started', 'meet.room.ended'],
  subscribes: ['platform.tenant.suspended'],
  searchDocuments: [{ type: 'meet.room', fields: ['title', 'ownerId', 'updatedAt'] }],

  quotas: {
    free:       { minutesPerMonth: 2400,    maxParticipants: 25 },
    pro:        { minutesPerMonth: 60000,   maxParticipants: 150 },
    business:   { minutesPerMonth: 600000,  maxParticipants: 500 },
    enterprise: { minutesPerMonth: 9999999, maxParticipants: 1000 },
  },

  availableIn: ['pro', 'business', 'enterprise'],
  ui: { icon: 'video', color: '#059669', launchUrl: '/apps/meet' },
});

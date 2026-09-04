import { defineProduct } from '@helix/core';

export const notesManifest = defineProduct({
  key: 'notes',
  name: 'Helix Notes',
  version: '0.1.0',
  category: 'productivity',
  owner: 'team-productivity',
  dbSchema: 'notes',
  apiPrefix: '/v1/notes',

  permissions: [
    { key: 'notes.item.read',   description: 'View items',   defaultRoles: ['owner', 'admin', 'member', 'guest'] },
    { key: 'notes.item.create', description: 'Create items', defaultRoles: ['owner', 'admin', 'member'] },
    { key: 'notes.item.delete', description: 'Delete items', defaultRoles: ['owner', 'admin'] },
  ],

  publishes: ['notes.item.created', 'notes.item.deleted'],
  subscribes: [],
  searchDocuments: [{ type: 'notes.item', fields: ['title', 'ownerId', 'updatedAt'] }],

  quotas: {
    free:       { itemsTotal: 1000 },
    pro:        { itemsTotal: 100000 },
    business:   { itemsTotal: 1000000 },
    enterprise: { itemsTotal: 100000000 },
  },

  ui: { icon: 'box', color: '#6366F1', launchUrl: '/apps/notes' },
});

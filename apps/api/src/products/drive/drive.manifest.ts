import { defineProduct } from '@helix/core';

export const driveManifest = defineProduct({
  key: 'drive',
  name: 'Helix Drive',
  version: '1.0.0',
  category: 'cloud',
  owner: 'team-storage',
  dbSchema: 'drive',
  apiPrefix: '/v1/drive',

  permissions: [
    { key: 'drive.node.read',   description: 'View files and folders', defaultRoles: ['owner', 'admin', 'member', 'guest'] },
    { key: 'drive.node.create', description: 'Upload and create',      defaultRoles: ['owner', 'admin', 'member'] },
    { key: 'drive.node.delete', description: 'Delete files',           defaultRoles: ['owner', 'admin', 'member'] },
    { key: 'drive.node.share',  description: 'Share externally',       defaultRoles: ['owner', 'admin'] },
  ],

  publishes: ['drive.node.created', 'drive.node.shared', 'drive.node.deleted'],
  subscribes: ['platform.tenant.suspended'],
  searchDocuments: [{ type: 'drive.node', fields: ['title', 'ownerId', 'updatedAt'] }],

  quotas: {
    free:       { storageGb: 15,     filesPerUpload: 1 },
    pro:        { storageGb: 2000,   filesPerUpload: 50 },
    business:   { storageGb: 50000,  filesPerUpload: 200 },
    enterprise: { storageGb: 1000000, filesPerUpload: 1000 },
  },

  ui: { icon: 'folder', color: '#D97706', launchUrl: '/apps/drive' },
});

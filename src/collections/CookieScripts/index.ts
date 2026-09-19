import type { CollectionConfig } from 'payload'

import { hasRole } from '../../access/hasRole'

export const CookieScripts: CollectionConfig = {
  slug: 'cookie-scripts',

  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'category', 'provider', 'enabled'],
    group: 'Settings',
  },

  access: {
    read: () => true,
    // Restricted to admin/super_admin only: this collection injects
    // arbitrary third-party scripts site-wide, so contributor (role:
    // 'user') access is intentionally excluded to limit script-injection
    // risk if a contributor account is ever compromised.
    create: hasRole(['admin', 'super_admin']),
    update: hasRole(['admin', 'super_admin']),
    delete: hasRole(['admin', 'super_admin']),
  },

  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: 'Script Name',
    },

    {
      name: 'provider',
      type: 'text',
      required: true,
      label: 'Provider',
    },

    {
      name: 'category',
      type: 'select',
      required: true,
      options: [
        {
          label: 'Necessary',
          value: 'necessary',
        },
        {
          label: 'Preferences',
          value: 'preferences',
        },
        {
          label: 'Statistics',
          value: 'statistics',
        },
        {
          label: 'Marketing',
          value: 'marketing',
        },
      ],
    },

    {
      name: 'description',
      type: 'textarea',
      label: 'Description',
    },

    {
      name: 'script',
      type: 'textarea',
      required: true,
      label: 'Script',
      admin: {
        description: 'The third-party script or configuration that will be used by the website.',
      },
    },

    {
      name: 'enabled',
      type: 'checkbox',
      defaultValue: true,
      label: 'Enabled',
    },
  ],
}

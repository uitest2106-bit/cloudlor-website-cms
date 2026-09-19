import type { GlobalConfig } from 'payload'

import { hasRole } from '../access/hasRole'

export const CookieSettings: GlobalConfig = {
  slug: 'cookie-settings',

  access: {
    read: () => true,
    update: hasRole(['admin', 'super_admin']),
  },

  admin: {
    group: 'Settings',
  },

  fields: [
    {
      name: 'enabled',
      type: 'checkbox',
      defaultValue: true,
      label: 'Enable Cookie Banner',
    },

    {
      name: 'title',
      type: 'text',
      defaultValue: 'This website uses cookies',
      required: true,
    },

    {
      name: 'description',
      type: 'textarea',
      required: true,
    },

    {
      name: 'allowAllLabel',
      type: 'text',
      defaultValue: 'Allow all',
      required: true,
    },

    {
      name: 'allowSelectionLabel',
      type: 'text',
      defaultValue: 'Allow selection',
      required: true,
    },

    {
      name: 'denyLabel',
      type: 'text',
      defaultValue: 'Deny',
      required: true,
    },

    {
      name: 'showDetailsLabel',
      type: 'text',
      defaultValue: 'Show details',
      required: true,
    },

    {
      name: 'categories',
      type: 'group',
      fields: [
        {
          name: 'necessary',
          type: 'group',
          fields: [
            {
              name: 'enabled',
              type: 'checkbox',
              defaultValue: true,
            },
            {
              name: 'label',
              type: 'text',
              defaultValue: 'Necessary',
            },
            {
              name: 'description',
              type: 'textarea',
            },
          ],
        },

        {
          name: 'preferences',
          type: 'group',
          fields: [
            {
              name: 'enabled',
              type: 'checkbox',
              defaultValue: true,
            },
            {
              name: 'label',
              type: 'text',
              defaultValue: 'Preferences',
            },
            {
              name: 'description',
              type: 'textarea',
            },
          ],
        },

        {
          name: 'statistics',
          type: 'group',
          fields: [
            {
              name: 'enabled',
              type: 'checkbox',
              defaultValue: true,
            },
            {
              name: 'label',
              type: 'text',
              defaultValue: 'Statistics',
            },
            {
              name: 'description',
              type: 'textarea',
            },
          ],
        },

        {
          name: 'marketing',
          type: 'group',
          fields: [
            {
              name: 'enabled',
              type: 'checkbox',
              defaultValue: true,
            },
            {
              name: 'label',
              type: 'text',
              defaultValue: 'Marketing',
            },
            {
              name: 'description',
              type: 'textarea',
            },
          ],
        },
      ],
    },
  ],
}

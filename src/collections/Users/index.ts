import type { CollectionConfig, Where } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, operation, req }) => {
        // Explicit guard: no one may change their own role, regardless of
        // current role. This is enforced independently of access.update's
        // query-scoping so the protection doesn't silently disappear if
        // that access function is ever refactored.
        if (
          operation === 'update' &&
          req.user?.id === originalDoc?.id &&
          data?.role !== undefined &&
          data.role !== originalDoc?.role
        ) {
          throw new Error('You cannot change your own role.')
        }

        if (
          operation !== 'update' ||
          originalDoc?.role !== 'super_admin' ||
          data?.role === 'super_admin'
        ) {
          return data
        }

        const superAdmins = await req.payload.find({
          collection: 'users',
          where: {
            role: {
              equals: 'super_admin',
            },
          },
          limit: 1,
          overrideAccess: true,
        })

        if (superAdmins.totalDocs === 1) {
          throw new Error('Cannot demote the last super admin.')
        }

        return data
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        const user = await req.payload.findByID({
          collection: 'users',
          id,
          overrideAccess: true,
        })

        if (user.role !== 'super_admin') {
          return
        }

        const superAdmins = await req.payload.find({
          collection: 'users',
          where: {
            role: {
              equals: 'super_admin',
            },
          },
          limit: 1,
          overrideAccess: true,
        })

        if (superAdmins.totalDocs === 1) {
          throw new Error('Cannot delete the last super admin.')
        }
      },
    ],
  },

  access: {
    // Controls admin-*panel* access generally (Users is the configured auth
    // collection, so this also gates whether a logged-in user can open
    // /admin at all — not just this collection's own UI). Any authenticated
    // role, including contributors, may now open the panel to work on
    // Pages/Posts; this collection's own read/update/delete access above
    // still fully restricts what a contributor can do to Users documents,
    // and its nav entry is hidden from them below.
    admin: ({ req }) => Boolean(req.user),
    create: ({ req, data }) => {
      if (req.user?.role === 'super_admin') {
        return true
      }

      if (req.user?.role === 'admin') {
        return data?.role === undefined || data.role === 'user'
      }

      return false
    },
    delete: ({ req }) => {
      if (req.user?.role === 'super_admin') {
        return true
      }

      if (req.user?.role === 'admin') {
        return {
          role: {
            equals: 'user',
          },
        }
      }

      return false
    },
    read: ({ req }) => {
      if (req.user?.role === 'super_admin') {
        return true
      }

      if (req.user?.role === 'admin') {
        // Admins can read any 'user'-role document, plus their own document
        // regardless of role — otherwise an admin's own account is excluded
        // by the `role: { equals: 'user' }` scoping below, and Payload 404s
        // when loading their own /admin/account page.
        //
        // Explicitly typed as `Where[]` (rather than left as an inline
        // array literal): TS infers heterogeneous object-literal arrays by
        // widening each element with the other elements' keys set to
        // `undefined` (e.g. `{ role: {...}; id?: undefined }`), which then
        // fails `Where`'s index signature since it doesn't accept
        // `undefined`. Annotating the variable gives each element `Where`
        // as its contextual type directly, avoiding that widening — same
        // runtime query, no cast involved.
        const or: Where[] = [
          {
            role: {
              equals: 'user',
            },
          },
          {
            id: {
              equals: req.user.id,
            },
          },
        ]

        return { or }
      }

      return false
    },
    update: ({ req }) => {
      if (req.user?.role === 'super_admin') {
        return true
      }

      if (req.user?.role === 'admin') {
        // Same reasoning as `read`: without the self-id clause, an admin
        // can't edit their own account (e.g. their name) since their own
        // document's role ('admin') never matches `role: { equals: 'user' }`.
        // Actually changing `role` itself stays blocked regardless, via the
        // `role` field's own field-level access below and the beforeChange
        // hook's explicit self-role-change guard.
        //
        // See the `read` access function above for why this needs an
        // explicit `Where[]` annotation rather than an inline array literal.
        const or: Where[] = [
          {
            role: {
              equals: 'user',
            },
          },
          {
            id: {
              equals: req.user.id,
            },
          },
        ]

        return { or }
      }

      return false
    },
  },
  admin: {
    defaultColumns: ['name', 'email'],
    useAsTitle: 'name',
    // User management stays admin/super_admin territory even though
    // contributors can now open the admin panel — hide this collection
    // from a contributor's nav entirely (their read/update access to it
    // is separately restricted above regardless of nav visibility).
    hidden: ({ user }) => user?.role === 'user',
  },

  auth: true,

  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'user',
      access: {
        create: ({ req }) => Boolean(req.user?.role === 'super_admin'),
        update: ({ req }) => Boolean(req.user?.role === 'super_admin'),
      },
      options: [
        { label: 'User', value: 'user' },
        { label: 'Admin', value: 'admin' },
        { label: 'Super Admin', value: 'super_admin' },
      ],
    },
  ],
}

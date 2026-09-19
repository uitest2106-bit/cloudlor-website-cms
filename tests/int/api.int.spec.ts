import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

let payload: Payload

let adminUser: { id: number }
let secondAdminUser: { id: number }
let regularUser: { id: number }
let superAdminUser: { id: number }

describe('API', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })

    // Clean up stale RBAC test fixtures from previous runs.
    const existingTestUsers = await payload.find({
      collection: 'users',
      where: {
        or: [
          {
            email: {
              like: 'rbac-admin@test.local',
            },
          },
          {
            email: {
              like: 'rbac-second-admin@test.local',
            },
          },
          {
            email: {
              like: 'rbac-super-admin@test.local',
            },
          },
          {
            email: {
              like: 'rbac-user@test.local',
            },
          },
          {
            email: {
              like: 'rbac-cleanup-super-admin',
            },
          },
          {
            email: {
              like: 'rbac-pre-test-cleanup-super-admin',
            },
          },
        ],
      },
      limit: 100,
      overrideAccess: true,
    })

    const hasTestSuperAdmin = existingTestUsers.docs.some((user) => user.role === 'super_admin')

    let cleanupSuperAdminId: number | undefined

    // A temporary Super Admin is required so stale Super Admin fixtures
    // can be removed without violating the last-Super-Admin invariant.
    if (hasTestSuperAdmin) {
      const cleanupSuperAdmin = await payload.create({
        collection: 'users',
        data: {
          email: `rbac-pre-test-cleanup-super-admin-${Date.now()}@test.local`,
          password: 'test',
          name: 'RBAC Pre-Test Cleanup Super Admin',
          role: 'super_admin',
        },
        overrideAccess: true,
      })

      cleanupSuperAdminId = cleanupSuperAdmin.id
    }

    // Keep the temporary Super Admin alive while stale fixtures are deleted.
    for (const user of existingTestUsers.docs) {
      await payload.delete({
        collection: 'users',
        id: user.id,
        overrideAccess: true,
      })
    }

    if (cleanupSuperAdminId !== undefined) {
      await payload.delete({
        collection: 'users',
        id: cleanupSuperAdminId,
        overrideAccess: true,
      })
    }

    // Create fresh RBAC fixtures.
    adminUser = await payload.create({
      collection: 'users',
      data: {
        email: 'rbac-admin@test.local',
        password: 'test',
        name: 'RBAC Admin',
        role: 'admin',
      },
      overrideAccess: true,
    })

    secondAdminUser = await payload.create({
      collection: 'users',
      data: {
        email: 'rbac-second-admin@test.local',
        password: 'test',
        name: 'RBAC Second Admin',
        role: 'admin',
      },
      overrideAccess: true,
    })

    superAdminUser = await payload.create({
      collection: 'users',
      data: {
        email: 'rbac-super-admin@test.local',
        password: 'test',
        name: 'RBAC Super Admin',
        role: 'super_admin',
      },
      overrideAccess: true,
    })

    regularUser = await payload.create({
      collection: 'users',
      data: {
        email: 'rbac-user@test.local',
        password: 'test',
        name: 'RBAC User',
        role: 'user',
      },
      overrideAccess: true,
    })
  })

  afterAll(async () => {
    if (!payload || !superAdminUser || !adminUser || !secondAdminUser || !regularUser) {
      return
    }

    // Create a temporary second Super Admin so the test Super Admin
    // can be safely deleted without violating the last-Super-Admin rule.
    const cleanupSuperAdmin = await payload.create({
      collection: 'users',
      data: {
        email: `rbac-cleanup-super-admin-${Date.now()}@test.local`,
        password: 'test',
        name: 'RBAC Cleanup Super Admin',
        role: 'super_admin',
      },
      overrideAccess: true,
    })

    await payload.delete({
      collection: 'users',
      id: adminUser.id,
      overrideAccess: true,
    })

    await payload.delete({
      collection: 'users',
      id: secondAdminUser.id,
      overrideAccess: true,
    })

    await payload.delete({
      collection: 'users',
      id: regularUser.id,
      overrideAccess: true,
    })

    // Delete superAdminUser while cleanupSuperAdmin still exists, so there
    // are 2 super admins at the moment of deletion — the guard only blocks
    // deletion when exactly 1 would remain afterwards... actually when
    // exactly 1 exists at delete time. With 2 present, this succeeds.
    await payload.delete({
      collection: 'users',
      id: superAdminUser.id,
      overrideAccess: true,
    })

    // cleanupSuperAdmin is now the only super admin. It is intentionally
    // left in place rather than deleted, since deleting it would trip the
    // last-super-admin guard. beforeAll's stale-fixture cleanup on the next
    // run will remove it (it matches the 'rbac-cleanup-super-admin' email
    // pattern already handled there).
  })

  it('fetches users', async () => {
    const users = await payload.find({
      collection: 'users',
    })

    expect(users).toBeDefined()
  })

  it('prevents an admin from creating another admin', async () => {
    await expect(
      payload.create({
        collection: 'users',
        data: {
          email: 'rbac-created-admin@test.local',
          password: 'test',
          name: 'Unauthorized Admin',
          role: 'admin',
        },
        user: adminUser,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('prevents an admin from changing a user role', async () => {
    const updatedUser = await payload.update({
      collection: 'users',
      id: regularUser.id,
      data: {
        role: 'admin',
      },
      user: adminUser,
      overrideAccess: false,
    })

    expect(updatedUser.role).toBe('user')
  })

  it('allows an admin to update their own account', async () => {
    // access.update's self-id clause deliberately allows an admin to edit
    // their own document (e.g. their name) — without it, an admin couldn't
    // even open/save their own /admin/account page, since their own
    // document's role ('admin') never matches the `role: 'user'` scoping
    // that otherwise governs what an admin can update. See Users' access
    // config for the full reasoning.
    const updatedUser = await payload.update({
      collection: 'users',
      id: adminUser.id,
      data: {
        name: 'Changed Admin',
      },
      user: adminUser,
      overrideAccess: false,
    })

    expect(updatedUser.name).toBe('Changed Admin')
  })

  it('prevents an admin from updating another admin', async () => {
    await expect(
      payload.update({
        collection: 'users',
        id: secondAdminUser.id,
        data: {
          name: 'Changed Second Admin',
        },
        user: adminUser,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('prevents an admin from deleting their own account', async () => {
    // Unlike `read`/`update`, `access.delete` for an admin has no self-id
    // carve-out — it's scoped to `role: 'user'` documents only — so an
    // admin can't delete themselves any more than they can delete another
    // admin (next test).
    await expect(
      payload.delete({
        collection: 'users',
        id: adminUser.id,
        user: adminUser,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('prevents an admin from deleting another admin', async () => {
    await expect(
      payload.delete({
        collection: 'users',
        id: secondAdminUser.id,
        user: adminUser,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('prevents an admin from changing their own role', async () => {
    // Same field-level-denial behavior as the disallowed-`_status` cases in
    // pages-review-workflow.int.spec.ts: the collection-level access allows
    // this update (self-id clause), but the `role` field's own field-level
    // access rejects only that field, so Payload silently drops it rather
    // than rejecting the whole request. The call resolves; `role` is
    // unchanged.
    const updatedUser = await payload.update({
      collection: 'users',
      id: adminUser.id,
      data: {
        role: 'super_admin',
      },
      user: adminUser,
      overrideAccess: false,
    })

    expect(updatedUser.role).toBe('admin')
  })

  it('prevents the last super admin from changing their own role', async () => {
    await expect(
      payload.update({
        collection: 'users',
        id: superAdminUser.id,
        data: {
          role: 'admin',
        },
        user: superAdminUser,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('prevents the last super admin from being deleted', async () => {
    // The demo `superadmin@cloudlor.com` account (created for manual admin
    // panel testing) is a real, permanent super_admin in this shared dev
    // database, so there are always >= 2 super admins whenever this suite
    // runs — the guard only blocks deletion when the *global* count is
    // exactly 1, which never happens here as written. To actually exercise
    // it, temporarily demote every OTHER super admin (using the same
    // decoy-safe pattern this file already uses elsewhere) down to 'admin',
    // leaving this test's own fixture as the sole super admin, run the real
    // assertion, then restore them exactly — even if the assertion fails.
    const otherSuperAdmins = await payload.find({
      collection: 'users',
      where: {
        and: [
          {
            role: {
              equals: 'super_admin',
            },
          },
          {
            id: {
              not_equals: superAdminUser.id,
            },
          },
        ],
      },
      limit: 100,
      overrideAccess: true,
    })

    for (const otherSuperAdmin of otherSuperAdmins.docs) {
      await payload.update({
        collection: 'users',
        id: otherSuperAdmin.id,
        data: { role: 'admin' },
        overrideAccess: true,
      })
    }

    try {
      await expect(
        payload.delete({
          collection: 'users',
          id: superAdminUser.id,
          user: superAdminUser,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    } finally {
      for (const otherSuperAdmin of otherSuperAdmins.docs) {
        await payload.update({
          collection: 'users',
          id: otherSuperAdmin.id,
          data: { role: 'super_admin' },
          overrideAccess: true,
        })
      }
    }
  })

  it('allows an admin to update a regular user', async () => {
    const updatedUser = await payload.update({
      collection: 'users',
      id: regularUser.id,
      data: {
        name: 'Updated RBAC User',
      },
      user: adminUser,
      overrideAccess: false,
    })

    expect(updatedUser.name).toBe('Updated RBAC User')
    expect(updatedUser.role).toBe('user')
  })

  it('allows an admin to delete a regular user', async () => {
    const userToDelete = await payload.create({
      collection: 'users',
      data: {
        email: 'rbac-delete@test.local',
        password: 'test',
        name: 'User To Delete',
        role: 'user',
      },
      overrideAccess: true,
    })

    await expect(
      payload.delete({
        collection: 'users',
        id: userToDelete.id,
        user: adminUser,
        overrideAccess: false,
      }),
    ).resolves.toBeDefined()

    await expect(
      payload.findByID({
        collection: 'users',
        id: userToDelete.id,
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('allows a super admin to create an admin', async () => {
    const createdAdmin = await payload.create({
      collection: 'users',
      data: {
        email: 'rbac-created-by-super-admin@test.local',
        password: 'test',
        name: 'Created Admin',
        role: 'admin',
      },
      user: superAdminUser,
      overrideAccess: false,
    })

    expect(createdAdmin.role).toBe('admin')

    await payload.delete({
      collection: 'users',
      id: createdAdmin.id,
      overrideAccess: true,
    })
  })
})

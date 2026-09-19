import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import type { Page } from '@/payload-types'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

let payload: Payload

let contributorUser: { id: number; role: 'user' }
let adminUser: { id: number; role: 'admin' }
let superAdminUser: { id: number; role: 'super_admin' }

const TEST_EMAIL_PATTERNS = [
  'pages-workflow-contributor@test.local',
  'pages-workflow-admin@test.local',
  'pages-workflow-super-admin@test.local',
  'pages-workflow-cleanup-super-admin',
]

const minimalLayout: Page['layout'] = [
  {
    blockType: 'cta',
  },
]

// Minimal valid `hero` value. Only required when creating a page outside of
// draft mode (`draft: false`) — Payload relaxes required-field validation
// for drafts, which is why most fixtures below don't need this.
const minimalHero: Page['hero'] = {
  type: 'none',
}

describe('Pages review workflow', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })

    // Clean up stale fixtures from previous runs, using the same
    // temporary-super-admin pattern as the Users RBAC suite so cleanup
    // never violates the last-super-admin invariant.
    const existingTestUsers = await payload.find({
      collection: 'users',
      where: {
        or: TEST_EMAIL_PATTERNS.map((email) => ({ email: { like: email } })),
      },
      limit: 100,
      overrideAccess: true,
    })

    const hasTestSuperAdmin = existingTestUsers.docs.some((user) => user.role === 'super_admin')

    let cleanupSuperAdminId: number | undefined

    if (hasTestSuperAdmin) {
      const cleanupSuperAdmin = await payload.create({
        collection: 'users',
        data: {
          email: `pages-workflow-pre-test-cleanup-super-admin-${Date.now()}@test.local`,
          password: 'test',
          name: 'Pages Workflow Pre-Test Cleanup Super Admin',
          role: 'super_admin',
        },
        overrideAccess: true,
      })
      cleanupSuperAdminId = Number(cleanupSuperAdmin.id)
    }

    // Also clean up any stale test pages.
    const existingTestPages = await payload.find({
      collection: 'pages',
      where: {
        slug: { like: 'pages-workflow-test' },
      },
      limit: 100,
      overrideAccess: true,
    })

    for (const page of existingTestPages.docs) {
      await payload.delete({
        collection: 'pages',
        id: page.id,
        overrideAccess: true,
        context: { disableRevalidate: true },
      })
    }

    for (const user of existingTestUsers.docs) {
      await payload.delete({ collection: 'users', id: user.id, overrideAccess: true })
    }

    if (cleanupSuperAdminId !== undefined) {
      await payload.delete({
        collection: 'users',
        id: cleanupSuperAdminId,
        overrideAccess: true,
      })
    }

    // Create fresh fixtures.
    const contributorUserDoc = await payload.create({
      collection: 'users',
      data: {
        email: 'pages-workflow-contributor@test.local',
        password: 'test',
        name: 'Pages Workflow Contributor',
        role: 'user',
      },
      overrideAccess: true,
    })
    contributorUser = { id: Number(contributorUserDoc.id), role: 'user' }

    const adminUserDoc = await payload.create({
      collection: 'users',
      data: {
        email: 'pages-workflow-admin@test.local',
        password: 'test',
        name: 'Pages Workflow Admin',
        role: 'admin',
      },
      overrideAccess: true,
    })
    adminUser = { id: Number(adminUserDoc.id), role: 'admin' }

    const superAdminUserDoc = await payload.create({
      collection: 'users',
      data: {
        email: 'pages-workflow-super-admin@test.local',
        password: 'test',
        name: 'Pages Workflow Super Admin',
        role: 'super_admin',
      },
      overrideAccess: true,
    })
    superAdminUser = { id: Number(superAdminUserDoc.id), role: 'super_admin' }
  })

  afterAll(async () => {
    if (!payload || !contributorUser || !adminUser || !superAdminUser) {
      return
    }

    const remainingTestPages = await payload.find({
      collection: 'pages',
      where: {
        slug: { like: 'pages-workflow-test' },
      },
      limit: 100,
      overrideAccess: true,
    })

    for (const page of remainingTestPages.docs) {
      await payload.delete({
        collection: 'pages',
        id: page.id,
        overrideAccess: true,
        context: { disableRevalidate: true },
      })
    }

    // Same decoy pattern as the Users suite: create a second super admin,
    // delete the real one and the other fixtures while it exists, and
    // leave the decoy in place (it's cleaned up as a stale fixture on the
    // next run) so we never violate the last-super-admin invariant.
    const cleanupSuperAdmin = await payload.create({
      collection: 'users',
      data: {
        email: `pages-workflow-cleanup-super-admin-${Date.now()}@test.local`,
        password: 'test',
        name: 'Pages Workflow Cleanup Super Admin',
        role: 'super_admin',
      },
      overrideAccess: true,
    })

    await payload.delete({ collection: 'users', id: adminUser.id, overrideAccess: true })
    await payload.delete({ collection: 'users', id: contributorUser.id, overrideAccess: true })
    await payload.delete({ collection: 'users', id: superAdminUser.id, overrideAccess: true })

    void cleanupSuperAdmin
  })

  it('allows a contributor to create a page (as a draft)', async () => {
    const page = await payload.create({
      collection: 'pages',
      data: {
        title: 'Contributor Draft Page',
        slug: 'pages-workflow-test-contributor-draft',
        _status: 'draft',
      },
      draft: true,
      user: contributorUser,
      overrideAccess: false,
      context: { disableRevalidate: true },
    })

    expect(page._status).toBe('draft')

    await payload.delete({
      collection: 'pages',
      id: page.id,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  })

  it('prevents a contributor from publishing a page directly', async () => {
    // Field-level access denial doesn't reject the whole request — Payload
    // silently discards the disallowed `_status` value and falls back to
    // the field's default ('draft'). So the create succeeds, but the
    // contributor's attempt to publish is neutralized.
    const page = await payload.create({
      collection: 'pages',
      data: {
        title: 'Contributor Attempted Publish',
        slug: 'pages-workflow-test-contributor-publish-attempt',
        _status: 'published',
        hero: minimalHero,
        layout: minimalLayout,
      },
      draft: false,
      user: contributorUser,
      overrideAccess: false,
      context: { disableRevalidate: true },
    })

    expect(page._status).toBe('draft')

    await payload.delete({
      collection: 'pages',
      id: page.id,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  })

  it('prevents a contributor from publishing an existing draft via update', async () => {
    const draft = await payload.create({
      collection: 'pages',
      data: {
        title: 'Contributor Draft To Publish',
        slug: 'pages-workflow-test-contributor-update-publish',
        _status: 'draft',
      },
      draft: true,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })

    // Field-level access denial on update doesn't reject the request either
    // — Payload omits the disallowed field from the update and leaves its
    // existing value unchanged. The update succeeds, but `_status` stays
    // 'draft'.
    const updated = await payload.update({
      collection: 'pages',
      id: draft.id,
      data: { _status: 'published', layout: minimalLayout },
      user: contributorUser,
      overrideAccess: false,
      context: { disableRevalidate: true },
    })

    expect(updated._status).toBe('draft')

    await payload.delete({
      collection: 'pages',
      id: draft.id,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  })

  it('allows a contributor to keep editing their own draft', async () => {
    const draft = await payload.create({
      collection: 'pages',
      data: {
        title: 'Contributor Editable Draft',
        slug: 'pages-workflow-test-contributor-editable',
        _status: 'draft',
      },
      draft: true,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })

    const updated = await payload.update({
      collection: 'pages',
      id: draft.id,
      data: { title: 'Contributor Editable Draft (Updated)' },
      draft: true,
      user: contributorUser,
      overrideAccess: false,
      context: { disableRevalidate: true },
    })

    expect(updated.title).toBe('Contributor Editable Draft (Updated)')
    expect(updated._status).toBe('draft')

    await payload.delete({
      collection: 'pages',
      id: draft.id,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  })

  it('prevents a contributor from editing a page once published', async () => {
    const published = await payload.create({
      collection: 'pages',
      data: {
        title: 'Already Published Page',
        slug: 'pages-workflow-test-already-published',
        _status: 'published',
        hero: minimalHero,
        layout: minimalLayout,
      },
      draft: false,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })

    await expect(
      payload.update({
        collection: 'pages',
        id: published.id,
        data: { title: 'Contributor Tries To Edit Published Page' },
        user: contributorUser,
        overrideAccess: false,
        context: { disableRevalidate: true },
      }),
    ).rejects.toThrow()

    await payload.delete({
      collection: 'pages',
      id: published.id,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  })

  it('prevents a contributor from deleting a page', async () => {
    const draft = await payload.create({
      collection: 'pages',
      data: {
        title: 'Contributor Cannot Delete',
        slug: 'pages-workflow-test-contributor-delete-attempt',
        _status: 'draft',
      },
      draft: true,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })

    await expect(
      payload.delete({
        collection: 'pages',
        id: draft.id,
        user: contributorUser,
        overrideAccess: false,
        context: { disableRevalidate: true },
      }),
    ).rejects.toThrow()

    await payload.delete({
      collection: 'pages',
      id: draft.id,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  })

  it('allows an admin to publish a contributor draft', async () => {
    const draft = await payload.create({
      collection: 'pages',
      data: {
        title: 'Draft Awaiting Review',
        slug: 'pages-workflow-test-awaiting-review',
        _status: 'draft',
        layout: minimalLayout,
      },
      draft: true,
      user: contributorUser,
      overrideAccess: false,
      context: { disableRevalidate: true },
    })

    const published = await payload.update({
      collection: 'pages',
      id: draft.id,
      data: { _status: 'published', layout: minimalLayout },
      user: adminUser,
      overrideAccess: false,
      context: { disableRevalidate: true },
    })

    expect(published._status).toBe('published')

    await payload.delete({
      collection: 'pages',
      id: published.id,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  })

  it('allows an admin to delete a page', async () => {
    const page = await payload.create({
      collection: 'pages',
      data: {
        title: 'Admin Deletable Page',
        slug: 'pages-workflow-test-admin-delete',
        _status: 'draft',
      },
      draft: true,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })

    await expect(
      payload.delete({
        collection: 'pages',
        id: page.id,
        user: adminUser,
        overrideAccess: false,
        context: { disableRevalidate: true },
      }),
    ).resolves.toBeDefined()
  })

  it('allows a super admin to publish and edit any page', async () => {
    const draft = await payload.create({
      collection: 'pages',
      data: {
        title: 'Super Admin Managed Page',
        slug: 'pages-workflow-test-super-admin-managed',
        _status: 'draft',
        layout: minimalLayout,
      },
      draft: true,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })

    const published = await payload.update({
      collection: 'pages',
      id: draft.id,
      data: {
        _status: 'published',
        title: 'Super Admin Managed Page (Published)',
        layout: minimalLayout,
      },
      user: superAdminUser,
      overrideAccess: false,
      context: { disableRevalidate: true },
    })

    expect(published._status).toBe('published')
    expect(published.title).toBe('Super Admin Managed Page (Published)')

    await payload.delete({
      collection: 'pages',
      id: published.id,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  })
})

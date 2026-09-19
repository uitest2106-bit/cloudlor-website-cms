import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import type { Post } from '@/payload-types'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

let payload: Payload

let contributorUser: { id: number; role: 'user' }
let adminUser: { id: number; role: 'admin' }
let superAdminUser: { id: number; role: 'super_admin' }

const TEST_EMAIL_PATTERNS = [
  'posts-workflow-contributor@test.local',
  'posts-workflow-admin@test.local',
  'posts-workflow-super-admin@test.local',
  'posts-workflow-cleanup-super-admin',
]

// `content` (richText) is `required: true` with no `defaultValue`, same
// category as `layout` on Pages — draft creates relax this, but a real
// (non-draft) publish validates it fully. Lexical's own required check
// (`hasText`) rejects an empty/whitespace-only document, so this needs an
// actual non-empty paragraph, not just a bare root node.
const minimalContent: Post['content'] = {
  root: {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [
          {
            type: 'text',
            version: 1,
            text: 'Test content.',
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        version: 1,
      },
    ],
    direction: null,
    format: '',
    indent: 0,
    version: 1,
  },
}

describe('Posts review workflow', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })

    // Clean up stale fixtures from previous runs, using the same
    // temporary-super-admin pattern as the Users/Pages RBAC suites so
    // cleanup never violates the last-super-admin invariant.
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
          email: `posts-workflow-pre-test-cleanup-super-admin-${Date.now()}@test.local`,
          password: 'test',
          name: 'Posts Workflow Pre-Test Cleanup Super Admin',
          role: 'super_admin',
        },
        overrideAccess: true,
      })
      cleanupSuperAdminId = Number(cleanupSuperAdmin.id)
    }

    // Also clean up any stale test posts.
    const existingTestPosts = await payload.find({
      collection: 'posts',
      where: {
        slug: { like: 'posts-workflow-test' },
      },
      limit: 100,
      overrideAccess: true,
    })

    for (const post of existingTestPosts.docs) {
      await payload.delete({
        collection: 'posts',
        id: post.id,
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
        email: 'posts-workflow-contributor@test.local',
        password: 'test',
        name: 'Posts Workflow Contributor',
        role: 'user',
      },
      overrideAccess: true,
    })
    contributorUser = { id: Number(contributorUserDoc.id), role: 'user' }

    const adminUserDoc = await payload.create({
      collection: 'users',
      data: {
        email: 'posts-workflow-admin@test.local',
        password: 'test',
        name: 'Posts Workflow Admin',
        role: 'admin',
      },
      overrideAccess: true,
    })
    adminUser = { id: Number(adminUserDoc.id), role: 'admin' }

    const superAdminUserDoc = await payload.create({
      collection: 'users',
      data: {
        email: 'posts-workflow-super-admin@test.local',
        password: 'test',
        name: 'Posts Workflow Super Admin',
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

    const remainingTestPosts = await payload.find({
      collection: 'posts',
      where: {
        slug: { like: 'posts-workflow-test' },
      },
      limit: 100,
      overrideAccess: true,
    })

    for (const post of remainingTestPosts.docs) {
      await payload.delete({
        collection: 'posts',
        id: post.id,
        overrideAccess: true,
        context: { disableRevalidate: true },
      })
    }

    // Same decoy pattern as the Users/Pages suites: create a second super
    // admin, delete the real one and the other fixtures while it exists, and
    // leave the decoy in place (it's cleaned up as a stale fixture on the
    // next run) so we never violate the last-super-admin invariant.
    const cleanupSuperAdmin = await payload.create({
      collection: 'users',
      data: {
        email: `posts-workflow-cleanup-super-admin-${Date.now()}@test.local`,
        password: 'test',
        name: 'Posts Workflow Cleanup Super Admin',
        role: 'super_admin',
      },
      overrideAccess: true,
    })

    await payload.delete({ collection: 'users', id: adminUser.id, overrideAccess: true })
    await payload.delete({ collection: 'users', id: contributorUser.id, overrideAccess: true })
    await payload.delete({ collection: 'users', id: superAdminUser.id, overrideAccess: true })

    void cleanupSuperAdmin
  })

  it('allows a contributor to create a post (as a draft)', async () => {
    const post = await payload.create({
      collection: 'posts',
      data: {
        title: 'Contributor Draft Post',
        slug: 'posts-workflow-test-contributor-draft',
        _status: 'draft',
      },
      draft: true,
      user: contributorUser,
      overrideAccess: false,
      context: { disableRevalidate: true },
    })

    expect(post._status).toBe('draft')

    await payload.delete({
      collection: 'posts',
      id: post.id,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  })

  it('prevents a contributor from publishing a post directly', async () => {
    // Field-level access denial doesn't reject the whole request — Payload
    // silently discards the disallowed `_status` value and falls back to
    // the field's default ('draft'). So the create succeeds, but the
    // contributor's attempt to publish is neutralized.
    const post = await payload.create({
      collection: 'posts',
      data: {
        title: 'Contributor Attempted Publish',
        slug: 'posts-workflow-test-contributor-publish-attempt',
        _status: 'published',
        content: minimalContent,
      },
      draft: false,
      user: contributorUser,
      overrideAccess: false,
      context: { disableRevalidate: true },
    })

    expect(post._status).toBe('draft')

    await payload.delete({
      collection: 'posts',
      id: post.id,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  })

  it('prevents a contributor from publishing an existing draft via update', async () => {
    const draft = await payload.create({
      collection: 'posts',
      data: {
        title: 'Contributor Draft To Publish',
        slug: 'posts-workflow-test-contributor-update-publish',
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
      collection: 'posts',
      id: draft.id,
      data: { _status: 'published', content: minimalContent },
      user: contributorUser,
      overrideAccess: false,
      context: { disableRevalidate: true },
    })

    expect(updated._status).toBe('draft')

    await payload.delete({
      collection: 'posts',
      id: draft.id,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  })

  it('allows a contributor to keep editing their own draft', async () => {
    const draft = await payload.create({
      collection: 'posts',
      data: {
        title: 'Contributor Editable Draft',
        slug: 'posts-workflow-test-contributor-editable',
        _status: 'draft',
      },
      draft: true,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })

    const updated = await payload.update({
      collection: 'posts',
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
      collection: 'posts',
      id: draft.id,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  })

  it('prevents a contributor from editing a post once published', async () => {
    const published = await payload.create({
      collection: 'posts',
      data: {
        title: 'Already Published Post',
        slug: 'posts-workflow-test-already-published',
        _status: 'published',
        content: minimalContent,
      },
      draft: false,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })

    await expect(
      payload.update({
        collection: 'posts',
        id: published.id,
        data: { title: 'Contributor Tries To Edit Published Post' },
        user: contributorUser,
        overrideAccess: false,
        context: { disableRevalidate: true },
      }),
    ).rejects.toThrow()

    await payload.delete({
      collection: 'posts',
      id: published.id,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  })

  it('prevents a contributor from deleting a post', async () => {
    const draft = await payload.create({
      collection: 'posts',
      data: {
        title: 'Contributor Cannot Delete',
        slug: 'posts-workflow-test-contributor-delete-attempt',
        _status: 'draft',
      },
      draft: true,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })

    await expect(
      payload.delete({
        collection: 'posts',
        id: draft.id,
        user: contributorUser,
        overrideAccess: false,
        context: { disableRevalidate: true },
      }),
    ).rejects.toThrow()

    await payload.delete({
      collection: 'posts',
      id: draft.id,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  })

  it('allows an admin to publish a contributor draft', async () => {
    const draft = await payload.create({
      collection: 'posts',
      data: {
        title: 'Draft Awaiting Review',
        slug: 'posts-workflow-test-awaiting-review',
        _status: 'draft',
        content: minimalContent,
      },
      draft: true,
      user: contributorUser,
      overrideAccess: false,
      context: { disableRevalidate: true },
    })

    const published = await payload.update({
      collection: 'posts',
      id: draft.id,
      data: { _status: 'published', content: minimalContent },
      user: adminUser,
      overrideAccess: false,
      context: { disableRevalidate: true },
    })

    expect(published._status).toBe('published')

    await payload.delete({
      collection: 'posts',
      id: published.id,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  })

  it('allows an admin to delete a post', async () => {
    const post = await payload.create({
      collection: 'posts',
      data: {
        title: 'Admin Deletable Post',
        slug: 'posts-workflow-test-admin-delete',
        _status: 'draft',
      },
      draft: true,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })

    await expect(
      payload.delete({
        collection: 'posts',
        id: post.id,
        user: adminUser,
        overrideAccess: false,
        context: { disableRevalidate: true },
      }),
    ).resolves.toBeDefined()
  })

  it('allows a super admin to publish and edit any post', async () => {
    const draft = await payload.create({
      collection: 'posts',
      data: {
        title: 'Super Admin Managed Post',
        slug: 'posts-workflow-test-super-admin-managed',
        _status: 'draft',
        content: minimalContent,
      },
      draft: true,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })

    const published = await payload.update({
      collection: 'posts',
      id: draft.id,
      data: {
        _status: 'published',
        title: 'Super Admin Managed Post (Published)',
        content: minimalContent,
      },
      user: superAdminUser,
      overrideAccess: false,
      context: { disableRevalidate: true },
    })

    expect(published._status).toBe('published')
    expect(published.title).toBe('Super Admin Managed Post (Published)')

    await payload.delete({
      collection: 'posts',
      id: published.id,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  })
})

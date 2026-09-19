import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import type { Page } from '@/payload-types'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

let payload: Payload

let contributorUser: { id: number; role: 'user' }
let secondContributorUser: { id: number; role: 'user' }
let adminUser: { id: number; role: 'admin' }
let superAdminUser: { id: number; role: 'super_admin' }

const TEST_EMAIL_PATTERNS = [
  'pubreq-contributor@test.local',
  'pubreq-second-contributor@test.local',
  'pubreq-admin@test.local',
  'pubreq-super-admin@test.local',
  'pubreq-cleanup-super-admin',
  'pubreq-pre-test-cleanup-super-admin',
]

const TEST_PAGE_SLUG_PATTERN = 'pubreq-test'

// `layout` has no `defaultValue` and is `required: true` on Pages (unlike
// `hero`, which defaults to `{ type: 'none' }`), so it's exempt from
// draft-create's relaxed validation but NOT from a real (non-draft) publish.
// The approval hook's `payload.update({ data: { _status: 'published' } })`
// merges onto the document's *latest version* (see
// `getLatestCollectionVersion` — it selects `latest: true`, not
// `version._status: 'published'`), so a request approved here would fail
// with "Content > Layout is required" unless the draft itself already has a
// valid layout — same as `minimalLayout` in pages-review-workflow.int.spec.ts.
const minimalLayout: Page['layout'] = [
  {
    blockType: 'cta',
  },
]

describe('PublicationRequests', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })

    // Clean up stale fixtures from previous runs. Requests are deleted
    // before their users (and before the pages below), so nothing is ever
    // left pointing at an id that's about to be removed.
    const existingTestUsers = await payload.find({
      collection: 'users',
      where: {
        or: TEST_EMAIL_PATTERNS.map((email) => ({ email: { like: email } })),
      },
      limit: 100,
      overrideAccess: true,
    })

    if (existingTestUsers.docs.length > 0) {
      const staleUserIds = existingTestUsers.docs.map((user) => user.id)

      const staleRequests = await payload.find({
        collection: 'publication-requests',
        where: { requestedBy: { in: staleUserIds } },
        limit: 100,
        overrideAccess: true,
      })

      for (const request of staleRequests.docs) {
        await payload.delete({
          collection: 'publication-requests',
          id: request.id,
          overrideAccess: true,
        })
      }
    }

    const existingTestPages = await payload.find({
      collection: 'pages',
      where: {
        slug: { like: TEST_PAGE_SLUG_PATTERN },
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

    // Same temporary-super-admin cleanup pattern as the other RBAC suites,
    // so removing a stale super_admin fixture never trips the
    // last-super-admin guard.
    const hasTestSuperAdmin = existingTestUsers.docs.some((user) => user.role === 'super_admin')
    let cleanupSuperAdminId: number | undefined

    if (hasTestSuperAdmin) {
      const cleanupSuperAdmin = await payload.create({
        collection: 'users',
        data: {
          email: `pubreq-pre-test-cleanup-super-admin-${Date.now()}@test.local`,
          password: 'test',
          name: 'PubReq Pre-Test Cleanup Super Admin',
          role: 'super_admin',
        },
        overrideAccess: true,
      })
      cleanupSuperAdminId = Number(cleanupSuperAdmin.id)
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
        email: 'pubreq-contributor@test.local',
        password: 'test',
        name: 'PubReq Contributor',
        role: 'user',
      },
      overrideAccess: true,
    })
    contributorUser = { id: Number(contributorUserDoc.id), role: 'user' }

    const secondContributorUserDoc = await payload.create({
      collection: 'users',
      data: {
        email: 'pubreq-second-contributor@test.local',
        password: 'test',
        name: 'PubReq Second Contributor',
        role: 'user',
      },
      overrideAccess: true,
    })
    secondContributorUser = { id: Number(secondContributorUserDoc.id), role: 'user' }

    const adminUserDoc = await payload.create({
      collection: 'users',
      data: {
        email: 'pubreq-admin@test.local',
        password: 'test',
        name: 'PubReq Admin',
        role: 'admin',
      },
      overrideAccess: true,
    })
    adminUser = { id: Number(adminUserDoc.id), role: 'admin' }

    const superAdminUserDoc = await payload.create({
      collection: 'users',
      data: {
        email: 'pubreq-super-admin@test.local',
        password: 'test',
        name: 'PubReq Super Admin',
        role: 'super_admin',
      },
      overrideAccess: true,
    })
    superAdminUser = { id: Number(superAdminUserDoc.id), role: 'super_admin' }
  })

  afterAll(async () => {
    if (!payload || !contributorUser || !secondContributorUser || !adminUser || !superAdminUser) {
      return
    }

    const testUserIds = [
      contributorUser.id,
      secondContributorUser.id,
      adminUser.id,
      superAdminUser.id,
    ]

    const remainingRequests = await payload.find({
      collection: 'publication-requests',
      where: { requestedBy: { in: testUserIds } },
      limit: 100,
      overrideAccess: true,
    })

    for (const request of remainingRequests.docs) {
      await payload.delete({
        collection: 'publication-requests',
        id: request.id,
        overrideAccess: true,
      })
    }

    const remainingTestPages = await payload.find({
      collection: 'pages',
      where: {
        slug: { like: TEST_PAGE_SLUG_PATTERN },
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

    // Same decoy pattern as the other RBAC suites: create a second super
    // admin, delete the real fixtures while it exists, and leave the decoy
    // in place (it's cleaned up as a stale fixture on the next run).
    const cleanupSuperAdmin = await payload.create({
      collection: 'users',
      data: {
        email: `pubreq-cleanup-super-admin-${Date.now()}@test.local`,
        password: 'test',
        name: 'PubReq Cleanup Super Admin',
        role: 'super_admin',
      },
      overrideAccess: true,
    })

    await payload.delete({ collection: 'users', id: contributorUser.id, overrideAccess: true })
    await payload.delete({ collection: 'users', id: secondContributorUser.id, overrideAccess: true })
    await payload.delete({ collection: 'users', id: adminUser.id, overrideAccess: true })
    await payload.delete({ collection: 'users', id: superAdminUser.id, overrideAccess: true })

    void cleanupSuperAdmin
  })

  const createTestPage = (slugSuffix: string) =>
    payload.create({
      collection: 'pages',
      data: {
        title: `PubReq Test Page (${slugSuffix})`,
        slug: `${TEST_PAGE_SLUG_PATTERN}-${slugSuffix}`,
        _status: 'draft',
        layout: minimalLayout,
      },
      draft: true,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })

  const deleteTestPage = (id: number) =>
    payload.delete({
      collection: 'pages',
      id,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })

  // `documentUpdatedAt`/`requestedBy`/`status` are all `required: true` on
  // PublicationRequests, and Payload's generated type for create `data`
  // reflects that literally — it can't know the collection's own
  // `beforeChange` hook overwrites all three unconditionally on create
  // (see src/collections/PublicationRequests/index.ts). The values here are
  // placeholders only, to satisfy that type; the hook computes the real
  // ones from `req.user` and the target document's current `updatedAt`.
  const createRequestData = (documentId: number, requesterId: number) => ({
    document: { relationTo: 'pages' as const, value: documentId },
    documentUpdatedAt: new Date().toISOString(),
    requestedBy: requesterId,
    status: 'pending' as const,
  })

  it('allows a contributor to submit a request for their draft, snapshotting the current version', async () => {
    const page = await createTestPage('submit')

    const draftPage = await payload.findByID({
      collection: 'pages',
      id: page.id,
      draft: true,
      overrideAccess: true,
    })

    const request = await payload.create({
      collection: 'publication-requests',
      data: createRequestData(page.id, contributorUser.id),
      user: contributorUser,
      overrideAccess: false,
      depth: 0,
    })

    expect(request.status).toBe('pending')
    expect(request.requestedBy).toBe(contributorUser.id)
    expect(new Date(request.documentUpdatedAt).getTime()).toBe(new Date(draftPage.updatedAt).getTime())

    await payload.delete({ collection: 'publication-requests', id: request.id, overrideAccess: true })
    await deleteTestPage(page.id)
  })

  it("scopes a contributor's reads to only their own requests, but admins see all", async () => {
    const page = await createTestPage('scoping')

    const ownRequest = await payload.create({
      collection: 'publication-requests',
      data: createRequestData(page.id, contributorUser.id),
      user: contributorUser,
      overrideAccess: false,
      depth: 0,
    })

    const otherRequest = await payload.create({
      collection: 'publication-requests',
      data: createRequestData(page.id, secondContributorUser.id),
      user: secondContributorUser,
      overrideAccess: false,
      depth: 0,
    })

    const contributorView = await payload.find({
      collection: 'publication-requests',
      where: { id: { in: [ownRequest.id, otherRequest.id] } },
      user: contributorUser,
      overrideAccess: false,
      depth: 0,
    })

    expect(contributorView.docs.map((doc) => doc.id)).toEqual([ownRequest.id])

    const adminView = await payload.find({
      collection: 'publication-requests',
      where: { id: { in: [ownRequest.id, otherRequest.id] } },
      user: adminUser,
      overrideAccess: false,
      depth: 0,
    })

    expect(adminView.docs.map((doc) => doc.id).sort()).toEqual(
      [ownRequest.id, otherRequest.id].sort(),
    )

    await payload.delete({ collection: 'publication-requests', id: ownRequest.id, overrideAccess: true })
    await payload.delete({ collection: 'publication-requests', id: otherRequest.id, overrideAccess: true })
    await deleteTestPage(page.id)
  })

  it('prevents a contributor from acting on their own request', async () => {
    const page = await createTestPage('contributor-update')
    const request = await payload.create({
      collection: 'publication-requests',
      data: createRequestData(page.id, contributorUser.id),
      user: contributorUser,
      overrideAccess: false,
      depth: 0,
    })

    await expect(
      payload.update({
        collection: 'publication-requests',
        id: request.id,
        data: { status: 'approved' },
        user: contributorUser,
        overrideAccess: false,
      }),
    ).rejects.toThrow()

    await payload.delete({ collection: 'publication-requests', id: request.id, overrideAccess: true })
    await deleteTestPage(page.id)
  })

  it('allows an admin to approve a request, which publishes the document', async () => {
    const page = await createTestPage('approve')
    const request = await payload.create({
      collection: 'publication-requests',
      data: createRequestData(page.id, contributorUser.id),
      user: contributorUser,
      overrideAccess: false,
      depth: 0,
    })

    // The approval hook publishes the target page via `req.payload.update`,
    // reusing this same `req` (see PublicationRequests' beforeChange hook) —
    // so `disableRevalidate` here also reaches that nested page update.
    // Without it, `revalidatePage`'s `next/cache` call fails outside a real
    // Next.js request (no static generation store exists under vitest);
    // in production this hook always runs inside an actual request, where
    // that store is present, so this is a test-environment-only guard, same
    // as the `context: { disableRevalidate: true }` used elsewhere in this
    // file for direct page mutations.
    const approved = await payload.update({
      collection: 'publication-requests',
      id: request.id,
      data: { status: 'approved' },
      user: adminUser,
      overrideAccess: false,
      depth: 0,
      context: { disableRevalidate: true },
    })

    expect(approved.status).toBe('approved')
    expect(approved.reviewedBy).toBe(adminUser.id)

    const publishedPage = await payload.findByID({
      collection: 'pages',
      id: page.id,
      overrideAccess: true,
    })

    expect(publishedPage._status).toBe('published')

    await payload.delete({ collection: 'publication-requests', id: request.id, overrideAccess: true })
    await deleteTestPage(page.id)
  })

  it('blocks approval when the document changed since the request was submitted', async () => {
    const page = await createTestPage('stale')
    const request = await payload.create({
      collection: 'publication-requests',
      data: createRequestData(page.id, contributorUser.id),
      user: contributorUser,
      overrideAccess: false,
      depth: 0,
    })

    // Contributor keeps editing their draft after submitting the request.
    await payload.update({
      collection: 'pages',
      id: page.id,
      data: { title: 'PubReq Test Page (Stale, Edited)' },
      draft: true,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })

    await expect(
      payload.update({
        collection: 'publication-requests',
        id: request.id,
        data: { status: 'approved' },
        user: adminUser,
        overrideAccess: false,
      }),
    ).rejects.toThrow(/changed since the request was submitted/)

    const stillDraftPage = await payload.findByID({
      collection: 'pages',
      id: page.id,
      overrideAccess: true,
    })
    expect(stillDraftPage._status).toBe('draft')

    await payload.delete({ collection: 'publication-requests', id: request.id, overrideAccess: true })
    await deleteTestPage(page.id)
  })

  it('requires a rejection reason when rejecting', async () => {
    const page = await createTestPage('reject-no-reason')
    const request = await payload.create({
      collection: 'publication-requests',
      data: createRequestData(page.id, contributorUser.id),
      user: contributorUser,
      overrideAccess: false,
      depth: 0,
    })

    await expect(
      payload.update({
        collection: 'publication-requests',
        id: request.id,
        data: { status: 'rejected' },
        user: adminUser,
        overrideAccess: false,
      }),
    ).rejects.toThrow(/rejection reason is required/)

    await payload.delete({ collection: 'publication-requests', id: request.id, overrideAccess: true })
    await deleteTestPage(page.id)
  })

  it('allows rejecting with a reason, without publishing the document', async () => {
    const page = await createTestPage('reject-with-reason')
    const request = await payload.create({
      collection: 'publication-requests',
      data: createRequestData(page.id, contributorUser.id),
      user: contributorUser,
      overrideAccess: false,
      depth: 0,
    })

    const rejected = await payload.update({
      collection: 'publication-requests',
      id: request.id,
      data: { status: 'rejected', rejectionReason: 'Needs more work.' },
      user: adminUser,
      overrideAccess: false,
      depth: 0,
    })

    expect(rejected.status).toBe('rejected')
    expect(rejected.rejectionReason).toBe('Needs more work.')

    const stillDraftPage = await payload.findByID({
      collection: 'pages',
      id: page.id,
      overrideAccess: true,
    })
    expect(stillDraftPage._status).toBe('draft')

    await payload.delete({ collection: 'publication-requests', id: request.id, overrideAccess: true })
    await deleteTestPage(page.id)
  })

  it('keeps document/documentUpdatedAt/requestedBy immutable on update regardless of what is submitted', async () => {
    const page = await createTestPage('immutable')
    const otherPage = await createTestPage('immutable-other')

    const request = await payload.create({
      collection: 'publication-requests',
      data: createRequestData(page.id, contributorUser.id),
      user: contributorUser,
      overrideAccess: false,
      depth: 0,
    })

    const updated = await payload.update({
      collection: 'publication-requests',
      id: request.id,
      data: {
        document: { relationTo: 'pages', value: otherPage.id },
        requestedBy: adminUser.id,
      },
      user: adminUser,
      overrideAccess: false,
      depth: 0,
    })

    expect(updated.document).toEqual({ relationTo: 'pages', value: page.id })
    expect(updated.requestedBy).toBe(contributorUser.id)

    await payload.delete({ collection: 'publication-requests', id: request.id, overrideAccess: true })
    await deleteTestPage(page.id)
    await deleteTestPage(otherPage.id)
  })
})

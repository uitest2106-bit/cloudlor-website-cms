import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import type { PublicationRequest } from '@/payload-types'

import { APIError } from 'payload'

import { hasRole } from '../../access/hasRole'

const REVIEWABLE_COLLECTIONS = ['pages', 'posts'] as const

/**
 * A relationship field's submitted value is always a raw id at hook time in
 * this app (Payload only populates it when a query explicitly requests
 * depth), but the generated type also allows the populated document shape
 * for safety. Narrow to a plain numeric id without a cast so both cases are
 * handled correctly rather than assumed away.
 */
const resolveDocumentId = (value: number | { id: number } | null | undefined): number | undefined =>
  typeof value === 'object' && value !== null ? value.id : (value ?? undefined)

/**
 * Formal "ask an admin to publish this" workflow. A contributor (or an
 * admin asking a super_admin to sign off) creates a request pointing at a
 * Pages/Posts document; an admin/super_admin reviews it by changing
 * `status` to 'approved' or 'rejected'.
 *
 * The core guarantee: an approval can only ever apply to the *exact*
 * version of the document that was actually reviewed. `documentUpdatedAt`
 * snapshots the target document's `updatedAt` at request-creation time;
 * the beforeChange hook below re-checks that snapshot against the
 * document's *current* `updatedAt` at approval time and refuses to
 * publish if they no longer match (the contributor edited the document
 * again after submitting, so what would get published was never actually
 * reviewed).
 *
 * `requestedBy`/`documentUpdatedAt`/`document` are enforced as immutable
 * *after creation* entirely inside the beforeChange hook below (not via
 * field-level `access`), since the hook's own return value is what
 * actually gets persisted regardless of what a caller submits — this
 * avoids depending on the relative order of field-level access checks vs.
 * collection hooks. `admin.readOnly` on `documentUpdatedAt`/`requestedBy`
 * is presentation only (the hook always computes them); `document` is
 * deliberately left editable in the UI — it's the one field the requester
 * must actually choose when creating a request — and the hook still
 * refuses to change it on a later update regardless of what's submitted.
 */
const beforeChangeHook: CollectionBeforeChangeHook<PublicationRequest> = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation === 'create') {
    if (!req.user) {
      throw new APIError('You must be logged in to submit a publication request.', 401)
    }

    const relationTo = data.document?.relationTo
    const documentId = resolveDocumentId(data.document?.value)

    if (!relationTo || !documentId) {
      throw new APIError('A document must be specified.', 400)
    }

    // `draft: true` is required here: Pages/Posts are drafts-enabled,
    // so an unpublished (or not-yet-republished) edit only updates the
    // versions table, never the main-table row. A plain findByID
    // without `draft: true` would read that frozen main-table row —
    // whose `updatedAt` does NOT change as the contributor keeps
    // editing their draft — silently defeating the whole point of
    // this snapshot.
    const target = await req.payload.findByID({
      collection: relationTo,
      id: documentId,
      overrideAccess: true,
      draft: true,
    })

    return {
      ...data,
      requestedBy: req.user.id,
      documentUpdatedAt: target.updatedAt,
      status: 'pending',
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: undefined,
    }
  }

  // operation === 'update' — collection-level `access.update` above
  // already restricts this to admin/super_admin only. `originalDoc` is
  // always populated on update per Payload's contract (only 'create'
  // leaves it undefined); this guard just makes that explicit for the
  // type checker rather than asserting past it.
  if (!originalDoc) {
    throw new APIError('This request could not be found.', 404)
  }

  // `document`/`documentUpdatedAt`/`requestedBy` are immutable after
  // creation regardless of what's submitted.
  const preserved = {
    ...data,
    document: originalDoc.document,
    documentUpdatedAt: originalDoc.documentUpdatedAt,
    requestedBy: originalDoc.requestedBy,
  }

  const newStatus = preserved.status
  const isStatusChanging = Boolean(newStatus) && newStatus !== originalDoc.status

  if (!isStatusChanging) {
    return preserved
  }

  if (newStatus === 'rejected' && !preserved.rejectionReason?.trim()) {
    throw new APIError('A rejection reason is required when rejecting a request.', 400)
  }

  if (newStatus === 'approved') {
    const relationTo = originalDoc.document?.relationTo
    const documentId = resolveDocumentId(originalDoc.document?.value)

    if (!relationTo || !documentId) {
      throw new APIError('This request has no associated document.', 400)
    }

    // Same reasoning as the create branch above: must read the actual
    // latest draft revision, not the frozen main-table row, or a real
    // edit since submission would go undetected.
    const target = await req.payload.findByID({
      collection: relationTo,
      id: documentId,
      overrideAccess: true,
      draft: true,
    })

    const submittedAt = new Date(originalDoc.documentUpdatedAt).getTime()
    const currentAt = new Date(target.updatedAt).getTime()

    if (submittedAt !== currentAt) {
      // 409 Conflict: the document changed underneath this review,
      // same as any optimistic-concurrency version mismatch.
      throw new APIError(
        'This document has changed since the request was submitted — ask the contributor to resubmit before approving.',
        409,
      )
    }

    // Publish using the approving admin's own permissions (the same
    // `req`, not overrideAccess), so this still runs through the
    // normal canSetPublishedStatus field-access check on `_status`
    // — server-side authorization stays the single source of truth.
    await req.payload.update({
      collection: relationTo,
      id: documentId,
      data: {
        _status: 'published',
      },
      req,
      overrideAccess: false,
    })
  }

  return {
    ...preserved,
    reviewedBy: req.user?.id,
    reviewedAt: new Date().toISOString(),
  }
}

export const PublicationRequests: CollectionConfig<'publication-requests'> = {
  slug: 'publication-requests',
  labels: {
    singular: 'Publication Request',
    plural: 'Publication Requests',
  },
  admin: {
    defaultColumns: ['document', 'status', 'requestedBy', 'createdAt', 'reviewedBy', 'reviewedAt'],
  },
  access: {
    // Any authenticated role may submit a request — not contributor-only,
    // since an admin may also want to ask a super_admin to sign off.
    create: hasRole(['user', 'admin', 'super_admin']),
    // Contributors (and admins, when they're the requester) see only their
    // own requests; admin/super_admin see all requests regardless of who
    // filed them.
    read: ({ req }) => {
      if (req.user?.role === 'admin' || req.user?.role === 'super_admin') {
        return true
      }
      if (req.user) {
        return {
          requestedBy: {
            equals: req.user.id,
          },
        }
      }
      return false
    },
    // Only admin/super_admin may act on a request. The requester cannot
    // edit their own request once created — it's an audit trail, not a
    // draft; if the underlying document needs more work, they edit the
    // document itself and submit a new request.
    update: hasRole(['admin', 'super_admin']),
    // Only admin/super_admin may delete (cleanup) — requesters cannot
    // delete their own requests either, for the same audit-trail reason.
    delete: hasRole(['admin', 'super_admin']),
  },
  fields: [
    {
      name: 'document',
      type: 'relationship',
      relationTo: [...REVIEWABLE_COLLECTIONS],
      hasMany: false,
      required: true,
      admin: {
        description: 'The page or post this request is asking an admin to review and publish.',
      },
    },
    {
      name: 'documentUpdatedAt',
      type: 'date',
      required: true,
      admin: {
        readOnly: true,
        description:
          'Internal: the version of the document that was actually submitted for review. Set automatically.',
      },
    },
    {
      name: 'requestedBy',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Approved', value: 'approved' },
        { label: 'Rejected', value: 'rejected' },
        { label: 'Stale (document changed since submission)', value: 'stale' },
      ],
      access: {
        // Belt-and-suspenders alongside the collection-level `update`
        // access above (same pattern as Users' `role` field) — only
        // admin/super_admin may move a request off 'pending'.
        update: ({ req }) => Boolean(req.user?.role === 'admin' || req.user?.role === 'super_admin'),
      },
    },
    {
      name: 'rejectionReason',
      type: 'textarea',
      admin: {
        condition: (data) => data?.status === 'rejected',
        description: 'Required when rejecting a request.',
      },
    },
    {
      name: 'reviewedBy',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'reviewedAt',
      type: 'date',
      admin: {
        readOnly: true,
      },
    },
  ],
  hooks: {
    beforeChange: [beforeChangeHook],
  },
}

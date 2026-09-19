import type { Access, FieldAccess } from 'payload'

/**
 * Update access for content collections with a review workflow (Pages, Posts).
 *
 * - super_admin / admin: full update access to any document, any status.
 * - user: may update documents, but ONLY while those documents remain in
 *   draft status. This lets contributors create and edit content freely,
 *   but the moment a document is published, further edits require an
 *   admin (who reviews the change and republishes).
 *
 * This does NOT by itself stop a `user` from setting `_status: 'published'`
 * on a draft they're editing — that is enforced separately by field-level
 * access on the `_status` field (see canSetPublishedStatus below), which
 * every collection using this must also apply.
 */
export const canEditContent: Access = ({ req }) => {
  const role = req.user?.role

  if (role === 'super_admin' || role === 'admin') {
    return true
  }

  if (role === 'user') {
    return {
      _status: {
        not_equals: 'published',
      },
    }
  }

  return false
}

/**
 * Field-level access for the `_status` field, restricting who may set a
 * document to 'published'. Contributors (role: 'user') can save drafts
 * freely, but only admin/super_admin may publish.
 *
 * Attach this as both the `access.create` and `access.update` of the
 * `_status` field override on any collection with drafts enabled that
 * should follow the review flow. Attaching it to `create` as well as
 * `update` is required — otherwise a contributor could publish a document
 * directly at creation time, since `access.update` alone only governs
 * later edits.
 */
export const canSetPublishedStatus: FieldAccess = ({ req, data }) => {
  const role = req.user?.role

  if (role === 'super_admin' || role === 'admin') {
    return true
  }

  // Contributors may save/update a document as long as they are not the
  // ones setting it to 'published'.
  return data?._status !== 'published'
}

import type { CollectionConfig } from 'payload'

import { authenticatedOrPublished } from '../../access/authenticatedOrPublished'
import { canEditContent, canSetPublishedStatus } from '../../access/canEditContent'
import { hasRole } from '../../access/hasRole'
import { Archive } from '../../blocks/ArchiveBlock/config'
import { CallToAction } from '../../blocks/CallToAction/config'
import { Content } from '../../blocks/Content/config'
import { FormBlock } from '../../blocks/Form/config'
import { MediaBlock } from '../../blocks/MediaBlock/config'
import { hero } from '@/heros/config'
import { slugField } from 'payload'
import { populatePublishedAt } from '../../hooks/populatePublishedAt'
import { generatePreviewPath } from '../../utilities/generatePreviewPath'
import { revalidateDelete, revalidatePage } from './hooks/revalidatePage'

import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'

export const Pages: CollectionConfig<'pages'> = {
  slug: 'pages',
  access: {
    // Any authenticated user (contributor, admin, super_admin) may create
    // pages. New pages default to draft status regardless of who creates
    // them, per Payload's drafts config below.
    create: hasRole(['user', 'admin', 'super_admin']),
    // Only admin/super_admin may delete pages outright, including
    // published ones. Contributors cannot delete content once it exists.
    delete: hasRole(['admin', 'super_admin']),
    read: authenticatedOrPublished,
    // Contributors (role: 'user') may update pages only while those pages
    // remain unpublished. Admin/super_admin may update any page at any
    // status, which covers reviewing and publishing a contributor's draft.
    update: canEditContent,
  },
  // This config controls what's populated by default when a page is referenced
  // https://payloadcms.com/docs/queries/select#defaultpopulate-collection-config-property
  // Type safe if the collection slug generic is passed to `CollectionConfig` - `CollectionConfig<'pages'>
  defaultPopulate: {
    title: true,
    slug: true,
  },
  admin: {
    defaultColumns: ['title', 'slug', 'updatedAt'],
    livePreview: {
      url: ({ data, req }) =>
        generatePreviewPath({
          slug: data?.slug,
          collection: 'pages',
          req,
        }),
    },
    preview: (data, { req }) =>
      generatePreviewPath({
        slug: data?.slug as string,
        collection: 'pages',
        req,
      }),
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      type: 'tabs',
      tabs: [
        {
          fields: [hero],
          label: 'Hero',
        },
        {
          fields: [
            {
              name: 'layout',
              type: 'blocks',
              blocks: [CallToAction, Content, MediaBlock, Archive, FormBlock],
              required: true,
              admin: {
                initCollapsed: true,
              },
            },
          ],
          label: 'Content',
        },
        {
          name: 'meta',
          label: 'SEO',
          fields: [
            OverviewField({
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
              imagePath: 'meta.image',
            }),
            MetaTitleField({
              hasGenerateFn: true,
            }),
            MetaImageField({
              relationTo: 'media',
            }),

            MetaDescriptionField({}),
            PreviewField({
              // if the `generateUrl` function is configured
              hasGenerateFn: true,

              // field paths to match the target field for data
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
            }),
          ],
        },
      ],
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    },
    slugField(),
    // Overrides Payload's auto-injected drafts _status field. Contributors
    // (role: 'user') can save drafts, but only admin/super_admin may set
    // this to 'published' — enforced via canSetPublishedStatus on both
    // create and update (create was previously unrestricted, letting a
    // contributor publish a page directly at creation time).
    // `options` is deliberately empty, not omitted: Payload deep-merges
    // this override into its default drafts `_status` field (which already
    // defines the draft/published options) by concatenating the two
    // `options` arrays, so redeclaring the same two options here duplicated
    // them in the generated Postgres enum
    // (`CREATE TYPE ... AS ENUM('draft','published','draft','published')`),
    // which fails schema push. `options: []` concatenates to the same two
    // original options (nothing to add), which satisfies the `SelectField`
    // type (which requires the key to be present) without reintroducing
    // that duplication.
    {
      name: '_status',
      type: 'select',
      options: [],
      access: {
        create: canSetPublishedStatus,
        update: canSetPublishedStatus,
      },
    },
  ],
  hooks: {
    afterChange: [revalidatePage],
    beforeChange: [populatePublishedAt],
    afterDelete: [revalidateDelete],
  },
  versions: {
    drafts: {
      autosave: {
        interval: 100, // We set this interval for optimal live preview
      },
      schedulePublish: true,
    },
    maxPerDoc: 50,
  },
}

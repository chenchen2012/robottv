import {defineField, defineType} from 'sanity'

const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/i

export const postType = defineType({
  name: 'post',
  title: 'Post',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (rule) => rule.required().min(8).max(120),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'title', maxLength: 96},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'excerpt',
      title: 'Excerpt',
      type: 'text',
      rows: 3,
      validation: (rule) => rule.max(240),
    }),
    defineField({
      name: 'whyItMatters',
      title: 'Why It Matters',
      type: 'text',
      rows: 3,
      description: 'Short internal/editorial line explaining the operational implication of the post.',
      validation: (rule) => rule.max(180),
    }),
    defineField({
      name: 'publishedAt',
      title: 'Published At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'heroImage',
      title: 'Hero Image',
      type: 'image',
      options: {hotspot: true},
      fields: [
        defineField({
          name: 'alt',
          title: 'Alt text',
          type: 'string',
          validation: (rule) => rule.required().max(140),
        }),
      ],
    }),
    defineField({
      name: 'youtubeUrl',
      title: 'YouTube URL',
      type: 'url',
      description: 'Optional. Use a full watch URL when strong, relevant footage exists.',
      validation: (rule) =>
        rule.custom((value) => {
          if (!value) return true
          return youtubeRegex.test(value) ? true : 'Enter a valid YouTube URL'
        }),
    }),
    defineField({
      name: 'youtubeVideoId',
      title: 'YouTube Video ID (optional override)',
      type: 'string',
      description: 'Optional. Usually not needed if youtubeUrl is present.',
      validation: (rule) => rule.max(32),
    }),
    defineField({
      name: 'videoSummary',
      title: 'Video Summary',
      type: 'text',
      rows: 4,
      description:
        'Short, accurate summary of what the embedded video adds. Keep it specific to this post and avoid title-only boilerplate.',
      hidden: ({document}) => !document?.youtubeUrl,
      validation: (rule) =>
        rule.max(360).custom((value, context) => {
          const hasYoutube = Boolean(context.document?.youtubeUrl)
          if (hasYoutube && !String(value || '').trim()) {
            return 'Add a short summary for the embedded video.'
          }
          return true
        }).warning(),
    }),
    defineField({
      name: 'sourceName',
      title: 'Primary Source Name',
      type: 'string',
      description: 'Outlet or publication behind the original reporting, for example Reuters or The Robot Report.',
      validation: (rule) => rule.max(120),
    }),
    defineField({
      name: 'sourceTrustTier',
      title: 'Source Trust Tier',
      type: 'string',
      options: {
        list: [
          {title: 'Allow', value: 'allow'},
          {title: 'Caution', value: 'caution'},
          {title: 'Unknown', value: 'unknown'},
          {title: 'Block', value: 'block'},
        ],
      },
      validation: (rule) => rule.max(24),
    }),
    defineField({
      name: 'sourceUrl',
      title: 'Primary Source URL',
      type: 'url',
      description: 'Direct link to the original article or reporting behind this post.',
      validation: (rule) => rule.uri({allowRelative: false, scheme: ['http', 'https']}),
    }),
    defineField({
      name: 'sourceSiteUrl',
      title: 'Primary Source Site URL',
      type: 'url',
      description: 'Optional publisher homepage used when a direct article URL is unavailable.',
      validation: (rule) => rule.uri({allowRelative: false, scheme: ['http', 'https']}),
    }),
    defineField({
      name: 'sourceImageUrl',
      title: 'Primary Source Image URL',
      type: 'url',
      description: 'Optional original article image used as the cover when no manual hero image is set.',
      validation: (rule) => rule.uri({allowRelative: false, scheme: ['http', 'https']}),
    }),
    defineField({
      name: 'sourcePublishedAt',
      title: 'Primary Source Publish Time',
      type: 'datetime',
      description: 'Optional original publication time for the cited source.',
    }),
    defineField({
      name: 'author',
      title: 'Author',
      type: 'reference',
      to: [{type: 'author'}],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'categories',
      title: 'Categories',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'category'}]}],
      validation: (rule) => rule.min(1),
    }),
    defineField({
      name: 'homepageEligible',
      title: 'Homepage Eligible',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'internalLinkTarget',
      title: 'Internal Link Target',
      type: 'url',
      description: 'Optional approved robot.tv page for related internal linking context.',
      validation: (rule) => rule.uri({allowRelative: false, scheme: ['https']}),
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'array',
      of: [
        {type: 'block'},
        {
          type: 'image',
          options: {hotspot: true},
          fields: [
            defineField({
              name: 'alt',
              title: 'Alt text',
              type: 'string',
              validation: (rule) => rule.required().max(140),
            }),
          ],
        },
      ],
    }),
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'publishedAt',
      media: 'heroImage',
    },
    prepare(selection) {
      const {title, subtitle, media} = selection
      const stamp = subtitle ? new Date(String(subtitle)).toLocaleDateString() : 'No publish date'
      return {
        title,
        subtitle: stamp,
        media,
      }
    },
  },
  orderings: [
    {
      title: 'Published (newest)',
      name: 'publishedDesc',
      by: [{field: 'publishedAt', direction: 'desc'}],
    },
  ],
})

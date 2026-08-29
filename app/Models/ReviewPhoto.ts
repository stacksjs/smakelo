import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * A photo attached to a review.
 *
 * Separate from `BusinessPhoto` because the two differ in everything except
 * holding a URL: these belong to the reviewer rather than the business, they
 * disappear with the review, and the business cannot reorder or remove them.
 * Folding both into one table would mean a nullable owner and a type column
 * that every query has to remember to filter on.
 *
 * (The framework's `Review.images` is a single `string` column with a factory
 * that returns the literal `'test'`, so review galleries were never really
 * implemented there.)
 */
export default defineModel({
  name: 'ReviewPhoto',
  table: 'review_photos',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,

    useSearch: {
      displayable: ['id', 'url', 'position'],
      searchable: [],
      sortable: ['position', 'createdAt'],
      filterable: ['businessReviewId'],
    },

    useSeeder: { count: 0 },
    observe: true,
  },

  belongsTo: ['BusinessReview'],

  attributes: {
    url: {
      order: 1,
      required: true,
      fillable: true,
      validation: { rule: schema.string().required().max(500) },
      factory: () => '',
    },

    position: {
      order: 2,
      required: true,
      fillable: true,
      default: 0,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },

    alt: {
      order: 3,
      fillable: true,
      validation: { rule: schema.string().max(300) },
      factory: () => '',
    },
  },
} as const)

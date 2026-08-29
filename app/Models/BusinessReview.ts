import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * A review of a place.
 *
 * The framework ships a `Review` that belongs to a Product, which is the right
 * model for a shop and the wrong one here: people review the restaurant, not
 * the burrito, and most of the businesses on Smakelo have no products at all
 * because nobody has signed them up. So reviews attach to the business.
 *
 * `orderId` is what separates a review from an opinion. When it is set, the
 * reviewer demonstrably bought something, and the badge says so. It is nullable
 * because a listing that cannot take orders can still be reviewed - that is the
 * entire point of the discovery half.
 */
export default defineModel({
  name: 'BusinessReview',
  table: 'business_reviews',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,
    useSoftDeletes: true,

    useSearch: {
      displayable: ['id', 'rating', 'title', 'createdAt'],
      searchable: ['title', 'body'],
      sortable: ['rating', 'helpfulCount', 'createdAt'],
      filterable: ['rating', 'businessId', 'isPublished'],
    },

    useSeeder: { count: 0 },

    useApi: {
      uri: 'business-reviews',
      routes: ['index', 'show', 'store', 'update', 'destroy'],
      middleware: ['auth'],
    },

    observe: true,
  },

  belongsTo: ['Business', 'Customer', 'Order'],
  hasMany: ['ReviewPhoto'],

  attributes: {
    rating: {
      order: 1,
      required: true,
      fillable: true,
      validation: {
        rule: schema.number().required().min(1).max(5),
        message: { min: 'A rating runs from 1 to 5', max: 'A rating runs from 1 to 5' },
      },
      factory: faker => faker.number.int({ min: 3, max: 5 }),
    },

    title: {
      order: 2,
      fillable: true,
      validation: { rule: schema.string().max(160) },
      factory: () => '',
    },

    body: {
      order: 3,
      required: true,
      fillable: true,
      validation: { rule: schema.string().required().min(3).max(5000) },
      factory: () => '',
    },

    /** What the reviewer ate, in their words. Shown under the review. */
    dishes: {
      order: 4,
      fillable: true,
      validation: { rule: schema.string().max(300) },
      factory: () => '',
    },

    /**
     * The owner's reply.
     *
     * One per review and stored inline rather than as its own model: a business
     * gets one answer, replies are never threaded, and a table for at most one
     * row per parent buys nothing but a join.
     */
    ownerResponse: {
      order: 5,
      fillable: true,
      validation: { rule: schema.string().max(2000) },
      factory: () => '',
    },

    ownerRespondedAt: {
      order: 6,
      fillable: true,
      validation: { rule: schema.timestamp() },
      factory: () => null,
    },

    helpfulCount: {
      order: 7,
      required: true,
      fillable: true,
      default: 0,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },

    /**
     * Hidden rather than deleted when moderated.
     *
     * Soft deletes cover the author removing their own review; this covers a
     * review that has to stop being visible while still being auditable.
     */
    isPublished: {
      order: 8,
      required: true,
      fillable: true,
      default: true,
      validation: { rule: schema.boolean() },
      factory: () => true,
    },

    /** When the visit happened, which is often not when the review was written. */
    visitedAt: {
      order: 9,
      fillable: true,
      validation: { rule: schema.timestamp() },
      factory: () => null,
    },
  },

  dashboard: {
    highlight: true,
  },
} as const)

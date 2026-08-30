import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * One person's vote that a review was useful.
 *
 * The count could live as an integer on the review, and did: `helpful_count`
 * still exists as the denormalized total. But a count alone cannot answer
 * "have I already voted", so the button either lies about its state or lets
 * one person press it forever. A row per voter answers both, and the total is
 * derived from it rather than trusted.
 */
export default defineModel({
  name: 'ReviewVote',
  table: 'review_votes',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,

    useSearch: {
      displayable: ['id', 'businessReviewId', 'customerId', 'createdAt'],
      searchable: [],
      sortable: ['createdAt'],
      filterable: ['businessReviewId', 'customerId'],
    },

    useSeeder: { count: 0 },

    useApi: {
      middleware: ['auth'],
      uri: 'review-votes',
    },
  },

  belongsTo: ['BusinessReview', 'Customer'],

  attributes: {
    /**
     * Useful or not useful. Both are worth recording: a review nobody found
     * useful and a review nobody has read are different facts, and a single
     * upvote count cannot tell them apart.
     */
    helpful: {
      order: 1,
      required: true,
      fillable: true,
      default: true,
      validation: { rule: schema.boolean() },
      factory: () => true,
    },
  },
} as const)

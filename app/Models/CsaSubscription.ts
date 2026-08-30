import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * A membership in a farm's season.
 *
 * The state that matters is not "active or cancelled" but "is a box coming
 * this week": members go away in August, and a farm that treats a holiday as a
 * cancellation loses the member and packs a box nobody collects. So pausing is
 * a first-class state with a date attached, and `nextBoxAt` is what every
 * screen actually reads.
 */
export default defineModel({
  name: 'CsaSubscription',
  table: 'csa_subscriptions',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,

    useSearch: {
      displayable: ['id', 'status', 'nextBoxAt', 'createdAt'],
      searchable: [],
      sortable: ['nextBoxAt', 'createdAt'],
      filterable: ['csaPlanId', 'customerId', 'status'],
    },

    useSeeder: { count: 0 },

    useApi: {
      middleware: ['auth'],
      uri: 'csa-subscriptions',
    },
  },

  belongsTo: ['CsaPlan', 'Customer'],

  attributes: {
    status: {
      order: 1,
      required: true,
      fillable: true,
      default: 'active',
      validation: {
        rule: schema.enum(['active', 'paused', 'cancelled']),
        message: { enum: 'Status must be one of: active, paused, cancelled' },
      },
      factory: () => 'active',
    },

    /** Collected from the farm, or brought to a door. */
    fulfilment: {
      order: 2,
      required: true,
      fillable: true,
      default: 'pickup',
      validation: {
        rule: schema.enum(['pickup', 'delivery']),
        message: { enum: 'Fulfilment must be pickup or delivery' },
      },
      factory: () => 'pickup',
    },

    deliveryAddress: {
      order: 3,
      fillable: true,
      validation: { rule: schema.string().max(255) },
      factory: () => '',
    },

    /**
     * The date the next box is due, as YYYY-MM-DD.
     *
     * Stored rather than derived, because a member who pauses for three weeks
     * and a member who joined last Tuesday both need an answer and the rule
     * that produces it differs. Derivation would also have to know about the
     * weeks a farm skips, which is the farm's business and not a formula.
     */
    nextBoxAt: {
      order: 4,
      fillable: true,
      validation: { rule: schema.string().max(20) },
      factory: () => '',
    },

    /** While set, no box is packed. Cleared when the member comes back. */
    pausedUntil: {
      order: 5,
      fillable: true,
      validation: { rule: schema.string().max(20) },
      factory: () => '',
    },

    /** Boxes delivered so far, for the member's own record. */
    boxesDelivered: {
      order: 6,
      fillable: true,
      default: 0,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },

    note: {
      order: 7,
      fillable: true,
      validation: { rule: schema.string().max(500) },
      factory: () => '',
    },
  },
} as const)

import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * A share of a farm's harvest, bought ahead.
 *
 * CSA is not a subscription to a product. The grower does not know in March
 * what will be ready in July, so the plan promises a size and a cadence and
 * deliberately does not promise contents. Modelling it as a recurring order of
 * fixed line items would misdescribe the arrangement and would break the first
 * time a crop failed, which is the season a farm most needs its members.
 */
export default defineModel({
  name: 'CsaPlan',
  table: 'csa_plans',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,

    useSearch: {
      displayable: ['id', 'name', 'priceCents', 'cadence', 'isActive'],
      searchable: ['name', 'description'],
      sortable: ['priceCents', 'createdAt'],
      filterable: ['businessId', 'cadence', 'isActive'],
    },

    useSeeder: { count: 0 },

    useApi: {
      middleware: ['auth'],
      uri: 'csa-plans',
    },
  },

  belongsTo: ['Business'],
  hasMany: ['CsaSubscription'],

  attributes: {
    name: {
      order: 1,
      required: true,
      fillable: true,
      validation: { rule: schema.string().max(120) },
      factory: faker => faker.lorem.words(2),
    },

    description: {
      order: 2,
      fillable: true,
      validation: { rule: schema.string().max(1000) },
      factory: () => '',
    },

    /** Cents per delivery, not per month. Members compare per box. */
    priceCents: {
      order: 3,
      required: true,
      fillable: true,
      validation: { rule: schema.number().min(0) },
      factory: () => 3000,
    },

    cadence: {
      order: 4,
      required: true,
      fillable: true,
      default: 'weekly',
      validation: {
        rule: schema.enum(['weekly', 'biweekly', 'monthly']),
        message: { enum: 'Cadence must be one of: weekly, biweekly, monthly' },
      },
      factory: () => 'weekly',
    },

    /** Roughly who it feeds, in the farm's own words. */
    feeds: {
      order: 5,
      fillable: true,
      validation: { rule: schema.string().max(120) },
      factory: () => '',
    },

    /**
     * Day of the week the box is ready, 0 for Sunday.
     *
     * A farm picks on a schedule and packs on a schedule; a member choosing
     * their own day is choosing something the farm cannot offer.
     */
    dayOfWeek: {
      order: 6,
      required: true,
      fillable: true,
      default: 3,
      validation: { rule: schema.number().min(0).max(6) },
      factory: () => 3,
    },

    /** Whether the farm will deliver it, or it is collected. */
    offersDelivery: {
      order: 7,
      fillable: true,
      default: false,
      validation: { rule: schema.boolean() },
      factory: () => false,
    },

    isActive: {
      order: 8,
      fillable: true,
      default: true,
      validation: { rule: schema.boolean() },
      factory: () => true,
    },
  },
} as const)

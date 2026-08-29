import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * One opening interval on one weekday.
 *
 * A row per interval rather than a JSON blob per business, because "open now"
 * is a query and a blob cannot be one. Several rows per day is the normal case,
 * not an edge case: kitchens close between lunch and dinner all the time.
 *
 * Times are local to the business's market and stored as minutes after
 * midnight, which makes comparison arithmetic instead of string parsing.
 * `closesAt` may exceed 1440, and that is how a bar that shuts at 2am is
 * expressed: 26 * 60. Wrapping it to 120 would put closing before opening and
 * make the interval empty.
 */
export default defineModel({
  name: 'BusinessHour',
  table: 'business_hours',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,

    useSearch: {
      displayable: ['id', 'dayOfWeek', 'opensAt', 'closesAt'],
      searchable: [],
      sortable: ['dayOfWeek', 'opensAt'],
      filterable: ['dayOfWeek', 'businessId'],
    },

    useSeeder: { count: 0 },

    useApi: {
      uri: 'business-hours',
      routes: ['index', 'show'],
    },

    observe: true,
  },

  belongsTo: ['Business'],

  attributes: {
    /** 0 is Sunday, matching `Date.prototype.getDay()`. */
    dayOfWeek: {
      order: 1,
      required: true,
      fillable: true,
      validation: { rule: schema.number().required().min(0).max(6) },
      factory: faker => faker.number.int({ min: 0, max: 6 }),
    },

    /** Minutes after local midnight. 09:00 is 540. */
    opensAt: {
      order: 2,
      required: true,
      fillable: true,
      validation: { rule: schema.number().required().min(0).max(1440) },
      factory: () => 540,
    },

    /** Minutes after local midnight, allowed past 1440 for an after-midnight close. */
    closesAt: {
      order: 3,
      required: true,
      fillable: true,
      validation: { rule: schema.number().required().min(0).max(2880) },
      factory: () => 1260,
    },

    /**
     * Marks the day closed outright.
     *
     * Distinct from having no row: no row means nobody recorded the hours, and
     * a business with unknown hours should not be filtered out of "open now"
     * results as though it were shut.
     */
    isClosed: {
      order: 4,
      required: true,
      fillable: true,
      default: false,
      validation: { rule: schema.boolean() },
      factory: () => false,
    },
  },
} as const)

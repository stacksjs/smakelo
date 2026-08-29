import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * A city Smakelo operates in.
 *
 * Everything money- and language-shaped hangs off the market rather than off a
 * global setting, because the differences between them are not cosmetic: a
 * price in Los Angeles has tax added at the till, the same price in Berlin
 * already includes it, and showing a German customer a total that grows at
 * checkout is both surprising and, for a real business, illegal.
 *
 * Los Angeles is the only market with data. Germany and the Netherlands exist
 * in the schema so that opening one is a matter of adding rows and translating
 * copy, rather than discovering that currency and tax were hard-coded.
 */
export default defineModel({
  name: 'Market',
  table: 'markets',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,

    useSearch: {
      displayable: ['id', 'name', 'city', 'countryCode', 'currency', 'isActive'],
      searchable: ['name', 'city'],
      sortable: ['name', 'createdAt'],
      filterable: ['countryCode', 'isActive'],
    },

    useSeeder: { count: 0 },

    useApi: {
      uri: 'markets',
      routes: ['index', 'show'],
    },

    observe: true,
  },

  hasMany: ['Business'],

  attributes: {
    name: {
      order: 1,
      required: true,
      fillable: true,
      validation: { rule: schema.string().required().max(100) },
      factory: faker => faker.location.city(),
    },

    slug: {
      order: 2,
      required: true,
      unique: true,
      fillable: true,
      validation: { rule: schema.string().required().max(100) },
      factory: faker => faker.helpers.slugify(faker.location.city()).toLowerCase(),
    },

    city: {
      order: 3,
      required: true,
      fillable: true,
      validation: { rule: schema.string().required().max(100) },
      factory: faker => faker.location.city(),
    },

    /** ISO 3166-1 alpha-2. */
    countryCode: {
      order: 4,
      required: true,
      fillable: true,
      default: 'US',
      validation: { rule: schema.string().required().min(2).max(2) },
      factory: () => 'US',
    },

    /** ISO 4217, lowercased to match what Stripe expects. */
    currency: {
      order: 5,
      required: true,
      fillable: true,
      default: 'usd',
      validation: { rule: schema.string().required().min(3).max(3) },
      factory: () => 'usd',
    },

    /**
     * Whether menu prices already contain tax.
     *
     * `inclusive` in the EU, `exclusive` in the US. This decides both how a
     * price is displayed and how the order total is computed, so it cannot be a
     * presentation-layer choice.
     */
    taxMode: {
      order: 6,
      required: true,
      fillable: true,
      default: 'exclusive',
      validation: {
        rule: schema.enum(['inclusive', 'exclusive']),
        message: { enum: 'Tax mode must be inclusive or exclusive' },
      },
      factory: () => 'exclusive',
    },

    /** Applied when a business declares no rate of its own. Percent. */
    defaultTaxRate: {
      order: 7,
      required: true,
      fillable: true,
      default: 0,
      validation: { rule: schema.float().min(0).max(100) },
      factory: () => 9.5,
    },

    /** IANA zone. Opening hours and scheduled orders are meaningless without it. */
    timezone: {
      order: 8,
      required: true,
      fillable: true,
      default: 'America/Los_Angeles',
      validation: { rule: schema.string().required().max(64) },
      factory: () => 'America/Los_Angeles',
    },

    /** Which translation a visitor gets before they choose one. */
    locale: {
      order: 9,
      required: true,
      fillable: true,
      default: 'en',
      validation: {
        rule: schema.enum(['en', 'de', 'nl']),
        message: { enum: 'Locale must be one of: en, de, nl' },
      },
      factory: () => 'en',
    },

    /** Centre of the map when someone arrives without a location. */
    centerLatitude: {
      order: 10,
      required: true,
      fillable: true,
      validation: { rule: schema.float().min(-90).max(90) },
      factory: () => 34.0195,
    },

    centerLongitude: {
      order: 11,
      required: true,
      fillable: true,
      validation: { rule: schema.float().min(-180).max(180) },
      factory: () => -118.4912,
    },

    /**
     * Whether the market is open for business.
     *
     * Germany and the Netherlands ship inactive: their rows exist so the
     * currency and tax paths are exercised, not because anyone can order there.
     */
    isActive: {
      order: 12,
      required: true,
      fillable: true,
      default: false,
      validation: { rule: schema.boolean() },
      factory: () => false,
    },
  },

  dashboard: {
    highlight: true,
  },
} as const)

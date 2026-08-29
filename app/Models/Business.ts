import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * A place: a restaurant, a coffee shop, a farm.
 *
 * The whole app hangs off this one model, and it deliberately serves two very
 * different kinds of row.
 *
 * A **listing** is a real business copied from open data. It has an address,
 * hours and reviews, and that is all. Nobody at that business has agreed to
 * anything, so it cannot take an order - `isPartner` is false and the ordering
 * surface simply is not offered. This is the Yelp half.
 *
 * A **partner** has signed up. It owns a menu, takes orders, has couriers
 * dispatched to it and gets paid out. This is the DoorDash and Toast half.
 *
 * Keeping both in one table is the point of the product rather than a shortcut:
 * a customer searches once and gets everything nearby, and the partners are the
 * ones with an Order button. Splitting them would mean two search paths, two
 * review models and two ways to spell an address.
 *
 * What a partner can actually do is a set of capability flags rather than a
 * type, because they do not correlate. A farm delivers but has no tables; a
 * coffee shop has tables but no delivery; a restaurant usually has both.
 */
export default defineModel({
  name: 'Business',
  table: 'businesses',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,
    useSoftDeletes: true,

    useSearch: {
      displayable: ['id', 'name', 'type', 'city', 'priceTier', 'ratingAverage', 'isPartner'],
      searchable: ['name', 'description', 'cuisine', 'address', 'city'],
      sortable: ['name', 'ratingAverage', 'ratingCount', 'createdAt'],
      // Geography is deliberately absent: the search engine has no radius
      // filter, so "near me" is answered in SQL with a bounding box and a
      // haversine, and the index is left to do text relevance.
      filterable: ['type', 'priceTier', 'isPartner', 'isClaimed', 'marketId'],
    },

    useSeeder: { count: 0 },

    useApi: {
      uri: 'businesses',
      routes: ['index', 'show'],
    },

    taggable: true,
    observe: true,
  },

  belongsTo: ['Market', 'Team'],
  hasMany: ['BusinessHour', 'BusinessPhoto', 'BusinessReview', 'Product', 'Table'],

  attributes: {
    name: {
      order: 1,
      required: true,
      fillable: true,
      validation: { rule: schema.string().required().max(160) },
      factory: faker => faker.company.name(),
    },

    slug: {
      order: 2,
      required: true,
      unique: true,
      fillable: true,
      validation: { rule: schema.string().required().max(180) },
      factory: faker => faker.helpers.slugify(faker.company.name()).toLowerCase(),
    },

    type: {
      order: 3,
      required: true,
      fillable: true,
      default: 'restaurant',
      validation: {
        rule: schema.enum(['restaurant', 'cafe', 'farm', 'bakery', 'bar', 'grocery']),
        message: { enum: 'Type must be one of: restaurant, cafe, farm, bakery, bar, grocery' },
      },
      factory: faker => faker.helpers.arrayElement(['restaurant', 'cafe', 'farm']),
    },

    description: {
      order: 4,
      fillable: true,
      validation: { rule: schema.string().max(2000) },
      factory: () => '',
    },

    /** Free text, comma separated, e.g. "Oaxacan, Breakfast". Also carried as tags. */
    cuisine: {
      order: 5,
      fillable: true,
      validation: { rule: schema.string().max(200) },
      factory: () => '',
    },

    /** 1 to 4, the familiar $ to $$$$. */
    priceTier: {
      order: 6,
      fillable: true,
      default: 2,
      validation: { rule: schema.number().min(1).max(4) },
      factory: faker => faker.number.int({ min: 1, max: 4 }),
    },

    address: {
      order: 7,
      required: true,
      fillable: true,
      validation: { rule: schema.string().required().max(255) },
      factory: faker => faker.location.streetAddress(),
    },

    city: {
      order: 8,
      required: true,
      fillable: true,
      validation: { rule: schema.string().required().max(100) },
      factory: () => 'Los Angeles',
    },

    postalCode: {
      order: 9,
      fillable: true,
      validation: { rule: schema.string().max(20) },
      factory: faker => faker.location.zipCode(),
    },

    /**
     * Where it is. Required, and the reason is the map: a business with no
     * coordinates cannot be drawn, cannot be sorted by distance, and cannot be
     * matched to a courier. Geocoded at import rather than at read time.
     */
    latitude: {
      order: 10,
      required: true,
      fillable: true,
      validation: { rule: schema.float().required().min(-90).max(90) },
      factory: () => 34.0195,
    },

    longitude: {
      order: 11,
      required: true,
      fillable: true,
      validation: { rule: schema.float().required().min(-180).max(180) },
      factory: () => -118.4912,
    },

    phone: {
      order: 12,
      fillable: true,
      validation: { rule: schema.string().max(40) },
      factory: faker => faker.phone.number(),
    },

    website: {
      order: 13,
      fillable: true,
      validation: { rule: schema.string().max(255) },
      factory: () => '',
    },

    heroImage: {
      order: 14,
      fillable: true,
      validation: { rule: schema.string().max(500) },
      factory: () => '',
    },

    /**
     * Whether this business has signed up and can take orders.
     *
     * False for every imported listing, and that is the honest state: the
     * business has not agreed to sell through Smakelo, so the app must not
     * offer to sell on its behalf.
     */
    isPartner: {
      order: 15,
      required: true,
      fillable: true,
      default: false,
      validation: { rule: schema.boolean() },
      factory: () => false,
    },

    /** Somebody proved they run this business and now controls the listing. */
    isClaimed: {
      order: 16,
      required: true,
      fillable: true,
      default: false,
      validation: { rule: schema.boolean() },
      factory: () => false,
    },

    // Capabilities. What a partner offers, not what it is.

    /** Couriers bring orders to the customer. */
    offersDelivery: {
      order: 17,
      required: true,
      fillable: true,
      default: false,
      validation: { rule: schema.boolean() },
      factory: () => false,
    },

    /** The customer collects the order themselves. */
    offersPickup: {
      order: 18,
      required: true,
      fillable: true,
      default: false,
      validation: { rule: schema.boolean() },
      factory: () => false,
    },

    /** Tables with QR codes, tabs and split checks. */
    offersDineIn: {
      order: 19,
      required: true,
      fillable: true,
      default: false,
      validation: { rule: schema.boolean() },
      factory: () => false,
    },

    /**
     * Sells goods rather than prepared dishes.
     *
     * A farm box has no prep time and no kitchen ticket; it is picked, not
     * cooked. The catalog is the same, the presentation is not.
     */
    offersShop: {
      order: 20,
      required: true,
      fillable: true,
      default: false,
      validation: { rule: schema.boolean() },
      factory: () => false,
    },

    /** Its own couriers rather than the platform's. Fits farms and small cafés. */
    selfDelivery: {
      order: 21,
      required: true,
      fillable: true,
      default: false,
      validation: { rule: schema.boolean() },
      factory: () => false,
    },

    /** Furthest a courier will carry an order from here, in metres. */
    deliveryRadiusMeters: {
      order: 22,
      required: true,
      fillable: true,
      default: 8000,
      validation: { rule: schema.number().min(0).max(100_000) },
      factory: () => 8000,
    },

    /** Minor units. A floor beneath which delivery is not worth dispatching. */
    minimumOrderCents: {
      order: 23,
      required: true,
      fillable: true,
      default: 0,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },

    /** Typical minutes from order to ready. Seeds the customer's first estimate. */
    prepTimeMinutes: {
      order: 24,
      required: true,
      fillable: true,
      default: 20,
      validation: { rule: schema.number().min(0).max(600) },
      factory: faker => faker.number.int({ min: 10, max: 40 }),
    },

    /**
     * Denormalised review aggregates.
     *
     * A list of thirty businesses would otherwise mean thirty aggregate queries
     * per page, and the map wants them for every pin in view. Recomputed when a
     * review is written, not on read.
     */
    ratingAverage: {
      order: 25,
      required: true,
      fillable: true,
      default: 0,
      validation: { rule: schema.number().min(0).max(5) },
      factory: () => 0,
    },

    ratingCount: {
      order: 26,
      required: true,
      fillable: true,
      default: 0,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },

    /**
     * Where this listing came from, for the attribution page: `fsq`, `osm`,
     * `curated`, or `partner` when the business supplied it themselves.
     */
    source: {
      order: 27,
      required: true,
      fillable: true,
      default: 'curated',
      validation: {
        rule: schema.enum(['fsq', 'osm', 'curated', 'partner']),
        message: { enum: 'Source must be one of: fsq, osm, curated, partner' },
      },
      factory: () => 'curated',
    },

    /** The id this row had in its source dataset, so a re-import can match it. */
    sourceId: {
      order: 28,
      fillable: true,
      validation: { rule: schema.string().max(120) },
      factory: () => '',
    },
  },

  dashboard: {
    highlight: true,
  },
} as const)

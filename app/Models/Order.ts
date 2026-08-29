import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * An order, scoped to the business it was placed with.
 *
 * Overrides the framework's Order, which belongs to a Customer and a Coupon.
 * That is right for one shop and wrong for a marketplace: without a business,
 * nothing says whose kitchen is cooking it, whose menu priced it, or who gets
 * paid.
 *
 * The additions are the business, the money that is not the merchant's
 * (`serviceFeeCents` beside the existing delivery fee and tip), the subtotal
 * the fees were computed from, a scheduled time distinct from the predicted
 * one, and the table or tab for an order placed in the room.
 */
export default defineModel({
  name: 'Order',
  table: 'orders',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,
    useSearch: {
      displayable: ['id', 'businessId', 'customerId', 'status', 'totalAmount', 'orderType', 'createdAt'],
      searchable: ['id', 'customerId', 'status', 'orderType'],
      sortable: ['createdAt', 'updatedAt', 'totalAmount', 'estimatedDeliveryTime'],
      filterable: ['status', 'orderType', 'customerId', 'businessId'],
    },

    useSeeder: {
      count: 20,
    },

    useApi: {
      uri: 'orders',
      middleware: ['auth'],
    },

    observe: true,
  },

  hasMany: ['OrderItem', 'Payment', 'LicenseKey', 'DeliveryStop'],
  belongsTo: ['Business', 'Customer', 'Coupon', 'Table', 'Tab'],

  attributes: {
    status: {
      order: 2,
      fillable: true,
      validation: {
        rule: schema.string().required(),
      },
      /*
       * The canonical vocabulary is `OrderStatus` in
       * `commerce/src/orders/events.ts`, which is what `canTransition` and
       * `emitForStatus` are keyed on. The factory used to generate
       * PREPARING / READY / CANCELED, none of which are in that union, so
       * seeded orders could not legally transition anywhere.
       *
       * The column stays a free string rather than an enum: existing
       * databases hold the old spellings, and adding a CHECK constraint here
       * would fail their next migration rather than fix their data.
       */
      factory: faker => faker.helpers.arrayElement(['PENDING', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED']),
    },

    totalAmount: {
      order: 3,
      fillable: true,
      validation: {
        rule: schema.number().required().min(0),
      },
      factory: faker => faker.number.int({ min: 100, max: 2000 }),
    },

    currency: {
      order: 4,
      fillable: true,
      default: 'USD',
      validation: {
        rule: schema.string().required().max(3),
      },
      factory: faker => faker.helpers.arrayElement(['USD', 'EUR', 'GBP', 'CAD', 'AUD']),
    },

    taxAmount: {
      default: 0,
      order: 5,
      fillable: true,
      validation: {
        rule: schema.number().min(0),
      },
      factory: faker => faker.number.int({ min: 10, max: 200 }),
    },

    discountAmount: {
      default: 0,
      order: 6,
      fillable: true,
      validation: {
        rule: schema.number().min(0),
      },
      factory: faker => faker.number.int({ min: 0, max: 150 }),
    },

    deliveryFee: {
      default: 0,
      order: 7,
      fillable: true,
      validation: {
        rule: schema.number().min(0),
      },
      factory: faker => faker.number.int({ min: 0, max: 100 }),
    },

    tipAmount: {
      default: 0,
      order: 8,
      fillable: true,
      validation: {
        rule: schema.number().min(0),
      },
      factory: faker => faker.number.int({ min: 0, max: 200 }),
    },

    orderType: {
      order: 9,
      fillable: true,
      validation: {
        rule: schema.string().required(),
      },
      factory: faker => faker.helpers.arrayElement(['DINE_IN', 'TAKEOUT', 'DELIVERY']),
    },

    deliveryAddress: {
      order: 10,
      fillable: true,
      validation: {
        rule: schema.string(),
      },
      factory: faker => faker.location.streetAddress(),
    },

    specialInstructions: {
      order: 11,
      fillable: true,
      validation: {
        rule: schema.string(),
      },
      factory: faker => faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.3 }),
    },

    estimatedDeliveryTime: {
      order: 12,
      fillable: true,
      validation: {
        rule: schema.string(),
      },
      factory: (faker) => {
        const now = new Date()
        const futureDate = new Date(now.getTime() + faker.number.int({ min: 15, max: 120 }) * 60000)
        return futureDate.toISOString()
      },
    },

    /**
     * Unguessable handle for the customer-facing tracking page.
     *
     * A tracking URL is opened from an SMS, on a phone, by someone who is not
     * signed in, so it authorises on possession of this token. Sequential
     * order ids would let anyone walk the table.
     */
    trackingToken: {
      order: 13,
      unique: true,
      fillable: true,
      validation: { rule: schema.string().max(64) },
      factory: faker => faker.string.alphanumeric({ length: 32 }),
    },

    /** Geocoded delivery destination, so the map has somewhere to point. */
    deliveryLatitude: {
      order: 14,
      fillable: true,
      validation: { rule: schema.number().min(-90).max(90) },
      factory: faker => faker.location.latitude(),
    },

    deliveryLongitude: {
      order: 15,
      fillable: true,
      validation: { rule: schema.number().min(-180).max(180) },
      factory: faker => faker.location.longitude(),
    },

    appliedCouponId: {
      order: 16,
      fillable: true,
      validation: {
        rule: schema.string(),
      },
      factory: faker => faker.helpers.maybe(() => faker.string.uuid(), { probability: 0.2 }),
    },

    /**
     * The platform's cut, in cents.
     *
     * Kept beside the delivery fee and the tip rather than folded into the
     * total, because these three go to three different parties: the platform
     * keeps this, the courier gets the delivery fee and all of the tip, and the
     * merchant gets what is left. A single total cannot be split back out
     * afterwards, and the ledger has to agree with what the customer was shown.
     */
    serviceFeeCents: {
      order: 20,
      required: true,
      fillable: true,
      default: 0,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },

    /** Sum of the line items before any fee, tax or tip. Cents. */
    subtotalCents: {
      order: 21,
      required: true,
      fillable: true,
      default: 0,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },

    /**
     * When the customer asked for it, or null for as soon as possible.
     *
     * Distinct from `estimatedDeliveryTime`, which is what the system predicts.
     * One is a promise the customer made to themselves; the other is a guess
     * the system keeps revising.
     */
    scheduledFor: {
      order: 22,
      fillable: true,
      validation: { rule: schema.timestamp() },
      factory: () => null,
    },
  },

  dashboard: {
    highlight: true,
  },
} as const)

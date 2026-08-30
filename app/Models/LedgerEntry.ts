import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * One movement of money, from the platform's point of view.
 *
 * A marketplace order is not one payment, it is a split: the customer pays
 * once, and that single charge owes a share to the merchant, a delivery fee and
 * the whole tip to the courier, and a service fee to the platform. Storing only
 * the order total makes those unrecoverable, and "what do we owe this courier"
 * becomes a query nobody can answer twice the same way.
 *
 * So every share is a row, signed from the perspective of the party named. A
 * refund is a second row with the opposite sign rather than an edit to the
 * first, because the history of what was owed and then clawed back is the part
 * an operator actually needs to read.
 */
export default defineModel({
  name: 'LedgerEntry',
  table: 'ledger_entries',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,

    useSearch: {
      displayable: ['id', 'partyType', 'partyId', 'kind', 'amountCents', 'createdAt'],
      searchable: ['description'],
      sortable: ['createdAt', 'amountCents'],
      filterable: ['partyType', 'partyId', 'kind', 'orderId'],
    },

    useSeeder: { count: 0 },

    useApi: {
      // Money. Staff only, both ways.
      middleware: ['auth'],
      uri: 'ledger-entries',
    },

    observe: true,
  },

  belongsTo: ['Order'],

  attributes: {
    /** Who this row is about. */
    partyType: {
      order: 1,
      required: true,
      fillable: true,
      validation: {
        // `tax` is a party in the accounting sense: the money is collected from
        // the customer, held by the platform, and owed to the state. Folding it
        // into `platform` would make the platform's own balance a mix of what it
        // earned and what it merely holds.
        rule: schema.enum(['business', 'courier', 'platform', 'tax']),
        message: { enum: 'Party must be one of: business, courier, platform, tax' },
      },
      factory: () => 'business',
    },

    /** Their id within that type. Not a foreign key: three tables, one column. */
    partyId: {
      order: 2,
      required: true,
      fillable: true,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },

    kind: {
      order: 3,
      required: true,
      fillable: true,
      validation: {
        rule: schema.enum(['order_revenue', 'service_fee', 'delivery_fee', 'tip', 'tax_collected', 'tax_withheld', 'refund', 'payout', 'adjustment']),
        message: { enum: 'Kind must be one of: order_revenue, service_fee, delivery_fee, tip, tax_collected, tax_withheld, refund, payout, adjustment' },
      },
      factory: () => 'order_revenue',
    },

    /**
     * Cents, signed. Positive is owed to the party, negative is taken from
     * them, so a balance is a sum and never a case statement.
     */
    amountCents: {
      order: 4,
      required: true,
      fillable: true,
      default: 0,
      validation: { rule: schema.number() },
      factory: () => 0,
    },

    currency: {
      order: 5,
      required: true,
      fillable: true,
      default: 'usd',
      validation: { rule: schema.string().required().min(3).max(3) },
      factory: () => 'usd',
    },

    /** Human-readable, for the statement a merchant or courier reads. */
    description: {
      order: 6,
      fillable: true,
      validation: { rule: schema.string().max(300) },
      factory: () => '',
    },

    /** The Stripe object this corresponds to, when there is one. */
    externalReference: {
      order: 7,
      fillable: true,
      validation: { rule: schema.string().max(120) },
      factory: () => '',
    },
  },

  dashboard: {
    highlight: true,
  },
} as const)

import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * An open tab on a table.
 *
 * A meal is not one order. People scan the code, order a round, order another
 * twenty minutes later, and then ask for the bill; the tab is what holds those
 * rounds together so the kitchen sees each one as it arrives while the total
 * accumulates in one place.
 *
 * Several people order onto the same tab from their own phones, which is the
 * whole point of a code on the table, so a tab belongs to a table rather than
 * to a customer. `splitMode` decides what happens at the end: everyone pays a
 * share, or everyone pays for what they ordered.
 */
export default defineModel({
  name: 'Tab',
  table: 'tabs',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,

    useSearch: {
      displayable: ['id', 'status', 'partySize', 'openedAt', 'closedAt'],
      searchable: [],
      sortable: ['openedAt', 'createdAt'],
      filterable: ['status', 'businessId', 'tableId'],
    },

    useSeeder: { count: 0 },

    useApi: {
      middleware: ['auth'],
      uri: 'tabs',
    },

    observe: true,
  },

  belongsTo: ['Business', 'Table'],
  hasMany: ['Order'],

  attributes: {
    status: {
      order: 1,
      required: true,
      fillable: true,
      default: 'open',
      validation: {
        rule: schema.enum(['open', 'awaiting_payment', 'closed', 'abandoned']),
        message: { enum: 'Status must be one of: open, awaiting_payment, closed, abandoned' },
      },
      factory: () => 'open',
    },

    /**
     * How the bill is divided when the tab closes.
     *
     * `by_item` is the honest default for a code on a table, where each phone
     * ordered its own food and the app already knows which. `even` is the
     * social default, chosen at the end rather than assumed at the start.
     */
    splitMode: {
      order: 2,
      required: true,
      fillable: true,
      default: 'by_item',
      validation: {
        rule: schema.enum(['by_item', 'even', 'single_payer']),
        message: { enum: 'Split mode must be one of: by_item, even, single_payer' },
      },
      factory: () => 'by_item',
    },

    partySize: {
      order: 3,
      required: true,
      fillable: true,
      default: 2,
      validation: { rule: schema.number().min(1).max(40) },
      factory: faker => faker.number.int({ min: 2, max: 6 }),
    },

    openedAt: {
      order: 4,
      fillable: true,
      validation: { rule: schema.timestamp() },
      factory: () => new Date().toISOString(),
    },

    closedAt: {
      order: 5,
      fillable: true,
      validation: { rule: schema.timestamp() },
      factory: () => null,
    },

    /** Cents, across every round. Recomputed as rounds are added. */
    totalCents: {
      order: 6,
      required: true,
      fillable: true,
      default: 0,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },

    /** Cents already settled, so a partly-paid tab knows what is outstanding. */
    paidCents: {
      order: 7,
      required: true,
      fillable: true,
      default: 0,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },
  },

  dashboard: {
    highlight: true,
  },
} as const)

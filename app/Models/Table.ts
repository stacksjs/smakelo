import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * A table in the room, and the code stuck to it.
 *
 * `qrToken` is what the printed code actually encodes, and it is a random
 * string rather than the table id for one reason: the id is guessable, and a
 * guessable code lets anyone open a tab on table 7 from the pavement. Rotating
 * the token reprints the code and invalidates every copy of the old one, which
 * is the only remedy when a code walks off on a photograph.
 */
export default defineModel({
  name: 'Table',
  table: 'tables',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,

    useSearch: {
      displayable: ['id', 'label', 'seats', 'isActive'],
      searchable: ['label'],
      sortable: ['label', 'createdAt'],
      filterable: ['businessId', 'isActive'],
    },

    useSeeder: { count: 0 },

    useApi: {
      // Staff only. The customer reaches a table by scanning its code, which
      // resolves the token rather than listing tables.
      middleware: ['auth'],
      uri: 'tables',
    },

    observe: true,
  },

  belongsTo: ['Business'],
  hasMany: ['Tab'],

  attributes: {
    /** What the staff call it: "12", "Patio 3", "Bar". */
    label: {
      order: 1,
      required: true,
      fillable: true,
      validation: { rule: schema.string().required().max(40) },
      factory: faker => String(faker.number.int({ min: 1, max: 40 })),
    },

    /**
     * The secret in the QR code. Long enough not to be guessed, short enough to
     * survive being printed on a table tent.
     */
    qrToken: {
      order: 2,
      required: true,
      unique: true,
      fillable: true,
      validation: { rule: schema.string().required().min(16).max(64) },
      factory: () => crypto.randomUUID().replace(/-/g, ''),
    },

    seats: {
      order: 3,
      required: true,
      fillable: true,
      default: 2,
      validation: { rule: schema.number().min(1).max(40) },
      factory: faker => faker.number.int({ min: 2, max: 8 }),
    },

    /** Cleared when a table is out of service, without losing its history. */
    isActive: {
      order: 4,
      required: true,
      fillable: true,
      default: true,
      validation: { rule: schema.boolean() },
      factory: () => true,
    },
  },
} as const)

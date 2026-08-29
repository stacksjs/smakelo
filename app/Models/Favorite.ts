import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * A place somebody saved.
 *
 * Its own table rather than a `likeable` trait pivot, because a favourite here
 * is a first-class thing a customer manages: it appears in their account, it is
 * sorted by when they saved it, and it is the list they open when deciding
 * where to eat. The trait would model the association and none of that.
 */
export default defineModel({
  name: 'Favorite',
  table: 'favorites',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,

    useSearch: {
      displayable: ['id', 'businessId', 'customerId', 'createdAt'],
      searchable: [],
      sortable: ['createdAt'],
      filterable: ['businessId', 'customerId'],
    },

    useSeeder: { count: 0 },

    useApi: {
      middleware: ['auth'],
      uri: 'favorites',
    },

    observe: true,
  },

  belongsTo: ['Business', 'Customer'],

  attributes: {
    /** A private line the customer wrote to themselves: "go back for the mole". */
    note: {
      order: 1,
      fillable: true,
      validation: { rule: schema.string().max(300) },
      factory: () => '',
    },
  },
} as const)

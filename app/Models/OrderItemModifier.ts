import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * A modifier as it was chosen on a specific order line.
 *
 * Without this the framework's `OrderItem` records a quantity, a price and a
 * free-text `special_instructions`, so an order for a burrito with carnitas and
 * guacamole is indistinguishable from a plain one at twice the price. The
 * kitchen cannot make it, and nobody can reconstruct the total.
 *
 * Name and price are copied rather than joined. The menu changes - guacamole
 * goes up, an option is renamed, the group is deleted - and none of that may
 * retroactively rewrite what somebody was charged. The foreign key is kept for
 * analysis; the copy is what the receipt shows.
 */
export default defineModel({
  name: 'OrderItemModifier',
  table: 'order_item_modifiers',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,

    useSearch: {
      displayable: ['id', 'name', 'priceDeltaCents', 'quantity'],
      searchable: ['name'],
      sortable: ['id'],
      filterable: ['orderItemId'],
    },

    useSeeder: { count: 0 },
    observe: true,
  },

  belongsTo: ['OrderItem', 'Modifier'],

  attributes: {
    /** The group's name at the time of ordering, e.g. "Protein". */
    groupName: {
      order: 1,
      required: true,
      fillable: true,
      validation: { rule: schema.string().required().max(120) },
      factory: () => '',
    },

    /** The option's name at the time of ordering, e.g. "Carnitas". */
    name: {
      order: 2,
      required: true,
      fillable: true,
      validation: { rule: schema.string().required().max(120) },
      factory: () => '',
    },

    /** What it added to the line then, whatever the menu says now. */
    priceDeltaCents: {
      order: 3,
      required: true,
      fillable: true,
      default: 0,
      validation: { rule: schema.number() },
      factory: () => 0,
    },

    /** How many, for groups that allow repeats. */
    quantity: {
      order: 4,
      required: true,
      fillable: true,
      default: 1,
      validation: { rule: schema.number().min(1).max(50) },
      factory: () => 1,
    },
  },
} as const)

import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * A question the menu asks about an item: "choose a protein", "add toppings".
 *
 * The framework's `ProductVariant` carries an `options` JSON blob, which can
 * describe a fixed choice like a size but cannot express the two things a real
 * menu depends on: how many options may be chosen, and what each one costs. A
 * blob also cannot be joined, so an order line loses any record of why it cost
 * what it did.
 *
 * `minSelections` and `maxSelections` are the whole grammar. 1/1 is a required
 * pick, 0/1 is optional, 0/3 is "up to three", and 2/2 is "choose exactly two".
 */
export default defineModel({
  name: 'ModifierGroup',
  table: 'modifier_groups',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,

    useSearch: {
      displayable: ['id', 'name', 'minSelections', 'maxSelections', 'position'],
      searchable: ['name'],
      sortable: ['position'],
      filterable: ['productId'],
    },

    useSeeder: { count: 0 },

    useApi: {
      uri: 'modifier-groups',
      routes: ['index', 'show'],
    },

    observe: true,
  },

  belongsTo: ['Product'],
  hasMany: ['Modifier'],

  attributes: {
    name: {
      order: 1,
      required: true,
      fillable: true,
      validation: { rule: schema.string().required().max(120) },
      factory: () => 'Choose one',
    },

    /** Shown under the name, for rules the name cannot carry. */
    description: {
      order: 2,
      fillable: true,
      validation: { rule: schema.string().max(300) },
      factory: () => '',
    },

    /**
     * Fewest options that must be chosen. 0 makes the group optional; 1 or more
     * makes it required and blocks add-to-cart until it is satisfied.
     */
    minSelections: {
      order: 3,
      required: true,
      fillable: true,
      default: 0,
      validation: { rule: schema.number().min(0).max(50) },
      factory: () => 0,
    },

    /** Most that may be chosen. Must be at least `minSelections` to be satisfiable. */
    maxSelections: {
      order: 4,
      required: true,
      fillable: true,
      default: 1,
      validation: { rule: schema.number().min(1).max(50) },
      factory: () => 1,
    },

    /** Whether the same option can be taken more than once (a double shot). */
    allowsQuantity: {
      order: 5,
      required: true,
      fillable: true,
      default: false,
      validation: { rule: schema.boolean() },
      factory: () => false,
    },

    position: {
      order: 6,
      required: true,
      fillable: true,
      default: 0,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },
  },
} as const)

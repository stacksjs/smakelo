import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * One answer to a modifier group: "carnitas", "extra cheese", "oat milk".
 *
 * `priceDeltaCents` is a delta rather than a price because that is what a menu
 * actually says - guacamole is +$2.00 on top of whatever the burrito costs. It
 * is signed, so a smaller size can subtract.
 */
export default defineModel({
  name: 'Modifier',
  table: 'modifiers',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,

    useSearch: {
      displayable: ['id', 'name', 'priceDeltaCents', 'isAvailable', 'position'],
      searchable: ['name'],
      sortable: ['position', 'priceDeltaCents'],
      filterable: ['modifierGroupId', 'isAvailable'],
    },

    useSeeder: { count: 0 },

    useApi: {
      uri: 'modifiers',
      routes: ['index', 'show'],
    },

    observe: true,
  },

  belongsTo: ['ModifierGroup'],

  attributes: {
    name: {
      order: 1,
      required: true,
      fillable: true,
      validation: { rule: schema.string().required().max(120) },
      factory: () => '',
    },

    /**
     * What choosing this adds to the line, in minor units. Signed: a half
     * portion can be negative. Zero is the common case and the default.
     */
    priceDeltaCents: {
      order: 2,
      required: true,
      fillable: true,
      default: 0,
      validation: { rule: schema.number() },
      factory: () => 0,
    },

    /** Preselected when the item is opened. */
    isDefault: {
      order: 3,
      required: true,
      fillable: true,
      default: false,
      validation: { rule: schema.boolean() },
      factory: () => false,
    },

    /** Cleared when the kitchen runs out, without deleting the option. */
    isAvailable: {
      order: 4,
      required: true,
      fillable: true,
      default: true,
      validation: { rule: schema.boolean() },
      factory: () => true,
    },

    position: {
      order: 5,
      required: true,
      fillable: true,
      default: 0,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },
  },
} as const)

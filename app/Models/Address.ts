import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * Somewhere to deliver to.
 *
 * Kept because typing an address into a phone is the worst part of ordering
 * food, and because the delivery fee depends on where the box is going: an
 * order with no address is priced at a flat rate that is wrong for everybody.
 *
 * The label is what the customer calls it, not what the postal service does.
 * People order to "home", "the office" and "mum's", and asking them to
 * recognise their own address by its street line is asking them to read.
 */
export default defineModel({
  name: 'Address',
  table: 'addresses',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,

    useSearch: {
      displayable: ['id', 'label', 'line', 'city', 'createdAt'],
      searchable: ['label', 'line', 'city'],
      sortable: ['createdAt'],
      filterable: ['customerId'],
    },

    useSeeder: { count: 0 },

    useApi: {
      // Somebody's home address. Staff only, both ways.
      middleware: ['auth'],
      uri: 'addresses',
    },
  },

  belongsTo: ['Customer'],

  attributes: {
    label: {
      order: 1,
      fillable: true,
      default: 'Home',
      validation: { rule: schema.string().max(40) },
      factory: () => 'Home',
    },

    line: {
      order: 2,
      required: true,
      fillable: true,
      validation: { rule: schema.string().max(255) },
      factory: faker => faker.location.streetAddress(),
    },

    city: {
      order: 3,
      fillable: true,
      validation: { rule: schema.string().max(120) },
      factory: () => 'Los Angeles',
    },

    postalCode: {
      order: 4,
      fillable: true,
      validation: { rule: schema.string().max(20) },
      factory: () => '90401',
    },

    /**
     * Coordinates, so the delivery fee means something.
     *
     * Geocoded when the address is saved rather than at checkout: a customer
     * waiting on a lookup before they can see a total is a customer watching a
     * spinner at the worst moment.
     */
    latitude: {
      order: 5,
      fillable: true,
      // `schema.float()`, not `number()`: the latter generates an INTEGER
      // column, and a latitude rounded to a whole degree is sixty miles out.
      validation: { rule: schema.float().min(-90).max(90) },
      factory: () => 34.0195,
    },

    longitude: {
      order: 6,
      fillable: true,
      validation: { rule: schema.float().min(-180).max(180) },
      factory: () => -118.4912,
    },

    /** Which door, which buzzer, which dog. */
    notes: {
      order: 7,
      fillable: true,
      validation: { rule: schema.string().max(300) },
      factory: () => '',
    },

    isDefault: {
      order: 8,
      fillable: true,
      default: false,
      validation: { rule: schema.boolean() },
      factory: () => false,
    },
  },
} as const)

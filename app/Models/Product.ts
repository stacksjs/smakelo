import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * A menu item, scoped to the business that sells it.
 *
 * Overrides the framework's Product, which belongs to a Category and a
 * Manufacturer and nothing else. That is right for a single shop selling its
 * own catalogue and unusable for a marketplace, where the same dish name
 * appears at a dozen businesses and every query has to know whose it is.
 *
 * The changes are `belongsTo: Business`, the modifier groups that give a menu
 * item its options, and a seeder count of zero because these come from a
 * written menu rather than from faker. Everything else is the framework's,
 * including `preparationTime`, `allergens` and `nutritionalInfo`, which were
 * already shaped for food.
 */
export default defineModel({
  name: 'Product',
  table: 'products',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,
    useSearch: {
      displayable: ['id', 'name', 'description', 'price', 'categoryId', 'isAvailable', 'inventoryCount'],
      searchable: ['name', 'description', 'categoryId'],
      sortable: ['price', 'createdAt', 'updatedAt', 'inventoryCount', 'preparationTime'],
      filterable: ['categoryId', 'businessId', 'isAvailable', 'allergens'],
    },

    useSeeder: {
      count: 0,
    },

    useApi: {
      // Public catalog: anyone may browse, only authenticated callers may
      // write. Declared explicitly because the trait now defaults BOTH sides to
      // `auth` — an undeclared read route is how a customer list leaks
      // (stacksjs/stacks#2224). Behaviour here is unchanged.
      middleware: { read: [], write: ['auth'] },
      uri: 'products',
    },

    observe: true,
  },

  belongsTo: ['Business', 'Category', 'Manufacturer'],

  hasMany: ['ModifierGroup', 'Review', 'ProductUnit', 'ProductVariant', 'LicenseKey', 'WaitlistProduct', 'Coupon'],

  attributes: {
    name: {
      order: 1,
      fillable: true,
      validation: {
        rule: schema.string().required().max(100),
        message: {
          max: 'Name must have a maximum of 100 characters',
        },
      },
      factory: faker => faker.commerce.productName(),
    },

    description: {
      order: 2,
      fillable: true,
      validation: {
        rule: schema.string(),
      },
      factory: faker => faker.commerce.productDescription(),
    },

    price: {
      order: 3,
      fillable: true,
      validation: {
        rule: schema.number().required().min(1),
        message: {
          min: 'Price must be at least 1',
        },
      },
      factory: faker => faker.number.int({ min: 100, max: 10000 }),
    },

    imageUrl: {
      order: 4,
      fillable: true,
      validation: {
        rule: schema.string(),
        message: {
          string: 'Image URL must be a string',
        },
      },
      factory: faker => faker.image.url(),
    },

    isAvailable: {
      order: 5,
      fillable: true,
      validation: {
        rule: schema.boolean(),
      },
      factory: () => true,
    },

    inventoryCount: {
      order: 6,
      fillable: true,
      validation: {
        rule: schema.number().min(0),
        message: {
          min: 'Inventory count must be at least 0',
        },
      },
      factory: faker => faker.number.int({ min: 0, max: 100 }),
    },

    preparationTime: {
      order: 8,
      fillable: true,
      validation: {
        rule: schema.number().required().min(1),
        message: {
          min: 'Preparation time must be at least 1 minute',
        },
      },
      factory: faker => faker.number.int({ min: 1, max: 60 }),
    },

    allergens: {
      order: 9,
      fillable: true,
      validation: {
        rule: schema.string(),
      },
      factory: (faker) => {
        const possibleAllergens = ['Gluten', 'Dairy', 'Nuts', 'Soy', 'Eggs', 'Fish', 'Shellfish']
        const count = faker.number.int({ min: 0, max: 3 })
        const allergens = faker.helpers.arrayElements(possibleAllergens, count)
        return JSON.stringify(allergens)
      },
    },

    nutritionalInfo: {
      order: 10,
      fillable: true,
      validation: {
        rule: schema.string(),
      },
      factory: (faker) => {
        return JSON.stringify({
          calories: faker.number.int({ min: 50, max: 800 }),
          fat: faker.number.float({ min: 0, max: 50 }),
          protein: faker.number.float({ min: 0, max: 30 }),
          carbs: faker.number.float({ min: 0, max: 100 }),
        })
      },
    },
  },

  dashboard: {
    highlight: true,
  },
} as const)

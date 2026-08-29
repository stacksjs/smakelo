import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

/**
 * A photo of a place.
 *
 * The framework has no media model at all - `Product.imageUrl` and
 * `Category.imageUrl` are single string columns - so a business that wants a
 * gallery needs one. Rows rather than a JSON array because photos are ordered,
 * captioned, credited and individually removable.
 *
 * `credit` is not decoration. Every image here comes from somewhere with terms
 * attached, and the attribution page is generated from this column.
 */
export default defineModel({
  name: 'BusinessPhoto',
  table: 'business_photos',
  primaryKey: 'id',
  autoIncrement: true,

  traits: {
    useUuid: true,
    useTimestamps: true,

    useSearch: {
      displayable: ['id', 'url', 'position'],
      searchable: ['caption'],
      sortable: ['position', 'createdAt'],
      filterable: ['businessId'],
    },

    useSeeder: { count: 0 },

    useApi: {
      uri: 'business-photos',
      routes: ['index', 'show'],
    },

    observe: true,
  },

  belongsTo: ['Business'],

  attributes: {
    url: {
      order: 1,
      required: true,
      fillable: true,
      validation: { rule: schema.string().required().max(500) },
      factory: () => '',
    },

    caption: {
      order: 2,
      fillable: true,
      validation: { rule: schema.string().max(300) },
      factory: () => '',
    },

    /** Photographer or source, and the licence. Feeds the attribution page. */
    credit: {
      order: 3,
      fillable: true,
      validation: { rule: schema.string().max(300) },
      factory: () => '',
    },

    /** Gallery order, ascending. */
    position: {
      order: 4,
      required: true,
      fillable: true,
      default: 0,
      validation: { rule: schema.number().min(0) },
      factory: () => 0,
    },

    /** Alt text. A gallery without it is unusable to a screen reader. */
    alt: {
      order: 5,
      fillable: true,
      validation: { rule: schema.string().max(300) },
      factory: () => '',
    },
  },
} as const)

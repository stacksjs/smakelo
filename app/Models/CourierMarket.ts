import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

export default defineModel({
  name: 'CourierMarket',
  table: 'courier_markets',
  primaryKey: 'id',
  autoIncrement: true,

  belongsTo: [
    { model: 'Courier', onDelete: 'cascade' },
    { model: 'Market', onDelete: 'cascade' },
  ],

  indexes: [
    { name: 'courier_markets_courier_market_unique', columns: ['courier_id', 'market_id'], unique: true },
    { name: 'courier_markets_market_id_index', columns: ['market_id'] },
  ],

  attributes: {
    courierId: {
      required: true,
      validation: { rule: schema.number().required().min(1) },
    },
    marketId: {
      required: true,
      validation: { rule: schema.number().required().min(1) },
    },
  },

  dashboard: { enabled: false },
} as const)

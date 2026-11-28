import { defineModel } from '@stacksjs/orm'
import { schema } from '@stacksjs/validation'

export default defineModel({
  name: 'DeliveryOffer',
  table: 'delivery_offers',
  primaryKey: 'id',
  autoIncrement: true,

  belongsTo: [
    { model: 'Order', onDelete: 'cascade' },
    { model: 'Courier', onDelete: 'cascade' },
  ],
  traits: { useUuid: true, useTimestamps: true },

  indexes: [
    { name: 'delivery_offers_order_courier_unique', columns: ['order_id', 'courier_id'], unique: true },
    { name: 'delivery_offers_pending_order_unique', columns: ['order_id'], unique: true, where: "status = 'pending'" },
    { name: 'delivery_offers_pending_courier_unique', columns: ['courier_id'], unique: true, where: "status = 'pending'" },
  ],

  attributes: {
    orderId: {
      required: true,
      validation: { rule: schema.number().required().min(1) },
    },
    courierId: {
      required: true,
      validation: { rule: schema.number().required().min(1) },
    },
    status: {
      fillable: true,
      required: true,
      default: 'pending',
      validation: { rule: schema.enum(['pending', 'accepted', 'declined', 'expired', 'withdrawn']) },
    },
    expiresAt: {
      fillable: true,
      required: true,
      validation: { rule: schema.number().required().min(0) },
    },
  },

  dashboard: { enabled: false },
} as const)

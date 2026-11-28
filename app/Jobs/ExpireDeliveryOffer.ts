import { Job } from '@stacksjs/queue'
import { expireDeliveryOffer } from '../Actions/Delivery/dispatch'

export default new Job({
  name: 'ExpireDeliveryOffer',
  description: 'Release an unanswered delivery offer and contact the next courier',
  queue: 'delivery-offers',
  async handle(payload: { offerId: number }) {
    await expireDeliveryOffer(payload.offerId)
  },
})

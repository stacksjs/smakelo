/**
 * Reviews, for the invented partners only.
 *
 * There is deliberately not one entry here for a real business. Every place in
 * `LISTINGS` exists, is findable by name, and has staff and an owner; inventing
 * a customer's opinion of it and publishing that on a public page would be
 * putting words in a stranger's mouth about their livelihood. The partners are
 * fictional, so their reviews can be too.
 *
 * They are written rather than generated because a review is prose. Generated
 * filler renders at the right length and says nothing, and the review layer is
 * half of what this app is for.
 */

export interface SeedReview {
  rating: number
  title: string
  body: string
  dishes?: string
  ownerResponse?: string
  helpful?: number
}

export const REVIEWS: Record<string, SeedReview[]> = {
  'aster-and-ash': [
    {
      rating: 5,
      title: 'The branzino is worth the wait',
      body: 'Half an hour for a whole fish and they tell you that when you order, which I appreciated. It came out with the skin properly blistered and they filleted it at the table without making a performance of it. The flatbread beforehand is dangerous - we ordered a second.',
      dishes: 'Whole branzino, wood-fired flatbread',
      helpful: 12,
    },
    {
      rating: 4,
      title: 'Loud, but good loud',
      body: 'Sat near the fire on a Friday and could not really hear across the table. Food was excellent, service was quick without rushing us. Would come back on a weeknight.',
      dishes: 'Half chicken, coal-roasted carrots',
      ownerResponse: 'Thanks for this - the room does carry on a Friday. The two tables along the west wall are quieter if you want to ask for one next time.',
      helpful: 8,
    },
    {
      rating: 5,
      title: 'Carrots. Carrots!',
      body: 'I did not expect to be writing a review about carrots but here we are. Dukkah, yoghurt, honey, and they somehow taste more like carrots than carrots do.',
      dishes: 'Coal-roasted carrots',
      helpful: 21,
    },
  ],

  'marisol-cocina': [
    {
      rating: 5,
      title: 'The mole is the real thing',
      body: 'Three days of work and you can taste every one of them. Deep and a little bitter in the way a good mole should be. Ask for extra tortillas, you will want them.',
      dishes: 'Mole negro',
      helpful: 34,
    },
    {
      rating: 5,
      title: 'Masa ground on site and it shows',
      body: 'The tortillas alone are worth the trip. Ordered carnitas and hongos tacos and the mushroom ones were better, which surprised everyone at the table including me.',
      dishes: 'Tacos (carnitas, hongos)',
      helpful: 17,
    },
    {
      rating: 4,
      title: 'Small room, go early',
      body: 'Twenty minute wait at seven on a Tuesday. Worth it, but go at six if you can. The horchata is made properly, not from a mix.',
      dishes: 'Tlayuda, horchata',
      helpful: 6,
    },
  ],

  'little-bird-ramen': [
    {
      rating: 5,
      title: 'Best paitan I have had outside Japan',
      body: 'Genuinely. The broth has that thickness that only comes from actually cooking it that long, and the confit thigh falls apart. Twelve seats so expect to wait, and it moves fast.',
      dishes: 'Chicken paitan, extra ajitama',
      helpful: 41,
    },
    {
      rating: 4,
      title: 'The vegetable one is not an afterthought',
      body: 'Came with a friend who does not eat meat and the shio held up on its own - roasted kombu doing a lot of work. Gyoza are good but not the reason to come.',
      dishes: 'Vegetable shio, gyoza',
      ownerResponse: 'Glad the shio landed. We spent a long time on that one and it is easy for a vegetable bowl to be the thing nobody orders.',
      helpful: 15,
    },
  ],

  'fog-and-filter': [
    {
      rating: 5,
      title: 'No laptops after eleven is a public service',
      body: 'The rule is on a small sign and they enforce it kindly. The room actually functions as a cafe as a result. Cortado was dialled in both times I went.',
      dishes: 'Cortado, morning bun',
      helpful: 28,
    },
    {
      rating: 4,
      title: 'One origin at a time',
      body: 'If you like choosing, this is not your place. If you like someone else having chosen well, it very much is. The filter changed between my two visits and both were good.',
      dishes: 'Filter coffee',
      helpful: 9,
    },
  ],

  'the-salted-anchor': [
    {
      rating: 4,
      title: 'Chips in beef fat, as promised',
      body: 'They are not lying on the menu and it makes a real difference. Raw bar was fresh, oysters shucked in front of you. A little pricey for what it is but the quality is there.',
      dishes: 'Oysters, chips',
      helpful: 11,
    },
  ],

  'nonna-pia': [
    {
      rating: 5,
      title: 'Twelve pastas and no distractions',
      body: 'A menu with one thing on it done properly beats a menu with forty. Rolled that morning and it tastes like it. No starters, no mains, just pasta and a short wine list.',
      dishes: 'Cacio e pepe',
      helpful: 19,
    },
    {
      rating: 4,
      title: 'Go with someone who shares',
      body: 'Portions are honest rather than huge, which means you can have two between two people and try more. That is clearly the intent.',
      helpful: 7,
    },
  ],

  'golden-hour-diner': [
    {
      rating: 4,
      title: 'Breakfast at four in the afternoon',
      body: 'Which is the entire point. Pancakes really are the size of the plate. Coffee is diner coffee and I mean that as a compliment.',
      dishes: 'Pancakes, eggs over easy',
      helpful: 13,
    },
  ],

  'saffron-and-sumac': [
    {
      rating: 5,
      title: 'The bread arrives still puffed',
      body: 'Straight from the oven to the table, inflated, and it deflates while you watch. Order more mezze than you think you need and skip the skewers if you must choose.',
      dishes: 'Mezze spread, bread',
      helpful: 22,
    },
  ],

  'ember-coffee-roasters': [
    {
      rating: 5,
      title: 'Bags still warm',
      body: 'Roasting happens at the back while you drink, which is either charming or distracting depending on your mood. Took a bag home the same day it was roasted.',
      dishes: 'Cortado',
      helpful: 10,
    },
  ],

  'cardoon-farm': [
    {
      rating: 5,
      title: 'The box has changed how we cook',
      body: 'You get what is ready rather than what you chose, and after a month of that I am cooking things I would never have bought. Add the eggs.',
      dishes: 'Family share, eggs',
      helpful: 26,
    },
    {
      rating: 4,
      title: 'Small share is right for two',
      body: 'We tried the family share first and wasted some of it. The small share is the right size for two people who cook most nights.',
      ownerResponse: 'Appreciated - we would rather you finish a small box than compost half a big one. Happy to switch anyone over mid-season.',
      helpful: 14,
    },
  ],

  'two-crows-orchard': [
    {
      rating: 5,
      title: 'Stone fruit that tastes like something',
      body: 'Picked ripe because it only travels an hour, and the difference against a supermarket peach is not subtle. Seasonal, so check before you make the trip.',
      dishes: 'White peaches',
      helpful: 18,
    },
  ],

  'the-slow-pour': [
    {
      rating: 4,
      title: 'Newspaper on a stick',
      body: 'An actual newspaper, on an actual stick. Filter coffee and sourdough toast and nowhere to plug in a laptop, which seems deliberate.',
      dishes: 'Filter, sourdough toast',
      helpful: 16,
    },
  ],
}

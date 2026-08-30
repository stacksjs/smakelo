/**
 * The Los Angeles seed.
 *
 * These are real places. Names, neighbourhoods and approximate coordinates are
 * drawn from public sources (OpenStreetMap and Foursquare's Open Source Places
 * dataset, both openly licensed) and hand-checked; a few addresses are
 * approximate, which is why `source` says so per row.
 *
 * Everything else on this site is invented, and the distinction is the point:
 *
 *   - A **listing** is one of these real businesses. It can be found, mapped
 *     and read about. It cannot take an order, because nobody who works there
 *     has agreed to sell anything through Smakelo.
 *   - A **partner** is fictional. Partners are where menus, orders, couriers,
 *     tables and payouts live, so that half of the app can be exercised without
 *     putting words in a real restaurant's mouth.
 *
 * That split is the whole reason the demo can use real data honestly. Reviews
 * are seeded only against partners, never against a real business.
 */

export interface SeedHours {
  /** 0 is Sunday. */
  day: number
  /** Local minutes after midnight; `close` may exceed 1440 for an after-midnight close. */
  open: number
  close: number
}

export interface SeedBusiness {
  name: string
  slug: string
  type: 'restaurant' | 'cafe' | 'farm' | 'bakery' | 'bar' | 'grocery'
  cuisine: string
  description: string
  address: string
  city: string
  postalCode?: string
  latitude: number
  longitude: number
  priceTier: number
  /** Real business copied from open data, or an invented partner. */
  partner?: boolean
  hours?: SeedHours[]
}

/** 11:00-22:00 every day, the ordinary case. */
const DAILY_LUNCH_TO_LATE: SeedHours[] = [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, open: 660, close: 1320 }))

/** 07:00-16:00 every day, for the coffee shops. */
const DAILY_MORNINGS: SeedHours[] = [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, open: 420, close: 960 }))

/**
 * Real places. `partner` is absent on every one of them, deliberately.
 */
export const LISTINGS: SeedBusiness[] = [
  // Venice
  {
    name: 'Gjelina',
    slug: 'gjelina',
    type: 'restaurant',
    cuisine: 'Californian, Mediterranean',
    description: 'A long, dim room on Abbot Kinney with a wood oven at the back.',
    address: '1429 Abbot Kinney Blvd',
    city: 'Venice',
    postalCode: '90291',
    latitude: 33.9903,
    longitude: -118.4664,
    priceTier: 3,
    hours: DAILY_LUNCH_TO_LATE,
  },
  {
    name: 'Gjusta',
    slug: 'gjusta',
    type: 'bakery',
    cuisine: 'Bakery, Deli',
    description: 'Bakery and deli counter in a converted warehouse, queue out the door by ten.',
    address: '320 Sunset Ave',
    city: 'Venice',
    postalCode: '90291',
    latitude: 33.9928,
    longitude: -118.4741,
    priceTier: 2,
    hours: DAILY_MORNINGS,
  },
  {
    name: 'Felix Trattoria',
    slug: 'felix-trattoria',
    type: 'restaurant',
    cuisine: 'Italian, Pasta',
    description: 'Pasta made in a glass room in the middle of the dining room.',
    address: '1023 Abbot Kinney Blvd',
    city: 'Venice',
    postalCode: '90291',
    latitude: 33.9917,
    longitude: -118.4690,
    priceTier: 4,
    hours: DAILY_LUNCH_TO_LATE,
  },
  {
    name: "Menotti's Coffee Stop",
    slug: 'menottis-coffee-stop',
    type: 'cafe',
    cuisine: 'Coffee',
    description: 'A small counter at the end of Windward, a block from the sand.',
    address: '56 Windward Ave',
    city: 'Venice',
    postalCode: '90291',
    latitude: 33.9856,
    longitude: -118.4723,
    priceTier: 1,
    hours: DAILY_MORNINGS,
  },
  {
    name: 'Intelligentsia Coffee Venice',
    slug: 'intelligentsia-coffee-venice',
    type: 'cafe',
    cuisine: 'Coffee',
    description: 'The Abbot Kinney coffeebar, all concrete and slow pours.',
    address: '1331 Abbot Kinney Blvd',
    city: 'Venice',
    postalCode: '90291',
    latitude: 33.9908,
    longitude: -118.4672,
    priceTier: 2,
    hours: DAILY_MORNINGS,
  },

  // Santa Monica
  {
    name: 'Rustic Canyon',
    slug: 'rustic-canyon',
    type: 'restaurant',
    cuisine: 'Californian, Market',
    description: 'A menu rewritten around whatever came off the Wednesday market.',
    address: '1119 Wilshire Blvd',
    city: 'Santa Monica',
    postalCode: '90401',
    latitude: 34.0270,
    longitude: -118.4880,
    priceTier: 4,
    hours: DAILY_LUNCH_TO_LATE,
  },
  {
    name: "Father's Office",
    slug: 'fathers-office',
    type: 'bar',
    cuisine: 'Burgers, Beer',
    description: 'Gastropub on Montana. No substitutions, and they mean it.',
    address: '1018 Montana Ave',
    city: 'Santa Monica',
    postalCode: '90403',
    latitude: 34.0316,
    longitude: -118.4977,
    priceTier: 2,
    hours: [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, open: 1020, close: day === 5 || day === 6 ? 1560 : 1440 })),
  },
  {
    name: 'Bay Cities Italian Deli',
    slug: 'bay-cities-italian-deli',
    type: 'grocery',
    cuisine: 'Italian, Sandwiches',
    description: 'Deli counter, import shelves, and the sandwich everyone queues for.',
    address: '1517 Lincoln Blvd',
    city: 'Santa Monica',
    postalCode: '90401',
    latitude: 34.0186,
    longitude: -118.4880,
    priceTier: 1,
    hours: [1, 2, 3, 4, 5, 6, 0].map(day => ({ day, open: 540, close: 1080 })),
  },
  {
    name: 'Milo & Olive',
    slug: 'milo-and-olive',
    type: 'restaurant',
    cuisine: 'Pizza, Bakery',
    description: 'Small neighbourhood room on Wilshire built around the bread and the pizza oven.',
    address: '2723 Wilshire Blvd',
    city: 'Santa Monica',
    postalCode: '90403',
    latitude: 34.0330,
    longitude: -118.4735,
    priceTier: 2,
    hours: DAILY_LUNCH_TO_LATE,
  },
  {
    name: 'Dogtown Coffee',
    slug: 'dogtown-coffee',
    type: 'cafe',
    cuisine: 'Coffee, Breakfast',
    description: 'Surf-shop history on Main Street, breakfast burritos before the beach.',
    address: '2003 Main St',
    city: 'Santa Monica',
    postalCode: '90405',
    latitude: 34.0104,
    longitude: -118.4917,
    priceTier: 1,
    hours: DAILY_MORNINGS,
  },
  {
    name: 'Caffe Luxxe',
    slug: 'caffe-luxxe',
    type: 'cafe',
    cuisine: 'Coffee',
    description: 'Montana Avenue espresso bar, rosetta on everything.',
    address: '925 Montana Ave',
    city: 'Santa Monica',
    postalCode: '90403',
    latitude: 34.0315,
    longitude: -118.4962,
    priceTier: 2,
    hours: DAILY_MORNINGS,
  },
  {
    name: 'Tacos Por Favor',
    slug: 'tacos-por-favor',
    type: 'restaurant',
    cuisine: 'Mexican, Tacos',
    description: 'Counter service, paper plates, machaca on the board.',
    address: '1406 Olympic Blvd',
    city: 'Santa Monica',
    postalCode: '90404',
    latitude: 34.0209,
    longitude: -118.4855,
    priceTier: 1,
    hours: [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, open: 480, close: 1200 })),
  },
  {
    name: 'Santa Monica Farmers Market',
    slug: 'santa-monica-farmers-market',
    type: 'farm',
    cuisine: 'Produce, Market',
    description: 'Wednesday and Saturday on Arizona, where half the city\'s kitchens shop.',
    address: 'Arizona Ave & 2nd St',
    city: 'Santa Monica',
    postalCode: '90401',
    latitude: 34.0158,
    longitude: -118.4964,
    priceTier: 2,
    hours: [
      { day: 3, open: 480, close: 780 },
      { day: 6, open: 480, close: 780 },
    ],
  },

  // Central and east Los Angeles
  {
    name: 'Bestia',
    slug: 'bestia',
    type: 'restaurant',
    cuisine: 'Italian',
    description: 'Arts District warehouse, house charcuterie, loud in the best way.',
    address: '2121 E 7th Pl',
    city: 'Los Angeles',
    postalCode: '90021',
    latitude: 34.0334,
    longitude: -118.2296,
    priceTier: 4,
    hours: [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, open: 1020, close: 1440 })),
  },
  {
    name: 'République',
    slug: 'republique',
    type: 'restaurant',
    cuisine: 'French, Bakery',
    description: 'Vaulted brick on La Brea; pastry in the morning, brasserie at night.',
    address: '624 S La Brea Ave',
    city: 'Los Angeles',
    postalCode: '90036',
    latitude: 34.0625,
    longitude: -118.3444,
    priceTier: 3,
    hours: [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, open: 480, close: 1380 })),
  },
  {
    name: 'Sqirl',
    slug: 'sqirl',
    type: 'cafe',
    cuisine: 'Breakfast, Californian',
    description: 'Virgil Avenue jam shop that turned into a queue and then an institution.',
    address: '720 N Virgil Ave',
    city: 'Los Angeles',
    postalCode: '90029',
    latitude: 34.0796,
    longitude: -118.2864,
    priceTier: 2,
    hours: DAILY_MORNINGS,
  },
  {
    name: "Langer's Delicatessen",
    slug: 'langers-delicatessen',
    type: 'restaurant',
    cuisine: 'Deli, Sandwiches',
    description: 'Since 1947 by MacArthur Park. The pastrami on rye, number 19.',
    address: '704 S Alvarado St',
    city: 'Los Angeles',
    postalCode: '90057',
    latitude: 34.0576,
    longitude: -118.2790,
    priceTier: 2,
    hours: [1, 2, 3, 4, 5, 6].map(day => ({ day, open: 480, close: 960 })),
  },
  {
    name: 'Philippe the Original',
    slug: 'philippe-the-original',
    type: 'restaurant',
    cuisine: 'Sandwiches, American',
    description: 'Sawdust floors, communal tables, French dip since 1908.',
    address: '1001 N Alameda St',
    city: 'Los Angeles',
    postalCode: '90012',
    latitude: 34.0597,
    longitude: -118.2370,
    priceTier: 1,
    hours: [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, open: 360, close: 1320 })),
  },
  {
    name: 'Grand Central Market',
    slug: 'grand-central-market',
    type: 'grocery',
    cuisine: 'Market, Food Hall',
    description: 'A hundred years of stalls on Broadway, neon overhead.',
    address: '317 S Broadway',
    city: 'Los Angeles',
    postalCode: '90013',
    latitude: 34.0505,
    longitude: -118.2487,
    priceTier: 1,
    hours: [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, open: 480, close: 1260 })),
  },
  {
    name: 'Guerrilla Tacos',
    slug: 'guerrilla-tacos',
    type: 'restaurant',
    cuisine: 'Mexican, Tacos',
    description: 'Started on a cart, ended up on 7th Street with a bar.',
    address: '2000 E 7th St',
    city: 'Los Angeles',
    postalCode: '90021',
    latitude: 34.0333,
    longitude: -118.2320,
    priceTier: 2,
    hours: DAILY_LUNCH_TO_LATE,
  },

  // The farms that supply the markets. Real growers, out past the county line.
  {
    name: 'Weiser Family Farms',
    slug: 'weiser-family-farms',
    type: 'farm',
    cuisine: 'Produce, Potatoes',
    description: 'Tehachapi growers; the potatoes and melons on half the menus in this list.',
    address: 'Tehachapi',
    city: 'Tehachapi',
    latitude: 35.1322,
    longitude: -118.4489,
    priceTier: 2,
    hours: [{ day: 3, open: 480, close: 780 }, { day: 6, open: 480, close: 780 }],
  },
  {
    name: 'McGrath Family Farm',
    slug: 'mcgrath-family-farm',
    type: 'farm',
    cuisine: 'Produce, Organic',
    description: 'Camarillo organic growers, four generations on the same ground.',
    address: 'Camarillo',
    city: 'Camarillo',
    latitude: 34.2164,
    longitude: -119.0376,
    priceTier: 2,
    hours: [{ day: 6, open: 480, close: 840 }],
  },
  {
    name: 'Coleman Family Farms',
    slug: 'coleman-family-farms',
    type: 'farm',
    cuisine: 'Produce, Herbs',
    description: 'Carpinteria; the salad greens and herbs chefs name on the menu.',
    address: 'Carpinteria',
    city: 'Carpinteria',
    latitude: 34.3989,
    longitude: -119.5185,
    priceTier: 3,
    hours: [{ day: 3, open: 480, close: 780 }],
  },
]

/**
 * Invented partners.
 *
 * Everything transactional in the app happens here. They are placed on real
 * streets so the map and distance sorting behave like the real thing, and named
 * so nobody could mistake one for a business that exists.
 */
export const PARTNERS: SeedBusiness[] = [
  {
    name: 'Aster & Ash',
    slug: 'aster-and-ash',
    type: 'restaurant',
    cuisine: 'Californian, Wood Fire',
    description: 'Everything over live oak: whole fish, spring vegetables, flatbread from the coals.',
    address: '1512 Abbot Kinney Blvd',
    city: 'Venice',
    postalCode: '90291',
    latitude: 33.9897,
    longitude: -118.4655,
    priceTier: 3,
    partner: true,
    hours: DAILY_LUNCH_TO_LATE,
  },
  {
    name: 'Marisol Cocina',
    slug: 'marisol-cocina',
    type: 'restaurant',
    cuisine: 'Mexican, Oaxacan',
    description: 'Oaxacan home cooking. Masa ground here, six moles on rotation.',
    address: '2412 Main St',
    city: 'Santa Monica',
    postalCode: '90405',
    latitude: 34.0074,
    longitude: -118.4884,
    priceTier: 2,
    partner: true,
    hours: DAILY_LUNCH_TO_LATE,
  },
  {
    name: 'The Salted Anchor',
    slug: 'the-salted-anchor',
    type: 'restaurant',
    cuisine: 'Seafood',
    description: 'Day boat fish, a raw bar, and chips fried in beef fat.',
    address: '117 Broadway',
    city: 'Santa Monica',
    postalCode: '90401',
    latitude: 34.0161,
    longitude: -118.4956,
    priceTier: 3,
    partner: true,
    hours: DAILY_LUNCH_TO_LATE,
  },
  {
    name: 'Nonna Pia',
    slug: 'nonna-pia',
    type: 'restaurant',
    cuisine: 'Italian, Pasta',
    description: 'Twelve pastas, rolled each morning, and nothing else on the menu.',
    address: '806 Broadway',
    city: 'Santa Monica',
    postalCode: '90401',
    latitude: 34.0186,
    longitude: -118.4901,
    priceTier: 2,
    partner: true,
    hours: DAILY_LUNCH_TO_LATE,
  },
  {
    name: 'Golden Hour Diner',
    slug: 'golden-hour-diner',
    type: 'restaurant',
    cuisine: 'American, Breakfast',
    description: 'Breakfast until close. Pancakes the size of the plate.',
    address: '1439 Lincoln Blvd',
    city: 'Santa Monica',
    postalCode: '90401',
    latitude: 34.0195,
    longitude: -118.4887,
    priceTier: 1,
    partner: true,
    hours: [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, open: 390, close: 900 })),
  },
  {
    name: 'Saffron & Sumac',
    slug: 'saffron-and-sumac',
    type: 'restaurant',
    cuisine: 'Levantine, Mezze',
    description: 'Mezze, charcoal skewers, and bread that arrives still puffed.',
    address: '331 Wilshire Blvd',
    city: 'Santa Monica',
    postalCode: '90401',
    latitude: 34.0201,
    longitude: -118.4936,
    priceTier: 2,
    partner: true,
    hours: DAILY_LUNCH_TO_LATE,
  },
  {
    name: 'Little Bird Ramen',
    slug: 'little-bird-ramen',
    type: 'restaurant',
    cuisine: 'Japanese, Ramen',
    description: 'Chicken paitan pulled for eighteen hours. Twelve seats and a counter.',
    address: '2020 Wilshire Blvd',
    city: 'Santa Monica',
    postalCode: '90403',
    latitude: 34.0299,
    longitude: -118.4795,
    priceTier: 2,
    partner: true,
    hours: [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, open: 690, close: 1350 })),
  },
  {
    name: 'Fog & Filter',
    slug: 'fog-and-filter',
    type: 'cafe',
    cuisine: 'Coffee, Pastry',
    description: 'One origin at a time, a pastry case, and no laptops after eleven.',
    address: '1112 Montana Ave',
    city: 'Santa Monica',
    postalCode: '90403',
    latitude: 34.0318,
    longitude: -118.4991,
    priceTier: 2,
    partner: true,
    hours: DAILY_MORNINGS,
  },
  {
    name: 'Ember Coffee Roasters',
    slug: 'ember-coffee-roasters',
    type: 'cafe',
    cuisine: 'Coffee, Roastery',
    description: 'Roastery at the back, cortados at the front, bags still warm.',
    address: '1201 Abbot Kinney Blvd',
    city: 'Venice',
    postalCode: '90291',
    latitude: 33.9912,
    longitude: -118.4681,
    priceTier: 2,
    partner: true,
    hours: DAILY_MORNINGS,
  },
  {
    name: 'The Slow Pour',
    slug: 'the-slow-pour',
    type: 'cafe',
    cuisine: 'Coffee, Breakfast',
    description: 'Filter coffee, sourdough toast, and the newspaper on a stick.',
    address: '514 Rose Ave',
    city: 'Venice',
    postalCode: '90291',
    latitude: 33.9948,
    longitude: -118.4712,
    priceTier: 1,
    partner: true,
    hours: DAILY_MORNINGS,
  },
  {
    name: 'Cardoon Farm',
    slug: 'cardoon-farm',
    type: 'farm',
    cuisine: 'Produce, CSA',
    description: 'Twelve acres in Moorpark. Weekly boxes, and whatever is ready that week.',
    address: 'Moorpark',
    city: 'Moorpark',
    latitude: 34.2856,
    longitude: -118.8820,
    priceTier: 2,
    partner: true,
    hours: [{ day: 3, open: 480, close: 780 }, { day: 6, open: 480, close: 840 }],
  },
  {
    name: 'Two Crows Orchard',
    slug: 'two-crows-orchard',
    type: 'farm',
    cuisine: 'Produce, Stone Fruit',
    description: 'Stone fruit and citrus from Ojai, picked ripe because it only travels an hour.',
    address: 'Ojai',
    city: 'Ojai',
    latitude: 34.4480,
    longitude: -119.2429,
    priceTier: 3,
    partner: true,
    hours: [{ day: 6, open: 480, close: 840 }],
  },
]

import { OSM_LISTINGS } from './osm-listings'

/**
 * Everything the seeder loads.
 *
 * Curated first, then the OpenStreetMap import minus anything already curated.
 * The hand-written entries win on a slug collision because they carry a
 * description somebody wrote and hours somebody checked; the import is breadth,
 * not depth, and overwriting depth with breadth would be a strange trade.
 */
export const ALL_BUSINESSES: SeedBusiness[] = (() => {
  const curated = [...LISTINGS, ...PARTNERS]
  const taken = new Set(curated.map(business => business.slug))

  return [...curated, ...OSM_LISTINGS.filter(business => !taken.has(business.slug))]
})()

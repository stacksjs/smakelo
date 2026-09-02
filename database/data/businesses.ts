/**
 * The curated seed, region by region.
 *
 * Los Angeles came first and is still the bulk of it; Wuppertal and Gescher in
 * Nordrhein-Westfalen came second, which is what the `region` field on every
 * row is for. The OpenStreetMap imports that sit alongside these are in
 * `osm-listings*.ts`, one file per region.
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
  type: 'restaurant' | 'cafe' | 'farm' | 'bakery' | 'bar' | 'grocery' | 'home_kitchen'
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
  /**
   * Which region in `app/Actions/Business/regions.ts` this sits in. Absent
   * means Los Angeles, which is every row that predates the second region and
   * is why this is optional rather than required.
   */
  region?: string
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


/*
 * German opening hours, which are not American ones.
 *
 * A Ruhetag - one day a week the kitchen is shut - is normal here and worth
 * modelling rather than flattening: a restaurant that claims to be open on
 * Monday because the seed found it easier is lying about the one thing a
 * directory exists to tell you.
 */

/** 11:30-23:00, seven days. */
const DE_MITTAG_BIS_SPAET: SeedHours[] = [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, open: 690, close: 1380 }))

/** 17:00-23:00, Tuesday to Sunday. Monday is the Ruhetag. */
const DE_ABENDS_OHNE_MONTAG: SeedHours[] = [0, 2, 3, 4, 5, 6].map(day => ({ day, open: 1020, close: 1380 }))

/** 08:00-18:00 in the week, a shorter Sunday. */
const DE_CAFE: SeedHours[] = [
  ...[1, 2, 3, 4, 5, 6].map(day => ({ day, open: 480, close: 1080 })),
  { day: 0, open: 600, close: 1080 },
]

/** The baker's day: open at six, and Sunday morning only. */
const DE_BAECKEREI: SeedHours[] = [
  ...[1, 2, 3, 4, 5, 6].map(day => ({ day, open: 360, close: 1080 })),
  { day: 0, open: 450, close: 660 },
]

/** A Hofladen keeps farm hours: two afternoons and a Saturday morning. */
const DE_HOFLADEN: SeedHours[] = [
  { day: 3, open: 840, close: 1080 },
  { day: 5, open: 540, close: 1080 },
  { day: 6, open: 540, close: 780 },
]

/**
 * Invented partners in Nordrhein-Westfalen.
 *
 * The same rule as the Los Angeles partners, in another country: real streets
 * so the map and the distances behave, invented names so nobody could mistake
 * one for a business that exists, and every transactional part of the app -
 * menus, orders, tables, couriers - hanging off these rather than off the
 * OpenStreetMap listings around them.
 *
 * They are written in German, because they are German. The interface is
 * translated; a menu is not. A Bergische Kaffeetafel rendered into English as
 * "coffee table" would be a worse answer than leaving it in the language the
 * kitchen uses.
 */
export const NRW_PARTNERS: SeedBusiness[] = [
  // Wuppertal - Elberfeld, Barmen and the slopes between them.
  {
    name: 'Zur Schwebenden Laterne',
    slug: 'zur-schwebenden-laterne',
    type: 'restaurant',
    cuisine: 'Bergisch, Regional',
    description: 'Bergische Küche in einem schmalen Haus am Luisenviertel. Sauerbraten, Reibekuchen, und im Herbst Wild aus dem Bergischen.',
    address: 'Luisenstraße 92',
    city: 'Wuppertal',
    postalCode: '42103',
    latitude: 51.2549,
    longitude: 7.1425,
    priceTier: 2,
    partner: true,
    region: 'wuppertal',
    hours: DE_ABENDS_OHNE_MONTAG,
  },
  {
    name: 'Ocakbaşı Nordstadt',
    slug: 'ocakbasi-nordstadt',
    type: 'restaurant',
    cuisine: 'Türkisch, Grill',
    description: 'Holzkohlegrill im Gastraum, Brot aus dem Steinofen daneben. Adana, Lahmacun, und Linsensuppe den ganzen Tag.',
    address: 'Marienstraße 41',
    city: 'Wuppertal',
    postalCode: '42105',
    latitude: 51.2601,
    longitude: 7.1421,
    priceTier: 1,
    partner: true,
    region: 'wuppertal',
    hours: DE_MITTAG_BIS_SPAET,
  },
  {
    name: 'Osteria Wupperbogen',
    slug: 'osteria-wupperbogen',
    type: 'restaurant',
    cuisine: 'Italienisch, Pasta',
    description: 'Zwölf Nudelgerichte, jeden Morgen frisch gerollt, und sonst nichts auf der Karte.',
    address: 'Friedrich-Ebert-Straße 128',
    city: 'Wuppertal',
    postalCode: '42117',
    latitude: 51.2495,
    longitude: 7.1315,
    priceTier: 2,
    partner: true,
    region: 'wuppertal',
    hours: DE_ABENDS_OHNE_MONTAG,
  },
  {
    name: 'Kaffeehaus Nordbahn',
    slug: 'kaffeehaus-nordbahn',
    type: 'cafe',
    cuisine: 'Kaffee, Frühstück',
    description: 'Direkt an der Nordbahntrasse. Frühstück bis zwei, Kuchen bis der Kuchen alle ist.',
    address: 'Uellendahler Straße 65',
    city: 'Wuppertal',
    postalCode: '42107',
    latitude: 51.2662,
    longitude: 7.1489,
    priceTier: 1,
    partner: true,
    region: 'wuppertal',
    hours: DE_CAFE,
  },
  {
    name: 'Bergischer Kaffeegarten',
    slug: 'bergischer-kaffeegarten',
    type: 'cafe',
    cuisine: 'Kaffee, Bergische Kaffeetafel',
    description: 'Die vollständige Bergische Kaffeetafel, mit Dröppelminna auf dem Tisch. Zwei Stunden einplanen.',
    address: 'Hardt 12',
    city: 'Wuppertal',
    postalCode: '42107',
    latitude: 51.2617,
    longitude: 7.1553,
    priceTier: 2,
    partner: true,
    region: 'wuppertal',
    hours: DE_CAFE,
  },
  {
    name: 'Bäckerei Morgenrot',
    slug: 'baeckerei-morgenrot',
    type: 'bakery',
    cuisine: 'Bäckerei, Brot',
    description: 'Sauerteig über Nacht, Brötchen ab sechs, und samstags Streuselkuchen im Blech.',
    address: 'Werther Brücke 3',
    city: 'Wuppertal',
    postalCode: '42275',
    latitude: 51.2721,
    longitude: 7.1975,
    priceTier: 1,
    partner: true,
    region: 'wuppertal',
    hours: DE_BAECKEREI,
  },
  {
    name: 'Wupperschänke',
    slug: 'wupperschaenke',
    type: 'bar',
    cuisine: 'Bier, Kleine Karte',
    description: 'Obergärig vom Fass, acht Hähne, und eine Karte, die auf ein Bierdeckel passt.',
    address: 'Luisenstraße 116',
    city: 'Wuppertal',
    postalCode: '42103',
    latitude: 51.2551,
    longitude: 7.1408,
    priceTier: 1,
    partner: true,
    region: 'wuppertal',
    hours: [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, open: 1020, close: 1500 })),
  },

  // Gescher and the Münsterland around it.
  {
    name: 'Gasthaus Glockenklang',
    slug: 'gasthaus-glockenklang',
    type: 'restaurant',
    cuisine: 'Westfälisch, Regional',
    description: 'Westfälische Küche in der Glockenstadt. Töttchen, Pfefferpotthast, und im Frühjahr Spargel vom Hof nebenan.',
    address: 'Hauptstraße 14',
    city: 'Gescher',
    postalCode: '48712',
    latitude: 51.9551,
    longitude: 7.0059,
    priceTier: 2,
    partner: true,
    region: 'gescher',
    hours: DE_ABENDS_OHNE_MONTAG,
  },
  {
    name: 'Pizzeria Mühlenrad',
    slug: 'pizzeria-muehlenrad',
    type: 'restaurant',
    cuisine: 'Italienisch, Pizza',
    description: 'Holzofen, sechzig Sekunden, und Teig von vorgestern. Zum Mitnehmen oder an sechs Tischen.',
    address: 'Mühlenstraße 8',
    city: 'Gescher',
    postalCode: '48712',
    latitude: 51.9538,
    longitude: 7.0088,
    priceTier: 1,
    partner: true,
    region: 'gescher',
    hours: DE_MITTAG_BIS_SPAET,
  },
  {
    name: 'Kaffeescheune Berkelblick',
    slug: 'kaffeescheune-berkelblick',
    type: 'cafe',
    cuisine: 'Kaffee, Kuchen',
    description: 'Eine umgebaute Scheune an der Berkel. Filterkaffee, Butterkuchen, und draußen sitzen, solange es geht.',
    address: 'Armlandstraße 5',
    city: 'Gescher',
    postalCode: '48712',
    latitude: 51.9583,
    longitude: 7.0011,
    priceTier: 1,
    partner: true,
    region: 'gescher',
    hours: DE_CAFE,
  },
  {
    name: 'Hofladen Berkelaue',
    slug: 'hofladen-berkelaue',
    type: 'farm',
    cuisine: 'Hofladen, Gemüsekiste',
    description: 'Vierzehn Hektar an der Berkel. Wöchentliche Gemüsekisten und was sonst gerade reif ist.',
    address: 'Estern 22',
    city: 'Gescher',
    postalCode: '48712',
    latitude: 51.9702,
    longitude: 6.9803,
    priceTier: 2,
    partner: true,
    region: 'gescher',
    hours: DE_HOFLADEN,
  },
]

import { OSM_LISTINGS } from './osm-listings'
import { OSM_LISTINGS_GESCHER } from './osm-listings-gescher'
import { OSM_LISTINGS_WUPPERTAL } from './osm-listings-wuppertal'

/**
 * Home kitchens.
 *
 * The one type on this site that can only ever be a partner. A restaurant, a
 * bakery or a farm shop is premises: anybody can walk past one, and a mapper
 * can record it without asking. A home kitchen is somebody's flat. It appears
 * here only because the person cooking in it put it here, which is why not one
 * of these is imported and not one of them is real.
 *
 * They are invented in the same way the restaurant partners are, and for the
 * same reason - the transactional half of the app has to be exercised without
 * putting words in a real person's mouth - but the shape is different enough
 * to matter. A home kitchen cooks a handful of dishes rather than a menu,
 * cooks them on the days it says and not otherwise, and hands them over at a
 * door rather than across a counter. `app/Commands/Seed.ts` turns that into
 * capabilities: pickup always, delivery only when the cook is doing the
 * driving, and never a table.
 *
 * The street lines here are real streets, as everywhere else in this file, so
 * distances and the map behave. They are not anybody's address, and the app
 * does not show them: see `placeViewModel`, which gives a home kitchen its
 * neighbourhood and holds the door number back until there is an order to
 * bring to it.
 */
export const HOME_KITCHENS: SeedBusiness[] = [
  {
    name: 'Amma\'s Table',
    slug: 'ammas-table',
    type: 'home_kitchen',
    cuisine: 'Sri Lankan, Rice and Curry',
    description: 'One cook, five curries, Thursday to Sunday. Rice and curry the way it is eaten at home, in a box you carry away warm.',
    address: 'Palms Blvd',
    city: 'Mar Vista',
    postalCode: '90066',
    latitude: 34.0086,
    longitude: -118.4312,
    priceTier: 1,
    partner: true,
    hours: [4, 5, 6, 0].map(day => ({ day, open: 960, close: 1200 })),
  },
  {
    name: 'Doña Elvia Tamales',
    slug: 'dona-elvia-tamales',
    type: 'home_kitchen',
    cuisine: 'Oaxacan, Tamales',
    description: 'Tamales in banana leaf, steamed through the night and gone by ten. Order the evening before.',
    address: 'E 1st St',
    city: 'Boyle Heights',
    postalCode: '90033',
    latitude: 34.0442,
    longitude: -118.2093,
    priceTier: 1,
    partner: true,
    hours: [6, 0].map(day => ({ day, open: 420, close: 600 })),
  },
  {
    name: 'Kusina ni Baby',
    slug: 'kusina-ni-baby',
    type: 'home_kitchen',
    cuisine: 'Filipino, Home Cooking',
    description: 'Adobo, kare-kare and whatever the market had, cooked in batches on Friday and Saturday.',
    address: 'Temple St',
    city: 'Los Angeles',
    postalCode: '90026',
    latitude: 34.0705,
    longitude: -118.2769,
    priceTier: 1,
    partner: true,
    hours: [5, 6].map(day => ({ day, open: 1020, close: 1260 })),
  },
]

/**
 * The same idea in Nordrhein-Westfalen, written in German for the same reason
 * the restaurant partners there are.
 */
export const NRW_HOME_KITCHENS: SeedBusiness[] = [
  {
    name: 'Ayşes Küche',
    slug: 'ayses-kueche',
    type: 'home_kitchen',
    cuisine: 'Türkisch, Hausmannskost',
    description: 'Mantı, Dolma und Linsensuppe, freitags und samstags gekocht. Abholung an der Haustür, Lieferung nur im Viertel.',
    address: 'Hochstraße',
    city: 'Wuppertal',
    postalCode: '42105',
    latitude: 51.2578,
    longitude: 7.1502,
    priceTier: 1,
    partner: true,
    region: 'wuppertal',
    hours: [5, 6].map(day => ({ day, open: 960, close: 1200 })),
  },
  {
    name: 'Pierogarnia Ostersbaum',
    slug: 'pierogarnia-ostersbaum',
    type: 'home_kitchen',
    cuisine: 'Polnisch, Pierogi',
    description: 'Pierogi, von Hand gefaltet, im Dutzend. Donnerstags und sonntags, solange der Teig reicht.',
    address: 'Hochstraße',
    city: 'Wuppertal',
    postalCode: '42107',
    latitude: 51.2645,
    longitude: 7.1573,
    priceTier: 1,
    partner: true,
    region: 'wuppertal',
    hours: [4, 0].map(day => ({ day, open: 900, close: 1140 })),
  },
  {
    name: 'Mittagstisch bei Rita',
    slug: 'mittagstisch-bei-rita',
    type: 'home_kitchen',
    cuisine: 'Westfälisch, Mittagstisch',
    description: 'Ein Gericht am Tag, montags bis freitags, in der eigenen Schüssel abgeholt oder im Glas.',
    address: 'Armlandstraße',
    city: 'Gescher',
    postalCode: '48712',
    latitude: 51.9553,
    longitude: 7.0068,
    priceTier: 1,
    partner: true,
    region: 'gescher',
    hours: [1, 2, 3, 4, 5].map(day => ({ day, open: 690, close: 810 })),
  },
]

/**
 * Everything the seeder loads.
 *
 * Curated first, then the OpenStreetMap imports minus anything already
 * curated. The hand-written entries win on a slug collision because they carry
 * a description somebody wrote and hours somebody checked; the import is
 * breadth, not depth, and overwriting depth with breadth would be a strange
 * trade.
 *
 * One import file per region, concatenated here. The regions themselves are
 * described in `app/Actions/Business/regions.ts`; this file only needs to know
 * that every row carries the slug of the one it belongs to.
 */
export const ALL_BUSINESSES: SeedBusiness[] = (() => {
  const curated = [...LISTINGS, ...PARTNERS, ...NRW_PARTNERS, ...HOME_KITCHENS, ...NRW_HOME_KITCHENS]
  const taken = new Set(curated.map(business => business.slug))
  const imported = [...OSM_LISTINGS, ...OSM_LISTINGS_WUPPERTAL, ...OSM_LISTINGS_GESCHER]

  return [...curated, ...imported.filter(business => !taken.has(business.slug))]
})()

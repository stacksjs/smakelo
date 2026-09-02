/**
 * Photography for a listing.
 *
 * A directory of food that shows no food is a directory nobody browses, so
 * every business gets a photograph rather than a coloured square. The
 * photographs are stock: they are of the kind of food a place serves, not of
 * that place's dining room, and they are picked from a small library keyed on
 * cuisine so a ramen shop gets ramen and a farm gets a field.
 *
 * That distinction is the reason the library is curated by hand instead of
 * being a search query. Every id below was pulled up and looked at before it
 * went in, so "sushi" is sushi and "bakery" is bread; a random result for a
 * cuisine word is how a taqueria ends up illustrated with a salad.
 *
 * Which photo a business gets is derived from its slug, so it is the same on
 * every render, on the card and on the page, and two places next to each other
 * in the list do not share one.
 *
 * Served straight off Unsplash's image CDN, which does the resizing, the
 * cropping and the format negotiation from the query string - a webp to a
 * browser that wants one, a jpeg to one that does not.
 */

/**
 * Unsplash photo ids, by what they are of.
 *
 * Order within a bucket is meaningless; count is not. Four is enough that a
 * screenful of cafes does not read as one repeated picture, and few enough
 * that every one of them could be reviewed.
 */
const LIBRARY: Record<string, string[]> = {
  restaurant: [
    'photo-1517248135467-4c7edcad34c4',
    'photo-1552566626-52f8b828add9',
    'photo-1414235077428-338989a2e8c0',
    'photo-1550966871-3ed3cdb5ed0c',
  ],
  cafe: [
    'photo-1554118811-1e0d58224f24',
    'photo-1521017432531-fbd92d768814',
    'photo-1453614512568-c4024d13c247',
    'photo-1559925393-8be0ec4767c8',
  ],
  coffee: [
    'photo-1495474472287-4d71bcdd2085',
    'photo-1501339847302-ac426a4a7cbb',
    'photo-1442512595331-e89e73853f31',
    'photo-1554118811-1e0d58224f24',
  ],
  tea: [
    'photo-1544787219-7f47ccb76574',
    'photo-1564890369478-c89ca6d9cde9',
    'photo-1576092768241-dec231879fc3',
  ],
  bakery: [
    'photo-1509440159596-0249088772ff',
    'photo-1517433670267-08bbd4be890f',
    'photo-1555507036-ab1f4038808a',
    'photo-1549931319-a545dcf3bc73',
  ],
  breakfast: [
    'photo-1533089860892-a7c6f0a88666',
    'photo-1525351484163-7529414344d8',
    'photo-1482049016688-2d3e1b311543',
    'photo-1484723091739-30a097e8f929',
  ],
  pizza: [
    'photo-1513104890138-7c749659a591',
    'photo-1565299624946-b28f40a0ae38',
    'photo-1574071318508-1cdbab80d002',
    'photo-1595854341625-f33ee10dbf94',
  ],
  noodles: [
    'photo-1569718212165-3a8278d5f624',
    'photo-1591814468924-caf88d1232e1',
    'photo-1557872943-16a5ac26437e',
    'photo-1552611052-33e04de081de',
    'photo-1585032226651-759b368d7246',
  ],
  rice: [
    'photo-1546069901-ba9599a7e63c',
    'photo-1512058564366-18510be2db19',
    'photo-1596797038530-2c107229654b',
  ],
  sushi: [
    'photo-1579871494447-9811cf80d66c',
    'photo-1553621042-f6e147245754',
    'photo-1611143669185-af224c5e3252',
    'photo-1617196034796-73dfa7b1fd56',
  ],
  burger: [
    'photo-1568901346375-23c9450c58cd',
    'photo-1550547660-d9450f859349',
    'photo-1571091718767-18b5b1457add',
    'photo-1586190848861-99aa4a171e90',
  ],
  taco: [
    'photo-1565299585323-38d6b0865b47',
    'photo-1613514785940-daed07799d9b',
    'photo-1552332386-f8dd00dc2f85',
  ],
  seafood: [
    'photo-1559737558-2f5a35f4523b',
    'photo-1467003909585-2f8a72700288',
    'photo-1580476262798-bddd9f4b7369',
  ],
  steak: [
    'photo-1546964124-0cce460f38ef',
    'photo-1600891964092-4316c288032e',
    'photo-1558030006-450675393462',
    'photo-1544025162-d76694265947',
  ],
  salad: [
    'photo-1512621776951-a57141f2eefd',
    'photo-1540420773420-3366772f4999',
    'photo-1546793665-c74683f339c1',
    'photo-1467453678174-768ec283a940',
  ],
  mediterranean: [
    'photo-1544510808-91bcbee1df55',
    'photo-1540189549336-e6e99c3679fe',
    'photo-1512621776951-a57141f2eefd',
  ],
  indian: [
    'photo-1601050690597-df0568f70950',
    'photo-1546069901-ba9599a7e63c',
    'photo-1512058564366-18510be2db19',
  ],
  dessert: [
    'photo-1551024506-0bccd828d307',
    'photo-1488900128323-21503983a07e',
    'photo-1563805042-7684c019e1cb',
  ],
  farm: [
    'photo-1500595046743-cd271d694d30',
    'photo-1464226184884-fa280b87c399',
    'photo-1595855759920-86582396756a',
    'photo-1523741543316-beb7fc7023d8',
  ],
  grocery: [
    'photo-1542838132-92c53300491e',
    'photo-1578916171728-46686eac8d58',
    'photo-1604719312566-8912e9227c6a',
    'photo-1583258292688-d0213dc5a3a8',
  ],
  bar: [
    'photo-1514362545857-3bc16c4c7d1b',
    'photo-1470337458703-46ad1756a187',
    'photo-1551024709-8f23befc6f87',
    'photo-1572116469696-31de0f17cc34',
  ],
}

/**
 * Cuisine to bucket.
 *
 * Ordered and matched on substring, the same way the icons are, so
 * "Italian, Pasta" finds pizza before it falls through to the type. Kept
 * beside the icon table in spirit rather than merged with it: an icon can be
 * generic and still read correctly, and a photograph cannot.
 */
const CUISINE_BUCKETS: Array<[string, string]> = [
  ['sushi', 'sushi'],
  ['japanese', 'sushi'],
  ['ramen', 'noodles'],
  ['noodle', 'noodles'],
  ['thai', 'noodles'],
  ['vietnamese', 'noodles'],
  ['pho', 'noodles'],
  ['chinese', 'rice'],
  ['korean', 'rice'],
  ['indian', 'indian'],
  ['pizza', 'pizza'],
  ['italian', 'pizza'],
  ['pasta', 'noodles'],
  ['burger', 'burger'],
  ['american', 'burger'],
  ['diner', 'breakfast'],
  ['breakfast', 'breakfast'],
  ['brunch', 'breakfast'],
  ['taco', 'taco'],
  ['mexican', 'taco'],
  ['seafood', 'seafood'],
  ['fish', 'seafood'],
  ['oyster', 'seafood'],
  ['steak', 'steak'],
  ['barbecue', 'steak'],
  ['bbq', 'steak'],
  ['salad', 'salad'],
  ['vegan', 'salad'],
  ['vegetarian', 'salad'],
  ['levantine', 'mediterranean'],
  ['mediterranean', 'mediterranean'],
  ['greek', 'mediterranean'],
  ['middle eastern', 'mediterranean'],
  ['dessert', 'dessert'],
  ['ice cream', 'dessert'],
  ['coffee', 'coffee'],
  ['espresso', 'coffee'],
  ['tea', 'tea'],
  ['matcha', 'tea'],
  ['bakery', 'bakery'],
  ['bread', 'bakery'],
  ['pastry', 'bakery'],
  ['produce', 'farm'],
  ['stone fruit', 'farm'],
  ['citrus', 'farm'],
  ['farm', 'farm'],
  ['wine', 'bar'],
  ['cocktail', 'bar'],
  ['beer', 'bar'],
  /* The home kitchens' cuisines; see the matching list in identity.ts. */
  ['rice and curry', 'rice'],
  ['sri lankan', 'rice'],
  ['filipino', 'rice'],
  ['tamal', 'taco'],
  ['oaxacan', 'taco'],
  ['pierogi', 'noodles'],
]

/** Type to bucket, for when the cuisine says nothing useful. */
const TYPE_BUCKETS: Record<string, string> = {
  restaurant: 'restaurant',
  cafe: 'cafe',
  farm: 'farm',
  bakery: 'bakery',
  grocery: 'grocery',
  bar: 'bar',
  /*
   * No bucket of its own. A home kitchen is not a kind of food - it is a kind
   * of kitchen - and every one of them cooks something the cuisine already
   * names, which is chosen before this fallback is reached. A stock photograph
   * of somebody's hob would say less than a photograph of the curry.
   */
  home_kitchen: 'restaurant',
}

export interface PhotoInput {
  slug?: unknown
  name?: unknown
  type?: unknown
  cuisine?: unknown
}

/** The chosen photo's id, before any sizing is applied. */
export function photoIdFor(input: PhotoInput): string {
  const slug = String(input.slug ?? input.name ?? '')
  const cuisine = String(input.cuisine ?? '').toLowerCase()
  const type = String(input.type ?? '').toLowerCase()

  const bucket = LIBRARY[bucketFor(cuisine, type)] ?? LIBRARY.restaurant!

  return bucket[pick(slug) % bucket.length]!
}

/** Every id in the library, for the build that fetches and processes them. */
export function everyPhotoId(): string[] {
  const ids = new Set<string>()

  for (const bucket of Object.values(LIBRARY)) {
    for (const id of bucket)
      ids.add(id)
  }

  return [...ids]
}

/**
 * Where a photograph is fetched from, at build time and only at build time.
 *
 * Nothing at request time touches this host: `buddy build:images` reads it
 * once, and everything the site serves afterwards comes out of `public/`.
 * `fit=crop` with an explicit height because a card is a fixed rectangle and a
 * photograph arriving at its own aspect ratio either letterboxes or overflows.
 */
export function photoSourceUrl(id: string, width: number): string {
  return `https://images.unsplash.com/${id}?fit=crop&crop=entropy&w=${width}&h=${Math.round(width * 0.7)}&q=82`
}

/**
 * A dish's photograph.
 *
 * The same library, keyed on what the dish is called rather than on what the
 * business sells: a pizzeria's salad should be a salad. Falls back to the
 * restaurant's own cuisine when the name says nothing recognisable, because a
 * plausible-but-wrong photograph is worse than a generic one.
 */
export function dishPhotoId(name: string, cuisine: string): string {
  const words = String(name ?? '').toLowerCase()

  for (const [needle, bucket] of DISH_BUCKETS) {
    if (words.includes(needle))
      return LIBRARY[bucket]![pick(words) % LIBRARY[bucket]!.length]!
  }

  return photoIdFor({ slug: words, cuisine })
}

/**
 * Dish words to buckets, longest and most specific first.
 *
 * Ordered by hand rather than sorted, because the first match wins and the
 * general words have to come last: "ice cream" before "cream", "pizza" before
 * "pie". A dish called "Margherita" matches nothing here and falls through to
 * the restaurant's cuisine, which is the right answer.
 */
const DISH_BUCKETS: Array<[string, string]> = [
  ['pizza', 'pizza'],
  ['margherita', 'pizza'],
  ['calzone', 'pizza'],
  ['burger', 'burger'],
  ['cheeseburger', 'burger'],
  ['taco', 'taco'],
  ['burrito', 'taco'],
  ['quesadilla', 'taco'],
  ['sushi', 'sushi'],
  ['sashimi', 'sushi'],
  ['maki', 'sushi'],
  ['nigiri', 'sushi'],
  ['ramen', 'noodles'],
  ['noodle', 'noodles'],
  ['pasta', 'noodles'],
  ['spaghetti', 'noodles'],
  ['linguine', 'noodles'],
  ['tagliatelle', 'noodles'],
  ['pappardelle', 'noodles'],
  ['rigatoni', 'noodles'],
  ['gnocchi', 'noodles'],
  ['lasagne', 'noodles'],
  ['lasagna', 'noodles'],
  ['udon', 'noodles'],
  ['pho', 'noodles'],
  ['rice', 'rice'],
  ['risotto', 'rice'],
  ['biryani', 'rice'],
  ['curry', 'indian'],
  ['masala', 'indian'],
  ['tikka', 'indian'],
  ['dal', 'indian'],
  ['samosa', 'indian'],
  ['hummus', 'mediterranean'],
  ['falafel', 'mediterranean'],
  ['mezze', 'mediterranean'],
  ['shawarma', 'mediterranean'],
  ['kebab', 'mediterranean'],
  ['salad', 'salad'],
  ['greens', 'salad'],
  ['slaw', 'salad'],
  ['steak', 'steak'],
  ['ribeye', 'steak'],
  ['brisket', 'steak'],
  ['lamb', 'steak'],
  ['fish', 'seafood'],
  ['salmon', 'seafood'],
  ['tuna', 'seafood'],
  ['prawn', 'seafood'],
  ['shrimp', 'seafood'],
  ['oyster', 'seafood'],
  ['crab', 'seafood'],
  ['ice cream', 'dessert'],
  ['gelato', 'dessert'],
  ['tiramisu', 'dessert'],
  ['cake', 'dessert'],
  ['tart', 'dessert'],
  ['brownie', 'dessert'],
  ['pudding', 'dessert'],
  ['cookie', 'dessert'],
  ['croissant', 'bakery'],
  ['bread', 'bakery'],
  ['focaccia', 'bakery'],
  ['bagel', 'bakery'],
  ['pastry', 'bakery'],
  ['espresso', 'coffee'],
  ['latte', 'coffee'],
  ['cappuccino', 'coffee'],
  ['flat white', 'coffee'],
  ['americano', 'coffee'],
  ['cold brew', 'coffee'],
  ['coffee', 'coffee'],
  ['matcha', 'tea'],
  ['tea', 'tea'],
  ['egg', 'breakfast'],
  ['omelette', 'breakfast'],
  ['pancake', 'breakfast'],
  ['toast', 'breakfast'],
  ['granola', 'breakfast'],
]

/** Both sizes a listing needs: the card in a grid, and the band on its page. */
export interface BusinessPhoto {
  photoId: string
  /** Smallest variant, for `src`. */
  photo: string
  /** Every variant, for `srcset` - the browser picks by the rendered width. */
  photoSrcset: string
  /** The SplatHash, decoded, to fill the frame while the file arrives. */
  photoBlur: string
  photoWidth: number
  photoHeight: number
}

/**
 * The processed images, written by `buddy build:images`.
 *
 * Read once at module load rather than per call: it is one small JSON file and
 * this runs for every card on every page.
 *
 * An empty manifest is a working site, not a broken one - every image on this
 * site sits on a coloured ground derived from the business, and that ground is
 * what shows when there is no photograph to put on it. So a checkout that has
 * not run the image build renders in flat colour rather than failing.
 */
let manifest: Record<string, ImageEntry> = {}

try {
  // eslint-disable-next-line ts/no-require-imports
  manifest = require('../../../public/img/photos/manifest.json')
}
catch {
  manifest = {}
}

export interface ImageEntry {
  src: string
  srcset: string
  width: number
  height: number
  blur: string
}

/** What a view needs to render one photograph, by id. */
export function imageFor(id: string): BusinessPhoto {
  const entry = manifest[id]

  return {
    photoId: id,
    photo: entry?.src ?? '',
    photoSrcset: entry?.srcset ?? '',
    photoBlur: entry?.blur ?? '',
    photoWidth: entry?.width ?? 0,
    photoHeight: entry?.height ?? 0,
  }
}

export function photoFor(input: PhotoInput): BusinessPhoto {
  return imageFor(photoIdFor(input))
}

/** The same, for one dish on a menu. */
export function dishPhotoFor(name: string, cuisine: string): BusinessPhoto {
  return imageFor(dishPhotoId(name, cuisine))
}

function bucketFor(cuisine: string, type: string): string {
  for (const [needle, bucket] of CUISINE_BUCKETS) {
    if (cuisine.includes(needle))
      return bucket
  }

  return TYPE_BUCKETS[type] ?? 'restaurant'
}

/**
 * A stable index from a slug.
 *
 * djb2 again, and deliberately the same function the hue uses rather than a
 * shared import: they must not agree. Two businesses that land on the same
 * photo should still be different colours underneath it, which they are not
 * if one number decides both.
 */
function pick(value: string): number {
  let hash = 2166136261

  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619) >>> 0
  }

  return hash >>> 0
}

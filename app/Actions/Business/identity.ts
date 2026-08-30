/**
 * A visual identity for a business, derived rather than uploaded.
 *
 * The obvious way to make a directory look alive is photographs. This one
 * cannot use them: 268 of these businesses are real places taken from open
 * data, and putting a stock photo of somebody else's dining room under a real
 * restaurant's name is fabricating a record of a real place. That is the same
 * line the reviews guard draws, and a picture crosses it more convincingly
 * than words do.
 *
 * So every business gets a generated cover instead: a colour derived from its
 * name, a second colour to give the gradient somewhere to go, an icon chosen
 * from its cuisine, and its initials. It is recognisably a placeholder, it is
 * stable for a given business, and no two adjacent cards look alike. Nothing
 * here claims to be a photograph of anything.
 */

export interface BusinessVisual {
  /** Base hue, 0-359. */
  hue: number
  /** Where the gradient lands, kept close so it reads as one colour. */
  hueEnd: number
  /** An iconify class, verified against the hugeicons collection. */
  icon: string
  /** One or two letters, for when the icon is too generic to identify it. */
  monogram: string
}

/**
 * Cuisine to icon.
 *
 * Ordered, and matched on substring, so "Italian, Pasta" finds pasta before it
 * falls back to the type. The list is deliberately short: an icon that is
 * nearly right reads as a mistake, while the category icon reads as a category.
 */
const CUISINE_ICONS: Array<[string, string]> = [
  ['sushi', 'sushi-01'],
  ['japanese', 'sushi-01'],
  ['ramen', 'noodles'],
  ['noodle', 'noodles'],
  ['thai', 'noodles'],
  ['vietnamese', 'noodles'],
  ['chinese', 'rice-bowl-01'],
  ['korean', 'rice-bowl-01'],
  ['pizza', 'pizza-01'],
  ['italian', 'pizza-01'],
  ['pasta', 'noodles'],
  ['burger', 'hamburger-01'],
  ['american', 'hamburger-01'],
  ['diner', 'egg-fried'],
  ['breakfast', 'egg-fried'],
  ['taco', 'taco-01'],
  ['mexican', 'taco-01'],
  ['seafood', 'fish-food'],
  ['fish', 'fish-food'],
  ['oyster', 'shellfish'],
  ['steak', 'steak'],
  ['barbecue', 'steak'],
  ['bbq', 'steak'],
  ['salad', 'salad'],
  ['vegan', 'organic-food'],
  ['vegetarian', 'vegetarian-food'],
  ['levantine', 'steak'],
  ['mediterranean', 'salad'],
  ['greek', 'salad'],
  ['indian', 'rice-bowl-01'],
  ['dessert', 'ice-cream-01'],
  ['ice cream', 'ice-cream-01'],
  ['coffee', 'coffee-01'],
  ['tea', 'tea'],
  ['bakery', 'croissant'],
  ['bread', 'bread-01'],
  ['produce', 'carrot'],
  ['stone fruit', 'apple-01'],
  ['citrus', 'apple-01'],
  ['farm', 'plant-01'],
]

/** Type to icon, for when the cuisine says nothing useful. */
const TYPE_ICONS: Record<string, string> = {
  restaurant: 'restaurant-01',
  cafe: 'coffee-01',
  farm: 'plant-01',
  bakery: 'bread-01',
  grocery: 'shopping-basket-01',
  bar: 'drink',
}

export function visualFor(input: { name?: unknown, slug?: unknown, type?: unknown, cuisine?: unknown }): BusinessVisual {
  const name = String(input.name ?? '')
  const slug = String(input.slug ?? name)
  const type = String(input.type ?? '').toLowerCase()
  const cuisine = String(input.cuisine ?? '').toLowerCase()

  const hue = hashHue(slug)

  return {
    hue,
    // A short rotation rather than a complementary colour: opposite hues make
    // a gradient look like a bruise.
    hueEnd: (hue + 38) % 360,
    icon: iconFor(cuisine, type),
    monogram: monogramFor(name),
  }
}

function iconFor(cuisine: string, type: string): string {
  for (const [needle, icon] of CUISINE_ICONS) {
    if (cuisine.includes(needle))
      return icon
  }

  return TYPE_ICONS[type] ?? 'restaurant-01'
}

/**
 * A stable hue from a string.
 *
 * Any hash would do; this one is the classic djb2 because it is short, has no
 * dependency, and spreads adjacent slugs (`gjelina`, `gjusta`) to different
 * colours, which is the only property that matters when the results are sorted
 * alphabetically.
 */
function hashHue(value: string): number {
  let hash = 5381

  for (let index = 0; index < value.length; index++)
    hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0

  return hash % 360
}

/**
 * Initials, in the way a person would abbreviate the name.
 *
 * Leading articles are dropped, because a wall of cards all reading "TH" is
 * worse than no monogram at all.
 */
function monogramFor(name: string): string {
  const words = name
    .replace(/[^\w\s&]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(word => !['the', 'a', 'an', 'and', 'of', 'de', 'la', 'le'].includes(word.toLowerCase()))

  if (words.length === 0)
    return name.slice(0, 2).toUpperCase() || '??'

  if (words.length === 1)
    return words[0]!.slice(0, 2).toUpperCase()

  return `${words[0]![0]}${words[1]![0]}`.toUpperCase()
}

import type { BusinessPhoto } from './imagery'
import { photoFor } from './imagery'

/**
 * A visual identity for a business, derived rather than uploaded.
 *
 * Four parts, all of them a function of the business and none of them stored:
 * a photograph of the food it serves (see ./imagery), a hue derived from its
 * name for everything that sits behind or beside that photograph, an icon
 * chosen from its cuisine, and its initials.
 *
 * Derived rather than uploaded because nobody has uploaded anything. The hue
 * and the monogram carry the small surfaces - a 48px tile in a list, an avatar
 * - where a photograph is just a smudge, and they are what a broken image
 * falls back to. They are also stable: the same business is the same colour on
 * the card, on its page and in the order it appears in later.
 */

export interface BusinessVisual extends BusinessPhoto {
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
  /*
   * The cuisines the home kitchens brought with them.
   *
   * Appended rather than slotted in, because the list returns its first match
   * and nothing above these needs to change: no listing that existed before
   * contains any of these words. Without them all six home kitchens fell
   * through to the type icon and every one of them looked identical, which is
   * the one thing the icon is there to prevent.
   */
  ['rice and curry', 'rice-bowl-01'],
  ['sri lankan', 'rice-bowl-01'],
  ['filipino', 'rice-bowl-01'],
  ['tamal', 'taco-01'],
  ['oaxacan', 'taco-01'],
  ['pierogi', 'noodles'],
]

/** Type to icon, for when the cuisine says nothing useful. */
const TYPE_ICONS: Record<string, string> = {
  restaurant: 'restaurant-01',
  cafe: 'coffee-01',
  farm: 'plant-01',
  bakery: 'bread-01',
  grocery: 'shopping-basket-01',
  bar: 'drink',
  // A lidded pot. `chef-hat` belongs to the kitchen board and `restaurant-01`
  // is crossed cutlery, which reads as a place with tables.
  home_kitchen: 'pot-01',
}

export function visualFor(input: { name?: unknown, slug?: unknown, type?: unknown, cuisine?: unknown }): BusinessVisual {
  const name = String(input.name ?? '')
  const slug = String(input.slug ?? name)
  const type = String(input.type ?? '').toLowerCase()
  const cuisine = String(input.cuisine ?? '').toLowerCase()

  const hue = hashHue(slug)

  return {
    ...photoFor({ slug, name, type, cuisine }),
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

/**
 * An icon for a dish, from what it is called.
 *
 * The same trick as the business covers, one level down: a menu of twenty
 * identical rows is hard to scan, and a small glyph per item gives the eye
 * something to land on. Matched against the name and description together,
 * because "Vongole" says nothing and "Spaghetti, clams, white wine" says
 * plenty.
 *
 * Falls back to the business's own category icon rather than to a generic
 * plate, so a coffee shop's untagged items still read as a coffee shop's.
 */
const DISH_ICONS: Array<[string, string]> = [
  ['pizza', 'pizza-01'],
  ['pasta', 'noodles'],
  ['spaghetti', 'noodles'],
  ['tonnarelli', 'noodles'],
  ['tagliatelle', 'noodles'],
  ['ravioli', 'noodles'],
  ['ramen', 'noodles'],
  ['noodle', 'noodles'],
  ['rice', 'rice-bowl-01'],
  ['burger', 'hamburger-01'],
  ['patty melt', 'hamburger-01'],
  ['taco', 'taco-01'],
  ['burrito', 'taco-01'],
  ['quesadilla', 'taco-01'],
  ['oyster', 'shellfish'],
  ['clam', 'shellfish'],
  ['shrimp', 'shellfish'],
  ['prawn', 'shellfish'],
  ['fish', 'fish-food'],
  ['salmon', 'fish-food'],
  ['anchovy', 'fish-food'],
  ['steak', 'steak'],
  ['lamb', 'steak'],
  ['chicken', 'steak'],
  ['pork', 'steak'],
  ['skewer', 'steak'],
  ['salad', 'salad'],
  ['gem', 'salad'],
  ['lettuce', 'salad'],
  ['chard', 'organic-food'],
  ['vegetable', 'organic-food'],
  ['potato', 'carrot'],
  ['carrot', 'carrot'],
  ['egg', 'egg-fried'],
  ['pancake', 'egg-fried'],
  ['chilaquiles', 'egg-fried'],
  ['toast', 'bread-01'],
  ['bread', 'bread-01'],
  ['flatbread', 'bread-01'],
  ['sourdough', 'bread-01'],
  ['croissant', 'croissant'],
  ['bun', 'croissant'],
  ['pastry', 'croissant'],
  ['cake', 'ice-cream-01'],
  ['tiramisu', 'ice-cream-01'],
  ['affogato', 'ice-cream-01'],
  ['ice cream', 'ice-cream-01'],
  ['coffee', 'coffee-01'],
  ['espresso', 'coffee-01'],
  ['latte', 'coffee-01'],
  ['cortado', 'coffee-01'],
  ['cappuccino', 'coffee-01'],
  ['flat white', 'coffee-01'],
  ['filter', 'coffee-01'],
  ['pour over', 'coffee-01'],
  ['batch brew', 'coffee-01'],
  ['tea', 'tea'],
  ['juice', 'apple-01'],
  ['peach', 'apple-01'],
  ['pluot', 'apple-01'],
  ['lemon', 'apple-01'],
  ['citrus', 'apple-01'],
  ['fruit', 'apple-01'],
  ['share', 'shopping-basket-01'],
  ['box', 'shopping-basket-01'],
  ['hummus', 'salad'],
  ['labneh', 'salad'],
  ['muhammara', 'salad'],
  ['cauliflower', 'organic-food'],
  ['chowder', 'rice-bowl-01'],
  ['chips', 'french-fries-01'],
  ['olives', 'organic-food'],
  ['cheese', 'cheese'],
]

export function dishIcon(name: unknown, description: unknown, fallback = 'restaurant-01'): string {
  const haystack = `${String(name ?? '')} ${String(description ?? '')}`.toLowerCase()

  for (const [needle, icon] of DISH_ICONS) {
    if (haystack.includes(needle))
      return icon
  }

  return fallback
}

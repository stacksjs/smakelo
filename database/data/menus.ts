/**
 * Menus for the invented partners.
 *
 * Written as real menus rather than generated, because the thing being
 * demonstrated is a menu: sections in the order a kitchen sends them, prices
 * that sit right next to each other, and modifier groups that ask the questions
 * an actual order needs answered. Faker output would render fine and prove
 * nothing.
 *
 * Prices are in cents, like every other amount in the app.
 */

export interface SeedModifier {
  name: string
  priceDeltaCents?: number
  isDefault?: boolean
}

export interface SeedModifierGroup {
  name: string
  description?: string
  min: number
  max: number
  options: SeedModifier[]
}

export interface SeedMenuItem {
  name: string
  description: string
  priceCents: number
  prepMinutes?: number
  allergens?: string[]
  modifierGroups?: SeedModifierGroup[]
}

export interface SeedMenuSection {
  name: string
  items: SeedMenuItem[]
}

/** Reused wherever a drink can be sized. */
function sizeGroup(regularLabel = 'Regular', largeDelta = 90): SeedModifierGroup {
  return {
    name: 'Size',
    min: 1,
    max: 1,
    options: [
      { name: regularLabel, isDefault: true },
      { name: 'Large', priceDeltaCents: largeDelta },
    ],
  }
}

const MILK_GROUP: SeedModifierGroup = {
  name: 'Milk',
  min: 1,
  max: 1,
  options: [
    { name: 'Whole', isDefault: true },
    { name: 'Oat', priceDeltaCents: 80 },
    { name: 'Almond', priceDeltaCents: 80 },
    { name: 'None' },
  ],
}

export const MENUS: Record<string, SeedMenuSection[]> = {
  'aster-and-ash': [
    {
      name: 'To Start',
      items: [
        {
          name: 'Wood-Fired Flatbread',
          description: 'Cultured butter, sea salt, rosemary from the pot by the door.',
          priceCents: 900,
          allergens: ['gluten', 'dairy'],
        },
        {
          name: 'Little Gems',
          description: 'Anchovy dressing, breadcrumb, a lot of black pepper.',
          priceCents: 1400,
          allergens: ['fish', 'gluten'],
          modifierGroups: [
            {
              name: 'Add',
              min: 0,
              max: 2,
              options: [
                { name: 'Soft egg', priceDeltaCents: 300 },
                { name: 'White anchovy', priceDeltaCents: 500 },
              ],
            },
          ],
        },
        {
          name: 'Charred Spring Onions',
          description: 'Romesco, almond, sherry vinegar.',
          priceCents: 1300,
          allergens: ['nuts'],
        },
      ],
    },
    {
      name: 'From the Fire',
      items: [
        {
          name: 'Whole Branzino',
          description: 'Over oak, lemon, olive oil, herbs from the garden.',
          priceCents: 3800,
          prepMinutes: 30,
          allergens: ['fish'],
          modifierGroups: [
            {
              name: 'Serve it',
              min: 1,
              max: 1,
              options: [
                { name: 'Whole', isDefault: true },
                { name: 'Filleted at the table', priceDeltaCents: 0 },
              ],
            },
          ],
        },
        {
          name: 'Half Chicken Under a Brick',
          description: 'Preserved lemon, pan drippings, grilled bread underneath.',
          priceCents: 3200,
          prepMinutes: 35,
        },
        {
          name: 'Coal-Roasted Carrots',
          description: 'Yoghurt, dukkah, honey from the Valley.',
          priceCents: 1600,
          allergens: ['dairy', 'nuts'],
        },
      ],
    },
    {
      name: 'Sweet',
      items: [
        { name: 'Olive Oil Cake', description: 'Crème fraîche, macerated citrus.', priceCents: 1200, allergens: ['gluten', 'dairy', 'egg'] },
        { name: 'Chocolate Tart', description: 'Salt, cold cream.', priceCents: 1300, allergens: ['gluten', 'dairy', 'egg'] },
      ],
    },
  ],

  'marisol-cocina': [
    {
      name: 'Antojitos',
      items: [
        {
          name: 'Tacos',
          description: 'Two per order, on masa ground this morning.',
          priceCents: 800,
          prepMinutes: 12,
          modifierGroups: [
            {
              name: 'Protein',
              description: 'Choose one.',
              min: 1,
              max: 1,
              options: [
                { name: 'Carnitas', isDefault: true },
                { name: 'Pollo asado' },
                { name: 'Carne asada', priceDeltaCents: 200 },
                { name: 'Hongos', priceDeltaCents: -100 },
              ],
            },
            {
              name: 'Add',
              min: 0,
              max: 3,
              options: [
                { name: 'Guacamole', priceDeltaCents: 250 },
                { name: 'Queso fresco', priceDeltaCents: 150 },
                { name: 'Extra salsa', priceDeltaCents: 100 },
              ],
            },
            {
              name: 'Heat',
              min: 1,
              max: 1,
              options: [
                { name: 'Mild' },
                { name: 'Medium', isDefault: true },
                { name: 'Hot' },
              ],
            },
          ],
        },
        {
          name: 'Quesadilla de Huitlacoche',
          description: 'Blue masa, Oaxacan cheese, epazote.',
          priceCents: 1100,
          allergens: ['dairy', 'gluten'],
        },
        { name: 'Elote', description: 'Crema, cotija, lime, chile.', priceCents: 700, allergens: ['dairy'] },
      ],
    },
    {
      name: 'Platos',
      items: [
        {
          name: 'Mole Negro',
          description: 'Thirty ingredients, three days, chicken and rice.',
          priceCents: 2400,
          prepMinutes: 25,
          allergens: ['nuts', 'sesame'],
        },
        {
          name: 'Tlayuda',
          description: 'Asiento, black beans, quesillo, the big one.',
          priceCents: 2000,
          prepMinutes: 20,
          allergens: ['dairy', 'gluten'],
        },
      ],
    },
    {
      name: 'Bebidas',
      items: [
        {
          name: 'Agua Fresca',
          description: 'Whatever fruit came in.',
          priceCents: 500,
          modifierGroups: [
            {
              name: 'Flavour',
              min: 1,
              max: 1,
              options: [
                { name: 'Horchata', isDefault: true },
                { name: 'Jamaica' },
                { name: 'Tamarindo' },
              ],
            },
            sizeGroup('Regular', 150),
          ],
        },
      ],
    },
  ],

  'little-bird-ramen': [
    {
      name: 'Ramen',
      items: [
        {
          name: 'Chicken Paitan',
          description: 'Eighteen hours of chicken, thin noodles, confit thigh.',
          priceCents: 1900,
          prepMinutes: 15,
          allergens: ['gluten', 'egg'],
          modifierGroups: [
            {
              name: 'Noodles',
              min: 1,
              max: 1,
              options: [
                { name: 'Thin', isDefault: true },
                { name: 'Thick' },
                { name: 'Extra portion', priceDeltaCents: 400 },
              ],
            },
            {
              name: 'Toppings',
              description: 'Up to four.',
              min: 0,
              max: 4,
              options: [
                { name: 'Ajitama egg', priceDeltaCents: 250, isDefault: true },
                { name: 'Menma', priceDeltaCents: 200 },
                { name: 'Nori', priceDeltaCents: 150 },
                { name: 'Extra chashu', priceDeltaCents: 500 },
                { name: 'Corn', priceDeltaCents: 150 },
              ],
            },
            {
              name: 'Spice',
              min: 1,
              max: 1,
              options: [
                { name: 'None', isDefault: true },
                { name: 'Mild' },
                { name: 'Hot' },
                { name: 'Extra hot' },
              ],
            },
          ],
        },
        {
          name: 'Shoyu',
          description: 'Clear broth, dashi and soy, restrained on purpose.',
          priceCents: 1800,
          prepMinutes: 15,
          allergens: ['gluten', 'egg', 'soy', 'fish'],
        },
        {
          name: 'Vegetable Shio',
          description: 'Roasted kombu and mushroom, no animals involved.',
          priceCents: 1700,
          prepMinutes: 15,
          allergens: ['gluten', 'soy'],
        },
      ],
    },
    {
      name: 'Sides',
      items: [
        { name: 'Gyoza', description: 'Five, pan fried.', priceCents: 900, allergens: ['gluten', 'soy'] },
        { name: 'Cucumber', description: 'Smashed, sesame, chilli.', priceCents: 600, allergens: ['sesame'] },
      ],
    },
  ],

  'fog-and-filter': [
    {
      name: 'Coffee',
      items: [
        {
          name: 'Filter',
          description: 'One origin at a time. Ask what it is.',
          priceCents: 450,
          prepMinutes: 4,
          modifierGroups: [sizeGroup('12 oz', 100)],
        },
        {
          name: 'Cortado',
          description: 'Two ounces of milk, no more.',
          priceCents: 500,
          prepMinutes: 3,
          allergens: ['dairy'],
          modifierGroups: [MILK_GROUP],
        },
        {
          name: 'Latte',
          description: 'House espresso, steamed properly.',
          priceCents: 550,
          prepMinutes: 3,
          allergens: ['dairy'],
          modifierGroups: [
            sizeGroup('8 oz', 90),
            MILK_GROUP,
            {
              name: 'Extras',
              min: 0,
              max: 2,
              options: [
                { name: 'Extra shot', priceDeltaCents: 120 },
                { name: 'Decaf' },
                { name: 'Honey', priceDeltaCents: 50 },
              ],
            },
          ],
        },
      ],
    },
    {
      name: 'Pastry',
      items: [
        { name: 'Butter Croissant', description: 'Laminated here, baked at six.', priceCents: 500, allergens: ['gluten', 'dairy'] },
        { name: 'Morning Bun', description: 'Orange, cardamom, sugar crust.', priceCents: 550, allergens: ['gluten', 'dairy'] },
        { name: 'Sourdough Toast', description: 'Cultured butter and jam, or avocado.', priceCents: 800, allergens: ['gluten', 'dairy'] },
      ],
    },
  ],

  'cardoon-farm': [
    {
      name: 'Weekly Boxes',
      items: [
        {
          name: 'Small Share',
          description: 'Six or seven kinds of vegetable. Feeds one or two.',
          priceCents: 2800,
          modifierGroups: [
            {
              name: 'Add to the box',
              min: 0,
              max: 3,
              options: [
                { name: 'Dozen eggs', priceDeltaCents: 900 },
                { name: 'Bunch of herbs', priceDeltaCents: 350 },
                { name: 'Jar of honey', priceDeltaCents: 1400 },
              ],
            },
          ],
        },
        {
          name: 'Family Share',
          description: 'Ten to twelve kinds. Feeds four, or two who cook a lot.',
          priceCents: 4600,
        },
      ],
    },
    {
      name: 'By the Bunch',
      items: [
        { name: 'Little Gem Lettuce', description: 'Three heads.', priceCents: 600 },
        { name: 'Rainbow Chard', description: 'Cut this morning.', priceCents: 450 },
        { name: 'New Potatoes', description: 'Two pounds, skins still loose.', priceCents: 700 },
      ],
    },
  ],
}

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

  'the-salted-anchor': [
    {
      name: 'Raw Bar',
      items: [
        {
          name: 'Oysters',
          description: 'Whatever came in this morning, shucked to order.',
          priceCents: 1800,
          prepMinutes: 6,
          allergens: ['shellfish'],
          modifierGroups: [
            {
              name: 'How many',
              min: 1,
              max: 1,
              options: [
                { name: 'Half dozen', isDefault: true },
                { name: 'Dozen', priceDeltaCents: 1600 },
              ],
            },
            {
              name: 'Alongside',
              min: 0,
              max: 2,
              options: [
                { name: 'Mignonette', isDefault: true },
                { name: 'Horseradish' },
                { name: 'Lemon only' },
              ],
            },
          ],
        },
        {
          name: 'Shrimp Cocktail',
          description: 'Poached in the shell, cooled on ice, sauce with a bite.',
          priceCents: 1900,
          allergens: ['shellfish'],
        },
      ],
    },
    {
      name: 'From the Boat',
      items: [
        {
          name: 'Whole Fish',
          description: 'Day boat, grilled over wood, dressed with oil and lemon.',
          priceCents: 3800,
          prepMinutes: 24,
          allergens: ['fish'],
          modifierGroups: [
            {
              name: 'Cooked',
              min: 1,
              max: 1,
              options: [
                { name: 'Grilled', isDefault: true },
                { name: 'Salt baked', priceDeltaCents: 400 },
              ],
            },
          ],
        },
        {
          name: 'Fish and Chips',
          description: 'Beer batter, fried in beef fat, malt vinegar on the table.',
          priceCents: 2400,
          prepMinutes: 16,
          allergens: ['fish', 'gluten'],
        },
        {
          name: 'Clam Chowder',
          description: 'Thin, not thick. Bacon, cream, a lot of clams.',
          priceCents: 1400,
          allergens: ['shellfish', 'dairy'],
        },
      ],
    },
    {
      name: 'Sides',
      items: [
        { name: 'Chips', description: 'Fried twice in beef fat.', priceCents: 700 },
        { name: 'Green Salad', description: 'Shallot vinaigrette.', priceCents: 800 },
      ],
    },
  ],

  'nonna-pia': [
    {
      name: 'Pasta',
      items: [
        {
          name: 'Cacio e Pepe',
          description: 'Tonnarelli, pecorino, pepper toasted in the pan.',
          priceCents: 1900,
          prepMinutes: 14,
          allergens: ['gluten', 'dairy', 'egg'],
          modifierGroups: [
            {
              name: 'Portion',
              min: 1,
              max: 1,
              options: [
                { name: 'Regular', isDefault: true },
                { name: 'Large', priceDeltaCents: 500 },
              ],
            },
          ],
        },
        {
          name: 'Ragu Bolognese',
          description: 'Tagliatelle. Six hours, mostly pork.',
          priceCents: 2300,
          prepMinutes: 14,
          allergens: ['gluten', 'dairy', 'egg'],
        },
        {
          name: 'Cacio Ravioli',
          description: 'Ricotta and lemon, brown butter, sage.',
          priceCents: 2200,
          prepMinutes: 15,
          allergens: ['gluten', 'dairy', 'egg'],
        },
        {
          name: 'Vongole',
          description: 'Spaghetti, clams, white wine, no cheese and do not ask.',
          priceCents: 2500,
          prepMinutes: 16,
          allergens: ['gluten', 'shellfish', 'egg'],
        },
      ],
    },
    {
      name: 'Before',
      items: [
        { name: 'Bread and Oil', description: 'From the bakery two doors down.', priceCents: 600, allergens: ['gluten'] },
        { name: 'Marinated Olives', description: 'Orange peel and fennel seed.', priceCents: 700 },
      ],
    },
    {
      name: 'After',
      items: [
        { name: 'Tiramisu', description: 'Made at four, eaten by nine.', priceCents: 1100, allergens: ['dairy', 'egg', 'gluten'] },
        { name: 'Affogato', description: 'One scoop, one shot.', priceCents: 900, allergens: ['dairy'] },
      ],
    },
  ],

  'golden-hour-diner': [
    {
      name: 'Breakfast, All Day',
      items: [
        {
          name: 'Pancakes',
          description: 'Three, the size of the plate. Butter and warm syrup.',
          priceCents: 1400,
          prepMinutes: 12,
          allergens: ['gluten', 'dairy', 'egg'],
          modifierGroups: [
            {
              name: 'In the batter',
              min: 0,
              max: 2,
              options: [
                { name: 'Blueberry', priceDeltaCents: 200 },
                { name: 'Banana', priceDeltaCents: 150 },
                { name: 'Chocolate chip', priceDeltaCents: 200 },
              ],
            },
          ],
        },
        {
          name: 'Two Eggs Any Way',
          description: 'Potatoes, toast, and the good jam.',
          priceCents: 1200,
          prepMinutes: 10,
          allergens: ['egg', 'gluten'],
          modifierGroups: [
            {
              name: 'Eggs',
              min: 1,
              max: 1,
              options: [
                { name: 'Over easy', isDefault: true },
                { name: 'Scrambled' },
                { name: 'Poached' },
                { name: 'Fried hard' },
              ],
            },
            {
              name: 'Add',
              min: 0,
              max: 3,
              options: [
                { name: 'Bacon', priceDeltaCents: 400 },
                { name: 'Sausage', priceDeltaCents: 400 },
                { name: 'Avocado', priceDeltaCents: 350 },
              ],
            },
          ],
        },
        {
          name: 'Chilaquiles',
          description: 'Salsa verde, crema, two eggs on top.',
          priceCents: 1500,
          prepMinutes: 14,
          allergens: ['dairy', 'egg'],
        },
      ],
    },
    {
      name: 'The Griddle',
      items: [
        {
          name: 'Patty Melt',
          description: 'Rye, onions cooked down slow, American cheese.',
          priceCents: 1600,
          prepMinutes: 14,
          allergens: ['gluten', 'dairy'],
        },
        { name: 'Grilled Cheese', description: 'Three cheeses. Tomato soup for two more.', priceCents: 1100, allergens: ['gluten', 'dairy'] },
      ],
    },
    {
      name: 'Drinks',
      items: [
        { name: 'Diner Coffee', description: 'Bottomless if you sit down.', priceCents: 350, modifierGroups: [sizeGroup('Mug', 60)] },
        { name: 'Orange Juice', description: 'Squeezed at opening.', priceCents: 500 },
      ],
    },
  ],

  'saffron-and-sumac': [
    {
      name: 'Mezze',
      items: [
        {
          name: 'Hummus',
          description: 'Warm, with olive oil pooled in the middle.',
          priceCents: 1000,
          allergens: ['sesame'],
          modifierGroups: [
            {
              name: 'On top',
              min: 0,
              max: 1,
              options: [
                { name: 'Plain', isDefault: true },
                { name: 'Lamb and pine nut', priceDeltaCents: 600 },
                { name: 'Whole chickpeas', priceDeltaCents: 200 },
              ],
            },
          ],
        },
        { name: 'Muhammara', description: 'Red pepper, walnut, pomegranate molasses.', priceCents: 1100, allergens: ['nuts'] },
        { name: 'Labneh', description: 'Strained two days, za\'atar, good oil.', priceCents: 950, allergens: ['dairy'] },
        { name: 'Bread', description: 'Out of the oven still puffed. Order more than you think.', priceCents: 400, allergens: ['gluten'] },
      ],
    },
    {
      name: 'Charcoal',
      items: [
        {
          name: 'Lamb Skewer',
          description: 'Shoulder, cumin, charred onion.',
          priceCents: 2200,
          prepMinutes: 18,
          modifierGroups: [
            {
              name: 'How many',
              min: 1,
              max: 1,
              options: [
                { name: 'Two skewers', isDefault: true },
                { name: 'Four skewers', priceDeltaCents: 1800 },
              ],
            },
          ],
        },
        { name: 'Chicken Musakhan', description: 'Sumac, onion, on flatbread.', priceCents: 2000, prepMinutes: 20, allergens: ['gluten'] },
        { name: 'Cauliflower', description: 'Whole, charred, tahini and herbs.', priceCents: 1600, prepMinutes: 20, allergens: ['sesame'] },
      ],
    },
  ],

  'ember-coffee-roasters': [
    {
      name: 'Espresso',
      items: [
        { name: 'Cortado', description: 'House blend, two ounces of milk.', priceCents: 480, prepMinutes: 3, allergens: ['dairy'], modifierGroups: [MILK_GROUP] },
        {
          name: 'Flat White',
          description: 'Ristretto base, no foam to speak of.',
          priceCents: 540,
          prepMinutes: 3,
          allergens: ['dairy'],
          modifierGroups: [MILK_GROUP, sizeGroup('6 oz', 80)],
        },
        {
          name: 'Espresso',
          description: 'Single origin on the second grinder, changes weekly.',
          priceCents: 400,
          prepMinutes: 2,
          modifierGroups: [
            {
              name: 'Beans',
              min: 1,
              max: 1,
              options: [
                { name: 'House blend', isDefault: true },
                { name: 'This week\'s single origin', priceDeltaCents: 100 },
              ],
            },
          ],
        },
      ],
    },
    {
      name: 'Beans',
      items: [
        {
          name: 'Twelve Ounce Bag',
          description: 'Roasted at the back on Tuesdays and Fridays.',
          priceCents: 2200,
          modifierGroups: [
            {
              name: 'Roast',
              min: 1,
              max: 1,
              options: [
                { name: 'House blend', isDefault: true },
                { name: 'Ethiopia, washed', priceDeltaCents: 400 },
                { name: 'Colombia, honey', priceDeltaCents: 300 },
              ],
            },
            {
              name: 'Grind',
              min: 1,
              max: 1,
              options: [
                { name: 'Whole bean', isDefault: true },
                { name: 'Filter' },
                { name: 'Espresso' },
              ],
            },
          ],
        },
      ],
    },
  ],

  'the-slow-pour': [
    {
      name: 'Coffee',
      items: [
        { name: 'Batch Brew', description: 'Made every twenty minutes whether anyone wants it.', priceCents: 380, prepMinutes: 2, modifierGroups: [sizeGroup('12 oz', 80)] },
        {
          name: 'Pour Over',
          description: 'Four minutes. Sit down.',
          priceCents: 600,
          prepMinutes: 6,
          modifierGroups: [
            {
              name: 'Beans',
              min: 1,
              max: 1,
              options: [
                { name: 'Whatever is open', isDefault: true },
                { name: 'The expensive one', priceDeltaCents: 250 },
              ],
            },
          ],
        },
        { name: 'Cappuccino', description: 'Wet, in a proper cup.', priceCents: 520, prepMinutes: 3, allergens: ['dairy'], modifierGroups: [MILK_GROUP] },
      ],
    },
    {
      name: 'Toast',
      items: [
        {
          name: 'Sourdough Toast',
          description: 'Thick cut, from the bakery on Rose.',
          priceCents: 750,
          prepMinutes: 6,
          allergens: ['gluten'],
          modifierGroups: [
            {
              name: 'On it',
              min: 1,
              max: 2,
              options: [
                { name: 'Butter and jam', isDefault: true },
                { name: 'Avocado', priceDeltaCents: 350 },
                { name: 'Ricotta and honey', priceDeltaCents: 300 },
                { name: 'Soft egg', priceDeltaCents: 250 },
              ],
            },
          ],
        },
        { name: 'Banana Bread', description: 'Toasted, with butter, always.', priceCents: 550, allergens: ['gluten', 'dairy', 'egg'] },
      ],
    },
  ],

  'two-crows-orchard': [
    {
      name: 'Boxes',
      items: [
        {
          name: 'Stone Fruit Box',
          description: 'Ten pounds of whatever is ripe this week. Picked the morning it goes out.',
          priceCents: 3400,
          modifierGroups: [
            {
              name: 'Lean toward',
              min: 0,
              max: 1,
              options: [
                { name: 'A mix', isDefault: true },
                { name: 'Mostly peaches' },
                { name: 'Mostly plums' },
              ],
            },
          ],
        },
        {
          name: 'Citrus Box',
          description: 'Winter only. Navels, blood oranges, and a bag of kumquats.',
          priceCents: 3000,
        },
      ],
    },
    {
      name: 'By the Pound',
      items: [
        { name: 'Peaches', description: 'Two pounds. Eat them over the sink.', priceCents: 900 },
        { name: 'Pluots', description: 'Two pounds, dappled ones are the good ones.', priceCents: 950 },
        { name: 'Meyer Lemons', description: 'A dozen, off the old tree.', priceCents: 700 },
      ],
    },
  ],
}

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


/*
 * The German partners.
 *
 * Written in German, for the same reason the German descriptions are: a menu
 * is the kitchen's own words. Prices are in cents, like everything else in the
 * app, and read as euros because the business belongs to a market whose
 * currency is the euro - the number here does not know that, and does not need
 * to.
 */

/** Sizes, in the words a German counter uses. */
function groesse(kleinLabel = 'Klein', grossDelta = 80): SeedModifierGroup {
  return {
    name: 'Größe',
    min: 1,
    max: 1,
    options: [
      { name: kleinLabel, isDefault: true },
      { name: 'Groß', priceDeltaCents: grossDelta },
    ],
  }
}

const MILCH_GROUP: SeedModifierGroup = {
  name: 'Milch',
  min: 1,
  max: 1,
  options: [
    { name: 'Vollmilch', isDefault: true },
    { name: 'Hafer', priceDeltaCents: 70 },
    { name: 'Soja', priceDeltaCents: 70 },
    { name: 'Ohne', isDefault: false },
  ],
}

const DE_MENUS: Record<string, SeedMenuSection[]> = {
  'zur-schwebenden-laterne': [
    {
      name: 'Vorweg',
      items: [
        {
          name: 'Reibekuchen',
          description: 'Drei Stück, aus der Pfanne, mit Apfelkompott.',
          priceCents: 780,
          allergens: ['gluten', 'egg'],
          modifierGroups: [
            {
              name: 'Dazu',
              min: 0,
              max: 2,
              options: [
                { name: 'Lachs', priceDeltaCents: 450 },
                { name: 'Rübenkraut', priceDeltaCents: 0 },
              ],
            },
          ],
        },
        { name: 'Bergische Kartoffelsuppe', description: 'Mit Mettwürstchen, oder ohne.', priceCents: 690, allergens: ['celery'] },
        { name: 'Blutwurst im Netz', description: 'Gebraten, mit Zwiebeln und Apfel.', priceCents: 850 },
      ],
    },
    {
      name: 'Hauptgerichte',
      items: [
        {
          name: 'Rheinischer Sauerbraten',
          description: 'Fünf Tage eingelegt. Mit Rosinensoße, Rotkohl und Klößen.',
          priceCents: 2280,
          prepMinutes: 25,
          allergens: ['gluten'],
          modifierGroups: [
            {
              name: 'Beilage',
              min: 1,
              max: 1,
              options: [
                { name: 'Kartoffelklöße', isDefault: true },
                { name: 'Salzkartoffeln' },
                { name: 'Semmelknödel', priceDeltaCents: 100 },
              ],
            },
          ],
        },
        { name: 'Himmel un Ääd', description: 'Kartoffelpüree, Apfelmus, gebratene Blutwurst.', priceCents: 1680, prepMinutes: 20 },
        { name: 'Wildragout aus dem Bergischen', description: 'Nur von Oktober bis Januar. Mit Preiselbeeren und Spätzle.', priceCents: 2450, prepMinutes: 30, allergens: ['gluten', 'egg'] },
        { name: 'Gemüseschnitzel', description: 'Aus Sellerie, paniert, mit Kartoffelsalat.', priceCents: 1580, prepMinutes: 18, allergens: ['gluten', 'celery', 'egg'] },
      ],
    },
    {
      name: 'Nachtisch',
      items: [
        { name: 'Waffel mit heißen Kirschen', description: 'Und Sahne, wenn Sie möchten.', priceCents: 720, allergens: ['gluten', 'dairy', 'egg'] },
        { name: 'Bergischer Milchreis', description: 'Mit Zimt und Zucker.', priceCents: 620, allergens: ['dairy'] },
      ],
    },
  ],

  'ocakbasi-nordstadt': [
    {
      name: 'Vom Grill',
      items: [
        {
          name: 'Adana Kebap',
          description: 'Vom Holzkohlegrill, mit Fladenbrot, Zwiebelsalat und Sumach.',
          priceCents: 1290,
          prepMinutes: 15,
          allergens: ['gluten'],
          modifierGroups: [
            {
              name: 'Schärfe',
              min: 1,
              max: 1,
              options: [
                { name: 'Mild', isDefault: true },
                { name: 'Scharf' },
                { name: 'Sehr scharf' },
              ],
            },
            {
              name: 'Dazu',
              min: 0,
              max: 3,
              options: [
                { name: 'Bulgur', priceDeltaCents: 250 },
                { name: 'Ayran', priceDeltaCents: 200 },
                { name: 'Extra Fladenbrot', priceDeltaCents: 150 },
              ],
            },
          ],
        },
        { name: 'Beyti Sarma', description: 'Im Fladenbrot gerollt, mit Joghurt und Tomatensoße.', priceCents: 1450, prepMinutes: 18, allergens: ['gluten', 'dairy'] },
        { name: 'Hähnchenspieß', description: 'Über Nacht mariniert, mit Grillgemüse.', priceCents: 1190, prepMinutes: 15 },
        { name: 'Sebzeli Şiş', description: 'Nur Gemüse: Aubergine, Paprika, Zwiebel, Champignon.', priceCents: 1050, prepMinutes: 14 },
      ],
    },
    {
      name: 'Aus dem Steinofen',
      items: [
        { name: 'Lahmacun', description: 'Dünn, mit Zitrone und Petersilie zum Rollen.', priceCents: 550, prepMinutes: 8, allergens: ['gluten'] },
        { name: 'Pide mit Käse', description: 'Kaşar, Ei obendrauf.', priceCents: 890, prepMinutes: 12, allergens: ['gluten', 'dairy', 'egg'] },
      ],
    },
    {
      name: 'Suppen und Salate',
      items: [
        { name: 'Mercimek Çorbası', description: 'Rote Linsensuppe, den ganzen Tag.', priceCents: 490, prepMinutes: 5 },
        { name: 'Çoban Salatası', description: 'Tomate, Gurke, Zwiebel, Petersilie.', priceCents: 620 },
      ],
    },
    {
      name: 'Getränke',
      items: [
        { name: 'Ayran', description: 'Selbstgemacht, gesalzen.', priceCents: 250 },
        { name: 'Çay', description: 'Im Gläschen, wie es sich gehört.', priceCents: 190 },
      ],
    },
  ],

  'osteria-wupperbogen': [
    {
      name: 'Antipasti',
      items: [
        { name: 'Vitello Tonnato', description: 'Dünn geschnitten, Thunfischcreme, Kapern.', priceCents: 1250, allergens: ['fish', 'egg'] },
        { name: 'Burrata', description: 'Aus Apulien, mit Ofentomaten und Basilikum.', priceCents: 1180, allergens: ['dairy'] },
        { name: 'Focaccia', description: 'Aus dem Ofen, mit Rosmarin und Olivenöl.', priceCents: 590, allergens: ['gluten'] },
      ],
    },
    {
      name: 'Pasta',
      items: [
        {
          name: 'Cacio e Pepe',
          description: 'Tonnarelli, Pecorino, viel Pfeffer. Sonst nichts.',
          priceCents: 1450,
          prepMinutes: 14,
          allergens: ['gluten', 'dairy', 'egg'],
          modifierGroups: [
            {
              name: 'Portion',
              min: 1,
              max: 1,
              options: [
                { name: 'Normal', isDefault: true },
                { name: 'Groß', priceDeltaCents: 400 },
              ],
            },
          ],
        },
        { name: 'Ragù alla Bolognese', description: 'Vier Stunden geschmort, mit Tagliatelle.', priceCents: 1620, prepMinutes: 15, allergens: ['gluten', 'egg', 'celery'] },
        { name: 'Cacciucco-Ravioli', description: 'Gefüllt mit Fisch, in Krustentierfond.', priceCents: 1890, prepMinutes: 16, allergens: ['gluten', 'egg', 'fish', 'crustaceans'] },
        { name: 'Pasta e Ceci', description: 'Kichererbsen, Rosmarin, gebrochene Maccheroni. Vegan.', priceCents: 1290, prepMinutes: 14, allergens: ['gluten'] },
      ],
    },
    {
      name: 'Dolci',
      items: [
        { name: 'Tiramisù', description: 'Im Glas, am Vortag angesetzt.', priceCents: 680, allergens: ['gluten', 'dairy', 'egg'] },
        { name: 'Affogato', description: 'Vanilleeis, ein Espresso darüber.', priceCents: 550, allergens: ['dairy'] },
      ],
    },
  ],

  'kaffeehaus-nordbahn': [
    {
      name: 'Kaffee',
      items: [
        { name: 'Filterkaffee', description: 'Alle zwanzig Minuten frisch.', priceCents: 320, prepMinutes: 2, modifierGroups: [groesse('0,2 l', 70)] },
        { name: 'Cappuccino', description: 'In der richtigen Tasse.', priceCents: 380, prepMinutes: 3, allergens: ['dairy'], modifierGroups: [MILCH_GROUP] },
        { name: 'Flat White', description: 'Doppelter Espresso, wenig Milch.', priceCents: 420, prepMinutes: 3, allergens: ['dairy'], modifierGroups: [MILCH_GROUP] },
        { name: 'Espresso', description: 'Hauseigene Röstung aus Ronsdorf.', priceCents: 250, prepMinutes: 2 },
      ],
    },
    {
      name: 'Frühstück',
      items: [
        {
          name: 'Frühstücksbrett',
          description: 'Brot, Käse, Aufschnitt, gekochtes Ei, Marmelade.',
          priceCents: 1290,
          prepMinutes: 12,
          allergens: ['gluten', 'dairy', 'egg'],
          modifierGroups: [
            {
              name: 'Ohne',
              min: 0,
              max: 3,
              options: [
                { name: 'Aufschnitt' },
                { name: 'Käse' },
                { name: 'Ei' },
              ],
            },
          ],
        },
        { name: 'Rührei mit Schnittlauch', description: 'Drei Eier, Bauernbrot dazu.', priceCents: 890, prepMinutes: 10, allergens: ['egg', 'gluten'] },
        { name: 'Porridge', description: 'Mit Apfel und gerösteten Haselnüssen.', priceCents: 720, prepMinutes: 8, allergens: ['nuts'] },
      ],
    },
    {
      name: 'Kuchen',
      items: [
        { name: 'Käsekuchen', description: 'Ohne Boden, wie in der Familie üblich.', priceCents: 420, allergens: ['dairy', 'egg'] },
        { name: 'Apfelstreusel', description: 'Vom Blech, solange er reicht.', priceCents: 390, allergens: ['gluten', 'dairy'] },
      ],
    },
  ],

  'bergischer-kaffeegarten': [
    {
      name: 'Die Kaffeetafel',
      items: [
        {
          name: 'Bergische Kaffeetafel',
          description: 'Kaffee aus der Dröppelminna, Waffeln mit heißen Kirschen, Brot, Aufschnitt, Käse, Quark, Rosinenstuten. Pro Person, ab zwei Personen.',
          priceCents: 2450,
          prepMinutes: 25,
          allergens: ['gluten', 'dairy', 'egg'],
          modifierGroups: [
            {
              name: 'Personen',
              min: 1,
              max: 1,
              options: [
                { name: '2 Personen', isDefault: true },
                { name: '3 Personen', priceDeltaCents: 2450 },
                { name: '4 Personen', priceDeltaCents: 4900 },
              ],
            },
          ],
        },
        { name: 'Kleine Kaffeetafel', description: 'Waffel, Brot, Aufschnitt, Kaffee. Für eine Person.', priceCents: 1650, prepMinutes: 18, allergens: ['gluten', 'dairy', 'egg'] },
      ],
    },
    {
      name: 'Einzeln',
      items: [
        { name: 'Waffel mit heißen Kirschen', description: 'Mit Sahne.', priceCents: 750, allergens: ['gluten', 'dairy', 'egg'] },
        { name: 'Rosinenstuten mit Butter', description: 'Zwei Scheiben.', priceCents: 380, allergens: ['gluten', 'dairy'] },
        { name: 'Kanne Kaffee', description: 'Aus der Dröppelminna, für zwei.', priceCents: 690, modifierGroups: [MILCH_GROUP] },
      ],
    },
  ],

  'baeckerei-morgenrot': [
    {
      name: 'Brot',
      items: [
        { name: 'Bergisches Sauerteigbrot', description: 'Über Nacht geführt, 1 kg.', priceCents: 480, allergens: ['gluten'] },
        { name: 'Roggenmischbrot', description: 'Kräftig, hält eine Woche.', priceCents: 420, allergens: ['gluten'] },
        { name: 'Dinkelvollkorn', description: 'Mit Sonnenblumenkernen.', priceCents: 520, allergens: ['gluten'] },
      ],
    },
    {
      name: 'Brötchen',
      items: [
        {
          name: 'Brötchen',
          description: 'Ab sechs Uhr. Stückpreis.',
          priceCents: 55,
          allergens: ['gluten'],
          modifierGroups: [
            {
              name: 'Sorte',
              min: 1,
              max: 1,
              options: [
                { name: 'Weizen', isDefault: true },
                { name: 'Körner', priceDeltaCents: 15 },
                { name: 'Roggen', priceDeltaCents: 10 },
              ],
            },
          ],
        },
        { name: 'Laugenstange', description: 'Mit grobem Salz.', priceCents: 140, allergens: ['gluten'] },
      ],
    },
    {
      name: 'Süß',
      items: [
        { name: 'Streuselkuchen vom Blech', description: 'Samstags. Ein Stück.', priceCents: 290, allergens: ['gluten', 'dairy', 'egg'] },
        { name: 'Berliner', description: 'Mit Pflaumenmus.', priceCents: 190, allergens: ['gluten', 'egg'] },
        { name: 'Franzbrötchen', description: 'Zimt, Butter, platt gedrückt.', priceCents: 220, allergens: ['gluten', 'dairy'] },
      ],
    },
  ],

  'wupperschaenke': [
    {
      name: 'Vom Fass',
      items: [
        {
          name: 'Obergäriges Hausbier',
          description: 'Aus Ronsdorf, 0,3 l.',
          priceCents: 340,
          modifierGroups: [
            {
              name: 'Größe',
              min: 1,
              max: 1,
              options: [
                { name: '0,3 l', isDefault: true },
                { name: '0,5 l', priceDeltaCents: 130 },
              ],
            },
          ],
        },
        { name: 'Pils', description: 'Sieben Minuten gezapft, 0,3 l.', priceCents: 320 },
        { name: 'Kölsch', description: 'Ja, hier auch. 0,2 l.', priceCents: 260 },
        { name: 'Alkoholfreies Weizen', description: '0,5 l.', priceCents: 380 },
      ],
    },
    {
      name: 'Kleine Karte',
      items: [
        { name: 'Bergische Käseplatte', description: 'Drei Sorten, Brot, Senf.', priceCents: 980, allergens: ['dairy', 'gluten'] },
        { name: 'Mettbrötchen', description: 'Mit Zwiebeln. Zwei Stück.', priceCents: 550, allergens: ['gluten'] },
        { name: 'Brezel', description: 'Groß, mit Butter.', priceCents: 350, allergens: ['gluten', 'dairy'] },
      ],
    },
  ],

  'gasthaus-glockenklang': [
    {
      name: 'Vorweg',
      items: [
        { name: 'Töttchen', description: 'Münsterländer Ragout vom Kalb, mit Brot.', priceCents: 890, allergens: ['gluten', 'celery'] },
        { name: 'Kartoffelsuppe', description: 'Mit Majoran und einem Klecks Sahne.', priceCents: 650, allergens: ['dairy', 'celery'] },
      ],
    },
    {
      name: 'Hauptgerichte',
      items: [
        {
          name: 'Pfefferpotthast',
          description: 'Rindfleisch, viel Pfeffer, drei Stunden. Mit Salzkartoffeln und Rote Bete.',
          priceCents: 2150,
          prepMinutes: 25,
          allergens: ['celery'],
        },
        {
          name: 'Münsterländer Spargel',
          description: 'Nur von April bis Juni. Mit zerlassener Butter und neuen Kartoffeln.',
          priceCents: 2280,
          prepMinutes: 22,
          allergens: ['dairy'],
          modifierGroups: [
            {
              name: 'Dazu',
              min: 0,
              max: 2,
              options: [
                { name: 'Schinken', priceDeltaCents: 450 },
                { name: 'Sauce hollandaise', priceDeltaCents: 250 },
                { name: 'Pfannkuchen', priceDeltaCents: 350 },
              ],
            },
          ],
        },
        { name: 'Schnitzel Wiener Art', description: 'Vom Schwein, mit Pommes und Preiselbeeren.', priceCents: 1690, prepMinutes: 18, allergens: ['gluten', 'egg'] },
        { name: 'Grünkohl mit Mettenden', description: 'Nur wenn es gefroren hat.', priceCents: 1580, prepMinutes: 20 },
      ],
    },
    {
      name: 'Nachtisch',
      items: [
        { name: 'Rote Grütze', description: 'Mit Vanillesoße.', priceCents: 590, allergens: ['dairy'] },
        { name: 'Westfälischer Apfelkuchen', description: 'Warm, mit Sahne.', priceCents: 620, allergens: ['gluten', 'dairy', 'egg'] },
      ],
    },
  ],

  'pizzeria-muehlenrad': [
    {
      name: 'Pizza',
      items: [
        {
          name: 'Margherita',
          description: 'San Marzano, Fior di Latte, Basilikum.',
          priceCents: 890,
          prepMinutes: 8,
          allergens: ['gluten', 'dairy'],
          modifierGroups: [
            {
              name: 'Belag dazu',
              min: 0,
              max: 4,
              options: [
                { name: 'Salami', priceDeltaCents: 180 },
                { name: 'Rucola', priceDeltaCents: 120 },
                { name: 'Büffelmozzarella', priceDeltaCents: 250 },
                { name: 'Sardellen', priceDeltaCents: 150 },
              ],
            },
          ],
        },
        { name: 'Diavola', description: 'Scharfe Salami, Chili, Honig obendrauf.', priceCents: 1150, prepMinutes: 8, allergens: ['gluten', 'dairy'] },
        { name: 'Quattro Formaggi', description: 'Gorgonzola, Pecorino, Fontina, Mozzarella.', priceCents: 1250, prepMinutes: 8, allergens: ['gluten', 'dairy'] },
        { name: 'Ortolana', description: 'Gegrilltes Gemüse, ohne Käse. Vegan.', priceCents: 1050, prepMinutes: 8, allergens: ['gluten'] },
      ],
    },
    {
      name: 'Dazu',
      items: [
        { name: 'Insalata Mista', description: 'Blattsalat, Tomate, Balsamico.', priceCents: 480 },
        { name: 'Knoblauchbrot', description: 'Aus dem Holzofen.', priceCents: 420, allergens: ['gluten'] },
      ],
    },
  ],

  'kaffeescheune-berkelblick': [
    {
      name: 'Kaffee',
      items: [
        { name: 'Filterkaffee', description: 'Kanne oder Tasse.', priceCents: 300, prepMinutes: 2, modifierGroups: [groesse('Tasse', 190)] },
        { name: 'Milchkaffee', description: 'In der Schale.', priceCents: 390, prepMinutes: 3, allergens: ['dairy'], modifierGroups: [MILCH_GROUP] },
        { name: 'Espresso', description: 'Doppelt, wenn Sie nichts sagen.', priceCents: 260, prepMinutes: 2 },
      ],
    },
    {
      name: 'Kuchen',
      items: [
        { name: 'Butterkuchen', description: 'Vom Blech, noch warm um drei.', priceCents: 350, allergens: ['gluten', 'dairy', 'egg'] },
        { name: 'Möhrenkuchen', description: 'Mit Frischkäsehaube.', priceCents: 420, allergens: ['gluten', 'dairy', 'egg', 'nuts'] },
        { name: 'Rhabarberstreusel', description: 'Im Mai und Juni, vom Hof gegenüber.', priceCents: 400, allergens: ['gluten', 'dairy'] },
      ],
    },
  ],

  'hofladen-berkelaue': [
    {
      name: 'Gemüsekisten',
      items: [
        {
          name: 'Kleine Kiste',
          description: 'Für ein bis zwei Personen. Was diese Woche reif ist.',
          priceCents: 1800,
          modifierGroups: [
            {
              name: 'Ohne',
              min: 0,
              max: 3,
              options: [
                { name: 'Kohl' },
                { name: 'Rote Bete' },
                { name: 'Zwiebeln' },
              ],
            },
          ],
        },
        { name: 'Große Kiste', description: 'Für vier. Reicht bis Freitag.', priceCents: 2900 },
        { name: 'Obstkiste', description: 'Äpfel, Birnen, Pflaumen. Nur im Herbst.', priceCents: 1600 },
      ],
    },
    {
      name: 'Vom Hof',
      items: [
        { name: 'Kartoffeln, 5 kg', description: 'Festkochend, aus der Berkelaue.', priceCents: 750 },
        { name: 'Eier, 10 Stück', description: 'Von den Hühnern hinterm Stall.', priceCents: 420, allergens: ['egg'] },
        { name: 'Spargel, 1 kg', description: 'April bis Juni, morgens gestochen.', priceCents: 1400 },
        { name: 'Rohmilch, 1 l', description: 'Selbst abfüllen, Flasche mitbringen.', priceCents: 130, allergens: ['dairy'] },
      ],
    },
  ],
}

/**
 * Every menu, keyed by the slug of the partner it belongs to.
 *
 * The German ones are spread in from `DE_MENUS` above rather than written
 * inline here, so the two languages stay in one block each instead of
 * interleaving down a thousand lines.
 */
export const MENUS: Record<string, SeedMenuSection[]> = {
  ...DE_MENUS,

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

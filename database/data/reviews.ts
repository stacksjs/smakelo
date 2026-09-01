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
  /**
   * Who wrote it.
   *
   * Invented people reviewing invented restaurants, which is the only
   * combination this site allows. A review with no author renders as "Guest",
   * and a column of identical Guests is the tell of seed data nobody finished.
   */
  author: string
  title: string
  body: string
  dishes?: string
  ownerResponse?: string
  helpful?: number
}


/**
 * Reviews for the German partners.
 *
 * In German, and written by invented people about invented restaurants, which
 * is the only combination this site allows anywhere. Kept in their own block
 * rather than interleaved, so a translator or a proofreader has one place to
 * look.
 */
const DE_REVIEWS: Record<string, SeedReview[]> = {
  'zur-schwebenden-laterne': [
    {
      rating: 5,
      author: 'Meike Overath',
      title: 'Sauerbraten wie bei meiner Oma, nur besser',
      body: 'Fünf Tage eingelegt, und man schmeckt es. Die Soße war dunkel und süß-sauer, ohne dass sie in die eine oder andere Richtung kippt. Die Klöße kamen zu zweit, was reichlich war, und niemand hat komisch geguckt, als wir einen mitgenommen haben.',
      dishes: 'Rheinischer Sauerbraten, Reibekuchen',
      helpful: 14,
    },
    {
      rating: 4,
      author: 'Jonas Kremer',
      title: 'Eng, aber gemütlich',
      body: 'Das Haus ist schmal und die Tische stehen dicht. Am Samstagabend hört man das Gespräch nebenan mit. Essen war sehr gut, Bedienung freundlich und schnell. Montags ist zu, das steht auch dran.',
      dishes: 'Himmel un Ääd',
      ownerResponse: 'Danke Ihnen. Die zwei Tische am Fenster sind etwas ruhiger, einfach vorher anrufen.',
      helpful: 9,
    },
    {
      rating: 5,
      author: 'Ayşe Demirtaş',
      title: 'Das Gemüseschnitzel ist kein Trostpreis',
      body: 'Ich esse kein Fleisch und bin es gewohnt, in solchen Häusern die eine traurige Beilage zu bekommen. Hier nicht: Sellerieschnitzel, richtig paniert, mit einem Kartoffelsalat, der nach Essig und nicht nach Mayonnaise schmeckt.',
      dishes: 'Gemüseschnitzel',
      helpful: 22,
    },
  ],

  'ocakbasi-nordstadt': [
    {
      rating: 5,
      author: 'Deniz Yücel',
      title: 'Der Grill steht im Raum, und das merkt man',
      body: 'Man sitzt fünf Meter von der Holzkohle entfernt und riecht sein Essen, bevor es kommt. Adana mittel-scharf, Fladenbrot direkt aus dem Steinofen daneben. Die Linsensuppe gibt es auch um drei Uhr nachmittags, was selten ist.',
      dishes: 'Adana Kebap, Mercimek Çorbası',
      helpful: 31,
    },
    {
      rating: 4,
      author: 'Tobias Lehnert',
      title: 'Preis-Leistung stimmt',
      body: 'Zu zweit gegessen und getrunken für unter dreißig Euro. Das Beyti war gut, hätte etwas weniger Joghurt vertragen. Kommt aufs Handy in zwanzig Minuten, wenn man vorbestellt.',
      dishes: 'Beyti Sarma',
      helpful: 7,
    },
  ],

  'osteria-wupperbogen': [
    {
      rating: 5,
      author: 'Carla Bittner',
      title: 'Zwölf Nudeln und sonst nichts',
      body: 'Eine Karte, auf der nur Pasta steht, ist eine Ansage. Cacio e Pepe war cremig ohne Sahne, was den Unterschied macht. Die Portion Normal reicht, wenn man vorher Focaccia isst, und die sollte man.',
      dishes: 'Cacio e Pepe, Focaccia',
      helpful: 18,
    },
    {
      rating: 4,
      author: 'Sven Ahlbrecht',
      title: 'Reservieren',
      body: 'Ohne Tisch am Freitag geht nichts, wir standen zwanzig Minuten an der Tür. Als wir saßen, ging es schnell. Ragù nach vier Stunden schmeckt nach vier Stunden.',
      dishes: 'Ragù alla Bolognese',
      ownerResponse: 'Stimmt, freitags wird es eng. Online kann man ab zwei Wochen vorher buchen.',
      helpful: 11,
    },
  ],

  'kaffeehaus-nordbahn': [
    {
      rating: 5,
      author: 'Lena Poth',
      title: 'Nach der Trasse genau richtig',
      body: 'Mit dem Rad von Vohwinkel gekommen und hier Frühstück gemacht. Das Brett ist groß genug für zwei, wenn man nicht sehr hungrig ist. Draußen sitzen und den Leuten beim Fahren zusehen.',
      dishes: 'Frühstücksbrett, Flat White',
      helpful: 16,
    },
    {
      rating: 4,
      author: 'Robert Zilles',
      title: 'Kaffee sehr gut, Kuchen manchmal alle',
      body: 'Um vier war der Käsekuchen weg. Das steht so auch auf der Karte, insofern kein Vorwurf. Der Filterkaffee ist besser als der von den meisten Röstereien hier.',
      dishes: 'Filterkaffee',
      helpful: 5,
    },
  ],

  'bergischer-kaffeegarten': [
    {
      rating: 5,
      author: 'Ursula Brenner',
      title: 'Zwei Stunden, und die braucht man',
      body: 'Die vollständige Kaffeetafel mit Dröppelminna auf dem Tisch, so wie es sein soll. Waffeln mit heißen Kirschen kamen zweimal, weil wir gefragt haben. Man geht satt und langsam wieder raus.',
      dishes: 'Bergische Kaffeetafel',
      helpful: 27,
    },
    {
      rating: 5,
      author: 'Hendrik Vogel',
      title: 'Meine Schwiegereltern waren beeindruckt',
      body: 'Aus Hamburg zu Besuch und wollten etwas Bergisches. Das hier war die richtige Wahl. Der Rosinenstuten mit Butter ist unspektakulär und genau deswegen gut.',
      dishes: 'Bergische Kaffeetafel, Rosinenstuten',
      helpful: 13,
    },
  ],

  'baeckerei-morgenrot': [
    {
      rating: 5,
      author: 'Petra Salzmann',
      title: 'Das Sauerteigbrot hält wirklich eine Woche',
      body: 'Am Samstag gekauft, am Freitag noch gut. Kruste kräftig, Krume feucht. Ab sechs offen, das weiß ich seit ich Frühschicht habe.',
      dishes: 'Bergisches Sauerteigbrot',
      helpful: 19,
    },
    {
      rating: 4,
      author: 'Nils Kortenkamp',
      title: 'Samstags Schlange',
      body: 'Der Streuselkuchen ist um zehn meistens schon halb weg. Anstellen lohnt sich trotzdem. Brötchen sind solide, nichts Verrücktes.',
      dishes: 'Streuselkuchen vom Blech',
      helpful: 6,
    },
  ],

  'wupperschaenke': [
    {
      rating: 4,
      author: 'Marco Zeppenfeld',
      title: 'Acht Hähne, ein Bierdeckel',
      body: 'Die Karte passt tatsächlich auf einen Bierdeckel, und das ist keine Masche, sondern das ganze Konzept. Das obergärige Hausbier ist der Grund herzukommen. Mettbrötchen dazu, fertig.',
      dishes: 'Obergäriges Hausbier, Mettbrötchen',
      helpful: 12,
    },
  ],

  'gasthaus-glockenklang': [
    {
      rating: 5,
      author: 'Bernhard Terhorst',
      title: 'Töttchen, wie es sein muss',
      body: 'Man bekommt es außerhalb von Münster selten richtig. Hier schon: sauer genug, mit Brot zum Auftunken. Der Pfefferpotthast danach war ehrlich gepfeffert, kein Alibi.',
      dishes: 'Töttchen, Pfefferpotthast',
      helpful: 21,
    },
    {
      rating: 5,
      author: 'Gudrun Lammers',
      title: 'Spargelzeit',
      body: 'Im Mai hier gegessen, Spargel vom Hof nebenan, mit Pfannkuchen statt Kartoffeln. Die Bedienung hat gesagt, welcher Hof, was ich gut finde. Ansonsten ruhiges Haus, montags zu.',
      dishes: 'Münsterländer Spargel',
      ownerResponse: 'Der Spargel kommt vom Hof Berkelaue, drei Kilometer die Straße runter. Danke für die netten Worte.',
      helpful: 17,
    },
  ],

  'pizzeria-muehlenrad': [
    {
      rating: 5,
      author: 'Elif Baran',
      title: 'Sechzig Sekunden, und es stimmt',
      body: 'Rand luftig, Boden gefleckt, nicht labberig in der Mitte. Diavola mit Honig klingt komisch und ist es nicht. Sechs Tische, also besser abholen.',
      dishes: 'Diavola',
      helpful: 15,
    },
    {
      rating: 4,
      author: 'Frank Wielspütz',
      title: 'Abholen geht schneller als Liefern',
      body: 'Lieferung hat vierzig Minuten gedauert am Samstag, was für hier normal ist. Pizza war noch heiß. Ortolana für meine Tochter ohne Käse, ging problemlos.',
      dishes: 'Margherita, Ortolana',
      helpful: 8,
    },
  ],

  'kaffeescheune-berkelblick': [
    {
      rating: 5,
      author: 'Annegret Sühling',
      title: 'Butterkuchen um drei',
      body: 'Wenn man es um drei schafft, ist der Butterkuchen noch warm. Draußen an der Berkel sitzen, bis es zu kalt wird. Filterkaffee kommt in der Kanne, das mag ich.',
      dishes: 'Butterkuchen, Filterkaffee',
      helpful: 14,
    },
  ],

  'hofladen-berkelaue': [
    {
      rating: 5,
      author: 'Katrin Bösing',
      title: 'Kiste seit zwei Jahren',
      body: 'Freitags abholen, und man kocht danach, was drin ist, statt zu planen. Kohl kann man abwählen, was ich im Januar auch mache. Die Kartoffeln sind die besten, die ich hier bekomme.',
      dishes: 'Große Kiste, Kartoffeln',
      helpful: 24,
    },
    {
      rating: 4,
      author: 'Wilhelm Rottmann',
      title: 'Kurze Öffnungszeiten',
      body: 'Mittwochnachmittag, Freitag und Samstagvormittag. Wer arbeitet, muss es sich einteilen. Dafür weiß man, wo alles herkommt, und die Eier sind zwei Tage alt.',
      dishes: 'Eier, Rohmilch',
      helpful: 10,
    },
  ],
}

/** Every review, keyed by the slug of the partner it was left for. */
export const REVIEWS: Record<string, SeedReview[]> = {
  ...DE_REVIEWS,

  'aster-and-ash': [
    {
      rating: 5,
      author: 'Dana Whitlock',
      title: 'The branzino is worth the wait',
      body: 'Half an hour for a whole fish and they tell you that when you order, which I appreciated. It came out with the skin properly blistered and they filleted it at the table without making a performance of it. The flatbread beforehand is dangerous - we ordered a second.',
      dishes: 'Whole branzino, wood-fired flatbread',
      helpful: 12,
    },
    {
      rating: 4,
      author: 'Marcus Bell',
      title: 'Loud, but good loud',
      body: 'Sat near the fire on a Friday and could not really hear across the table. Food was excellent, service was quick without rushing us. Would come back on a weeknight.',
      dishes: 'Half chicken, coal-roasted carrots',
      ownerResponse: 'Thanks for this - the room does carry on a Friday. The two tables along the west wall are quieter if you want to ask for one next time.',
      helpful: 8,
    },
    {
      rating: 5,
      author: 'Yuki Tanaka',
      title: 'Carrots. Carrots!',
      body: 'I did not expect to be writing a review about carrots but here we are. Dukkah, yoghurt, honey, and they somehow taste more like carrots than carrots do.',
      dishes: 'Coal-roasted carrots',
      helpful: 21,
    },
  ],

  'marisol-cocina': [
    {
      rating: 5,
      author: 'Aisha Rahman',
      title: 'The mole is the real thing',
      body: 'Three days of work and you can taste every one of them. Deep and a little bitter in the way a good mole should be. Ask for extra tortillas, you will want them.',
      dishes: 'Mole negro',
      helpful: 34,
    },
    {
      rating: 5,
      author: 'Peter Lindqvist',
      title: 'Masa ground on site and it shows',
      body: 'The tortillas alone are worth the trip. Ordered carnitas and hongos tacos and the mushroom ones were better, which surprised everyone at the table including me.',
      dishes: 'Tacos (carnitas, hongos)',
      helpful: 17,
    },
    {
      rating: 4,
      author: 'Rosa Iglesias',
      title: 'Small room, go early',
      body: 'Twenty minute wait at seven on a Tuesday. Worth it, but go at six if you can. The horchata is made properly, not from a mix.',
      dishes: 'Tlayuda, horchata',
      helpful: 6,
    },
  ],

  'little-bird-ramen': [
    {
      rating: 5,
      author: 'Tom Okafor',
      title: 'Best paitan I have had outside Japan',
      body: 'Genuinely. The broth has that thickness that only comes from actually cooking it that long, and the confit thigh falls apart. Twelve seats so expect to wait, and it moves fast.',
      dishes: 'Chicken paitan, extra ajitama',
      helpful: 41,
    },
    {
      rating: 4,
      author: '清 Nakamura',
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
      author: 'Elena Fischer',
      title: 'No laptops after eleven is a public service',
      body: 'The rule is on a small sign and they enforce it kindly. The room actually functions as a cafe as a result. Cortado was dialled in both times I went.',
      dishes: 'Cortado, morning bun',
      helpful: 28,
    },
    {
      rating: 4,
      author: 'Sam Whitfield',
      title: 'One origin at a time',
      body: 'If you like choosing, this is not your place. If you like someone else having chosen well, it very much is. The filter changed between my two visits and both were good.',
      dishes: 'Filter coffee',
      helpful: 9,
    },
  ],

  'the-salted-anchor': [
    {
      rating: 4,
      author: 'Nadia Haddad',
      title: 'Chips in beef fat, as promised',
      body: 'They are not lying on the menu and it makes a real difference. Raw bar was fresh, oysters shucked in front of you. A little pricey for what it is but the quality is there.',
      dishes: 'Oysters, chips',
      helpful: 11,
    },
  ],

  'nonna-pia': [
    {
      rating: 5,
      author: 'Joon-ho Park',
      title: 'Twelve pastas and no distractions',
      body: 'A menu with one thing on it done properly beats a menu with forty. Rolled that morning and it tastes like it. No starters, no mains, just pasta and a short wine list.',
      dishes: 'Cacio e pepe',
      helpful: 19,
    },
    {
      rating: 4,
      author: 'Bea Castellanos',
      title: 'Go with someone who shares',
      body: 'Portions are honest rather than huge, which means you can have two between two people and try more. That is clearly the intent.',
      helpful: 7,
    },
  ],

  'golden-hour-diner': [
    {
      rating: 4,
      author: 'Owen Pryce',
      title: 'Breakfast at four in the afternoon',
      body: 'Which is the entire point. Pancakes really are the size of the plate. Coffee is diner coffee and I mean that as a compliment.',
      dishes: 'Pancakes, eggs over easy',
      helpful: 13,
    },
  ],

  'saffron-and-sumac': [
    {
      rating: 5,
      author: 'Marta Nowak',
      title: 'The bread arrives still puffed',
      body: 'Straight from the oven to the table, inflated, and it deflates while you watch. Order more mezze than you think you need and skip the skewers if you must choose.',
      dishes: 'Mezze spread, bread',
      helpful: 22,
    },
  ],

  'ember-coffee-roasters': [
    {
      rating: 5,
      author: 'Kwame Mensah',
      title: 'Bags still warm',
      body: 'Roasting happens at the back while you drink, which is either charming or distracting depending on your mood. Took a bag home the same day it was roasted.',
      dishes: 'Cortado',
      helpful: 10,
    },
  ],

  'cardoon-farm': [
    {
      rating: 5,
      author: 'Ingrid Solberg',
      title: 'The box has changed how we cook',
      body: 'You get what is ready rather than what you chose, and after a month of that I am cooking things I would never have bought. Add the eggs.',
      dishes: 'Family share, eggs',
      helpful: 26,
    },
    {
      rating: 4,
      author: 'Luca Ferrari',
      title: 'Small share is right for two',
      body: 'We tried the family share first and wasted some of it. The small share is the right size for two people who cook most nights.',
      ownerResponse: 'Appreciated - we would rather you finish a small box than compost half a big one. Happy to switch anyone over mid-season.',
      helpful: 14,
    },
  ],

  'two-crows-orchard': [
    {
      rating: 5,
      author: 'Priya Raman',
      title: 'Stone fruit that tastes like something',
      body: 'Picked ripe because it only travels an hour, and the difference against a supermarket peach is not subtle. Seasonal, so check before you make the trip.',
      dishes: 'White peaches',
      helpful: 18,
    },
  ],

  'the-slow-pour': [
    {
      rating: 4,
      author: 'Hal Bergstrom',
      title: 'Newspaper on a stick',
      body: 'An actual newspaper, on an actual stick. Filter coffee and sourdough toast and nowhere to plug in a laptop, which seems deliberate.',
      dishes: 'Filter, sourdough toast',
      helpful: 16,
    },
  ],
}

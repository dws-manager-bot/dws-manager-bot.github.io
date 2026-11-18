import type { MapPin, Place, Route } from '../types'

/**
 * Season 6 (Ragnarok) — map buildings and positions.
 *
 * Map image: public/s6/map.webp (1740 x 1655, community map, credit State 69 / namnam).
 * Pins are percent of that image (x: west → east, y: north → south).
 *
 * How the pins were made (2026-11-14): colour detection on the map image, checked against
 * in-game coordinates from the manual screenshots (capture/manual-s6-screenshots/):
 *   blue blocks = Ancient Temples (Lv.1 ×4, Lv.2 ×4, Lv.3 ×2), green "6" = Judgement Altars (×4),
 *   orange "1–3" = Outposts (×28), olive "3–5" = Fortresses (×63), red road marks = Passes (×24).
 * In-game X:Y run 0–1000; x% ≈ X / 10, y% ≈ (1000 − Y) / 10.
 * Checked: Supreme Temple X:500 Y:501, Lv.3 Ancient Temple I X:499 Y:425, Lv.2 Ancient Temple I
 * X:224 Y:675, a Lv.6 Altar X:399 Y:398, a Lv.2 Outpost X:324 Y:528.
 */
export const s6Pins = {
  throne: { x: 50, y: 50 },
  // Ancient Temples
  temple1N: { x: 43.1, y: 9.1 },
  temple1E: { x: 91.0, y: 42.7 },
  temple1W: { x: 8.8, y: 57.1 },
  temple1S: { x: 56.7, y: 90.7 },
  temple2NE: { x: 66.2, y: 23.5 },
  temple2NW: { x: 23.6, y: 32.8 },
  temple2SE: { x: 76.1, y: 66.9 },
  temple2SW: { x: 33.8, y: 76.3 },
  temple3N: { x: 50.1, y: 42.4 },
  temple3S: { x: 49.9, y: 57.2 },
  // Judgement Altars (Lv.6)
  altarNW: { x: 40.8, y: 40.2 },
  altarNE: { x: 59.1, y: 40.2 },
  altarSW: { x: 40.8, y: 59.6 },
  altarSE: { x: 59.1, y: 59.6 },
} satisfies Record<string, MapPin>

const P = s6Pins

const outposts: MapPin[] = [
  { x: 4.3, y: 4.3 }, { x: 38.3, y: 4.3 }, { x: 47.9, y: 4.3 }, { x: 95.5, y: 4.3 }, { x: 80.5, y: 14.0 }, { x: 13.4, y: 19.2 }, { x: 23.1, y: 19.1 },
  { x: 47.5, y: 19.1 }, { x: 80.7, y: 23.3 }, { x: 47.6, y: 33.1 }, { x: 95.6, y: 37.7 }, { x: 65.7, y: 47.6 }, { x: 80.7, y: 47.6 }, { x: 95.6, y: 47.9 },
  { x: 4.3, y: 52.0 }, { x: 19.0, y: 52.1 }, { x: 34.9, y: 52.0 }, { x: 4.3, y: 62.2 }, { x: 52.1, y: 66.6 }, { x: 19.0, y: 76.4 }, { x: 52.4, y: 80.4 },
  { x: 76.4, y: 80.4 }, { x: 86.5, y: 80.4 }, { x: 20.4, y: 85.7 }, { x: 4.3, y: 95.4 }, { x: 51.8, y: 95.4 }, { x: 61.6, y: 95.3 }, { x: 95.5, y: 95.5 },
]

const fortresses: MapPin[] = [
  { x: 11.1, y: 11.6 }, { x: 16.2, y: 11.7 }, { x: 21.2, y: 11.5 }, { x: 25.8, y: 11.5 }, { x: 31.0, y: 11.5 }, { x: 36.0, y: 11.6 }, { x: 49.8, y: 11.6 },
  { x: 54.5, y: 11.5 }, { x: 59.0, y: 11.6 }, { x: 63.9, y: 11.9 }, { x: 68.9, y: 11.6 }, { x: 73.8, y: 11.9 }, { x: 88.7, y: 11.6 }, { x: 88.8, y: 16.4 },
  { x: 26.2, y: 20.6 }, { x: 36.1, y: 21.0 }, { x: 45.2, y: 21.1 }, { x: 54.5, y: 21.0 }, { x: 88.7, y: 21.4 }, { x: 10.9, y: 25.8 }, { x: 78.4, y: 25.9 },
  { x: 88.7, y: 25.7 }, { x: 10.9, y: 30.5 }, { x: 88.7, y: 30.6 }, { x: 10.9, y: 35.3 }, { x: 78.3, y: 35.6 }, { x: 88.7, y: 35.6 }, { x: 10.9, y: 39.9 },
  { x: 10.9, y: 45.0 }, { x: 21.5, y: 45.2 }, { x: 78.4, y: 45.1 }, { x: 10.9, y: 49.7 }, { x: 88.7, y: 50.3 }, { x: 21.4, y: 54.5 }, { x: 78.4, y: 54.8 },
  { x: 88.7, y: 54.8 }, { x: 88.7, y: 59.6 }, { x: 10.9, y: 64.3 }, { x: 21.3, y: 64.3 }, { x: 88.7, y: 64.0 }, { x: 10.9, y: 69.0 }, { x: 88.7, y: 69.1 },
  { x: 10.9, y: 73.8 }, { x: 21.5, y: 73.6 }, { x: 88.7, y: 73.8 }, { x: 10.9, y: 78.6 }, { x: 40.7, y: 78.6 }, { x: 49.8, y: 78.9 }, { x: 63.7, y: 78.6 },
  { x: 73.8, y: 78.7 }, { x: 11.0, y: 83.6 }, { x: 10.9, y: 88.1 }, { x: 26.2, y: 88.1 }, { x: 31.0, y: 88.2 }, { x: 36.4, y: 88.1 }, { x: 40.8, y: 88.2 },
  { x: 45.2, y: 88.2 }, { x: 49.6, y: 87.9 }, { x: 69.3, y: 88.0 }, { x: 74.0, y: 88.2 }, { x: 78.3, y: 88.2 }, { x: 83.4, y: 88.1 }, { x: 88.7, y: 88.4 },
]

const passes: MapPin[] = [
  { x: 83.5, y: 3.4 }, { x: 4.1, y: 16.9 }, { x: 28.5, y: 16.9 }, { x: 56.9, y: 16.9 }, { x: 40.8, y: 23.5 }, { x: 83.5, y: 28.3 }, { x: 38.5, y: 30.1 },
  { x: 56.7, y: 30.1 }, { x: 68.7, y: 37.9 }, { x: 76.1, y: 40.3 }, { x: 16.4, y: 42.6 }, { x: 31.1, y: 42.6 }, { x: 68.7, y: 57.0 }, { x: 83.6, y: 56.9 },
  { x: 23.5, y: 59.5 }, { x: 31.1, y: 61.8 }, { x: 43.1, y: 69.8 }, { x: 61.3, y: 69.7 }, { x: 16.4, y: 71.4 }, { x: 59.0, y: 76.2 }, { x: 43.1, y: 82.9 },
  { x: 71.3, y: 82.9 }, { x: 95.7, y: 82.8 }, { x: 16.4, y: 95.9 },
]

/**
 * The 8 road marks numbered "1" on the community map: one exit from each Camp Base into the Land of
 * Strife (marks "2" sit between neighbouring Camp Bases = Camp Passes; "3"/"4" are inner passes).
 */
const baseExits: MapPin[] = [
  { x: 28.5, y: 16.9 }, { x: 56.9, y: 16.9 }, { x: 83.5, y: 28.3 }, { x: 83.6, y: 56.9 },
  { x: 71.3, y: 82.9 }, { x: 43.1, y: 82.9 }, { x: 16.4, y: 71.4 }, { x: 16.4, y: 42.6 },
]

/** Zone rectangles: the outer band is the 8 Camp Bases; the middle square is the Temple Throne. */
const campBand = [
  { x: 0, y: 0, w: 100, h: 14 },
  { x: 0, y: 86, w: 100, h: 14 },
  { x: 0, y: 14, w: 14, h: 72 },
  { x: 86, y: 14, w: 14, h: 72 },
]
const throneArea = { x: 31, y: 30, w: 38, h: 40 }
const strifeRing = [
  { x: 14, y: 14, w: 72, h: 16 },
  { x: 14, y: 70, w: 72, h: 16 },
  { x: 14, y: 30, w: 17, h: 40 },
  { x: 69, y: 30, w: 17, h: 40 },
]

export const s6Places: Place[] = [
  /* ---------------- Map zones (in-game names) ---------------- */
  {
    id: 'camp-base',
    name: 'Camp Base',
    aka: ['camp base', 'camp bases', 'Camp Bases', 'Camp Base 1', 'Camp Base 2'],
    group: 'Zone',
    what: 'The home zone of a camp. There are 8, numbered No.1 to No.8 around the edge of the map.',
    where: 'The outer band of the map, two camps on each side (No.1–2 north, No.3–4 east, No.5–6 south, No.7–8 west). Each camp holds one corner.',
    whereStatus: 'fact',
    areas: campBand,
    image: { src: '/s6/season-map-camps.webp', alt: 'Season Map: 8 camps', caption: 'In-game Season Map: the 8 Camp Bases.', source: 's6-manual' },
    facts: [
      { text: 'The first target of a camp must be a Lv.1 Camp Outpost in its Camp Base.', status: 'fact', source: 's6-outpost' },
      { text: 'The Camp Spawn Area is the part of the Camp Base where the Lv.1 Outpost is.', status: 'fact', source: 's6-manual' },
    ],
  },
  {
    id: 'land-of-strife',
    name: 'Land of Strife',
    group: 'Zone',
    what: 'The middle ring that connects all camps. Most Fortresses, Outposts and the Lv.1–2 Ancient Temples are here.',
    where: 'Between the Camp Bases and the Temple Throne.',
    whereStatus: 'fact',
    areas: strifeRing,
    image: { src: '/s6/season-map-strife.webp', alt: 'Season Map: Land of Strife', caption: 'In-game Season Map: the Land of Strife.', source: 's6-manual' },
    facts: [{ text: 'The game calls it a strategic hub that connects all camps.', status: 'fact', source: 's6-manual' }],
  },
  {
    id: 'temple-throne-zone',
    name: 'Temple Throne',
    aka: ['Throne'],
    group: 'Zone',
    what: 'The center zone. The Supreme Temple, the Lv.3 Ancient Temples and the 4 Judgement Altars are here.',
    where: 'The middle square of the map.',
    whereStatus: 'fact',
    areas: [throneArea],
    image: { src: '/s6/season-map-throne.webp', alt: 'Season Map: Temple Throne', caption: 'In-game Season Map: the Temple Throne.', source: 's6-manual' },
    facts: [
      { text: 'Divine Passes lead into it.', status: 'fact', source: 's6-manual' },
      { text: 'The game says that camps fight for the Altar here.', status: 'fact', source: 's6-manual' },
    ],
  },

  /* ---------------- Season stages (the in-game season bar) ---------------- */
  {
    id: 'stage-kickoff',
    name: 'Kickoff stage',
    group: 'Stage',
    what: 'Day 1–15. Take your first Outposts and Fortresses inside your Camp Base.',
    where: 'Your Camp Base.',
    whereStatus: 'fact',
    areas: campBand,
    facts: [{ text: 'Kickoff is Day 1 on the in-game season bar.', status: 'fact', source: 's6-manual' }],
  },
  {
    id: 'stage-invade',
    name: 'Invade stage',
    group: 'Stage',
    what: 'Day 16–38. Passes open. Camps can attack the next camp and take the Land of Strife.',
    where: 'The Land of Strife and the next Camp Bases.',
    whereStatus: 'fact',
    areas: strifeRing,
    facts: [{ text: 'From Day 16, camps can invade adjacent enemy Camp Bases.', status: 'fact', source: 's6-season' }],
  },
  {
    id: 'stage-altar',
    name: 'Altar stage',
    group: 'Stage',
    what: 'Day 39–47. The Judgement Altars open. War on them only on Thursday, 12:00–13:00.',
    where: 'The Temple Throne.',
    whereStatus: 'fact',
    areas: [throneArea],
    facts: [{ text: 'Altars become contestable from Week 6 (Day 39 is the Week 6 Thursday).', status: 'fact', source: 's6-manual' }],
  },
  {
    id: 'stage-showdown',
    name: 'Showdown stage',
    group: 'Stage',
    what: 'Day 48–50. The last fights before the tally on Day 51.',
    where: 'The Temple Throne.',
    whereStatus: 'inferred',
    areas: [throneArea],
    facts: [
      { text: 'Showdown is Day 48 and the Tally is Day 51 on the in-game season bar.', status: 'fact', source: 's6-manual' },
      { text: 'The 8 camps meet at the Supreme Temple at the end.', status: 'fact', source: 's6-manual' },
    ],
  },

  /* ---------------- Key objectives ---------------- */
  {
    id: 'supreme-temple',
    name: 'Supreme Temple',
    group: 'Key objective',
    what: 'The final Temple Contest. It ranks all 8 camps and gives the most Mithril: 2500 to rank 1.',
    where: 'The center of the map.',
    whereStatus: 'fact',
    coords: 'X:500 Y:501',
    pins: [P.throne],
    image: { src: '/s6/places/supreme-temple.webp', alt: 'Supreme Temple', caption: 'Supreme Temple (X:500 Y:501).', source: 's6-manual' },
    facts: [
      { text: 'Camp rank Mithril: 2500, 1200, 1000, 800, 600, 450, 300, 200 (rank 1–8).', status: 'fact', source: 's6-rankings' },
      { text: 'Only designated camps can enter a Temple Contest area while it runs.', status: 'fact', source: 's6-manual' },
    ],
  },
  {
    id: 'ancient-temple',
    name: 'Ancient Temple',
    aka: ['Ancient Temples', 'Lv.1 Ancient Temple', 'Lv.2 Ancient Temple', 'Lv.3 Ancient Temple'],
    group: 'Key objective',
    what: 'Temple Contest sites. The game opens them in phases and names the camps that may fight for each one.',
    where: 'Lv.1 ×4 at the edge, Lv.2 ×4 in the Land of Strife, Lv.3 ×2 next to the Supreme Temple.',
    whereStatus: 'fact',
    pins: [P.temple1N, P.temple1E, P.temple1W, P.temple1S, P.temple2NE, P.temple2NW, P.temple2SE, P.temple2SW, P.temple3N, P.temple3S],
    image: { src: '/s6/places/ancient-temple.webp', alt: 'Lv.3 Ancient Temple', caption: 'Lv.3 Ancient Temple I (X:499 Y:425).', source: 's6-manual' },
    extraImage: { src: '/s6/season-map-temples.webp', alt: 'Season Map: Temple Contest', caption: 'In-game Season Map: Temple Contest sites.', source: 's6-manual' },
    facts: [
      { text: 'Camp rank 1 Mithril: Lv.1 = 180, Lv.2 = 320, Lv.3 = 900.', status: 'fact', source: 's6-rankings' },
      { text: 'At 100% Capture Progress, the camp holds the Temple. After 90 minutes with no owner, a 30-minute Brawl Phase triples progress.', status: 'fact', source: 's6-data' },
      { text: 'After a contest, Temple Blessing Chests appear nearby. All survivors can send troops to claim them.', status: 'fact', source: 's6-manual' },
    ],
  },
  {
    id: 'judgement-altar',
    name: 'Judgement Altar',
    aka: ['Judgement Altars', 'Altar', 'Altars'],
    group: 'Key objective',
    what: 'A Lv.6 territory that makes 300 Mithril each week, the most of any building.',
    where: 'Four, at the corners of the Temple Throne.',
    whereStatus: 'fact',
    pins: [P.altarNW, P.altarNE, P.altarSW, P.altarSE],
    image: { src: '/s6/places/judgement-altar.webp', alt: 'Judgement Altar', caption: 'A Lv.6 Judgement Altar (X:399 Y:398).', source: 's6-manual' },
    facts: [
      { text: 'Contestable from Week 6. War Declarations on Altars only on Thursday, 12:00–13:00.', status: 'fact', source: 's6-manual' },
      { text: 'A War on an Altar uses a War Declaration Attempt.', status: 'fact', source: 's6-manual' },
      { text: 'Weekly output: 300 Mithril.', status: 'fact', source: 's6-rankings' },
    ],
  },

  /* ---------------- Territories ---------------- */
  {
    id: 'fortress',
    name: 'Fortress',
    aka: ['Fortresses', 'Lv.3 Fortress', 'Lv.4 Fortress', 'Lv.5 Fortress', 'Camp Fortress'],
    group: 'City',
    what: 'The weekly Mithril territory. Lv.3, 4 and 5 make 20, 60 and 100 each Monday.',
    where: 'In every Camp Base and across the Land of Strife (63 on the map).',
    whereStatus: 'fact',
    pins: fortresses,
    image: { src: '/s6/places/fortress-lv3.webp', alt: 'Lv.3 Fortress', caption: 'A Lv.3 Fortress.', source: 's6-manual' },
    facts: [
      { text: 'If an enemy camp breaches it, it is destroyed for the season. The enemy camp receives 200% of its weekly Mithril.', status: 'fact', source: 's6-manual' },
      { text: 'A destroyed Fortress becomes ruins. Nobody can declare war on it or teleport into its area.', status: 'fact', source: 's6-manual' },
      { text: 'A War Plan on a Fortress uses a War Declaration Attempt (1 each day).', status: 'fact', source: 's6-manual' },
    ],
  },
  {
    id: 'outpost',
    name: 'Outpost',
    aka: ['Outposts', 'Camp Outpost', 'Camp Outposts', 'Lv.1 Camp Outpost'],
    group: 'City',
    what: 'The connector territory (Lv.1–3). It links camp territory and moves the front line. It makes no Mithril.',
    where: 'In every Camp Base and in the Land of Strife (28 on the map).',
    whereStatus: 'fact',
    pins: outposts,
    image: { src: '/s6/places/outpost-lv2.webp', alt: 'Lv.2 Outpost', caption: 'A Lv.2 Outpost (X:324 Y:528).', source: 's6-manual' },
    extraImage: { src: '/s6/places/outpost.webp', alt: 'Camp Outpost', caption: 'Lv.1 Camp Outpost (official post).', source: 's6-outpost' },
    facts: [
      { text: 'A Challenge on an Outpost uses a Challenge Attempt (3 each day).', status: 'fact', source: 's6-manual' },
      { text: 'A new owner starts an 8-hour truce.', status: 'fact', source: 's6-outpost' },
    ],
  },

  /* ---------------- Map objects ---------------- */
  {
    id: 'pass',
    name: 'Pass',
    aka: ['Passes', 'Expedition Pass', 'Expedition Passes', 'Dawn Pass', 'Strife Pass', 'Divine Pass', 'Divine Passes', 'Camp Pass', 'Camp Passes'],
    group: 'Map object',
    what: 'A gate on a road. It opens on a set day. In S6 nobody can capture it.',
    where: 'On the roads between zones (24 on the map): Expedition, Dawn, Strife, Divine and Camp Passes.',
    whereStatus: 'inferred',
    pins: passes,
    image: { src: '/s6/places/divine-pass.webp', alt: 'Divine Pass', caption: 'A Divine Pass on the road into the Temple Throne.', source: 's6-manual' },
    facts: [
      { text: 'When a Pass is closed, no troops can go through.', status: 'fact', source: 's6-manual' },
      { text: 'When it opens, all camp members can go through. A Camp Pass is open only to its own camp.', status: 'fact', source: 's6-manual' },
      { text: 'While a Pass is closed, nobody can Challenge Outposts on the other side.', status: 'fact', source: 's6-manual' },
    ],
  },
  {
    id: 'merchant-guild',
    name: 'Merchant Guild',
    aka: ['Merchant Guilds', 'Trade Post', 'Trade Posts', 'Origin Merchant Guild'],
    group: 'Map object',
    what: 'A shop on the map (Lv.1–3). One survivor wins it in the Trade Post Race and becomes Governor.',
    where: 'In many Camp Base and Land of Strife tiles.',
    whereStatus: 'fact',
    image: { src: '/s6/places/merchant-guild-lv3.webp', alt: 'Merchant Guild', caption: 'A Lv.3 Merchant Guild.', source: 's6-manual' },
    extraImage: { src: '/s6/places/merchant-guild.webp', alt: 'Merchant Guild shop', caption: 'Merchant Guild shop.', source: 's6-data' },
    facts: [
      { text: 'The first contest is on Monday of Week 2 at 12:00, then every 7 days. Each contest lasts 1 hour.', status: 'fact', source: 's6-merchant' },
      { text: 'The first contest is inside your camp only. Later contests are open to all camps.', status: 'fact', source: 's6-merchant' },
      { text: 'Its 50×50 area is a War Penalty Zone: attacks on shelters there do more harm.', status: 'fact', source: 's6-merchant' },
    ],
  },

  /* ---------------- Your buildings ---------------- */
  {
    id: 'obelisk',
    name: 'Obelisk',
    group: 'Your buildings',
    what: 'Gives Curse Resistance. Holy Water upgrades it. Same building and values as S5.',
    where: 'A season building in your base.',
    whereStatus: 'fact',
    image: { src: '/s6/places/obelisk.webp', alt: 'Obelisk', caption: 'Obelisk (same building as S5).', source: 's6-data' },
    extraImage: { src: '/s6/places/obelisk-upgrade.webp', alt: 'Obelisk Lv.8 upgrade screen', caption: 'S6 Obelisk Lv.8 → 9: Curse Resistance 1,250 → 1,500, cost 209K Holy Water.', source: 's6-data' },
    facts: [
      { text: 'Lv.8 → Lv.9: Curse Resistance 1,250 → 1,500. Cost 209K Holy Water. Same values as S5.', status: 'fact', source: 's6-data' },
      { text: 'Growth Rebate: Obelisk Lv.20, 25 and 30 give 200, 300 and 500 medals.', status: 'fact', source: 's6-rebate' },
    ],
  },
  {
    id: 'holy-altar',
    name: 'Holy Altar',
    aka: ['Holy Altar I', 'Holy Altar II', 'Holy Altar III', 'Holy Altar IV', 'Holy Altars'],
    group: 'Your buildings',
    what: 'Makes Holy Water. Same building as S5, but S6 has four: Holy Altar I to IV. Their levels give Season Medals.',
    where: 'A season building in your base.',
    whereStatus: 'fact',
    image: { src: '/s6/places/holy-altar.webp', alt: 'Holy Altar', caption: 'Holy Altar (same building as S5).', source: 's6-rebate' },
    extraImage: { src: '/s6/places/holy-altar-rebate.webp', alt: 'Growth Rebate list', caption: 'S6 Growth Rebate tasks for Holy Altar I.', source: 's6-rebate' },
    facts: [{ text: 'Holy Altar I to Lv.30 gives 1,500 Season Medals.', status: 'fact', source: 's6-rebate' }],
  },
  {
    id: 'portal-gate',
    name: 'Portal Gate',
    aka: ['Defunct Portal Gate'],
    group: 'Your buildings',
    what: 'A season building ("Defunct Portal Gate"). Each level gives March Speed.',
    where: 'A season building in your base.',
    whereStatus: 'reported',
    image: { src: '/s6/places/portal-gate.webp', alt: 'Defunct Portal Gate', caption: 'Defunct Portal Gate Lv.3: March Speed +1.5%.', source: 's6-data' },
    facts: [{ text: 'Lv.3 gives March Speed 3% → 4.5%. Cost 7.5M Holy Water.', status: 'reported', source: 's6-data' }],
  },
  {
    id: 'statue-of-carnage',
    name: 'Statue of Carnage',
    group: 'Your buildings',
    what: 'New in S6. Each level gives Season Troop DMG +1%.',
    where: 'A season building in your base.',
    whereStatus: 'reported',
    image: { src: '/s6/places/statue-of-carnage.webp', alt: 'Statue of Carnage', caption: 'Statue of Carnage Lv.4 upgrade screen.', source: 's6-data' },
    facts: [{ text: 'It costs Obsidian and Holy Water.', status: 'reported', source: 's6-data' }],
  },
]

/**
 * The 8 Camp Bases (layout of the in-game Season Map, a pinwheel: each camp holds one corner):
 * No.1 NW corner + north, No.2 north, No.3 NE corner + east, No.4 east, No.5 SE corner + south,
 * No.6 south, No.7 SW corner + west, No.8 west. `base` is a point inside the band; colours are the camp colours
 * of the in-game Season Map (`ink` = number colour that is readable on it).
 */
export const s6Camps = [
  { camp: 'No.1', base: { x: 21, y: 6 }, color: '#e0524f', ink: '#ffffff' },
  { camp: 'No.2', base: { x: 63, y: 6 }, color: '#ec8434', ink: '#ffffff' },
  { camp: 'No.3', base: { x: 94, y: 22 }, color: '#f2c635', ink: '#1c1917' },
  { camp: 'No.4', base: { x: 94, y: 64 }, color: '#93cf46', ink: '#1c1917' },
  { camp: 'No.5', base: { x: 78, y: 94 }, color: '#2fb27a', ink: '#ffffff' },
  { camp: 'No.6', base: { x: 38, y: 94 }, color: '#2f9fd4', ink: '#ffffff' },
  { camp: 'No.7', base: { x: 6, y: 77 }, color: '#4466d6', ink: '#ffffff' },
  { camp: 'No.8', base: { x: 6, y: 35 }, color: '#9b55d4', ink: '#ffffff' },
]

const dist = (a: MapPin, b: MapPin) => Math.hypot(a.x - b.x, a.y - b.y)
const nearest = (list: MapPin[], from: MapPin) => list.reduce((best, p) => (dist(p, from) < dist(best, from) ? p : best))
/** Distance from the map edge in percent (the Camp Base band is < 14). */
const edge = (p: MapPin) => Math.min(p.x, p.y, 100 - p.x, 100 - p.y)

/**
 * One route for each camp, computed from the measured pins: the nearest Lv.1 Camp Outpost, the
 * camp's exit Pass, a Fortress between them, the nearest Lv.2 Ancient Temple, the nearest Judgement
 * Altar, then the Supreme Temple. The ORDER is a fact; the exact buildings
 * are our choice (nearest), so the place labels stay `inferred` where the position is.
 */
export const s6Routes: Route[] = s6Camps.map(({ camp, base, color, ink }) => {
  const pass = nearest(baseExits, base)
  // Lv.1 Camp Outposts sit at the map edge; take the one nearest the camp's exit, so the line goes forward.
  const outpost = nearest(outposts.filter((p) => edge(p) < 7), { x: (base.x * 2 + pass.x) / 3, y: (base.y * 2 + pass.y) / 3 })
  const fortress = nearest(fortresses, { x: (base.x + pass.x) / 2, y: (base.y + pass.y) / 2 })
  const temple2 = nearest([P.temple2NE, P.temple2NW, P.temple2SE, P.temple2SW], pass)
  const altar = nearest([P.altarNW, P.altarNE, P.altarSW, P.altarSE], temple2)
  return {
    id: `camp-${camp}`,
    camp,
    side: 'West',
    color,
    ink,
    steps: [
            { placeId: 'outpost', label: 'Lv.1 Camp Outpost', when: 'Day 1', pin: outpost },
      { placeId: 'fortress', label: 'Fortress (weekly Mithril)', when: 'Week 1', pin: fortress },
      { placeId: 'pass', label: 'Pass into the Land of Strife', when: 'Day 16', pin: pass },
      { placeId: 'ancient-temple', label: 'Lv.2 Ancient Temple', when: 'When your camp is named', pin: temple2 },
      { placeId: 'judgement-altar', label: 'Judgement Altar', when: 'Day 39, Thursday', pin: altar },
      { placeId: 'supreme-temple', label: 'Supreme Temple', when: 'Showdown, Day 48', pin: P.throne },
    ],
  }
})

export const s6RouteNote =
  'Choose your camp. The order is a fact; the buildings are the nearest ones to your Camp Base. Lines show the order, not the road.'

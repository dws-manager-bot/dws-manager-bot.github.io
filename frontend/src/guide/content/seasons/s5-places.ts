import type { MapPin, Place, Route } from '../types'

/**
 * Season 5 buildings and map objects, with images and map positions.
 * Pins are percent positions on /s5/map-community.webp (x: west→east, y: north→south).
 *
 * IMPORTANT: no official source labels the positions of Strife Pass, Sands Fortress and Temple
 * Fortress. Each has a West and an East part and is a Pass (Gate). Players call the Strife Pass the
 * "Lv.4 Gate" (HCB chat, 2026): the pins use the two Lv.4 Gates in the middle of the outer columns.
 * Sands and Temple pins are our reading of the community map (Lv.5 Gates, Lv.6 Gates on the ring).
 * All are labelled `inferred`. Correct them here when a player gives in-game coordinates
 * ("Go View" button on the event screen).
 */

/** Pins shared by places and routes. */
export const s5Pins = {
  capital: { x: 50.6, y: 49.3 },
  templeW: { x: 41.2, y: 56.3 },
  templeE: { x: 60.2, y: 45.1 },
  sandsW: { x: 30.0, y: 40.3 },
  sandsE: { x: 71.4, y: 60.1 },
  strifeW: { x: 14.9, y: 50.0 },
  strifeE: { x: 85.7, y: 49.4 },
  borderNW: { x: 22.7, y: 26.2 },
  borderNE: { x: 78.1, y: 26.2 },
  borderSW: { x: 24.0, y: 73.8 },
  borderSE: { x: 80.0, y: 73.8 },
  anubisW: { x: 22, y: 12 },
  anubisE: { x: 78, y: 12 },
  horusW: { x: 22, y: 88 },
  horusE: { x: 78, y: 88 },
} satisfies Record<string, MapPin>

const P = s5Pins

export const s5Places: Place[] = [
  // ---------------- Map zones ----------------
  {
    id: 'camp-base',
    name: 'Camp base',
    aka: ['camp base', 'camp bases', 'Camp bases'],
    group: 'Zone',
    what: 'The start zone of each camp: Lv.1–2 Pyramids and oases.',
    where: 'The top band (Anubis) and the bottom band (Horus) of the map.',
    whereStatus: 'fact',
    areas: [
      { x: 2.5, y: 2.5, w: 95, h: 23.3 },
      { x: 2.5, y: 74.5, w: 95, h: 23.2 },
    ],
    facts: [
      { text: 'Build your Alliance Center here. Only Lv.1–2 territory permits it.', status: 'fact', source: 'alliance-center' },
      { text: 'Days 1–12 of the season are in the camp base (map stage Faction Base).', status: 'fact', source: 'season-preview' },
    ],
  },
  {
    id: 'border-gates',
    name: 'Border Gates',
    aka: ['border Gates', 'Border Gate', 'base borders', 'base border'],
    group: 'Zone',
    what: 'The Gates between a camp base and the war zone.',
    where: 'One line under each base. 6 Gates each (Lv.3 and Lv.6).',
    whereStatus: 'fact',
    pins: [
      { x: 6.3, y: 26.2 }, { x: 22.7, y: 26.2 }, { x: 31.7, y: 26.2 }, { x: 69.8, y: 26.2 }, { x: 78.1, y: 26.2 }, { x: 93.7, y: 26.2 },
      { x: 6.1, y: 73.8 }, { x: 24.0, y: 73.8 }, { x: 30.8, y: 73.8 }, { x: 69.5, y: 73.8 }, { x: 80.0, y: 73.8 }, { x: 93.7, y: 73.8 },
    ],
    facts: [
      { text: 'From Day 13, members enter the Warring Wasteland through a pass on this line.', status: 'fact', source: 'hcb-description' },
      { text: 'The Lv.3 Gates are the exits from the base.', status: 'reported', source: 'hcb-chat' },
      { text: 'After your camp captures a Gate, troops of your camp can go through it. Enemy troops cannot.', status: 'fact', source: 'player-screens' },
    ],
  },
  {
    id: 'war-zone',
    name: 'War zone',
    aka: ['war zone'],
    group: 'Zone',
    what: 'The middle of the map, between the two camp bases. Both camps fight here.',
    where: 'The large middle band of the map, with the Royal Court at its center.',
    whereStatus: 'fact',
    areas: [{ x: 2.5, y: 25.8, w: 95, h: 48.7 }],
    facts: [{ text: 'Opens in stages: Day 13, 20, 27.', status: 'fact', source: 'season-preview' }],
  },
  {
    id: 'outer-war-zone',
    name: 'Outer war zone',
    aka: ['outer war zone'],
    group: 'Zone',
    what: 'The west and east columns of the war zone. Lv.3 Pyramids, Lv.3 Oases and Lv.4 Gates.',
    where: 'The left column and the right column of the war zone.',
    whereStatus: 'fact',
    areas: [
      { x: 3.5, y: 26, w: 23.2, h: 48.3 },
      { x: 74.4, y: 26, w: 22.4, h: 48.3 },
    ],
    facts: [{ text: 'Its cities are the next targets after the camp base (Lv.3).', status: 'strategy' }],
  },
  {
    id: 'inner-war-zone',
    name: 'Inner war zone',
    aka: ['inner war zone'],
    group: 'Zone',
    what: 'The center part of the war zone, around the Temple ring. Lv.4–5 Pyramids and Lv.4–5 Gates.',
    where: 'Between the two outer columns, around the Temple ring.',
    whereStatus: 'fact',
    areas: [{ x: 26.7, y: 26, w: 47.7, h: 48.3 }],
    facts: [{ text: 'The two Lv.5 Gates here are our best estimate for the Sands Fortress.', status: 'inferred' }],
  },
  {
    id: 'temple-ring',
    name: 'Temple ring',
    aka: ['Temple Throne'],
    group: 'Zone',
    what: 'The square of 4 Lv.6 Pyramids around the Royal Court, with a diamond-shaped ring of roads.',
    where: 'The center of the map. The Royal Court is in its middle.',
    whereStatus: 'fact',
    areas: [{ x: 41.7, y: 40.6, w: 17.6, h: 18.9 }],
    facts: [
      { text: 'You cannot teleport into the center. Put Portal Points.', status: 'fact', source: 'rules' },
      { text: 'The two Lv.6 Gates at its sides are our best estimate for the Temple Fortress.', status: 'inferred' },
    ],
  },

  // ---------------- Map stages (the order in which the map opens) ----------------
  {
    id: 'stage-faction-base',
    name: 'Faction Base',
    group: 'Stage',
    what: 'Stage 1 (Day 1–12): build the base, capture Lv.1–2 cities and oases.',
    where: 'The camp bases: the top band (Anubis) and the bottom band (Horus).',
    whereStatus: 'fact',
    image: { src: '/s5/places/stage-faction-base.webp', alt: 'Faction Base stage map', caption: 'Official stage image: Faction Base.', source: 'hcb-description' },
    areas: [
      { x: 2.5, y: 2.5, w: 95, h: 23.3 },
      { x: 2.5, y: 74.5, w: 95, h: 23.2 },
    ],
    facts: [{ text: 'The official preview calls it the starting zones.', status: 'fact', source: 'season-preview' }],
  },
  {
    id: 'stage-warring-wasteland',
    name: 'Warring Wasteland',
    group: 'Stage',
    what: 'Stage 2 (Day 13): the first frontline between the camps.',
    where: 'The west and east columns between the bases.',
    whereStatus: 'fact',
    image: { src: '/s5/places/stage-warring-wasteland.webp', alt: 'Warring Wasteland stage map', caption: 'Official stage image: Warring Wasteland (green).', source: 'hcb-description' },
    areas: [
      { x: 3.5, y: 26, w: 23.2, h: 48.3 },
      { x: 74.4, y: 26, w: 22.4, h: 48.3 },
    ],
    facts: [
      { text: 'It opens on Day 13.', status: 'fact', source: 'season-preview' },
      { text: 'Members enter it from the base through a pass.', status: 'fact', source: 'hcb-description' },
      { text: 'The Strife Pass (the Lv.4 Gates in the middle of the two columns) is in this stage.', status: 'inferred' },
    ],
  },
  {
    id: 'stage-sandsea-battlefield',
    name: 'Sandsea Battlefield',
    group: 'Stage',
    what: 'Stage 3 (Day 20): full war between the camps.',
    where: 'A ring around the center: the inner war zone without the Temple Domain.',
    whereStatus: 'fact',
    image: { src: '/s5/places/stage-sandsea-battlefield.webp', alt: 'Sandsea Battlefield stage map', caption: 'Official stage image: Sandsea Battlefield (yellow ring).', source: 'hcb-description' },
    areas: [
      { x: 26.7, y: 26, w: 47.7, h: 12.3 },
      { x: 26.7, y: 62, w: 47.7, h: 12.3 },
      { x: 26.7, y: 38.3, w: 10.7, h: 23.7 },
      { x: 62, y: 38.3, w: 12.4, h: 23.7 },
    ],
    facts: [{ text: 'It opens on Day 20.', status: 'fact', source: 'season-preview' }],
  },
  {
    id: 'stage-temple-domain',
    name: 'Temple Domain',
    group: 'Stage',
    what: 'Stage 4 (Day 27): the final battlefield.',
    where: 'The center square: Temple ring, Royal Court and the cities around them.',
    whereStatus: 'fact',
    image: { src: '/s5/places/stage-temple-domain.webp', alt: 'Temple Domain stage map', caption: 'Official stage image: Temple Domain (red).', source: 'hcb-description' },
    areas: [{ x: 37.4, y: 38.3, w: 24.6, h: 23.7 }],
    facts: [{ text: 'It opens on Day 27.', status: 'fact', source: 'season-preview' }],
  },

  // ---------------- Key objectives ----------------
  {
    id: 'royal-court',
    name: 'Ancient Royal Court',
    aka: ['Royal Court', 'Capital'],
    group: 'Key objective',
    what: 'The final objective. The holding camp receives a reward for all members.',
    where: 'Map center, X:499 Y:499.',
    whereStatus: 'fact',
    coords: 'X:499 Y:499',
    pins: [P.capital],
    image: { src: '/s5/places/royal-court.webp', alt: 'Ancient Royal Court', caption: 'Royal Court Contest screen.', source: 'royal-court' },
    facts: [
      { text: 'It opens on Week 7, Saturday.', status: 'fact', source: 'royal-court' },
      { text: 'Every member of the holding camp: 2 chests, 2 × 1K packs, 3,000 shards, 10 × 1h speedups.', status: 'fact', source: 'royal-court' },
      { text: 'Top 2 alliances of that camp: Court Conqueror frame and title.', status: 'fact', source: 'royal-court' },
      { text: 'You cannot teleport into the center. Use Portal Points.', status: 'fact', source: 'rules' },
    ],
  },
  {
    id: 'temple-fortress',
    name: 'Temple Fortress',
    aka: ['Temple Fortresses'],
    group: 'Key objective',
    what: 'A fortified Gate at the Temple ring. The holder stops the enemy before the Royal Court.',
    where:
      'The two Lv.6 Gates on the Temple ring (southwest and northeast).',
    whereStatus: 'inferred',
    pins: [P.templeW, P.templeE],
    image: { src: '/s5/places/fortress-gate.webp', alt: 'Fortress Pass building', caption: 'Strife Pass, Sands Fortress and Temple Fortress use this building.', source: 'temple-fortress' },
    extraImage: { src: '/s5/places/temple-fortress-screen.webp', alt: 'Temple Fortress West and East', caption: 'In-game: Temple Fortress (West) and (East). "Go View" moves the map to it.', source: 'temple-fortress' },
    facts: [
      { text: 'There are two: Temple Fortress (West) and Temple Fortress (East).', status: 'fact', source: 'temple-fortress' },
      { text: 'It opens on Week 6, Saturday. It is a camp-against-camp contest.', status: 'fact', source: 'temple-fortress' },
      { text: 'Condition for the participation reward: camp Great Merit points more than 5000.', status: 'fact', source: 'temple-fortress' },
    ],
  },
  {
    id: 'sands-fortress',
    name: 'Sands Fortress',
    aka: ['Sands Fortresses'],
    group: 'Key objective',
    what: 'A fortified Gate in the war zone. The holder blocks the enemy path to the Temple Fortress.',
    where:
      'The two Lv.5 Gates (northwest and southeast of the center).',
    whereStatus: 'inferred',
    pins: [P.sandsW, P.sandsE],
    image: { src: '/s5/places/fortress-gate.webp', alt: 'Fortress Pass building', caption: 'Same building as the other fortresses.', source: 'sands-fortress' },
    extraImage: {
      src: '/s5/places/sands-fortress-screen.webp',
      alt: 'Sands Fortress West and East',
      caption: 'In-game: Sands Fortress (West) and (East).',
      source: 'sands-fortress',
      callouts: [
        { x: 4, y: 37, label: 'West fortress' },
        { x: 52, y: 21, label: 'Camp that holds it' },
        { x: 83, y: 22, label: 'Go View: moves the map to it' },
      ],
    },
    facts: [
      { text: 'There are two: Sands Fortress (West) and Sands Fortress (East).', status: 'fact', source: 'sands-fortress' },
      { text: 'It opens on Week 4, Saturday. It is a camp-against-camp contest.', status: 'fact', source: 'sands-fortress' },
    ],
  },
  {
    id: 'strife-pass',
    name: 'Strife Pass',
    aka: ['Strife Passes'],
    group: 'Key objective',
    what: 'The first contested Pass (Gate). The camp that holds it can go into the enemy camp territory.',
    where:
      'The two Lv.4 Gates in the middle of the west and east columns. Both camps fight for the same two.',
    whereStatus: 'inferred',
    pins: [P.strifeW, P.strifeE],
    image: { src: '/s5/places/fortress-gate.webp', alt: 'Fortress Pass building', caption: 'Same building as the other fortresses.', source: 'strife-pass' },
    extraImage: { src: '/s5/places/strife-pass-screen.webp', alt: 'Strife Pass West and East', caption: 'In-game: Strife Pass (West) and (East).', source: 'strife-pass' },
    facts: [
      { text: 'There are two: Strife Pass (West) and Strife Pass (East).', status: 'fact', source: 'strife-pass' },
      { text: 'It opens on Week 2, Saturday. The camp that holds it at the end receives the camp reward.', status: 'fact', source: 'strife-pass' },
      { text: 'Players call it the "Lv.4 Gate".', status: 'reported', source: 'hcb-chat' },
    ],
  },

  // ---------------- Cities ----------------
  {
    id: 'pyramid',
    name: 'Pyramid',
    aka: ['Pyramids', 'Lv.1 Pyramid'],
    group: 'City',
    what: 'The main city type. Capture it to obtain Influence.',
    where: 'Everywhere. Lv.1–2 in the bases, Lv.3 outer zone, Lv.4–5 inner zone, Lv.6 at the Royal Court.',
    whereStatus: 'fact',
    image: { src: '/s5/places/pyramid.webp', alt: 'Pyramid', caption: 'Pyramid (Territory Triumph screen).', source: 'territory-triumph' },
    extraImage: {
      src: '/s5/places/pyramid-info.webp',
      alt: 'Lv.1 Pyramid info panel',
      caption: 'Lv.1 Pyramid: Influence +20, Virus Resistance 1,500 necessary.',
      source: 'player-screens',
      callouts: [
        { x: 6, y: 25, label: 'Map coordinates of the city' },
        { x: 24, y: 48, label: 'Influence that the city gives' },
        { x: 6, y: 82, label: 'Virus Resistance necessary (you: 0 of 1,500)' },
      ],
    },
    facts: [
      { text: 'A Lv.1 Pyramid gives Influence +20. Durability 5,000,000.', status: 'fact', source: 'player-screens' },
      { text: 'You must have 1,500 Virus Resistance to attack. With less: −99% damage.', status: 'fact', source: 'player-screens' },
      { text: 'Sands Conquest points: Lv.1 = 20, Lv.2 = 40, Lv.3 = 60, Lv.4 = 120.', status: 'fact', source: 'player-screens' },
    ],
  },
  {
    id: 'gate',
    name: 'Gate',
    aka: ['Gates'],
    group: 'City',
    what: 'A city on the wall between zones ("Pass" in the rules). It controls the path.',
    where: 'On the walls between zones. Lv.3 and Lv.6 on the base borders, Lv.4–6 in the war zone.',
    whereStatus: 'fact',
    image: { src: '/s5/places/fortress-gate.webp', alt: 'Gate (Pass)', caption: 'Pass building.', source: 'maps' },
    facts: [
      { text: 'The rules count a Pass as a city. A declaration on a Gate uses one of the 2 daily declarations.', status: 'fact', source: 'territory-triumph' },
      { text: 'After capture, troops of your camp can go through it. Enemy troops cannot.', status: 'fact', source: 'player-screens' },
      { text: 'Influence of a Gate: same table as Pyramids (Lv.4 = 120, Lv.6 = 400).', status: 'reported', source: 'hcb-chat' },
      { text: 'You must connect a tile to a Gate before you can capture it.', status: 'fact', source: 'alliance-territory' },
    ],
  },

  // ---------------- Map objects ----------------
  {
    id: 'oasis',
    name: 'Oasis',
    aka: ['Oases', 'oasis', 'oases'],
    group: 'Map object',
    what: 'Gives Holy Water to the alliance that holds it. Also gives Sands Conquest points.',
    where: 'Many in the camp bases (Lv.1–2) and in the outer war zone (Lv.3).',
    whereStatus: 'fact',
    image: { src: '/s5/places/oasis.webp', alt: 'Oasis', caption: 'Oasis.', source: 'oasis' },
    extraImage: {
      src: '/s5/places/capture-points.webp',
      alt: 'Capture Points table',
      caption: 'Sands Conquest points by city and oasis level.',
      source: 'player-screens',
      callouts: [
        { x: 6, y: 24, label: 'Cities: Lv.1 = 20 points' },
        { x: 6, y: 68, label: 'Oases: Lv.1 = 10 points' },
      ],
    },
    facts: [
      { text: 'Start a Capture (2 each day), connect a tile in 4 hours, then attack.', status: 'fact', source: 'oasis' },
      { text: 'Sands Conquest points: Lv.1 = 10, Lv.2 = 20, Lv.3 = 30.', status: 'fact', source: 'player-screens' },
    ],
  },
  {
    id: 'stronghold',
    name: 'Stronghold',
    aka: ['Strongholds', 'stronghold', 'strongholds', 'Camp Stronghold', 'Camp Strongholds'],
    group: 'Map object',
    what: 'A tall tower. If your camp holds it, your camp can teleport near it on Saturday, 11:00–15:00.',
    where: 'The sources do not show where the Strongholds are.',
    whereStatus: 'unconfirmed',
    image: { src: '/s5/places/stronghold.webp', alt: 'Stronghold', caption: 'Stronghold.', source: 'stronghold' },
    facts: [
      { text: 'You can attack it with no declaration if your camp territory touches it.', status: 'fact', source: 'stronghold' },
      { text: 'A captured Stronghold is a start point for tile lines. Not territory for declarations.', status: 'fact', source: 'player-screens' },
      { text: 'Do not confuse it with the Obelisk, a season building in your base.', status: 'strategy' },
    ],
  },
  {
    id: 'divine-ruin',
    name: 'Divine Ruin',
    aka: ['Divine Ruins', 'Divine Temple', 'Divine Temples', 'Ruin Task', 'Ruin Tasks', 'Temple Tasks', 'Temple Task'],
    group: 'Map object',
    what: 'Gives one Ruin Task each day. Tasks give Affinity, buffs and Divine Artifacts.',
    where: 'In the war zone (8 in total).',
    whereStatus: 'reported',
    image: { src: '/s5/places/divine-ruin.webp', alt: 'Divine Ruin', caption: 'Divine Ruin (Anubis).', source: 'divine-temples' },
    facts: [{ text: 'You can do tasks from 2 ruins each day.', status: 'fact', source: 'divine-temples' }],
  },

  // ---------------- Your buildings ----------------
  {
    id: 'alliance-center',
    name: 'Alliance Center',
    group: 'Your buildings',
    what: 'Your alliance base on the map. All tile lines start here.',
    where: 'You put it in a Lv.1–2 territory in your camp base.',
    whereStatus: 'fact',
    image: { src: '/s5/places/alliance-center.webp', alt: 'Alliance Center', caption: 'Alliance Center.', source: 'alliance-center' },
    facts: [
      { text: 'Send troops to garrison it. This builds it faster.', status: 'fact', source: 'alliance-center' },
      { text: 'If you remove it, you must pay alliance resources to build it again.', status: 'fact', source: 'alliance-center' },
    ],
  },
  {
    id: 'portal-gate',
    name: 'Portal Gate',
    aka: ['Portal Gates'],
    group: 'Your buildings',
    what: 'Lets you put Portal Points on the map.',
    where: 'A season building in your Watchtower area.',
    whereStatus: 'fact',
    image: { src: '/s5/places/portal-gate.webp', alt: 'Portal Gate', caption: 'Portal Gate Lv.1.', source: 'seasonal-buildings' },
    facts: [
      { text: 'Lv.1 gives Troop Teleport Speed +300%. Lv.2–5: 350%, 400%, 450%, 500%.', status: 'reported', source: 'hcb-buildings' },
      { text: 'Upgrade cost in Holy Water: Lv.2 = 5,000,000, Lv.3 = 7,500,000.', status: 'reported', source: 'hcb-buildings' },
      { text: 'Necessary near the Royal Court, because you cannot teleport there.', status: 'fact', source: 'rules' },
    ],
  },
  {
    id: 'portal-point',
    name: 'Portal Point',
    aka: ['Portal Points'],
    group: 'Map object',
    what: 'A portal that you put on the map near the target. Marches start from it with full Shelter Value.',
    where: 'On a 2×2 tile area that your alliance occupies. You choose the place.',
    whereStatus: 'fact',
    image: { src: '/s5/places/portal-point.webp', alt: 'Portal Point on the map', caption: 'A Portal Point on alliance tiles (green squares).', source: 'hcb-buildings' },
    facts: [
      { text: 'Put it on a 2×2 area of your own tiles.', status: 'fact', source: 'player-screens' },
      { text: 'The tiles under it lose their owner. It is a start point for tile lines.', status: 'fact', source: 'player-screens' },
      { text: 'Portal Points are connected to the shelter and protected by Shelter Value.', status: 'fact', source: 'hcb-buildings' },
      { text: 'A march: 53 seconds through a Portal Point, 2+ minutes on foot.', status: 'reported', source: 'hcb-buildings' },
    ],
  },
  {
    id: 'obelisk',
    name: 'Obelisk',
    group: 'Your buildings',
    what: 'Gives Virus Resistance, which you must have to attack cities.',
    where: 'A season building in your Watchtower area.',
    whereStatus: 'fact',
    image: { src: '/s5/places/obelisk.webp', alt: 'Obelisk', caption: 'Obelisk (building bar).', source: 'seasonal-buildings' },
    extraImage: { src: '/s5/places/virus-resistance.webp', alt: 'Insufficient virus resistance screen', caption: 'Obelisk Lv.6 → 7: Virus Resistance +250.', source: 'player-screens' },
    facts: [
      { text: 'Example: Obelisk Lv.6 to Lv.7 gives Virus Resistance +250.', status: 'fact', source: 'player-screens' },
      { text: 'A Lv.1 Pyramid: 1,500 Virus Resistance is necessary. With less, troops do −99% damage.', status: 'fact', source: 'player-screens' },
      { text: 'The Season Weekly Pass gives Curse Resistance +250.', status: 'fact', source: 'player-screens' },
      { text: 'Holy Water cost: Lv.2 = 16,000, Lv.10 = 251,000, Lv.30 = 1,622,000.', status: 'reported', source: 'hcb-buildings' },
      { text: 'Virus Resistance by level: Lv.5 = 500, Lv.9 = 1,500, Lv.15 = 3,000, Lv.30 = 10,000.', status: 'reported', source: 'hcb-buildings' },
      { text: 'Tile Capture Cap: 0 until Lv.5, then 5, 10, 20, 30, 40, 50 (Lv.30).', status: 'reported', source: 'hcb-buildings' },
    ],
  },
  {
    id: 'holy-altar',
    name: 'Holy Altar',
    aka: ['Holy Altar I', 'Holy Altar II', 'Holy Altars'],
    group: 'Your buildings',
    what: 'Makes Holy Water each hour. Obsidian upgrades it. Levels give Season Medals.',
    where: 'A season building in your Watchtower area.',
    whereStatus: 'fact',
    image: { src: '/s5/places/holy-altar.webp', alt: 'Holy Altar', caption: 'Holy Altar.', source: 'player-screens' },
    extraImage: { src: '/s5/building-table.webp', alt: 'Season building table', caption: 'Player table: costs and outputs of the season buildings, Lv.1–30.', source: 'hcb-buildings' },
    facts: [
      { text: 'Output: 720 Holy Water each hour at Lv.1, +720 for each level, 21,600 at Lv.30.', status: 'reported', source: 'hcb-buildings' },
      { text: 'Upgrade cost in Obsidian: Lv.1 = 700, Lv.10 = 85,100, Lv.30 = 208,000.', status: 'reported', source: 'hcb-buildings' },
      { text: 'Holy Altar I to Lv.30 gives 1,500 Season Medals.', status: 'fact', source: 'growth-rebate' },
      { text: 'The Season Weekly Pass gives Altar QTY +1.', status: 'fact', source: 'player-screens' },
    ],
  },
  {
    id: 'gathering-hall',
    name: 'Gathering Hall',
    group: 'Your buildings',
    what: 'A season building. It increases your gathering speed on the season map.',
    where: 'A season building in your Watchtower area.',
    whereStatus: 'reported',
    image: { src: '/s5/building-table.webp', alt: 'Season building table', caption: 'Player table: Gathering Hall column.', source: 'hcb-buildings' },
    facts: [
      { text: 'Cost to build: 150,000 Obsidian and 1,000,000 Holy Water.', status: 'reported', source: 'hcb-buildings' },
      { text: 'Gathering speed +2% at Lv.1, +2% for each level, +60% at Lv.30.', status: 'reported', source: 'hcb-buildings' },
    ],
  },
  {
    id: 'guardian-sanctuary',
    name: 'Guardian Sanctuary',
    group: 'Your buildings',
    what: 'A season building. It is a hospital for your troops on the season map.',
    where: 'A season building in your Watchtower area.',
    whereStatus: 'reported',
    image: { src: '/s5/building-table.webp', alt: 'Season building table', caption: 'Player table: Guardian Sanctuary column.', source: 'hcb-buildings' },
    facts: [
      { text: 'Cost to build: 150,000 Obsidian and 1,000,000 Holy Water.', status: 'reported', source: 'hcb-buildings' },
      { text: 'Hospital Cap 200 at Lv.1, +200 for each level, 6,000 at Lv.30.', status: 'reported', source: 'hcb-buildings' },
    ],
  },
]

export const s5Routes: Route[] = [
  {
    id: 'anubis-west',
    camp: 'Anubis',
    side: 'West',
    steps: [
      { placeId: 'alliance-center', label: 'Anubis base (north)', when: 'Day 1', pin: P.anubisW },
      { placeId: 'border-gates', label: 'Border pass (Lv.3)', when: 'Day 13', pin: P.borderNW },
      { placeId: 'strife-pass', label: 'Strife Pass (West)', when: 'Week 2 Sat', pin: P.strifeW },
      { placeId: 'sands-fortress', label: 'Sands Fortress (West)', when: 'Week 4 Sat', pin: P.sandsW },
      { placeId: 'temple-fortress', label: 'Temple Fortress (West)', when: 'Week 6 Sat', pin: P.templeW },
      { placeId: 'royal-court', label: 'Ancient Royal Court', when: 'Week 7 Sat', pin: P.capital },
    ],
  },
  {
    id: 'anubis-east',
    camp: 'Anubis',
    side: 'East',
    steps: [
      { placeId: 'alliance-center', label: 'Anubis base (north)', when: 'Day 1', pin: P.anubisE },
      { placeId: 'border-gates', label: 'Border pass (Lv.3)', when: 'Day 13', pin: P.borderNE },
      { placeId: 'strife-pass', label: 'Strife Pass (East)', when: 'Week 2 Sat', pin: P.strifeE },
      { placeId: 'sands-fortress', label: 'Sands Fortress (East)', when: 'Week 4 Sat', pin: P.sandsE },
      { placeId: 'temple-fortress', label: 'Temple Fortress (East)', when: 'Week 6 Sat', pin: P.templeE },
      { placeId: 'royal-court', label: 'Ancient Royal Court', when: 'Week 7 Sat', pin: P.capital },
    ],
  },
  {
    id: 'horus-west',
    camp: 'Horus',
    side: 'West',
    steps: [
      { placeId: 'alliance-center', label: 'Horus base (south)', when: 'Day 1', pin: P.horusW },
      { placeId: 'border-gates', label: 'Border pass (Lv.3)', when: 'Day 13', pin: P.borderSW },
      { placeId: 'strife-pass', label: 'Strife Pass (West)', when: 'Week 2 Sat', pin: P.strifeW },
      { placeId: 'sands-fortress', label: 'Sands Fortress (West)', when: 'Week 4 Sat', pin: P.sandsW },
      { placeId: 'temple-fortress', label: 'Temple Fortress (West)', when: 'Week 6 Sat', pin: P.templeW },
      { placeId: 'royal-court', label: 'Ancient Royal Court', when: 'Week 7 Sat', pin: P.capital },
    ],
  },
  {
    id: 'horus-east',
    camp: 'Horus',
    side: 'East',
    steps: [
      { placeId: 'alliance-center', label: 'Horus base (south)', when: 'Day 1', pin: P.horusE },
      { placeId: 'border-gates', label: 'Border pass (Lv.3)', when: 'Day 13', pin: P.borderSE },
      { placeId: 'strife-pass', label: 'Strife Pass (East)', when: 'Week 2 Sat', pin: P.strifeE },
      { placeId: 'sands-fortress', label: 'Sands Fortress (East)', when: 'Week 4 Sat', pin: P.sandsE },
      { placeId: 'temple-fortress', label: 'Temple Fortress (East)', when: 'Week 6 Sat', pin: P.templeE },
      { placeId: 'royal-court', label: 'Ancient Royal Court', when: 'Week 7 Sat', pin: P.capital },
    ],
  },
]

export const s5RouteNote =
  'The order is a fact. The fortress positions are our reading of the map. Lines show the order, not the road. In-game, use "Go View" on the event screen.'

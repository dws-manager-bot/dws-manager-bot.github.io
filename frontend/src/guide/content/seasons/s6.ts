import type { Briefing, Phase, QuickCard, Season } from '../types'
import { s6Places, s6RouteNote, s6Routes } from './s6-places.ts'

/**
 * Season 6 — Ragnarok. Full guide (same shape as S5).
 *
 * Sources: official #s6-ragnarok posts (capture/s6-event/), HCB #season-6-data, the S6 search
 * captures, and 70 in-game screenshots taken after the season ended (capture/manual-s6-screenshots/:
 * Rules tabs, season bar, Season Map, rankings, map tour with coordinates).
 *
 * DATES ARE RELATIVE. Every group plays the same season days: Kickoff Day 1 (Mon), Invade Day 16 (Tue),
 * Altar Day 39 (Thu), Showdown Day 48 (Sat), Tally Day 51 (Tue). Two groups confirm it: the official
 * group (Jul 20 start) and the screenshot group (Sep 21 start). Write "Day N ({date:N})": the site
 * fills the date from `schedule.start` (our cluster) or from the start that the reader picks.
 * Week k = Day 7k−6 (Mon) to Day 7k (Sun).
 *
 * Text: ASD-STE100, short.
 */

const phases: Phase[] = [
  {
    id: 'phase-1',
    name: 'Kickoff — your Camp Base',
    period: 'Day 1–15 ({date:1} – {date:15})',
    days: { start: 1, end: 15 },
    goal: 'Take Outposts and Fortresses in your Camp Base. Start the weekly Mithril.',
    unlocked: ['Kickoff (Day 1)', 'Merchant Guild (Day 8)'],
    before: [
      { text: 'Agree with your camp which alliance takes which Fortress.', status: 'strategy' },
      { text: 'Keep the Peace Shield on: it works only in the Camp Spawn Area.', status: 'fact', source: 's6-manual' },
    ],
    whenItStarts: [
      { text: 'Challenge a Lv.1 Camp Outpost first. It is the only permitted first target.', status: 'fact', source: 's6-outpost' },
      { text: 'Then Challenge Outposts and declare on Fortresses next to your camp territory.', status: 'fact', source: 's6-manual' },
      { text: 'Capture Fortresses early. Each Monday 00:00 pays one week of Mithril.', status: 'fact', source: 's6-rankings' },
    ],
    daily: [
      { text: 'Use all 3 Challenge Attempts and the 1 War Declaration Attempt (12:00–13:00).', status: 'fact', source: 's6-manual' },
      { text: 'Upgrade the Holy Altars, the Obelisk and the Ancient Relic.', status: 'fact', source: 's6-rebate' },
    ],
    rewards: ['Weekly Fortress Mithril', 'Season Kick-Off rank'],
    dontDoThis: { text: 'Do not waste attempts on targets that do not connect to your territory.', status: 'strategy' },
    handoff: 'Before Day 16: Fortresses next to the Passes, and troops healed.',
  },
  {
    id: 'phase-2',
    name: 'Invade — the Land of Strife',
    period: 'Day 16–38 ({date:16} – {date:38})',
    days: { start: 16, end: 38 },
    goal: 'Go through the Passes. Take Fortresses in the Land of Strife. Win your Temple Contests.',
    unlocked: ['Passes to the Land of Strife (Day 16)', 'Tuesday and Thursday invasions'],
    before: [
      { text: 'Hold an Outpost next to each Pass that your camp uses.', status: 'strategy' },
    ],
    whenItStarts: [
      { text: 'On Tuesday and Thursday, 12:00–13:00, attack enemy-camp Outposts and Fortresses.', status: 'fact', source: 's6-manual' },
      { text: 'Destroy an enemy Fortress for 200% of its weekly Mithril. It stops paying them.', status: 'fact', source: 's6-manual' },
      { text: 'Send all strong players to each Temple Contest that the game opens for your camp.', status: 'strategy' },
    ],
    daily: [
      { text: 'Garrison your Fortresses before Tuesday and Thursday, 12:00.', status: 'strategy' },
      { text: 'Your Watchtower can be attacked on Tuesday and Thursday, 12:00–13:00, and during Temple Contests.', status: 'fact', source: 's6-manual' },
    ],
    rewards: ['Fortress and destruction Mithril', 'Temple Contest Mithril and Temple Blessing Chests'],
    dontDoThis: { text: 'Do not leave a Fortress empty on Tuesday or Thursday. A lost Fortress is destroyed for the season.', status: 'fact', source: 's6-manual' },
    handoff: 'Before Day 39: a connected line to the Temple Throne, and the strongest rally leads ready.',
  },
  {
    id: 'phase-3',
    name: 'Altar — the Temple Throne',
    period: 'Day 39–47 ({date:39} – {date:47})',
    days: { start: 39, end: 47 },
    goal: 'Capture a Judgement Altar. It pays 300 Mithril each week.',
    unlocked: ['Judgement Altars (Day 39, Week 6 Thursday)'],
    before: [
      { text: 'Have territory next to an Altar before Thursday 12:00.', status: 'strategy' },
    ],
    whenItStarts: [
      { text: 'Declare war on an Altar on Thursday, 12:00–13:00. Only Thursdays are permitted.', status: 'fact', source: 's6-manual' },
      { text: 'A war on an Altar uses the daily War Declaration Attempt.', status: 'fact', source: 's6-manual' },
    ],
    daily: [{ text: 'Keep winning Temple Contests. They are the largest Mithril source.', status: 'fact', source: 's6-manual' }],
    rewards: ['Altar: 300 Mithril each week', 'Lv.3 Ancient Temple: up to 900'],
    dontDoThis: { text: 'Do not use the Thursday War Declaration Attempt on a Fortress if your camp can take an Altar.', status: 'strategy' },
    handoff: 'Before Day 48: all camp alliances ready for the Supreme Temple.',
  },
  {
    id: 'phase-4',
    name: 'Showdown — the Supreme Temple',
    period: 'Day 48–51 ({date:48} – {date:51})',
    days: { start: 48, end: null },
    goal: 'Win the best rank at the Supreme Temple. Hold your Mithril to the Tally (Day 51).',
    unlocked: ['Showdown (Day 48)', 'Tally (Day 51)'],
    before: [{ text: 'Count the Mithril of the camps near your rank.', status: 'strategy' }],
    whenItStarts: [
      { text: 'Join the Supreme Temple Contest with all camp alliances.', status: 'strategy' },
      { text: 'Rank 1 receives 2500 Mithril, rank 8 receives 200.', status: 'fact', source: 's6-rankings' },
    ],
    daily: [{ text: 'Spend Season Medals and Runes before the season ends.', status: 'fact', source: 's6-rebate' }],
    rewards: ['Supreme Temple Mithril', 'Season rewards by camp rank'],
    dontDoThis: { text: 'Do not stop after the Temples. Equal Mithril: the camp that reached it first ranks higher.', status: 'fact', source: 's6-rankings' },
    handoff: 'Day 51: Tally. The leader assigns the rewards. Then Migrate.',
  },
]

const quickCards: QuickCard[] = [
  {
    id: 'card-daily',
    title: 'The 12:00 window',
    trigger: 'Each day, 12:00–13:00.',
    steps: ['Send troops before 12:00.', 'Use 3 Challenges (Outposts).', 'Use 1 War (Fortress, or Altar on Thursday).', 'Plans end at 13:00.'],
    warning: 'Unused attempts are lost for the day.',
    link: 'war-window',
  },
  {
    id: 'card-defend',
    title: 'Tuesday and Thursday defense',
    trigger: 'From Day 16, Tuesday and Thursday, 12:00–13:00.',
    steps: ['Garrison each Fortress before 12:00.', 'Move Watchtowers away from the front.', 'Heal troops before the window.'],
    warning: 'A breached Fortress is destroyed for the season.',
    link: 'destroy',
  },
  {
    id: 'card-temple',
    title: 'Temple Contest',
    trigger: 'When the game opens a Temple for your camp.',
    steps: ['Teleport into the contest area.', 'Hold the Temple to 100% Capture Progress.', 'Fight harder in the Brawl Phase (×3).', 'Claim Temple Blessing Chests after it ends.'],
    warning: 'Temples gave the winning camp half its Mithril.',
    link: 'temple',
  },
  {
    id: 'card-merchant',
    title: 'Merchant Guild',
    trigger: 'Monday 12:00, from Day 8.',
    steps: ['Send troops to the guild at 12:00.', 'Progress is per survivor.', 'The top survivor becomes Governor and opens the shop.'],
    warning: 'Attacks on shelters in the guild area do extra harm.',
    link: 'merchant',
  },
]

const briefing: Briefing = {
  titles: {
    title: 'Ragnarok: eight camps race for Mithril',
    win: 'The camp with the most Mithril wins. Temples pay the most.',
    first: 'Three things to do in Week 1',
    roadmap: 'Four stages: Kickoff, Invade, Altar, Showdown',
    map: 'Eight Camp Bases around the Land of Strife and the Temple Throne',
    buildings: 'Know the buildings: Outpost, Fortress, Temple, Altar',
    objectives: 'Temples and Altars decide the end of the season',
    route: 'Choose your camp: your way from the Camp Base to the Supreme Temple',
    attack: '3 Challenges and 1 War each day, 12:00–13:00',
    week: 'Tuesday and Thursday are invasion days',
    rebate: 'Holy Altar I to Lv.30 gives 1,500 Season Medals',
    resources: 'Mithril is the score. Season items are removed.',
    influence: 'Each Mithril source',
    example: 'The winner took 51% of its Mithril from Temples',
    end: 'Every detail is in the full guide',
  },
  winFlow: [
    { label: 'Fortresses and Altars', detail: 'Weekly Mithril, each Monday 00:00.' },
    { label: 'Temple Contests', detail: 'Mithril by camp rank.' },
    { label: 'Camp Mithril', detail: 'The sum of all sources.' },
    { label: 'Camp rank', detail: 'Rewards for every alliance in the camp.' },
  ],
  rewardPaths: [
    { condition: 'Camp Mithril rank at the Tally', reward: 'Season rewards for all alliances in the camp', status: 'fact' },
    { condition: 'Enough camp Mithril', reward: 'Daily camp rewards', status: 'fact' },
    { condition: 'Supreme Temple rank 1', reward: '2500 Mithril', status: 'fact' },
    { condition: 'Star Map alliance', reward: 'Titles: World Serpent, Divine Chosen, Legendary Lord', status: 'fact' },
  ],
  attackFlow: [
    { label: 'Connected', detail: 'The target is next to your camp territory.' },
    { label: 'Challenge or War', detail: '3 Challenges (Outposts), 1 War (Fortress or Altar).' },
    { label: '12:00–13:00', detail: 'Enemy camps: Tuesday and Thursday only.' },
    { label: 'Guards, then durability', detail: 'Only neutral targets have NPC guards.' },
    { label: 'Capture or destroy', detail: 'An enemy Fortress is destroyed.' },
  ],
  roadmap: {
    zones: [
      { name: 'Kickoff stage', startDay: 1, levels: 'Day 1 · {date:1}' },
      { name: 'Invade stage', startDay: 16, levels: 'Day 16 · {date:16}' },
      { name: 'Altar stage', startDay: 39, levels: 'Day 39 · {date:39}' },
      { name: 'Showdown stage', startDay: 48, levels: 'Day 48 · {date:48}' },
    ],
    objectives: [
      { name: 'Merchant Guild', day: 8, when: 'Day 8 · {date:8}' },
      { name: 'Pass', day: 16, when: 'Day 16 · {date:16}' },
      { name: 'Judgement Altar', day: 39, when: 'Day 39 · {date:39}' },
      { name: 'Supreme Temple', day: 48, when: 'Day 48 · {date:48}' },
    ],
    lastDay: 51,
    note: 'Season days are the same in all groups. Dates: Day 1 = {year:1}. Tally: Day 51 ({year:51}).',
  },
  week: [
    {
      day: 'Mon',
      events: [
        { time: '00:00', label: 'Mithril payout', detail: 'Fortresses and Altars pay one week.', tone: 'all' },
        { time: '12:00', label: 'Merchant Guild', detail: 'Trade Post Race, 1 hour (from Day 8).', tone: 'all' },
      ],
    },
    { day: 'Tue', events: [{ time: '12:00–13:00', label: 'Invasion', detail: 'Enemy camps can attack (from Day 16).', tone: 'enemy' }] },
    { day: 'Wed', events: [{ time: '12:00–13:00', label: 'War window', detail: 'Neutral targets next to your camp.', tone: 'own-camp' }] },
    {
      day: 'Thu',
      events: [
        { time: '12:00–13:00', label: 'Invasion', detail: 'Enemy camps can attack (from Day 16).', tone: 'enemy' },
        { time: '12:00–13:00', label: 'Altar war', detail: 'Only day for Altars (from Day 39).', tone: 'enemy' },
      ],
    },
    { day: 'Fri', events: [{ time: '12:00–13:00', label: 'War window', detail: 'Neutral targets next to your camp.', tone: 'own-camp' }] },
    { day: 'Sat', events: [{ time: '12:00–13:00', label: 'War window', detail: 'Neutral targets next to your camp.', tone: 'own-camp' }] },
    { day: 'Sun', events: [{ time: '12:00–13:00', label: 'War window', detail: 'Neutral targets next to your camp.', tone: 'own-camp' }] },
  ],
  everyDay: ['3 Challenges + 1 War at 12:00', 'Upgrade Holy Altars, Obelisk, Relic', 'Garrison Fortresses'],
  meritLevels: [],
  growthRebate: [
    { altar: 'Holy Altar I', level: 20, medals: 200 },
    { altar: 'Holy Altar I', level: 23, medals: 200 },
    { altar: 'Holy Altar I', level: 26, medals: 300 },
    { altar: 'Holy Altar I', level: 28, medals: 300 },
    { altar: 'Holy Altar I', level: 30, medals: 500 },
  ],
  influenceLevels: [],
  scoreSources: {
    title: 'Mithril by source',
    status: 'fact',
    groups: [
      { label: 'Each Monday', rows: [{ label: 'Lv.3 Fortress', value: '20' }, { label: 'Lv.4 Fortress', value: '60' }, { label: 'Lv.5 Fortress', value: '100' }, { label: 'Judgement Altar', value: '300' }] },
      { label: 'Destroy a Fortress', rows: [{ label: 'Lv.3', value: '40' }, { label: 'Lv.4', value: '120' }, { label: 'Lv.5', value: '200' }] },
      { label: 'Ancient Temple, camp rank 1', rows: [{ label: 'Lv.1', value: '180' }, { label: 'Lv.2', value: '320' }, { label: 'Lv.3', value: '900' }] },
      { label: 'Supreme Temple', rows: [{ label: 'Rank 1', value: '2500' }, { label: 'Rank 2', value: '1200' }, { label: 'Rank 8', value: '200' }] },
    ],
  },
  scoreExample: {
    title: 'Where the Mithril came from',
    status: 'fact',
    note: 'One finished group (in-game Ranking screen). The total of each camp is its season score.',
    groups: [
      { label: 'Rank 1 · 7,580', rows: [{ label: 'Temples', value: '3,900' }, { label: 'Capture Fortress', value: '2,880' }, { label: 'Capture Altar', value: '600' }, { label: 'Destroy Fortress', value: '200' }] },
      { label: 'Rank 2 · 5,720', rows: [{ label: 'Temples', value: '2,200' }, { label: 'Capture Fortress', value: '2,180' }, { label: 'Capture Altar', value: '300' }, { label: 'Destroy Fortress', value: '1,040' }] },
      { label: 'Rank 3 · 5,390', rows: [{ label: 'Temples', value: '1,250' }, { label: 'Capture Fortress', value: '2,500' }, { label: 'Capture Altar', value: '600' }, { label: 'Destroy Fortress', value: '1,040' }] },
      { label: 'Rank 8 · 2,270', rows: [{ label: 'Temples', value: '710' }, { label: 'Capture Fortress', value: '1,400' }, { label: 'Capture Altar', value: '0' }, { label: 'Destroy Fortress', value: '160' }] },
    ],
  },
}

export const s6: Season = {
  slug: 's6',
  number: 6,
  name: 'Ragnarok',
  tagline: 'Eight camps race for Mithril for 7 weeks, Day 1 ({date:1}) to the Tally on Day 51 ({date:51}).',
  ready: true,
  serverTimeNote: 'All times are server time (the game clock). They are not your local time.',
  lastVerified: '2026-11-14',
  version: '1.1',
  owner: 'POU 413',
  schedule: { start: '2026-11-23', label: 'States 389–420', lastDay: 51 },

  overview: {
    whatIsIt:
      'Eight camps on one map. Your camp captures Outposts, Fortresses and Altars, and wins Temple Contests, to obtain Mithril. The camp with the most Mithril ranks first.',
    winCondition: [
      { text: 'At the Tally, the camp Mithril rank decides the rewards of every alliance in the camp.', status: 'fact', source: 's6-rankings' },
      { text: 'Fortresses and Altars pay Mithril each Monday 00:00. Temple Contests pay by camp rank.', status: 'fact', source: 's6-manual' },
      { text: 'In one finished group, Temples gave the winning camp 3,900 of its 7,580 Mithril.', status: 'fact', source: 's6-manual' },
    ],
    doThisFirst: [
      { text: 'Challenge a Lv.1 Camp Outpost in your Camp Base.', status: 'fact', source: 's6-outpost' },
      { text: 'Capture Fortresses in Week 1. Every Monday pays.', status: 'fact', source: 's6-rankings' },
      { text: 'Plan with your camp who takes which Fortress and which Temple.', status: 'strategy' },
    ],
    biggestMistake: {
      text: 'An empty Fortress on Tuesday or Thursday. An enemy camp destroys it for the season.',
      status: 'fact',
      source: 's6-manual',
    },
    minimumTarget: {
      text: 'No alliance target. Every alliance in the camp shares the camp rank.',
      status: 'fact',
      source: 's6-rankings',
    },
  },

  terms: [
    { term: 'Camp', aka: ['Camps', 'Camp No.1', 'Camp No.8'], key: true, meaning: 'One of the 8 sides (No.1–No.8). Alliances in a camp work together for Mithril.' },
    { term: 'Mithril', key: true, meaning: 'The season score. The camp with the most Mithril at the Tally ranks first.', image: { src: '/s6/mithril.webp', alt: 'Mithril table', caption: 'Mithril by source.' } },
    { term: 'Challenge', aka: ['Challenges', 'Challenge Plan', 'Challenge Plans', 'Challenge Attempt', 'Challenge Attempts', 'Offensive Plan', 'Offensive Plans'], key: true, meaning: 'An attack plan on an Outpost. 3 Challenge Attempts each day, 12:00–13:00.' },
    { term: 'War', aka: ['War Plan', 'War Plans', 'War Declaration', 'War Declarations', 'War Declaration Attempt', 'War Declaration Attempts'], key: true, meaning: 'A declaration on a Fortress or an Altar. 1 War Declaration Attempt each day, 12:00–13:00.' },
    { term: 'Invasion', aka: ['invasion', 'Invasion Days', 'invasion days'], key: true, meaning: 'Tuesday and Thursday, 12:00–13:00, from Day 16. Attacks on enemy camps are permitted.' },
    { term: 'Temple Contest', aka: ['Temple Contests'], key: true, meaning: 'A timed fight for an Ancient Temple or the Supreme Temple. Only the designated camps can enter.', image: { src: '/s6/rule-temple-contest.webp', alt: 'Temple Contest rules', caption: 'In-game: Temple Contest.' } },
    { term: 'Capture Progress', aka: ['capture progress'], meaning: 'The share of a contest site that your side holds. At 100%, you take it.' },
    { term: 'Brawl Phase', meaning: 'If a Temple has no owner after 90 minutes: 30 more minutes with capture progress ×3.' },
    { term: 'Battlefield Rating', meaning: 'Kills in a Temple Contest raise it (Small, Medium, Large, Legendary). Higher gives better Tally rewards.' },
    { term: 'Temple Blessing Chests', aka: ['Temple Blessing Chest'], meaning: 'Chests that appear near a Temple after its contest. Any survivor can send troops to claim them.' },
    { term: 'Watchtower', aka: ['Watchtowers'], meaning: 'Your shelter on the season map. Inside your camp territory it is protected, except in the invasion window, Temple Contests and the Enemy Buster free-teleport window.', image: { src: '/s6/rule-watchtower.webp', alt: 'Watchtower Protection rules', caption: 'In-game: Watchtower Protection.' } },
    { term: 'Camp Spawn Area', meaning: 'The part of your Camp Base with the Lv.1 Camp Outpost. Peace Shield and Frankenstein work only here.', image: { src: '/s6/rule-spawn.webp', alt: 'Camp Spawn Area rules', caption: 'In-game: Camp Spawn Area.' } },
    { term: 'Peace Shield', meaning: 'A shield that works only in the Camp Spawn Area. A teleport out of the area turns it off.' },
    { term: 'Frankenstein', meaning: 'Can be placed only in the Camp Spawn Area.' },
    { term: 'MutaBeast Hunt', meaning: 'An event. Search for the Rot Pup only in the Camp Spawn Area.' },
    { term: 'Tile on Fire', meaning: 'If you teleport while rally-targeted, in battle, or at zero durability, your old tile burns for 1 minute. No fire in Temple Contest areas.', image: { src: '/s6/rule-tile-fire.webp', alt: 'Tile on Fire rules', caption: 'In-game: Tile on Fire.' } },
    { term: 'Truce', meaning: 'After a capture, nobody can attack the territory for 8 hours.' },
    { term: 'NPC guards', meaning: 'Troops that defend a neutral Outpost or Fortress. Defeat them, then remove durability.' },
    { term: 'Durability', meaning: 'The health of a territory. At zero, the attack captures (or destroys) it.' },
    { term: 'Merit', aka: ['Merits'], meaning: 'Points from guard kills and durability damage. In a shared attack, the alliance with more Merit takes the territory.' },
    { term: 'Governor', meaning: 'The survivor who wins a Merchant Guild. The Governor stocks and opens its shop.' },
    { term: 'Trade Post Race', meaning: 'The Merchant Guild contest: 1 hour, Monday 12:00, from Day 8.' },
    { term: 'Red Packets', aka: ['Red Packet'], meaning: 'Merchant Guild tax that the Governor sends to the Alliance or Camp channel.' },
    { term: 'War Penalty Zone', meaning: 'The 50×50 area around a Merchant Guild. Attacks on shelters there do extra harm.' },
    { term: 'Destruction Value', meaning: 'Extra harm to a shelter attacked in a War Penalty Zone.' },
    { term: 'Holy Water', meaning: 'A season resource. The Holy Altars make it. It upgrades the Obelisk and other season buildings.' },
    { term: 'Obsidian', meaning: 'A season resource for the Holy Altars and the Statue of Carnage.' },
    { term: 'Curse Resistance', aka: ['Virus Resistance'], meaning: 'The stat that you must have to attack higher-level targets. The Obelisk gives it.' },
    { term: 'Scales', meaning: "The Ra's Collection currency in S6." },
    { term: "Ra's Collection", meaning: 'An exchange shop. Items change each Monday 00:00.' },
    { term: 'Season Medals', meaning: 'Growth Rebate medals. Spend them before the next season starts.' },
    { term: 'Growth Rebate', aka: ['Season Growth Rebate'], meaning: 'Season Medals for season building and Relic levels.', image: { src: '/s6/places/growth-rebate.webp', alt: 'Growth Rebate', caption: 'Season Growth Rebate.' } },
    { term: 'Rebates Redeem Shop', meaning: 'The shop for Season Medals.' },
    { term: 'Ancient Relic', aka: ['Relic'], meaning: 'The season tech tree. Runes upgrade it. Level and Runes reset at season end.', image: { src: '/s6/relic-skill.webp', alt: 'Instant Recall', caption: 'Relic skill: Instant Recall.' } },
    { term: 'Runes', meaning: 'The Ancient Relic upgrade item. Removed at season end.' },
    { term: 'Instant Recall', meaning: 'A Relic skill: recall one mod vehicle troop at once. Cooldown 22 hours.' },
    { term: 'Temple Tasks', aka: ['Temple Task', 'Divine Temples', 'Ruin Tasks'], meaning: 'Daily tasks from the Divine Temples. Same system as S5.' },
    { term: 'Museum', meaning: 'Where your Divine Artifacts are. Same system as S5.' },
    { term: 'Divine Artifacts', aka: ['Divine Artifact'], meaning: 'Season-only stat items. Same system as S5.' },
    { term: 'Season Kick-Off', meaning: 'Rank by the highest Mummy level that you kill first.' },
    { term: 'Mummy', aka: ['Mummies'], meaning: 'Season monsters for the Season Kick-Off.' },
    { term: 'Save the Divine Envoy', meaning: 'The match-3 event. A clear with no items is a Perfect Clear.' },
    { term: 'Perfect Clear', meaning: 'A Save the Divine Envoy stage completed with no items. It gives bonus rewards.' },
    { term: 'Sands Catastrophe', meaning: 'Kill Wandering Guards. Same as S5.' },
    { term: 'Puppet Emperor-V', meaning: 'A boss event. Same as S5.' },
    { term: 'Alliance Teleporter', meaning: 'Moves your shelter into your own alliance territory.' },
    { term: 'Advanced Teleporter', meaning: 'Moves your shelter into the territory of another alliance in your camp.' },
    { term: 'Enemy Buster', meaning: 'Alliance Duel day with a free-teleport window. Watchtower Protection is off during it.' },
    { term: 'Alliance Comprehensive Score', aka: ['Alliance Score'], meaning: 'The peak combat power of all members. Matchmaking uses it.' },
    { term: 'Star Map', meaning: 'The map for the strongest alliances: 1 alliance in each camp.' },
    { term: 'Elite Map', meaning: 'The next map level: 1 alliance in each camp.' },
    { term: 'Joint Map', meaning: 'A map where a camp can have more than one alliance from the same state.' },
    { term: 'Tally', meaning: 'Day 51. The camp rank is fixed and the season rewards are given.' },
    { term: 'Migrate', meaning: 'The step after the Tally on the season bar.' },
    { term: 'Season Weekly Pass', meaning: 'A paid 7-day pass with season bonuses.' },
  ],

  timeline: [
    { when: 'Day 1 · {date:1}', day: 1, kind: 'starts', title: 'Kickoff', detail: 'Season start. Challenge a Lv.1 Camp Outpost.', status: 'fact', key: true, source: 's6-manual' },
    { when: 'Day 8 · {date:8}', day: 8, kind: 'unlocks', title: 'Merchant Guild', detail: 'First Trade Post Race, 12:00, inside your camp.', status: 'fact', source: 's6-merchant' },
    { when: 'Day 16 · {date:16}', day: 16, kind: 'unlocks', title: 'Invade', detail: 'Passes open. Tuesday and Thursday invasions start.', status: 'fact', key: true, source: 's6-manual' },
    { when: 'Day 39 · {date:39}', day: 39, kind: 'unlocks', title: 'Altar', detail: 'Judgement Altars open. War on them on Thursdays only.', status: 'fact', key: true, source: 's6-manual' },
    { when: 'Day 48 · {date:48}', day: 48, kind: 'unlocks', title: 'Showdown', detail: 'The last stage. The 8 camps meet at the Supreme Temple.', status: 'fact', key: true, source: 's6-manual' },
    { when: 'Day 51 · {date:51}', day: 51, kind: 'settles', title: 'Tally', detail: 'Camp rank fixed. The leader assigns the rewards. Then Migrate.', status: 'fact', key: true, source: 's6-manual' },
  ],

  map: {
    places: s6Places,
    routes: s6Routes,
    routeNote: s6RouteNote,
    summary:
      'Eight Camp Bases around the edge. The Land of Strife is the middle ring. The Temple Throne is the center, with the Supreme Temple.',
    zones: [
      { zone: 'Camp Base', where: 'Outer band, No.1–No.8', levels: 'Outposts, Fortresses', other: 'Camp Spawn Area' },
      { zone: 'Land of Strife', where: 'Middle ring', levels: 'Fortresses Lv.3–5', other: 'Lv.1–2 Ancient Temples' },
      { zone: 'Temple Throne', where: 'Center', levels: 'Altars Lv.6', other: 'Supreme Temple, Lv.3 Temples' },
    ],
    image: { src: '/s6/map.webp', alt: 'Ragnarok map', caption: 'Ragnarok map. Credit: State 69, namnam.' },
    campImage: { src: '/s6/season-map-camps.webp', alt: 'In-game Season Map', caption: 'In-game Season Map: camps No.1–No.8.' },
  },

  beforeSeason: [
    { text: 'Matchmaking uses the peak combat power of all members.', status: 'fact', source: 's6-matchmaking' },
    { text: 'The member list of each alliance is locked during matchmaking.', status: 'fact', source: 's6-preview' },
    { text: 'Our cluster (States 389–420): Day 1 is {year:1}.', status: 'fact' },
    { text: 'Agree with your camp who takes which Fortress before Day 1.', status: 'strategy' },
  ],

  phases,

  objectives: [
    { placeId: 'pass', name: 'Passes', opens: 'Day 16 · {date:16}', effect: 'Open the Land of Strife and the next camps.', reward: 'Access', status: 'fact' },
    { placeId: 'ancient-temple', name: 'Ancient Temples', opens: 'In phases, for named camps', effect: 'Camp rank gives Mithril.', reward: 'Rank 1: 180 / 320 / 900 (Lv.1–3)', status: 'fact' },
    { placeId: 'judgement-altar', name: 'Judgement Altars', opens: 'Day 39 · {date:39}', effect: '300 Mithril each Monday.', reward: '300 / week', status: 'fact' },
    { placeId: 'supreme-temple', name: 'Supreme Temple', opens: 'Showdown · Day 48', effect: 'Ranks all 8 camps.', reward: 'Rank 1: 2500 · rank 8: 200', status: 'fact' },
  ],

  rules: [
    {
      id: 'war-window',
      question: 'When can we attack?',
      quickAnswer: 'Every day, 12:00–13:00. Enemy camps only on Tuesday and Thursday, from Day 16.',
      facts: [
        { text: 'Each day, 12:00–13:00: Challenge Outposts and declare War on Fortresses next to your camp territory.', status: 'fact', source: 's6-manual' },
        { text: 'Tuesday and Thursday, 12:00–13:00: also enemy-camp Outposts and Fortresses.', status: 'fact', source: 's6-manual' },
        { text: '3 Challenge Attempts (Outposts) and 1 War Declaration Attempt (Fortress or Altar) each day.', status: 'fact', source: 's6-manual' },
        { text: 'Altars: from Week 6, War only on Thursday, 12:00–13:00.', status: 'fact', source: 's6-manual' },
        { text: 'A plan lasts until 13:00 that day.', status: 'fact', source: 's6-outpost' },
      ],
      image: { src: '/s6/season-management.webp', alt: 'Season Management screen', caption: 'In-game: attempts left today (3/3 Challenge, 1/1 War) and Mithril by source.' },
    },
    {
      id: 'territory',
      question: 'What are the territory types?',
      quickAnswer: 'Outposts connect. Fortresses and Altars make Mithril.',
      facts: [
        { text: 'Three types: Outposts, Fortresses and Altars.', status: 'fact', source: 's6-manual' },
        { text: 'Outposts connect camp territory and move the front line. They make no Mithril.', status: 'fact', source: 's6-manual' },
        { text: 'Territory of all alliances in a camp connects.', status: 'fact', source: 's6-manual' },
        { text: 'You can reinforce same-camp territory. You cannot attack it.', status: 'fact', source: 's6-manual' },
        { text: 'You cannot give up a captured territory.', status: 'fact', source: 's6-manual' },
      ],
      image: { src: '/s6/rule-territory.webp', alt: 'Territory Triumph rules', caption: 'In-game: Territory Triumph.' },
    },
    {
      id: 'capture',
      question: 'How do we capture an Outpost or Fortress?',
      quickAnswer: 'Defeat the NPC guards, then remove all durability. Owned targets have no guards.',
      steps: [
        { text: 'The target must be next to your camp territory.', status: 'fact', source: 's6-manual' },
        { text: 'The leader or an R4 starts a Challenge (Outpost) or a War (Fortress) at 12:00–13:00.', status: 'fact', source: 's6-manual' },
        { text: 'Members of that alliance can now teleport into the target area.', status: 'fact', source: 's6-manual' },
        { text: 'Defeat the guards, then remove all durability.', status: 'fact', source: 's6-outpost' },
      ],
      facts: [
        { text: 'If two alliances hit one target, the one with more Merit takes it.', status: 'fact', source: 's6-outpost' },
        { text: 'A new owner starts an 8-hour truce.', status: 'fact', source: 's6-outpost' },
        { text: 'Guards and durability come back over time.', status: 'fact', source: 's6-outpost' },
      ],
    },
    {
      id: 'destroy',
      question: 'What happens when an enemy breaches our Fortress?',
      quickAnswer: 'It is destroyed for the season. The enemy camp receives 200% of its weekly Mithril.',
      facts: [
        { text: 'A breached Fortress does not change owner. It becomes ruins.', status: 'fact', source: 's6-manual' },
        { text: 'Destruction Mithril: Lv.3 = 40, Lv.4 = 120, Lv.5 = 200.', status: 'fact', source: 's6-rankings' },
        { text: 'Ruins cannot be declared on or teleported into.', status: 'fact', source: 's6-manual' },
        { text: 'If two alliances hit it, the one with the most durability damage is the destroyer.', status: 'fact', source: 's6-camp-clash' },
      ],
      avoid: [{ text: 'Do not destroy a Fortress that your camp can hold. Destruction ends its weekly Mithril.', status: 'strategy' }],
      image: { src: '/s6/rule-destruction.webp', alt: 'Destruction rules', caption: 'In-game: Destruction.' },
    },
    {
      id: 'temple',
      question: 'How does a Temple Contest work?',
      quickAnswer: 'The game names the camps. Hold the Temple to 100% Capture Progress.',
      facts: [
        { text: 'The gods open Ancient Temples and name which camps may compete for each.', status: 'fact', source: 's6-manual' },
        { text: 'Only those camps can enter or teleport into the contest area while it runs.', status: 'fact', source: 's6-data' },
        { text: 'At 100% Capture Progress, the camp holds the Temple.', status: 'fact', source: 's6-data' },
        { text: 'No owner after 90 minutes: a 30-minute Brawl Phase with progress ×3.', status: 'fact', source: 's6-data' },
        { text: 'At the end, Mithril goes by Capture Progress rank.', status: 'fact', source: 's6-manual' },
        { text: 'Kills raise the Battlefield Rating. Temple Blessing Chests appear after the contest.', status: 'fact', source: 's6-manual' },
      ],
      image: { src: '/s6/rule-temple-contest.webp', alt: 'Temple Contest rules', caption: 'In-game: Temple Contest.' },
    },
    {
      id: 'passes',
      question: 'How do Passes work?',
      quickAnswer: 'Passes are gates, not targets. They open on set days.',
      facts: [
        { text: 'Passes cannot be captured. They are only map passages.', status: 'fact', source: 's6-manual' },
        { text: 'Closed: no troops go through, and nobody can Challenge Outposts on the other side.', status: 'fact', source: 's6-manual' },
        { text: 'Open: all camp members go through. A Camp Pass is open only to its camp.', status: 'fact', source: 's6-manual' },
        { text: 'Pass names on the map: Expedition, Dawn, Strife, Divine and Camp Passes.', status: 'fact', source: 's6-manual' },
      ],
      image: { src: '/s6/rule-passes.webp', alt: 'New Passes rules', caption: 'In-game: New Passes.' },
    },
    {
      id: 'move',
      question: 'Where can we teleport?',
      quickAnswer: 'Into territory of your camp. After a Challenge or War, also into the target area.',
      facts: [
        { text: 'Own alliance territory: Alliance Teleporter. Another alliance of your camp: Advanced Teleporter.', status: 'fact', source: 's6-manual' },
        { text: 'After your alliance starts a Challenge or a War, its members can teleport into the target area.', status: 'fact', source: 's6-manual' },
        { text: 'Some areas open only with their stage. Ruins cannot be entered by teleport.', status: 'fact', source: 's6-manual' },
        { text: 'Teleport while in battle and your old tile burns for 1 minute (Tile on Fire).', status: 'fact', source: 's6-manual' },
      ],
      image: { src: '/s6/rule-teleport.webp', alt: 'Teleport rules', caption: 'In-game: Teleport.' },
    },
    {
      id: 'protection',
      question: 'When can our Watchtowers be attacked?',
      quickAnswer: 'Only in the invasion window, in Temple Contests and in the Enemy Buster free-teleport window.',
      facts: [
        { text: 'A Watchtower in your camp territory is protected at other times.', status: 'fact', source: 's6-manual' },
        { text: 'Tuesday and Thursday 12:00–13:00, Temple Contests and the Enemy Buster window turn the protection off.', status: 'fact', source: 's6-manual' },
        { text: 'Attacks on Watchtowers must follow the Pass rules.', status: 'fact', source: 's6-manual' },
        { text: 'Peace Shield works only in the Camp Spawn Area.', status: 'fact', source: 's6-manual' },
      ],
      image: { src: '/s6/rule-watchtower.webp', alt: 'Watchtower Protection rules', caption: 'In-game: Watchtower Protection.' },
    },
    {
      id: 'merchant',
      question: 'How does the Merchant Guild work?',
      quickAnswer: 'One survivor wins the Trade Post Race and becomes Governor. The Governor opens a shop.',
      facts: [
        { text: 'First contest: Monday of Week 2 (Day 8), 12:00. Then every 7 days. Each lasts 1 hour.', status: 'fact', source: 's6-merchant' },
        { text: 'The first contest is inside your camp. Later ones are open to all camps.', status: 'fact', source: 's6-merchant' },
        { text: 'Progress is per survivor. Allies do not fight inside the guild.', status: 'fact', source: 's6-merchant' },
        { text: 'A new Governor must reach 100% before the time is out.', status: 'fact', source: 's6-merchant' },
        { text: 'All members of the Governor camp receive shop discounts.', status: 'fact', source: 's6-merchant' },
      ],
      image: { src: '/s6/places/merchant-guild-lv3.webp', alt: 'Merchant Guild', caption: 'A Lv.3 Merchant Guild.' },
    },
  ],

  resources: [
    { resource: 'Mithril', earn: 'Fortresses, Altars, Temples', spend: '—', limit: '—', expires: 'Ranked at Tally', status: 'fact' },
    { resource: 'Holy Water', earn: 'Holy Altars', spend: 'Obelisk, Portal Gate', limit: '—', expires: 'Season end', status: 'fact' },
    { resource: 'Obsidian', earn: 'Unknown', spend: 'Holy Altars, Statue', limit: '—', expires: 'Season end', status: 'reported' },
    { resource: 'Scales', earn: 'Season map', spend: "Ra's Collection", limit: 'Each item', expires: 'Shop changes Monday', status: 'fact' },
    { resource: 'Season Medals', earn: 'Growth Rebate', spend: 'Rebates Redeem Shop', limit: '—', expires: 'Next season', status: 'fact' },
    { resource: 'Runes', earn: 'Season events', spend: 'Ancient Relic', limit: '—', expires: 'Season end', status: 'fact' },
  ],

  routine: [
    { when: 'Each day 12:00–13:00', who: 'Leader / R4', action: '3 Challenges and 1 War.', status: 'fact' },
    { when: 'Tue + Thu 12:00–13:00', who: 'All members', action: 'Defend Fortresses. Watchtowers can be attacked.', status: 'fact' },
    { when: 'Thu 12:00–13:00 (Day 39+)', who: 'Leader / R4', action: 'War on a Judgement Altar.', status: 'fact' },
    { when: 'Mon 00:00', who: 'All members', action: 'Mithril payout from Fortresses and Altars.', status: 'fact' },
    { when: 'Mon 12:00 (Day 8+)', who: 'Strong members', action: 'Merchant Guild contest.', status: 'fact' },
    { when: 'Each day', who: 'All members', action: 'Temple Tasks. Upgrade Holy Altars, Obelisk, Relic.', status: 'fact' },
  ],

  reference: [
    {
      id: 'season',
      title: 'Season',
      items: [
        {
          id: 'season-bar', title: 'Season bar', summary: 'The same season days in every group.',
          points: [
            { text: 'Kickoff Day 1, Invade Day 16, Altar Day 39, Showdown Day 48, Tally Day 51, then Migrate.', status: 'fact', source: 's6-manual' },
            { text: 'Official group: Jul 20, Aug 4, Aug 27, Sep 5, Sep 8. Screenshot group: Sep 21, Oct 6, Oct 29, Nov 7, Nov 10.', status: 'fact', source: 's6-manual' },
            { text: 'Our cluster (States 389–420): {year:1}, {date:16}, {date:39}, {date:48}, {year:51}.', status: 'inferred' },
          ],
          image: { src: '/s6/season-bar.webp', alt: 'Season bar', caption: 'In-game season bar of a group that started Sep 21.' },
        },
        {
          id: 'mithril-example', title: 'Final ranking of one group', summary: 'Mithril of the 8 camps at the Tally.',
          points: [
            { text: 'Ranks 1–8: 7,580 · 5,720 · 5,390 · 4,680 · 4,460 · 3,660 · 2,890 · 2,270.', status: 'fact', source: 's6-manual' },
            { text: 'Rank 1: Temples 3,900, Capture Fortress 2,880, Capture Altar 600, Destroy Fortress 200.', status: 'fact', source: 's6-manual' },
            { text: 'Rank 8: Temples 710, Fortresses 1,400 (20 each week), Destroy 160, Altar 0.', status: 'fact', source: 's6-manual' },
          ],
          image: { src: '/s6/mithril-sources-rank1.webp', alt: 'Mithril Acquisition Details', caption: 'In-game: Mithril Acquisition Details of the rank 1 camp.' },
        },
        {
          id: 'camp-clash-phases', title: 'Camp Clash phase names', summary: 'A second, five-phase view in the Camp Clash event.',
          points: [
            { text: 'Phase I First Arrival at Court · Phase IV Divine Domain Clash · Phase V Total War.', status: 'reported', source: 's6-data' },
            { text: 'Each phase opens more borders (green = accessible, red = available soon).', status: 'reported', source: 's6-data' },
          ],
          image: { src: '/s6/camp-clash.webp', alt: 'Camp Clash', caption: 'Camp Clash screen (one group).' },
        },
        {
          id: 'matchmaking', title: 'Matchmaking', summary: 'How alliances are put on a map.',
          points: [
            { text: 'Alliance Comprehensive Score: peak power of all members.', status: 'fact', source: 's6-matchmaking' },
            { text: 'Star and Elite Maps: 1 alliance in each camp. Joint Maps: more alliances from one state.', status: 'fact', source: 's6-preview' },
          ],
        },
      ],
    },
    {
      id: 'same-as-s5',
      title: 'Same as S5',
      items: [
        {
          id: 'same', title: 'Systems that did not change', summary: 'Play these the same way as in Origin Lands.',
          points: [
            { text: 'Temple Tasks (Divine Temples), the Museum and Divine Artifacts.', status: 'fact', source: 's6-directory' },
            { text: 'Season Kick-Off (Mummy ranking), Sands Catastrophe, Puppet Emperor-V.', status: 'fact', source: 's6-directory' },
            { text: 'Ancient Relic with Runes and Hero Formation. New skill: Instant Recall.', status: 'fact', source: 's6-relic' },
            { text: 'Growth Rebate steps for Holy Altar I (1,500 medals to Lv.30).', status: 'fact', source: 's6-rebate' },
            { text: 'Match-3 mini game: now Save the Divine Envoy.', status: 'fact', source: 's6-envoy' },
          ],
        },
      ],
    },
    {
      id: 'buildings',
      title: 'Season buildings',
      items: [
        {
          id: 'own-buildings', title: 'Your season buildings', summary: 'Holy Altar I–IV, Obelisk, Portal Gate, Statue of Carnage.',
          points: [
            { text: 'Holy Altars make Holy Water. Holy Water upgrades the Obelisk.', status: 'fact', source: 's6-rebate' },
            { text: 'Growth Rebate also pays for Obelisk Lv.20/25/30 and Relic Lv.60–75.', status: 'fact', source: 's6-rebate' },
            { text: 'Statue of Carnage: Season Troop DMG +1% per level.', status: 'reported', source: 's6-data' },
            { text: 'Season buildings are removed when the next season starts.', status: 'fact', source: 's6-data' },
          ],
          image: { src: '/s6/places/growth-rebate.webp', alt: 'Growth Rebate', caption: 'Season Growth Rebate.' },
        },
        {
          id: 'mithril-table', title: 'Mithril table', summary: 'All values from the in-game Ranking Instructions.',
          points: [
            { text: 'Weekly: Lv.3 Fortress 20, Lv.4 60, Lv.5 100. Altar 300.', status: 'fact', source: 's6-rankings' },
            { text: 'Destroy: Lv.3 40, Lv.4 120, Lv.5 200.', status: 'fact', source: 's6-rankings' },
            { text: 'Ancient Temple rank 1–2: Lv.1 180/80, Lv.2 320/150. Lv.3 rank 1–4: 900/400/280/150.', status: 'fact', source: 's6-rankings' },
            { text: 'Supreme Temple rank 1–8: 2500/1200/1000/800/600/450/300/200.', status: 'fact', source: 's6-rankings' },
          ],
          image: { src: '/s6/mithril.webp', alt: 'Mithril table', caption: 'Mithril output overview.' },
        },
      ],
    },
  ],

  openQuestions: [
    { question: 'When does each Ancient Temple Contest open?', detail: 'The game opens them in phases and names the camps. The screenshots do not show the days.' },
    { question: 'Where does Obsidian come from?', detail: 'Building screens show Obsidian costs. No source says how to obtain it.' },
    { question: 'Does Shelter Value still apply?', detail: 'The S6 Rules tabs do not mention it.' },
    { question: 'Is the Supreme Temple Contest on Showdown day?', detail: 'The game says the 8 camps meet at the Supreme Temple at the end. It does not give the day.' },
    { question: 'Which Pass opens on which day?', detail: 'Invade (Day 16) opens the first Passes. Divine Passes into the Temple Throne: day not shown.' },
  ],

  sources: [
    { id: 's6-manual', title: 'In-game screenshots after the season (Rules tabs, season bar, Season Map, rankings, map tour)', kind: 'in-game', where: 'capture/manual-s6-screenshots (70 images, 2026-11-14)' },
    { id: 's6-preview', title: 'Season Preview', kind: 'official', where: 'Discord #s6-ragnarok', url: 'https://discord.com/channels/1263473266387845212/1525240668723609740' },
    { id: 's6-season', title: 'Season (Kickoff, Invade)', kind: 'official', where: 'Discord #s6-ragnarok', url: 'https://discord.com/channels/1263473266387845212/1529744260302376980' },
    { id: 's6-matchmaking', title: 'Matchmaking', kind: 'official', where: 'Discord #s6-ragnarok', url: 'https://discord.com/channels/1263473266387845212/1525256941205459034' },
    { id: 's6-map', title: 'Maps', kind: 'official', where: 'Discord #s6-ragnarok', url: 'https://discord.com/channels/1263473266387845212/1529183884821004338' },
    { id: 's6-camp-clash', title: 'Camp Clash', kind: 'official', where: 'Discord #s6-ragnarok', url: 'https://discord.com/channels/1263473266387845212/1560226427096277043' },
    { id: 's6-territory', title: 'Territory Triumph', kind: 'official', where: 'Discord #s6-ragnarok', url: 'https://discord.com/channels/1263473266387845212/1532230439794638868' },
    { id: 's6-outpost', title: 'Outpost', kind: 'official', where: 'Discord #s6-ragnarok', url: 'https://discord.com/channels/1263473266387845212/1533082573004341379' },
    { id: 's6-rankings', title: 'Rankings/Rewards (Mithril)', kind: 'official', where: 'Discord #s6-ragnarok + in-game Ranking Instructions', url: 'https://discord.com/channels/1263473266387845212/1535598058446913636' },
    { id: 's6-merchant', title: 'Merchant Guild', kind: 'official', where: 'Discord #s6-ragnarok', url: 'https://discord.com/channels/1263473266387845212/1533828201292497099' },
    { id: 's6-relic', title: 'Ancient Relic', kind: 'official', where: 'Discord #s6-ragnarok', url: 'https://discord.com/channels/1263473266387845212/1533042373938905149' },
    { id: 's6-rebate', title: 'Season Growth Rebate', kind: 'official', where: 'Discord #s6-ragnarok', url: 'https://discord.com/channels/1263473266387845212/1560223632007893022' },
    { id: 's6-kickoff', title: 'Season Kick-Off', kind: 'official', where: 'Discord #s6-ragnarok', url: 'https://discord.com/channels/1263473266387845212/1529749742668484728' },
    { id: 's6-envoy', title: 'Save The Divine Envoy', kind: 'official', where: 'Discord #s6-ragnarok', url: 'https://discord.com/channels/1263473266387845212/1532736019688984687' },
    { id: 's6-directory', title: 'Season 6 Directory', kind: 'official', where: 'Discord #s6-ragnarok', url: 'https://discord.com/channels/1263473266387845212/1524836801087279247' },
    { id: 's6-ra', title: "Ra's Collection", kind: 'official', where: 'Discord #s6-ragnarok', url: 'https://discord.com/channels/1263473266387845212/1540023596028792882' },
    { id: 's6-data', title: 'Season 6 data channel (Temple Strife rules, buildings, Camp Clash)', kind: 'community', where: 'HCB Information #season-6-data', url: 'https://discord.com/channels/1321252815515156620/1506709859071164447' },
  ],

  changelog: [
    { date: '2026-11-14', version: '1.1', change: 'Added 70 in-game screenshots: real season bar (Day 1/16/39/48/51), Rules tabs, Judgement Altars, Passes, Watchtower Protection, Temple Contest, final Mithril ranking. Dates are now relative to a start date (default: States 389–420, Nov 23). Map pins measured and checked with in-game coordinates; blue blocks are Ancient Temples.' },
    { date: '2026-11-14', version: '1.0', change: 'First full S6 guide from the Discord capture.' },
  ],

  quickCards,
  briefing,
}

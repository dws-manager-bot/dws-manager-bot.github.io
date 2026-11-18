import type { AudiencePlan, DecisionTree, QuickCard, WorkedExample } from '../types'

/**
 * Season 5 — practical layers from the Game Guide Design Playbook:
 *  - quick-reference cards (§5.4)
 *  - officer decision trees (§4, §5.3)
 *  - worked examples for a newcomer and an advanced player (§6, template 8.2 EXAMPLE)
 *  - plans for each kind of player (§6 "Who this affects")
 * Text: ASD-STE100. Every rule here is also in s5.ts with its source and label.
 */

export const s5QuickCards: QuickCard[] = [
  {
    id: 'card-declare',
    title: 'Declare war on a city',
    trigger: 'Wednesday or Saturday, 11:00–15:00 server time. Leader or R4 only.',
    steps: [
      'Make sure that your camp has a tile line that touches the city.',
      'Open the city. Select Declare war.',
      'Tell the alliance the city name and the time.',
      'Attack until 15:00. The declaration stays active until 15:00.',
    ],
    warning: 'Maximum 2 declarations each day. Enemy-camp cities: Saturday only.',
    link: 'declare-war',
  },
  {
    id: 'card-oasis',
    title: 'Capture an oasis',
    trigger: 'Each day. Leader or R4 starts it. 2 Captures each day.',
    steps: [
      'Start a Capture on the oasis.',
      'In 4 hours, connect a tile to the oasis.',
      'All members attack until its durability is zero.',
      'Collect Holy Water in Alliance > Alliance Territory > Oasis.',
    ],
    warning: 'If another alliance has more capture progress, it captures the oasis.',
    link: 'oasis',
  },
  {
    id: 'card-saturday',
    title: 'Saturday defense',
    trigger: 'Every Saturday, before 11:00 server time.',
    steps: [
      'Be online from 11:00 to 15:00.',
      'Garrison the cities that are near the enemy camp.',
      'Repair cut tile lines.',
      'Keep healing items and speedups ready.',
    ],
    warning: 'Saturday 11:00–15:00 is the only time the enemy camp can declare war on your cities.',
    link: 'routine',
  },
  {
    id: 'card-attack',
    title: 'Attack a city',
    trigger: 'Your alliance has a declaration on the city.',
    steps: [
      'Make sure that you have enough Virus Resistance (Lv.1 Pyramid: 1,500).',
      'Make sure that one tile of your camp touches the city.',
      'Join the rally or attack the city.',
      'If the attack option is not there, look for a cut in the tile line.',
    ],
    warning: 'Without enough Virus Resistance, your troops do −99% damage.',
    link: 'attack-a-city',
  },
  {
    id: 'card-enemy-buster',
    title: 'Enemy Buster day',
    trigger: 'Alliance Duel Day 6.',
    steps: [
      'Teleport into the rival alliance area. Teleport is free on this day.',
      'Attack rival units for extra Alliance Duel points.',
      'Before the day ends, move your shelter back into your camp territory.',
    ],
    warning: 'At the end of the day, the game recalls each shelter outside its camp territory.',
    link: 'move',
  },
  {
    id: 'card-shelter',
    title: 'Before each march',
    trigger: 'Each time you send troops to a city, Gate or fortress.',
    steps: [
      'On the march screen, look at Estimated Shelter Value at Target.',
      'If it is less than 100, move your shelter nearer or put a Portal Point near the target.',
      'Put the Portal Point on a 2×2 area of your own tiles, within 10 tiles of the target.',
      'March from the Portal Point.',
    ],
    warning: 'At Shelter Value 70, your troops deal 36% less damage and take 105% more damage.',
    link: 'shelter-value',
  },
  {
    id: 'card-fortress',
    title: 'Fortress Saturday',
    trigger: 'Week 2, 4, 6 and 7 Saturdays (Day 13, 27, 41, 48).',
    steps: [
      'Before Saturday: make a tile line and put Portal Points near the objective.',
      'In-game, open the event screen and tap Go View to find the objective.',
      'Look at the Shelter Value on the march screen. Below 100, march from a nearer Portal Point.',
      'On Saturday, send all camp alliances. Join each declaration (Great Merit).',
      'After the fight, hold the objective. Garrison it.',
    ],
    warning: 'If the enemy holds it, your camp cannot go forward to the next zone.',
    link: 'objectives',
  },
]

export const s5Decisions: DecisionTree[] = [
  {
    id: 'tree-target',
    title: 'Which city do we declare war on today?',
    who: 'Leader and R4',
    start: 'q-city',
    nodes: [
      {
        id: 'q-city',
        question: 'Does your alliance hold a city now?',
        options: [
          { label: 'No', answer: 'Declare war on a Lv.1 city in your camp base. That is the only permitted target.', status: 'fact' },
          { label: 'Yes', next: 'q-day' },
        ],
      },
      {
        id: 'q-day',
        question: 'Is today Saturday, and is there an enemy-camp city next to your territory?',
        options: [
          { label: 'Yes', next: 'q-defend' },
          { label: 'No', next: 'q-level' },
        ],
      },
      {
        id: 'q-defend',
        question: 'Is a key objective open today (Day 13, 27, 41 or 48)?',
        options: [
          { label: 'Yes', answer: 'Put the declarations on the key objective and the cities next to it. All camp alliances attack together.', status: 'strategy' },
          { label: 'No', answer: 'Declare war on the enemy-camp city with the highest level that your tile line touches. Keep members ready to defend.', status: 'strategy' },
        ],
      },
      {
        id: 'q-level',
        question: 'Is there a city of a higher level next to your territory, with a tile line to it?',
        options: [
          { label: 'Yes', answer: 'Declare war on the higher-level city. Higher level gives more Influence.', status: 'strategy' },
          { label: 'No', answer: 'Do not declare today. Make a tile line to a higher-level city first. You can declare only on adjacent cities.', status: 'strategy' },
        ],
      },
    ],
  },
  {
    id: 'tree-saturday',
    title: 'The enemy attacks one of our cities on Saturday. What do we do?',
    who: 'Leader, R4 and rally leads',
    start: 'q-line',
    nodes: [
      {
        id: 'q-line',
        question: 'Can your members cut the enemy tile line to the city? (Is their line long or thin?)',
        options: [
          { label: 'Yes', answer: 'Attack the tiles of their line. If their line is cut, they cannot attack the city.', status: 'strategy' },
          { label: 'No', next: 'q-value' },
        ],
      },
      {
        id: 'q-value',
        question: 'Is the city Lv.4 or higher, or a key objective?',
        options: [
          { label: 'Yes', answer: 'Defend it with garrisons and rallies. It gives much Influence, or it opens the path for the enemy.', status: 'strategy' },
          { label: 'No', next: 'q-strength' },
        ],
      },
      {
        id: 'q-strength',
        question: 'Is the enemy force much stronger than your available members?',
        options: [
          { label: 'Yes', answer: 'Do not lose troops on it. Take it back on the next declaration day. Use healing items on the cities that matter more.', status: 'strategy' },
          { label: 'No', answer: 'Defend it. Each lost city removes its Influence at season end.', status: 'strategy' },
        ],
      },
    ],
  },
  {
    id: 'tree-spend',
    title: 'Do I spend this season resource now?',
    who: 'All members',
    start: 'q-expire',
    nodes: [
      {
        id: 'q-expire',
        question: 'Is it a season resource (Runes, Holy Water, Season Medals, Amber, artifacts)?',
        options: [
          { label: 'Yes', next: 'q-use' },
          { label: 'No', answer: 'This guide does not cover it. Normal game items stay after the season.', status: 'inferred' },
        ],
      },
      {
        id: 'q-use',
        question: 'Does it make your season troops stronger now (Relic, Obelisk, Holy Altar)?',
        options: [
          { label: 'Yes', answer: 'Spend it now. Season resources are removed at season end. Stats now help you hold cities longer.', status: 'fact' },
          { label: 'No (shop items)', answer: 'Spend it before season end. Unused Season Medals and Runes are removed.', status: 'fact' },
        ],
      },
    ],
  },
]

export const s5WorkedExamples: WorkedExample[] = [
  {
    id: 'ex-newcomer',
    who: 'Newcomer',
    title: 'Your first week as a new member',
    start: 'Day 2. You joined the alliance yesterday. Your alliance has an Alliance Center and no city. You do not know the map.',
    steps: [
      'Open the season map. Find your Alliance Center (the officers tell you the coordinates).',
      'Use the Alliance Teleporter to move your shelter into your alliance territory.',
      'Occupy tiles where the officers tell you, one next to the other, toward the target city.',
      'Do 2 Ruin Tasks. Claim the rewards.',
      'Upgrade the Obelisk until Virus Resistance is 1,500 or more.',
      'On Wednesday 11:00, join the attack on the declared Lv.1 Pyramid.',
    ],
    outcome: 'Your alliance holds its first city (+20 Influence). You have 1,500 Virus Resistance, so your troops do full damage.',
    check: 'The city shows your alliance name. Your Virus Resistance shows 1,500 or more.',
  },
  {
    id: 'ex-advanced',
    who: 'Advanced',
    title: 'Sands Fortress day as a rally lead',
    start: 'Day 26 (Friday). Your camp holds the Lv.4 cities near the Sands Fortress (West). The fortress opens tomorrow (Day 27).',
    steps: [
      'Friday: check the tile line to the Sands Fortress. Make a second line.',
      'Friday: put a Portal Point on a 2×2 tile area within 10 tiles of the fortress.',
      'Saturday before 11:00: move your shelter as near as the rules permit. Use the Advanced Teleporter.',
      'Saturday 11:00: lead rallies on the fortress. Other camp alliances attack too.',
      'After the capture: garrison the fortress. Watch for enemy attacks on your tile line.',
    ],
    outcome: 'Your camp holds the Sands Fortress (West). The enemy cannot use this path to the Temple Fortress.',
    check: 'The Sands Fortress Conquest screen shows your camp shield with "Victory".',
  },
  {
    id: 'ex-officer',
    who: 'Officer',
    title: 'Keep the alliance above 3000 Influence',
    start: 'Week 6. Your alliance has 3,100 Influence. The enemy camp declares war on two of your border cities (a Lv.4 and a Lv.3) on Saturday.',
    steps: [
      'Before Saturday, calculate the Influence of each border city. Players report Lv.3 = 60 and Lv.4 = 120.',
      'The two cities together are 180 Influence. If you lose both, you have 2,920: below 3000. Defend both.',
      'On Saturday, declare war on a city of the same or a higher level, as a reserve.',
      'After 15:00, check the alliance Influence total.',
    ],
    outcome: 'The alliance stays at 3000 Influence or more. It receives the Domination Reward, if the camp wins or loses.',
    check: 'Alliance Influence in the season ranking shows 3000 or more at season end.',
  },
]

export const s5Audiences: AudiencePlan[] = [
  {
    id: 'new',
    who: 'New or returning player',
    description: 'You do not know the season. You want to help without mistakes.',
    priorities: [
      'Learn the 8 key words (Camp, City, Tile, Declaration, Influence, Key objective, Connected, Server time).',
      'Upgrade the Obelisk to 1,500 Virus Resistance.',
      'Do 2 Ruin Tasks each day.',
      'Join the attacks that the officers declare.',
    ],
    skip: ['Decision trees', 'Reference section', 'Merit charts'],
  },
  {
    id: 'casual',
    who: 'Casual player (short play time)',
    description: 'You play a few minutes each day.',
    priorities: [
      'Each day: 2 Ruin Tasks, collect Holy Water, upgrade the Obelisk.',
      'Saturday 11:00–15:00: be online if you can. This is the most important time.',
      'Spend season resources before season end.',
    ],
    skip: ['Tile line repair', 'Route planning'],
  },
  {
    id: 'active',
    who: 'Active player',
    description: 'You play many times each day. You can make tile lines and join rallies.',
    priorities: [
      'Make and repair tile lines to the targets.',
      'Join every declaration from Week 3 (Great Merit).',
      'Garrison front cities on Saturday.',
      'Upgrade the Ancient Relic and collect Divine Artifacts.',
    ],
    skip: ['Officer decision trees'],
  },
  {
    id: 'competitive',
    who: 'Competitive player (rally lead)',
    description: 'You have strong troops. You lead attacks on cities and objectives.',
    priorities: [
      'Lead rallies on Saturday objectives (Day 13, 27, 41, 48).',
      'Prepare Portal Points and a second tile line before each objective.',
      'Aim for high Great Merit ranks.',
      'Keep healing items for Saturdays.',
    ],
    skip: [],
  },
  {
    id: 'officer',
    who: 'Officer (leader, R4)',
    description: 'You declare war, start Captures and plan with the camp.',
    priorities: [
      'Declare war on Wednesday and Saturday (max 2 each day).',
      'Start 2 oasis Captures each day.',
      'Agree on targets and borders with the other camp alliances.',
      'Keep alliance Influence at 3000 or more at season end.',
      'Use the decision trees on this page.',
    ],
    skip: [],
  },
]

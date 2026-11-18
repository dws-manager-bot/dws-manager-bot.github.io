/**
 * Content model for a season guide.
 *
 * The structure follows the "Game Guide Design Playbook" (darkwar/Game_Guide_Design_Playbook.docx):
 *  - Layer A  quick answer      -> `overview`
 *  - Layer B  practical guide   -> `timeline`, `phases`, `rules`, `routine`, `roles`, `examples`
 *  - Layer C  reference         -> `reference`, `openQuestions`, `sources`, `changelog`
 *
 * Every claim that a player could act on carries a `status` (Playbook §2 and §12):
 *  - fact         Verified in-game or in an official post.            (Playbook: VERIFIED)
 *  - reported     A community or player report. Not official.        (Playbook: REPORTED)
 *  - inferred     Our conclusion from the data, not stated anywhere. (Playbook: INFERRED)
 *  - unconfirmed  The sources disagree or do not give the data.      (Playbook: UNKNOWN)
 *  - strategy     Our recommendation. Not a game rule.               (Playbook: STRATEGY)
 *
 * Text style: ASD-STE100 (Simplified Technical English). Short sentences, imperative for
 * instructions, one word = one meaning.
 */

export type Status = 'fact' | 'strategy' | 'reported' | 'inferred' | 'unconfirmed'

/** A sentence or bullet with an evidence label and an optional source id. */
export interface Claim {
  text: string
  status: Status
  /** id of an entry in `Season.sources` */
  source?: string
}

/**
 * A glossary word. Every mention of `term` or an `aka` in guide text becomes a tap target that
 * shows the meaning (and the image, if any). Place names are handled by `Place`, not here.
 */
export interface Term {
  term: string
  aka?: string[]
  meaning: string
  image?: ImageRef
  /** Show this term in the "Key words" section (the most important ones). */
  key?: boolean
}

/** A numbered label on a screenshot (Playbook §4: annotate the control, near the action). */
export interface Callout {
  /** Position in percent of the image: x from the left, y from the top. */
  x: number
  y: number
  label: string
}

export interface ImageRef {
  src: string
  alt: string
  caption: string
  source?: string
  callouts?: Callout[]
}

export interface TimelineItem {
  /** Display label of when it happens, e.g. "Day 13" or "Week 2, Saturday". */
  when: string
  /** Sort key: approximate season day number. */
  day: number
  kind: 'starts' | 'unlocks' | 'resets' | 'ends' | 'expires' | 'settles'
  title: string
  detail: string
  status: Status
  /** id of an entry in `Season.sources` */
  source?: string
  /** Mark the most important items. */
  key?: boolean
}

/** Season phase card (Playbook template 8.3). */
export interface Phase {
  id: string
  name: string
  period: string
  /** Season days covered, for the roadmap highlight. `end: null` = to season end. */
  days: { start: number; end: number | null }
  goal: string
  unlocked: string[]
  before: Claim[]
  whenItStarts: Claim[]
  daily: Claim[]
  rewards: string[]
  dontDoThis: Claim
  handoff: string
}

/** Mechanic explainer (Playbook template 8.2). */
export interface Rule {
  id: string
  /** Question-based heading. */
  question: string
  quickAnswer: string
  doThisFirst?: string[]
  whoWhen?: string
  steps?: Claim[]
  facts?: Claim[]
  avoid?: Claim[]
  verify?: string
  image?: ImageRef
  images?: ImageRef[]
}

/**
 * A point on the community map image (public/sN/map-community.webp), in percent:
 * x = 0 (west edge) to 100 (east edge), y = 0 (north edge) to 100 (south edge).
 */
export interface MapPin {
  x: number
  y: number
}

/** A rectangle on the community map, in percent (same system as `MapPin`). */
export interface MapArea {
  x: number
  y: number
  w: number
  h: number
}

/** A named building, map object or map zone. Shown with its image and its map position, so players can find it. */
export interface Place {
  id: string
  name: string
  /** Other names, plural forms and in-game spellings. Used to find mentions in text. */
  aka?: string[]
  group: 'Zone' | 'Stage' | 'Key objective' | 'City' | 'Map object' | 'Your buildings'
  /** One sentence: what it is and why it matters. */
  what: string
  /** Where it is, in words. */
  where: string
  /** Evidence label for `where` (the position), separate from the facts. */
  whereStatus: Status
  /** In-game coordinates, if a source gives them. */
  coords?: string
  pins?: MapPin[]
  /** Map areas to highlight (zones). */
  areas?: MapArea[]
  /** Zones: no own image; the map with the highlighted area is the picture. */
  image?: ImageRef
  extraImage?: ImageRef
  facts: Claim[]
}

/** A route from a camp base to the Royal Court, through the key objectives in order. */
export interface Route {
  id: string
  /** S5: 'Anubis' | 'Horus'. S6: 'No.1' … 'No.8'. */
  camp: string
  side: 'West' | 'East'
  /** Route colour (camp colour) and the number colour that is readable on it. */
  color?: string
  ink?: string
  steps: { placeId: string; label: string; when: string; pin: MapPin }[]
}

export interface Objective {
  /** id of the matching `Place`, for its image and position. */
  placeId?: string
  name: string
  opens: string
  effect: string
  reward: string
  status: Status
}

export interface ResourceRow {
  resource: string
  earn: string
  spend: string
  limit: string
  expires: string
  status: Status
}

export interface RoutineItem {
  when: string
  who: string
  action: string
  status: Status
}

export interface RolePlan {
  role: string
  who: string
  tasks: string[]
}

export interface Scenario {
  title: string
  start: string
  question: string
  options: string[]
  answerIndex: number
  why: string
}

export interface ReferenceItem {
  id: string
  title: string
  summary: string
  points: Claim[]
  image?: ImageRef
}

export interface ReferenceGroup {
  id: string
  title: string
  items: ReferenceItem[]
}

export interface OpenQuestion {
  question: string
  detail: string
}

export interface Source {
  id: string
  title: string
  kind: 'official' | 'community' | 'in-game'
  where: string
  /** Link to the Discord post (members of the server can open it). */
  url?: string
}

export interface ChangeEntry {
  date: string
  version: string
  change: string
}

export interface Season {
  slug: string
  number: number
  name: string
  tagline: string
  /** Is this season fully written, or only a stub? */
  ready: boolean
  serverTimeNote: string
  lastVerified: string
  version: string
  /** Person or team that keeps this guide correct (Playbook §11). */
  owner: string
  /**
   * Relative schedule. Text uses season days and `{date:N}` tokens (see lib/dates.ts); the site
   * fills the tokens from `start`, or from the start date that the reader picks.
   */
  schedule?: {
    /** ISO date of Day 1 for the default server group, e.g. '2026-11-23'. */
    start: string
    /** Who the default start is for, e.g. 'States 389–420'. */
    label: string
    /** Last season day shown on the roadmap (the tally day). */
    lastDay: number
  }
  overview: {
    whatIsIt: string
    winCondition: Claim[]
    doThisFirst: Claim[]
    biggestMistake: Claim
    minimumTarget: Claim
  }
  terms: Term[]
  timeline: TimelineItem[]
  map: {
    summary: string
    places: Place[]
    routes: Route[]
    routeNote: string
    zones: { zone: string; where: string; levels: string; other: string }[]
    image: ImageRef
    campImage: ImageRef
  }
  beforeSeason: Claim[]
  phases: Phase[]
  objectives: Objective[]
  rules: Rule[]
  resources: ResourceRow[]
  routine: RoutineItem[]
  /** Not rendered since v1.4 (players found it unnecessary). Optional; skip for new seasons. */
  roles?: RolePlan[]
  /** Practice quiz. Not rendered since v1.4 ("feels like an exam"). Optional. */
  examples?: Scenario[]
  reference: ReferenceGroup[]
  openQuestions: OpenQuestion[]
  sources: Source[]
  changelog: ChangeEntry[]
  quickCards: QuickCard[]
  /** Officer decision trees, worked examples, plans by player type: not rendered since v1.4. Optional. */
  decisions?: DecisionTree[]
  workedExamples?: WorkedExample[]
  audiences?: AudiencePlan[]
  briefing?: Briefing
}

/** Quick-reference card (Playbook §5.4): for a repeated task during play. */
export interface QuickCard {
  id: string
  title: string
  /** When to use this card. */
  trigger: string
  steps: string[]
  warning: string
  /** Section id in the full guide. */
  link: string
}

/** Decision tree (Playbook §4, §5.3). Each node asks one decisive question. */
export interface DecisionNode {
  id: string
  question: string
  options: { label: string; next?: string; answer?: string; status?: Status }[]
}
export interface DecisionTree {
  id: string
  title: string
  who: string
  start: string
  nodes: DecisionNode[]
}

/** Worked example (Playbook 8.2 EXAMPLE, §6): start state → actions → expected outcome. */
export interface WorkedExample {
  id: string
  who: 'Newcomer' | 'Advanced' | 'Officer'
  title: string
  start: string
  steps: string[]
  outcome: string
  check: string
}

/** Plan for one kind of player (Playbook §6 "Who this affects"). */
export interface AudiencePlan {
  id: string
  who: string
  description: string
  priorities: string[]
  skip: string[]
}

/** Data for the slide deck (/sN/slides): infographics and charts. */
export interface Briefing {
  /** Slide titles by slide id. A title states the point of the slide. Missing id = default title. */
  titles: Record<string, string>
  /** Cause chain from city to season win. */
  winFlow: { label: string; detail: string }[]
  /** Ways to get end rewards. */
  rewardPaths: { condition: string; reward: string; status: Status }[]
  /** Steps to attack a city, in order. */
  attackFlow: { label: string; detail: string }[]
  /** Season roadmap. `day` is the season day (1 = first day). */
  roadmap: {
    zones: { name: string; startDay: number; levels: string }[]
    objectives: { name: string; day: number; when: string }[]
    lastDay: number
    note: string
  }
  /** One week, Monday to Sunday. */
  week: { day: string; events: { time: string; label: string; detail: string; tone: 'all' | 'own-camp' | 'enemy' }[] }[]
  /** Things to do every day, any day of the week. */
  everyDay: string[]
  meritLevels: { rank: string; stars: number; points: number }[]
  growthRebate: { altar: string; level: number; medals: number }[]
  /** Influence by city level (player report: label the chart `reported`). Optional. */
  influenceLevels?: { level: string; influence: number }[]
  /** Shelter Value rule (in-game). Values for the distance chart. Optional. */
  shelter?: { freeTiles: number; dealtPerPoint: number; dealtMax: number; takenPerPoint: number; takenMax: number }
  /**
   * Score by source, for a slide with a table instead of the Merit chart (S6: Mithril).
   * `temple` = rows of rank → amount for that tier.
   */
  scoreSources?: ScoreTable
  /** A worked example of the score (S6: where the Mithril of each camp came from). */
  scoreExample?: ScoreTable
}

/** Small labelled number tables, shown side by side on one slide. */
export interface ScoreTable {
  title: string
  groups: { label: string; rows: { label: string; value: string }[] }[]
  status: Status
  note?: string
}

/* ------------------------------------------------------------------ */
/* Compare-only mode: a season against the one before it.             */
/* ------------------------------------------------------------------ */

export type CompareStatus = 'changed' | 'same' | 'unconfirmed'

/** One row of a comparison section. */
export interface CompareRow {
  what: string
  /** The earlier season's value, or "—". */
  s5: string
  /** This season's value. */
  s6: string
  status: CompareStatus
  source: string
}

export interface CompareSection {
  id: string
  title: string
  rows: CompareRow[]
}

/** Data for /sN/compare: only the changes and what stays the same. */
export interface Compare {
  slug: string
  number: number
  name: string
  against: { slug: string; name: string; number: number }
  tagline: string
  lastVerified: string
  version: string
  /** The one-sentence change that matters most. */
  headline: string
  keyChanges: { title: string; text: string; status: CompareStatus; source: string }[]
  sections: CompareSection[]
  openQuestions: { question: string; detail: string }[]
  sources: Source[]
  changelog: ChangeEntry[]
  /** Data for the compare slides (/sN/compare). */
  visuals?: CompareVisuals
}

/** A picture card: one system, its image, and how it compares. */
export interface CompareCard {
  title: string
  text: string
  image?: string
  status?: CompareStatus | 'gone'
}

export interface CompareVisuals {
  /** Big before → after pairs on the first slide. */
  glance: { label: string; s5: string; s6: string }[]
  /** Territory types, with pictures. */
  territories: { s5: CompareCard[]; s6: CompareCard[] }
  /** How each season scores: bars (each list has its own scale). */
  score: {
    s5: { title: string; unit: string; rows: { label: string; value: number }[] }
    s6: { title: string; unit: string; rows: { label: string; value: number }[] }
  }
  /** Season days of the main events. */
  calendar: {
    s5: { day: number; label: string }[]
    s5Last: number
    s6: { day: number; label: string }[]
    s6Last: number
  }
  /** War days in one week (Mon … Sun). */
  week: {
    s5: { warDays: string[]; enemyDays: string[]; time: string; note: string }
    s6: { warDays: string[]; enemyDays: string[]; time: string; note: string }
  }
  /** Buildings inside your shelter/base. */
  base: CompareCard[]
  same: CompareCard[]
  added: CompareCard[]
  gone: CompareCard[]
}

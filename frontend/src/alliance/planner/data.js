/*
 * Survival Preparedness (SP) and Alliance Duel (AD), as pou-rocks.github.io's
 * planner has them (chunk 818 of its live build, which drifted ahead of the
 * dws-planner repos it came from). The game sends each slot's theme at run
 * time; none of this ships in the client, so it is the alliance's reading of
 * the game, not the game's own data.
 *
 * Actions are ids; their words are in messages/planner. An action scores in
 * both events when the SP theme and the day's AD theme both list it.
 */

/** SP themes in rotation order; slot `s` of weekday `d` (Monday 0) is
    SP_ROTATION[(6d + s) mod 5]. */
export const SP_ROTATION = [
  {
    key: 'shelter_expansion',
    actions: ['construction_speed_ups', 'finish_building_upgrades'],
  },
  {
    key: 'hero_initiative',
    actions: ['recruitment_tickets', 'hero_fragments', 'exclusive_equipment_fragments'],
  },
  {
    key: 'unit_training',
    actions: [
      'training_speed_ups',
      'complete_new_unit_batches',
      'promote_units_to_higher_tiers',
      'consume_advanced_tactical_rations',
      'consume_nutrient_potions',
      'consume_potential_chips',
      'consume_special_ops_honor_medals',
      'consume_standard_training_protocols',
      'consume_advanced_training_protocols',
    ],
  },
  {
    key: 'age_of_science',
    actions: ['research_speed_ups', 'finish_science_tech_research', 'wisdom_medals'],
  },
  {
    key: 'arms_expert',
    actions: [
      'gears',
      'titaniums',
      'design_blueprints',
      'power_cores',
      'hero_equipment_lucky_chests',
      'open_chip_chests',
    ],
  },
]

/** The AD theme of each server weekday, Monday first. Sunday the duel rests. */
export const AD_WEEK = [
  {
    key: 'shelter_expansion',
    actions: [
      'construction_speed_ups',
      'research_speed_ups',
      'finish_building_upgrades',
      'finish_science_tech_research',
      'wisdom_medals',
      'field_resource_gathering',
    ],
  },
  {
    key: 'hero_initiative',
    actions: ['recruitment_tickets', 'hero_fragments', 'exclusive_equipment_fragments', 'complete_radar_missions'],
  },
  {
    key: 'keep_progressing',
    actions: [
      's_class_truck_escorts',
      'orange_shadow_call_missions',
      'power_cores',
      'hero_equipment_lucky_chests',
      'training_speed_ups',
      'complete_new_unit_batches',
      'promote_units_to_higher_tiers',
    ],
  },
  {
    key: 'arms_expert',
    actions: [
      'gears',
      'titaniums',
      'design_blueprints',
      'open_chip_chests',
      'complete_radar_missions',
      'construction_speed_ups',
      'research_speed_ups',
      'training_speed_ups',
      'kill_roamer_zombies',
      'kill_boomer_zombies',
    ],
  },
  {
    key: 'holistic_growth',
    actions: [
      'gears',
      'titaniums',
      'design_blueprints',
      'open_chip_chests',
      'power_cores',
      'wisdom_medals',
      'hero_fragments',
      'exclusive_equipment_fragments',
      'construction_speed_ups',
      'research_speed_ups',
      'training_speed_ups',
      'consume_advanced_tactical_rations',
      'consume_nutrient_potions',
      'consume_potential_chips',
      'consume_special_ops_honor_medals',
      'consume_standard_training_protocols',
      'consume_advanced_training_protocols',
    ],
  },
  {
    key: 'enemy_buster',
    actions: ['s_class_truck_escorts', 'orange_shadow_call_missions', 'kill_enemy_units', 'lose_units_in_battle'],
  },
  null,
]

export const THEME_COLORS = {
  shelter_expansion: '#ff6b6b',
  hero_initiative: '#ffa600',
  unit_training: '#4cc9f0',
  age_of_science: '#5e60ce',
  arms_expert: '#ffd166',
  keep_progressing: '#b5179e',
  holistic_growth: '#06d6a0',
  enemy_buster: '#f72585',
}

/** Capital titles whose buffs help an SP theme. A theme missing here, or
    listing none, has no title worth asking for. */
export const OFFICIALS = {
  shelter_expansion: {
    best: ['secretary_of_construction'],
    also: ['scale_of_law', 'vice_president'],
  },
  unit_training: {
    best: ['scale_of_law', 'supreme_general', 'secretary_of_security'],
    also: [],
  },
  age_of_science: {
    best: ['secretary_of_science'],
    also: ['scale_of_law', 'vice_president'],
  },
}

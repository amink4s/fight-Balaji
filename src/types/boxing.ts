/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type PunchType = 'jab' | 'cross' | 'left_hook' | 'right_hook' | 'uppercut';
export type DefenseAction = 'none' | 'block' | 'slip_left' | 'slip_right';
export type OpponentFaceState = 'normal' | 'hurt' | 'beat';

export type FighterArchetype = 'speed' | 'power' | 'counter';

export interface FighterProfile {
  name: string;
  nickname: string;
  archetype: FighterArchetype;
  gloveColor: string; // hex
  gloveAccent: string; // hex
  trunksColor: string;
}

export interface FighterStats {
  maxHp: number;
  hp: number;
  maxStamina: number;
  stamina: number;
  staminaRegenRate: number; // per second
  powerMultiplier: number;
  defenseReduction: number;
}

export interface ChampionshipMatchConfig {
  name: string;
  alias: string;
  subtitle: string;
  beltTitle: string;
  beltColor: string;
  maxHp: number;
  power: number;
  stamina: number;
  staminaRegen: number;
  aggression: number;
  blockChance: number;
  slipChance: number;
  attackCooldown: number;
  totalRounds: number;
  roundDurationSeconds: number;
}

export interface LeaderboardEntry {
  id: string;
  playerName: string;
  nickname: string;
  archetype: FighterArchetype;
  roundReached: number;
  score: number;
  fightTimeSeconds: number;
  maxCombo: number;
  date: string;
  isPlayer?: boolean;
}

export interface GameResult {
  won: boolean;
  round: number;
  timeSeconds: number;
  totalPunches: number;
  punchesLanded: number;
  punchesBlocked: number;
  accuracy: number;
  maxCombo: number;
  finalScore: number;
  knockdownsScored: number;
}

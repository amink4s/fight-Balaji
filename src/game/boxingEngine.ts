/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ChampionshipMatchConfig,
  FighterProfile,
  FighterStats,
  LeaderboardEntry,
  OpponentFaceState,
  PunchType,
} from '../types/boxing';

export const CHAMPIONSHIP_MATCH: ChampionshipMatchConfig = {
  name: 'World Heavyweight Championship Bout',
  alias: 'Amin "The Champ" Kasaie',
  subtitle: 'World Title Showdown',
  beltTitle: 'Undisputed World Championship Crown',
  beltColor: '#f59e0b',
  maxHp: 520, // Balanced endurance: long & epic, but accessible
  power: 9, // Gentler damage so player can brawl and trade blows
  stamina: 180,
  staminaRegen: 20,
  aggression: 0.5,
  blockChance: 0.16, // Punches land much more consistently
  slipChance: 0.07,
  attackCooldown: 2200, // Ample reaction time for player to dodge/counter
  totalRounds: 3,
  roundDurationSeconds: 90,
};

export const DEFAULT_PLAYER_PROFILE: FighterProfile = {
  name: 'Challenger',
  nickname: 'Lightning',
  archetype: 'speed',
  gloveColor: '#2563eb', // Royal Blue
  gloveAccent: '#eab308', // Gold
  trunksColor: '#1e293b',
};

export const PUNCH_CONFIG: Record<
  PunchType,
  {
    name: string;
    staminaCost: number;
    baseDamage: number;
    cooldownMs: number;
    description: string;
  }
> = {
  jab: {
    name: 'Left Jab',
    staminaCost: 6,
    baseDamage: 15,
    cooldownMs: 220,
    description: 'Fast lead strike to control distance & interrupt combos',
  },
  cross: {
    name: 'Right Cross',
    staminaCost: 12,
    baseDamage: 30,
    cooldownMs: 400,
    description: 'Powerful straight right cross through guard',
  },
  left_hook: {
    name: 'Left Hook',
    staminaCost: 15,
    baseDamage: 38,
    cooldownMs: 480,
    description: 'Arcing hook around guard that stuns opponent',
  },
  right_hook: {
    name: 'Right Hook',
    staminaCost: 17,
    baseDamage: 42,
    cooldownMs: 510,
    description: 'Heavy power hook that twists opponent head',
  },
  uppercut: {
    name: 'Uppercut',
    staminaCost: 22,
    baseDamage: 56,
    cooldownMs: 590,
    description: 'Vertical blast through guard, catastrophic on counter',
  },
};

export function getFighterBaseStats(profile: FighterProfile): FighterStats {
  switch (profile.archetype) {
    case 'speed':
      return {
        maxHp: 280,
        hp: 280,
        maxStamina: 160,
        stamina: 160,
        staminaRegenRate: 42,
        powerMultiplier: 1.1,
        defenseReduction: 0.78,
      };
    case 'power':
      return {
        maxHp: 300,
        hp: 300,
        maxStamina: 140,
        stamina: 140,
        staminaRegenRate: 35,
        powerMultiplier: 1.4,
        defenseReduction: 0.78,
      };
    case 'counter':
      return {
        maxHp: 330,
        hp: 330,
        maxStamina: 150,
        stamina: 150,
        staminaRegenRate: 38,
        powerMultiplier: 1.25,
        defenseReduction: 0.88,
      };
  }
}

// Storage helpers
const STORAGE_PROFILE_KEY = 'apex_boxer_fighter_profile';
const STORAGE_LEADERBOARD_KEY = 'apex_boxer_leaderboard';

export function loadPlayerProfile(): FighterProfile {
  try {
    const raw = localStorage.getItem(STORAGE_PROFILE_KEY);
    if (raw) {
      return { ...DEFAULT_PLAYER_PROFILE, ...JSON.parse(raw) };
    }
  } catch {
    // fallback
  }
  return DEFAULT_PLAYER_PROFILE;
}

export function savePlayerProfile(profile: FighterProfile) {
  try {
    localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // ignore
  }
}

export function loadLeaderboard(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_LEADERBOARD_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // fallback
  }

  const defaults: LeaderboardEntry[] = [
    {
      id: 'lb-1',
      playerName: 'Vitalik_Jab',
      nickname: 'Gasless',
      archetype: 'speed',
      roundReached: 3,
      score: 34500,
      fightTimeSeconds: 84,
      maxCombo: 16,
      date: 'Today',
    },
    {
      id: 'lb-2',
      playerName: 'FarcasterChamp',
      nickname: 'Warpcast KO',
      archetype: 'power',
      roundReached: 2,
      score: 29800,
      fightTimeSeconds: 105,
      maxCombo: 13,
      date: 'Yesterday',
    },
    {
      id: 'lb-3',
      playerName: 'DegenSlugger',
      nickname: 'Iron Fist',
      archetype: 'power',
      roundReached: 2,
      score: 24200,
      fightTimeSeconds: 118,
      maxCombo: 10,
      date: '2d ago',
    },
    {
      id: 'lb-4',
      playerName: 'CryptoSouthpaw',
      nickname: 'The Ghost',
      archetype: 'counter',
      roundReached: 1,
      score: 18400,
      fightTimeSeconds: 130,
      maxCombo: 9,
      date: '3d ago',
    },
  ];

  try {
    localStorage.setItem(STORAGE_LEADERBOARD_KEY, JSON.stringify(defaults));
  } catch {
    // ignore
  }
  return defaults;
}

export function addLeaderboardRecord(entry: Omit<LeaderboardEntry, 'id' | 'date'>) {
  const current = loadLeaderboard();
  const newEntry: LeaderboardEntry = {
    ...entry,
    id: 'lb-' + Date.now(),
    date: 'Just now',
    isPlayer: true,
  };
  const updated = [newEntry, ...current].sort((a, b) => b.score - a.score).slice(0, 15);
  try {
    localStorage.setItem(STORAGE_LEADERBOARD_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}

/**
 * Determine face state based on opponent HP.
 * PER USER REQUEST: The beaten face lasts much longer!
 * - Normal: 100% to 75% HP
 * - Hurt: 75% to 55% HP
 * - Beaten: 55% all the way to 0% HP (active for most of the battle!)
 */
export function determineFaceState(opponentHp: number, maxHp: number, isKnockedDown: boolean): OpponentFaceState {
  if (isKnockedDown) return 'beat';
  const ratio = opponentHp / maxHp;
  if (ratio <= 0.55) return 'beat';
  if (ratio <= 0.75) return 'hurt';
  return 'normal';
}

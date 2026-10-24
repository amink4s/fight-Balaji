/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { FighterArchetype, FighterProfile } from '../types/boxing';
import { getFighterBaseStats, savePlayerProfile } from '../game/boxingEngine';
import { sound } from '../audio/boxingSound';
import { Shield, Zap, Flame, Check, User, Sparkles, X } from 'lucide-react';

interface Props {
  profile: FighterProfile;
  onSave: (profile: FighterProfile) => void;
  onClose: () => void;
}

const GLOVE_COLORS = [
  { name: 'Royal Blue', hex: '#2563eb' },
  { name: 'Crimson Fury', hex: '#dc2626' },
  { name: 'Championship Gold', hex: '#eab308' },
  { name: 'Emerald Striker', hex: '#16a34a' },
  { name: 'Midnight Shadow', hex: '#1e293b' },
  { name: 'Cyber Purple', hex: '#9333ea' },
];

const TRUNKS_COLORS = [
  { name: 'Onyx Black', hex: '#0f172a' },
  { name: 'Classic Red', hex: '#991b1b' },
  { name: 'Navy Blue', hex: '#1e3a8a' },
  { name: 'Pure White', hex: '#e2e8f0' },
  { name: 'Golden Edge', hex: '#854d0e' },
];

export const FighterCustomizer: React.FC<Props> = ({ profile: initialProfile, onSave, onClose }) => {
  const [profile, setProfile] = useState<FighterProfile>(initialProfile);

  const stats = getFighterBaseStats(profile);

  const handleArchetypeSelect = (type: FighterArchetype) => {
    sound.playSwing();
    setProfile((prev) => ({ ...prev, archetype: type }));
  };

  const handleSave = () => {
    sound.playBell();
    savePlayerProfile(profile);
    onSave(profile);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 overflow-y-auto">
      <div className="relative w-full max-w-xl bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl p-6 text-white my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
              <User className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold font-arcade tracking-wider text-yellow-400">FIGHTER PROFILE & GEAR</h2>
              <p className="text-xs text-neutral-400">Configure your boxer archetype, stats, and ring aesthetics</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Inputs */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block mb-1">
                Fighter Name
              </label>
              <input
                type="text"
                value={profile.name}
                maxLength={18}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none"
                placeholder="Enter boxer name"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block mb-1">
                Ring Nickname
              </label>
              <input
                type="text"
                value={profile.nickname}
                maxLength={18}
                onChange={(e) => setProfile({ ...profile, nickname: e.target.value })}
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none"
                placeholder="e.g. Iron Hammer"
              />
            </div>
          </div>

          {/* Archetype Selector */}
          <div>
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
              Combat Archetype & Style
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {/* Speed */}
              <button
                type="button"
                onClick={() => handleArchetypeSelect('speed')}
                className={`p-3 rounded-xl border text-left transition-all relative ${
                  profile.archetype === 'speed'
                    ? 'border-cyan-400 bg-cyan-950/40 text-cyan-300 ring-2 ring-cyan-500/30'
                    : 'border-neutral-800 bg-neutral-950/60 text-neutral-400 hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1 text-cyan-400 font-bold text-sm">
                  <Zap className="w-4 h-4" />
                  <span>SPEED</span>
                </div>
                <div className="text-[11px] leading-tight text-neutral-400">Out-boxer. Rapid stamina recovery & fast jabs.</div>
              </button>

              {/* Power */}
              <button
                type="button"
                onClick={() => handleArchetypeSelect('power')}
                className={`p-3 rounded-xl border text-left transition-all relative ${
                  profile.archetype === 'power'
                    ? 'border-red-400 bg-red-950/40 text-red-300 ring-2 ring-red-500/30'
                    : 'border-neutral-800 bg-neutral-950/60 text-neutral-400 hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1 text-red-400 font-bold text-sm">
                  <Flame className="w-4 h-4" />
                  <span>SLUGGER</span>
                </div>
                <div className="text-[11px] leading-tight text-neutral-400">+35% Power on Hooks & Uppercuts. High stagger.</div>
              </button>

              {/* Counter */}
              <button
                type="button"
                onClick={() => handleArchetypeSelect('counter')}
                className={`p-3 rounded-xl border text-left transition-all relative ${
                  profile.archetype === 'counter'
                    ? 'border-yellow-400 bg-yellow-950/40 text-yellow-300 ring-2 ring-yellow-500/30'
                    : 'border-neutral-800 bg-neutral-950/60 text-neutral-400 hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1 text-yellow-400 font-bold text-sm">
                  <Shield className="w-4 h-4" />
                  <span>BRAWLER</span>
                </div>
                <div className="text-[11px] leading-tight text-neutral-400">Iron defense. Fortified guard & massive counter crits.</div>
              </button>
            </div>
          </div>

          {/* Archetype Stats Preview */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <div className="text-neutral-400 text-[10px] uppercase">Health (HP)</div>
              <div className="text-base font-bold text-emerald-400">{stats.maxHp}</div>
            </div>
            <div>
              <div className="text-neutral-400 text-[10px] uppercase">Max Stamina</div>
              <div className="text-base font-bold text-cyan-400">{stats.maxStamina}</div>
            </div>
            <div>
              <div className="text-neutral-400 text-[10px] uppercase">Power Mult</div>
              <div className="text-base font-bold text-yellow-400">{stats.powerMultiplier.toFixed(2)}x</div>
            </div>
          </div>

          {/* Glove Color Picker */}
          <div>
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block mb-1.5">
              Glove Leather Color
            </label>
            <div className="flex flex-wrap gap-2.5">
              {GLOVE_COLORS.map((g) => (
                <button
                  key={g.hex}
                  type="button"
                  onClick={() => setProfile({ ...profile, gloveColor: g.hex })}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                    profile.gloveColor === g.hex ? 'ring-2 ring-white scale-110' : 'opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: g.hex }}
                  title={g.name}
                >
                  {profile.gloveColor === g.hex && <Check className="w-4 h-4 text-white drop-shadow" />}
                </button>
              ))}
            </div>
          </div>

          {/* Trunks Color Picker */}
          <div>
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block mb-1.5">
              Fight Trunks Color
            </label>
            <div className="flex flex-wrap gap-2.5">
              {TRUNKS_COLORS.map((t) => (
                <button
                  key={t.hex}
                  type="button"
                  onClick={() => setProfile({ ...profile, trunksColor: t.hex })}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                    profile.trunksColor === t.hex ? 'ring-2 ring-white scale-110' : 'opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: t.hex }}
                  title={t.name}
                >
                  {profile.trunksColor === t.hex && <Check className="w-4 h-4 text-white drop-shadow" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-neutral-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-neutral-400 hover:text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-neutral-950 font-bold rounded-xl text-sm transition-transform active:scale-95 shadow-lg shadow-yellow-500/20"
          >
            <Sparkles className="w-4 h-4" />
            <span>SAVE FIGHTER</span>
          </button>
        </div>
      </div>
    </div>
  );
};

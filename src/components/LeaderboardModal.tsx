/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { LeaderboardEntry } from '../types/boxing';
import { Trophy, Medal, Flame, Timer, Share2, X, Sparkles } from 'lucide-react';
import { sound } from '../audio/boxingSound';

interface Props {
  entries: LeaderboardEntry[];
  onOpenFarcasterShare: (entry?: LeaderboardEntry) => void;
  onClose: () => void;
}

export const LeaderboardModal: React.FC<Props> = ({ entries, onOpenFarcasterShare, onClose }) => {
  const [filter, setFilter] = useState<'score' | 'time'>('score');

  const sorted = [...entries].sort((a, b) => {
    if (filter === 'score') {
      return b.score - a.score;
    } else {
      return a.fightTimeSeconds - b.fightTimeSeconds;
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl p-6 text-white my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold font-arcade tracking-wider text-yellow-400">CHAMPIONSHIP HALL OF FAME</h2>
              <p className="text-xs text-neutral-400">Top knockout records, fastest fights, and high score contenders</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter bar & Farcaster share CTA */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
          <div className="flex bg-neutral-950 p-1 rounded-xl border border-neutral-800">
            <button
              type="button"
              onClick={() => {
                sound.playSwing();
                setFilter('score');
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                filter === 'score' ? 'bg-yellow-500 text-neutral-950 shadow' : 'text-neutral-400 hover:text-white'
              }`}
            >
              Highest Scores
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playSwing();
                setFilter('time');
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                filter === 'time' ? 'bg-yellow-500 text-neutral-950 shadow' : 'text-neutral-400 hover:text-white'
              }`}
            >
              Fastest Battles
            </button>
          </div>

          <button
            type="button"
            onClick={() => onOpenFarcasterShare()}
            className="flex items-center justify-center gap-2 px-3.5 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 rounded-xl text-xs font-bold transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Farcaster Mini-App Share</span>
          </button>
        </div>

        {/* Leaderboard Table */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden max-h-[380px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-900/80 text-neutral-400 border-b border-neutral-800 sticky top-0 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-2.5 px-3 w-12 text-center">Rank</th>
                <th className="py-2.5 px-3">Fighter</th>
                <th className="py-2.5 px-3 text-center">Round</th>
                <th className="py-2.5 px-3 text-center">Fight Time</th>
                <th className="py-2.5 px-3 text-center">Max Combo</th>
                <th className="py-2.5 px-3 text-right">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-850">
              {sorted.map((item, index) => {
                const isTop1 = index === 0;
                const isTop2 = index === 1;
                const isTop3 = index === 2;

                return (
                  <tr
                    key={item.id}
                    className={`transition-colors ${
                      item.isPlayer
                        ? 'bg-yellow-500/10 hover:bg-yellow-500/15 font-semibold text-yellow-300'
                        : 'hover:bg-neutral-900/50 text-neutral-300'
                    }`}
                  >
                    <td className="py-3 px-3 text-center font-bold">
                      {isTop1 ? (
                        <Medal className="w-4 h-4 text-yellow-400 inline" />
                      ) : isTop2 ? (
                        <Medal className="w-4 h-4 text-slate-300 inline" />
                      ) : isTop3 ? (
                        <Medal className="w-4 h-4 text-amber-600 inline" />
                      ) : (
                        <span className="text-neutral-500">#{index + 1}</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white truncate max-w-[120px]">{item.playerName}</span>
                        {item.nickname && (
                          <span className="text-[10px] text-neutral-400 hidden sm:inline">"{item.nickname}"</span>
                        )}
                        {item.isPlayer && (
                          <span className="px-1.5 py-0.2 rounded bg-yellow-500 text-neutral-950 text-[9px] font-black uppercase">
                            YOU
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center text-neutral-400">
                      R{item.roundReached}
                    </td>
                    <td className="py-3 px-3 text-center font-mono">
                      <span className="flex items-center justify-center gap-1 text-cyan-400">
                        <Timer className="w-3 h-3" />
                        <span>{item.fightTimeSeconds}s</span>
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="flex items-center justify-center gap-1 text-red-400 font-bold">
                        <Flame className="w-3 h-3" />
                        <span>{item.maxCombo}x</span>
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-yellow-400 font-mono text-sm">
                      {item.score.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-5 pt-3 border-t border-neutral-800">
          <div className="text-xs text-neutral-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
            <span>Scores persist across sessions & Farcaster frames</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-bold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

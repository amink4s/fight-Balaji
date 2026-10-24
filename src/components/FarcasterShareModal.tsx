/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { LeaderboardEntry } from '../types/boxing';
import { CHAMPIONSHIP_MATCH } from '../game/boxingEngine';
import { Share2, Copy, Check, ExternalLink, X } from 'lucide-react';
import { sound } from '../audio/boxingSound';

interface Props {
  entry?: LeaderboardEntry | null;
  onClose: () => void;
}

export const FarcasterShareModal: React.FC<Props> = ({ entry, onClose }) => {
  const [copied, setCopied] = useState(false);

  const scoreText = entry
    ? `🥊 I scored ${entry.score.toLocaleString()} PTS in the 3D Championship Ring against ${CHAMPIONSHIP_MATCH.alias} with a ${entry.maxCombo}x combo! Can you defeat the Champ?`
    : `🥊 Step into the 3D Championship Ring in Apex Boxer! Realistic punch physics, dynamic facial damage, stamina mechanics, and mobile touch controls against ${CHAMPIONSHIP_MATCH.alias}!`;

  const appUrl = typeof window !== 'undefined' ? window.location.href : 'https://apex-boxer-3d.app';
  const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(
    scoreText + `\n\nPlay here: ${appUrl}`
  )}`;

  const handleCopy = () => {
    sound.playSwing();
    navigator.clipboard.writeText(scoreText + `\n\nPlay: ${appUrl}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl p-6 text-white my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/30">
              <Share2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold font-arcade tracking-wider text-purple-400">FARCASTER MINI-APP SHARE</h2>
              <p className="text-xs text-neutral-400">Broadcast your championship record to Warpcast & Farcaster</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Farcaster Frame Preview Card */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-purple-300">
            <span className="w-2 h-2 rounded-full bg-purple-500 inline-block"></span>
            <span>Warpcast Cast Preview</span>
          </div>

          <div className="bg-neutral-900/80 rounded-xl p-3 border border-neutral-800 text-xs text-neutral-200 leading-relaxed font-sans mb-3">
            {scoreText}
            <div className="text-purple-400 mt-2 font-mono text-[11px] truncate">{appUrl}</div>
          </div>

          {entry && (
            <div className="grid grid-cols-3 gap-2 bg-neutral-900/50 p-2.5 rounded-lg border border-neutral-850 text-center">
              <div>
                <div className="text-[10px] text-neutral-400 uppercase">Score</div>
                <div className="text-sm font-bold text-yellow-400 font-mono">{entry.score.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[10px] text-neutral-400 uppercase">Max Combo</div>
                <div className="text-sm font-bold text-red-400 font-mono">{entry.maxCombo}x</div>
              </div>
              <div>
                <div className="text-[10px] text-neutral-400 uppercase">Fight Time</div>
                <div className="text-sm font-bold text-cyan-400 font-mono">{entry.fightTimeSeconds}s</div>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-2.5">
          <button
            type="button"
            onClick={handleCopy}
            className="w-full sm:w-1/2 flex items-center justify-center gap-2 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-bold transition-all active:scale-98"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'COPIED TO CLIPBOARD!' : 'COPY CAST TEXT'}</span>
          </button>

          <a
            href={warpcastUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => sound.playSwing()}
            className="w-full sm:w-1/2 flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-purple-600/25 active:scale-98"
          >
            <ExternalLink className="w-4 h-4" />
            <span>OPEN IN WARPCAST</span>
          </a>
        </div>
      </div>
    </div>
  );
};

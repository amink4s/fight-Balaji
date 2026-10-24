/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  loadLeaderboard,
  loadPlayerProfile,
} from './game/boxingEngine';
import { FighterProfile, LeaderboardEntry } from './types/boxing';
import { BoxingGameView } from './components/BoxingGameView';
import { FighterCustomizer } from './components/FighterCustomizer';
import { LeaderboardModal } from './components/LeaderboardModal';
import { FarcasterShareModal } from './components/FarcasterShareModal';

export default function App() {
  const [playerProfile, setPlayerProfile] = useState<FighterProfile>(() => loadPlayerProfile());
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(() => loadLeaderboard());

  // Modal Dialogs
  const [isCustomizerOpen, setIsCustomizerOpen] = useState<boolean>(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState<boolean>(false);
  const [farcasterShareData, setFarcasterShareData] = useState<LeaderboardEntry | null>(null);
  const [isFarcasterModalOpen, setIsFarcasterModalOpen] = useState<boolean>(false);

  const handleOpenFarcasterShare = (customData?: { score: number; maxCombo: number; time: number }) => {
    if (customData) {
      setFarcasterShareData({
        id: 'share-latest',
        playerName: playerProfile.name || 'Champion',
        nickname: playerProfile.nickname || 'Apex',
        archetype: playerProfile.archetype,
        roundReached: 3,
        score: customData.score,
        fightTimeSeconds: customData.time,
        maxCombo: customData.maxCombo,
        date: 'Today',
        isPlayer: true,
      });
    } else {
      const playerRecord = leaderboard.find((l) => l.isPlayer) || leaderboard[0] || null;
      setFarcasterShareData(playerRecord);
    }
    setIsFarcasterModalOpen(true);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-neutral-950 text-neutral-100 flex flex-col">
      {/* Main 3D Boxing Game Arena View (Single Tier Championship Bout) */}
      <BoxingGameView
        playerProfile={playerProfile}
        onOpenCustomizer={() => setIsCustomizerOpen(true)}
        onOpenLeaderboard={() => {
          setLeaderboard(loadLeaderboard());
          setIsLeaderboardOpen(true);
        }}
        onOpenFarcasterShare={handleOpenFarcasterShare}
      />

      {/* Fighter Profile Customizer Modal */}
      {isCustomizerOpen && (
        <FighterCustomizer
          profile={playerProfile}
          onSave={(updated) => setPlayerProfile(updated)}
          onClose={() => setIsCustomizerOpen(false)}
        />
      )}

      {/* Leaderboard Modal */}
      {isLeaderboardOpen && (
        <LeaderboardModal
          entries={leaderboard}
          onOpenFarcasterShare={(entry) => {
            setFarcasterShareData(entry || null);
            setIsFarcasterModalOpen(true);
          }}
          onClose={() => setIsLeaderboardOpen(false)}
        />
      )}

      {/* Farcaster Mini-App Share Modal */}
      {isFarcasterModalOpen && (
        <FarcasterShareModal
          entry={farcasterShareData}
          onClose={() => {
            setIsFarcasterModalOpen(false);
            setFarcasterShareData(null);
          }}
        />
      )}
    </div>
  );
}

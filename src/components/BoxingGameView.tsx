/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  DefenseAction,
  FighterProfile,
  FighterStats,
  GameResult,
  OpponentFaceState,
  PunchType,
} from '../types/boxing';
import { ThreeBoxingScene } from '../game/threeBoxingScene';
import {
  CHAMPIONSHIP_MATCH,
  determineFaceState,
  getFighterBaseStats,
  PUNCH_CONFIG,
  addLeaderboardRecord,
} from '../game/boxingEngine';
import { sound } from '../audio/boxingSound';
import {
  Shield,
  Zap,
  Flame,
  Volume2,
  VolumeX,
  Trophy,
  RotateCcw,
  Share2,
  ChevronDown,
  ChevronUp,
  User,
  Medal,
} from 'lucide-react';

interface Props {
  playerProfile: FighterProfile;
  onOpenCustomizer: () => void;
  onOpenLeaderboard: () => void;
  onOpenFarcasterShare: (result?: { score: number; maxCombo: number; time: number }) => void;
}

export const BoxingGameView: React.FC<Props> = ({
  playerProfile,
  onOpenCustomizer,
  onOpenLeaderboard,
  onOpenFarcasterShare,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ThreeBoxingScene | null>(null);

  // Fighter mutable combat state
  const [playerStats, setPlayerStats] = useState<FighterStats>(() => getFighterBaseStats(playerProfile));
  const [opponentHp, setOpponentHp] = useState<number>(CHAMPIONSHIP_MATCH.maxHp);
  const [opponentMaxHp] = useState<number>(CHAMPIONSHIP_MATCH.maxHp);
  const [opponentFace, setOpponentFace] = useState<OpponentFaceState>('normal');

  // Multi-round match status
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [roundTimeRemaining, setRoundTimeRemaining] = useState<number>(CHAMPIONSHIP_MATCH.roundDurationSeconds);
  const [knockdownsScored, setKnockdownsScored] = useState<number>(0);
  const [refereeCount, setRefereeCount] = useState<number | null>(null);

  // Combat status
  const [defenseState, setDefenseState] = useState<DefenseAction>('none');
  const [isCounterWindow, setIsCounterWindow] = useState<boolean>(false);
  const [combo, setCombo] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [totalMatchTime, setTotalMatchTime] = useState<number>(0);
  const [isMatchActive, setIsMatchActive] = useState<boolean>(true);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);

  // Tracking statistics
  const statsTracker = useRef({
    totalPunches: 0,
    punchesLanded: 0,
    punchesBlocked: 0,
    maxCombo: 0,
    knockdownTriggeredAtHalf: false,
  });

  // UI Dock Collapse state
  const [isDockCollapsed, setIsDockCollapsed] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(() => sound.getMuted());
  const [touchFeedback, setTouchFeedback] = useState<string | null>(null);

  // Touch gesture tracking for canvas swipe controls
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  // AI loop timer
  const aiCooldownRef = useRef<number>(Date.now() + 1800);
  const counterTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync player profile changes
  useEffect(() => {
    const base = getFighterBaseStats(playerProfile);
    setPlayerStats(base);
    if (sceneRef.current) {
      sceneRef.current.updatePlayerCustomization(playerProfile.gloveColor, playerProfile.trunksColor);
    }
  }, [playerProfile]);

  // Reset match
  const resetMatch = useCallback(() => {
    setOpponentHp(CHAMPIONSHIP_MATCH.maxHp);
    setOpponentFace('normal');
    setPlayerStats(getFighterBaseStats(playerProfile));
    setCurrentRound(1);
    setRoundTimeRemaining(CHAMPIONSHIP_MATCH.roundDurationSeconds);
    setKnockdownsScored(0);
    setRefereeCount(null);
    setDefenseState('none');
    setIsCounterWindow(false);
    setCombo(0);
    setScore(0);
    setTotalMatchTime(0);
    setIsMatchActive(true);
    setGameResult(null);

    statsTracker.current = {
      totalPunches: 0,
      punchesLanded: 0,
      punchesBlocked: 0,
      maxCombo: 0,
      knockdownTriggeredAtHalf: false,
    };

    aiCooldownRef.current = Date.now() + 1600;

    if (sceneRef.current) {
      sceneRef.current.setFaceState('normal');
      sceneRef.current.setOpponentKnockedDown(false);
      sceneRef.current.setDefenseState('none');
    }

    sound.playBell();
  }, [playerProfile]);

  // Initialize Three.js scene once
  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new ThreeBoxingScene({
      container: mountRef.current,
      onSceneReady: (s) => {
        s.updatePlayerCustomization(playerProfile.gloveColor, playerProfile.trunksColor);
      },
    });

    sceneRef.current = scene;
    sound.playBell();

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Main match timer & stamina regen loop
  useEffect(() => {
    if (!isMatchActive || refereeCount !== null) return;

    const interval = setInterval(() => {
      setTotalMatchTime((t) => t + 1);

      // Round countdown
      setRoundTimeRemaining((prev) => {
        if (prev <= 1) {
          // Advance round if more rounds remain
          if (currentRound < CHAMPIONSHIP_MATCH.totalRounds) {
            sound.playBell();
            setCurrentRound((r) => r + 1);
            setTouchFeedback(`ROUND ${currentRound + 1} - FIGHT!`);
            setTimeout(() => setTouchFeedback(null), 1800);
            return CHAMPIONSHIP_MATCH.roundDurationSeconds;
          } else {
            // Decision win if time expired
            handleMatchDecision();
            return 0;
          }
        }
        return prev - 1;
      });

      // Regenerate player stamina
      setPlayerStats((prev) => {
        if (prev.stamina < prev.maxStamina) {
          const rate = defenseState === 'block' ? prev.staminaRegenRate * 0.45 : prev.staminaRegenRate;
          const newStamina = Math.min(prev.maxStamina, prev.stamina + rate * 0.1);
          return { ...prev, stamina: newStamina };
        }
        return prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isMatchActive, refereeCount, currentRound, defenseState]);

  // AI Opponent logic loop
  useEffect(() => {
    if (!isMatchActive || refereeCount !== null) return;

    const aiInterval = setInterval(() => {
      const now = Date.now();
      if (now < aiCooldownRef.current) return;

      // Opponent decides next move
      const roll = Math.random();
      const arm: 'left' | 'right' = Math.random() > 0.45 ? 'right' : 'left';
      const punchType: PunchType = roll > 0.65 ? 'cross' : roll > 0.35 ? 'left_hook' : 'jab';

      // Telegraph attack to give player a reaction/counter opportunity
      if (sceneRef.current) {
        sceneRef.current.triggerOpponentPunch(arm, punchType);
        sound.playSwing();
      }

      // Next cooldown
      const baseCd = CHAMPIONSHIP_MATCH.attackCooldown;
      const variation = (Math.random() - 0.5) * 400;
      aiCooldownRef.current = now + Math.max(800, baseCd + variation);

      // Resolve punch hit after 380ms telegraph (generous window to block/slip)
      setTimeout(() => {
        if (!sceneRef.current || !isMatchActive || refereeCount !== null) return;

        // Check if player is dodging / slipping or blocking
        if (defenseState === 'slip_left' || defenseState === 'slip_right') {
          // Clean dodge! Open Counter Window!
          sound.playDodge();
          setIsCounterWindow(true);
          setTouchFeedback('SLIPPED! COUNTER READY!');
          if (counterTimeoutRef.current) clearTimeout(counterTimeoutRef.current);
          counterTimeoutRef.current = setTimeout(() => {
            setIsCounterWindow(false);
            setTouchFeedback(null);
          }, 2200);
          return;
        }

        const isBlocked = defenseState === 'block';
        const rawDmg = CHAMPIONSHIP_MATCH.power * (punchType === 'cross' ? 1.25 : 1.0);
        const finalDmg = isBlocked ? Math.max(1, Math.round(rawDmg * (1 - playerStats.defenseReduction))) : Math.round(rawDmg);

        sound.playPunchImpact(punchType, isBlocked, false);
        sound.vibrate(isBlocked ? 25 : [40, 30, 40]);
        sceneRef.current.triggerPlayerDamage();

        setPlayerStats((prev) => {
          const nextHp = Math.max(0, prev.hp - finalDmg);
          if (nextHp <= 0) {
            handlePlayerKnockout();
          }
          return { ...prev, hp: nextHp };
        });

        // Reset combo on hit
        setCombo(0);
      }, 240);
    }, 150);

    return () => clearInterval(aiInterval);
  }, [isMatchActive, refereeCount, defenseState, playerStats.defenseReduction]);

  // Execute Player Punch
  const executePunch = useCallback(
    (type: PunchType) => {
      if (!isMatchActive || refereeCount !== null) return;

      const config = PUNCH_CONFIG[type];

      // Check stamina
      if (playerStats.stamina < config.staminaCost) {
        setTouchFeedback('LOW STAMINA! CATCH YOUR BREATH');
        sound.vibrate(15);
        setTimeout(() => setTouchFeedback(null), 800);
        return;
      }

      // Consume stamina
      setPlayerStats((prev) => ({
        ...prev,
        stamina: Math.max(0, prev.stamina - config.staminaCost),
      }));

      statsTracker.current.totalPunches++;

      // Trigger 3D glove extension animation
      if (sceneRef.current) {
        sceneRef.current.triggerPlayerPunch(type);
        sound.playSwing();
      }

      // Check hit after punch travel (120ms)
      setTimeout(() => {
        if (!sceneRef.current || !isMatchActive || refereeCount !== null) return;

        // Opponent defense check
        const isSlipped = !isCounterWindow && Math.random() < CHAMPIONSHIP_MATCH.slipChance;
        if (isSlipped) {
          sound.playDodge();
          setTouchFeedback('OPPONENT SLIPPED!');
          setTimeout(() => setTouchFeedback(null), 700);
          return;
        }

        const isBlocked = !isCounterWindow && Math.random() < CHAMPIONSHIP_MATCH.blockChance;
        const isCrit = isCounterWindow || (type === 'uppercut' && Math.random() < 0.45);

        if (isBlocked) {
          statsTracker.current.punchesBlocked++;
          sound.playPunchImpact(type, true, false);
          sound.vibrate(20);
          setTouchFeedback('BLOCKED');
          setTimeout(() => setTouchFeedback(null), 500);
          return;
        }

        // Clean Hit!
        statsTracker.current.punchesLanded++;
        const critMultiplier = isCrit ? 1.8 : 1.0;
        const totalDamage = Math.round(config.baseDamage * playerStats.powerMultiplier * critMultiplier);

        // Sound & Haptics
        sound.playPunchImpact(type, false, isCrit);
        sound.vibrate(isCrit ? [60, 40, 60] : 35);

        // Physics recoil & hit sparks on 3D opponent head
        sceneRef.current.triggerHitRecoil(type, isCrit);

        // Update Combo & Score
        setCombo((c) => {
          const next = c + 1;
          if (next > statsTracker.current.maxCombo) {
            statsTracker.current.maxCombo = next;
          }
          return next;
        });

        const hitScore = Math.round(totalDamage * 10 * (1 + combo * 0.15) * (isCrit ? 1.6 : 1.0));
        setScore((s) => s + hitScore);

        // Close counter window if active
        if (isCounterWindow) {
          setIsCounterWindow(false);
        }

        // Apply Opponent Damage
        setOpponentHp((currHp) => {
          const nextHp = Math.max(0, currHp - totalDamage);
          const ratio = nextHp / opponentMaxHp;

          // Mid-fight Knockdown trigger around 55% HP
          if (!statsTracker.current.knockdownTriggeredAtHalf && ratio <= 0.55 && nextHp > 0) {
            statsTracker.current.knockdownTriggeredAtHalf = true;
            triggerRefereeKnockdown();
            return nextHp;
          }

          const newFace = determineFaceState(nextHp, opponentMaxHp, nextHp <= 0);
          setOpponentFace(newFace);
          if (sceneRef.current) {
            sceneRef.current.setFaceState(newFace);
          }

          if (nextHp <= 0) {
            handleFinalKnockout();
          }
          return nextHp;
        });
      }, 120);
    },
    [isMatchActive, refereeCount, playerStats, isCounterWindow, opponentMaxHp, combo]
  );

  // Mid-fight knockdown with referee 8-count recovery
  const triggerRefereeKnockdown = () => {
    setKnockdownsScored((k) => k + 1);
    sound.playKnockout();
    setTouchFeedback('KNOCKDOWN! REFEREE COUNTING!');

    if (sceneRef.current) {
      sceneRef.current.setOpponentKnockedDown(true);
      sceneRef.current.setFaceState('beat');
    }
    setOpponentFace('beat');

    let count = 1;
    setRefereeCount(count);

    const countInterval = setInterval(() => {
      count++;
      if (count <= 8) {
        setRefereeCount(count);
        sound.playSwing();
      } else {
        // Opponent beats the count and gets back up!
        clearInterval(countInterval);
        setRefereeCount(null);
        setTouchFeedback('HE BEAT THE COUNT! FINISH HIM!');
        setTimeout(() => setTouchFeedback(null), 1500);

        if (sceneRef.current) {
          sceneRef.current.setOpponentKnockedDown(false);
          // Retain the BEATEN face state as requested by user
          sceneRef.current.setFaceState('beat');
        }
        setOpponentFace('beat');
        aiCooldownRef.current = Date.now() + 1400;
      }
    }, 900);
  };

  // Final Knockout
  const handleFinalKnockout = () => {
    setIsMatchActive(false);
    setKnockdownsScored((k) => k + 1);
    sound.playKnockout();
    sound.playCheer();

    try {
      confetti({
        particleCount: 110,
        spread: 90,
        origin: { y: 0.6 },
      });
    } catch {
      // ignore
    }

    if (sceneRef.current) {
      sceneRef.current.setOpponentKnockedDown(true);
      sceneRef.current.setFaceState('beat');
    }
    setOpponentFace('beat');

    const accuracy =
      statsTracker.current.totalPunches > 0
        ? Math.round((statsTracker.current.punchesLanded / statsTracker.current.totalPunches) * 100)
        : 0;

    const finalResult: GameResult = {
      won: true,
      round: currentRound,
      timeSeconds: totalMatchTime,
      totalPunches: statsTracker.current.totalPunches,
      punchesLanded: statsTracker.current.punchesLanded,
      punchesBlocked: statsTracker.current.punchesBlocked,
      accuracy,
      maxCombo: statsTracker.current.maxCombo,
      finalScore: score + 12000,
      knockdownsScored: knockdownsScored + 1,
    };

    setGameResult(finalResult);

    addLeaderboardRecord({
      playerName: playerProfile.name || 'Champion',
      nickname: playerProfile.nickname || 'Apex',
      archetype: playerProfile.archetype,
      roundReached: currentRound,
      score: finalResult.finalScore,
      fightTimeSeconds: totalMatchTime,
      maxCombo: finalResult.maxCombo,
    });
  };

  const handleMatchDecision = () => {
    setIsMatchActive(false);
    sound.playBell();

    const accuracy =
      statsTracker.current.totalPunches > 0
        ? Math.round((statsTracker.current.punchesLanded / statsTracker.current.totalPunches) * 100)
        : 0;

    const won = opponentHp < opponentMaxHp * 0.5;

    const finalResult: GameResult = {
      won,
      round: currentRound,
      timeSeconds: totalMatchTime,
      totalPunches: statsTracker.current.totalPunches,
      punchesLanded: statsTracker.current.punchesLanded,
      punchesBlocked: statsTracker.current.punchesBlocked,
      accuracy,
      maxCombo: statsTracker.current.maxCombo,
      finalScore: score + (won ? 8000 : 2000),
      knockdownsScored,
    };

    setGameResult(finalResult);
  };

  const handlePlayerKnockout = () => {
    setIsMatchActive(false);
    sound.playBell();

    const accuracy =
      statsTracker.current.totalPunches > 0
        ? Math.round((statsTracker.current.punchesLanded / statsTracker.current.totalPunches) * 100)
        : 0;

    setGameResult({
      won: false,
      round: currentRound,
      timeSeconds: totalMatchTime,
      totalPunches: statsTracker.current.totalPunches,
      punchesLanded: statsTracker.current.punchesLanded,
      punchesBlocked: statsTracker.current.punchesBlocked,
      accuracy,
      maxCombo: statsTracker.current.maxCombo,
      finalScore: score,
      knockdownsScored,
    });
  };

  // Defense handlers
  const handleDefense = (action: DefenseAction) => {
    setDefenseState(action);
    if (sceneRef.current) {
      sceneRef.current.setDefenseState(action);
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isMatchActive || refereeCount !== null) return;
      const key = e.key.toLowerCase();

      if (key === 'j') executePunch('jab');
      else if (key === 'k') executePunch('cross');
      else if (key === 'u') executePunch('left_hook');
      else if (key === 'i') executePunch('right_hook');
      else if (key === 'o') executePunch('uppercut');
      else if (key === ' ' || key === 's') handleDefense('block');
      else if (key === 'a' || key === 'arrowleft') handleDefense('slip_left');
      else if (key === 'd' || key === 'arrowright') handleDefense('slip_right');
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === ' ' || key === 's' || key === 'a' || key === 'd' || key === 'arrowleft' || key === 'arrowright') {
        handleDefense('none');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isMatchActive, refereeCount, executePunch]);

  // Touch gesture handler on the 3D viewport canvas
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      };
    } else if (e.touches.length >= 2) {
      handleDefense('block');
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dx = endX - touchStartRef.current.x;
    const dy = endY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.time;

    touchStartRef.current = null;
    handleDefense('none');

    // Swipe gestures
    if (Math.abs(dx) > 40 || Math.abs(dy) > 40) {
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 40) executePunch('left_hook');
        else executePunch('right_hook');
      } else {
        if (dy < -40) executePunch('uppercut');
        else handleDefense('slip_left');
      }
      return;
    }

    // Tap gestures
    if (dt < 300) {
      const screenMid = window.innerWidth / 2;
      if (endX < screenMid) {
        executePunch('jab');
      } else {
        executePunch('cross');
      }
    }
  };

  const toggleMute = () => {
    const next = sound.toggleMute();
    setIsMuted(next);
  };

  // Helper percentages
  const playerHpPct = Math.max(0, Math.min(100, (playerStats.hp / playerStats.maxHp) * 100));
  const playerStaminaPct = Math.max(0, Math.min(100, (playerStats.stamina / playerStats.maxStamina) * 100));
  const opponentHpPct = Math.max(0, Math.min(100, (opponentHp / opponentMaxHp) * 100));

  return (
    <div className="relative w-full h-full overflow-hidden select-none bg-neutral-950 font-sans">
      {/* 1. 3D WebGL Canvas Viewport */}
      <div
        ref={mountRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
      />

      {/* 2. Top Header HUD Bar */}
      <div className="absolute top-0 inset-x-0 z-30 p-3 pt-safe flex flex-col gap-2 pointer-events-none">
        {/* Top Navbar Row */}
        <div className="flex items-center justify-between pointer-events-auto">
          {/* Championship Title & Match Spec */}
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-neutral-900/90 border border-neutral-700 text-left shadow-lg">
            <Trophy className="w-5 h-5 text-amber-400" />
            <div>
              <div className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">
                UNDISPUTED WORLD CHAMPIONSHIP
              </div>
              <div className="text-xs font-bold text-white truncate max-w-[150px] sm:max-w-[220px]">
                {CHAMPIONSHIP_MATCH.alias}
              </div>
            </div>
          </div>

          {/* Center Round Clock & Score */}
          <div className="flex flex-col items-center bg-neutral-900/90 border border-neutral-700 px-4 py-1 rounded-xl shadow-lg">
            <span className="text-[11px] font-black text-amber-400 font-mono tracking-widest uppercase">
              ROUND {currentRound} OF {CHAMPIONSHIP_MATCH.totalRounds} • {Math.floor(roundTimeRemaining / 60)}:
              {(roundTimeRemaining % 60).toString().padStart(2, '0')}
            </span>
            <span className="text-base font-black text-white font-mono tracking-wider">
              {score.toLocaleString()} PTS
            </span>
          </div>

          {/* Top Quick Actions */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenCustomizer}
              className="p-2 rounded-xl bg-neutral-900/90 border border-neutral-700 text-neutral-300 hover:text-white hover:border-yellow-400 transition-colors shadow-lg"
              title="Fighter Profile & Style"
            >
              <User className="w-4 h-4 text-yellow-400" />
            </button>
            <button
              type="button"
              onClick={onOpenLeaderboard}
              className="p-2 rounded-xl bg-neutral-900/90 border border-neutral-700 text-neutral-300 hover:text-white hover:border-yellow-400 transition-colors shadow-lg"
              title="Hall of Fame Leaderboard"
            >
              <Medal className="w-4 h-4 text-amber-400" />
            </button>
            <button
              type="button"
              onClick={toggleMute}
              className="p-2 rounded-xl bg-neutral-900/90 border border-neutral-700 text-neutral-300 hover:text-white transition-colors shadow-lg"
              title="Toggle Sound"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            </button>
          </div>
        </div>

        {/* Dual Health & Stamina Bars */}
        <div className="grid grid-cols-2 gap-3 max-w-2xl mx-auto w-full pointer-events-auto">
          {/* Player (Left) */}
          <div className="bg-neutral-900/90 border border-neutral-700 rounded-xl p-2.5 flex flex-col gap-1.5 shadow-lg">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-bold text-white truncate">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: playerProfile.gloveColor }} />
                <span className="truncate">{playerProfile.name || 'Challenger'}</span>
              </div>
              <span className="font-mono text-[11px] font-bold text-emerald-400">{playerStats.hp} HP</span>
            </div>

            {/* HP Bar */}
            <div className="w-full h-2.5 bg-neutral-950 rounded-full overflow-hidden border border-neutral-800">
              <div
                className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-150"
                style={{ width: `${playerHpPct}%` }}
              />
            </div>

            {/* Stamina Bar */}
            <div className="flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-cyan-400" />
              <div className="flex-1 h-1.5 bg-neutral-950 rounded-full overflow-hidden border border-neutral-800">
                <div
                  className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-all duration-100"
                  style={{ width: `${playerStaminaPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Opponent (Right) */}
          <div className="bg-neutral-900/90 border border-neutral-700 rounded-xl p-2.5 flex flex-col gap-1.5 shadow-lg">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-[11px] font-bold text-red-400">
                {opponentHp} / {opponentMaxHp} HP
              </span>
              <div className="flex items-center gap-1.5 font-bold text-white truncate">
                <span className="truncate">{CHAMPIONSHIP_MATCH.alias}</span>
                {/* Live Face State Thumbnail Badge */}
                <div className="relative w-6 h-6 rounded-full overflow-hidden border border-yellow-500/40 bg-neutral-950 flex-shrink-0">
                  <img
                    src={`/assets/faces/face_${opponentFace}.webp`}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `/assets/faces/face_${opponentFace}.png`;
                    }}
                    alt="Opponent Face"
                    className="w-full h-full object-cover scale-125"
                  />
                </div>
              </div>
            </div>

            {/* Opponent HP Bar */}
            <div className="w-full h-2.5 bg-neutral-950 rounded-full overflow-hidden border border-neutral-800">
              <div
                className="h-full bg-gradient-to-l from-red-600 to-amber-500 transition-all duration-150"
                style={{ width: `${opponentHpPct}%` }}
              />
            </div>

            {/* Opponent State Label */}
            <div className="flex items-center justify-end text-[10px] font-bold uppercase tracking-wider">
              {opponentFace === 'beat' ? (
                <span className="text-red-400 font-extrabold animate-pulse">STATE: BEATEN & BATTERED</span>
              ) : opponentFace === 'hurt' ? (
                <span className="text-amber-400">STATE: STRAINED / WOUNDED</span>
              ) : (
                <span className="text-emerald-400">STATE: CONFIDENT</span>
              )}
            </div>
          </div>
        </div>

        {/* Dynamic Alerts (Counter Window / Combos / Referee Count) */}
        <div className="flex flex-col items-center justify-center gap-1 mt-1">
          {refereeCount !== null && (
            <div className="px-6 py-2 rounded-2xl bg-red-600 text-white font-arcade text-3xl font-black tracking-widest shadow-2xl animate-pulse">
              REFEREE COUNT: {refereeCount}...
            </div>
          )}

          {isCounterWindow && (
            <div className="px-4 py-1.5 rounded-full bg-yellow-500 text-neutral-950 font-arcade text-lg font-black tracking-widest shadow-xl shadow-yellow-500/40 animate-bounce">
              ⚡ COUNTER WINDOW OPEN! (1.8X CRITICAL) ⚡
            </div>
          )}

          {combo >= 2 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-600/90 border border-red-400 text-white font-arcade text-lg tracking-wider shadow-lg">
              <Flame className="w-4 h-4 fill-white" />
              <span>{combo}X COMBO HIT!</span>
            </div>
          )}

          {touchFeedback && (
            <div className="px-3 py-0.5 rounded-md bg-neutral-900/95 border border-yellow-500 text-yellow-300 text-xs font-bold tracking-wider">
              {touchFeedback}
            </div>
          )}
        </div>
      </div>

      {/* 3. Ergonomic Bottom Control Dock (Consolidated, Collapsible, Zero Viewport Occlusion) */}
      <div className="absolute bottom-3 inset-x-0 z-30 flex flex-col items-center pointer-events-none pb-safe px-3">
        {/* Collapse / Expand Toggle Button */}
        <button
          type="button"
          onClick={() => setIsDockCollapsed(!isDockCollapsed)}
          className="pointer-events-auto flex items-center gap-1.5 px-3 py-1 bg-neutral-900/85 hover:bg-neutral-800 border border-neutral-700 rounded-t-xl text-[11px] font-bold text-neutral-300 hover:text-white transition-all shadow-md"
        >
          {isDockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>{isDockCollapsed ? 'Show Controls Dock' : 'Hide Controls (Zen Mode)'}</span>
        </button>

        {/* Main Dock Container */}
        <div
          className={`pointer-events-auto w-full max-w-xl bg-neutral-900/95 border border-neutral-700 rounded-2xl p-3 shadow-2xl transition-all duration-300 ${
            isDockCollapsed ? 'translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
          }`}
        >
          {/* Mobile-first Touch Button Grid */}
          <div className="grid grid-cols-5 gap-2">
            {/* 1. Left Jab */}
            <button
              type="button"
              onClick={() => executePunch('jab')}
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-cyan-600 border border-neutral-600 text-white transition-transform active:scale-95"
            >
              <span className="text-base font-bold font-arcade tracking-wider">JAB</span>
              <span className="text-[9px] text-cyan-300 font-mono">8 STM</span>
            </button>

            {/* 2. Left Hook */}
            <button
              type="button"
              onClick={() => executePunch('left_hook')}
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-cyan-600 border border-neutral-600 text-white transition-transform active:scale-95"
            >
              <span className="text-base font-bold font-arcade tracking-wider">L-HOOK</span>
              <span className="text-[9px] text-cyan-300 font-mono">20 STM</span>
            </button>

            {/* 3. Center Uppercut (High Damage) */}
            <button
              type="button"
              onClick={() => executePunch('uppercut')}
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-neutral-950 font-black border border-amber-300 shadow-md transition-transform active:scale-95"
            >
              <span className="text-base font-arcade tracking-wider leading-none">UPPERCUT</span>
              <span className="text-[9px] text-neutral-900 font-mono mt-0.5">26 STM</span>
            </button>

            {/* 4. Right Cross */}
            <button
              type="button"
              onClick={() => executePunch('cross')}
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-red-600 border border-neutral-600 text-white transition-transform active:scale-95"
            >
              <span className="text-base font-bold font-arcade tracking-wider">CROSS</span>
              <span className="text-[9px] text-red-300 font-mono">16 STM</span>
            </button>

            {/* 5. Right Hook */}
            <button
              type="button"
              onClick={() => executePunch('right_hook')}
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-red-600 border border-neutral-600 text-white transition-transform active:scale-95"
            >
              <span className="text-base font-bold font-arcade tracking-wider">R-HOOK</span>
              <span className="text-[9px] text-red-300 font-mono">22 STM</span>
            </button>
          </div>

          {/* Defense & Movement Strip */}
          <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-neutral-800">
            {/* Slip Left */}
            <button
              type="button"
              onMouseDown={() => handleDefense('slip_left')}
              onMouseUp={() => handleDefense('none')}
              onTouchStart={() => handleDefense('slip_left')}
              onTouchEnd={() => handleDefense('none')}
              className={`p-2 rounded-xl text-xs font-bold transition-all ${
                defenseState === 'slip_left'
                  ? 'bg-cyan-500 text-neutral-950'
                  : 'bg-neutral-950 hover:bg-neutral-800 text-neutral-300 border border-neutral-800'
              }`}
            >
              SLIP LEFT (A)
            </button>

            {/* Guard / Shield */}
            <button
              type="button"
              onMouseDown={() => handleDefense('block')}
              onMouseUp={() => handleDefense('none')}
              onTouchStart={() => handleDefense('block')}
              onTouchEnd={() => handleDefense('none')}
              className={`flex items-center justify-center gap-1.5 p-2 rounded-xl text-xs font-bold transition-all ${
                defenseState === 'block'
                  ? 'bg-yellow-500 text-neutral-950 shadow-lg'
                  : 'bg-neutral-950 hover:bg-neutral-800 text-yellow-400 border border-neutral-800'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>GUARD (SPACE)</span>
            </button>

            {/* Slip Right */}
            <button
              type="button"
              onMouseDown={() => handleDefense('slip_right')}
              onMouseUp={() => handleDefense('none')}
              onTouchStart={() => handleDefense('slip_right')}
              onTouchEnd={() => handleDefense('none')}
              className={`p-2 rounded-xl text-xs font-bold transition-all ${
                defenseState === 'slip_right'
                  ? 'bg-cyan-500 text-neutral-950'
                  : 'bg-neutral-950 hover:bg-neutral-800 text-neutral-300 border border-neutral-800'
              }`}
            >
              SLIP RIGHT (D)
            </button>
          </div>

          {/* Mobile Gestures / Keyboard Hint bar */}
          <div className="text-[10px] text-neutral-500 text-center mt-2 flex items-center justify-center gap-3">
            <span>Tap Canvas: Left = Jab / Right = Cross</span>
            <span>•</span>
            <span>Swipe: Up = Uppercut / Sideways = Hooks</span>
          </div>
        </div>
      </div>

      {/* 4. Match Finished / Knockout Modal */}
      {gameResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-700 rounded-3xl p-6 text-center text-white shadow-2xl animate-in fade-in zoom-in-95">
            <div
              className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-3 shadow-xl ${
                gameResult.won
                  ? 'bg-yellow-500/20 border-2 border-yellow-400 text-yellow-400'
                  : 'bg-red-500/20 border-2 border-red-500 text-red-500'
              }`}
            >
              {gameResult.won ? <Trophy className="w-10 h-10" /> : <RotateCcw className="w-10 h-10" />}
            </div>

            <h2 className="text-4xl font-bold font-arcade tracking-widest uppercase">
              {gameResult.won ? 'UNDISPUTED WORLD CHAMPION!' : 'MATCH OVER!'}
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              {gameResult.won
                ? `You knocked out ${CHAMPIONSHIP_MATCH.alias} in Round ${gameResult.round} to claim the crown!`
                : `${CHAMPIONSHIP_MATCH.alias} retained the championship title. Rest and challenge again!`}
            </p>

            {/* Stats Breakdown */}
            <div className="grid grid-cols-2 gap-2.5 bg-neutral-950 border border-neutral-800 rounded-2xl p-4 my-5 text-left text-xs">
              <div>
                <span className="text-[10px] text-neutral-400 uppercase">Match Score</span>
                <div className="text-lg font-black text-yellow-400 font-mono">
                  {gameResult.finalScore.toLocaleString()}
                </div>
              </div>
              <div>
                <span className="text-[10px] text-neutral-400 uppercase">Fight Time</span>
                <div className="text-lg font-black text-cyan-400 font-mono">
                  {Math.floor(gameResult.timeSeconds / 60)}:{(gameResult.timeSeconds % 60).toString().padStart(2, '0')}
                </div>
              </div>
              <div>
                <span className="text-[10px] text-neutral-400 uppercase">Accuracy</span>
                <div className="text-sm font-bold text-white font-mono">
                  {gameResult.accuracy}% ({gameResult.punchesLanded}/{gameResult.totalPunches})
                </div>
              </div>
              <div>
                <span className="text-[10px] text-neutral-400 uppercase">Max Combo</span>
                <div className="text-sm font-bold text-red-400 font-mono">{gameResult.maxCombo}x Hit</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() =>
                  onOpenFarcasterShare({
                    score: gameResult.finalScore,
                    maxCombo: gameResult.maxCombo,
                    time: gameResult.timeSeconds,
                  })
                }
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs transition-colors shadow-lg shadow-purple-600/30"
              >
                <Share2 className="w-4 h-4" />
                <span>SHARE SCORE TO FARCASTER</span>
              </button>

              <button
                type="button"
                onClick={resetMatch}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-neutral-950 font-bold rounded-xl text-xs transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                <span>FIGHT AGAIN</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

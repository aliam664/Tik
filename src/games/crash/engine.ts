/**
 * Local Sheriff Blast salon — one shared round, two bet slots, auto cash-out.
 * Math/curve from KuliyevMerdan/crash; wallet overlay is Sheriff Coin (virtual).
 */

import {
  BETTING_MS,
  CRASHED_MS,
  HOUSE_EDGE_BPS,
  MAX_BET,
  MAX_SLOTS,
  MIN_BET,
  SALT_PREFIX,
  crashPoint,
  elapsedAt,
  hashSeed,
  multiplierAt,
  payoutFor,
  randomSeed,
} from "./math";

export type CrashPhase = "betting" | "flying" | "crashed";

export interface CrashBet {
  id: string;
  name: string;
  amount: number;
  autoAt: number | null;
  cashedAt: number | null;
  payout: number;
  isMe: boolean;
  bot: boolean;
  slot: 0 | 1;
}

export interface CrashRoundLog {
  index: number;
  crashPoint: number;
  seedHash: string;
  seed: string;
  salt: string;
  playerStake: number;
  playerPayout: number;
  betCount: number;
  cashedCount: number;
  at: number;
}

export interface CrashTelemetry {
  rounds: number;
  playerBets: number;
  playerCashes: number;
  playerBusts: number;
  playerWagered: number;
  playerPaid: number;
  biggestCrash: number;
  biggestWin: number;
  recent: CrashRoundLog[];
}

export interface CrashRoundPublic {
  index: number;
  phase: CrashPhase;
  seedHash: string;
  seed: string | null;
  salt: string;
  crashPoint: number | null;
  bettingEndsAt: number;
  flyingStartedAt: number | null;
  crashedAt: number | null;
  nextAt: number | null;
  bets: CrashBet[];
  history: number[];
}

export interface CrashSalonState {
  round: CrashRoundPublic;
  balance: number;
  sessionWagered: number;
  sessionPnL: number;
  notice: string | null;
}

interface InternalRound {
  index: number;
  seed: string;
  seedHash: string;
  salt: string;
  crashPoint: number;
  phase: CrashPhase;
  bettingStartedAt: number;
  flyingStartedAt: number | null;
  crashedAt: number | null;
  bets: CrashBet[];
}

const BOT_NAMES = ["رستم", "آناهیتا", "کاوه", "شیرین", "بهرام", "آتنا", "فرهاد", "یاسمن"];

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class CrashSalon {
  private round: InternalRound;
  private history: number[] = [];
  private balance: number;
  private walletLocked = false;
  private sessionWagered = 0;
  private sessionPnL = 0;
  private notice: string | null = null;
  private botsSpawned = false;
  private telemetry: Omit<CrashTelemetry, "recent"> = {
    rounds: 0,
    playerBets: 0,
    playerCashes: 0,
    playerBusts: 0,
    playerWagered: 0,
    playerPaid: 0,
    biggestCrash: 0,
    biggestWin: 0,
  };
  private logs: CrashRoundLog[] = [];

  constructor(startingBalance: number, now = Date.now(), seed?: string) {
    this.balance = Math.max(0, Math.floor(startingBalance));
    this.round = this.makeRound(1, now, seed);
  }

  setBalance(n: number): void {
    this.balance = Math.max(0, Math.floor(n));
  }

  /** Apply the Sheriff wallet once — never overwrite session wins. */
  seedBalance(n: number): void {
    if (this.walletLocked) return;
    this.walletLocked = true;
    this.balance = Math.max(0, Math.floor(n));
  }

  getTelemetry(): CrashTelemetry {
    return { ...this.telemetry, recent: this.logs.slice().reverse() };
  }

  getState(now = Date.now()): CrashSalonState {
    this.advance(now);
    const r = this.round;
    const revealed = r.phase === "crashed";
    return {
      round: {
        index: r.index,
        phase: r.phase,
        seedHash: r.seedHash,
        seed: revealed ? r.seed : null,
        salt: r.salt,
        crashPoint: revealed ? r.crashPoint : null,
        bettingEndsAt: r.bettingStartedAt + BETTING_MS,
        flyingStartedAt: r.flyingStartedAt,
        crashedAt: r.crashedAt,
        nextAt: r.crashedAt !== null ? r.crashedAt + CRASHED_MS : null,
        bets: r.bets.map((b) => ({ ...b })),
        history: this.history.slice(-18),
      },
      balance: this.balance,
      sessionWagered: this.sessionWagered,
      sessionPnL: this.sessionPnL,
      notice: this.notice,
    };
  }

  placeBet(
    amount: number,
    autoAt: number | null,
    name: string,
    now = Date.now(),
    slot: 0 | 1 = 0,
  ): CrashBet {
    this.advance(now);
    const r = this.round;
    if (r.phase !== "betting") throw new Error("BETTING_CLOSED");
    const mine = r.bets.filter((b) => b.isMe);
    if (mine.length >= MAX_SLOTS) throw new Error("MAX_SLOTS");
    if (mine.some((b) => b.slot === slot)) throw new Error("SLOT_TAKEN");
    const stake = Math.floor(amount);
    if (!Number.isFinite(stake) || stake < MIN_BET || stake > MAX_BET) throw new Error("INVALID_STAKE");
    if (stake > this.balance) throw new Error("INSUFFICIENT_FUNDS");
    const auto =
      autoAt !== null && Number.isFinite(autoAt) && autoAt >= 101 ? Math.floor(autoAt) : null;
    this.walletLocked = true;
    this.balance -= stake;
    this.sessionWagered += stake;
    this.sessionPnL -= stake;
    this.telemetry.playerBets += 1;
    this.telemetry.playerWagered += stake;
    const bet: CrashBet = {
      id: uid(),
      name: name.slice(0, 24) || "شوالیه",
      amount: stake,
      autoAt: auto,
      cashedAt: null,
      payout: 0,
      isMe: true,
      bot: false,
      slot,
    };
    r.bets.push(bet);
    this.notice = null;
    return bet;
  }

  cashOut(betId: string, now = Date.now()): CrashBet {
    this.advance(now);
    const r = this.round;
    if (r.phase !== "flying" || r.flyingStartedAt === null) throw new Error("NOT_FLYING");
    const bet = r.bets.find((b) => b.id === betId && b.isMe);
    if (!bet) throw new Error("BET_NOT_FOUND");
    if (bet.cashedAt !== null) throw new Error("ALREADY_CASHED");
    const elapsed = now - r.flyingStartedAt;
    if (elapsed >= elapsedAt(r.crashPoint)) throw new Error("ALREADY_CRASHED");
    const at = multiplierAt(elapsed);
    return this.settleBet(bet, at);
  }

  private settleBet(bet: CrashBet, at: number): CrashBet {
    bet.cashedAt = at;
    bet.payout = payoutFor(bet.amount, at);
    this.balance += bet.payout;
    this.sessionPnL += bet.payout;
    if (bet.isMe) {
      this.telemetry.playerCashes += 1;
      this.telemetry.playerPaid += bet.payout;
      if (bet.payout - bet.amount > this.telemetry.biggestWin) {
        this.telemetry.biggestWin = bet.payout - bet.amount;
      }
    }
    return bet;
  }

  private makeRound(index: number, now: number, seedHex?: string): InternalRound {
    const seed = seedHex ?? randomSeed();
    const salt = `${SALT_PREFIX}:${index}`;
    return {
      index,
      seed,
      seedHash: hashSeed(seed),
      salt,
      crashPoint: crashPoint(seed, salt, HOUSE_EDGE_BPS),
      phase: "betting",
      bettingStartedAt: now,
      flyingStartedAt: null,
      crashedAt: null,
      bets: [],
    };
  }

  private advance(now: number): void {
    const r = this.round;
    if (r.phase === "betting") {
      this.maybeSpawnBots(now);
      if (now >= r.bettingStartedAt + BETTING_MS) {
        r.phase = "flying";
        r.flyingStartedAt = r.bettingStartedAt + BETTING_MS;
        if (r.crashPoint <= 100) {
          this.bust(r.flyingStartedAt);
        }
      }
    }
    if (r.phase === "flying" && r.flyingStartedAt !== null) {
      this.runAutos(now);
      const crashMs = elapsedAt(r.crashPoint);
      if (now >= r.flyingStartedAt + crashMs) this.bust(r.flyingStartedAt + crashMs);
    }
    if (r.phase === "crashed" && r.crashedAt !== null && now >= r.crashedAt + CRASHED_MS) {
      this.history.push(r.crashPoint);
      if (this.history.length > 40) this.history.shift();
      this.round = this.makeRound(r.index + 1, r.crashedAt + CRASHED_MS);
      this.botsSpawned = false;
    }
  }

  private bust(at: number): void {
    const r = this.round;
    if (r.phase === "crashed") return;
    r.phase = "crashed";
    r.crashedAt = at;
    this.notice = `انفجار روی ${(r.crashPoint / 100).toFixed(2)}×`;
    const mine = r.bets.filter((b) => b.isMe);
    const playerStake = mine.reduce((s, b) => s + b.amount, 0);
    const playerPayout = mine.reduce((s, b) => s + b.payout, 0);
    if (mine.some((b) => b.cashedAt === null)) this.telemetry.playerBusts += 1;
    this.telemetry.rounds += 1;
    if (r.crashPoint > this.telemetry.biggestCrash) this.telemetry.biggestCrash = r.crashPoint;
    this.logs.push({
      index: r.index,
      crashPoint: r.crashPoint,
      seedHash: r.seedHash,
      seed: r.seed,
      salt: r.salt,
      playerStake,
      playerPayout,
      betCount: r.bets.length,
      cashedCount: r.bets.filter((b) => b.cashedAt !== null).length,
      at,
    });
    if (this.logs.length > 80) this.logs.shift();
  }

  private runAutos(now: number): void {
    const r = this.round;
    if (r.flyingStartedAt === null) return;
    const elapsed = now - r.flyingStartedAt;
    const shown = multiplierAt(elapsed);
    const crashMs = elapsedAt(r.crashPoint);
    for (const bet of r.bets) {
      if (bet.cashedAt !== null) continue;
      if (bet.autoAt !== null && shown >= bet.autoAt && elapsed < crashMs) {
        this.settleBet(bet, bet.autoAt);
        continue;
      }
      if (bet.bot && bet.autoAt === null && elapsed < crashMs) {
        // Bots without a target sometimes cash a little after 1.2×.
        const target = 120 + (bet.amount % 80);
        if (shown >= target) this.settleBet(bet, shown);
      }
    }
  }

  private maybeSpawnBots(now: number): void {
    if (this.botsSpawned) return;
    const elapsed = now - this.round.bettingStartedAt;
    if (elapsed < 400) return;
    this.botsSpawned = true;
    const count = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i += 1) {
      const name = BOT_NAMES[(this.round.index + i) % BOT_NAMES.length] ?? "مهمان";
      const amount = MIN_BET * (1 + Math.floor(Math.random() * 8));
      const autoRoll = Math.random();
      const autoAt = autoRoll < 0.55 ? 130 + Math.floor(Math.random() * 270) : autoRoll < 0.8 ? 200 : null;
      this.round.bets.push({
        id: `bot-${uid()}`,
        name,
        amount,
        autoAt,
        cashedAt: null,
        payout: 0,
        isMe: false,
        bot: true,
        slot: 0,
      });
    }
  }
}

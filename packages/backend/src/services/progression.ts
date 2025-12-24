import { prisma } from '../db/client';

export type TrophyRoadStep = {
  threshold: number;
  reward: string;
};

export type SeasonSnapshot = {
  seasonStart: string;
  seasonEnd: string;
  trophyRoad: TrophyRoadStep[];
};

const DEFAULT_TROPHY_ROAD: TrophyRoadStep[] = [
  { threshold: 50, reward: 'Avatar Frame: Bronze' },
  { threshold: 100, reward: 'Emote: GG' },
  { threshold: 200, reward: 'Trail: Ember' },
  { threshold: 400, reward: 'Title: Challenger' },
];

export class ProgressionService {
  private readonly trophyRoad: TrophyRoadStep[];
  private readonly seasonLengthDays: number;
  private seasonStart: Date;

  constructor(options?: { trophyRoad?: TrophyRoadStep[]; seasonLengthDays?: number }) {
    this.trophyRoad = options?.trophyRoad ?? DEFAULT_TROPHY_ROAD;
    this.seasonLengthDays = options?.seasonLengthDays ?? 45;
    this.seasonStart = new Date();
  }

  async getProgress(userId: string) {
    return prisma.progression.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  async addTrophies(userId: string, delta: number) {
    const progress = await this.getProgress(userId);
    const experience = Math.max(0, progress.experience + delta);
    const level = this.calculateLevel(experience);
    const updated = await prisma.progression.update({
      where: { userId },
      data: { experience, level },
    });

    await prisma.leaderboardEntry.upsert({
      where: { userId },
      update: { score: experience },
      create: { userId, score: experience },
    });

    const unlocked = this.trophyRoad.filter((step) => step.threshold <= experience);
    return { progress: updated, unlocked };
  }

  async resetSeason() {
    this.seasonStart = new Date();
    await prisma.progression.updateMany({ data: { level: 1, experience: 0 } });
    await prisma.leaderboardEntry.updateMany({ data: { score: 0, rank: null } });
  }

  calculateLevel(experience: number): number {
    const base = Math.floor(Math.sqrt(experience / 10));
    return Math.max(1, base);
  }

  getSeasonSnapshot(): SeasonSnapshot {
    const seasonEnd = new Date(this.seasonStart.getTime() + this.seasonLengthDays * 24 * 60 * 60 * 1000);
    return {
      seasonStart: this.seasonStart.toISOString(),
      seasonEnd: seasonEnd.toISOString(),
      trophyRoad: this.trophyRoad,
    };
  }
}

export const progressionService = new ProgressionService();

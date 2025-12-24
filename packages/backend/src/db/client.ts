import { randomUUID } from 'crypto';

type Role = { id: string; name: string };
type User = {
  id: string;
  email: string;
  passwordHash: string;
  roleId: string;
  createdAt: Date;
  updatedAt: Date;
};
type Session = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};
type Friendship = {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: 'pending' | 'accepted';
  createdAt: Date;
  updatedAt: Date;
};
type MatchRecord = {
  id: string;
  participantId: string;
  status: 'matched' | 'completed';
  winnerId?: string | null;
  startedAt: Date;
  endedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
type Progression = {
  userId: string;
  experience: number;
  level: number;
  createdAt: Date;
  updatedAt: Date;
};
type LeaderboardEntry = {
  userId: string;
  score: number;
  rank: number | null;
  createdAt: Date;
  updatedAt: Date;
};

const now = () => new Date();

class MemoryPrisma {
  private roles: Role[] = [];
  private users: User[] = [];
  private sessions: Session[] = [];
  private friendships: Friendship[] = [];
  private matches: MatchRecord[] = [];
  private progressions: Progression[] = [];
  private leaderboard: LeaderboardEntry[] = [];

  role = {
    upsert: async ({
      where,
      create,
    }: {
      where: { name: string };
      create: { name: string };
      update: object;
    }) => {
      const existing = this.roles.find((r) => r.name === where.name);
      if (existing) return existing;
      const role: Role = { id: randomUUID(), name: create.name };
      this.roles.push(role);
      return role;
    },
    findUnique: async ({ where }: { where: { id?: string; name?: string } }) => {
      return this.roles.find((r) => (where.id ? r.id === where.id : r.name === where.name)) ?? null;
    },
    deleteMany: async () => {
      this.roles = [];
      return { count: 0 };
    },
  };

  user = {
    findUnique: async ({
      where,
      include,
    }: {
      where: { id?: string; email?: string };
      include?: { role?: boolean };
    }) => {
      const user =
        this.users.find((u) =>
          where.id
            ? u.id === where.id
            : u.email.toLowerCase() === (where.email ?? '').toLowerCase(),
        ) ?? null;
      if (!user) return null;
      if (include?.role) {
        const role = await this.role.findUnique({ where: { id: user.roleId } });
        return role ? { ...user, role } : user;
      }
      return user;
    },
    create: async ({
      data,
      include,
    }: {
      data: { email: string; passwordHash: string; role: { connect: { id: string } } };
      include?: { role?: boolean };
    }) => {
      const user: User = {
        id: randomUUID(),
        email: data.email,
        passwordHash: data.passwordHash,
        roleId: data.role.connect.id,
        createdAt: now(),
        updatedAt: now(),
      };
      this.users.push(user);
      if (include?.role) {
        const role = await this.role.findUnique({ where: { id: user.roleId } });
        return role ? { ...user, role } : user;
      }
      return user;
    },
    update: async ({
      where,
      data,
      include,
    }: {
      where: { id: string };
      data: { role?: { connect: { id: string } } };
      include?: { role?: boolean };
    }) => {
      const user = this.users.find((u) => u.id === where.id);
      if (!user) throw new Error('User not found');
      if (data.role?.connect?.id) {
        user.roleId = data.role.connect.id;
      }
      user.updatedAt = now();
      if (include?.role) {
        const role = await this.role.findUnique({ where: { id: user.roleId } });
        return role ? { ...user, role } : user;
      }
      return user;
    },
    deleteMany: async () => {
      this.users = [];
      return { count: 0 };
    },
  };

  session = {
    create: async ({ data }: { data: Omit<Session, 'createdAt' | 'updatedAt'> }) => {
      const session: Session = { ...data, createdAt: now(), updatedAt: now() };
      this.sessions.push(session);
      return session;
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      return this.sessions.find((s) => s.id === where.id) ?? null;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Session> }) => {
      const session = this.sessions.find((s) => s.id === where.id);
      if (!session) throw new Error('Session not found');
      Object.assign(session, data, { updatedAt: now() });
      return session;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      this.sessions = this.sessions.filter((s) => s.id !== where.id);
      return { count: 1 };
    },
    findMany: async ({
      where,
      include,
    }: {
      where?: Partial<Session & { expiresAt?: { gt?: Date } }>;
      include?: { user?: boolean };
    } = {}) => {
      let results = [...this.sessions];
      if (where?.expiresAt?.gt) {
        results = results.filter((s) => s.expiresAt > where.expiresAt!.gt!);
      }
      if (where?.userId) {
        results = results.filter((s) => s.userId === where.userId);
      }
      if (include?.user) {
        return results.map((session) => {
          const user = this.users.find((u) => u.id === session.userId);
          return user ? { ...session, user } : session;
        });
      }
      return results;
    },
    deleteMany: async () => {
      this.sessions = [];
      return { count: 0 };
    },
  };

  friendship = {
    findMany: async ({
      where,
      include,
    }: {
      where?: {
        status?: Friendship['status'];
        OR?: Array<{ requesterId?: string; addresseeId?: string }>;
        requesterId?: string;
        addresseeId?: string;
      };
      include?: { requester?: boolean; addressee?: boolean };
    } = {}) => {
      const results = this.friendships.filter((f) => {
        const statusMatch = where?.status ? f.status === where.status : true;
        const directMatch =
          where?.requesterId || where?.addresseeId
            ? f.requesterId === where?.requesterId || f.addresseeId === where?.addresseeId
            : true;
        const orMatch =
          where?.OR && where.OR.length > 0
            ? where.OR.some(
                (clause) =>
                  f.requesterId === clause.requesterId || f.addresseeId === clause.addresseeId,
              )
            : true;
        return statusMatch && directMatch && orMatch;
      });
      if (include?.requester || include?.addressee) {
        return results.map((f) => {
          const requester = this.users.find((u) => u.id === f.requesterId);
          const addressee = this.users.find((u) => u.id === f.addresseeId);
          return { ...f, requester, addressee };
        });
      }
      return results;
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      return this.friendships.find((f) => f.id === where.id) ?? null;
    },
    findFirst: async ({
      where,
    }: {
      where: { requesterId?: string; addresseeId?: string; status?: Friendship['status'] };
    }) => {
      return (
        this.friendships.find(
          (f) =>
            (where.requesterId ? f.requesterId === where.requesterId : true) &&
            (where.addresseeId ? f.addresseeId === where.addresseeId : true) &&
            (where.status ? f.status === where.status : true),
        ) ?? null
      );
    },
    create: async ({
      data,
    }: {
      data: { requesterId: string; addresseeId: string; status: Friendship['status'] };
    }) => {
      const friendship: Friendship = {
        id: randomUUID(),
        ...data,
        createdAt: now(),
        updatedAt: now(),
      };
      this.friendships.push(friendship);
      return friendship;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Friendship> }) => {
      const friendship = this.friendships.find((f) => f.id === where.id);
      if (!friendship) throw new Error('Friendship not found');
      Object.assign(friendship, data, { updatedAt: now() });
      return friendship;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      this.friendships = this.friendships.filter((f) => f.id !== where.id);
      return { count: 1 };
    },
    deleteMany: async () => {
      this.friendships = [];
      return { count: 0 };
    },
  };

  match = {
    findMany: async ({
      where,
      skip = 0,
      take,
      orderBy,
      include,
    }: {
      where?: { id?: { startsWith?: string }; participantId?: string };
      skip?: number;
      take?: number;
      orderBy?: { startedAt?: 'desc' | 'asc' };
      include?: { winner?: boolean };
    } = {}) => {
      let results = this.matches.filter((m) => {
        if (where?.participantId && m.participantId !== where.participantId) return false;
        if (where?.id?.startsWith && !m.id.startsWith(where.id.startsWith)) return false;
        return true;
      });
      if (orderBy?.startedAt === 'desc') {
        results = results.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
      }
      const sliced = typeof take === 'number' ? results.slice(skip, skip + take) : results;
      if (include?.winner) {
        return sliced.map((match) => {
          const winner = match.winnerId
            ? this.users.find((u) => u.id === match.winnerId)
            : undefined;
          return winner ? { ...match, winner } : match;
        });
      }
      return sliced;
    },
    create: async ({
      data,
    }: {
      data: {
        id: string;
        participantId: string;
        status: MatchRecord['status'];
        winnerId?: string | null;
      };
    }) => {
      const match: MatchRecord = {
        id: data.id,
        participantId: data.participantId,
        status: data.status,
        winnerId: data.winnerId ?? null,
        startedAt: now(),
        endedAt: null,
        createdAt: now(),
        updatedAt: now(),
      };
      this.matches.push(match);
      return match;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id?: { startsWith?: string } };
      data: Partial<MatchRecord>;
    }) => {
      let count = 0;
      this.matches = this.matches.map((m) => {
        if (where.id?.startsWith && !m.id.startsWith(where.id.startsWith)) return m;
        count += 1;
        return {
          ...m,
          ...data,
          updatedAt: now(),
          endedAt: data.status === 'completed' ? now() : m.endedAt,
        };
      });
      return { count };
    },
  };

  progression = {
    upsert: async ({
      where,
      create,
    }: {
      where: { userId: string };
      update: object;
      create: { userId: string };
    }) => {
      const existing = this.progressions.find((p) => p.userId === where.userId);
      if (existing) return existing;
      const progression: Progression = {
        userId: create.userId,
        experience: 0,
        level: 1,
        createdAt: now(),
        updatedAt: now(),
      };
      this.progressions.push(progression);
      return progression;
    },
    update: async ({ where, data }: { where: { userId: string }; data: Partial<Progression> }) => {
      const record = this.progressions.find((p) => p.userId === where.userId);
      if (!record) throw new Error('Progression not found');
      Object.assign(record, data, { updatedAt: now() });
      return record;
    },
    updateMany: async ({ data }: { data: Partial<Progression> }) => {
      this.progressions = this.progressions.map((p) => ({ ...p, ...data, updatedAt: now() }));
      return { count: this.progressions.length };
    },
  };

  leaderboardEntry = {
    upsert: async ({
      where,
      update,
      create,
    }: {
      where: { userId: string };
      update: Partial<LeaderboardEntry>;
      create: { userId: string; score: number };
    }) => {
      const existing = this.leaderboard.find((l) => l.userId === where.userId);
      if (existing) {
        Object.assign(existing, update, { updatedAt: now() });
        return existing;
      }
      const entry: LeaderboardEntry = {
        userId: create.userId,
        score: create.score,
        rank: null,
        createdAt: now(),
        updatedAt: now(),
      };
      this.leaderboard.push(entry);
      return entry;
    },
    findMany: async ({
      where,
      skip = 0,
      take = 10,
      orderBy,
      include,
    }: {
      where?: { userId?: { in?: string[] } };
      skip?: number;
      take?: number;
      orderBy?: { score?: 'desc' | 'asc' };
      include?: { user?: boolean };
    } = {}) => {
      let entries = [...this.leaderboard];
      if (where?.userId?.in) {
        entries = entries.filter((e) => where.userId?.in?.includes(e.userId));
      }
      if (orderBy?.score === 'desc') {
        entries.sort((a, b) => b.score - a.score);
      }
      const sliced = entries.slice(skip, skip + take);
      if (include?.user) {
        return sliced.map((entry) => {
          const user = this.users.find((u) => u.id === entry.userId);
          return user ? { ...entry, user } : entry;
        });
      }
      return sliced;
    },
    updateMany: async ({ data }: { data: Partial<LeaderboardEntry> }) => {
      this.leaderboard = this.leaderboard.map((e) => ({ ...e, ...data, updatedAt: now() }));
      return { count: this.leaderboard.length };
    },
  };

  async $executeRawUnsafe() {
    return 0;
  }

  async $disconnect() {
    return;
  }
}

export const prisma: any = new MemoryPrisma();

export const ensureRole = async (name: string) => {
  const normalized = name.toLowerCase();
  return prisma.role.upsert({
    where: { name: normalized },
    update: {},
    create: { name: normalized },
  });
};

export const closePrisma = async () => {
  await prisma.$disconnect();
};

// Shapes written by the RuneLite plugin (runelite-plugin/, schemaVersion 1).

export interface Envelope<T> {
  schemaVersion: number;
  pluginVersion: string;
  category: string;
  accountHash: string;
  profileType: string;
  rsn: string;
  capturedAt: string;
  data: T;
}

export interface IndexEntry {
  key: string;
  accountHash: string;
  profileType: string;
  rsn: string;
  accountType: string;
  lastSeen: string;
}

export interface AccountData {
  rsn: string;
  accountType: number;
  accountTypeName: string;
  hardcoreStatusLost: boolean;
  combatLevel: number | null;
  totalLevel: number;
  totalXp: number;
  questPoints: number;
  combatAchievementPoints: number;
  collectionLog: { obtained: number; total: number };
  membersWorld: boolean;
}

export interface StatusData {
  loggedIn: boolean;
  heartbeatAt: string;
  world?: number;
  location?: { x: number; y: number; plane: number; regionId: number; instanced: boolean };
}

export interface SkillEntry {
  name: string;
  level: number;
  boostedLevel: number;
  xp: number;
}

export interface SkillsData {
  totalLevel: number;
  totalXp: number;
  skills: SkillEntry[];
}

export interface QuestEntry {
  id: string;
  name: string;
  state: 'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED' | 'UNKNOWN';
}

export interface QuestsData {
  questPoints: number;
  finished: number;
  total: number;
  quests: QuestEntry[];
}

export type DiaryTier = 'easy' | 'medium' | 'hard' | 'elite';

export interface DiariesData {
  tiersComplete: number;
  tiersTotal: number;
  regions: {
    region: string;
    tiers: Record<DiaryTier, { complete: boolean; raw: number; tasksDone?: number; tasksTotal?: number }>;
  }[];
  /** Raw per-task vars (plugin 0.5.0+): var id -> value. */
  taskVars?: { varps: Record<string, number>; varbits: Record<string, number> };
}

export interface CombatAchievementsData {
  points: number;
  completedCount: number;
  completedTaskIds: number[];
  tierStatusRaw: Record<string, number>;
  taskVarps: number[];
}

export interface SlayerData {
  hasTask: boolean;
  taskId: number;
  taskName: string | null;
  bossName: string | null;
  amountRemaining: number;
  initialAmount: number;
  konarAreaId: number;
  masterId: number;
  masterName: string | null;
  points: number;
  streak: number;
  wildernessStreak: number;
}

export interface CollectionLogData {
  /** Unique obtained slots according to the game (as of the last time the log was opened). */
  obtainedCount: number;
  totalSlots: number;
  /** How many obtained items this export knows individually. */
  knownObtained: number;
  /** Set when a capture covered every obtained item (the log's search view). */
  lastCompleteCaptureAt: string | null;
  updatedAt: string;
  /** Item id -> obtained count. */
  obtained: Record<string, number>;
  tabs?: { name: string; pages: { name: string; items: { id: number; name: string }[] }[] }[];
}

export interface ItemEntry {
  slot: number;
  equipmentSlot?: string;
  id: number;
  name: string;
  quantity: number;
  noted: boolean;
  gePrice: number;
  haPrice: number;
}

export interface ContainerData {
  container: string;
  itemCount: number;
  geValue: number;
  haValue: number;
  items: ItemEntry[];
}

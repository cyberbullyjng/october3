export interface BackupRole {
  id: string;
  name: string;
  color: number;
  permissions: string;
  position: number;
  hoist: boolean;
  mentionable: boolean;
}

export interface BackupOverwrite {
  id: string;
  type: 0 | 1;
  allow: string;
  deny: string;
}

export interface BackupChannel {
  id: string;
  name: string;
  type: number;
  position: number;
  topic: string | null;
  nsfw: boolean;
  rateLimitPerUser: number;
  parentId: string | null;
  overwrites: BackupOverwrite[];
  bitrate?: number;
  userLimit?: number;
}

export interface ServerBackup {
  id: string;
  createdAt: number;
  createdBy: string;
  guildName: string;
  memberCount: number;
  roles: BackupRole[];
  categories: BackupChannel[];
  channels: BackupChannel[];
}

export interface AutostaffTier {
  roleId: string;
  label: string;
  minMods: number;
  minMessages: number;
}

export interface AutostaffUserStats {
  mods: number;
  messages: number;
  tier: number;
}

export type ModAction = {
  type: string;
  reason: string;
  moderator: string;
  timestamp: number;
  caseId?: number;
  targetId?: string;
};

export interface GiveawayData {
  messageId: string;
  channelId: string;
  guildId: string;
  prize: string;
  winnerCount: number;
  endsAt: number;
  hostTag: string;
  ended: boolean;
}

export interface BtPlayer {
  userId: string;
  tag: string;
  lives: number;
}

export interface BlackteaGame {
  phase: "lobby" | "active";
  players: BtPlayer[];
  currentIdx: number;
  letters: string[];
  channelId: string;
  guildId: string;
  joiners: Set<string>;
  lobbyMessageId: string | null;
  turnTimer: NodeJS.Timeout | null;
  lobbyTimer: NodeJS.Timeout | null;
  usedWords: Set<string>;
  turnStartedAt: number;
  solo: boolean;
  score: number;
}

export interface PendingConfirm {
  authorId: string;
  action: () => Promise<void>;
  expiresAt: number;
}

export interface PageSession {
  authorId: string;
  pages: string[];
  current: number;
  title: string;
  color: number;
  expiresAt: number;
  header?: string;
  footer?: string;
  style?: "audit";
}

export interface TagData {
  content: string;
  createdBy: string;
  createdAt: number;
}

export interface CounterChannel {
  type: "members" | "bots" | "boosts" | "online" | "channels";
  label: string;
}

export interface AutoresponderEntry {
  response: string;
  exact: boolean;
  dm: boolean;
  regex?: boolean;
  strict?: boolean;
  reply?: boolean;
  deleteMsg?: boolean;
  selfDestruct?: number;
}

export interface GuildState {
  joinLeaveChannelId: string | null;
  messageDeleteChannelId: string | null;
  automodLogChannelId: string | null;
  antinukeLogChannelId: string | null;
  dmLogChannelId: string | null;
  editLogChannelId: string | null;
  voiceLogChannelId: string | null;
  nicknameLogChannelId: string | null;
  memberCountChannelId: string | null;
  onlineCountChannelId: string | null;
  repRoleId: string | null;
  pingChannelId: string | null;
  jailRoleId: string | null;
  jailChannelId: string | null;
  modLogChannelId: string | null;
  autoRoleId: string | null;
  welcomeChannelId: string | null;
  welcomeMessage: string;
  autoPubEnabled: boolean;
  inviteFilterEnabled: boolean;
  ticketCategoryId: string | null;
  lastVanityCode: string | null;
  repKeyword: string;
  antinukeThresholds: { bans: number; kicks: number; channelDeletes: number; roleDeletes: number; botAdds: number };
  antinukeWhitelist: Set<string>;
  permGuardWhitelist: Set<string>;
  antinukeAdmins: Set<string>;
  antinukeActions: Map<string, { bans: number[]; kicks: number[]; channelDeletes: number[]; roleDeletes: number[]; botAdds: number[] }>;
  botAccessUsers: Set<string>;
  filterBypassUsers: Set<string>;
  customFilterWords: Set<string>;
  warnings: Map<string, { reason: string; timestamp: number }[]>;
  modHistory: Map<string, ModAction[]>;
  caseCounter: number;
  caseIndex: Map<number, string>;
  modNotes: Map<string, { text: string; timestamp: number }[]>;
  jailedMembers: Map<string, string[]>;
  jailExpiry: Map<string, number>;
  hardbannedUsers: Set<string>;
  customCommands: Map<string, string>;
  aliases: Map<string, string>;
  reactionRoles: Map<string, Map<string, string>>;
  strippedStaff: Map<string, string[]>;
  stickyMessages: Map<string, { content: string; messageId: string }>;
  ticketChannels: Set<string>;
  staffBlacklistRoleId: string | null;
  staffBlacklist: Map<string, { reason: string; addedBy: string; timestamp: number; strippedRoles: string[] }>;
  boosterRoleId: string | null;
  boosterCustomRoles: Map<string, string>;
  autostaffEnabled: boolean;
  autostaffTiers: AutostaffTier[];
  autostaffStats: Map<string, AutostaffUserStats>;
  autostaffLogChannelId: string | null;
  autostaffBaseRoleId: string | null;
  prefix: string;
  tempRoles: Map<string, { roleId: string; expiresAt: number }[]>;
  forcedNicknames: Map<string, string>;
  imageOnlyChannels: Set<string>;
  starboardChannelId: string | null;
  starboardThreshold: number;
  starboardPosted: Map<string, string>;
  countingChannelId: string | null;
  countingCurrent: number;
  countingLastUserId: string | null;
  xpEnabled: boolean;
  xpData: Map<string, { xp: number; level: number; messages: number }>;
  xpRoles: { minLevel: number; roleId: string }[];
  xpLevelUpChannelId: string | null;
  antiSpamEnabled: boolean;
  antiSpamThreshold: number;
  antiSpamWindowMs: number;
  spamBypass: Set<string>;
  buttonRoleMessages: Map<string, { channelId: string; buttons: { label: string; emoji?: string; roleId: string }[] }>;
  leaveDmEnabled: boolean;
  leaveDmMessage: string;
  backups: Map<string, ServerBackup>;
  imageBlacklist: Set<string>;
  streamBlacklist: Set<string>;
  linkFilterBypass: Set<string>;
  joinRaidProtectionEnabled: boolean;
  joinRaidThreshold: number;
  joinRaidWindowMs: number;
  joinAgeGateEnabled: boolean;
  joinAgeGateDays: number;
  blackteaWins: Map<string, number>;
  warnKickThreshold: number;
  warnBanThreshold: number;
  reportChannelId: string | null;
  antinukeEnabled: boolean;
  antinukeRestoreEnabled: boolean;
  antinukeWindowMs: number;
  botWhitelist: Set<string>;
  repEnabled: boolean;
  vcSetupCategoryId: string | null;
  vcJoinChannelId: string | null;
  vcChannelOwners: Map<string, string>;
  vcAllowList: Map<string, Set<string>>;
  roleRestoreEnabled: boolean;
  roleBackup: Map<string, string[]>;
  raidAction: "kick" | "jail" | "ban" | "timeout";
  savedVerificationLevel: number | null;
  giveaways: Map<string, GiveawayData>;
  imageLocked: boolean;
  imageLockRoleIds: string[];
  birthdayChannelId: string | null;
  birthdays: Map<string, string>;
  capsLockFilterEnabled: boolean;
  capsLockThreshold: number;
  antiAltEnabled: boolean;
  antiAltDays: number;
  dailyCooldowns: Map<string, number>;
  goodbyeChannelId: string | null;
  goodbyeMessage: string;
  boostChannelId: string | null;
  boostMessage: string;
  clownboardChannelId: string | null;
  clownboardThreshold: number;
  clownboardPosted: Map<string, string>;
  tags: Map<string, TagData>;
  bumpReminderChannelId: string | null;
  bumpReminderEnabled: boolean;
  bumpReminderLastBump: number;
  disabledCommands: Map<string, Set<string>>;
  counterChannels: Map<string, CounterChannel>;
  autoresponders: Map<string, AutoresponderEntry>;
  stripRoles: Map<string, string[]>;
  antiEveryonePingEnabled: boolean;
  antiEveryonePingAction: "delete" | "mute" | "ban";
  permGuardEnabled: boolean;
  rolePermBackup: Map<string, string>;
  userTimezones: Map<string, string>;
  pingOnJoinEnabled: boolean;
  pingOnJoinChannelIds: string[];
  boosterDmEnabled: boolean;
  boosterDmMessage: string;
  mutedRoleId: string | null;
  imageMutedRoleId: string | null;
  reactionMutedRoleId: string | null;
  disabledEvents: Set<string>;
  welcomeSelfDestruct: number | null;
  goodbyeSelfDestruct: number | null;
  boostSelfDestruct: number | null;
  uwuLockedUsers: Set<string>;
  capsFilterEnabled: boolean;
  capsFilterPercent: number;
  emojiFilterEnabled: boolean;
  emojiFilterMax: number;
  massmentionFilterEnabled: boolean;
  massmentionFilterThreshold: number;
  musicFileFilterEnabled: boolean;
  spoilerFilterEnabled: boolean;
  antiraidDefaultPfpEnabled: boolean;
  antiraidDefaultPfpAction: "kick" | "ban";
  antiraidNewAccountsEnabled: boolean;
  antiraidNewAccountsAge: number;
  antiraidNewAccountsAction: "kick" | "ban";
  tempBans: Map<string, { unbanAt: number; moderatorTag: string }>;
}

export interface WordleGame {
  word: string;
  guesses: string[];
  channelId: string;
  guildId: string;
  startedBy: string;
  maxGuesses: number;
  messageId: string | null;
}

export interface TicTacToeGame {
  board: (string | null)[];
  playerX: string;
  playerO: string;
  turn: string;
  messageId: string | null;
  channelId: string;
  guildId: string;
  expiresAt: number;
}

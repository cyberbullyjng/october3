import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import type { GuildState, GiveawayData, AutostaffUserStats, ServerBackup, WordleGame, TagData, CounterChannel, AutoresponderEntry } from "./types.js";
import { OWNER_ID, CO_OWNER_IDS, PERMANENT_WHITELIST } from "./constants.js";
import client from "./client.js";

const STATE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const STATE_FILE = path.join(STATE_DIR, "state.json");

let _saveTimer: ReturnType<typeof setTimeout> | null = null;
let _stateLoaded = false;

// ─── Per-guild state map ───────────────────────────────────────────────────────
export const guildStates = new Map<string, GuildState>();

export function getGS(guildId: string): GuildState {
  if (!guildStates.has(guildId)) {
    guildStates.set(guildId, {
      joinLeaveChannelId: null, messageDeleteChannelId: null,
      automodLogChannelId: null, antinukeLogChannelId: null,
      dmLogChannelId: null, editLogChannelId: null,
      voiceLogChannelId: null, nicknameLogChannelId: null,
      memberCountChannelId: null, onlineCountChannelId: null,
      repRoleId: null, pingChannelId: null,
      jailRoleId: null, jailChannelId: null,
      modLogChannelId: null, autoRoleId: null,
      welcomeChannelId: null,
      welcomeMessage: "Welcome to the server, {user}! ",
      autoPubEnabled: true, inviteFilterEnabled: true,
      ticketCategoryId: null, lastVanityCode: null,
      repKeyword: "",
      antinukeThresholds: { bans: 3, kicks: 3, channelDeletes: 2, roleDeletes: 2, botAdds: 1 },
      antinukeWhitelist: new Set(PERMANENT_WHITELIST),
      permGuardWhitelist: new Set(PERMANENT_WHITELIST),
      antinukeAdmins: new Set([OWNER_ID, ...CO_OWNER_IDS]),
      antinukeActions: new Map(),
      botAccessUsers: new Set(), filterBypassUsers: new Set(), customFilterWords: new Set(),
      warnings: new Map(), modHistory: new Map(),
      caseCounter: 0, caseIndex: new Map(),
      modNotes: new Map(), jailedMembers: new Map(), jailExpiry: new Map(), hardbannedUsers: new Set(),
      customCommands: new Map(), aliases: new Map(),
      reactionRoles: new Map(),
      strippedStaff: new Map(), stickyMessages: new Map(),
      ticketChannels: new Set(),
      staffBlacklistRoleId: null,
      staffBlacklist: new Map(),
      boosterRoleId: null,
      boosterCustomRoles: new Map(),
      autostaffEnabled: false,
      autostaffTiers: [],
      autostaffStats: new Map(),
      autostaffLogChannelId: null,
      autostaffBaseRoleId: null,
      prefix: ",",
      tempRoles: new Map(),
      imageOnlyChannels: new Set(),
      starboardChannelId: null,
      starboardThreshold: 3,
      starboardPosted: new Map(),
      countingChannelId: null,
      countingCurrent: 0,
      countingLastUserId: null,
      xpEnabled: false,
      xpData: new Map(),
      xpRoles: [],
      xpLevelUpChannelId: null,
      antiSpamEnabled: true,
      antiSpamThreshold: 5,
      antiSpamWindowMs: 5000,
      spamBypass: new Set(),
      buttonRoleMessages: new Map(),
      leaveDmEnabled: false,
      leaveDmMessage: "You have left **{server}**. We hope to see you again!",
      backups: new Map(),
      imageBlacklist: new Set(),
      streamBlacklist: new Set(),
      linkFilterBypass: new Set(),
      joinRaidProtectionEnabled: false,
      joinRaidThreshold: 8,
      joinRaidWindowMs: 10_000,
      joinAgeGateEnabled: false,
      joinAgeGateDays: 7,
      blackteaWins: new Map(),
      warnKickThreshold: 3,
      warnBanThreshold: 5,
      reportChannelId: null,
      antinukeEnabled: true,
      antinukeRestoreEnabled: true,
      antinukeWindowMs: 5000,
      botWhitelist: new Set(),
      repEnabled: true,
      vcSetupCategoryId: null,
      vcJoinChannelId: null,
      vcChannelOwners: new Map(),
      vcAllowList: new Map(),
      roleRestoreEnabled: false,
      roleBackup: new Map(),
      raidAction: "kick",
      savedVerificationLevel: null,
      giveaways: new Map(),
      imageLocked: false,
      imageLockRoleIds: [],
      birthdayChannelId: null,
      birthdays: new Map(),
      capsLockFilterEnabled: false,
      capsLockThreshold: 70,
      antiAltEnabled: false,
      antiAltDays: 30,
      dailyCooldowns: new Map(),
      goodbyeChannelId: null,
      goodbyeMessage: "Goodbye, {user}! We'll miss you.",
      boostChannelId: null,
      boostMessage: "🎉 {user} just boosted the server! Thank you!",
      clownboardChannelId: null,
      clownboardThreshold: 3,
      clownboardPosted: new Map(),
      tags: new Map(),
      bumpReminderChannelId: null,
      bumpReminderEnabled: false,
      bumpReminderLastBump: 0,
      disabledCommands: new Map(),
      counterChannels: new Map(),
      autoresponders: new Map(),
      stripRoles: new Map(),
      antiEveryonePingEnabled: false,
      antiEveryonePingAction: "delete",
      permGuardEnabled: false,
      rolePermBackup: new Map(),
      userTimezones: new Map(),
      forcedNicknames: new Map(),
      pingOnJoinEnabled: false,
      pingOnJoinChannelIds: [],
      boosterDmEnabled: false,
      boosterDmMessage: "Thanks for boosting **{server}**, {user}! 🎉",
      mutedRoleId: null,
      imageMutedRoleId: null,
      reactionMutedRoleId: null,
      disabledEvents: new Set(),
      welcomeSelfDestruct: null,
      goodbyeSelfDestruct: null,
      boostSelfDestruct: null,
      uwuLockedUsers: new Set(),
      capsFilterEnabled: false,
      capsFilterPercent: 70,
      emojiFilterEnabled: false,
      emojiFilterMax: 10,
      massmentionFilterEnabled: false,
      massmentionFilterThreshold: 5,
      musicFileFilterEnabled: false,
      spoilerFilterEnabled: false,
      antiraidDefaultPfpEnabled: false,
      antiraidDefaultPfpAction: "kick" as const,
      antiraidNewAccountsEnabled: false,
      antiraidNewAccountsAge: 7,
      antiraidNewAccountsAction: "kick" as const,
      tempBans: new Map(),
    });
  }
  return guildStates.get(guildId)!;
}

// ─── Global state ─────────────────────────────────────────────────────────────
export const afkUsers = new Map<string, { reason: string; timestamp: number }>();
export let maintenanceMode = false;
export function setMaintenanceMode(v: boolean) { maintenanceMode = v; }
export const globalBannedUsers = new Map<string, { reason: string; timestamp: number }>();
export const blacklistedServers = new Set<string>();
export const recentlyPinged = new Map<string, number>();
export let statsUpdateTimer: ReturnType<typeof setTimeout> | null = null;
export function setStatsUpdateTimer(v: ReturnType<typeof setTimeout> | null) { statsUpdateTimer = v; }
export const channelMessageTimes = new Map<string, number[]>();
export const slowmodeTimers = new Map<string, ReturnType<typeof setTimeout>>();
export const botStartTime = Date.now();
export const msgStore = new Map<string, { content: string; authorTag: string; authorAvatar: string | null; attachments: string[] }>();
export const MSG_STORE_MAX = 2000;
export const snipeCache = new Map<
  string,
  { content: string; authorTag: string; authorAvatar: string | null; authorId: string; timestamp: number; attachments: string[] }[]
>();
export const editSnipeCache = new Map<
  string,
  { before: string; after: string; authorTag: string; authorAvatar: string | null; authorId: string; messageUrl: string; timestamp: number }
>();
export const reactionSnipeCache = new Map<
  string,
  { emoji: string; authorTag: string; authorAvatar: string | null; authorId: string; messageId: string; timestamp: number }
>();
export const antiSpamTracker = new Map<string, Map<string, number[]>>();
export const everyonePingTracker = new Map<string, Map<string, number[]>>(); // guildId → userId → timestamps
export const spamOffenses = new Map<string, Map<string, number>>();
export const joinTracker = new Map<string, number[]>();
export const raidModeActive = new Set<string>();
export const xpCooldowns = new Map<string, Map<string, number>>();
export const blackteaGames = new Map<string, import("./types.js").BlackteaGame>();
export const wordValidCache = new Map<string, boolean>();
export const wordleGames = new Map<string, WordleGame>();
export const tttGames = new Map<string, import("./types.js").TicTacToeGame>();
export const autoresponderCooldowns = new Map<string, number>();
export const filterDmCooldown = new Map<string, number>();
export const inviteCache = new Map<string, Map<string, number>>();
export const jailTimers = new Map<string, Map<string, ReturnType<typeof setTimeout>>>();
export const pendingConfirms = new Map<string, import("./types.js").PendingConfirm>();
export const paginatedSessions = new Map<string, import("./types.js").PageSession>();
export const activeGiveawayTimers = new Map<string, ReturnType<typeof setTimeout>>();
export const bumpReminderTimers = new Map<string, ReturnType<typeof setTimeout>>();
export const lastfmAccounts = new Map<string, string>(); // userId → lastfm username
export const floodTracker = new Map<
  string,
  Map<string, { users: Set<string>; messageIds: string[]; firstSeen: number }>
>();

// ─── Persistence ──────────────────────────────────────────────────────────────
// Debounced: trailing — resets the timer on every call, writes 2 s after the last call.
export function saveState() {
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
  const _t = setTimeout(async () => {
    _saveTimer = null;
    try {
      const serialized: Record<string, any> = {};
      for (const [guildId, g] of guildStates) {
        serialized[guildId] = {
          joinLeaveChannelId: g.joinLeaveChannelId,
          messageDeleteChannelId: g.messageDeleteChannelId,
          automodLogChannelId: g.automodLogChannelId,
          antinukeLogChannelId: g.antinukeLogChannelId,
          dmLogChannelId: g.dmLogChannelId,
          editLogChannelId: g.editLogChannelId,
          voiceLogChannelId: g.voiceLogChannelId,
          nicknameLogChannelId: g.nicknameLogChannelId,
          memberCountChannelId: g.memberCountChannelId,
          onlineCountChannelId: g.onlineCountChannelId,
          repRoleId: g.repRoleId,
          pingChannelId: g.pingChannelId,
          jailRoleId: g.jailRoleId,
          jailChannelId: g.jailChannelId,
          modLogChannelId: g.modLogChannelId,
          autoRoleId: g.autoRoleId,
          welcomeChannelId: g.welcomeChannelId,
          welcomeMessage: g.welcomeMessage,
          autoPubEnabled: g.autoPubEnabled,
          inviteFilterEnabled: g.inviteFilterEnabled,
          ticketCategoryId: g.ticketCategoryId,
          lastVanityCode: g.lastVanityCode,
          repKeyword: g.repKeyword,
          antinukeThresholds: { ...g.antinukeThresholds },
          antinukeActions: [...g.antinukeActions.entries()],
          antinukeWhitelist: [...g.antinukeWhitelist],
          botWhitelist: [...g.botWhitelist],
          permGuardWhitelist: [...g.permGuardWhitelist],
          antinukeAdmins: [...g.antinukeAdmins],
          botAccessUsers: [...g.botAccessUsers],
          filterBypassUsers: [...g.filterBypassUsers],
          customFilterWords: [...g.customFilterWords],
          aliases: [...g.aliases.entries()],
          customCommands: [...g.customCommands.entries()],
          reactionRoles: [...g.reactionRoles.entries()].map(([msgId, map]) => [msgId, [...map.entries()]]),
          strippedStaff: [...g.strippedStaff.entries()],
          stickyMessages: [...g.stickyMessages.entries()],
          ticketChannels: [...g.ticketChannels],
          warnings: [...g.warnings.entries()],
          modHistory: [...g.modHistory.entries()],
          caseCounter: g.caseCounter,
          caseIndex: [...g.caseIndex.entries()],
          modNotes: [...g.modNotes.entries()],
          jailedMembers: [...g.jailedMembers.entries()],
          jailExpiry: [...g.jailExpiry.entries()],
          hardbannedUsers: [...g.hardbannedUsers],
          staffBlacklistRoleId: g.staffBlacklistRoleId,
          staffBlacklist: [...g.staffBlacklist.entries()],
          boosterRoleId: g.boosterRoleId,
          boosterCustomRoles: [...g.boosterCustomRoles.entries()],
          autostaffEnabled: g.autostaffEnabled,
          autostaffTiers: g.autostaffTiers,
          autostaffLogChannelId: g.autostaffLogChannelId,
          autostaffBaseRoleId: g.autostaffBaseRoleId,
          autostaffStats: [...g.autostaffStats.entries()],
          prefix: g.prefix,
          tempRoles: [...g.tempRoles.entries()],
          imageOnlyChannels: [...g.imageOnlyChannels],
          starboardChannelId: g.starboardChannelId,
          starboardThreshold: g.starboardThreshold,
          starboardPosted: [...g.starboardPosted.entries()],
          countingChannelId: g.countingChannelId,
          countingCurrent: g.countingCurrent,
          countingLastUserId: g.countingLastUserId,
          xpEnabled: g.xpEnabled,
          xpData: [...g.xpData.entries()],
          xpRoles: g.xpRoles,
          xpLevelUpChannelId: g.xpLevelUpChannelId,
          antiSpamEnabled: g.antiSpamEnabled,
          antiSpamThreshold: g.antiSpamThreshold,
          antiSpamWindowMs: g.antiSpamWindowMs,
          spamBypass: [...g.spamBypass],
          buttonRoleMessages: [...g.buttonRoleMessages.entries()],
          leaveDmEnabled: g.leaveDmEnabled,
          leaveDmMessage: g.leaveDmMessage,
          backups: [...g.backups.entries()].map(([id, b]) => [id, b]),
          imageBlacklist: [...g.imageBlacklist],
          streamBlacklist: [...g.streamBlacklist],
          linkFilterBypass: [...g.linkFilterBypass],
          joinRaidProtectionEnabled: g.joinRaidProtectionEnabled,
          joinRaidThreshold: g.joinRaidThreshold,
          joinRaidWindowMs: g.joinRaidWindowMs,
          joinAgeGateEnabled: g.joinAgeGateEnabled,
          joinAgeGateDays: g.joinAgeGateDays,
          blackteaWins: [...g.blackteaWins.entries()],
          warnKickThreshold: g.warnKickThreshold,
          warnBanThreshold: g.warnBanThreshold,
          reportChannelId: g.reportChannelId,
          antinukeEnabled: g.antinukeEnabled,
          antinukeRestoreEnabled: g.antinukeRestoreEnabled,
          antinukeWindowMs: g.antinukeWindowMs,
          repEnabled: g.repEnabled,
          giveaways: [...g.giveaways.entries()],
          vcSetupCategoryId: g.vcSetupCategoryId,
          vcJoinChannelId: g.vcJoinChannelId,
          vcChannelOwners: [...g.vcChannelOwners.entries()],
          vcAllowList: [...g.vcAllowList.entries()].map(([cId, s]) => [cId, [...s]]),
          roleRestoreEnabled: g.roleRestoreEnabled,
          roleBackup: [...g.roleBackup.entries()],
          raidAction: g.raidAction,
          savedVerificationLevel: g.savedVerificationLevel,
          imageLocked: g.imageLocked,
          imageLockRoleIds: g.imageLockRoleIds,
          birthdayChannelId: g.birthdayChannelId,
          birthdays: [...g.birthdays.entries()],
          capsLockFilterEnabled: g.capsLockFilterEnabled,
          capsLockThreshold: g.capsLockThreshold,
          antiAltEnabled: g.antiAltEnabled,
          antiAltDays: g.antiAltDays,
          dailyCooldowns: [...g.dailyCooldowns.entries()],
          goodbyeChannelId: g.goodbyeChannelId,
          goodbyeMessage: g.goodbyeMessage,
          boostChannelId: g.boostChannelId,
          boostMessage: g.boostMessage,
          clownboardChannelId: g.clownboardChannelId,
          clownboardThreshold: g.clownboardThreshold,
          clownboardPosted: [...g.clownboardPosted.entries()],
          tags: [...g.tags.entries()],
          bumpReminderChannelId: g.bumpReminderChannelId,
          bumpReminderEnabled: g.bumpReminderEnabled,
          bumpReminderLastBump: g.bumpReminderLastBump,
          disabledCommands: [...g.disabledCommands.entries()].map(([ch, cmds]) => [ch, [...cmds]]),
          counterChannels: [...g.counterChannels.entries()],
          autoresponders: [...g.autoresponders.entries()],
          stripRoles: [...g.stripRoles.entries()],
          forcedNicknames: [...g.forcedNicknames.entries()],
          antiEveryonePingEnabled: g.antiEveryonePingEnabled,
          antiEveryonePingAction: g.antiEveryonePingAction,
          permGuardEnabled: g.permGuardEnabled,
          rolePermBackup: [...g.rolePermBackup.entries()],
          userTimezones: [...g.userTimezones.entries()],
          pingOnJoinEnabled: g.pingOnJoinEnabled,
          pingOnJoinChannelIds: [...g.pingOnJoinChannelIds],
          boosterDmEnabled: g.boosterDmEnabled,
          boosterDmMessage: g.boosterDmMessage,
          mutedRoleId: g.mutedRoleId,
          imageMutedRoleId: g.imageMutedRoleId,
          reactionMutedRoleId: g.reactionMutedRoleId,
          disabledEvents: [...g.disabledEvents],
          welcomeSelfDestruct: g.welcomeSelfDestruct,
          goodbyeSelfDestruct: g.goodbyeSelfDestruct,
          boostSelfDestruct: g.boostSelfDestruct,
          uwuLockedUsers: [...g.uwuLockedUsers],
          tempBans: [...g.tempBans.entries()],
          capsFilterEnabled: g.capsFilterEnabled,
          capsFilterPercent: g.capsFilterPercent,
          emojiFilterEnabled: g.emojiFilterEnabled,
          emojiFilterMax: g.emojiFilterMax,
          massmentionFilterEnabled: g.massmentionFilterEnabled,
          massmentionFilterThreshold: g.massmentionFilterThreshold,
          musicFileFilterEnabled: g.musicFileFilterEnabled,
          spoilerFilterEnabled: g.spoilerFilterEnabled,
          antiraidDefaultPfpEnabled: g.antiraidDefaultPfpEnabled,
          antiraidDefaultPfpAction: g.antiraidDefaultPfpAction,
          antiraidNewAccountsEnabled: g.antiraidNewAccountsEnabled,
          antiraidNewAccountsAge: g.antiraidNewAccountsAge,
          antiraidNewAccountsAction: g.antiraidNewAccountsAction,
        };
      }
      serialized["_global"] = {
        globalBannedUsers: [...globalBannedUsers.entries()],
        blacklistedServers: [...blacklistedServers],
        lastfmAccounts: [...lastfmAccounts.entries()],
        afkUsers: [...afkUsers.entries()],
      };
      const tmp = STATE_FILE + ".tmp";
      await fs.promises.writeFile(tmp, JSON.stringify(serialized));
      await fs.promises.rename(tmp, STATE_FILE);
    } catch (err) {
      console.error("[state] Failed to save:", err);
    }
  }, 2_000);
  _saveTimer = _t;
  _t.unref();
}

export function flushState() {
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
  try {
    const serialized: Record<string, any> = {};
    for (const [guildId, g] of guildStates) {
      serialized[guildId] = {
        joinLeaveChannelId: g.joinLeaveChannelId,
        messageDeleteChannelId: g.messageDeleteChannelId,
        automodLogChannelId: g.automodLogChannelId,
        antinukeLogChannelId: g.antinukeLogChannelId,
        dmLogChannelId: g.dmLogChannelId,
        editLogChannelId: g.editLogChannelId,
        voiceLogChannelId: g.voiceLogChannelId,
        nicknameLogChannelId: g.nicknameLogChannelId,
        memberCountChannelId: g.memberCountChannelId,
        onlineCountChannelId: g.onlineCountChannelId,
        repRoleId: g.repRoleId,
        pingChannelId: g.pingChannelId,
        jailRoleId: g.jailRoleId,
        jailChannelId: g.jailChannelId,
        modLogChannelId: g.modLogChannelId,
        autoRoleId: g.autoRoleId,
        welcomeChannelId: g.welcomeChannelId,
        welcomeMessage: g.welcomeMessage,
        autoPubEnabled: g.autoPubEnabled,
        inviteFilterEnabled: g.inviteFilterEnabled,
        ticketCategoryId: g.ticketCategoryId,
        lastVanityCode: g.lastVanityCode,
        repKeyword: g.repKeyword,
        antinukeThresholds: { ...g.antinukeThresholds },
        antinukeActions: [...g.antinukeActions.entries()],
        antinukeWhitelist: [...g.antinukeWhitelist],
        botWhitelist: [...g.botWhitelist],
        permGuardWhitelist: [...g.permGuardWhitelist],
        antinukeAdmins: [...g.antinukeAdmins],
        botAccessUsers: [...g.botAccessUsers],
        filterBypassUsers: [...g.filterBypassUsers],
        customFilterWords: [...g.customFilterWords],
        aliases: [...g.aliases.entries()],
        customCommands: [...g.customCommands.entries()],
        reactionRoles: [...g.reactionRoles.entries()].map(([msgId, map]) => [msgId, [...map.entries()]]),
        strippedStaff: [...g.strippedStaff.entries()],
        stickyMessages: [...g.stickyMessages.entries()],
        ticketChannels: [...g.ticketChannels],
        warnings: [...g.warnings.entries()],
        modHistory: [...g.modHistory.entries()],
        caseCounter: g.caseCounter,
        caseIndex: [...g.caseIndex.entries()],
        modNotes: [...g.modNotes.entries()],
        jailedMembers: [...g.jailedMembers.entries()],
        jailExpiry: [...g.jailExpiry.entries()],
        hardbannedUsers: [...g.hardbannedUsers],
        staffBlacklistRoleId: g.staffBlacklistRoleId,
        staffBlacklist: [...g.staffBlacklist.entries()],
        boosterRoleId: g.boosterRoleId,
        boosterCustomRoles: [...g.boosterCustomRoles.entries()],
        autostaffEnabled: g.autostaffEnabled,
        autostaffTiers: g.autostaffTiers,
        autostaffLogChannelId: g.autostaffLogChannelId,
        autostaffBaseRoleId: g.autostaffBaseRoleId,
        autostaffStats: [...g.autostaffStats.entries()],
        prefix: g.prefix,
        tempRoles: [...g.tempRoles.entries()],
        imageOnlyChannels: [...g.imageOnlyChannels],
        starboardChannelId: g.starboardChannelId,
        starboardThreshold: g.starboardThreshold,
        starboardPosted: [...g.starboardPosted.entries()],
        countingChannelId: g.countingChannelId,
        countingCurrent: g.countingCurrent,
        countingLastUserId: g.countingLastUserId,
        xpEnabled: g.xpEnabled,
        xpData: [...g.xpData.entries()],
        xpRoles: g.xpRoles,
        xpLevelUpChannelId: g.xpLevelUpChannelId,
        antiSpamEnabled: g.antiSpamEnabled,
        antiSpamThreshold: g.antiSpamThreshold,
        antiSpamWindowMs: g.antiSpamWindowMs,
        spamBypass: [...g.spamBypass],
        buttonRoleMessages: [...g.buttonRoleMessages.entries()],
        leaveDmEnabled: g.leaveDmEnabled,
        leaveDmMessage: g.leaveDmMessage,
        backups: [...g.backups.entries()].map(([id, b]) => [id, b]),
        imageBlacklist: [...g.imageBlacklist],
        streamBlacklist: [...g.streamBlacklist],
        linkFilterBypass: [...g.linkFilterBypass],
        joinRaidProtectionEnabled: g.joinRaidProtectionEnabled,
        joinRaidThreshold: g.joinRaidThreshold,
        joinRaidWindowMs: g.joinRaidWindowMs,
        joinAgeGateEnabled: g.joinAgeGateEnabled,
        joinAgeGateDays: g.joinAgeGateDays,
        blackteaWins: [...g.blackteaWins.entries()],
        warnKickThreshold: g.warnKickThreshold,
        warnBanThreshold: g.warnBanThreshold,
        reportChannelId: g.reportChannelId,
        antinukeEnabled: g.antinukeEnabled,
        antinukeRestoreEnabled: g.antinukeRestoreEnabled,
        antinukeWindowMs: g.antinukeWindowMs,
        repEnabled: g.repEnabled,
        giveaways: [...g.giveaways.entries()],
        vcSetupCategoryId: g.vcSetupCategoryId,
        vcJoinChannelId: g.vcJoinChannelId,
        vcChannelOwners: [...g.vcChannelOwners.entries()],
        vcAllowList: [...g.vcAllowList.entries()].map(([cId, s]) => [cId, [...s]]),
        roleRestoreEnabled: g.roleRestoreEnabled,
        roleBackup: [...g.roleBackup.entries()],
        raidAction: g.raidAction,
        savedVerificationLevel: g.savedVerificationLevel,
        imageLocked: g.imageLocked,
        imageLockRoleIds: g.imageLockRoleIds,
        birthdayChannelId: g.birthdayChannelId,
        birthdays: [...g.birthdays.entries()],
        capsLockFilterEnabled: g.capsLockFilterEnabled,
        capsLockThreshold: g.capsLockThreshold,
        antiAltEnabled: g.antiAltEnabled,
        antiAltDays: g.antiAltDays,
        dailyCooldowns: [...g.dailyCooldowns.entries()],
        goodbyeChannelId: g.goodbyeChannelId,
        goodbyeMessage: g.goodbyeMessage,
        boostChannelId: g.boostChannelId,
        boostMessage: g.boostMessage,
        clownboardChannelId: g.clownboardChannelId,
        clownboardThreshold: g.clownboardThreshold,
        clownboardPosted: [...g.clownboardPosted.entries()],
        tags: [...g.tags.entries()],
        bumpReminderChannelId: g.bumpReminderChannelId,
        bumpReminderEnabled: g.bumpReminderEnabled,
        bumpReminderLastBump: g.bumpReminderLastBump,
        disabledCommands: [...g.disabledCommands.entries()].map(([ch, cmds]) => [ch, [...cmds]]),
        counterChannels: [...g.counterChannels.entries()],
        autoresponders: [...g.autoresponders.entries()],
        stripRoles: [...g.stripRoles.entries()],
        forcedNicknames: [...g.forcedNicknames.entries()],
        antiEveryonePingEnabled: g.antiEveryonePingEnabled,
        antiEveryonePingAction: g.antiEveryonePingAction,
        permGuardEnabled: g.permGuardEnabled,
        rolePermBackup: [...g.rolePermBackup.entries()],
        userTimezones: [...g.userTimezones.entries()],
        pingOnJoinEnabled: g.pingOnJoinEnabled,
        pingOnJoinChannelIds: [...g.pingOnJoinChannelIds],
        boosterDmEnabled: g.boosterDmEnabled,
        boosterDmMessage: g.boosterDmMessage,
        mutedRoleId: g.mutedRoleId,
        imageMutedRoleId: g.imageMutedRoleId,
        reactionMutedRoleId: g.reactionMutedRoleId,
        disabledEvents: [...g.disabledEvents],
        welcomeSelfDestruct: g.welcomeSelfDestruct,
        goodbyeSelfDestruct: g.goodbyeSelfDestruct,
        boostSelfDestruct: g.boostSelfDestruct,
        uwuLockedUsers: [...g.uwuLockedUsers],
        tempBans: [...g.tempBans.entries()],
        capsFilterEnabled: g.capsFilterEnabled,
        capsFilterPercent: g.capsFilterPercent,
        emojiFilterEnabled: g.emojiFilterEnabled,
        emojiFilterMax: g.emojiFilterMax,
        massmentionFilterEnabled: g.massmentionFilterEnabled,
        massmentionFilterThreshold: g.massmentionFilterThreshold,
        musicFileFilterEnabled: g.musicFileFilterEnabled,
        spoilerFilterEnabled: g.spoilerFilterEnabled,
        antiraidDefaultPfpEnabled: g.antiraidDefaultPfpEnabled,
        antiraidDefaultPfpAction: g.antiraidDefaultPfpAction,
        antiraidNewAccountsEnabled: g.antiraidNewAccountsEnabled,
        antiraidNewAccountsAge: g.antiraidNewAccountsAge,
        antiraidNewAccountsAction: g.antiraidNewAccountsAction,
      };
    }
    serialized["_global"] = {
      globalBannedUsers: [...globalBannedUsers.entries()],
      blacklistedServers: [...blacklistedServers],
      lastfmAccounts: [...lastfmAccounts.entries()],
      afkUsers: [...afkUsers.entries()],
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(serialized), "utf8");
  } catch (err) {
    console.error("[state] Failed to flush state on exit:", err);
  }
}

// ─── Synchronous flush on process exit ────────────────────────────────────────
// Cancels any pending debounce timer and writes state to disk synchronously so
// that no changes are lost on SIGTERM / SIGINT.
export function flushStateSync(): void {
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
  try {
    if (!_stateLoaded && guildStates.size === 0) {
      console.warn("[state] Skipped shutdown flush because saved state was not loaded yet.");
      return;
    }
    const serialized: Record<string, any> = {};
    for (const [guildId, g] of guildStates) {
      serialized[guildId] = {
        joinLeaveChannelId: g.joinLeaveChannelId, messageDeleteChannelId: g.messageDeleteChannelId,
        automodLogChannelId: g.automodLogChannelId, antinukeLogChannelId: g.antinukeLogChannelId,
        dmLogChannelId: g.dmLogChannelId, editLogChannelId: g.editLogChannelId,
        voiceLogChannelId: g.voiceLogChannelId, nicknameLogChannelId: g.nicknameLogChannelId,
        memberCountChannelId: g.memberCountChannelId, onlineCountChannelId: g.onlineCountChannelId,
        repRoleId: g.repRoleId, pingChannelId: g.pingChannelId,
        jailRoleId: g.jailRoleId, jailChannelId: g.jailChannelId,
        modLogChannelId: g.modLogChannelId, autoRoleId: g.autoRoleId,
        welcomeChannelId: g.welcomeChannelId, welcomeMessage: g.welcomeMessage,
        autoPubEnabled: g.autoPubEnabled, inviteFilterEnabled: g.inviteFilterEnabled,
        ticketCategoryId: g.ticketCategoryId, lastVanityCode: g.lastVanityCode,
        repKeyword: g.repKeyword, antinukeThresholds: { ...g.antinukeThresholds },
        antinukeActions: [...g.antinukeActions.entries()],
        antinukeWhitelist: [...g.antinukeWhitelist], botWhitelist: [...g.botWhitelist], permGuardWhitelist: [...g.permGuardWhitelist], antinukeAdmins: [...g.antinukeAdmins],
        botAccessUsers: [...g.botAccessUsers], filterBypassUsers: [...g.filterBypassUsers],
        customFilterWords: [...g.customFilterWords], aliases: [...g.aliases.entries()],
        customCommands: [...g.customCommands.entries()],
        reactionRoles: [...g.reactionRoles.entries()].map(([msgId, map]) => [msgId, [...map.entries()]]),
        strippedStaff: [...g.strippedStaff.entries()], stickyMessages: [...g.stickyMessages.entries()],
        ticketChannels: [...g.ticketChannels], warnings: [...g.warnings.entries()],
        modHistory: [...g.modHistory.entries()], caseCounter: g.caseCounter,
        caseIndex: [...g.caseIndex.entries()], modNotes: [...g.modNotes.entries()],
        jailedMembers: [...g.jailedMembers.entries()], jailExpiry: [...g.jailExpiry.entries()], hardbannedUsers: [...g.hardbannedUsers],
        staffBlacklistRoleId: g.staffBlacklistRoleId, staffBlacklist: [...g.staffBlacklist.entries()],
        boosterRoleId: g.boosterRoleId, boosterCustomRoles: [...g.boosterCustomRoles.entries()],
        autostaffEnabled: g.autostaffEnabled, autostaffTiers: g.autostaffTiers,
        autostaffLogChannelId: g.autostaffLogChannelId, autostaffBaseRoleId: g.autostaffBaseRoleId,
        autostaffStats: [...g.autostaffStats.entries()], prefix: g.prefix,
        tempRoles: [...g.tempRoles.entries()], imageOnlyChannels: [...g.imageOnlyChannels],
        starboardChannelId: g.starboardChannelId, starboardThreshold: g.starboardThreshold,
        starboardPosted: [...g.starboardPosted.entries()], countingChannelId: g.countingChannelId,
        countingCurrent: g.countingCurrent, countingLastUserId: g.countingLastUserId,
        xpEnabled: g.xpEnabled, xpData: [...g.xpData.entries()], xpRoles: g.xpRoles,
        xpLevelUpChannelId: g.xpLevelUpChannelId, antiSpamEnabled: g.antiSpamEnabled,
        antiSpamThreshold: g.antiSpamThreshold, antiSpamWindowMs: g.antiSpamWindowMs,
        spamBypass: [...g.spamBypass], buttonRoleMessages: [...g.buttonRoleMessages.entries()],
        leaveDmEnabled: g.leaveDmEnabled, leaveDmMessage: g.leaveDmMessage,
        backups: [...g.backups.entries()], imageBlacklist: [...g.imageBlacklist],
        streamBlacklist: [...g.streamBlacklist], linkFilterBypass: [...g.linkFilterBypass],
        joinRaidProtectionEnabled: g.joinRaidProtectionEnabled, joinRaidThreshold: g.joinRaidThreshold,
        joinRaidWindowMs: g.joinRaidWindowMs, joinAgeGateEnabled: g.joinAgeGateEnabled,
        joinAgeGateDays: g.joinAgeGateDays, blackteaWins: [...g.blackteaWins.entries()],
        warnKickThreshold: g.warnKickThreshold, warnBanThreshold: g.warnBanThreshold,
        reportChannelId: g.reportChannelId, antinukeEnabled: g.antinukeEnabled,
        antinukeRestoreEnabled: g.antinukeRestoreEnabled, antinukeWindowMs: g.antinukeWindowMs,
        repEnabled: g.repEnabled, giveaways: [...g.giveaways.entries()],
        vcSetupCategoryId: g.vcSetupCategoryId, vcJoinChannelId: g.vcJoinChannelId,
        vcChannelOwners: [...g.vcChannelOwners.entries()],
        vcAllowList: [...g.vcAllowList.entries()].map(([cId, s]) => [cId, [...s]]),
        roleRestoreEnabled: g.roleRestoreEnabled, roleBackup: [...g.roleBackup.entries()],
        raidAction: g.raidAction, savedVerificationLevel: g.savedVerificationLevel,
        imageLocked: g.imageLocked, imageLockRoleIds: g.imageLockRoleIds,
        birthdayChannelId: g.birthdayChannelId, birthdays: [...g.birthdays.entries()],
        capsLockFilterEnabled: g.capsLockFilterEnabled, capsLockThreshold: g.capsLockThreshold,
        antiAltEnabled: g.antiAltEnabled, antiAltDays: g.antiAltDays,
        dailyCooldowns: [...g.dailyCooldowns.entries()],
        goodbyeChannelId: g.goodbyeChannelId, goodbyeMessage: g.goodbyeMessage,
        boostChannelId: g.boostChannelId, boostMessage: g.boostMessage,
        clownboardChannelId: g.clownboardChannelId, clownboardThreshold: g.clownboardThreshold,
        clownboardPosted: [...g.clownboardPosted.entries()],
        tags: [...g.tags.entries()],
        bumpReminderChannelId: g.bumpReminderChannelId, bumpReminderEnabled: g.bumpReminderEnabled,
        bumpReminderLastBump: g.bumpReminderLastBump,
        disabledCommands: [...g.disabledCommands.entries()].map(([ch, cmds]) => [ch, [...cmds]]),
        counterChannels: [...g.counterChannels.entries()],
        autoresponders: [...g.autoresponders.entries()],
        stripRoles: [...g.stripRoles.entries()],
        forcedNicknames: [...g.forcedNicknames.entries()],
        antiEveryonePingEnabled: g.antiEveryonePingEnabled,
        antiEveryonePingAction: g.antiEveryonePingAction,
        permGuardEnabled: g.permGuardEnabled,
        rolePermBackup: [...g.rolePermBackup.entries()],
        userTimezones: [...g.userTimezones.entries()],
        pingOnJoinEnabled: g.pingOnJoinEnabled,
        pingOnJoinChannelIds: [...g.pingOnJoinChannelIds],
        boosterDmEnabled: g.boosterDmEnabled,
        boosterDmMessage: g.boosterDmMessage,
        mutedRoleId: g.mutedRoleId,
        imageMutedRoleId: g.imageMutedRoleId,
        reactionMutedRoleId: g.reactionMutedRoleId,
        disabledEvents: [...g.disabledEvents],
        welcomeSelfDestruct: g.welcomeSelfDestruct,
        goodbyeSelfDestruct: g.goodbyeSelfDestruct,
        boostSelfDestruct: g.boostSelfDestruct,
        uwuLockedUsers: [...g.uwuLockedUsers],
        tempBans: [...g.tempBans.entries()],
        capsFilterEnabled: g.capsFilterEnabled,
        capsFilterPercent: g.capsFilterPercent,
        emojiFilterEnabled: g.emojiFilterEnabled,
        emojiFilterMax: g.emojiFilterMax,
        massmentionFilterEnabled: g.massmentionFilterEnabled,
        massmentionFilterThreshold: g.massmentionFilterThreshold,
        musicFileFilterEnabled: g.musicFileFilterEnabled,
        spoilerFilterEnabled: g.spoilerFilterEnabled,
        antiraidDefaultPfpEnabled: g.antiraidDefaultPfpEnabled,
        antiraidDefaultPfpAction: g.antiraidDefaultPfpAction,
        antiraidNewAccountsEnabled: g.antiraidNewAccountsEnabled,
        antiraidNewAccountsAge: g.antiraidNewAccountsAge,
        antiraidNewAccountsAction: g.antiraidNewAccountsAction,
      };
    }
    serialized["_global"] = {
      globalBannedUsers: [...globalBannedUsers.entries()],
      blacklistedServers: [...blacklistedServers],
      lastfmAccounts: [...lastfmAccounts.entries()],
      afkUsers: [...afkUsers.entries()],
    };
    const tmp = STATE_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(serialized));
    fs.renameSync(tmp, STATE_FILE);
    console.log("[state] Flushed state to disk on exit.");
  } catch (err) {
    console.error("[state] Failed to flush on exit:", err);
  }
}

function _registerExitHandlers() {
  const handler = (signal: string) => {
    console.log(`[state] Received ${signal} — saving state before exit...`);
    flushStateSync();
    process.exit(0);
  };
  process.once("SIGTERM", () => handler("SIGTERM"));
  process.once("SIGINT",  () => handler("SIGINT"));
}
_registerExitHandlers();

// ─── Periodic cache cleanup ────────────────────────────────────────────────────
// Prunes in-memory caches that grow unbounded over time.
// Call on a regular interval (e.g. every 5 minutes).
export function cleanupCaches(): void {
  const now = Date.now();
  const SNIPE_TTL = 30 * 60 * 1000;
  const SNIPE_MAX = 10;

  for (const [channelId, entries] of snipeCache) {
    const fresh = entries.filter(e => now - e.timestamp < SNIPE_TTL).slice(-SNIPE_MAX);
    if (fresh.length === 0) snipeCache.delete(channelId);
    else snipeCache.set(channelId, fresh);
  }

  for (const [channelId, e] of editSnipeCache) {
    if (now - e.timestamp > SNIPE_TTL) editSnipeCache.delete(channelId);
  }

  for (const [channelId, e] of reactionSnipeCache) {
    if (now - e.timestamp > SNIPE_TTL) reactionSnipeCache.delete(channelId);
  }

  for (const [userId, ts] of filterDmCooldown) {
    if (now - ts > 10 * 60 * 1000) filterDmCooldown.delete(userId);
  }

  for (const [key, ts] of autoresponderCooldowns) {
    if (now - ts > 5 * 60 * 1000) autoresponderCooldowns.delete(key);
  }

  for (const [userId, ts] of recentlyPinged) {
    if (now - ts > 10 * 60 * 1000) recentlyPinged.delete(userId);
  }

  for (const [guildId, userMap] of everyonePingTracker) {
    for (const [userId, times] of userMap) {
      const recent = times.filter(t => now - t < 60_000);
      if (recent.length === 0) userMap.delete(userId);
      else userMap.set(userId, recent);
    }
    if (userMap.size === 0) everyonePingTracker.delete(guildId);
  }

  for (const [guildId, userMap] of antiSpamTracker) {
    for (const [userId, times] of userMap) {
      const recent = times.filter(t => now - t < 30_000);
      if (recent.length === 0) userMap.delete(userId);
      else userMap.set(userId, recent);
    }
    if (userMap.size === 0) antiSpamTracker.delete(guildId);
  }

  for (const [guildId, userMap] of spamOffenses) {
    for (const [userId, count] of userMap) {
      if (count === 0) userMap.delete(userId);
    }
    if (userMap.size === 0) spamOffenses.delete(guildId);
  }

  for (const [guildId, times] of joinTracker) {
    const recent = times.filter(t => now - t < 60_000);
    if (recent.length === 0) joinTracker.delete(guildId);
    else joinTracker.set(guildId, recent);
  }

  // Remove ended giveaways older than 7 days
  const GW_TTL = 7 * 24 * 60 * 60 * 1000;
  for (const gs of guildStates.values()) {
    for (const [msgId, gw] of gs.giveaways) {
      if (gw.ended && now - gw.endsAt > GW_TTL) gs.giveaways.delete(msgId);
    }
  }

  for (const [channelId, contentMap] of floodTracker) {
    for (const [content, data] of contentMap) {
      if (now - data.firstSeen > 60_000) contentMap.delete(content);
    }
    if (contentMap.size === 0) floodTracker.delete(channelId);
  }

  for (const [guildId, xpMap] of xpCooldowns) {
    for (const [userId, ts] of xpMap) {
      if (now - ts > 120_000) xpMap.delete(userId);
    }
    if (xpMap.size === 0) xpCooldowns.delete(guildId);
  }

  if (wordValidCache.size > 5000) wordValidCache.clear();

  for (const [sessionId, session] of pendingConfirms) {
    if (session.expiresAt < now) pendingConfirms.delete(sessionId);
  }

  for (const [sessionId, session] of paginatedSessions) {
    if (session.expiresAt < now) paginatedSessions.delete(sessionId);
  }

  // Prune xpData and birthdays for users who have left the guild.
  // Only runs when the Discord client has a populated member cache.
  const ANTINUKE_WINDOW_MS = 5000;
  for (const [guildId, g] of guildStates) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild || guild.members.cache.size === 0) continue;
    const memberIds = guild.members.cache;
    for (const userId of g.xpData.keys()) {
      if (!memberIds.has(userId)) g.xpData.delete(userId);
    }
    for (const userId of g.birthdays.keys()) {
      if (!memberIds.has(userId)) g.birthdays.delete(userId);
    }
    for (const userId of g.dailyCooldowns.keys()) {
      if (!memberIds.has(userId)) g.dailyCooldowns.delete(userId);
    }
    // Prune stale antinukeActions entries (arrays all empty after window expires)
    for (const [userId, actions] of g.antinukeActions) {
      const allEmpty = [actions.bans, actions.kicks, actions.channelDeletes, actions.roleDeletes, actions.botAdds]
        .every((arr) => arr.filter((t) => now - t < ANTINUKE_WINDOW_MS).length === 0);
      if (allEmpty) g.antinukeActions.delete(userId);
    }
  }
}

export function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      _stateLoaded = true;
      return;
    }
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const serialized: Record<string, any> = JSON.parse(raw);

    const globalData = serialized["_global"];
    if (globalData && typeof globalData === "object") {
      if (Array.isArray(globalData.globalBannedUsers)) {
        globalData.globalBannedUsers.forEach(([id, v]: [string, { reason: string; timestamp: number }]) => globalBannedUsers.set(id, v));
      }
      if (Array.isArray(globalData.blacklistedServers)) {
        globalData.blacklistedServers.forEach((id: string) => blacklistedServers.add(id));
      }
      if (Array.isArray(globalData.afkUsers)) {
        globalData.afkUsers.forEach(([id, v]: [string, { reason: string; timestamp: number }]) => afkUsers.set(id, v));
      }
      if (Array.isArray(globalData.lastfmAccounts)) {
        globalData.lastfmAccounts.forEach(([id, username]: [string, string]) => lastfmAccounts.set(id, username));
      }
    }

    for (const [guildId, data] of Object.entries(serialized)) {
      if (guildId === "_global") continue;
      if (typeof data !== "object" || data === null) continue;
      const g = getGS(guildId);
      if (data.joinLeaveChannelId) g.joinLeaveChannelId = data.joinLeaveChannelId;
      if (data.messageDeleteChannelId) g.messageDeleteChannelId = data.messageDeleteChannelId;
      if (data.automodLogChannelId) g.automodLogChannelId = data.automodLogChannelId;
      if (data.antinukeLogChannelId) g.antinukeLogChannelId = data.antinukeLogChannelId;
      if (data.dmLogChannelId) g.dmLogChannelId = data.dmLogChannelId;
      if (data.editLogChannelId) g.editLogChannelId = data.editLogChannelId;
      if (data.voiceLogChannelId) g.voiceLogChannelId = data.voiceLogChannelId;
      if (data.nicknameLogChannelId) g.nicknameLogChannelId = data.nicknameLogChannelId;
      if (data.memberCountChannelId) g.memberCountChannelId = data.memberCountChannelId;
      if (data.onlineCountChannelId) g.onlineCountChannelId = data.onlineCountChannelId;
      if (data.repRoleId) g.repRoleId = data.repRoleId;
      if (data.pingChannelId) g.pingChannelId = data.pingChannelId;
      if (data.jailRoleId) g.jailRoleId = data.jailRoleId;
      if (data.jailChannelId) g.jailChannelId = data.jailChannelId;
      if (data.modLogChannelId) g.modLogChannelId = data.modLogChannelId;
      if (data.autoRoleId) g.autoRoleId = data.autoRoleId;
      if (data.welcomeChannelId) g.welcomeChannelId = data.welcomeChannelId;
      if (data.welcomeMessage) g.welcomeMessage = data.welcomeMessage;
      if (typeof data.autoPubEnabled === "boolean") g.autoPubEnabled = data.autoPubEnabled;
      if (typeof data.inviteFilterEnabled === "boolean") g.inviteFilterEnabled = data.inviteFilterEnabled;
      if (data.ticketCategoryId) g.ticketCategoryId = data.ticketCategoryId;
      if (data.lastVanityCode) g.lastVanityCode = data.lastVanityCode;
      if (data.repKeyword) g.repKeyword = data.repKeyword;
      if (data.antinukeThresholds) Object.assign(g.antinukeThresholds, data.antinukeThresholds);
      if (Array.isArray(data.antinukeActions)) {
        data.antinukeActions.forEach(([userId, actions]: [string, any]) => {
          g.antinukeActions.set(userId, {
            bans: actions.bans ?? [],
            kicks: actions.kicks ?? [],
            channelDeletes: actions.channelDeletes ?? [],
            roleDeletes: actions.roleDeletes ?? [],
            botAdds: actions.botAdds ?? [],
          });
        });
      }
      if (Array.isArray(data.antinukeWhitelist)) { data.antinukeWhitelist.forEach((id: string) => g.antinukeWhitelist.add(id)); }
      PERMANENT_WHITELIST.forEach((id) => g.antinukeWhitelist.add(id));
      if (Array.isArray(data.permGuardWhitelist)) { data.permGuardWhitelist.forEach((id: string) => g.permGuardWhitelist.add(id)); }
      PERMANENT_WHITELIST.forEach((id) => g.permGuardWhitelist.add(id));
      if (Array.isArray(data.antinukeAdmins)) { data.antinukeAdmins.forEach((id: string) => g.antinukeAdmins.add(id)); }
      g.antinukeAdmins.add(OWNER_ID);
      CO_OWNER_IDS.forEach((id) => g.antinukeAdmins.add(id));
      if (Array.isArray(data.botAccessUsers)) data.botAccessUsers.forEach((id: string) => g.botAccessUsers.add(id));
      if (Array.isArray(data.filterBypassUsers)) data.filterBypassUsers.forEach((id: string) => g.filterBypassUsers.add(id));
      if (Array.isArray(data.customFilterWords)) data.customFilterWords.forEach((w: string) => g.customFilterWords.add(w));
      if (Array.isArray(data.aliases)) data.aliases.forEach(([k, v]: [string, string]) => g.aliases.set(k, v));
      if (Array.isArray(data.customCommands)) data.customCommands.forEach(([k, v]: [string, string]) => g.customCommands.set(k, v));
      if (Array.isArray(data.reactionRoles)) data.reactionRoles.forEach(([msgId, entries]: [string, [string, string][]]) => {
        const map = new Map<string, string>(); entries.forEach(([emoji, roleId]) => map.set(emoji, roleId)); g.reactionRoles.set(msgId, map);
      });
      if (Array.isArray(data.strippedStaff)) data.strippedStaff.forEach(([k, v]: [string, string[]]) => g.strippedStaff.set(k, v));
      if (Array.isArray(data.stickyMessages)) data.stickyMessages.forEach(([k, v]: [string, any]) => g.stickyMessages.set(k, v));
      if (Array.isArray(data.ticketChannels)) data.ticketChannels.forEach((id: string) => g.ticketChannels.add(id));
      if (Array.isArray(data.warnings)) data.warnings.forEach(([k, v]: [string, any[]]) => g.warnings.set(k, v));
      if (Array.isArray(data.modHistory)) data.modHistory.forEach(([k, v]: [string, any[]]) => g.modHistory.set(k, v));
      if (typeof data.caseCounter === "number") g.caseCounter = data.caseCounter;
      if (Array.isArray(data.caseIndex)) data.caseIndex.forEach(([k, v]: [number, string]) => g.caseIndex.set(k, v));
      if (Array.isArray(data.modNotes)) data.modNotes.forEach(([k, v]: [string, any[]]) => g.modNotes.set(k, v));
      if (Array.isArray(data.jailedMembers)) data.jailedMembers.forEach(([k, v]: [string, string[]]) => g.jailedMembers.set(k, v));
      if (Array.isArray(data.jailExpiry)) data.jailExpiry.forEach(([k, v]: [string, number]) => g.jailExpiry.set(k, v));
      if (Array.isArray(data.hardbannedUsers)) data.hardbannedUsers.forEach((id: string) => g.hardbannedUsers.add(id));
      if (data.staffBlacklistRoleId) g.staffBlacklistRoleId = data.staffBlacklistRoleId;
      if (Array.isArray(data.staffBlacklist)) data.staffBlacklist.forEach(([k, v]: [string, any]) => g.staffBlacklist.set(k, v));
      if (data.boosterRoleId) g.boosterRoleId = data.boosterRoleId;
      if (Array.isArray(data.boosterCustomRoles)) data.boosterCustomRoles.forEach(([k, v]: [string, string]) => g.boosterCustomRoles.set(k, v));
      if (typeof data.autostaffEnabled === "boolean") g.autostaffEnabled = data.autostaffEnabled;
      if (Array.isArray(data.autostaffTiers)) g.autostaffTiers = data.autostaffTiers;
      if (data.autostaffLogChannelId) g.autostaffLogChannelId = data.autostaffLogChannelId;
      if (data.autostaffBaseRoleId) g.autostaffBaseRoleId = data.autostaffBaseRoleId;
      if (Array.isArray(data.autostaffStats)) data.autostaffStats.forEach(([k, v]: [string, AutostaffUserStats]) => g.autostaffStats.set(k, v));
      if (data.prefix && typeof data.prefix === "string") g.prefix = data.prefix;
      if (Array.isArray(data.tempRoles)) data.tempRoles.forEach(([k, v]: [string, any[]]) => g.tempRoles.set(k, v));
      if (Array.isArray(data.imageOnlyChannels)) data.imageOnlyChannels.forEach((id: string) => g.imageOnlyChannels.add(id));
      if (data.starboardChannelId) g.starboardChannelId = data.starboardChannelId;
      if (typeof data.starboardThreshold === "number") g.starboardThreshold = data.starboardThreshold;
      if (Array.isArray(data.starboardPosted)) data.starboardPosted.forEach(([k, v]: [string, string]) => g.starboardPosted.set(k, v));
      if (data.countingChannelId) g.countingChannelId = data.countingChannelId;
      if (typeof data.countingCurrent === "number") g.countingCurrent = data.countingCurrent;
      if (data.countingLastUserId) g.countingLastUserId = data.countingLastUserId;
      if (typeof data.xpEnabled === "boolean") g.xpEnabled = data.xpEnabled;
      if (Array.isArray(data.xpData)) data.xpData.forEach(([k, v]: [string, any]) => g.xpData.set(k, v));
      if (Array.isArray(data.xpRoles)) g.xpRoles = data.xpRoles;
      if (data.xpLevelUpChannelId) g.xpLevelUpChannelId = data.xpLevelUpChannelId;
      if (typeof data.antiSpamEnabled === "boolean") g.antiSpamEnabled = data.antiSpamEnabled;
      if (typeof data.antiSpamThreshold === "number") g.antiSpamThreshold = data.antiSpamThreshold;
      if (typeof data.antiSpamWindowMs === "number") g.antiSpamWindowMs = data.antiSpamWindowMs;
      if (Array.isArray(data.spamBypass)) data.spamBypass.forEach((id: string) => g.spamBypass.add(id));
      if (Array.isArray(data.buttonRoleMessages)) data.buttonRoleMessages.forEach(([k, v]: [string, any]) => g.buttonRoleMessages.set(k, v));
      if (typeof data.leaveDmEnabled === "boolean") g.leaveDmEnabled = data.leaveDmEnabled;
      if (data.leaveDmMessage) g.leaveDmMessage = data.leaveDmMessage;
      if (Array.isArray(data.backups)) data.backups.forEach(([id, b]: [string, ServerBackup]) => g.backups.set(id, b));
      if (Array.isArray(data.imageBlacklist)) data.imageBlacklist.forEach((id: string) => g.imageBlacklist.add(id));
      if (Array.isArray(data.streamBlacklist)) data.streamBlacklist.forEach((id: string) => g.streamBlacklist.add(id));
      if (Array.isArray(data.linkFilterBypass)) data.linkFilterBypass.forEach((id: string) => g.linkFilterBypass.add(id));
      if (typeof data.joinRaidProtectionEnabled === "boolean") g.joinRaidProtectionEnabled = data.joinRaidProtectionEnabled;
      if (typeof data.joinRaidThreshold === "number") g.joinRaidThreshold = data.joinRaidThreshold;
      if (typeof data.joinRaidWindowMs === "number") g.joinRaidWindowMs = data.joinRaidWindowMs;
      if (typeof data.joinAgeGateEnabled === "boolean") g.joinAgeGateEnabled = data.joinAgeGateEnabled;
      if (typeof data.joinAgeGateDays === "number") g.joinAgeGateDays = data.joinAgeGateDays;
      if (Array.isArray(data.blackteaWins)) data.blackteaWins.forEach(([k, v]: [string, number]) => g.blackteaWins.set(k, v));
      if (typeof data.warnKickThreshold === "number") g.warnKickThreshold = data.warnKickThreshold;
      if (typeof data.warnBanThreshold === "number") g.warnBanThreshold = data.warnBanThreshold;
      if (data.reportChannelId) g.reportChannelId = data.reportChannelId;
      if (typeof data.antinukeEnabled === "boolean") g.antinukeEnabled = data.antinukeEnabled;
      if (typeof data.antinukeRestoreEnabled === "boolean") g.antinukeRestoreEnabled = data.antinukeRestoreEnabled;
      if (typeof data.antinukeWindowMs === "number") g.antinukeWindowMs = data.antinukeWindowMs;
      if (Array.isArray(data.botWhitelist)) data.botWhitelist.forEach((id: string) => g.botWhitelist.add(id));
      if (typeof data.repEnabled === "boolean") g.repEnabled = data.repEnabled;
      if (Array.isArray(data.giveaways)) data.giveaways.forEach(([msgId, gw]: [string, GiveawayData]) => g.giveaways.set(msgId, gw));
      if (data.vcSetupCategoryId) g.vcSetupCategoryId = data.vcSetupCategoryId;
      if (data.vcJoinChannelId) g.vcJoinChannelId = data.vcJoinChannelId;
      if (Array.isArray(data.vcChannelOwners)) data.vcChannelOwners.forEach(([k, v]: [string, string]) => g.vcChannelOwners.set(k, v));
      if (Array.isArray(data.vcAllowList)) data.vcAllowList.forEach(([k, v]: [string, string[]]) => g.vcAllowList.set(k, new Set(v)));
      if (typeof data.roleRestoreEnabled === "boolean") g.roleRestoreEnabled = data.roleRestoreEnabled;
      if (Array.isArray(data.roleBackup)) data.roleBackup.forEach(([k, v]: [string, string[]]) => g.roleBackup.set(k, v));
      if (data.raidAction) g.raidAction = data.raidAction;
      if (typeof data.savedVerificationLevel === "number") g.savedVerificationLevel = data.savedVerificationLevel;
      if (typeof data.imageLocked === "boolean") g.imageLocked = data.imageLocked;
      if (Array.isArray(data.imageLockRoleIds)) g.imageLockRoleIds = data.imageLockRoleIds;
      if (data.birthdayChannelId) g.birthdayChannelId = data.birthdayChannelId;
      if (Array.isArray(data.birthdays)) data.birthdays.forEach(([k, v]: [string, string]) => g.birthdays.set(k, v));
      if (typeof data.capsLockFilterEnabled === "boolean") g.capsLockFilterEnabled = data.capsLockFilterEnabled;
      if (typeof data.capsLockThreshold === "number") g.capsLockThreshold = data.capsLockThreshold;
      if (typeof data.antiAltEnabled === "boolean") g.antiAltEnabled = data.antiAltEnabled;
      if (typeof data.antiAltDays === "number") g.antiAltDays = data.antiAltDays;
      if (Array.isArray(data.dailyCooldowns)) data.dailyCooldowns.forEach(([k, v]: [string, number]) => g.dailyCooldowns.set(k, v));
      if (data.goodbyeChannelId) g.goodbyeChannelId = data.goodbyeChannelId;
      if (data.goodbyeMessage) g.goodbyeMessage = data.goodbyeMessage;
      if (data.boostChannelId) g.boostChannelId = data.boostChannelId;
      if (data.boostMessage) g.boostMessage = data.boostMessage;
      if (data.clownboardChannelId) g.clownboardChannelId = data.clownboardChannelId;
      if (typeof data.clownboardThreshold === "number") g.clownboardThreshold = data.clownboardThreshold;
      if (Array.isArray(data.clownboardPosted)) data.clownboardPosted.forEach(([k, v]: [string, string]) => g.clownboardPosted.set(k, v));
      if (Array.isArray(data.tags)) data.tags.forEach(([k, v]: [string, TagData]) => g.tags.set(k, v));
      if (data.bumpReminderChannelId) g.bumpReminderChannelId = data.bumpReminderChannelId;
      if (typeof data.bumpReminderEnabled === "boolean") g.bumpReminderEnabled = data.bumpReminderEnabled;
      if (typeof data.bumpReminderLastBump === "number") g.bumpReminderLastBump = data.bumpReminderLastBump;
      if (Array.isArray(data.disabledCommands)) data.disabledCommands.forEach(([ch, cmds]: [string, string[]]) => g.disabledCommands.set(ch, new Set(cmds)));
      if (Array.isArray(data.counterChannels)) data.counterChannels.forEach(([k, v]: [string, CounterChannel]) => g.counterChannels.set(k, v));
      if (Array.isArray(data.autoresponders)) data.autoresponders.forEach(([k, v]: [string, AutoresponderEntry]) => g.autoresponders.set(k, v));
      if (Array.isArray(data.stripRoles)) data.stripRoles.forEach(([k, v]: [string, string[]]) => g.stripRoles.set(k, v));
      if (Array.isArray(data.forcedNicknames)) data.forcedNicknames.forEach(([k, v]: [string, string]) => g.forcedNicknames.set(k, v));
      if (typeof data.antiEveryonePingEnabled === "boolean") g.antiEveryonePingEnabled = data.antiEveryonePingEnabled;
      if (data.antiEveryonePingAction === "delete" || data.antiEveryonePingAction === "mute" || data.antiEveryonePingAction === "ban") g.antiEveryonePingAction = data.antiEveryonePingAction;
      if (typeof data.permGuardEnabled === "boolean") g.permGuardEnabled = data.permGuardEnabled;
      if (Array.isArray(data.rolePermBackup)) data.rolePermBackup.forEach(([k, v]: [string, string]) => g.rolePermBackup.set(k, v));
      if (Array.isArray(data.userTimezones)) data.userTimezones.forEach(([k, v]: [string, string]) => g.userTimezones.set(k, v));
      if (typeof data.pingOnJoinEnabled === "boolean") g.pingOnJoinEnabled = data.pingOnJoinEnabled;
      if (Array.isArray(data.pingOnJoinChannelIds)) g.pingOnJoinChannelIds = data.pingOnJoinChannelIds;
      else if (data.pingOnJoinChannelId) g.pingOnJoinChannelIds = [data.pingOnJoinChannelId];
      if (typeof data.boosterDmEnabled === "boolean") g.boosterDmEnabled = data.boosterDmEnabled;
      if (data.boosterDmMessage) g.boosterDmMessage = data.boosterDmMessage;
      if (data.mutedRoleId) g.mutedRoleId = data.mutedRoleId;
      if (data.imageMutedRoleId) g.imageMutedRoleId = data.imageMutedRoleId;
      if (data.reactionMutedRoleId) g.reactionMutedRoleId = data.reactionMutedRoleId;
      if (Array.isArray(data.disabledEvents)) data.disabledEvents.forEach((e: string) => g.disabledEvents.add(e));
      if (typeof data.welcomeSelfDestruct === "number") g.welcomeSelfDestruct = data.welcomeSelfDestruct;
      if (typeof data.goodbyeSelfDestruct === "number") g.goodbyeSelfDestruct = data.goodbyeSelfDestruct;
      if (typeof data.boostSelfDestruct === "number") g.boostSelfDestruct = data.boostSelfDestruct;
      if (Array.isArray(data.uwuLockedUsers)) data.uwuLockedUsers.forEach((id: string) => g.uwuLockedUsers.add(id));
      if (Array.isArray(data.tempBans)) data.tempBans.forEach(([k, v]: [string, { unbanAt: number; moderatorTag: string }]) => g.tempBans.set(k, v));
      if (typeof data.capsFilterEnabled === "boolean") g.capsFilterEnabled = data.capsFilterEnabled;
      if (typeof data.capsFilterPercent === "number") g.capsFilterPercent = data.capsFilterPercent;
      if (typeof data.emojiFilterEnabled === "boolean") g.emojiFilterEnabled = data.emojiFilterEnabled;
      if (typeof data.emojiFilterMax === "number") g.emojiFilterMax = data.emojiFilterMax;
      if (typeof data.massmentionFilterEnabled === "boolean") g.massmentionFilterEnabled = data.massmentionFilterEnabled;
      if (typeof data.massmentionFilterThreshold === "number") g.massmentionFilterThreshold = data.massmentionFilterThreshold;
      if (typeof data.musicFileFilterEnabled === "boolean") g.musicFileFilterEnabled = data.musicFileFilterEnabled;
      if (typeof data.spoilerFilterEnabled === "boolean") g.spoilerFilterEnabled = data.spoilerFilterEnabled;
      if (typeof data.antiraidDefaultPfpEnabled === "boolean") g.antiraidDefaultPfpEnabled = data.antiraidDefaultPfpEnabled;
      if (data.antiraidDefaultPfpAction === "kick" || data.antiraidDefaultPfpAction === "ban") g.antiraidDefaultPfpAction = data.antiraidDefaultPfpAction;
      if (typeof data.antiraidNewAccountsEnabled === "boolean") g.antiraidNewAccountsEnabled = data.antiraidNewAccountsEnabled;
      if (typeof data.antiraidNewAccountsAge === "number") g.antiraidNewAccountsAge = data.antiraidNewAccountsAge;
      if (data.antiraidNewAccountsAction === "kick" || data.antiraidNewAccountsAction === "ban") g.antiraidNewAccountsAction = data.antiraidNewAccountsAction;
    }
    if (globalData && Array.isArray(globalData.lastfmAccounts)) {
      globalData.lastfmAccounts.forEach(([k, v]: [string, string]) => lastfmAccounts.set(k, v));
    }
    const guildCount = Object.keys(serialized).filter((k) => k !== "_global").length;
    console.log(`[state] Loaded ${guildCount} guild(s) from disk`);
    _stateLoaded = true;
  } catch (err) {
    console.error("[state] Failed to load:", err);
    _stateLoaded = true;
  }
}

// ─── Owner DM helper ──────────────────────────────────────────────────────────
let _cachedOwner: import("discord.js").User | null = null;
export async function dmOwner(text: string): Promise<void> {
  if (!_cachedOwner) {
    _cachedOwner = await client.users.fetch(OWNER_ID).catch(() => null);
  }
  if (!_cachedOwner) return;
  await _cachedOwner.send(text).catch(() => {});
}

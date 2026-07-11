import {
  EmbedBuilder, TextChannel, VoiceChannel, PermissionFlagsBits, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ComponentType, ChannelType, Guild, GuildMember,
  CategoryChannel, Role, Collection, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} from "discord.js";
import type { Message } from "discord.js";
import { OWNER_ID, isOwner } from "../../constants.js";
import { find as geoFind } from "geo-tz";
import {
  getGS, saveState, afkUsers, maintenanceMode, globalBannedUsers, blacklistedServers,
  snipeCache, editSnipeCache, reactionSnipeCache, msgStore, jailTimers, activeGiveawayTimers,
  floodTracker, antiSpamTracker, spamOffenses, joinTracker, raidModeActive,
  xpCooldowns, pendingConfirms, paginatedSessions, autoresponderCooldowns,
} from "../../state.js";
import { dmOwner } from "../../state.js";
import client from "../../client.js";
import {
  re, ri, gch, fetchMember, fetchRole, resolveRole, rQueue, parseDuration,
  checkAutostaffPromotion, recordModAction, checkCooldown, sendConfirm,
  sendPaginated, sendPaginatedI, isRepping, getStatusText, canPing,
  checkHierarchy, modActionEmbed, findOrCreateTextChannel, findOrCreateVoiceChannel,
  scheduleStatsUpdate, updateStats, handleSlowmode, getAntinukeActions, countRecent,
  setupJailSystem, punishAntinuke, runSetup, snapshotInvites, resolveGiveaway,
  scheduleGiveaway, xpForLevel, levelFromXp, fetchGuildChannel, EVERYONE_HIDDEN,
  buildPageEmbed, buildPageRow,
  ensureMembersCache,
  safeReply,
} from "../../utils.js";
import { BLOCKED_TERMS, BLOCKED_PATTERNS } from "../../wordlist.js";
import {
  blackteaGames, wordValidCache, botStartTime,
} from "../../state.js";
import { registerSlashCommands } from '../slash/register.js';
import { COLORS } from "../../colors.js";

export async function handleUtilityCommand(cmd: string, args: string[], message: Message): Promise<boolean> {
  if (!message.guild) return false;
  const guild = message.guild;
  const gs = getGS(guild.id);
  const p = gs.prefix;
  const dmLogChannel = gch(guild, gs.dmLogChannelId);

  switch (cmd) {
    case "prefix": {
      const newPrefix = args[0];
      if (!newPrefix) {
        await safeReply(message, re(`Current prefix is \`${gs.prefix}\`. Usage: \`${gs.prefix}prefix <new prefix>\``));
        return true;
      }
      if (newPrefix.length > 5) {
        await safeReply(message, re("Prefix must be 5 characters or fewer."));
        return true;
      }
      const old = gs.prefix;
      gs.prefix = newPrefix;
      saveState();
      await safeReply(message, re(`Prefix changed from \`${old}\` to \`${newPrefix}\` — all commands now use \`${newPrefix}\``));
      return true;
    }
    case "setup": {
      await safeReply(message, re("Running setup — creating log channels, jail, and roles..."));
      try {
        await runSetup(guild, gs);
        await safeReply(message, { embeds: [
          new EmbedBuilder().setColor(COLORS.success).setTitle("Setup Complete")
            .setDescription("This server is ready. All log channels and the jail system have been created.")
            .addFields(
              { name: "Log Category", value: "**Server Logs** with 3 log channels + 2 member stat channels", inline: false },
              { name: "Jail System", value: "**Jailed** role + **#jail** channel", inline: false },
              { name: "Rep Role", value: gs.repRoleId ? `<@&${gs.repRoleId}>` : `Not set — use \`${p}vanity role @role\``, inline: false },
              { name: "Ping Channel", value: gs.pingChannelId ? `<#${gs.pingChannelId}>` : `Not set — use \`${p}vanity ping #channel\``, inline: false },
              { name: "Next Steps", value: `\`${p}vanity role @role\`\n\`${p}vanity ping #channel\`\n\`${p}modlog #channel\`\n\`${p}welcome #channel Your welcome message\``, inline: false }
            ).setTimestamp()
        ]});
      } catch (err) {
        console.error("[setup] error:", err);
        await safeReply(message, re("Setup failed — I need Manage Channels and Manage Roles permissions."));
      }
      return true;
    }
    case "vanity": {
      const sub = args[0]?.toLowerCase();
      if (sub === "off") {
        gs.repRoleId = null;
        gs.pingChannelId = null;
        gs.repEnabled = false;
        saveState();
        await safeReply(message, re(`Vanity role system disabled and cleared.`, 0x57f287));
        return true;
      }
      if (sub === "set") {
        const word = args[1]?.toLowerCase();
        const currentDisplay = gs.repKeyword ? `**${gs.repKeyword}**` : "not set";
        if (!word) {
          await safeReply(message, re(`Usage: \`${p}vanity set <keyword>\` · \`${p}vanity set off\`\nCurrent keyword: ${currentDisplay}`));
          return true;
        }
        if (word === "off" || word === "clear" || word === "none") {
          gs.repKeyword = "";
          saveState();
          await safeReply(message, re(`Vanity keyword cleared — the vanity role will not be auto-assigned until a new keyword is set.`, 0x57f287));
          return true;
        }
        gs.repKeyword = word;
        saveState();
        await safeReply(message, re(`Vanity keyword set to **${word}** — members whose custom status contains this word will receive the vanity role.`, 0x57f287));
        return true;
      }
      const rawId = args[1]?.replace(/[<@&#!>]/g, "");
      if (!sub || !rawId) {
        const currentDisplay = gs.repKeyword ? `**${gs.repKeyword}**` : "not set";
        await safeReply(message, re(`Usage: \`${p}vanity role @role\` · \`${p}vanity ping #channel\` · \`${p}vanity set <keyword>\` · \`${p}vanity off\`\nCurrent keyword: ${currentDisplay}`));
        return true;
      }
      if (sub === "role") {
        gs.repRoleId = rawId;
        saveState();
        await safeReply(message, re(`Vanity role set to <@&${rawId}>`, 0x57f287));
      } else if (sub === "ping") {
        gs.pingChannelId = rawId;
        saveState();
        await safeReply(message, re(`Vanity ping channel set to <#${rawId}>`, 0x57f287));
      } else {
        const currentDisplay = gs.repKeyword ? `**${gs.repKeyword}**` : "not set";
        await safeReply(message, re(`Usage: \`${p}vanity role @role\` · \`${p}vanity ping #channel\` · \`${p}vanity set <keyword>\` · \`${p}vanity off\`\nCurrent keyword: ${currentDisplay}`));
      }
      return true;
    }
    case "say": {
      const channelMention = args[0];
      const text = args.slice(1).join(" ");
      const channelId = channelMention?.replace(/[<#>]/g, "");
      if (!channelId || !text) {
        await safeReply(message, re(`Usage: \`${p}say #channel message\``));
        return true;
      }
      try {
        const target = (message.guild!.channels.cache.get(channelId) ??
          await message.guild!.channels.fetch(channelId)) as TextChannel;
        await target.send(text);
        await message.react("✅").catch(() => {});
      } catch {
        await safeReply(message, re("Couldn't send to that channel."));
      }
      return true;
    }
    case "dm": {
      const userMention = args[0];
      const text = args.slice(1).join(" ");
      const userId = userMention?.replace(/[<@!>]/g, "");
      if (!userId || !text) {
        await safeReply(message, re(`Usage: \`${p}dm @user message\``));
        return true;
      }
      try {
        const target = await message.client.users.fetch(userId);
        await target.send(text);
        await message.react("✅");
        if (dmLogChannel) {
          await dmLogChannel
            .send({
              embeds: [
                new EmbedBuilder()
                  .setColor(COLORS.primary)
                  .setTitle("DM Sent")
                  .addFields(
                    {
                      name: "To",
                      value: `${target} (${target.tag})`,
                      inline: true,
                    },
                    {
                      name: "From Server",
                      value: message.guild!.name,
                      inline: true,
                    },
                    { name: "Message", value: text },
                  )
                  .setTimestamp(),
              ],
            })
            .catch(() => {});
        }
      } catch {
        await safeReply(message, re("Couldn't DM that user (they may have DMs closed)."));
      }
      return true;
    }
    case "help": {
      type HelpCat = { emoji: string; title: string; desc: string; color: number; aliases: string[]; fields: { name: string; value: string }[] };
      const HELP_CATS: HelpCat[] = [
        {
          emoji: "🔨", title: "Moderation", color: 0xed4245,
          desc: "Warn, ban, mute, jail, and clean up your server.",
          aliases: ["mod", "moderation"],
          fields: [
            { name: "Warns & Bans", value: `\`${p}warn @u reason\` · \`${p}warnings @u\` · \`${p}clearwarns @u\`\n\`${p}warnthreshold kick/ban <N|off>\` · \`${p}warnlb\`\n\n\`${p}kick @u\` · \`${p}ban @u\` · \`${p}softban @u\` · \`${p}tempban @u 1d\`\n\`${p}unban ID\` · \`${p}unbanall confirm\` · \`${p}massban @u1 @u2\`\n\`${p}hackban ID [reason]\` · \`${p}banlist\`` },
            { name: "Mute / Jail / Lock", value: `\`${p}mute @u 10m reason\` · \`${p}unmute @u\` · \`${p}untimeoutall\`\n\`${p}massunmute\` · \`${p}mutelist\` · \`${p}uto all\`\n\n\`${p}jail @u\` · \`${p}unjail @u\` · \`${p}jaillist\`\n\n\`${p}lock\` · \`${p}unlock\` · \`${p}lockdown\` · \`${p}unlockdown\`` },
            { name: "Cleanup & Logs", value: `\`${p}purge 10\` · \`${p}purge @u 10\` · \`${p}purge images\` · \`${p}nuke\` · \`${p}schedulenuke 30m\`\n\`${p}clearreacts [msgId]\` · \`${p}cleanup\`\n\n\`${p}modlog #ch/off\` · \`${p}history @u\` · \`${p}clearhistory @u\`\n\`${p}dehoist\` · \`${p}stripstaff @u\` · \`${p}restorestaff @u\` · \`${p}striphumans\`\n\n\`${p}audit [filter] [by @u] [limit]\`\n  filters: \`ban kick unban mute role channel message webhook invite emoji server thread automod bot\`` },
            { name: "Advanced Mutes & Image Lock", value: `\`${p}imute @u\` · \`${p}iunmute @u\` — block image/video posts\n\`${p}rmute @u\` · \`${p}runmute @u\` — block reactions\n\`${p}imagelock\` · \`${p}imageunlock\` — channel-level image block\n\n\`${p}forcenick @u <name>\` · \`${p}unforcenick @u\` · \`${p}forcenicks\`` },
            { name: "Reports & Access", value: `\`${p}report @u reason\` · \`${p}reportchannel #ch\`\n\n\`${p}grantaccess @u\` · \`${p}revokeaccess @u\` · \`${p}listaccess\`` },
          ],
        },
        {
          emoji: "⚙️", title: "Management", color: 0xfee75c,
          desc: "Roles, channels, messaging, booster roles, and autostaff.",
          aliases: ["manage", "management", "booster", "boost", "br", "autostaff", "as"],
          fields: [
            { name: "Roles", value: `\`${p}setup\` · \`${p}role @u @role\` · \`${p}role create <name> [#color]\` · \`${p}role icon @role <emoji>\`\n\`${p}massrole @role\` · \`${p}autorole @role/off\`\n\n\`${p}editrole @role color #hex\` · \`${p}editrole @role name New Name\`\n\`${p}editrole @role hoist on/off\` · \`${p}editrole @role mention on/off\`` },
            { name: "Server & Channels", value: `\`${p}nick @u name\` · \`${p}setnick name\` · \`${p}resetnick @u\` · \`${p}massnick <text|reset>\`\n\n\`${p}move @u #vc\` · \`${p}moveall #from #to\` · \`${p}voicekick @u\` · \`${p}voicemute/unmute/deaf/undeaf @u\`\n\`${p}vclock #vc [limit]\` · \`${p}slowmode 5\` · \`${p}slowall <dur|off>\` · \`${p}slowmodelist\`\n\`${p}topic text\` · \`${p}hide/unhide [#ch]\` · \`${p}pin/unpin [msgId]\` · \`${p}clearpins [#ch]\`\n\`${p}autopublish on/off\` · \`${p}emojis [search]\` · \`${p}stealemoji <emoji|url> <name>\`\n\`${p}thread create/lock/unlock/archive/rename\` · \`${p}listthreads\`` },
            { name: "Messaging", value: `\`${p}say #ch msg\` · \`${p}announce #ch Title | Body\` · \`${p}embed [#ch] Title | Body [| #color]\`\n\`${p}dm @u msg\` · \`${p}dmall msg\` · \`${p}rolemention @role <msg>\`\n\`${p}reminder 10m msg\` · \`${p}poll Q | A | B\`\n\n\`${p}alias add s cmd\` · \`${p}alias remove s\` · \`${p}alias list\`\n\`${p}vanity role @role\` · \`${p}vanity set <kw>\` · \`${p}vanity ping #ch\` · \`${p}vanity off\`\n\`${p}ticketsetup\` · \`${p}ticket reason\` · \`${p}closeticket\`` },
            { name: "Booster Roles", value: `Admin: \`${p}boosterrole set @role\` · \`${p}boosterrole give/remove/list @u\`\n\nBoosters: \`${p}br create Name #hex\` · \`${p}br color #hex\` · \`${p}br gradient #hex1 #hex2\`\n\`${p}br name New Name\` · \`${p}br icon <emoji|url|clear>\` · \`${p}br info\` · \`${p}br delete\`\n\n*Auto-assigned on boost, auto-deleted when boost ends.*` },
            { name: "Autostaff", value: `\`${p}autostaff on/off\` · \`${p}autostaff setlog #ch\` · \`${p}autostaff baserole @role/clear\`\n\`${p}autostaff addtier @role Label <minMods> <minMsgs>\` · \`${p}autostaff removetier @role\` · \`${p}autostaff tiers\`\n\`${p}autostaff progress [@u]\` · \`${p}autostaff stats\` · \`${p}autostaff reset @u\`` },
          ],
        },
        {
          emoji: "🛡️", title: "Security", color: 0xf0b132,
          desc: "Antinuke, filters, raid protection, spam, and blacklists.",
          aliases: ["security", "antinuke", "nuke", "blacklist", "bl", "bans"],
          fields: [
            {
              name: "🔰 Antinuke",
              value: `\`${p}antinuke on/off\`\n\`${p}antinuke restore on/off/status/snapshot\`\n\`${p}antinuke bans/kicks/channels/roles <N>\`\n\`${p}whitelist add/remove/list @u\``,
            },
            {
              name: "🔑 Permission Guard",
              value: `\`${p}permguard on/off\`\n\`${p}permguardwhitelist add/remove/list @u\``,
            },
            {
              name: "🚫 Word & Link Filters",
              value: `\`${p}filter add/remove/list <word>\`\n\`${p}filterbypass @u\` · \`${p}unfilterbypass @u\` · \`${p}listbypasses\`\n\`${p}linkbypass @u\` · \`${p}unlinkbypass @u\` · \`${p}linkbypasses\`\n\`${p}antiinvite on/off\``,
            },
            {
              name: "🌊 Raid Protection",
              value: `\`${p}raidprotect on/off\` · \`${p}raidprotect threshold <N>\` · \`${p}raidprotect window <s>\`\n\`${p}raidprotect action <kick|jail|ban|timeout>\`\n\`${p}banraiders [reason]\` · \`${p}lockserver\` · \`${p}unlockserver\`\n\`${p}agegate on/off\` · \`${p}agegate days <N>\`\n\`${p}antialt on/off\` · \`${p}antialt days <N>\``,
            },
            {
              name: "⚡ Anti-Spam",
              value: `\`${p}antispam enable/disable\` · \`${p}antispam threshold N\` · \`${p}antispam window N\`\n\`${p}spambypass @u\` · \`${p}unspambypass @u\` · \`${p}spambypasses\`\n\`${p}antieveryoneping on/off\` · \`${p}antieveryoneping action <delete|mute|ban>\``,
            },
            {
              name: "🔡 Caps & Content Filters",
              value: `\`${p}capslockfilter on/off\` · \`${p}capslockfilter threshold <N>\`\n\`${p}imageban @u\` · \`${p}imageunban @u\` · \`${p}imagebans\`\n\`${p}streamban @u\` · \`${p}streamunban @u\` · \`${p}streambans\``,
            },
            {
              name: "🔨 Permanent Bans & Staff Blacklist",
              value: `\`${p}hardban @u <reason>\` · \`${p}hardban remove <ID>\` · \`${p}hardbans\`\n\`${p}sblacklist setrole @role\` · \`${p}sblacklist add/remove/list/check @u\``,
            },
          ],
        },
        {
          emoji: "✨", title: "Server Features", color: 0xeb459e,
          desc: "XP, VoiceMaster, tags, autoresponders, counters, starboard, and more.",
          aliases: ["features", "server", "sf", "extras", "engage", "xp", "level", "vc", "voicemaster", "voice"],
          fields: [
            { name: "Welcome, Goodbye & Boost", value: `\`${p}welcome #ch msg/off\`\n\`${p}goodbye channel #ch\` · \`${p}goodbye message <text>\` · \`${p}goodbye off/status\`\n\`${p}boostmsg channel #ch\` · \`${p}boostmsg message <text>\` · \`${p}boostmsg off/status\`\n\`${p}boosterdm on/off\` · \`${p}boosterdm message <text>\`\n\`${p}pingonjoin add/remove/list/off #ch\`` },
            { name: "XP, Leveling & Starboard", value: `\`${p}xp [@u]\` · \`${p}xp leaderboard\` · \`${p}xp enable/disable\` · \`${p}xp reset @u\`\n\`${p}xp setrole <minLevel> @role\` · \`${p}xp channel #ch/off\`\n\n\`${p}starboard channel #ch\` · \`${p}starboard threshold N\` · \`${p}starboard off\`\n\`${p}counting set #ch\` · \`${p}counting off/reset [N]\`\n\`${p}suggest <text>\` · \`${p}imageonly #ch on/off\` · \`${p}imageonly list\`` },
            { name: "VoiceMaster", value: `Admin: \`${p}vc setup\`\n\nVC owner: \`${p}vc lock/unlock\` · \`${p}vc hide/unhide\` · \`${p}vc kick @u\` · \`${p}vc allow @u\` · \`${p}vc reject @u\`\n\`${p}vc rename <name>\` · \`${p}vc limit <N|off>\` · \`${p}vc claim\` · \`${p}vc info\`` },
            { name: "Tags & Autoresponders", value: `\`${p}tag <name>\` · \`${p}tag add/delete/edit <name>\` · \`${p}tags\`\n\n\`${p}ar add <trigger> <response> [--exact] [--dm]\` · \`${p}ar delete <trigger>\` · \`${p}ar list\`\n\n\`${p}disablecommand <cmd> [#ch]\` · \`${p}enablecommand <cmd> [#ch]\` · \`${p}disablecommand list\`` },
            { name: "Counters, Webhooks & Extras", value: `\`${p}counter add #ch <type> [label]\` · \`${p}counter remove #ch\` · \`${p}counter list\`\n  Types: \`members · bots · humans · roles · channels · boosts\`\n\n\`${p}webhook list/create/delete/edit\`\n\`${p}clownboard channel #ch\` · \`${p}clownboard threshold N\` · \`${p}clownboard off/status\`\n\`${p}bumpreminder on/off\` · \`${p}bumpreminder channel #ch\` · \`${p}bumpreminder status\`\n\`${p}uwulock [#ch]\` · \`${p}uwuunlock [#ch]\` · \`${p}uwulist\`` },
          ],
        },
        {
          emoji: "🔧", title: "Utility", color: 0x57f287,
          desc: "Snipe, AFK, sticky messages, custom commands, and info lookups.",
          aliases: ["util", "utility"],
          fields: [
            { name: "Snipe / AFK / Sticky", value: `\`${p}snipe [1–10]\` · \`${p}esnipe\` · \`${p}rsnipe\` · \`${p}clearsnipe\`\n\`${p}imagesnipe\` · \`${p}videosnipe\`\n\n\`${p}afk [reason]\` · \`${p}afklist\`\n\`${p}sticky msg\` · \`${p}unsticky\` · \`${p}stickylist\`` },
            { name: "Custom Commands & Reaction Roles", value: `\`${p}delcmd trigger\` · \`${p}listcmds\`\n\n\`${p}reactionrole #ch msgID emoji @role\` · \`${p}removereactionrole msgID emoji\`` },
            { name: "Server & User Info", value: `\`${p}serverinfo\` · \`${p}membercount\` · \`${p}channelinfo\` · \`${p}roleinfo @role\`\n\`${p}userinfo @u\` · \`${p}lookup <userId>\` · \`${p}invites\` · \`${p}ping\` · \`${p}uptime\`\n\`${p}bots\` · \`${p}sticker add|remove|list\` · \`${p}roles\` · \`${p}inrole @role\` · \`${p}search <name>\`\n\`${p}oldest/newest [N]\` · \`${p}randomuser [@role]\` · \`${p}id @u|@role|#ch\`\n\`${p}modstats [@u]\` · \`${p}permissions @u [#ch]\` · \`${p}roleperms @role\`\n\`${p}note @u text\` · \`${p}notes @u\` · \`${p}clearnotes @u\`` },
            { name: "Tools & Web", value: `\`${p}timestamp [1h | 2025-12-25]\` · \`${p}color #rrggbb\` · \`${p}calc <expr>\` · \`${p}firstmsg [#ch]\`\n\`${p}weather <city>\` · \`${p}define <word>\` · \`${p}urban <phrase>\`\n\`${p}qr <text>\` · \`${p}shortlink <url>\` · \`${p}tz <city>\` · \`${p}copyembed <msgId>\`` },
          ],
        },
        {
          emoji: "🎮", title: "Fun", color: 0xff6b6b,
          desc: "Games, roleplay GIFs, social commands, birthdays, and giveaways.",
          aliases: ["fun", "games"],
          fields: [
            { name: "Games & Stats", value: `\`${p}blacktea\` · \`${p}8ball <q>\` · \`${p}coinflip\` · \`${p}roll [sides]\` · \`${p}rps rock|paper|scissors\`\n\`${p}trivia\` · \`${p}wordle\` · \`${p}ttt @u\`\n\`${p}pp [@u]\` · \`${p}iq [@u]\` · \`${p}rizz [@u]\` · \`${p}sus [@u]\`` },
            { name: "Roleplay GIFs", value: `\`${p}hug\` \`${p}kiss\` \`${p}pat\` \`${p}cuddle\` \`${p}handhold\` \`${p}wave\` \`${p}highfive\` \`${p}poke\` \`${p}lick\` \`${p}bite\` \`${p}slap\` \`${p}punch\` \`${p}bonk\` \`${p}yeet\` \`${p}kill\` \`${p}glomp\` \`${p}nom\` \`${p}bully\` \`${p}tickle\` \`${p}baka\` \`${p}stare\` \`${p}feed\` \`${p}peck\`\n\`${p}smug\` \`${p}cry\` \`${p}blush\` \`${p}smile\` \`${p}wink\` \`${p}dance\` \`${p}cringe\` \`${p}awoo\` \`${p}run\`\n*(add \`@u\` to target someone)*` },
            { name: "Social, Text & Lookups", value: `\`${p}steal\` · \`${p}ratio @u\` · \`${p}ship @u1 @u2\` · \`${p}roast\` · \`${p}compliment\`\n\`${p}mock <text>\` · \`${p}reverse <text>\` · \`${p}fact\` · \`${p}joke\` · \`${p}would <thing>\`\n\`${p}choose A | B\` · \`${p}pick\` · \`${p}truth\` · \`${p}dare\` · \`${p}translate <lang> <text>\`\n\`${p}google <query>\` · \`${p}image <query>\` · \`${p}roblox <username>\`\n\`${p}dog\` · \`${p}cat\` · \`${p}meme\`` },
            { name: "Daily, Birthdays & Giveaways", value: `\`${p}daily\` — claim daily XP reward (20h cooldown)\n\n\`${p}birthday set MM-DD\` · \`${p}birthday today/list/remove\` · \`${p}birthday channel #ch\`\n\n\`${p}giveaway 10m Prize\` · \`${p}giveaway 1d 3 Prize\` · \`${p}gend <msgId>\` · \`${p}greroll <msgId>\`` },
          ],
        },
        {
          emoji: "🔒", title: "Tools", color: 0x5865f2,
          desc: "Backups, temp roles, permissions, and owner-only controls.",
          aliases: ["tools", "extra"],
          fields: [
            { name: "Temp Roles, Button Roles & Restore", value: `\`${p}temprole @u @role 1h\` · \`${p}temproles @u\`\n\`${p}buttonrole create #ch Title | Label @role | ...\` · \`${p}buttonrole delete <msgId>\`\n\`${p}togglerolerestore\` (\`${p}trr\`) · \`${p}restoreuser @u\` (\`${p}rru\`) · \`${p}clearrolebackup @u\` (\`${p}crb\`)` },
            { name: "Backup & Misc", value: `\`${p}backup create\` · \`${p}backup list\` · \`${p}backup load/info/delete <ID>\`\n\`${p}leavedm enable/disable\` · \`${p}leavedm message <text>\` · \`${p}leavedm preview\`\n\`${p}prefix <new>\`` },
            { name: "Permissions & Cleanup", value: `\`${p}setupmute\` — create Muted, Image Muted & Reaction Muted roles\n\`${p}strip @u\` · \`${p}unstrip @u\` · \`${p}stripall\` · \`${p}restoreperms\`\n\`${p}fakepermissions list\` · \`${p}fakepermissions strip [@role]\` · \`${p}fakepermissions restore\`\n\`${p}enableevent <event>\` · \`${p}disableevent <event>\`\n  Events: \`welcome · goodbye · boost · joinlog · leavelog\`` },
            { name: "Owner — Bot & System", value: `\`${p}setstatus playing|watching|listening|competing|clear <text>\`\n\`${p}rename <name>\` · \`${p}setavatar <url>\` · \`${p}botstats\` · \`${p}maintenance on/off\`\n\`${p}botinvite\` · \`${p}eval <code>\` · \`${p}save\` · \`${p}reload\` · \`${p}shutdown\` · \`${p}reloadslash\`` },
            { name: "Owner — Servers & Users", value: `\`${p}servers\` · \`${p}leave <guildId>\` · \`${p}broadcast <msg>\` · \`${p}spyguild <guildId>\` · \`${p}resetguild\`\n\`${p}blacklistserver <guildId>\` · \`${p}unblacklistserver\` · \`${p}blacklistedservers\`\n\`${p}globalban <userId> [reason]\` · \`${p}globalunban <userId>\` · \`${p}globalbans\` · \`${p}clearglobalbans\`` },
            { name: "XP Admin & Overview", value: `\`${p}setxp @u <amount>\` · \`${p}removexp @u <amount>\` · \`${p}setlevel @u <level>\`\n\`${p}rank [@u]\` — rank card with XP progress bar\n\`${p}settings\` — view all server configuration at a glance` },
          ],
        },
      ];

      const TOTAL = HELP_CATS.length + 1; // index page + one per category

      const buildEmbed = (page: number, fieldIdx: number): EmbedBuilder => {
        if (page === 0) {
          const avatarUrl = client.user?.displayAvatarURL({ size: 256 }) ?? null;
          const half = Math.ceil(HELP_CATS.length / 2);
          const col1 = HELP_CATS.slice(0, half).map(c => `${c.emoji} **${c.title}**\n╰ *${c.desc}*`).join("\n\n");
          const col2 = HELP_CATS.slice(half).map(c => `${c.emoji} **${c.title}**\n╰ *${c.desc}*`).join("\n\n");
          return new EmbedBuilder()
            .setColor(COLORS.primary)
            .setAuthor({ name: "october — Command Reference", iconURL: avatarUrl ?? undefined })
            .addFields(
              { name: "\u200b", value: col1, inline: true },
              { name: "\u200b", value: col2, inline: true },
            )
            .setFooter({ text: `${TOTAL - 1} categories  •  Use the menu below or !help <category> to jump directly` })
            .setTimestamp();
        }
        const cat = HELP_CATS[page - 1];
        if (fieldIdx >= 0 && fieldIdx < cat.fields.length) {
          const f = cat.fields[fieldIdx];
          return new EmbedBuilder()
            .setAuthor({ name: `${cat.emoji} ${cat.title}`, iconURL: client.user?.displayAvatarURL() ?? undefined })
            .setColor(cat.color)
            .setDescription(`**${f.name}**\n\n${f.value}`)
            .setFooter({ text: `Pick another group from the menu below` })
            .setTimestamp();
        }
        return new EmbedBuilder()
          .setAuthor({ name: `${cat.emoji} ${cat.title}`, iconURL: client.user?.displayAvatarURL() ?? undefined })
          .setDescription(`*${cat.desc}*`)
          .addFields(cat.fields.map(f => ({ name: f.name, value: f.value.split("\n").slice(0, 3).join("\n") + (f.value.split("\n").length > 3 ? "\n…" : ""), inline: false })).slice(0, 5))
          .setColor(cat.color)
          .setFooter({ text: `Select a command group below to see full details` })
          .setTimestamp();
      };

      const buildCategoryMenu = () =>
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("help_category_select")
            .setPlaceholder("Jump to a category…")
            .addOptions(
              HELP_CATS.map((c, idx) =>
                new StringSelectMenuOptionBuilder()
                  .setLabel(`${c.emoji} ${c.title}`.slice(0, 100))
                  .setDescription(c.desc.slice(0, 100))
                  .setValue(String(idx + 1))
              )
            )
        );

      const buildFieldMenu = (page: number) => {
        const cat = HELP_CATS[page - 1];
        return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("help_field_select")
            .setPlaceholder("Pick a command group…")
            .addOptions(
              cat.fields.map((f, idx) =>
                new StringSelectMenuOptionBuilder()
                  .setLabel(f.name.slice(0, 100))
                  .setValue(String(idx))
              )
            )
        );
      };

      const buildRow = (page: number) =>
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId("help_prev").setLabel("← Back").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId("help_home").setLabel(" Home").setStyle(ButtonStyle.Primary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId("help_page_indicator").setLabel(`${page + 1} / ${TOTAL}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
          new ButtonBuilder().setCustomId("help_next").setLabel("Next →").setStyle(ButtonStyle.Secondary).setDisabled(page === TOTAL - 1),
        );

      const buildComponents = (page: number) =>
        page === 0 ? [buildCategoryMenu(), buildRow(page)] : [buildFieldMenu(page), buildRow(page)];

      // Determine starting page (direct category jump still works)
      let page = 0;
      let fieldIdx = -1;
      const arg = args[0]?.toLowerCase();
      if (arg) {
        const idx = HELP_CATS.findIndex((c) => c.aliases.includes(arg) || c.title.toLowerCase() === arg);
        if (idx === -1) {
          const list = HELP_CATS.map((c) => `${c.aliases[0]}`).join(" · ");
          await safeReply(message, re(`Unknown category. Available: ${list}`));
          return true;
        }
        page = idx + 1;
      }

      const sent = await safeReply(message, { embeds: [buildEmbed(page, fieldIdx)], components: buildComponents(page) });

      const collector = sent.createMessageComponentCollector({
        filter: (i) => i.user.id === message.author.id,
        time: 2 * 60 * 1000,
      });

      collector.on("collect", async (i) => {
        if (i.isStringSelectMenu() && i.customId === "help_category_select") {
          page = parseInt(i.values[0], 10);
          fieldIdx = -1;
        } else if (i.isStringSelectMenu() && i.customId === "help_field_select") {
          fieldIdx = parseInt(i.values[0], 10);
        } else if (i.isButton()) {
          if (i.customId === "help_prev") { page = Math.max(0, page - 1); fieldIdx = -1; }
          else if (i.customId === "help_next") { page = Math.min(TOTAL - 1, page + 1); fieldIdx = -1; }
          else if (i.customId === "help_home") { page = 0; fieldIdx = -1; }
        }
        await i.update({ embeds: [buildEmbed(page, fieldIdx)], components: buildComponents(page) });
      });

      collector.on("end", () => {
        sent.edit({ components: [] }).catch(() => {});
      });

      return true;
    }
    case "announce": {
      const channelMention = args[0];
      const rest = args.slice(1).join(" ");
      const channelId = channelMention?.replace(/[<#>]/g, "");
      if (!channelId || !rest) {
        await safeReply(message, re(`Usage: \`${p}announce #channel Title | Body\``));
        return true;
      }
      const [title, ...bodyParts] = rest.split("|");
      const body = bodyParts.join("|").trim();
      try {
        const target = (await message.guild!.channels.fetch(
          channelId,
        )) as TextChannel;
        await target.send({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.primary)
              .setTitle(title.trim())
              .setDescription(body || null)
              .setTimestamp(),
          ],
        });
        await message.react("✅");
      } catch {
        await safeReply(message, re("Couldn't send to that channel."));
      }
      return true;
    }
    case "ping": {
      const before = Date.now();
      const msg = await safeReply(message, re("Pinging..."));
      const latency = Date.now() - before;
      const wsLatency = message.client.ws.ping;
      await msg.edit({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle("Pong!")
          .addFields(
            { name: "Round-trip", value: `${latency}ms`, inline: true },
            { name: "WebSocket", value: `${wsLatency}ms`, inline: true },
          )
          .setTimestamp()],
      });
      return true;
    }
    case "uptime": {
      const ms = Date.now() - botStartTime;
      const s = Math.floor(ms / 1000);
      const d = Math.floor(s / 86400);
      const h = Math.floor((s % 86400) / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      const parts = [
        d && `${d}d`,
        h && `${h}h`,
        m && `${m}m`,
        `${sec}s`,
      ].filter(Boolean);
      await safeReply(message, re(`Bot has been online for **${parts.join(" ")}**.`));
      return true;
    }
    case "welcome": {
      const arg = args[0];
      if (!arg) {
        const sdInfo = gs.welcomeSelfDestruct ? ` Auto-deletes after **${gs.welcomeSelfDestruct}s**.` : "";
        await safeReply(message, re(gs.welcomeChannelId
            ? `Welcome is set to <#${gs.welcomeChannelId}>. Message: "${gs.welcomeMessage}"${sdInfo}\nUse \`${p}welcome off\` to disable or \`${p}welcome #channel message\` to change.`
            : `No welcome message set. Use \`${p}welcome #channel Your message here\` — use \`{user}\` to mention them."`));
        return true;
      }
      if (arg.toLowerCase() === "off") {
        gs.welcomeChannelId = null;
        saveState();
        await safeReply(message, re("Welcome message disabled."));
        return true;
      }
      if (arg.toLowerCase() === "self_destruct") {
        const val = args[1]?.toLowerCase();
        if (!val || val === "off") {
          gs.welcomeSelfDestruct = null;
          saveState();
          await safeReply(message, re("Welcome message self-destruct disabled."));
          return true;
        }
        const secs = parseInt(val, 10);
        if (isNaN(secs) || secs < 1) {
          await safeReply(message, re(`Usage: \`${p}welcome self_destruct <seconds>\` or \`${p}welcome self_destruct off\``));
          return true;
        }
        gs.welcomeSelfDestruct = secs;
        saveState();
        await safeReply(message, re(`Welcome messages will now auto-delete after **${secs}s**.`));
        return true;
      }
      const channelId = arg.replace(/[<#>]/g, "");
      const text = args.slice(1).join(" ");
      if (!text) {
        await safeReply(message, re(`Usage: \`${p}welcome #channel Your message — use {user} to mention them\``));
        return true;
      }
      try {
        await message.guild!.channels.fetch(channelId);
        gs.welcomeChannelId = channelId;
        gs.welcomeMessage = text;
        saveState();
        await safeReply(message, re(`Welcome message set in <#${channelId}>.\nPreview: ${text.replace("{user}", `${message.author}`)}`));
      } catch {
        await safeReply(message, re("Channel not found."));
      }
      return true;
    }
    case "modlog": {
      const arg = args[0];
      if (!arg) {
        await safeReply(message, re(gs.modLogChannelId
            ? `Mod log is set to <#${gs.modLogChannelId}>. Use \`${p}modlog off\` to disable.`
            : `No mod log set. Use \`${p}modlog #channel\`.`));
        return true;
      }
      if (arg.toLowerCase() === "off") {
        gs.modLogChannelId = null;
        saveState();
        await safeReply(message, re("Mod log disabled."));
        return true;
      }
      const channelId = arg.replace(/[<#>]/g, "");
      try {
        await message.guild!.channels.fetch(channelId);
        gs.modLogChannelId = channelId;
        saveState();
        await safeReply(message, re(`Mod log set to <#${channelId}>. All moderation actions will be logged there.`));
      } catch {
        await safeReply(message, re("Channel not found."));
      }
      return true;
    }
    case "snipe": {
      const snipes = snipeCache.get(message.channelId);
      if (!snipes?.length) {
        await safeReply(message, re("Nothing to snipe in this channel."));
        return true;
      }
      const idxArg = parseInt(args[0] ?? "1", 10);
      const idx = isNaN(idxArg) || idxArg < 1 ? 0 : idxArg - 1; // user-facing 1-based → 0-based
      if (idx >= snipes.length) {
        await safeReply(message, re(`Only ${snipes.length} deleted message(s) cached for this channel (use \`${p}snipe 1\`–\`${p}snipe ${snipes.length}\`).`));
        return true;
      }
      const snipe = snipes[idx];
      const snipeEmbed = new EmbedBuilder()
        .setColor(COLORS.error)
        .setAuthor({
          name: snipe.authorTag,
          iconURL: snipe.authorAvatar ?? undefined,
        })
        .setFooter({ text: ` Deleted · #${idx + 1} of ${snipes.length} · ID: ${snipe.authorId}` })
        .setTimestamp(snipe.timestamp);
      if (snipe.content) snipeEmbed.setDescription(snipe.content.slice(0, 4000));
      const imageUrl = snipe.attachments.find((u) => /\.(png|jpe?g|gif|webp)(\?|$)/i.test(u));
      if (imageUrl) snipeEmbed.setImage(imageUrl);
      const extraAttachments = snipe.attachments.filter((u) => u !== imageUrl);
      if (extraAttachments.length > 0) {
        snipeEmbed.addFields({ name: "Attachments", value: extraAttachments.map((u, i) => `[File ${i + 1}](${u})`).join("\n") });
      }
      await safeReply(message, { embeds: [snipeEmbed] });
      return true;
    }
    case "esnipe": {
      const esnipe = editSnipeCache.get(message.channelId);
      if (!esnipe) {
        await safeReply(message, re("Nothing to edit-snipe in this channel."));
        return true;
      }
      await safeReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.primary)
            .setAuthor({
              name: esnipe.authorTag,
              iconURL: esnipe.authorAvatar ?? undefined,
              url: esnipe.messageUrl,
            })
            .addFields(
              { name: "Before", value: esnipe.before.slice(0, 1000) },
              { name: "After", value: esnipe.after.slice(0, 1000) },
            )
            .setFooter({ text: ` Edited · ID: ${esnipe.authorId}` })
            .setTimestamp(esnipe.timestamp),
        ],
      });
      return true;
    }
    case "rsnipe": {
      const rsnipe = reactionSnipeCache.get(message.channelId);
      if (!rsnipe) {
        await safeReply(message, re("Nothing to reaction-snipe in this channel."));
        return true;
      }
      await safeReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.warning)
            .setAuthor({
              name: rsnipe.authorTag,
              iconURL: rsnipe.authorAvatar ?? undefined,
            })
            .setDescription(`Removed reaction **${rsnipe.emoji}** from [message](https://discord.com/channels/${message.guild.id}/${message.channelId}/${rsnipe.messageId})`)
            .setFooter({ text: ` Reaction removed · ID: ${rsnipe.authorId}` })
            .setTimestamp(rsnipe.timestamp),
        ],
      });
      return true;
    }
    case "clearsnipe": {
      snipeCache.delete(message.channelId);
      editSnipeCache.delete(message.channelId);
      reactionSnipeCache.delete(message.channelId);
      await safeReply(message, re("Snipe cache cleared for this channel."));
      return true;
    }
    case "afk": {
      const reason = args.join(" ") || "AFK";
      afkUsers.set(message.author.id, { reason, timestamp: Date.now() });
      await safeReply(message, re(`You're now AFK: **${reason}**`));
      return true;
    }
    case "tz":
    case "timezone": {
      const sub = args[0]?.toLowerCase();

      if (sub === "set") {
        const query = args.slice(1).join(" ").trim();
        if (!query) {
          await safeReply(message, re(`Usage: \`${p}timezone set <city or country>\` — e.g. \`${p}timezone set London\` or \`${p}timezone set New York\``));
          return true;
        }
        try {
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
            { headers: { "User-Agent": "october-discord-bot/1.0" } }
          );
          const geoData = await geoRes.json() as { lat: string; lon: string; display_name: string }[];
          if (!geoData.length) {
            await safeReply(message, re(`Couldn't find a location matching **${query}**. Try a more specific city or country name.`));
            return true;
          }
          const { lat, lon, display_name } = geoData[0];
          const zones = geoFind(parseFloat(lat), parseFloat(lon));
          if (!zones.length) {
            await safeReply(message, re(`Found the location but couldn't determine its timezone. Try a different city.`));
            return true;
          }
          const tz = zones[0];
          gs.userTimezones.set(message.author.id, tz);
          saveState();
          const now = new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            hour: "numeric", minute: "2-digit", hour12: true,
            weekday: "short", month: "short", day: "numeric",
          }).format(new Date());
          await safeReply(message, { embeds: [new EmbedBuilder()
            .setColor(COLORS.primary)
            .setDescription(`✅ Timezone set to **${tz}**\n📍 Location: ${display_name.split(",").slice(0, 2).join(",").trim()}\n🕐 Current time: **${now}**`)]
          });
        } catch {
          await safeReply(message, re("Failed to look up that location. Try again later."));
        }
        return true;
      }

      if (sub === "clear") {
        gs.userTimezones.delete(message.author.id);
        saveState();
        await safeReply(message, re("Your timezone has been cleared."));
        return true;
      }

      // !timezone [@user] — view someone's time
      const target = message.mentions.users.first() ?? message.author;
      const tz = gs.userTimezones.get(target.id);
      if (!tz) {
        const isSelf = target.id === message.author.id;
        await safeReply(message, re(isSelf
          ? `You haven't set a timezone yet. Use \`${p}timezone set <city>\` to set one.`
          : `${target.username} hasn't set a timezone.`));
        return true;
      }
      const now = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
        weekday: "long", month: "long", day: "numeric", year: "numeric",
      }).format(new Date());
      await safeReply(message, { embeds: [new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`🕐 ${target.username}'s Time`)
        .setDescription(`**${now}**\n\`${tz}\``)
        .setThumbnail(target.displayAvatarURL())]
      });
      return true;
    }
    case "botinvite": {
      if (!isOwner(message.author.id)) return true;
      const perms = 8n; // Administrator
      const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${client.user!.id}&permissions=${perms}&scope=bot%20applications.commands`;
      await safeReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.primary)
            .setTitle("Bot Invite Link")
            .setDescription(`[Click here to add **${client.user!.username}** to a server](${inviteUrl})\n\n\`${inviteUrl}\``)
            .setTimestamp(),
        ],
      });
      return true;
    }
    case "reloadslash": {
      const member = message.member as GuildMember | null;
      const isAdmin = member?.permissions?.has(PermissionFlagsBits.Administrator) || isOwner(message.author.id);
      if (!isAdmin) {
        await safeReply(message, re("You need **Administrator** permission to reload slash commands."));
        return true;
      }
      const loadingMsg = await safeReply(message, re("Re-registering slash commands for this server..."));
      try {
        await registerSlashCommands(guild.id, true);
        await loadingMsg.edit({ embeds: [new EmbedBuilder().setColor(COLORS.success).setDescription(" Slash commands re-registered! They should appear in Discord within a few seconds. If they still don't show up, check that the bot was invited with the **applications.commands** scope.")] });
      } catch (err) {
        await loadingMsg.edit({ embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription(` Failed to register slash commands: \`${(err as Error).message}\``)] });
      }
      return true;
    }
    case "reminder": {
      const timeStr = args[0];
      const text = args.slice(1).join(" ");
      if (!timeStr || !text) {
        await safeReply(message, re(`Usage: \`${p}reminder <time> message\` — e.g. \`${p}reminder 30m check the giveaway\``));
        return true;
      }
      const match = timeStr.match(/^(\d+)(s|m|h|d)$/i);
      if (!match) {
        await safeReply(message, re("Time format: `30s`, `10m`, `2h`, `1d`"));
        return true;
      }
      const amount = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      const ms =
        unit === "s"
          ? amount * 1000
          : unit === "m"
            ? amount * 60_000
            : unit === "h"
              ? amount * 3_600_000
              : amount * 86_400_000;
      const endsAt = Math.floor((Date.now() + ms) / 1000);
      await safeReply(message, re(`Got it! I'll remind you <t:${endsAt}:R>.`));
      setTimeout(async () => {
        await message.channel
          .send(re(` ${message.author} Reminder: **${text}**`))
          .catch(() => {});
      }, ms);
      return true;
    }
    case "embed": {
      let targetChannel = message.channel as TextChannel;
      let argsCopy = [...args];
      // Optional first arg: channel mention
      const chMatch = argsCopy[0]?.match(/^<#(\d+)>$/);
      if (chMatch) {
        const ch = message.guild!.channels.cache.get(chMatch[1]);
        if (ch?.isTextBased()) { targetChannel = ch as TextChannel; argsCopy.shift(); }
      }
      const raw = argsCopy.join(" ");
      const parts = raw.split("|").map((p) => p.trim());
      const title = parts[0] || "";
      const body = parts[1] || "";
      if (!title && !body) {
        await safeReply(message, re(`Usage: \`${p}embed [#channel] Title | Body [| #color]\``));
        return true;
      }
      let color = 0x5865f2;
      if (parts[2]) {
        const hex = parts[2].replace("#", "");
        const parsed = parseInt(hex, 16);
        if (!isNaN(parsed)) color = parsed;
      }
      const emb = new EmbedBuilder().setColor(color);
      if (title) emb.setTitle(title);
      if (body) emb.setDescription(body);
      await targetChannel.send({ embeds: [emb] });
      if (targetChannel.id !== message.channel.id)
        await safeReply(message, re(`Embed sent to ${targetChannel}.`));
      return true;
    }
    case "ts": {
      let unix = Math.floor(Date.now() / 1000);
      const raw = args.join(" ").trim();
      if (raw) {
        // Relative: 30s, 5m, 2h, 3d, 1w
        const rel = raw.match(/^(\d+(?:\.\d+)?)(s|m|h|d|w)$/i);
        if (rel) {
          const n = parseFloat(rel[1]);
          const u = rel[2].toLowerCase();
          const ms = u === "s" ? n * 1000 : u === "m" ? n * 60_000 : u === "h" ? n * 3_600_000 : u === "d" ? n * 86_400_000 : n * 604_800_000;
          unix = Math.floor((Date.now() + ms) / 1000);
        } else {
          // Absolute date/datetime
          const parsed = Date.parse(raw);
          if (isNaN(parsed)) {
            await safeReply(message, re("Can't parse that time. Try `1h`, `2d`, `30m`, or a date like `2025-12-25`."));
            return true;
          }
          unix = Math.floor(parsed / 1000);
        }
      }
      const styles = [
        { label: "Short Time", flag: "t" },
        { label: "Long Time", flag: "T" },
        { label: "Short Date", flag: "d" },
        { label: "Long Date", flag: "D" },
        { label: "Short Date/Time", flag: "f" },
        { label: "Long Date/Time (default)", flag: "F" },
        { label: "Relative", flag: "R" },
      ];
      const fields = styles.map((s) => ({
        name: s.label,
        value: `\`<t:${unix}:${s.flag}>\` → <t:${unix}:${s.flag}>`,
        inline: false,
      }));
      await safeReply(message, { embeds: [
        new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle("Timestamp Formats")
          .setDescription(`Unix: \`${unix}\`\nCopy any format and paste it in Discord.`)
          .addFields(fields)
      ]});
      return true;
    }
    case "color": {
      const hex = (args[0] || "").replace("#", "");
      if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
        await safeReply(message, re(`Usage: \`${p}color #rrggbb\`  e.g. \`${p}color #ff6b6b\``));
        return true;
      }
      const int = parseInt(hex, 16);
      const r = (int >> 16) & 0xff;
      const g = (int >> 8) & 0xff;
      const b = int & 0xff;
      await safeReply(message, { embeds: [
        new EmbedBuilder()
          .setColor(int)
          .setTitle(`#${hex.toUpperCase()}`)
          .addFields(
            { name: "Hex", value: `\`#${hex.toUpperCase()}\``, inline: true },
            { name: "RGB", value: `\`rgb(${r}, ${g}, ${b})\``, inline: true },
            { name: "Decimal", value: `${int}`, inline: true },
          )
      ]});
      return true;
    }
    case "firstmsg": {
      const ch = (args[0] ? message.guild!.channels.cache.get(args[0].replace(/[<#>]/g, "")) : message.channel) as TextChannel | undefined;
      if (!ch?.isTextBased()) { await safeReply(message, re("Channel not found.")); return true; }
      const fetched = await (ch as TextChannel).messages.fetch({ limit: 1, after: "0" });
      const first = fetched.first();
      if (!first) { await safeReply(message, re("Couldn't find the first message.")); return true; }
      await safeReply(message, re(`First message in ${ch}: [Jump](${first.url})\nSent by **${first.author.tag}** — <t:${Math.floor(first.createdTimestamp / 1000)}:F>`));
      return true;
    }
    case "search": {
      const query = args.join(" ").toLowerCase();
      if (!query) { await safeReply(message, re(`Usage: \`${p}search <name>\``)); return true; }
      await ensureMembersCache(message.guild!);
      const matches = message.guild!.members.cache
        .filter((m) => m.user.username.toLowerCase().includes(query) || (m.nickname?.toLowerCase().includes(query) ?? false))
        .first(15);
      if (!matches.length) { await safeReply(message, re(`No members found matching \`${query}\`.`)); return true; }
      const lines = matches.map((m) => `${m} \`${m.user.tag}\`${m.nickname ? ` *(${m.nickname})*` : ""}`).join("\n");
      await safeReply(message, { embeds: [
        new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle(`Search: "${query}"`)
          .setDescription(`${matches.length} result${matches.length === 1 ? "" : "s"}\n\n${lines}`)
      ]});
      return true;
    }
    case "afklist": {
      await ensureMembersCache(guild);
      const guildMemberIds = new Set(guild.members.cache.keys());
      const afkInGuild = [...afkUsers.entries()].filter(([id]) => guildMemberIds.has(id));
      if (afkInGuild.length === 0) {
        await safeReply(message, re("Nobody is currently AFK."));
        return true;
      }
      const items = afkInGuild.map(([id, data]) => {
        const m = guild.members.cache.get(id);
        const tag = m ? `${m} \`${m.user.tag}\`` : `<@${id}>`;
        return `${tag} — *${data.reason}* <t:${Math.floor(data.timestamp / 1000)}:R>`;
      });
      await sendPaginated(message, ` AFK Members (${items.length})`, items, { perPage: 15, color: 0x5865f2 });
      return true;
    }
    case "calc": {
      const expr = args.join(" ").trim();
      if (!expr) {
        await safeReply(message, re(`Usage: \`${p}calc <expression>\` — e.g. \`${p}calc (2 + 3) * 4\``));
        return true;
      }
      // Only allow safe math characters
      if (/[^0-9+\-*/().^% \t]/.test(expr)) {
        await safeReply(message, re("Only math characters allowed: `0-9 + - * / ( ) . ^ %`"));
        return true;
      }
      try {
        // Replace ^ with ** for exponentiation
        const sanitized = expr.replace(/\^/g, "**");
        // eslint-disable-next-line no-new-func
        const result = new Function(`"use strict"; return (${sanitized})`)();
        if (typeof result !== "number" || !isFinite(result)) {
          await safeReply(message, re("Result is not a finite number."));
          return true;
        }
        await safeReply(message, { embeds: [
          new EmbedBuilder()
            .setColor(COLORS.primary)
            .setTitle("Calculator")
            .addFields(
              { name: "Expression", value: `${expr}`,       inline: true },
              { name: "Result",     value: `${result}`,     inline: true },
            ),
        ]});
      } catch {
        await safeReply(message, re("Could not evaluate that expression."));
      }
      return true;
    }
    case "weather": {
      const location = args.join(" ").trim();
      if (!location) {
        await safeReply(message, re(`Usage: \`${p}weather <city or location>\``));
        return true;
      }
      try {
        const res = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=j1`);
        if (!res.ok) { await safeReply(message, re("Location not found.")); return true; }
        const data = await res.json() as any;
        const cur = data.current_condition?.[0];
        const area = data.nearest_area?.[0];
        if (!cur) { await safeReply(message, re("No weather data found for that location.")); return true; }
        const city = area?.areaName?.[0]?.value ?? location;
        const country = area?.country?.[0]?.value ?? "";
        const tempC = cur.temp_C;
        const tempF = cur.temp_F;
        const feels = cur.FeelsLikeC;
        const desc = cur.weatherDesc?.[0]?.value ?? "";
        const humidity = cur.humidity;
        const wind = cur.windspeedKmph;
        const visibility = cur.visibility;
        const uvIndex = cur.uvIndex;
        await safeReply(message, { embeds: [
          new EmbedBuilder()
            .setColor(COLORS.primary)
            .setTitle(`Weather — ${city}${country ? `, ${country}` : ""}`)
            .setDescription(`**${desc}**`)
            .addFields(
              { name: "Temperature", value: `${tempC}°C / ${tempF}°F`, inline: true },
              { name: "Feels Like", value: `${feels}°C`, inline: true },
              { name: "Humidity", value: `${humidity}%`, inline: true },
              { name: "Wind", value: `${wind} km/h`, inline: true },
              { name: "Visibility", value: `${visibility} km`, inline: true },
              { name: "UV Index", value: `${uvIndex}`, inline: true },
            )
            .setFooter({ text: "Powered by wttr.in" })
            .setTimestamp()
        ]});
      } catch {
        await safeReply(message, re("Failed to fetch weather data. Try a different location."));
      }
      return true;
    }

    case "define": {
      const word = args.join(" ").trim().toLowerCase();
      if (!word) {
        await safeReply(message, re(`Usage: \`${p}define <word>\``));
        return true;
      }
      try {
        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
        if (!res.ok) { await safeReply(message, re(`No definition found for **${word}**.`)); return true; }
        const data = await res.json() as any[];
        const entry = data[0];
        const meanings = entry.meanings?.slice(0, 2) ?? [];
        const phonetic = entry.phonetic ?? entry.phonetics?.find((p: any) => p.text)?.text ?? "";
        const embed = new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle(`📖 ${entry.word}${phonetic ? ` *${phonetic}*` : ""}`)
          .setURL(`https://www.merriam-webster.com/dictionary/${encodeURIComponent(word)}`);
        for (const meaning of meanings) {
          const defs = meaning.definitions?.slice(0, 2).map((d: any, i: number) =>
            `**${i + 1}.** ${d.definition}${d.example ? `\n*"${d.example}"*` : ""}`
          ).join("\n") ?? "";
          embed.addFields({ name: meaning.partOfSpeech, value: defs.slice(0, 1024) });
          if (meaning.synonyms?.length) {
            embed.addFields({ name: "Synonyms", value: meaning.synonyms.slice(0, 8).join(", "), inline: true });
          }
        }
        await safeReply(message, { embeds: [embed] });
      } catch {
        await safeReply(message, re(`No definition found for **${word}**.`));
      }
      return true;
    }

    case "urban": {
      const query = args.join(" ").trim();
      if (!query) {
        await safeReply(message, re(`Usage: \`${p}urban <word or phrase>\``));
        return true;
      }
      try {
        const res = await fetch(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(query)}`);
        const data = await res.json() as any;
        const entry = data.list?.[0];
        if (!entry) { await safeReply(message, re(`No Urban Dictionary entry found for **${query}**.`)); return true; }
        const def = entry.definition?.replace(/\[|\]/g, "") ?? "";
        const example = entry.example?.replace(/\[|\]/g, "") ?? "";
        await safeReply(message, { embeds: [
          new EmbedBuilder()
            .setColor(COLORS.muted)
            .setTitle(`📚 ${entry.word}`)
            .setURL(entry.permalink)
            .setDescription(def.slice(0, 4096))
            .addFields(
              ...(example ? [{ name: "Example", value: example.slice(0, 1024) }] : []),
              { name: "Rating", value: `👍 ${entry.thumbs_up}  👎 ${entry.thumbs_down}`, inline: true },
              { name: "Author", value: entry.author ?? "Unknown", inline: true },
            )
            .setFooter({ text: "Urban Dictionary" })
            .setTimestamp(entry.written_on ? new Date(entry.written_on) : undefined)
        ]});
      } catch {
        await safeReply(message, re("Failed to fetch from Urban Dictionary."));
      }
      return true;
    }

    case "qrcode":
    case "qr": {
      const content = args.join(" ").trim();
      if (!content) {
        await safeReply(message, re(`Usage: \`${p}qrcode <text or URL>\``));
        return true;
      }
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(content)}`;
      await safeReply(message, { embeds: [
        new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle("QR Code")
          .setDescription(`Scan this code to get: \`${content.slice(0, 200)}\``)
          .setImage(qrUrl)
      ]});
      return true;
    }

    case "shortlink":
    case "shorten": {
      const url = args[0]?.trim();
      if (!url || !url.startsWith("http")) {
        await safeReply(message, re(`Usage: \`${p}shortlink <URL>\``));
        return true;
      }
      try {
        const res = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}`);
        const data = await res.json() as any;
        if (!data.shorturl) { await safeReply(message, re("Failed to shorten that URL.")); return true; }
        await safeReply(message, { embeds: [
          new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle("URL Shortened")
            .addFields(
              { name: "Original", value: url.slice(0, 1024) },
              { name: "Short URL", value: data.shorturl },
            )
        ]});
      } catch {
        await safeReply(message, re("Failed to shorten that URL."));
      }
      return true;
    }

    case "copyembed": {
      const msgId = args[0];
      if (!msgId) {
        await safeReply(message, re(`Usage: \`${p}copyembed <messageId>\` — copies a message's embed as JSON code.`));
        return true;
      }
      try {
        const ch = message.channel as TextChannel;
        const target = await ch.messages.fetch(msgId);
        const embed = target.embeds[0];
        if (!embed) { await safeReply(message, re("That message has no embed.")); return true; }
        const json = JSON.stringify(embed.toJSON(), null, 2);
        if (json.length > 1900) {
          const { AttachmentBuilder } = await import("discord.js");
          const buf = Buffer.from(json);
          await safeReply(message, { files: [new AttachmentBuilder(buf, { name: "embed.json" })] });
        } else {
          await safeReply(message, re(`\`\`\`json\n${json}\n\`\`\``));
        }
      } catch {
        await safeReply(message, re("Couldn't fetch that message."));
      }
      return true;
    }

    case "imagesnipe": {
      const cache = snipeCache.get(message.channel.id) ?? [];
      const imageSnipe = cache.find(s => s.attachments.some(a => /\.(jpg|jpeg|png|gif|webp)/i.test(a)));
      if (!imageSnipe) {
        await safeReply(message, re("No deleted images found in this channel."));
        return true;
      }
      const imgUrl = imageSnipe.attachments.find(a => /\.(jpg|jpeg|png|gif|webp)/i.test(a))!;
      await safeReply(message, { embeds: [
        new EmbedBuilder()
          .setColor(COLORS.error)
          .setAuthor({ name: imageSnipe.authorTag, iconURL: imageSnipe.authorAvatar ?? undefined })
          .setImage(imgUrl)
          .setFooter({ text: `Deleted image · ${new Date(imageSnipe.timestamp).toLocaleString()}` })
      ]});
      return true;
    }

    case "videosnipe": {
      const cache = snipeCache.get(message.channel.id) ?? [];
      const videoSnipe = cache.find(s => s.attachments.some(a => /\.(mp4|webm|mov|avi)/i.test(a)));
      if (!videoSnipe) {
        await safeReply(message, re("No deleted videos found in this channel."));
        return true;
      }
      const vidUrl = videoSnipe.attachments.find(a => /\.(mp4|webm|mov|avi)/i.test(a))!;
      await safeReply(message, { embeds: [
        new EmbedBuilder()
          .setColor(COLORS.error)
          .setAuthor({ name: videoSnipe.authorTag, iconURL: videoSnipe.authorAvatar ?? undefined })
          .setDescription(`[Click to view video](${vidUrl})`)
          .setFooter({ text: `Deleted video · ${new Date(videoSnipe.timestamp).toLocaleString()}` })
      ]});
      return true;
    }

    case "remindme": {
      const timeStr = args[0];
      const text = args.slice(1).join(" ");
      if (!timeStr || !text) {
        await safeReply(message, re(`Usage: \`${p}remindme <time> <message>\` — e.g. \`${p}remindme 1h check the oven\``));
        return true;
      }
      const match = timeStr.match(/^(\d+)(s|m|h|d)$/i);
      if (!match) {
        await safeReply(message, re("Time format: `30s`, `10m`, `2h`, `1d`"));
        return true;
      }
      const amount = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      const ms = unit === "s" ? amount * 1000 : unit === "m" ? amount * 60_000 : unit === "h" ? amount * 3_600_000 : amount * 86_400_000;
      const endsAt = Math.floor((Date.now() + ms) / 1000);
      await safeReply(message, re(`Got it! I'll DM you <t:${endsAt}:R>.`));
      setTimeout(async () => {
        try {
          await message.author.send({
            embeds: [
              new EmbedBuilder()
                .setColor(COLORS.primary)
                .setTitle("Reminder")
                .setDescription(text)
                .setFooter({ text: `Set in ${guild.name}` })
                .setTimestamp(),
            ],
          });
        } catch {
          await message.channel.send({
            content: `${message.author}`,
            ...re(` **(DMs closed)** Reminder: ${text}`),
          }).catch(() => {});
        }
      }, ms);
      return true;
    }

    default:
      return false;
  }
}

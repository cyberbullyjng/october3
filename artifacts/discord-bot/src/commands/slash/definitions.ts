import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

export const MOD_SLASH_COMMANDS = [
  new SlashCommandBuilder().setName("warn").setDescription("Warn a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("user").setDescription("Member to warn").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason for the warning").setRequired(true)),

  new SlashCommandBuilder().setName("warnings").setDescription("View all warnings for a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("user").setDescription("Member to check").setRequired(true)),

  new SlashCommandBuilder().setName("clearwarns").setDescription("Clear all warnings for a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("user").setDescription("Member to clear").setRequired(true)),

  new SlashCommandBuilder().setName("mute").setDescription("Timeout a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("user").setDescription("Member to mute").setRequired(true))
    .addStringOption(o => o.setName("duration").setDescription("Duration e.g. 10m, 2h, 1d (max 28d)").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason")),

  new SlashCommandBuilder().setName("timeout").setDescription("Timeout a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("user").setDescription("Member to timeout").setRequired(true))
    .addStringOption(o => o.setName("duration").setDescription("Duration e.g. 10m, 2h, 1d (max 28d)").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason")),

  new SlashCommandBuilder().setName("unmute").setDescription("Remove timeout from a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("user").setDescription("Member to unmute").setRequired(true)),

  new SlashCommandBuilder().setName("untimeout").setDescription("Remove timeout from a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("user").setDescription("Member to remove timeout from").setRequired(true)),

  new SlashCommandBuilder().setName("kick").setDescription("Kick a member from the server")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o => o.setName("user").setDescription("Member to kick").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason")),

  new SlashCommandBuilder().setName("ban").setDescription("Ban a member from the server")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName("user").setDescription("Member to ban").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason"))
    .addIntegerOption(o => o.setName("days").setDescription("Days of messages to delete (0-7)").setMinValue(0).setMaxValue(7)),

  new SlashCommandBuilder().setName("unban").setDescription("Unban a user by their ID")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(o => o.setName("user_id").setDescription("User ID to unban").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason")),

  new SlashCommandBuilder().setName("softban").setDescription("Softban a member (ban + instant unban, wipes 7d of messages)")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName("user").setDescription("Member to softban").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason")),

  new SlashCommandBuilder().setName("hardban").setDescription("Permanently ban a member — blocks /unban")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName("user").setDescription("Member to hardban").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason")),

  new SlashCommandBuilder().setName("jail").setDescription("Jail a member, stripping all roles")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o => o.setName("user").setDescription("Member to jail").setRequired(true))
    .addStringOption(o => o.setName("duration").setDescription("Auto-release after this time (e.g. 1h, 2d)"))
    .addStringOption(o => o.setName("reason").setDescription("Reason")),

  new SlashCommandBuilder().setName("unjail").setDescription("Release a member from jail")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o => o.setName("user").setDescription("Member to unjail").setRequired(true)),

  new SlashCommandBuilder().setName("jailsetup").setDescription("Create or repair the Jailed role and jail channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder().setName("history").setDescription("View a member's full moderation history")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("user").setDescription("Member to look up").setRequired(true)),

  new SlashCommandBuilder().setName("modstats").setDescription("View mod action stats for a moderator")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("user").setDescription("Moderator to check (defaults to you)")),

  new SlashCommandBuilder().setName("warnlb").setDescription("Leaderboard of most warned members")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder().setName("mutelist").setDescription("List all currently timed-out members")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder().setName("banlist").setDescription("List all banned members")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  new SlashCommandBuilder().setName("note").setDescription("Add a mod note to a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("user").setDescription("Member to note").setRequired(true))
    .addStringOption(o => o.setName("text").setDescription("Note content").setRequired(true)),

  new SlashCommandBuilder().setName("notes").setDescription("View mod notes for a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("user").setDescription("Member to check").setRequired(true)),

  new SlashCommandBuilder().setName("lock").setDescription("Lock the current channel — only staff can send messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder().setName("unlock").setDescription("Unlock the current channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder().setName("lockdown").setDescription("Lock ALL text channels in the server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder().setName("unlockdown").setDescription("Unlock ALL text channels (lift server lockdown)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder().setName("stripstaff").setDescription("Strip all roles from a member and save them for restoration")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName("user").setDescription("Member to strip").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason")),

  new SlashCommandBuilder().setName("restorestaff").setDescription("Restore previously stripped roles to a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName("user").setDescription("Member to restore").setRequired(true)),

  new SlashCommandBuilder().setName("purge").setDescription("Bulk-delete recent messages in this channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName("count").setDescription("Number of messages to delete (1-100)").setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption(o => o.setName("user").setDescription("Only delete messages from this user")),

  new SlashCommandBuilder().setName("clear").setDescription("Delete a specific user's recent messages in this channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption(o => o.setName("user").setDescription("Member whose messages to delete").setRequired(true))
    .addIntegerOption(o => o.setName("count").setDescription("Number of messages to search (1-100)").setMinValue(1).setMaxValue(100)),

  new SlashCommandBuilder().setName("cleanup").setDescription("Delete recent bot messages in this channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName("count").setDescription("Number of messages to search (default 50)").setMinValue(1).setMaxValue(100)),

  new SlashCommandBuilder().setName("nuke").setDescription("Delete and recreate this channel, wiping all messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  // ── Security / Access ─────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("grantaccess").setDescription("Grant a user full bot access (owner only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName("user").setDescription("User to grant access to").setRequired(true)),

  new SlashCommandBuilder().setName("revokeaccess").setDescription("Revoke a user's bot access (owner only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName("user").setDescription("User to revoke").setRequired(true)),

  new SlashCommandBuilder().setName("listaccess").setDescription("List all users with granted bot access (owner only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // ── Raid Protection ───────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("raidprotect").setDescription("Configure join-surge raid protection")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName("on").setDescription("Enable raid protection"))
    .addSubcommand(s => s.setName("off").setDescription("Disable raid protection"))
    .addSubcommand(s => s.setName("status").setDescription("Show current raid protection settings"))
    .addSubcommand(s => s.setName("clear").setDescription("Manually clear active raid mode"))
    .addSubcommand(s => s.setName("threshold").setDescription("Set how many joins trigger raid mode")
      .addIntegerOption(o => o.setName("count").setDescription("Number of joins").setRequired(true).setMinValue(2)))
    .addSubcommand(s => s.setName("window").setDescription("Set the detection time window")
      .addIntegerOption(o => o.setName("seconds").setDescription("Window in seconds").setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName("action").setDescription("Set what happens to detected raiders")
      .addStringOption(o => o.setName("type").setDescription("Action type").setRequired(true)
        .addChoices(
          { name: "Kick",    value: "kick" },
          { name: "Jail",    value: "jail" },
          { name: "Ban",     value: "ban" },
          { name: "Timeout", value: "timeout" },
        ))),

  new SlashCommandBuilder().setName("banraiders").setDescription("Ban all members who joined within the current raid window")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addBooleanOption(o => o.setName("confirm").setDescription("Set to True to confirm the mass ban").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason for the ban")),

  // ── Age Gate ──────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("agegate").setDescription("Configure the account age gate")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName("on").setDescription("Enable — new accounts below the age threshold are kicked"))
    .addSubcommand(s => s.setName("off").setDescription("Disable the age gate"))
    .addSubcommand(s => s.setName("status").setDescription("Show current age gate settings"))
    .addSubcommand(s => s.setName("days").setDescription("Set minimum account age in days")
      .addIntegerOption(o => o.setName("count").setDescription("Minimum days").setRequired(true).setMinValue(1))),

  // ── Server Lock ───────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("lockserver").setDescription("Raise verification to max (phone-verified only) and save previous level")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder().setName("unlockserver").setDescription("Restore the verification level saved by /lockserver")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // ── Antinuke ──────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("antinuke").setDescription("Configure real-time antinuke protection")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName("on").setDescription("Enable antinuke"))
    .addSubcommand(s => s.setName("off").setDescription("Disable antinuke"))
    .addSubcommand(s => s.setName("status").setDescription("Show current antinuke settings and thresholds"))
    .addSubcommand(s => s.setName("bans").setDescription("Set ban threshold (bans within 5s that trigger antinuke)")
      .addIntegerOption(o => o.setName("count").setDescription("Threshold count").setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName("kicks").setDescription("Set kick threshold")
      .addIntegerOption(o => o.setName("count").setDescription("Threshold count").setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName("channels").setDescription("Set channel-delete threshold")
      .addIntegerOption(o => o.setName("count").setDescription("Threshold count").setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName("roles").setDescription("Set role-delete threshold")
      .addIntegerOption(o => o.setName("count").setDescription("Threshold count").setRequired(true).setMinValue(1))),

  new SlashCommandBuilder().setName("whitelist").setDescription("Manage the antinuke whitelist")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName("add").setDescription("Add a user to the antinuke whitelist")
      .addUserOption(o => o.setName("user").setDescription("User to whitelist").setRequired(true)))
    .addSubcommand(s => s.setName("remove").setDescription("Remove a user from the whitelist")
      .addUserOption(o => o.setName("user").setDescription("User to remove").setRequired(true)))
    .addSubcommand(s => s.setName("list").setDescription("Show all whitelisted users")),

  new SlashCommandBuilder().setName("antinukeadmin").setDescription("Manage antinuke admin privileges")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName("grant").setDescription("Grant antinuke admin to a user")
      .addUserOption(o => o.setName("user").setDescription("User to grant").setRequired(true)))
    .addSubcommand(s => s.setName("revoke").setDescription("Revoke antinuke admin from a user")
      .addUserOption(o => o.setName("user").setDescription("User to revoke").setRequired(true)))
    .addSubcommand(s => s.setName("list").setDescription("List all antinuke admins")),

  new SlashCommandBuilder().setName("permguard").setDescription("Auto-strip dangerous roles from non-whitelisted members")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName("on").setDescription("Enable permission guard"))
    .addSubcommand(s => s.setName("off").setDescription("Disable permission guard"))
    .addSubcommand(s => s.setName("status").setDescription("Show current permission guard status")),

  new SlashCommandBuilder().setName("permguardwhitelist").setDescription("Manage the permguard whitelist (who can hold admin roles)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName("add").setDescription("Allow a user to hold admin roles without being stripped")
      .addUserOption(o => o.setName("user").setDescription("User to add").setRequired(true)))
    .addSubcommand(s => s.setName("remove").setDescription("Remove a user from the permguard whitelist")
      .addUserOption(o => o.setName("user").setDescription("User to remove").setRequired(true)))
    .addSubcommand(s => s.setName("list").setDescription("Show all users on the permguard whitelist")),

  // ── Anti-Spam ─────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("antispam").setDescription("Configure the anti-spam system")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName("enable").setDescription("Enable anti-spam"))
    .addSubcommand(s => s.setName("disable").setDescription("Disable anti-spam"))
    .addSubcommand(s => s.setName("status").setDescription("Show current anti-spam settings"))
    .addSubcommand(s => s.setName("threshold").setDescription("Set how many messages trigger a timeout")
      .addIntegerOption(o => o.setName("count").setDescription("Message count").setRequired(true).setMinValue(2)))
    .addSubcommand(s => s.setName("window").setDescription("Set the spam detection window")
      .addIntegerOption(o => o.setName("seconds").setDescription("Window in seconds").setRequired(true).setMinValue(1))),

  new SlashCommandBuilder().setName("spambypass").setDescription("Manage anti-spam bypass list")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName("add").setDescription("Exempt a user from anti-spam detection")
      .addUserOption(o => o.setName("user").setDescription("User to exempt").setRequired(true)))
    .addSubcommand(s => s.setName("remove").setDescription("Remove a user's spam bypass")
      .addUserOption(o => o.setName("user").setDescription("User to remove").setRequired(true)))
    .addSubcommand(s => s.setName("list").setDescription("List all spam bypass users")),

  // ── Word Filter ───────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("filter").setDescription("Manage the custom word filter")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName("add").setDescription("Add a word to the filter")
      .addStringOption(o => o.setName("word").setDescription("Word to block").setRequired(true)))
    .addSubcommand(s => s.setName("remove").setDescription("Remove a word from the filter")
      .addStringOption(o => o.setName("word").setDescription("Word to unblock").setRequired(true)))
    .addSubcommand(s => s.setName("list").setDescription("Show all filtered words")),

  new SlashCommandBuilder().setName("filterbypass").setDescription("Manage word filter bypasses")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName("add").setDescription("Give a user full filter immunity")
      .addUserOption(o => o.setName("user").setDescription("User to bypass").setRequired(true)))
    .addSubcommand(s => s.setName("remove").setDescription("Remove a user's filter bypass")
      .addUserOption(o => o.setName("user").setDescription("User to remove").setRequired(true)))
    .addSubcommand(s => s.setName("list").setDescription("List all users with filter bypasses")),

  // ── Anti-Invite / Link Filter ──────────────────────────────────────────────
  new SlashCommandBuilder().setName("antiinvite").setDescription("Toggle automatic deletion of Discord invite links")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName("on").setDescription("Enable invite link filter"))
    .addSubcommand(s => s.setName("off").setDescription("Disable invite link filter"))
    .addSubcommand(s => s.setName("status").setDescription("Show current invite filter state")),

  new SlashCommandBuilder().setName("linkbypass").setDescription("Manage link filter bypasses")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName("add").setDescription("Allow a user to post links freely")
      .addUserOption(o => o.setName("user").setDescription("User to bypass").setRequired(true)))
    .addSubcommand(s => s.setName("remove").setDescription("Remove a user's link bypass")
      .addUserOption(o => o.setName("user").setDescription("User to remove").setRequired(true)))
    .addSubcommand(s => s.setName("list").setDescription("List all users with link bypasses")),

  // ── Blacklists ────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("imageban").setDescription("Manage image/video posting bans")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName("add").setDescription("Ban a member from posting images or videos")
      .addUserOption(o => o.setName("user").setDescription("Member to ban").setRequired(true)))
    .addSubcommand(s => s.setName("remove").setDescription("Remove a member's image ban")
      .addUserOption(o => o.setName("user").setDescription("Member to unban").setRequired(true)))
    .addSubcommand(s => s.setName("list").setDescription("List all image-banned members")),

  new SlashCommandBuilder().setName("streamban").setDescription("Manage stream/camera bans in voice channels")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName("add").setDescription("Ban a member from going live or using camera")
      .addUserOption(o => o.setName("user").setDescription("Member to ban").setRequired(true)))
    .addSubcommand(s => s.setName("remove").setDescription("Remove a member's stream ban")
      .addUserOption(o => o.setName("user").setDescription("Member to unban").setRequired(true)))
    .addSubcommand(s => s.setName("list").setDescription("List all stream-banned members")),

  new SlashCommandBuilder().setName("hardbans").setDescription("List all hard-banned users in this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  new SlashCommandBuilder().setName("sblacklist").setDescription("Manage the staff blacklist")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName("setrole").setDescription("Set the role assigned to all blacklisted members")
      .addRoleOption(o => o.setName("role").setDescription("Blacklist indicator role").setRequired(true)))
    .addSubcommand(s => s.setName("add").setDescription("Blacklist a member — strips elevated roles and assigns the blacklist role")
      .addUserOption(o => o.setName("user").setDescription("Member to blacklist").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Reason for blacklisting")))
    .addSubcommand(s => s.setName("remove").setDescription("Remove a member from the blacklist")
      .addUserOption(o => o.setName("user").setDescription("Member to unblacklist").setRequired(true)))
    .addSubcommand(s => s.setName("check").setDescription("View full blacklist details for a member")
      .addUserOption(o => o.setName("user").setDescription("Member to check").setRequired(true)))
    .addSubcommand(s => s.setName("list").setDescription("Show all currently blacklisted members")),

  // ── Enable / Disable Commands ─────────────────────────────────────────────
  new SlashCommandBuilder().setName("disablecommand").setDescription("Disable or re-enable a command globally or in a channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName("disable").setDescription("Disable a command globally or in a specific channel")
      .addStringOption(o => o.setName("command").setDescription("Command name to disable").setRequired(true))
      .addChannelOption(o => o.setName("channel").setDescription("Limit to this channel (omit for global)")))
    .addSubcommand(s => s.setName("enable").setDescription("Re-enable a previously disabled command")
      .addStringOption(o => o.setName("command").setDescription("Command name to re-enable").setRequired(true))
      .addChannelOption(o => o.setName("channel").setDescription("Channel scope (omit for global)")))
    .addSubcommand(s => s.setName("list").setDescription("Show all currently disabled commands")),

  // ── Strip / Unstrip ───────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("strip").setDescription("Remove all non-managed roles from a member and save them")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o => o.setName("user").setDescription("Member to strip").setRequired(true)),

  new SlashCommandBuilder().setName("unstrip").setDescription("Restore the roles saved by /strip back to a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o => o.setName("user").setDescription("Member to restore").setRequired(true)),

  // ── Avatar ────────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("avatar").setDescription("Show a user's full-size avatar")
    .addUserOption(o => o.setName("user").setDescription("User to look up (defaults to you)")),

  // ── /help ─────────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("help").setDescription("Browse all bot commands by category")
    .addStringOption(o => o.setName("category").setDescription("Jump straight to a category")
      .addChoices(
        { name: " Moderation",    value: "mod" },
        { name: " Management",    value: "manage" },
        { name: " Security",      value: "security" },
        { name: " Utility",       value: "util" },
        { name: " Booster Roles", value: "booster" },
        { name: " Blacklists",    value: "sblacklist" },
        { name: " Engagement",    value: "engage" },
        { name: " Fun",           value: "fun" },
        { name: " VoiceMaster",  value: "vc" },
        { name: " Tools",         value: "tools" },
        { name: " Autostaff",     value: "autostaff" },
      )),

  // ── /say ──────────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("say").setDescription("Send a message to a channel as the bot")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o => o.setName("channel").setDescription("Channel to send to").setRequired(true))
    .addStringOption(o => o.setName("message").setDescription("Message to send").setRequired(true)),

  // ── Owner Commands ─────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("setstatus").setDescription("Set the bot's activity status (owner only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName("type").setDescription("Activity type").setRequired(true)
      .addChoices(
        { name: "Playing",    value: "playing" },
        { name: "Watching",   value: "watching" },
        { name: "Listening",  value: "listening" },
        { name: "Competing",  value: "competing" },
        { name: "Streaming",  value: "streaming" },
        { name: "Clear",      value: "clear" },
      ))
    .addStringOption(o => o.setName("text").setDescription("Status text (not needed for 'clear')")),

  new SlashCommandBuilder().setName("maintenance").setDescription("Toggle bot maintenance mode (owner only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName("on").setDescription("Enable maintenance mode — only owner can use the bot"))
    .addSubcommand(s => s.setName("off").setDescription("Disable maintenance mode"))
    .addSubcommand(s => s.setName("status").setDescription("Check current maintenance state")),

  // ── /pingonjoin ────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("pingonjoin").setDescription("Ping new members in one or more channels (message auto-deletes)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName("add").setDescription("Add a channel to the ping-on-join list")
      .addChannelOption(o => o.setName("channel").setDescription("Channel to ping in").setRequired(true)))
    .addSubcommand(s => s.setName("remove").setDescription("Remove a channel from the ping-on-join list")
      .addChannelOption(o => o.setName("channel").setDescription("Channel to remove").setRequired(true)))
    .addSubcommand(s => s.setName("list").setDescription("List all configured ping-on-join channels"))
    .addSubcommand(s => s.setName("off").setDescription("Disable ping-on-join and clear all channels")),

  // ── /prefix ────────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("prefix").setDescription("Change the bot's command prefix for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName("new").setDescription("New prefix (max 5 characters)").setRequired(true)),

  new SlashCommandBuilder().setName("owner").setDescription("Owner-only bot control commands")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName("rename").setDescription("Change the bot's username globally")
      .addStringOption(o => o.setName("name").setDescription("New username").setRequired(true)))
    .addSubcommand(s => s.setName("avatar").setDescription("Change the bot's avatar")
      .addStringOption(o => o.setName("url").setDescription("Direct image URL").setRequired(true)))
    .addSubcommand(s => s.setName("stats").setDescription("Show bot health: uptime, ping, RAM, server count"))
    .addSubcommand(s => s.setName("invite").setDescription("Generate an OAuth2 invite link for the bot"))
    .addSubcommand(s => s.setName("eval").setDescription("Execute arbitrary JavaScript in the bot runtime")
      .addStringOption(o => o.setName("code").setDescription("Code to evaluate").setRequired(true)))
    .addSubcommand(s => s.setName("save").setDescription("Manually save all guild state to disk"))
    .addSubcommand(s => s.setName("reload").setDescription("Reload state from disk without restarting"))
    .addSubcommand(s => s.setName("shutdown").setDescription("Gracefully shut down the bot process")),

  new SlashCommandBuilder().setName("guildmgr").setDescription("Owner-only multi-server management")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName("servers").setDescription("List all servers the bot is currently in"))
    .addSubcommand(s => s.setName("leave").setDescription("Force the bot to leave a server by guild ID")
      .addStringOption(o => o.setName("guild_id").setDescription("Guild ID to leave").setRequired(true)))
    .addSubcommand(s => s.setName("broadcast").setDescription("Send a message to every server's system channel")
      .addStringOption(o => o.setName("message").setDescription("Message to broadcast").setRequired(true)))
    .addSubcommand(s => s.setName("spyguild").setDescription("Show detailed info about a server the bot is in")
      .addStringOption(o => o.setName("guild_id").setDescription("Guild ID to inspect").setRequired(true)))
    .addSubcommand(s => s.setName("resetguild").setDescription("Wipe all bot data for this server (irreversible)")),

  new SlashCommandBuilder().setName("serverblacklist").setDescription("Owner-only server blacklist management")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName("add").setDescription("Blacklist a server — the bot ignores all commands there")
      .addStringOption(o => o.setName("guild_id").setDescription("Guild ID to blacklist").setRequired(true)))
    .addSubcommand(s => s.setName("remove").setDescription("Remove a server from the blacklist")
      .addStringOption(o => o.setName("guild_id").setDescription("Guild ID to unblacklist").setRequired(true)))
    .addSubcommand(s => s.setName("list").setDescription("List all currently blacklisted servers")),

  new SlashCommandBuilder().setName("globalban").setDescription("Owner-only global bot ban management")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName("add").setDescription("Globally ban a user from using the bot")
      .addStringOption(o => o.setName("user_id").setDescription("User ID to ban").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Reason for the ban")))
    .addSubcommand(s => s.setName("remove").setDescription("Remove a global ban from a user")
      .addStringOption(o => o.setName("user_id").setDescription("User ID to unban").setRequired(true)))
    .addSubcommand(s => s.setName("list").setDescription("List all globally banned users"))
    .addSubcommand(s => s.setName("clear").setDescription("Clear all global bans at once")),

  new SlashCommandBuilder().setName("dmall").setDescription("Send a DM to every member in this server (owner only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName("message").setDescription("Message to send to all members").setRequired(true)),

  // ── /antieveryoneping ──────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("antieveryoneping").setDescription("Configure @everyone ping raid protection (3 pings/10s limit)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName("action").setDescription("Enable, disable, or set the punishment action").setRequired(true)
      .addChoices(
        { name: "Enable", value: "on" },
        { name: "Disable", value: "off" },
        { name: "Status", value: "status" },
        { name: "Action: Delete only", value: "action_delete" },
        { name: "Action: Delete + Mute 10min", value: "action_mute" },
        { name: "Action: Delete + Ban", value: "action_ban" },
      )),

  // ── /stripall ──────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("stripall").setDescription("Strip all permissions from every non-managed role (saves a backup for restore)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder().setName("restoreperms").setDescription("Restore all role permissions from the last !stripall backup")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // ── /forcenick ─────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("forcenick").setDescription("Force a member's nickname and lock it so they can't change it")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .addUserOption(o => o.setName("user").setDescription("Member to force a nickname on").setRequired(true))
    .addStringOption(o => o.setName("nickname").setDescription("Nickname to lock them to (max 32 chars)").setRequired(true)),

  new SlashCommandBuilder().setName("unforcenick").setDescription("Remove a forced nickname from a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .addUserOption(o => o.setName("user").setDescription("Member to release").setRequired(true)),

  new SlashCommandBuilder().setName("forcenicks").setDescription("List all members with forced nicknames")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),

  // ── /massrole ──────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("massrole").setDescription("Add or remove a role from all members (or members with a specific role)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption(o => o.setName("action").setDescription("Add or remove the role").setRequired(true)
      .addChoices({ name: "Add", value: "add" }, { name: "Remove", value: "remove" }))
    .addRoleOption(o => o.setName("role").setDescription("Role to add/remove").setRequired(true))
    .addRoleOption(o => o.setName("filter").setDescription("Only affect members who already have this role (optional)")),

  // ── /temprole ──────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("temprole").setDescription("Give a member a role temporarily")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o => o.setName("user").setDescription("Member to give the role to").setRequired(true))
    .addRoleOption(o => o.setName("role").setDescription("Role to assign").setRequired(true))
    .addStringOption(o => o.setName("duration").setDescription("Duration e.g. 10m, 2h, 1d").setRequired(true)),

  // ── /vc ────────────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("vc").setDescription("Manage your VoiceMaster voice channel")
    .addSubcommand(s => s.setName("lock").setDescription("Lock your VC — prevent others from joining"))
    .addSubcommand(s => s.setName("unlock").setDescription("Unlock your VC — allow everyone to join"))
    .addSubcommand(s => s.setName("hide").setDescription("Hide your VC from the channel list"))
    .addSubcommand(s => s.setName("unhide").setDescription("Make your VC visible again"))
    .addSubcommand(s => s.setName("rename").setDescription("Rename your VC")
      .addStringOption(o => o.setName("name").setDescription("New channel name").setRequired(true)))
    .addSubcommand(s => s.setName("limit").setDescription("Set the user limit for your VC")
      .addIntegerOption(o => o.setName("limit").setDescription("Max users (0 = unlimited)").setRequired(true).setMinValue(0).setMaxValue(99)))
    .addSubcommand(s => s.setName("kick").setDescription("Kick a member from your VC")
      .addUserOption(o => o.setName("user").setDescription("Member to kick").setRequired(true)))
    .addSubcommand(s => s.setName("allow").setDescription("Allow a specific user to join your locked VC")
      .addUserOption(o => o.setName("user").setDescription("Member to allow").setRequired(true)))
    .addSubcommand(s => s.setName("reject").setDescription("Deny a specific user from joining your VC")
      .addUserOption(o => o.setName("user").setDescription("Member to reject").setRequired(true)))
    .addSubcommand(s => s.setName("claim").setDescription("Claim ownership of an ownerless VC"))
    .addSubcommand(s => s.setName("info").setDescription("Show info about your current VC")),

  // ── /moveall ───────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("moveall").setDescription("Move all members from one voice channel to another")
    .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
    .addChannelOption(o => o.setName("from").setDescription("Source voice channel").setRequired(true))
    .addChannelOption(o => o.setName("to").setDescription("Destination voice channel").setRequired(true)),

  // ── /vclock ────────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("vclock").setDescription("Lock or unlock a voice channel (staff)")
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
    .addStringOption(o => o.setName("action").setDescription("Lock or unlock").setRequired(true)
      .addChoices({ name: "Lock", value: "lock" }, { name: "Unlock", value: "unlock" }))
    .addChannelOption(o => o.setName("channel").setDescription("Voice channel (defaults to your current VC)")),

  // ── /timezone ──────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("timezone").setDescription("Set or view a user's timezone")
    .addSubcommand(s => s.setName("set").setDescription("Set your timezone by city or country")
      .addStringOption(o => o.setName("location").setDescription("City or country name (e.g. London, New York, Japan)").setRequired(true)))
    .addSubcommand(s => s.setName("view").setDescription("View the current time for yourself or another user")
      .addUserOption(o => o.setName("user").setDescription("User to check (defaults to yourself)")))
    .addSubcommand(s => s.setName("clear").setDescription("Remove your saved timezone")),

  // ── /tz (alias for /timezone) ──────────────────────────────────────────────
  new SlashCommandBuilder().setName("tz").setDescription("Set or view a user's timezone (alias for /timezone)")
    .addSubcommand(s => s.setName("set").setDescription("Set your timezone by city or country")
      .addStringOption(o => o.setName("location").setDescription("City or country name (e.g. London, New York, Japan)").setRequired(true)))
    .addSubcommand(s => s.setName("view").setDescription("View the current time for yourself or another user")
      .addUserOption(o => o.setName("user").setDescription("User to check (defaults to yourself)")))
    .addSubcommand(s => s.setName("clear").setDescription("Remove your saved timezone")),

  // ── /striphumans ───────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("striphumans")
    .setDescription("Strip moderation-permission roles from all human members below the bot. Requires confirmation.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // ── /repping ───────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("repping")
    .setDescription("Show all members currently repping"),

  // ── /togglerep ─────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("togglerep")
    .setDescription("Enable or disable the rep role system")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

].map(cmd => cmd.toJSON());

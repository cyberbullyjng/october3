import {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  Message,
  ChatInputCommandInteraction,
} from "discord.js";
import type { PageSession } from "./types.js";
import { pendingConfirms, paginatedSessions } from "./state.js";
import { safeReply } from "./utils.js";

export async function sendConfirm(
  message: Message,
  prompt: string,
  onConfirm: () => Promise<void>,
  color = 0xfee75c,
): Promise<void> {
  const key = Math.random().toString(36).slice(2, 9);
  pendingConfirms.set(key, { authorId: message.author.id, action: onConfirm, expiresAt: Date.now() + 60_000 });
  setTimeout(() => pendingConfirms.delete(key), 60_000);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`oct:confirm:${key}`).setLabel("Confirm").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`oct:cancel:${key}`).setLabel("Cancel").setStyle(ButtonStyle.Secondary),
  );
  await safeReply(message, {
    embeds: [new EmbedBuilder().setColor(color).setTitle("Confirmation Required").setDescription(prompt.trimStart())],
    components: [row],
  });
}

export function buildPageEmbed(session: PageSession): EmbedBuilder {
  if (session.style === "audit") {
    const content = session.pages[session.current];
    const pageStr = session.pages.length > 1 ? `\n\nPage ${session.current + 1}/${session.pages.length}` : "";
    const header = session.header ? `${session.header}\n\n` : "";
    return new EmbedBuilder()
      .setColor(session.color)
      .setTitle(session.title)
      .setDescription(`${header}${content}${pageStr}`);
  }
  const pageStr = session.pages.length > 1 ? `Page ${session.current + 1} of ${session.pages.length}` : "";
  const footerText = [pageStr, session.footer].filter(Boolean).join(" · ");
  const embed = new EmbedBuilder().setColor(session.color).setTitle(session.title.trim()).setTimestamp();
  if (footerText) embed.setFooter({ text: footerText });
  const content = session.pages[session.current];
  if (session.header) {
    embed.setDescription(`${session.header}\n\n${content}`);
  } else {
    embed.setDescription(content);
  }
  return embed;
}

export function buildPageRow(key: string, session: PageSession): ActionRowBuilder<ButtonBuilder> {
  const atFirst = session.current === 0;
  const atLast  = session.current === session.pages.length - 1;
  if (session.style === "audit") {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`oct:page:${key}:prev`).setEmoji("◀").setStyle(ButtonStyle.Primary).setDisabled(atFirst),
      new ButtonBuilder().setCustomId(`oct:page:${key}:next`).setEmoji("▶").setStyle(ButtonStyle.Primary).setDisabled(atLast),
      new ButtonBuilder().setCustomId(`oct:page:${key}:close`).setEmoji("✖").setStyle(ButtonStyle.Danger),
    );
  }
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`oct:page:${key}:first`).setLabel("First").setStyle(ButtonStyle.Secondary).setDisabled(atFirst),
    new ButtonBuilder().setCustomId(`oct:page:${key}:prev`).setLabel("Prev").setStyle(ButtonStyle.Secondary).setDisabled(atFirst),
    new ButtonBuilder().setCustomId(`oct:page:${key}:next`).setLabel("Next").setStyle(ButtonStyle.Secondary).setDisabled(atLast),
    new ButtonBuilder().setCustomId(`oct:page:${key}:last`).setLabel("Last").setStyle(ButtonStyle.Secondary).setDisabled(atLast),
  );
}

export async function sendPaginated(
  message: Message,
  title: string,
  items: string[],
  options: { perPage?: number; color?: number; header?: string; footer?: string; style?: "audit" } = {},
): Promise<void> {
  const perPage = options.perPage ?? 20;
  const color   = options.color ?? 0x5865f2;
  const { header, footer, style } = options;
  const pages: string[] = [];
  for (let i = 0; i < items.length; i += perPage) {
    pages.push(items.slice(i, i + perPage).join("\n"));
  }
  if (pages.length === 0) return;
  if (pages.length === 1) {
    if (style === "audit") {
      const desc = header ? `${header}\n\n${pages[0]}` : pages[0];
      await safeReply(message, { embeds: [new EmbedBuilder().setColor(color).setTitle(title).setDescription(desc)] });
      return;
    }
    const desc = header ? `${header}\n\n${pages[0]}` : pages[0];
    const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(desc);
    if (footer) embed.setFooter({ text: footer });
    await safeReply(message, { embeds: [embed] });
    return;
  }
  const key = Math.random().toString(36).slice(2, 9);
  const session: PageSession = { authorId: message.author.id, pages, current: 0, title, color, header, footer, style, expiresAt: Date.now() + 5 * 60_000 };
  paginatedSessions.set(key, session);
  setTimeout(() => paginatedSessions.delete(key), 5 * 60_000);
  await safeReply(message, { embeds: [buildPageEmbed(session)], components: [buildPageRow(key, session)] });
}

export async function sendPaginatedI(
  interaction: ChatInputCommandInteraction,
  title: string,
  items: string[],
  options: { perPage?: number; color?: number; header?: string; footer?: string } = {},
): Promise<void> {
  const perPage = options.perPage ?? 20;
  const color   = options.color ?? 0x5865f2;
  const { header, footer } = options;
  const pages: string[] = [];
  for (let i = 0; i < items.length; i += perPage) {
    pages.push(items.slice(i, i + perPage).join("\n"));
  }
  if (pages.length === 0) { await interaction.editReply({ content: "No results." }); return; }
  if (pages.length === 1) {
    const desc = header ? `${header}\n\n${pages[0]}` : pages[0];
    const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(desc);
    if (footer) embed.setFooter({ text: footer });
    await interaction.editReply({ embeds: [embed] });
    return;
  }
  const key = Math.random().toString(36).slice(2, 9);
  const session: PageSession = { authorId: interaction.user.id, pages, current: 0, title, color, header, footer, expiresAt: Date.now() + 5 * 60_000 };
  paginatedSessions.set(key, session);
  setTimeout(() => paginatedSessions.delete(key), 5 * 60_000);
  await interaction.editReply({ embeds: [buildPageEmbed(session)], components: [buildPageRow(key, session)] });
}

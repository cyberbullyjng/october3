// ─── Semantic color palette ───────────────────────────────────────────────────
// Use these constants everywhere instead of raw hex values so the whole bot
// stays visually consistent.  Import from here directly or via utils.ts.
export const COLORS = {
  /** Discord blurple — general info, neutral responses */
  primary:  0x5865f2,
  /** Discord green — success, added, enabled */
  success:  0x57f287,
  /** Discord red — ban, kick, error, removed */
  error:    0xed4245,
  /** Yellow — warn, caution, spam, offense */
  warning:  0xfee75c,
  /** Gray — expired, disabled, draw, muted */
  muted:    0x99aab5,
  /** Pink/Magenta — boost, premium, custom roles */
  special:  0xf47fff,
  /** Amber/Orange — automod actions, clownboard */
  orange:   0xff6b00,
  /** Gold — wins, giveaway results */
  gold:     0xffd700,
  /** Twitch purple */
  twitch:   0x9146ff,
  /** Dark brown — Blacktea game theme */
  tea:      0x2b1a0e,
  /** Google blue — search embeds */
  google:   0x4285f4,
  /** Last.fm red */
  lastfm:   0xd51007,
} as const;

export type ColorKey = keyof typeof COLORS;

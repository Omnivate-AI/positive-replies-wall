/**
 * Server-rendered avatar — inline SVG with initials on a deterministic
 * colored background.
 *
 * Why inline SVG (vs Gravatar / DiceBear / Logo.dev):
 *   - Reliable: no external fetch, no proxy chain, no missing-photo defaults
 *     that show as a generic "mystery person" silhouette
 *   - Deterministic: same email always produces the same color, same
 *     initials. The wall reads consistently across renders.
 *   - Looks like the real thing: how Gmail, Outlook, Notion, Slack render
 *     contact avatars when the user has no photo set
 *
 * The Gravatar→DiceBear chain we tried first proved unreliable: Gravatar's
 * `d=` redirect to DiceBear sometimes failed silently, leaving cards with
 * blank colored circles and no initials.
 */

import { createHash } from "crypto";

export interface AvatarProps {
  email: string;
  /** Display name. Falls back to the email's local part if absent. */
  name?: string | null;
  /** Pixel size of the rendered square. Defaults to 40. */
  size?: number;
  className?: string;
}

/** A small palette of accessible, professional avatar backgrounds — picked
 * to read as "real contact avatar" not "generated brand mark". Each is
 * paired implicitly with white text. */
const AVATAR_COLORS = [
  "#4f46e5", // indigo-600
  "#0891b2", // cyan-600
  "#0d9488", // teal-600
  "#16a34a", // green-600
  "#ca8a04", // yellow-600
  "#ea580c", // orange-600
  "#dc2626", // red-600
  "#db2777", // pink-600
  "#9333ea", // purple-600
  "#475569", // slate-600
];

function deterministicColor(seed: string): string {
  // Use first byte of an md5 hash → modulo palette length. md5 keeps the
  // mapping stable across processes / restarts.
  const hex = createHash("md5").update(seed.toLowerCase()).digest("hex");
  const idx = parseInt(hex.slice(0, 2), 16) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function deriveInitials(name: string | null | undefined, email: string): string {
  const source =
    name && name.trim().length > 0
      ? name.trim()
      : email.includes("@")
        ? email.slice(0, email.indexOf("@"))
        : email;

  // Split on whitespace, hyphen, underscore, dot — pick first letter of
  // first two non-empty parts. "John Smith" → "JS", "doreen.disalvo" → "DD".
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0].slice(0, 1) + parts[1].slice(0, 1)).toUpperCase();
}

export function Avatar({ email, name, size = 40, className }: AvatarProps) {
  const initials = deriveInitials(name, email);
  const bg = deterministicColor(email || initials);
  // Initials text scales with the circle. 38% feels about right against
  // the 600-weight Google Sans we use repo-wide.
  const fontSize = Math.round(size * 0.38);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-hidden="true"
      className={className ?? "shrink-0"}
    >
      <circle cx={size / 2} cy={size / 2} r={size / 2} fill={bg} />
      <text
        x="50%"
        y="50%"
        dy="0.05em"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#ffffff"
        fontSize={fontSize}
        fontWeight={600}
        fontFamily="inherit"
        letterSpacing="0.02em"
      >
        {initials}
      </text>
    </svg>
  );
}

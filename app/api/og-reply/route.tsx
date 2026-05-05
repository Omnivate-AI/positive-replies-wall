/**
 * Option C: code-rendered email card → captured as a PNG at request time.
 *
 * Visually mirrors the EmailReplyCard component (subject → mail-icon + sender
 * row → arrow-icon + recipient row → divider → body) but written in inline
 * styles since Satori (the engine inside @vercel/og) doesn't support Tailwind
 * or external stylesheets.
 *
 * Satori quirk: every container with multiple children must have an explicit
 * `display: flex` (or contents/none). Every <div> below uses `display: "flex"`
 * with an explicit `flexDirection`.
 *
 * Query params:
 *   ?id=<poc-reply-id>     which sample to render
 *   ?redact=0              skip default redactions (default: redact on)
 */

import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";
import { POC_REPLIES } from "@/app/m7/data/poc-samples";

export const runtime = "edge";

const COLORS = {
  bg: "#ffffff",
  bgSubtle: "#fafafa",
  border: "#e4e4e7",
  fg: "#18181b",
  fgMuted: "#71717a",
  fgSubtle: "#a1a1aa",
};

/** Wrap each (case-insensitive) occurrence of every redaction string in a
 * black-bar span. Returns an array of React nodes (text + spans). */
function withRedactions(text: string, redactions: string[]): React.ReactNode[] {
  if (!redactions || redactions.length === 0) return [text];
  const sorted = [...new Set(redactions.filter((s) => s.length > 0))].sort((a, b) => b.length - a.length);
  if (sorted.length === 0) return [text];
  const escaped = sorted.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");

  const out: React.ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) out.push(text.slice(lastIdx, m.index));
    out.push(
      <span
        key={`r${key++}`}
        style={{
          background: "#000",
          color: "#000",
          borderRadius: 2,
          padding: "0 4px",
          margin: "0 1px",
        }}
      >
        {m[0]}
      </span>,
    );
    lastIdx = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  if (lastIdx < text.length) out.push(text.slice(lastIdx));
  return out;
}

function formatReceivedAt(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// FieldLabel removed — labels are inlined into the sender/recipient text so
// they read as flowing text, not a two-column grid.

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const redact = req.nextUrl.searchParams.get("redact") !== "0";
  const reply = POC_REPLIES.find((r) => r.id === id);
  if (!reply) {
    return new Response(`Unknown POC reply id: ${id}`, { status: 404 });
  }
  const redactions = redact ? reply.default_redactions : [];

  // Dynamic canvas height — shrinks the image to its actual content instead of
  // leaving big whitespace below short replies. Body now at fontSize 18, so
  // wrap width inside ~720px of card padding ≈ 65 chars/line, line-height ≈ 28.
  // Body renders as paragraphs (split on blank lines) with a 12px gap between
  // paragraphs instead of a full empty line — height counts wrapped text lines
  // + paragraph margins separately.
  const paragraphs = reply.reply_body.split(/\n{2,}/);
  const wrappedLines = paragraphs.reduce((sum, p) => {
    return sum + p.split("\n").reduce((s, line) => s + Math.max(1, Math.ceil(line.length / 72)), 0);
  }, 0);
  const HEADER_HEIGHT = 260; // outer padding + card padding + subject + 2 rows (now 17px) + separator + gaps
  const LINE_HEIGHT = 28; // 18 * 1.55
  const PARAGRAPH_GAP = 12;
  const FOOTER_PADDING = 64;
  const computedHeight =
    HEADER_HEIGHT +
    wrappedLines * LINE_HEIGHT +
    Math.max(0, paragraphs.length - 1) * PARAGRAPH_GAP +
    FOOTER_PADDING;
  const height = Math.min(Math.max(computedHeight, 320), 1000);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: COLORS.bg,
          padding: 48,
          fontFamily: "sans-serif",
        }}
      >
        {/* Card */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            background: "#ffffff",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 16,
            padding: 36,
          }}
        >
          {/* Subject */}
          <div
            style={{
              display: "flex",
              fontSize: 22,
              fontWeight: 600,
              color: COLORS.fg,
              letterSpacing: "-0.01em",
              lineHeight: 1.3,
            }}
          >
            {withRedactions(reply.reply_subject, redactions)}
          </div>

          {/* Sender row: "From: Name <email>" inline, timestamp on the right */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 12,
              marginTop: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                fontSize: 17,
                color: COLORS.fg,
                flex: 1,
                minWidth: 0,
              }}
            >
              <span style={{ display: "flex", fontWeight: 500, color: COLORS.fgMuted, marginRight: 6 }}>
                From:
              </span>
              <span style={{ display: "flex", fontWeight: 500 }}>
                {withRedactions(reply.reply_from_display_name, redactions)}
              </span>
              <span style={{ display: "flex", color: COLORS.fgMuted, marginLeft: 6 }}>
                &lt;{withRedactions(reply.reply_from_email, redactions)}&gt;
              </span>
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 14,
                color: COLORS.fgSubtle,
                flexShrink: 0,
              }}
            >
              {formatReceivedAt(reply.reply_received_at)}
            </div>
          </div>

          {/* Recipient row: "to: email" inline */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              fontSize: 17,
              color: COLORS.fgMuted,
              marginTop: 8,
            }}
          >
            <span style={{ display: "flex", fontWeight: 500, marginRight: 6 }}>to:</span>
            <span style={{ display: "flex" }}>
              {withRedactions(reply.reply_to_email, redactions)}
            </span>
          </div>

          {/* Separator */}
          <div
            style={{
              display: "flex",
              height: 1,
              background: COLORS.border,
              marginTop: 20,
            }}
          />

          {/* Body — split into paragraphs (on blank lines) and render each as a
              column. Inter-paragraph spacing is a controlled marginTop instead
              of a full line-height of empty space. Within a paragraph, single
              newlines still render as line breaks. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 20,
              fontSize: 18,
              lineHeight: 1.55,
              color: COLORS.fg,
            }}
          >
            {reply.reply_body.split(/\n{2,}/).map((para, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  marginTop: i > 0 ? 12 : 0,
                }}
              >
                {para.split("\n").map((line, j) => (
                  <div key={j} style={{ display: "flex", flexWrap: "wrap" }}>
                    {line ? withRedactions(line, redactions) : <span style={{ display: "flex" }}>&nbsp;</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    {
      width: 900,
      height,
    },
  );
}

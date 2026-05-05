/**
 * 3 sample replies for the M7 rendering POC viewer.
 *
 * Each sample pairs a real M4-flagged exemplar's text+sender with the matching
 * screenshot from docs/m4-exemplars/ — so all three rendering options
 * (A: actual screenshot, B: code-rendered, C: hybrid) show the same content.
 *
 * The screenshot path is served from /public/m7/* (copied at scaffold time
 * because Next.js can't serve from docs/).
 *
 * Each sample also carries `default_redactions` — the prospect PII the M4
 * redaction policy says to mask (sender first/last name + company). Toggle in
 * the POC viewer turns these on/off so Omar can compare both states.
 */

export interface PocReply {
  id: string;
  screenshot_src: string;
  reply_subject: string;
  reply_from_email: string;
  reply_from_display_name: string;
  reply_to_email: string;
  reply_received_at: string;
  reply_body: string; // plain text with \n line breaks
  /** PII spans to redact when the toggle is on. SDR first names stay (Omnivate's people). */
  default_redactions: string[];
}

export const POC_REPLIES: PocReply[] = [
  {
    id: "mauritz-jellyfish",
    screenshot_src: "/m7/exemplar-mauritz-jellyfish.png",
    reply_subject: "Re: analog childhood",
    reply_from_email: "mauritz.gilfillan@jellyfish.com",
    reply_from_display_name: "Mauritz (Mo) Gilfillan",
    reply_to_email: "omar.almubarak@getomnivate.com",
    reply_received_at: "2025-09-12T11:24:00.000Z",
    reply_body:
      "Hi Omar,\n\nThank you so much for this email! I have to say, this is one of the best cold/outbound emails I've received in years. It really stood out.",
    default_redactions: ["Mauritz (Mo) Gilfillan", "Mauritz", "Gilfillan", "Jellyfish", "jellyfish.com", "mauritz.gilfillan@jellyfish.com", "omar.almubarak@getomnivate.com"],
  },
  {
    id: "lizzy-canidium",
    screenshot_src: "/m7/exemplar-lizzy-canidium.png",
    reply_subject: "Re: your quiet leadership",
    reply_from_email: "lizzywolff@canidium.com",
    reply_from_display_name: "Lizzy Wolff",
    reply_to_email: "christie.johansen-pinney@roosterpunk.com",
    reply_received_at: "2025-11-04T15:08:00.000Z",
    reply_body:
      "Hey Christie,\n\nThis is a great email. I get dozens of these a day and this is the best one I've read in months.",
    default_redactions: ["Lizzy Wolff", "Lizzy", "Wolff", "Canidium", "canidium.com", "lizzywolff@canidium.com", "christie.johansen-pinney@roosterpunk.com"],
  },
  {
    id: "valeria-star-global",
    screenshot_src: "/m7/exemplar-valeria-star-global.png",
    reply_subject: "Re: trust and data protection",
    reply_from_email: "vbalaro@star.global",
    reply_from_display_name: "Valeria Balaro",
    reply_to_email: "andrew.last@roosterpunk.com",
    reply_received_at: "2025-12-18T09:45:00.000Z",
    reply_body:
      "Hi Andrew,\n\nThanks for reaching out. This is probably the most relevant and well personalised outreach email I've ever received.\n\nYes this would be of interest, let's connect.\n\nThanks,\nValeria",
    default_redactions: ["Valeria Balaro", "Valeria", "Balaro", "Star Global", "star.global", "vbalaro@star.global", "andrew.last@roosterpunk.com"],
  },
];

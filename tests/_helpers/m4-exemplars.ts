/**
 * M4 calibration fixtures: the 31 unique exemplars Omar flagged as high-quality
 * positive replies (extracted from docs/m4-exemplars/*.png via vision in M4).
 *
 * Used by the calibration script (scripts/run-calibration.ts) to verify M6
 * acceptance criterion #1: "100% of M4 exemplars classified as high quality".
 *
 * `expected_categories` is the M4 categorization (from docs/m4-quality-bar-calibration.md)
 * — informational; the classifier may pick a subset, but is_high_quality must be true.
 */

import type { ClassifyInput } from "../../trigger/lib/classify.js";
import type { Category } from "../../trigger/lib/classify.js";

export interface M4Exemplar extends ClassifyInput {
  file: string;
  expected_categories: Category[];
}

export const M4_EXEMPLARS: M4Exemplar[] = [
  {
    file: "image.png",
    reply_subject: "Re: off pitch storytelling",
    reply_body: "Hi Omar,\n\nI never usually respond to these, but your message was crafted way better than most!",
    reply_from_email: "michelle@b-engaged.co.uk",
    lead_first_name: "Michelle",
    lead_last_name: "Tierney",
    lead_company_name: "b-engaged",
    expected_categories: ["superlative", "skeptic"],
  },
  {
    file: "image (1).png",
    reply_subject: "Re: gen alpha playbook",
    reply_body:
      "Hi Omar,\n\nResponding because your AI outreach clearly works for me to respond\n\nThis sounds good, interesting in hearing more and joining your free trial.\n\nLet's speak some more.\n\nKind regards,\nSubomi",
    reply_from_email: "subomi@divrsemedia.com",
    lead_first_name: "Subomi",
    lead_last_name: "Odanye",
    lead_company_name: "Divrse Media",
    expected_categories: ["conversion_with_compliment"],
  },
  {
    file: "image (2).png",
    reply_subject: "Re: member profiles citable",
    reply_body:
      "Hi Omar,\n\nThanks for your email.\n\nSales outreach, promoting utilisation of 'smart' AI to scale, is the largest type of unsolicited email I receive. However, I decided to have a look at a couple of your videos and can see how your process makes sense. I can see how AI and your system structured your email, and to be fair, it is pretty good.",
    reply_from_email: "charles.southgate@bizequals.com",
    lead_first_name: "Charles",
    lead_last_name: "Southgate",
    lead_company_name: "BizEquals",
    expected_categories: ["skeptic"],
  },
  {
    file: "image (3).png",
    reply_subject: "RE: mouseback chess move",
    reply_body: "Hi Omar,\n\nWe are impressed by the level of personalisation of your email.",
    reply_from_email: "karthik@mouseback.co.uk",
    lead_first_name: "Karthik",
    lead_last_name: null,
    lead_company_name: "Mouseback",
    expected_categories: ["personalization"],
  },
  {
    file: "image (4).png",
    reply_subject: "Re: analog childhood",
    reply_body:
      "Hi Omar,\n\nThank you so much for this email! I have to say, this is one of the best cold/outbound emails I've received in years. It really stood out.",
    reply_from_email: "mauritz.gilfillan@jellyfish.com",
    lead_first_name: "Mauritz",
    lead_last_name: "Gilfillan",
    lead_company_name: "Jellyfish",
    expected_categories: ["superlative"],
  },
  {
    file: "image (5).png",
    reply_subject: "Re: consciously incompetent",
    reply_body:
      "Hi Omar,\n\nMy opinion on AI outbound is pretty low to be honest. We're using AI across most areas of operation but have avoided it for outbound sales, it just hasn't been good enough.\n\nI'm not sure yours is perfect either, but it's the best I've seen so far.\n\nYou've peaked my interest for sure.",
    reply_from_email: "nathaniel@3manfactory.co.uk",
    lead_first_name: "Nathaniel",
    lead_last_name: "Cassidy",
    lead_company_name: "3manfactory",
    expected_categories: ["superlative", "skeptic"],
  },
  {
    file: "image (6).png",
    reply_subject: "Re: creative experts value",
    reply_body:
      "James,\n\nThanks for this. In all the years I've been doing new business, this is probably one of the best sales emails I've received. I suspect it's driven by AI somewhere along the line, which makes its human feel even more impressive.",
    reply_from_email: "katie@cherrybusinessconsulting.com",
    lead_first_name: "Katie",
    lead_last_name: "Horvath",
    lead_company_name: "Cherry Business Consulting",
    expected_categories: ["superlative"],
  },
  {
    file: "image (7).png",
    reply_subject: "Re: Checking in",
    reply_body:
      "Hi James,\n\nGreat email opener - it got my attention.\n\nWe run our own webinars and are happy with this approach for the moment.\n\nWith classy personalised outreach like that, please keep in touch or send me some collateral. I'll check your web pages.\n\nQQ - was that a bespoke email or are you using AI or a third party GTM specialist for this outreach. Just intrigued.\n\nBest wishes\n\nJoe",
    reply_from_email: "joe.goss@example.com",
    lead_first_name: "Joe",
    lead_last_name: "Goss",
    lead_company_name: null,
    expected_categories: ["personalization", "brief_acknowledgment"],
  },
  {
    file: "image (8).png",
    reply_subject: null,
    reply_body:
      "Very impressed with your out reach to me. I think this type of hyper personalised content really makes a difference and I appreciate the time it has taken you (AI or not) to identify with my post and pen the email below that you did.",
    reply_from_email: "unknown@example.com",
    lead_first_name: null,
    lead_last_name: null,
    lead_company_name: null,
    expected_categories: ["personalization"],
  },
  {
    file: "image (11).png",
    reply_subject: "Re: vegas mates",
    reply_body:
      "Charlie,\n\nAppreciate your personalised approach, stands you apart from the usual cold mails.\n\nWill definitely keep you in mind as and when something relevant comes up.\n\nBest\n\nWahid",
    reply_from_email: "wahid@voisetech.com",
    lead_first_name: "Wahid",
    lead_last_name: "Omer",
    lead_company_name: "Voise Tech",
    expected_categories: ["personalization"],
  },
  {
    file: "image (12).png",
    reply_subject: "Re: new mexico wins",
    reply_body:
      "Hi Christie,\n\nI'm not interested at this time - but I did want to tell you I appreciate having it on my radar to consider in the future. Not many people are sending pitches these days that don't sound like ChatGPT wrote a generic pitch for them - and just wanted to acknowledge that you captured my attention with the way you wrote this email.\n\nThank you,\nAnnemarie",
    reply_from_email: "annemarie@resilientsolutions21.com",
    lead_first_name: "Annemarie",
    lead_last_name: "Henton",
    lead_company_name: "Resilient Solutions 21",
    expected_categories: ["personalization"],
  },
  {
    file: "image (13).png",
    reply_subject: null,
    reply_body:
      "Christie - I NEVER respond to these but YOU did it!  Just the right blend of my LinkedIn posts with what we do without coming off as \"hokie\" or out of touch. Well done. You've earned a chance. I don't know if I want the tool you USED or the tool you're SELLING but let's discuss.",
    reply_from_email: "unknown@example.com",
    lead_first_name: null,
    lead_last_name: null,
    lead_company_name: null,
    expected_categories: ["personalization", "conversion_with_compliment"],
  },
  {
    file: "image (14).png",
    reply_subject: null,
    reply_body:
      "Christie-\nMaybe the best effort at a cold email I have ever read.  I get hundreds each week and never respond.  Ever.  CC'ing Betty Mok who runs marketing.  Betty- noidea if this would be helpful but gotta respect the effort here!\n\nD",
    reply_from_email: "doug.johnson@goconsensus.com",
    lead_first_name: "Doug",
    lead_last_name: "Johnson",
    lead_company_name: "Consensus",
    expected_categories: ["superlative", "conversion_with_compliment"],
  },
  {
    file: "image (15).png",
    reply_subject: "Re: future of care",
    reply_body:
      "Hi Christie,\n\nI don't usually respond to these, so kudos for your outreach. I'd be open to reviewing the report of the tool's findings with a video walk-through.\n\n--\nAnnie Christian\nVP of Marketing\n203-505-4691",
    reply_from_email: "annie.christian@courierhealth.com",
    lead_first_name: "Annie",
    lead_last_name: "Christian",
    lead_company_name: "CourierHealth",
    expected_categories: ["conversion_with_compliment"],
  },
  {
    file: "image (16).png",
    reply_subject: "Re: your quiet leadership",
    reply_body:
      "Hey Christie,\n\nThis is a great email. I get dozens of these a day and this is the best one I've read in months.",
    reply_from_email: "lizzywolff@canidium.com",
    lead_first_name: "Lizzy",
    lead_last_name: "Wolff",
    lead_company_name: "Canidium",
    expected_categories: ["superlative"],
  },
  {
    file: "image (17).png",
    reply_subject: "RE: that immersive magic",
    reply_body: "Hi Andrew, the most intuitive cold call to date, on that basis lets give it a go.",
    reply_from_email: "Sarah.Williams@simon-kucher.com",
    lead_first_name: "Sarah",
    lead_last_name: "Williams",
    lead_company_name: "Simon-Kucher",
    expected_categories: ["superlative", "conversion_with_compliment"],
  },
  {
    file: "image (18).png",
    reply_subject: "Re: toxic skills clawhub",
    reply_body:
      "Hi Andrew\n\nKudos on a very targeted outreach. I've added Lindsay Kitendaugh, who is the Director, Global Communications & Brand at Snyk. She would be the best person to talk with to see if this might be of interest.\n\nThanks\n\nGareth",
    reply_from_email: "gareth.rushgrove@snyk.io",
    lead_first_name: "Gareth",
    lead_last_name: "Rushgrove",
    lead_company_name: "Snyk",
    expected_categories: ["personalization", "conversion_with_compliment"],
  },
  {
    file: "image (19).png",
    reply_subject: "Re: ingredients versus chef",
    reply_body: "Hey James.\n\nGood email, got my attention.",
    reply_from_email: "sancar@meetoli.ai",
    lead_first_name: "Sancar",
    lead_last_name: null,
    lead_company_name: "Meet Oli",
    expected_categories: ["brief_acknowledgment"],
  },
  {
    file: "image (20).png",
    reply_subject: "Re: hob nob in a work brew",
    reply_body: "That's about as good an outreach email as there is.",
    reply_from_email: "phil.draper@salesmanago.com",
    lead_first_name: "Phil",
    lead_last_name: "Draper",
    lead_company_name: "SalesManago",
    expected_categories: ["superlative", "brief_acknowledgment"],
  },
  {
    file: "image (21).png",
    reply_subject: "RE: breathing motion birds",
    reply_body:
      "Hi James,\n\nLovely message – thank you!\n\nSure, why not, feel free to ping a video over and we can see if there is any synergy here\n\nThanks again.\n\nMartyn Swift\nHead of Sales",
    reply_from_email: "martynswift@agenagroup.com",
    lead_first_name: "Martyn",
    lead_last_name: "Swift",
    lead_company_name: "Agena Group",
    expected_categories: ["conversion_with_compliment", "brief_acknowledgment"],
  },
  {
    file: "image (22).png",
    reply_subject: "RE: chino saturday gossip",
    reply_body:
      "Evening James\n\nKudos on the outreach – it achieved the objective of grabbing my attention!\n\nCheers, Tom\n\nTom Dibble-Burge\nCCO & Co-founder",
    reply_from_email: "tom@thedotcollective.co.uk",
    lead_first_name: "Tom",
    lead_last_name: "Dibble-Burge",
    lead_company_name: "Dot Collective",
    expected_categories: ["personalization"],
  },
  {
    file: "image (23).png",
    reply_subject: "Re: fellers inventory gears",
    reply_body: "What a killer email!!!",
    reply_from_email: "alex.kemp@shiphawk.com",
    lead_first_name: "Alex",
    lead_last_name: "Kemp",
    lead_company_name: "ShipHawk",
    expected_categories: ["superlative"],
  },
  {
    file: "image (24).png",
    reply_subject: "Re: trust and data protection",
    reply_body:
      "Hi Andrew,\n\nThanks for reaching out. This is probably the most relevant and well personalised outreach email I've ever received.\n\nYes this would be of interest, let's connect.\n\nThanks,\nValeria",
    reply_from_email: "vbalaro@star.global",
    lead_first_name: "Valeria",
    lead_last_name: "Balaro",
    lead_company_name: "Star Global",
    expected_categories: ["superlative", "personalization", "conversion_with_compliment"],
  },
  {
    file: "image (25).png",
    reply_subject: "Re: evoke's brands",
    reply_body:
      "Hi Andrew - I usually delete these kinds of emails straight away but you did a good job on me ;)\n\nSure let's have a chat. w/c 23rd looking best for me.\n\nA",
    reply_from_email: "Ali.reed@brainlabsdigital.com",
    lead_first_name: "Ali",
    lead_last_name: "Reed",
    lead_company_name: "Brainlabs Digital",
    expected_categories: ["skeptic", "conversion_with_compliment"],
  },
  {
    file: "image (26).png",
    reply_subject: "RE: bar seating apologetic",
    reply_body:
      "Hi Andrew,\n\nYou pulled me in. You win. I will let you give me a free report. I know it is big of me.\n\nLet's do and I appreciate you reading my post and actually sending me an email that praises me with a follow-up that matters. Well done from a content perspective.\n\nCheers and looking forward to chatting.\n\nDoreen",
    reply_from_email: "Doreen.DiSalvo@hilti.com",
    lead_first_name: "Doreen",
    lead_last_name: "DiSalvo",
    lead_company_name: "Hilti",
    expected_categories: ["personalization", "conversion_with_compliment"],
  },
  {
    file: "image (27).png",
    reply_subject: "Re: cursive historian 2050",
    reply_body:
      "Finally an email that isn't just a pitch-fest template! Thanks for taking the time to do a bit of research.\n\nSend it over.",
    reply_from_email: "andrew@ignite-connections.com",
    lead_first_name: "Andrew",
    lead_last_name: "Hendry",
    lead_company_name: "Ignite Connections",
    expected_categories: ["superlative", "conversion_with_compliment"],
  },
  {
    file: "image (28).png",
    reply_subject: "Re: conductor metaphor",
    reply_body:
      "Hi Josh,\n\nThis has to be the most researched (or at least the most successfully researched) B2B cold email I've received. You got the content of my presentation in there (which I doubt you attended in person since you're in the uk), and the link to Caroline which most people in the room are not aware of. I'm impressed!\nBecause of that, if you want to share the video, I'll forward it to the appropriate people internally as feedback on internal Marketing content.",
    reply_from_email: "greg@nestogroup.ca",
    lead_first_name: "Gregory",
    lead_last_name: "Saget-Rudd",
    lead_company_name: "Nesto",
    expected_categories: ["superlative", "personalization", "conversion_with_compliment"],
  },
  {
    file: "image (30).png",
    reply_subject: "RE: unified interdealer platform",
    reply_body:
      "Hi Andrew\n\nYour email definitely caught my attention – and I never reply to cold emails normally!\n\nI would be interested for you to do an analysis, yes, but I don't have any budget for this – so what's in it for you?\n\nLexa\n\nLexa Palfrey\nGroup Head of Marketing\nTradition",
    reply_from_email: "Lexa.Palfrey@tradition.com",
    lead_first_name: "Lexa",
    lead_last_name: "Palfrey",
    lead_company_name: "Tradition",
    expected_categories: ["skeptic", "conversion_with_compliment"],
  },
  {
    file: "image (31).png",
    reply_subject: "Re: brand classy endure",
    reply_body:
      "Hi! Thanks for reaching out, whatever you are using for personalization is great :)\n\nI would be interested in seeing a report - but can you narrow it down to Human Risk Management market vs the wider Computer and Network Security?\n\nBest,\nSara",
    reply_from_email: "saraa@knowbe4.com",
    lead_first_name: "Sara",
    lead_last_name: "Aiello",
    lead_company_name: "KnowBe4",
    expected_categories: ["personalization", "conversion_with_compliment"],
  },
  {
    file: "image (32).png",
    reply_subject: "Re: edge 8 gig wifi 7",
    reply_body:
      "Hi Christie,\n\nThanks for your email.  I receive numerous solicitations daily and yours stood out because of the connection you made to our blog.  I'm open to receiving a report and hearing your insights.\n\nBest,\nMelani",
    reply_from_email: "melanigriffith@google.com",
    lead_first_name: "Melani",
    lead_last_name: "Griffith",
    lead_company_name: "Google",
    expected_categories: ["personalization", "conversion_with_compliment"],
  },
  {
    file: "image (33).png",
    reply_subject: "Re: cdcta board extension",
    reply_body:
      "Hi Christie,\n\nThanks for reaching out; this sounds very interesting. I would love to see what you find.\n\nI also appreciate the personalized pitch - even if it seems like it might have had a little help from AI ;)\n\nI look forward to reviewing the insights.\n\nBest regards,\nMarissa",
    reply_from_email: "m.tree@celonis.de",
    lead_first_name: "Marissa",
    lead_last_name: "Tree-Hannum",
    lead_company_name: "Celonis",
    expected_categories: ["skeptic", "conversion_with_compliment"],
  },
];

/** Constructed junk replies — should classify as is_high_quality=false. */
export const JUNK_REPLIES: ClassifyInput[] = [
  {
    reply_subject: "Re: your pitch",
    reply_body: "Hi Andrew, yes — send the report. Free Tuesday at 3.",
    reply_from_email: "buyer@example.com",
    lead_first_name: "Sample",
    lead_last_name: "Buyer",
    lead_company_name: "ExampleCo",
  },
  {
    reply_subject: "Re: introducing X",
    reply_body: "Interesting tool. What's the pricing model? And do you support webhooks?",
    reply_from_email: "ops@example.com",
    lead_first_name: "Ops",
    lead_last_name: "Person",
    lead_company_name: "ExampleCo",
  },
  {
    reply_subject: "Re: outreach",
    reply_body: "Thanks for reaching out — we're not in the market for this right now.",
    reply_from_email: "noreply.person@example.com",
    lead_first_name: "Polite",
    lead_last_name: "No",
    lead_company_name: "ExampleCo",
  },
  {
    reply_subject: "Out of Office",
    reply_body:
      "I will be out of the office until Monday with limited access to email. For urgent matters please contact my colleague Pat at pat@example.com.",
    reply_from_email: "ooo@example.com",
    lead_first_name: "OOO",
    lead_last_name: null,
    lead_company_name: "ExampleCo",
  },
  {
    reply_subject: "Re: pricing",
    reply_body: "Could you send me more details about your pricing tiers and contract terms?",
    reply_from_email: "questions@example.com",
    lead_first_name: "Curious",
    lead_last_name: "Buyer",
    lead_company_name: "ExampleCo",
  },
];

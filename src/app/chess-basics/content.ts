// The copy for /chess-basics, as data.
//
// Every number here was read from the official page listed in that section's
// `sources` on `checkedOn`. The list is not decoration: the page prints it, so
// a reader can open the rule, and a future editor can see which page to
// re-read before touching a figure. Fetched-but-out-of-date pages (the FIDE
// Qualification Commission FAQ still says "no minimum rating"; the 2009 Laws
// PDF on fide.com) were deliberately left out.
//
// What is NOT here, on purpose: fee amounts (they change; the schedule is
// linked), "typical" club and scholastic time controls stated as anything
// other than typical, and any statistic nobody could source.
export type BasicsBlock = { subheading: string; paragraphs?: string[]; bullets?: string[] };
export type BasicsLink = { label: string; url: string; why: string };
export type BasicsSource = { url: string; confirms: string; fetched: boolean };
export type BasicsSection = {
  id: string;
  heading: string;
  summary: string;
  blocks: BasicsBlock[];
  links: BasicsLink[];
  sources: BasicsSource[];
};
export type BasicsContent = {
  intro: string;
  checkedOn: string;
  disclaimer: string;
  sections: BasicsSection[];
};

export const BASICS: BasicsContent = {
  intro:
    "Rated chess has its own vocabulary, and nobody hands you the glossary. This page covers the four things new players ask about most: what actually happens at a tournament, what the time formats mean, how you get an official rating, and what the FM, IM and GM titles require. Every number was checked against the FIDE Handbook or US Chess on the date at the bottom, and each section links to the official page so you can read the rule itself.",
  checkedOn: "2026-09-14",
  disclaimer:
    "Regulations change. Every number on this page was read from the official page listed here on the date shown; if you are about to rely on one, open the source.",
  sections: [
    {
      id: "organised",
      heading: "How organised chess works",
      summary:
        "You do not need to memorise a rulebook before your first tournament. You need to know that the rules are written down and free, what touch-move, the clock and the scoresheet ask of you, how a game ends in a draw, what happens after an illegal move or a phone in your pocket, and how pairings decide who you play.",
      blocks: [
        {
          subheading: "Where the rules live",
          paragraphs: [
            "Organised chess runs on the FIDE Laws of Chess. The version in force took effect on 1 January 2023 and is free to read on the FIDE Handbook site. Every event has an arbiter who applies the Laws and settles disputes. In the United States that person is the tournament director, and US Chess publishes the core chapters of its own rulebook free.",
            "If you still need the moves of the pieces, Lichess has a free interactive course. This page is about everything that comes after that.",
          ],
        },
        {
          subheading: "At the board",
          bullets: [
            "Touch-move: on your turn, if you deliberately touch one of your own pieces you must move it, and if you touch an opponent’s piece you must capture it if you legally can. Say “I adjust” before straightening a piece.",
            "Writing moves: in standard (classical) games both players write every move in algebraic notation. With under five minutes left and no 30-second increment you may stop. In rapid and blitz you do not have to keep score at all.",
            "The clock: make your move, then press your clock. If your time runs out you lose, unless your opponent has no possible way to checkmate you, in which case it is a draw.",
            "Illegal moves: in a standard game your first completed illegal move gives your opponent two extra minutes, and a second one loses the game. In rapid and blitz the penalty is one minute. US Chess rules likewise add two minutes to your opponent’s clock.",
          ],
        },
        {
          subheading: "The four common draws",
          bullets: [
            "By agreement: offer a draw after making your move and before pressing the clock.",
            "Stalemate: the player to move has no legal move and is not in check.",
            "Threefold repetition: the same position, with the same player to move, appears for the third time. You have to claim it.",
            "The 50-move rule: fifty moves by each player with no pawn move and no capture. You have to claim this one too.",
          ],
        },
        {
          subheading: "Phones and conduct",
          paragraphs: [
            "FIDE forbids any electronic device the arbiter has not approved inside the playing venue, and a phone found on your person during the game loses it unless the event announced a lighter penalty. US Chess requires the director’s permission unless the phone is completely switched off. No notes, no advice from anyone, and nothing that distracts your opponent. Shaking hands before and after the game is the custom.",
          ],
        },
        {
          subheading: "Pairings and tie-breaks",
          paragraphs: [
            "Most open tournaments use the Swiss system: the number of rounds is announced in advance, you play every round, you are paired as far as possible against someone on the same score, you never meet the same opponent twice, and colours are balanced. With an odd number of players someone gets a bye, worth a win. When players tie, the event’s regulations say whether they share the place or how they are separated; FIDE’s tie-break regulations define the usual methods, such as Buchholz and Sonneborn-Berger.",
          ],
        },
      ],
      links: [
        {
          label: "FIDE Laws of Chess (in force from 1 January 2023)",
          url: "https://handbook.fide.com/chapter/E012023",
          why: "the official rulebook, free to read; this is the page for “read the full rules”",
        },
        {
          label: "US Chess rulebook: the free chapters",
          url: "https://new.uschess.org/news/7th-edition-rule-book-free-chapters-updated-2026",
          why: "US Chess updates this page each year with the newest free PDF of chapters 1, 2, 9, 10 and 11",
        },
        {
          label: "FIDE basic rules for Swiss systems",
          url: "https://handbook.fide.com/chapter/C0401202507",
          why: "the short official statement of how Swiss pairings work",
        },
        {
          label: "FIDE tie-break regulations",
          url: "https://handbook.fide.com/chapter/TieBreakRegulations032026",
          why: "definitions of Buchholz, Sonneborn-Berger and the other methods",
        },
        {
          label: "Lichess: learn the moves",
          url: "https://lichess.org/learn",
          why: "free interactive practice if you still need the moves of the pieces",
        },
      ],
      sources: [
        {
          url: "https://handbook.fide.com/chapter/E012023",
          confirms:
            "Laws of Chess 2023: touch-move (4.3), “I adjust” (4.2.1), stalemate (5.2.1), draw by agreement (5.2.3), flag fall (6.9), illegal moves (7.5.5), recording moves (8.1, 8.4), threefold and fifty moves (9.2, 9.3), electronic devices (11.3.2), rapid and blitz rules (A.2, A.3, B.3)",
          fetched: true,
        },
        {
          url: "https://handbook.fide.com/chapter/C0401202507",
          confirms: "Swiss system basics in force from 1 February 2026",
          fetched: true,
        },
        {
          url: "https://handbook.fide.com/chapter/TieBreakRegulations032026",
          confirms: "tie-break regulations in force from 1 March 2026 and the methods they define",
          fetched: true,
        },
        {
          url: "https://new.uschess.org/news/7th-edition-rule-book-free-chapters-updated-2026",
          confirms: "which US Chess rulebook chapters are free and where the current PDF is",
          fetched: true,
        },
        {
          url: "https://new.uschess.org/sites/default/files/media/documents/us-chess-rule-book-online-2026.pdf",
          confirms:
            "US Chess rules 1C2a (two-minute penalty), 10B (touch-move), 11D (illegal moves), 15A and 15C (keeping score), 20N (phones)",
          fetched: true,
        },
        {
          url: "https://lichess.org/learn",
          confirms: "a free interactive chess-basics course exists",
          fetched: true,
        },
      ],
    },
    {
      id: "time",
      heading: "Time formats",
      summary:
        "Every rated game is played with a clock, and how much time each player gets decides whether it counts as standard (classical), rapid or blitz, and which of your ratings it changes. FIDE and US Chess draw the lines in slightly different places, so here are both.",
      blocks: [
        {
          subheading: "Reading a time control",
          paragraphs: [
            "“90+30” means 90 minutes for the whole game plus 30 seconds added to your clock after every move. US events write the same thing as “G/90;+30”. “G/30;d5” means 30 minutes with a five-second delay. Some events split the game: “40/100, SD/30, +30” is 40 moves in 100 minutes, then 30 more minutes for the rest, with 30 seconds a move throughout.",
            "With an increment the seconds are added to your clock every move, so quick play can build up time. With a delay the clock simply waits those seconds before counting down; you never gain time, you just stop losing it for a moment.",
          ],
        },
        {
          subheading: "FIDE’s three formats",
          paragraphs: [
            "FIDE measures a game by the time each player would have over 60 moves: the base time plus 60 times the increment. So 15+10 counts as 25 minutes, and 3+2 as 5.",
          ],
          bullets: [
            "Standard (classical): 60 minutes or more per player. For the game to count towards your FIDE standard rating each player needs at least 60 minutes, 90 if either player is rated 1800 or above, and 120 if either is 2400 or above. The everyday example is 90+30.",
            "Rapid: more than 10 and less than 60 minutes. Examples: 25+10 and 15+10.",
            "Blitz: 10 minutes or less. For a FIDE blitz rating the game must also be more than 3 minutes. Examples: 5+0 and 3+2.",
            "Bullet (1+0, 2+1) is an online and casual format. The Laws of Chess do not define it, and neither FIDE nor US Chess rates it.",
          ],
        },
        {
          subheading: "One player, three ratings",
          paragraphs: [
            "FIDE keeps three separate lists: standard, rapid and blitz. A rapid event changes only your rapid rating, and having a rating in one format and none in another is normal. New lists come out every month.",
          ],
        },
        {
          subheading: "US Chess: regular, quick and blitz",
          paragraphs: [
            "US Chess adds the main minutes and the delay or increment seconds together, so G/60;d5 counts as 65. It keeps separate over-the-board ratings for regular, quick and blitz, plus online versions of each.",
          ],
          bullets: [
            "Regular only: more than 65 minutes, for example G/90;+30.",
            "Dual-rated (regular and quick): 30 to 65 minutes, for example G/30;d5 and G/60;d5. Many scholastic events fall here, which is why many kids have a quick rating without ever entering a quick event.",
            "Quick only: more than 10 and less than 30 minutes, for example G/25;d3.",
            "Blitz: 5 to 10 minutes, for example G/5;d0 and G/3;+2.",
          ],
        },
        {
          subheading: "What you will typically meet",
          paragraphs: [
            "These are typical, not rules. The event flyer always states the time control, and that one line tells you which rating the games affect.",
          ],
          bullets: [
            "Local scholastic events in the US: often G/30;d5, so a round takes about an hour at most. National scholastic championships are slower; the 2026 K-12 Grade Nationals play G/90;d10.",
            "Club nights: usually one slow game, somewhere between G/60 and G/90 with a delay or increment, or a rapid ladder such as 15+10.",
            "Weekend opens: 90+30 is common, and the largest US events use 40/100, SD/30, +30, with faster early rounds on short schedules.",
            "FIDE-rated events: 90+30 is what you will see most often, with rapid and blitz side events.",
          ],
        },
      ],
      links: [
        {
          label: "FIDE Laws of Chess, Appendices A and B",
          url: "https://handbook.fide.com/chapter/E012023",
          why: "the official definitions of rapid and blitz, and the glossary entries for increment and delay",
        },
        {
          label: "FIDE Rating Regulations, article 1.1",
          url: "https://handbook.fide.com/chapter/B022024",
          why: "the 60, 90 and 120-minute minimums for a standard-rated game",
        },
        {
          label: "FIDE Rapid and Blitz Rating Regulations",
          url: "https://handbook.fide.com/chapter/B02RBRegulations2024",
          why: "which time controls count for a FIDE rapid or blitz rating",
        },
        {
          label: "US Chess: regular, quick, blitz and dual-rated",
          url: "https://new.uschess.org/tournament-director-and-affiliate-frequently-asked-questions",
          why: "US Chess’s own definitions of the bands, in minutes plus seconds",
        },
        {
          label: "US Chess: why do I have a quick rating?",
          url: "https://new.uschess.org/faq/ive-never-played-quick-chess-why-do-i-have-quick-rating",
          why: "the plain-English explanation of dual rating",
        },
      ],
      sources: [
        {
          url: "https://handbook.fide.com/chapter/E012023",
          confirms:
            "A.1 rapid is more than 10 and less than 60 minutes, B.1 blitz is 10 minutes or less, counting 60 times any increment; glossary definitions of increment and delay",
          fetched: true,
        },
        {
          url: "https://handbook.fide.com/chapter/B022024",
          confirms: "article 1.1: at least 120 minutes if either player is 2400+, 90 if either is 1800+, otherwise 60",
          fetched: true,
        },
        {
          url: "https://handbook.fide.com/chapter/B02RBRegulations2024",
          confirms: "rapid more than 10 and less than 60 minutes; blitz more than 3 and not more than 10; separate monthly lists",
          fetched: true,
        },
        {
          url: "https://new.uschess.org/tournament-director-and-affiliate-frequently-asked-questions",
          confirms: "regular over 65, dual 30 to 65, quick over 10 and under 30, blitz 5 to 10 inclusive; total time is minutes plus seconds",
          fetched: true,
        },
        {
          url: "https://new.uschess.org/faq/ive-never-played-quick-chess-why-do-i-have-quick-rating",
          confirms: "events from G/30 to G/65 are rated as both regular and quick",
          fetched: true,
        },
        {
          url: "https://new.uschess.org/us-open-2026/schedules",
          confirms: "the US Open 2026 plays 40/100, SD/30, +30 with G/90;d5 and G/60;d5 early rounds on shorter schedules",
          fetched: true,
        },
        {
          url: "https://new.uschess.org/us-chess-grade-k-12-national-championships-2026",
          confirms: "the 2026 K-12 Grade National Championships play G/90;d10",
          fetched: true,
        },
        {
          url: "https://www.il-chess.org/guide-to-scholastic-tournaments",
          confirms: "a state scholastic guide describing G/30 as the usual local control",
          fetched: true,
        },
      ],
    },
    {
      id: "rating",
      heading: "How to get a rating",
      summary:
        "A rating is a number that estimates your strength from your results. You get an official one by joining a federation and playing in its rated events. Ratings from Lichess or Chess.com are real but separate, and do not count.",
      blocks: [
        {
          subheading: "What a rating means",
          paragraphs: [
            "Chess ratings are Elo-style. Beat someone rated above you and yours rises; lose to someone rated below you and it falls, and the bigger the surprise, the bigger the change. Over many games it settles near your real level. A rating only compares you with the other players on the same list, so 1500 on one list is not 1500 on another.",
          ],
        },
        {
          subheading: "FIDE: the international rating",
          bullets: [
            "Get a FIDE ID first. It is a permanent number that your national federation creates for you; FIDE does not issue it to players directly. Ask your federation, or the organiser of your first FIDE-rated event.",
            "Play FIDE-rated events. A first rating needs at least 5 games against opponents who already have one. The games can come from more than one event, as long as they fall within a 26-month window.",
            "Your first rating is worked out from those results and your opponents’ ratings, plus two imaginary draws against 1800-rated opponents. It must be at least 1400 to be published and cannot be higher than 2200. If you score zero in your first event, that event is ignored and you start again.",
            "The rules changed on 1 March 2024 (the floor used to be 1000), so ignore older guides.",
            "Standard, rapid and blitz are three separate lists with the same 5-game rule. Lists come out monthly, and you can look yourself up at ratings.fide.com.",
          ],
        },
        {
          subheading: "National federations",
          paragraphs: [
            "Most national federations also keep a rating list of their own for their own events: US Chess in the United States, the All India Chess Federation in India, the English Chess Federation in England, the Chess Federation of Canada. Those numbers are separate from your FIDE rating and will usually differ from it. The FIDE rating is the international one.",
          ],
        },
        {
          subheading: "US Chess: the rating used in most American tournaments",
          bullets: [
            "You must be a current US Chess member to play in a US Chess-rated event; youth memberships cost less. There is no separate scholastic rating: a rated school event feeds the same lists as an adult one.",
            "Your rating is published once you have played at least 4 rated games at that time control and the next monthly list comes out. Until then you are listed as unrated.",
            "It is provisional for your first 25 games and is shown with a slash, such as 1213/16, meaning 1213 after 16 games. After that it is established.",
            "Regular, quick and blitz are separate ratings, and online games never change your over-the-board rating. Look yourself up at ratings.uschess.org by name or member ID.",
          ],
        },
        {
          subheading: "Online ratings are not official",
          paragraphs: [
            "Your Lichess or Chess.com rating is real but not official: it will not enter you in a rated section or count towards a title. Each site uses its own formula (Lichess uses Glicko-2 and starts everyone at 1500; Chess.com uses Glicko), has a different pool of players and mostly rates faster games, so the same strength gives different numbers. Lichess’s own FAQ says not to compare its ratings with other organisations’.",
          ],
        },
        {
          subheading: "Your first rated tournament",
          bullets: [
            "Join your federation before you enter, and write down your member ID. For a FIDE-rated event, confirm your FIDE ID exists before round one.",
            "Pick an event that says “US Chess rated” or “FIDE rated” (some are both), check the time control, and enter in advance.",
            "Bring a pen. In slower games you are required to write down your moves, so practise notation beforehand.",
            "Expect no rating until the next monthly list, and expect your first number to move a lot in the early games. That is normal.",
          ],
        },
      ],
      links: [
        {
          label: "FIDE ratings database",
          url: "https://ratings.fide.com/",
          why: "look up any player’s FIDE ID and standard, rapid and blitz ratings",
        },
        {
          label: "FIDE Rating Regulations (from 1 March 2024)",
          url: "https://handbook.fide.com/chapter/B022024",
          why: "the exact current rules: 5 games, 26 months, the 1400 floor, the initial-rating calculation",
        },
        {
          label: "FIDE member federations",
          url: "https://directory.fide.com/list/member_federations/main",
          why: "find your national federation, which issues your FIDE ID",
        },
        {
          label: "US Chess: am I rated now?",
          url: "https://new.uschess.org/faq/i-just-played-my-first-rated-event-am-i-rated-now-if-not-how-soon-will-i-have-published-rating",
          why: "the 4-game, monthly-list and 25-game provisional rules in US Chess’s own words",
        },
        {
          label: "Join US Chess",
          url: "https://new.uschess.org/join-us-chess",
          why: "membership types and current prices; membership is required for rated play",
        },
        {
          label: "US Chess player lookup",
          url: "https://ratings.uschess.org/",
          why: "look up a US Chess rating by name or member ID",
        },
        {
          label: "US Chess upcoming tournaments",
          url: "https://new.uschess.org/upcoming-tournaments",
          why: "find a rated event near you, with filters for state and FIDE-rated",
        },
        {
          label: "Lichess FAQ on ratings",
          url: "https://lichess.org/faq",
          why: "why online ratings differ and should not be compared across organisations",
        },
      ],
      sources: [
        {
          url: "https://handbook.fide.com/chapter/B022024",
          confirms:
            "7.1.4 at least 5 games against rated opponents pooled within 26 months and a rating of at least 1400; 8.2.1 a zero score in the first event is disregarded; 8.2.2 two hypothetical 1800 opponents scored as draws; initial rating capped at 2200; 7.1 a list prepared on the first day of each month",
          fetched: true,
        },
        {
          url: "https://handbook.fide.com/chapter/B02RBRegulations2024",
          confirms: "the same 5-game, 26-month and 1400 rules for a first rapid or blitz rating",
          fetched: true,
        },
        {
          url: "https://handbook.fide.com/chapter/B032015",
          confirms: "players are registered by their national federation and acquire a FIDE ID number",
          fetched: true,
        },
        {
          url: "https://www.fide.com/new-fide-rating-and-title-regulations-come-into-effect/",
          confirms: "FIDE’s announcement that the rating floor rose from 1000 to 1400 on 1 March 2024",
          fetched: true,
        },
        {
          url: "https://new.uschess.org/faq/i-just-played-my-first-rated-event-am-i-rated-now-if-not-how-soon-will-i-have-published-rating",
          confirms: "at least 4 rated games at that time control; monthly lists generated on the third Wednesday of the month before; provisional for the first 25 games, shown as 1213/16",
          fetched: true,
        },
        {
          url: "https://new.uschess.org/tournament-director-and-affiliate-frequently-asked-questions",
          confirms: "rule 23C: all non-house players in rated events must be current US Chess members",
          fetched: true,
        },
        {
          url: "https://new.uschess.org/news/online-rated-us-chess-events",
          confirms: "online play is not used to update over-the-board ratings",
          fetched: true,
        },
        {
          url: "https://new.uschess.org/join-us-chess",
          confirms: "membership types, with youth memberships cheaper than adult",
          fetched: true,
        },
        {
          url: "https://lichess.org/faq",
          confirms: "Lichess uses Glicko-2, starts at 1500, and advises against comparing ratings across organisations",
          fetched: true,
        },
        {
          url: "https://support.chess.com/en/articles/8566476-how-do-ratings-work-on-chess-com",
          confirms: "Chess.com uses the Glicko system",
          fetched: true,
        },
      ],
    },
    {
      id: "titles",
      heading: "Titles: FM, IM, GM and how they are earned",
      summary:
        "FIDE awards eight lifetime player titles. The lower ones come from your rating alone; IM and GM also need “norms”, which are outstanding results in specific tournaments, plus a peak rating. US Chess has its own separate titles and rating classes.",
      blocks: [
        {
          subheading: "The FIDE ladder",
          paragraphs: [
            "Four titles are open to everyone and four are for women, with lower thresholds. The current Title Regulations took effect on 1 January 2024, and a title is for life once FIDE confirms it, even if your rating later falls.",
          ],
          bullets: [
            "CM (Candidate Master): a rating of 2200. WCM: 2000.",
            "FM (FIDE Master): 2300. WFM: 2100.",
            "IM (International Master): norms plus a rating of 2400 at some point. WIM: norms plus 2200.",
            "GM (Grandmaster): norms plus a rating of 2500 at some point. WGM: norms plus 2300.",
            "The rating-only titles need at least 30 rated games behind the rating. “At some point” means a peak: it does not have to be your current rating.",
          ],
        },
        {
          subheading: "What a norm is",
          paragraphs: [
            "A norm is one outstanding tournament result. Over at least 9 games in a FIDE-rated standard event you must score the way a much stronger player would: a performance of 2600 for a GM norm, 2450 for IM, 2400 for WGM and 2250 for WIM. Performance is worked out from your score and your opponents’ ratings, not from your own rating. The field has to be strong and international: for a GM norm your opponents must average at least 2380, half of them must hold titles, and they must come from more than one federation.",
            "Your norms must cover at least 27 games in total. A norm is normally 9 games, so that usually means three norm tournaments. Only over-the-board standard games count: not rapid, blitz or online.",
          ],
        },
        {
          subheading: "Other routes, fees and online “Arena” titles",
          paragraphs: [
            "A few elite events award a title or a norm directly for a set placing: the World Cup, the Olympiad, the world junior and youth championships and the continental championships, all listed in FIDE’s Table for Direct Titles. Titles are not automatic: your national federation applies to FIDE for you, and a title fee is charged on the schedule published in the FIDE Financial Rules.",
            "FIDE Online Arena awards separate Arena titles (ACM at 1100, AFM at 1400, AIM at 1700, AGM at 2000) for an online rating held over a set number of games. They are a lower band: an AGM is not a GM, and a real IM or GM title replaces any Arena title.",
          ],
        },
        {
          subheading: "US Chess titles and classes",
          paragraphs: [
            "US Chess runs its own rating and its own labels, separate from FIDE. National Master (NM) goes to any player whose US Chess rating reaches 2200, and Original Life Master to a master who has played 300 games rated over 2200. Ratings are grouped into classes:",
          ],
          bullets: [
            "Senior Master 2400 and up; Master 2200 to 2399; Expert 2000 to 2199.",
            "Class A 1800 to 1999; Class B 1600 to 1799; Class C 1400 to 1599; Class D 1200 to 1399; Class E 1000 to 1199.",
            "Classes F to J continue downward in 200-point steps.",
          ],
        },
        {
          subheading: "If you are starting out",
          paragraphs: [
            "The great majority of rated players never hold a title, and you do not need one to play rated chess or to improve. The thresholds sit far above where almost everyone starts, and norm tournaments are a small subset of events. Sensible milestones are: get a rating, move up through the classes, and think about CM or FM (or US Chess Expert and NM) once you are near 2000. Treat IM and GM as long-term goals, not next steps.",
          ],
        },
      ],
      links: [
        {
          label: "FIDE Title Regulations (from 1 January 2024)",
          url: "https://handbook.fide.com/chapter/B012024",
          why: "the official rules for every threshold, norm requirement and lifetime title on this page",
        },
        {
          label: "FIDE Table for Direct Titles (from 1 January 2026)",
          url: "https://handbook.fide.com/chapter/B01DirectTitles2026",
          why: "which events award a title or a norm directly, and for what placing",
        },
        {
          label: "FIDE Online Arena titles",
          url: "https://handbook.fide.com/chapter/B11FOATitlesForLowerRatingBand",
          why: "the official definition of ACM, AFM, AIM and AGM",
        },
        {
          label: "FIDE Financial Rules",
          url: "https://handbook.fide.com/chapter/FinancialRegulations2021",
          why: "where the title fee schedule is published; check here before relying on any amount",
        },
        {
          label: "US Chess rating classes",
          url: "https://new.uschess.org/tournament-director-and-affiliate-frequently-asked-questions",
          why: "the official class table from Senior Master down to Class J",
        },
        {
          label: "US Chess FAQ: National Master",
          url: "https://new.uschess.org/frequently-asked-questions-faqs",
          why: "US Chess’s own statement that NM is awarded at 2200 and how Original Life Master works",
        },
      ],
      sources: [
        {
          url: "https://handbook.fide.com/chapter/B012024",
          confirms:
            "0.4 titles valid for life; 0.6.2 at least 30 rated games for rating-based titles; 1.3 FM 2300, CM 2200, WFM 2100, WCM 2000; 1.4.1 at least 9 games per norm; 1.4.8 norm performances GM 2600, IM 2450, WGM 2400, WIM 2250, with opponents averaging at least 2380 for a GM norm; 1.4.5 half the opponents titled; 1.5.1 norms covering at least 27 games; 1.5.3 GM 2500, IM 2400, WGM 2300, WIM 2200 at some time",
          fetched: true,
        },
        {
          url: "https://handbook.fide.com/chapter/B01DirectTitles2026",
          confirms: "the events that award titles or norms directly, in force from 1 January 2026",
          fetched: true,
        },
        {
          url: "https://handbook.fide.com/chapter/B11FOATitlesForLowerRatingBand",
          confirms: "Arena titles at 2000, 1700, 1400 and 1100, and that an over-the-board IM or GM title replaces them",
          fetched: true,
        },
        {
          url: "https://handbook.fide.com/chapter/FinancialRegulations2021",
          confirms: "title fees exist, are set out in Appendix 2, and are the responsibility of the player’s federation",
          fetched: true,
        },
        {
          url: "https://new.uschess.org/tournament-director-and-affiliate-frequently-asked-questions",
          confirms: "the US Chess rating classifications from Senior Master (2400 and up) to Class J (199 and below)",
          fetched: true,
        },
        {
          url: "https://new.uschess.org/frequently-asked-questions-faqs",
          confirms: "National Master at 2200; Original Life Master after 300 games rated over 2200",
          fetched: true,
        },
      ],
    },
  ],
};

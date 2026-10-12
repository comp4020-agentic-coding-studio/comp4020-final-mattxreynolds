# Sources for the definition of good

Research for [#5](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/issues/5), on the map [#2](https://github.com/comp4020-agentic-coding-studio/comp4020-final-mattxreynolds/issues/2).

**Question:** What primary sources should the README's definition of good argue from, and against?

**Gist:** The KTANE design talk gives the sharpest claims about communication as the mechanic. Shirky, Sloan and Kazemi give the case for software built for a few named people. The asymmetric co-op research (Harris & Hancock, Rocha et al., Seif El-Nasr et al.) gives evidence and a vocabulary, plus one claim worth arguing against outright.

This file holds sources and claims only. The README prose is the student's to write.

## How this was checked

- Every URL below was fetched on 2026-10-13 and resolved, except where noted.
- Text in quotation marks was read on the page itself, or in the PDF's extracted text. Paraphrase is marked as paraphrase.
- When a page reports someone else's words, the entry names who said them, for example "article narration" or "host's show notes".
- The brief ([final project](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/)) names the themes "the small web, games made for a handful of friends, tools built for one workshop" but **gives no specific readings**. Choosing them is part of the task.
- The brief's marking question: "Is it argued from sources, and against the alternatives?" Each entry therefore has a claim to **use** and a claim to **push back on**.

---

## A. Keep Talking and Nobody Explodes (Steel Crate Games)

### A1. Ben Kane, "Designing Asymmetric Gameplay for Keep Talking and Nobody Explodes", GDC 2016 (slides)

- **Citation:** Kane, B. (2016). *Designing Asymmetric Gameplay for Keep Talking and Nobody Explodes*. Independent Games Summit, GDC 2016. Steel Crate Games.
- **URLs:**
  - Slides (PDF): https://media.gdcvault.com/gdc2016/Presentations/Kane_Ben_Designing_Asymmetric_Gameplay.pdf
  - Session page (free video): https://gdcvault.com/play/1023471/Designing-Asymmetric-Gameplay-For-Keep
- **What the slides say (verbatim slide headings and bullets):**
  - "Not Making a Bomb Game"
  - "Foster Interesting Communication"
  - "What are players bad at talking about? Visual stimulation / Unfamiliar symbols / Multi-tasking", then "Then add stress!"
  - "What Hinders Interesting Communication? Ensure conversation is about player strategy, not designer intent / Failure must be the result of avoidable mistake"
  - "Simple Interactions: Hard decisions / Easy input"
  - "Unambiguous Rules: Guessing is always bad / Wrong: cheated! / Right: unsatisfied!"
  - "Enabling Player Trust: Mistakes will happen / How can we be confident in the rules?"
  - "Constructing the Rules: Game generates rule data / Game executes rules / Manual is generated from the same rule data"
  - "Rule Set: Precedence list of rules / Cover all possible bomb states"
  - "Pacing System: Distract if needed / Encourage last second saves"
  - "Manual is half the game: Development effort reflected that"
  - "Recap: Demoing allowed us to discover the game / Focus on desired experience to guide decisions"
- **Session page (verbatim):** the game's heart is "a game about communication between players."
- **Use:**
  - A testable definition of good communication puzzles: hard decisions, easy input, unambiguous rules, and failure that is the players' own avoidable mistake.
  - "Manual is generated from the same rule data" is a primary-source precedent for the map's "keep rule text beside its logic" and for a server that owns the rules. It also makes a natural `spec/` check: the text a Player reads and the rule the server enforces cannot drift apart.
  - The list of things players are bad at talking about (visual stimulation, unfamiliar symbols, multi-tasking) works directly as puzzle-design material.
- **Push back:**
  - "Then add stress!" and "Encourage last second saves" treat pressure as part of good. Whether the game has a timer is still open on the map, so the README can argue for or against this.
  - "Guessing is always bad" pulls against deliberately ambiguous description, which is where much of We Were Here's fun lives (see B1).

### A2. Alex Wawro, "Finding the fun in bomb defusal with Keep Talking and Nobody Explodes", Gamasutra / Game Developer, 14 March 2016

- **Citation:** Wawro, A. (2016, March 14). Report on Kane's GDC 2016 talk. *Game Developer*.
- **URL:** https://www.gamedeveloper.com/design/finding-the-fun-in-bomb-defusal-with-i-keep-talking-and-nobody-explodes-i-
- **Kane, quoted verbatim:**
  - "We're not making a bomb game at all; we're making a communications-based party game, it just happens to have bombs in it"
  - "The fun really lives between players"
  - "Interseting [sic] conversations are where players make mistakes" … "it's also where friendships get made, and relationships get tested."
  - "Our game involves talking, so our job involved eavesdropping"
  - "We require simple and deliberate inputs" / "The decision-making is the hard part"
  - "The rules have to be totally unambiguous" / "If players are forced to guess, or feel forced to guess, they're either going to be wrong and feel cheated" / "or be right and feel unsatisfied, which is just as bad."
  - "We don't want to accelerate a death spiral; we want people to get those really exciting moments"
- **Use:**
  - "The fun really lives between players" is the one-line thesis for a communication game.
  - "Our job involved eavesdropping" gives a method for *judged* claims: watch and listen to pairs play, rather than running a survey.
- **Push back:** This is a party game for a crowd watching one defuser. Our Team is exactly two Players with no audience, so the theatre-for-spectators reasoning does not transfer as it stands.

### A3. Kris Graft, "Road to the IGF: Steel Crate Games' Keep Talking and Nobody Explodes", Game Developer, 29 January 2016

- **URL:** https://www.gamedeveloper.com/design/road-to-the-igf-steel-crate-games-i-keep-talking-and-nobody-explodes-i-
- **Verbatim:**
  - Kane: "each side, VR and non-VR, would have different pieces of information" … "they would need to work together to solve a puzzle."
  - Kane: "The manual, and its layout and browser compatibility, is hugely important piece of the puzzle."
  - Kane: "The most amusing to me is when couples get into heated arguments as their game spirals out of control."
  - Allen Pestaluky: "It's the stories that you build on top of existing relationships that are the most deep and valuable."
- **Use:**
  - Pestaluky's line links KTANE straight to the small-web argument: the game's value rests on a relationship that already exists.
  - Kane's "browser compatibility" line shows that even KTANE's half-in-the-browser manual was treated as core design.
- **Push back:** "heated arguments" are presented as a feature. The README could decide whether friction between two friends is part of good or a cost to keep low.

### A4. Kent Bye, "Voices of VR #98: Ben Kane on designing Keep Talking and Nobody Explodes", 4 March 2015 (podcast, rough transcript)

- **URL:** https://voicesofvr.com/98-ben-kane-on-designing-keep-talking-and-nobody-explodes/
- **Kane, from the transcript:**
  - "we try to make sure that both the diffuser in VR and the experts with the manual have reasons to talk to each other."
  - "if either side goes silent, like usually something's gone wrong."
  - "the best teams are the ones that keep talking in little amounts and go back and forth."
  - "just the difficulty in communicating these visual concepts to people who can't see what you see is enough of a barrier"
- **Use:** "If either side goes silent, something's gone wrong" works as an observable, judged criterion: in a playtest, count how long either Player stays silent.
- **Push back:** Kane says the visual barrier is enough on its own, without "misdirection". The README could ask whether one shared language barrier is enough for a 15–30 minute attempt, or whether it goes stale.

### A5. Steel Crate Games, official game site and Bomb Defusal Manual

- **URLs:**
  - https://keeptalkinggame.com/
  - https://www.bombmanual.com/ ("View / Print PDF", "View as Webpage")
- **Verbatim (game site):**
  - "the Experts can't see the bomb, so everyone will need to talk it out – fast!"
  - "If you can talk to each other, you can play!"
  - "Only one copy of the game needed"
  - "Try using your favorite voice chat service and playing remotely."
- **Use:**
  - A precedent for the map's same-room decision: the game ships no voice channel, and talking is the players' job.
  - A precedent for a low barrier to entry: one copy, plus a manual that is a plain webpage.
- **Push back:** Remote play is pushed off to "your favorite voice chat service". If our game also adds no channel of its own, the README has to own that same trade-off for remote pairs.

---

## B. We Were Here (Total Mayhem Games)

### B1. Joel Couture, "Road to the IGF: Total Mayhem Games' We Were Here", Game Developer, 5 February 2018

- **Interviewees:** Lucia De Visser (writer) and Benjamin Van Hemert (game designer).
- **URL:** https://www.gamedeveloper.com/game-platforms/road-to-the-igf-total-mayhem-games-i-we-were-here-i-
- **Verbatim:**
  - Van Hemert: "We practically built entire escape rooms, complete with real walkie-talkies, just to prototype our concepts!"
  - Van Hemert: "put people in a locked room with a walkie-talkie and have them solve challenges." … "we could test our ideas without writing a single line of code"
  - Van Hemert: "predicting how players would communicate the challenges using only their voice."
  - De Visser: "Explaining to each other what you're seeing without being able to show it"
  - Van Hemert: "The toughest part was balance." … "It proved quite difficult to put both players under stress and have them solve a difficult challenge"
- **Use:**
  - "Explaining to each other what you're seeing without being able to show it" is the cleanest one-line statement of the core interaction.
  - Paper prototyping with real walkie-talkies supports judging puzzles by playing them, before or without code.
- **Push back:** Van Hemert found it hard to put *both* players under stress. That argues against a design where one Player only reads while the other acts, and the README could take a side on it.

### B2. Eric Bartelson, "Total Mayhem Games are masters of the asymmetrical multiplayer puzzler", PreMortem Games, 31 May 2022

- **Interviewee:** Lucia de Visser, co-founder and managing director.
- **URL:** https://premortem.games/2022/05/31/total-mayhem-games-are-masters-of-the-asymmetrical-puzzler/
- **Verbatim (de Visser):**
  - "We liked games that made players dependent on each other to solve problems, like Keep Talking and Nobody Explodes"
  - "So we started to prototype that type of gameplay with just one simple goal: Try to escape together."
  - "Once we saw the prototype was fun to play and people really felt chemistry with other players while playing the game"
  - "We continuously develop new puzzle concepts and test them first with the team" … "examine if they're fun, too hard, too easy, or maybe really dreadful"
- **Use:**
  - The lineage is stated by the developers themselves: We Were Here comes from KTANE.
  - "Players dependent on each other" names the property the definition of good could require.
  - "Chemistry" was the studio's own bar for going ahead.
- **Push back:** "Chemistry with other players" came partly from strangers (see B3). Our target is friends playing in the same room, where the chemistry already exists before the game starts.

### B3. Total Mayhem Games, We Were Here store page and official page

- **URLs:**
  - https://store.steampowered.com/app/582500/We_Were_Here/
  - https://totalmayhemgames.com/games/we-were-here/
- **Verbatim:**
  - "Every room challenges your wits and ability to communicate clearly, using only your voice."
  - "each player has a completely different game experience."
  - "Note: This game requires both players to have a working PC-compatible microphone."
  - "If you like living on the edge, try playing it with a complete stranger!"
  - "We Were Here is the free pilot episode in a series of cooperative standalone puzzle adventures."
  - From the official page: "one of them being confined to a small secluded part of the castle" / "the other roams the halls trying to find and guide the other player"
- **Use:**
  - "Each player has a completely different game experience" is the asymmetric-view requirement, from the developer.
  - The microphone requirement is the cost our same-room decision avoids.
- **Push back:**
  - "Try playing it with a complete stranger" is the opposite of the small-web stance. The README can set game-with-friends against game-with-strangers explicitly.
  - Splitting the roles into one guide and one confined player is asymmetry of *role*. A design could instead split *information* with equal roles; the fan wiki says We Were Here Together moved this way, but that is not a primary source.

> Not used: a Photon Engine guest post by Total Mayhem ("Dev Story Total Mayhem Games") about microphone barriers and language-filtered lobbies turns up in search, but https://blog.photonengine.com/dev-story-total-mayhem-games/ returned **404**, so none of its claims are included.

---

## C. Communication as the mechanic, beyond the two inspirations

### C1. David L. Craddock, "Everybody Shake! The Making of Spaceteam – Chapter 3", Episodic Content, 5 February 2016

- **URL:** https://episodiccontentmag.com/2016/02/05/everybodyshake3/
- **Henry Smith, verbatim:**
  - "in a four-player game, there were four instructions people needed to follow simultaneously, but you only had one of them"
  - "you'd start to realize then that you're all playing the same game together."
  - "The chaos, the crazy stuff that happens, was almost always a win-win: it looked great and it felt right."
- **Article paraphrase:**
  - Smith left out music because it would drift out of sync across devices and distract from the shouting.
  - After testers were confused, he cut each screen to one instruction.
- **Use:**
  - The closest precedent for *same room, separate screens, talk out loud*. Each person's screen holds information someone else needs.
  - The cut to one instruction per screen is evidence for a small, readable per-Player view, which matters at 390×844.
- **Push back:** Spaceteam values chaos and shouting. A 15–30 minute puzzle attempt may want deliberate talk instead, which is closer to Kane's "hard decisions".

---

## D. Research on asymmetric and cooperative play

### D1. Harris, J. & Hancock, M. (2019). "To Asymmetry and Beyond!: Improving Social Connectedness by Increasing Designed Interdependence in Cooperative Play." *CHI '19*.

- **DOI:** https://doi.org/10.1145/3290605.3300239. The ACM page returned 403 to the fetcher; the abstract was read via the Semantic Scholar API.
- **Abstract (verbatim excerpts):**
  - "research has shown that not all multiplayer games are effective at promoting social engagement."
  - The study compares "symmetric cooperative play (e.g., where players have the same interface, goals, mechanics, etc.) to asymmetric cooperative play (e.g., where players have differing roles, abilities, interfaces, etc.)"
  - Findings: "asymmetric cooperative games may enhance players' perceptions of connectedness, social engagement, immersion, and comfort with a game's controls"
  - These can be improved "via deliberate mechanical design changes, such as changes in cooperative action timing and direction of dependence."
- **Use:**
  - Peer-reviewed evidence that asymmetry is a *reason* for good (connectedness), not just a style.
  - "Direction of dependence" is a precise design lever: who needs whom, and does it flip?
- **Push back:** The finding is hedged ("may enhance") and comes from one lab prototype. The README should say it is evidence, not proof.

### D2. Harris, J., Hancock, M. & Scott, S. D. (2016). "Leveraging Asymmetries in Multiplayer Games: Investigating Design Elements of Interdependent Play." *CHI PLAY '16*, 350–361.

- **DOI:** https://doi.org/10.1145/2967934.2968113. The abstract was read via the OpenAlex API.
- **Abstract (verbatim excerpts):**
  - "Many people develop lasting social bonds by playing games together"
  - People who want to play together "would normally choose vastly different games for themselves", for example "grandparents and grandchildren, highly skilled players and novices"
  - The paper studies "games that are designed to embrace and leverage differences between players to improve multiplayer engagement."
- **Use:** Asymmetry lets two *different* people share one game. That fits the 1920×1080 desktop beside the 390×844 phone, and a showcase stranger paired with a regular player.
- **Push back:** Its frame is mismatched players, but the marker plays both Players alone. The README could say which claims about good survive a solo marker and which can only be judged with two people.

### D3. Rocha, J. B., Mascarenhas, S. & Prada, R. (2008). "Game Mechanics for Cooperative Games." ZON Digital Games 2008, 72–80.

- **PDF:** https://fenix.tecnico.ulisboa.pt/downloadFile/395138343981/artigo.pdf (text extracted and read)
- **Verbatim:**
  - Complementarity: "One of the most commonly used design patterns in cooperative games is making sure that there is some complementarity between the characters that players control."
  - Other named patterns: "Synergies between abilities", "Abilities that can only be used on another player", "Shared Goals", "Synergies between goals (Interlaced/Intertwined goals)", "Special Rules for Players of the same Team".
  - On puzzles: "Logic and Inference, Lateral-Thinking, Memory, Intelligence, Knowledge-based and Pattern-recognition Challenges are a subset of pure challenges that appear to have little potential for cooperative play." Extra players mostly make these easier through "a Divide and Conquer approach".
  - On timers: race challenges "usually causes teams of players to focus and work together more tightly due to the additional pressure."
  - On doors: some "can be opened by using simultaneous switches that require cooperation between players."
- **Use:** A small vocabulary (complementarity, shared goals) for naming *which* kind of interdependence the game relies on.
- **Push back:** **This is the strongest "argue against" source.** It claims logic and inference puzzles have little potential for co-op. KTANE and We Were Here are counterexamples: split the information across Players and divide-and-conquer stops working. A README could make that its central move.

### D4. Seif El-Nasr, M., Aghabeigi, B., Milam, D., et al. (2010). "Understanding and Evaluating Cooperative Games." *CHI '10*, 253–262.

- **DOI:** https://doi.org/10.1145/1753326.1753363. The abstract was read via the OpenAlex API.
- **Abstract (verbatim excerpts):**
  - "we present a set of cooperative patterns identified based on analysis of fourteen cooperative games"
  - "we propose Cooperative Performance Metrics (CPM)"
  - "Videos of the play sessions were annotated using the CPMs, which were then mapped to cooperative patterns that caused them."
- **Use:** A published method for judging co-op quality by watching play and coding behaviours, rather than asking players afterwards. It fits the brief's "say … how the judged ones were judged".
- **Push back:** Secondary sources say the CPMs include things like laughing together and helping. Those specific metrics were **not** verified here, because the full text is paywalled. Cite only the abstract-level claim unless the full paper is read.

---

## E. The small web, situated software, home-cooked apps, games for friends

### E1. Clay Shirky, "Situated Software", 30 March 2004

- **URLs:**
  - Canonical: http://shirky.com/essays/situated-software/. Over HTTPS it fails with a self-signed certificate error, which may break a CI link check.
  - Mirror (resolves, read in full): https://gwern.net/doc/technology/2004-03-30-shirky-situatedsoftware.html
- **Verbatim:**
  - "This is software designed in and for a particular social situation or context."
  - The "Web School", "where scalability, generality, and completeness were the key virtues"
  - "applications to be used by dozens of users, an absurd target population in current design practice."
  - "by privileging the value that comes with scale" … "put other kinds of value, particularly social value, out of reach."
  - "You could make one for your mom, though."
  - "an attitude about closeness of fit between software and its group of users" … "a refusal to embrace scale, generality or completeness as unqualified virtues."
  - "the designer can simply assume the group has a certain capability, without needing to recapitulate it in code."
  - "The application's lack of generality or completeness, in other words, communicated something -- 'We built this for you'"
  - Limits he admits: "greater brittleness if it is later called on to handle larger groups, and a potentially shorter lifespan"; "Most damning of all, it wouldn't scale"
- **Use:**
  - The anchor small-software citation.
  - "Assume the group has a certain capability, without needing to recapitulate it in code" justifies the same-room decision directly: the two friends' voices *are* the channel, so the app need not build one.
  - "Closeness of fit" can stand in for good.
- **Push back:**
  - Situated software leans on *existing* social fabric. The marker plays both Players alone, and the showcase pairs strangers. Neither is the friend group Shirky describes.
  - His admitted "shorter lifespan" clashes with the brief's persistence-across-redeploys requirement. The README can say which of Shirky's freedoms the course removes.

### E2. Robin Sloan, "An app can be a home-cooked meal", February 2020 (updated yearly through February 2026)

- **URL:** https://www.robinsloan.com/notes/home-cooked-app/
- **Verbatim:**
  - "I made a messaging app for, and with, my family. It is ruthlessly simple; we love it; no one else will ever use it."
  - "I am the programming equivalent of a home cook."
  - "When you liberate programming from the requirement to be professional and scalable, it becomes a different activity"
  - "just as cooking at home is really nothing like cooking in a commercial kitchen."
  - "It already knows exactly who's using it."
  - "Unlike Tapstack, my app doesn't need a login system." / "It doesn't need an interface to create and manage contacts."
  - "There will be no sudden redesign, no flood of ads, no pivot to chase a userbase inscrutable to us."
  - "it has remained steady at four daily active users, with zero churn"
- **Use:**
  - The clearest case that what you *leave out* is part of good: no login, no contacts. This maps onto the README's "what you chose not to build".
  - "It already knows exactly who's using it" fits a two-Player Team.
- **Push back:**
  - Sloan can skip login because he knows all four users. The brief demands server-side checks on what each person may see and change, so the game cannot fully be a home-cooked meal.
  - The README can name where it departs: it is cooked for two friends, but served to a marker and to strangers at a showcase.

### E3. Maggie Appleton, "Home-Cooked Software and Barefoot Developers", Local-first Conference, Berlin, May 2024 (talk and transcript)

- **URL:** https://maggieappleton.com/home-cooked-software
- **Verbatim:**
  - "Home-cooked apps, like meals, are apps you make for the people you know and love."
  - "It's software someone might build for themselves, their family and friends, their neighborhood and community."
  - "These are things only a few people need, but there's a nearly infinite amount of them."
  - "Most of the software needs of local communities could be solved with simple CRUD apps persisting data over time"
  - Caveat: "Perhaps they're just creating more crap code and bugs for everyone to deal with down the line."
- **Use:** Links Sloan and Shirky to *agentic coding*: language models make home-cooked software cheap to build. This is directly relevant to a course on agentic coding.
- **Push back:** Her own "crap code and bugs" caveat. The README can argue that `spec/` checks are what keep an agent-built home-cooked app from turning into that.

### E4. Darius Kazemi, "How to run a small social network site for your friends", 8 July 2019 (revised 12 November 2024)

- **URL:** https://runyourown.social/
- **Verbatim:**
  - "Running a social network site is community building first and a technical task second."
  - "Friend Camp is an intentionally small social network"
  - "software does not have to scale, and in fact software can be better if it is not built to scale"
  - "A stern talking-to is a laughable deterrent for most sites but it works for us because we are so tight knit."
  - Costs: "it takes about 2 hours a week of my own time to maintain"; "if I got hit by a bus, the server would probably run until its first crash and then never come back again."
- **Use:**
  - "Software can be better if it is not built to scale" is the bluntest version of the small-web claim.
  - It is grounded in a year of actually running such a site.
  - The "stern talking-to" line is Shirky's social-fabric point, with evidence.
- **Push back:** The bus-factor line. The brief's marker returns "the next day after the machine has restarted", so the game must survive without its maker. That is a place where good here is *stricter* than the small-web ideal.

### E5. Ben Hoyt, "The small web is beautiful", March 2021

- **URL:** https://benhoyt.com/writings/the-small-web-is-beautiful/
- **Verbatim:**
  - Small in the sense "that you built it yourself, you understand all of it, and you run it on a single server or static file host"
  - "it's not just about raw size, but about an 'ethos of small'."
  - "Fewer moving parts. It's easier to create more robust systems and to fix things when they do go wrong."
  - Caveats: "raw size isn't enough – a 2KB site with no real content isn't much good"; "small doesn't have to mean ugly"
- **Use:**
  - Fits the hosting constraint of one shared-cpu-1x 256 MB Fly machine and one volume.
  - Gives a technical side of good (few moving parts, understandable) to set beside the social side.
- **Push back:**
  - Hoyt admits he mostly applies this to personal projects; his day job, Juju, "is not a small system by most measures."
  - A 3D client is the opposite of small. If 3D survives its trial, the README has to argue against Hoyt.

### E6. Farfama, "Make Games For An Audience of 1", 23 December 2024

- **URLs:**
  - https://farfamahar.github.io/blog/make-games-for-an-audience-of-1/
  - Cross-post: https://itch.io/blog/858149/make-games-for-an-audience-of-1
- **Verbatim:**
  - "We're constantly told that we need X amount of wishlists or Y amount of active players to be 'successful'."
  - "Success to me isn't measured in numbers."
  - "Every year I make a few games for friends and family."
  - "These are made for people I know deeply, so potential critique isn't a concern."
  - "Don't worry at all about polishing the experience."
- **Use:** The only source found that is specifically about *games for a few friends*, which is the brief's own phrase. It is short, first-person and quotable.
- **Push back:**
  - "Don't worry at all about polishing" does not survive a marker, a showcase, or two marking viewports.
  - The author is pseudonymous and lower-trust than the others, so cite it as one practitioner's view.

### E7. Anna Anthropy, *Rise of the Videogame Zinesters* (Seven Stories Press, 2012), as quoted in Scott Juster's review, PopMatters, 28 June 2012

- **URL (review):** https://www.popmatters.com/160134-2495839858.html
- **Book text quoted in the review:** "What I want from videogames is for creation to be open to everyone, not just to publishers and programmers." (p. 10); "new, inventive ways to distribute games" (p. 161)
- **Use:** The canonical book-length argument for personal, small-audience games.
- **Push back / caution:** Seen only second-hand, through the review. Check the book before quoting it. Lower priority than E1–E4.

---

## Tensions the README could argue across

These are pairings of sources, not prose.

1. **Ambiguity:** Kane says "Guessing is always bad" (A1, A2). De Visser says the fun is "Explaining to each other what you're seeing without being able to show it" (B1). Is the challenge in *describing*, or in *deciding*?
2. **Pressure:** Kane says "Then add stress!" and Rocha et al. say races make teams "work together more tightly" (A1, D3). Van Hemert says stressing *both* players is "the toughest part" (B1). Timer or no timer is still open on the map.
3. **Friends or strangers:** Shirky, Sloan, Kazemi and Pestaluky put value in existing relationships (E1, E2, E4, A3). We Were Here's store page says "try playing it with a complete stranger!" (B3). The marker is a solo stranger playing both seats.
4. **Small and lasting:** Shirky admits a "potentially shorter lifespan" and Kazemi a bus factor (E1, E4). The brief requires persistence across restarts and redeploys.
5. **Co-op puzzles:** Rocha et al. say logic and inference puzzles have "little potential for cooperative play" (D3). KTANE and We Were Here are the counterexamples.
6. **Rules as data:** KTANE generates the manual from the same rule data the game executes (A1). This is an enforceable claim, and it lines up with the server-authoritative, rule-text-beside-logic direction from Dead Air.

## Strongest picks (for a 400–600 word README)

1. A1/A2 Kane, GDC 2016: communication is the game; hard decisions with easy input; unambiguous rules; manual generated from rule data.
2. B1 Van Hemert / De Visser: explaining what you see without being able to show it; prototyped with real walkie-talkies.
3. E1 Shirky: designed for a particular social group; assume the group's capability rather than recapitulating it in code.
4. E2 Sloan: home-cooked; what you leave out (login, contacts) is part of good.
5. E4 Kazemi: software can be better if it is not built to scale; the bus factor as a counterpoint.
6. D1 Harris & Hancock: asymmetry may enhance connectedness; "direction of dependence" as a lever.
7. D3 Rocha et al.: a claim to argue against (logic puzzles make poor co-op).
8. E3 Appleton: home-cooked software in an agentic-coding context, plus her own "crap code" caveat.

## Leads not pursued or not verifiable

- **Photon Engine "Dev Story Total Mayhem Games":** 404. Claims about microphone barriers and language lobbies are unverified.
- **NYU Game Center IGF interview** (https://gamecenter.nyu.edu/igf-interviews-keep-talking-and-nobody-explodes/): resolves, but it is all paraphrase with no developer quotes, so A1–A4 supersede it.
- **Venkatesh Rao, "cozy web"** (via Maggie Appleton, https://maggieappleton.com/cozy-web): relevant to private small spaces, but no first-party Rao text was found.
- **Jackbox (browser as controller):** no first-party design talk was found, only marketing pages from competitors.
- **The GDC Vault video of Kane's talk** was not watched. The slides and the Game Developer report cover it.

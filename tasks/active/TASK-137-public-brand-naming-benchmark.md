# TASK-137 — Skadyn Idle Public Naming and Display Copy

## Metadata

- State: ACCEPTANCE
- Readiness: prior Human authorization enabled the bounded local Skadyn Idle copy pass; source QA and delegated PM technical acceptance now complete. A later visual-name preference leaves Human inspection of this code candidate and any further public display-copy decision pending.
- Class: B
- Implementation owner: LD → ChatGPT prime
- Owner execution surface: Chat On Steroids Core (current local checkout, bounded edits only)
- Control branch: `main`
- Control worktree: `.`
- Reviewer: QA → independent worker-1 (final brand source READY P0/P1/P2 = 0/0/1; P2 nonblocking) and independent worker-2 (Auth/Security READY 0/0/0)
- Reviewer execution surface: Chat On Steroids Core (both final reviews strict read-only on the current post-implementation source)
- Auditor: N/A
- Auditor execution surface: N/A
- Consultants: N/A
- Class-B independent acceptance: separately assigned independent PM worker-3 **technical ACCEPT P0/P1/P2 = 0/0/1**, with explicit nonblocking P2 deferral, after final QA. The Human Owner's later decision to inspect/reconcile existing app copy remains pending; neither product-copy signoff nor Git history/release is authorized.
- Branch/worktree: current control-plane `main` / `G:\pokenexus-idle`, already dirty with unrelated uncommitted TASK-136 work. Exception to preferred isolated worktree is limited to scoped cosmetic copy edits in existing current files, including untracked Alpha entry/mail code. Do not switch, reset, restore, clean or create Git history.
- Dependencies: **Skadyn Idle** was the previously authorized local display-copy implementation name and remains the internal project/code name. The Human Owner has since preferred **Skadyn Poke Idle** for visual branding and will review existing code changes before any further display-copy decision. Art/mark acceptance, domains, launch and TASK-136 operational gates remain separate.

## Current implementation name and visual branding split

The Human Owner moved beyond both `Poké [one word] Idle` and the earlier `Nexus` proposals. The earlier scoped local display-copy pass used **Skadyn Idle**, which the Human Owner now distinguishes as the **internal project/code name**. **Skadyn Poke Idle** is the more recent preference for visual brand artwork. The Human Owner has **not yet reviewed/accepted the existing code changes**. Skadyn is a modern invented form with Norse *Skaði/Skadi* inspiration, not an authentic Old Norse term or a legally cleared trademark. No public launch is authorized.

The title used by the current local code implementation is separate from the subsequently selected *visual lockup* wording:

1. **Skadyn Idle** — internal project/code name and current local app/operator copy candidate, with existing implementation still awaiting Human Owner code review.
2. **Skadyn Poke Idle** — Human Owner's preferred *visible brand artwork* wording (unaccented as supplied), for logo/banner/graphic exploration; no additional application-code changes authorized by this preference.

**No “Studios”.** `Skadyn Project` is permissible for internal working documents, not a selected public wordmark. The Human still decides the final logo, identity mark, domain and publication. Existing TASK-137 changes, their QA and their review state are preserved; the art lockup preference does not imply approval of code already changed or authorize its deployment.

The canonical visual integration study is `docs/project/VISUAL_IDENTITY_SKADYN_IDLE_ART_DIRECTION.md` (**DRAFT**). It carries forward the approved **HD Pixel-Inspired 2D** finish and independent-relic construction rules, preserving all earlier Nexus studies as source evidence. No color tokens, iconography, story, auth RP/origin, Resend sending domain or asset master is renamed by this display-copy task.

Before any **external** launch: independently screen **Skadyn**, **Skadi** and phonetic/commercial neighbors (including games and visual-design services); validate preferred `.com.br`/`.com` at registrar checkout and INPI (including classes 9/41), test artwork at 128/64/32/16 px and assess separate Pokémon character/data rights.

## Authorized Class-B implementation scope

Replace literal brand copy visible to a user/operator: web HTML/route titles and navigation, visible HUB/Alpha text, preview workbench titles and downloaded filename, API/realtime root placeholder text, WebAuthn **display** names, Alpha Resend subject/body copy, the example mail **display name** in the local operator guide, README/contributing headings and public Discord copy. Align representative tests and add focused name assertions.

**Invariants (out of scope):** `@pokenexus/*` packages/imports, repository/worktree names, database schemas, SQL, migrations, worker/Wrangler names, `POKENEXUS_*` environment keys, `pokenexus:*` persisted protocol/storage IDs, `__Host-pokenexus_*` cookie names, auth RP ID, exact allowed Origin, session/CSRF/security code, real Resend `From` domain, local `http://localhost:5173/` mail link, game content/logic, graphics and historic exploratory identity studies. The changed WebAuthn **RP display label** is not the RP ID. Do not send email or start/stop local Alpha services for this cosmetic change.

**Validation/acceptance:** focused brand tests and package-wide **web 186/186**, **API 300/300**, **realtime 2/2** passed again on the current candidate; web build, API/realtime Worker dry-run builds, scoped TypeScript ESLint, typechecks, `git diff --check` and roadmap checks (138 tasks) also passed. The repository-wide `eslint .` was stopped after running much longer than the bounded check, so it is **not** claimed as PASS. Independent brand and Auth/Security QA reviewed post-implementation source, followed by a distinct independent PM Class-B **technical ACCEPT**. The nonblocking P2 and its deferral are recorded below. The Human Owner's separate inspection of local code and final public display-copy decision are still pending. No commit, merge, push or deployment authorized.

## Final technical QA, Class-B gate and P2 deferral — 2026-10-15

- **Reviewed candidate:** current shared dirty `main`, HEAD `558adb6`, bounded TASK-137 Skadyn Idle display-copy implementation; unrelated uncommitted TASK-136 and telemetry work remain untouched. QA/PM reviewed source read-only.
- **Brand source QA:** independent worker-1 **READY P0/P1/P2 = 0/0/1**. Skadyn Idle is consistently present in main HTML/routes/HUB, Alpha entry/sign-in, previews/export filename, WebAuthn/Resend display copy, API/realtime placeholders, README and Discord materials. No remaining old player-visible PokeNexus string in reviewed application surfaces.
- **Auth/security QA:** independent worker-2 **READY 0/0/0**. RP ID/allowed Origins and WebAuthn identity/challenge/credential verification remain unchanged; `__Host-pokenexus_*` cookies, CSRF/HMAC domains, persisted protocol/storage keys, operator `ALPHA_EMAIL_FROM` address and `http://localhost:5173/` mail link are retained.
- **P2 — mounted browser-effect automated coverage (accepted nonblocking):** `apps/web/src/App.test.tsx` uses `renderToStaticMarkup`, so it does not execute `apps/web/src/alpha-entry.tsx`'s `document.title` mount effect or click the sign-in-only branch. No actual functional bug was found; there is no existing DOM/browser test harness. Adding dependencies, fake React hooks or production test-only seams would broaden this cosmetic patch without proportionate value. **Deferred real-browser check (TASK-136, only after its own security gate):** unauthenticated title `Closed Alpha · Skadyn Idle`, click sign-in toggle and inspect copy, open an authenticated Hunt route, then sign out and confirm title returns to Closed Alpha. This is not a claim of live mail or two-browser acceptance today.
- **Independent Class-B PM:** separate worker-3 **technical ACCEPT 0/0/1**, expressly accepting the P2 deferral under `docs/agents/workflow.md` Definition of Done. This concludes delegated technical/cosmetic source acceptance only. The Human Owner has since selected **Skadyn Poke Idle** for visual lockup exploration while reserving personal review of the existing Skadyn Idle code implementation and any further public display-copy decision. TASK-136 security/operational gates, visual asset/logo, domain/IP, external publication and Git history all remain separate and pending.

## Historical naming exploration — superseded by SKADYN

An **earlier** owner naming iteration explored **Poké [Name] Idle**, where [Name] was one real, short word similar in compactness to Nexus. This was superseded by the standalone Skadyn direction above; `Poké` and the older candidates are **not required** for the public identity.

That earlier phase favored short pronounceable words and rejected long fantasy compounds. Its market/domain findings below remain archival research, not the current shortlist. Existing `Poke Nexus Idle` technical strings stay unchanged pending a separate authorized public rebrand.

## Historical shortlist (one word in the middle)

| Full readout | Core association | Main weakness / screening status |
| --- | --- | --- |
| **Poké Vigor Idle** | Strength, steady training, better results, growth and competitive spirit. | Can evoke physical conditioning. No obvious exact same-name Pokémon game surfaced in the limited web screen; name and trademark NOT cleared. |
| **Poké Tempo Idle** | Passing time, cadence, repeatable improvement, Idle progress. Familiar PT word. | More mechanical than adventurous. Nearby use of Poketempo for a product and a Pokémon weather social account under poke_tiempo. |
| **Poké Epoch Idle** | Generations, long-term progress, nostalgic eras; retro visual potential. | Less direct fighting/training cue; Epoch is a region/form label inside an unrelated Pokémon Soulstones fan game. |
| **Poké Phase Idle** | Stages, changes, evolution/progression, clean iconic shapes. | Existing Pokémon YouTube account named PokePhase; collision in same fandom, so lower priority. |
| **Poké Strive Idle** | Effort, challenges, training and earned achievement. | Harder PT pronunciation; Pokémon-content social handle pokestrive already used. Hold rather than preferred. |

These historical options were comparison candidates only; none was approved as a public name.

## Names screened out due to existing uses

- **Poké Ascent**: [Poké Ascent](https://pokeascent.app/) and [Pokémon Ascent ROM hack](https://www.pokeharbor.com/2022/05/pokemon-ascent/) already use the idea.
- **Poké Forge**: [PokéForge](https://www.pokeforge.dev/) active Pokémon-themed sandbox.
- **Poké Nova**: [PokeNova](https://pokenova.com.br/) active Pokémon idle browser game.
- **Poké Pulse**: [PokePulse](https://pokepulse.app/) existing Pokémon TCG tracker.
- **Poké Zenith**: [PokeZenith](https://www.pokezenith.com/) active Pokémon TCG merchant.
- **Poké Summit**: [PokéSummit](https://www.pokesummit.com.au/) Pokémon TCG retailer.
- **Poké Orbit**: [Poke-Orbit](https://github.com/GiorgioMaroki/Poke-Orbit) Pokémon GO game project.
- **Poké Axis**: [PokéAxis TradeHub](https://discord.com/servers/pokemon-network-center-legends-za-793732974365245440) active Pokémon trading community.
- **Poké Vertex**: [PokéVertex](https://pokeanalyzer.pokevertex.com/) Pokémon card search use.
- **Poké Beacon**: [PokéBeacon](https://pokebeacon.com/) Pokémon fan game and database portal.
- **Poké Echo**: [Pokémon Echo fan RPG](https://pokemon-echo.webflow.io/) already exists.
- **Poké Peak**: [PokePeak](https://www.pokepeak.fun/) active Pokémon-inspired site.

These are web-screening conflicts, not legal infringement rulings. Some names are used by shops or fan utilities rather than video games; that distinction remains important for later assessment.

## Initial domain evidence

Operator checks started **2026-10-15T16:04:29Z**. For the five shortlisted forms listed below, Registro.br returned **status=0** (reported available .com.br) and Verisign RDAP returned **HTTP 404** (no .com registry record at that instant). Dynamic endpoints are not reservations, proof of a usable domain at checkout or trademark protection.

| Name base | Registro.br | Verisign .com RDAP |
| --- | --- | --- |
| pokevigor | [pokevigor.com.br](https://registro.br/v2/ajax/avail/raw/pokevigor.com.br) | [pokevigor.com](https://rdap.verisign.com/com/v1/domain/pokevigor.com) |
| poketempo | [poketempo.com.br](https://registro.br/v2/ajax/avail/raw/poketempo.com.br) | [poketempo.com](https://rdap.verisign.com/com/v1/domain/poketempo.com) |
| pokeepoch | [pokeepoch.com.br](https://registro.br/v2/ajax/avail/raw/pokeepoch.com.br) | [pokeepoch.com](https://rdap.verisign.com/com/v1/domain/pokeepoch.com) |
| pokephase | [pokephase.com.br](https://registro.br/v2/ajax/avail/raw/pokephase.com.br) | [pokephase.com](https://rdap.verisign.com/com/v1/domain/pokephase.com) |
| pokestrive | [pokestrive.com.br](https://registro.br/v2/ajax/avail/raw/pokestrive.com.br) | [pokestrive.com](https://rdap.verisign.com/com/v1/domain/pokestrive.com) |

## Historical Nexus / Bond semantic territory

The earlier Nexus/Bond study compared elegant connection and partnership synonyms in the once-proposed **Poké [one word] Idle** format. This territory has been superseded by the Skadyn proposal.

| Middle word | Meaning and game association | Caveat |
| --- | --- | --- |
| **Elo** | Literal Portuguese link/bond; also evokes the Elo performance-rating concept familiar to competitive gamers. Compact, clear in PT-BR. | The rating association could incorrectly suggest PvP rankings that are not part of the current Alpha. |
| **Pact** | Short, strong alliance/agreement and lasting trainer–creature partnership. | Reads more like a formal pact than friendship; English word unfamiliar to some PT-BR users. |
| **Conflux** | Meeting/convergence of paths and entities, one of the closest evocative alternatives to Nexus. | Less familiar and less effortless to pronounce in PT-BR. |
| **Accord** | Harmony, agreement, voluntary cooperation. | Soft tone; strong non-game use of the standalone word (including an automobile name). |
| **Affinity** | Deep compatibility and connection between trainer and creature, including team synergy. | Eight letters; sounds like a mechanic rather than a world identity. |
| Kin | Family, kinship and a felt bond; only three letters. | `Pokékin` is already an established Pokémon-fandom identity term, and the `.com` is registered. Lower priority. |

**Screened out for relevant direct usage:** [Poke-Link PC](https://pokelinkpc.com/) already serves Pokémon collectors/traders; [Poke Union](https://discord.do/pt/poke-union/) already names a Pokémon-style MMO; and [PokéSync](https://forums.pokecharms.com/threads/pokesync-discussion-thread.25402/) has existing Pokémon roleplay use. No trademark opinion follows from these references.

Operator domain probes began **2026-10-15T16:17:05Z**. The Registro.br raw endpoint reported `0` for `.com.br` and Verisign RDAP returned `.com` HTTP `404` for **pokeelo**, **pokepact**, **pokeconflux**, **pokeaccord**, **pokeaffinity**, **pokeconcord**, and **pokeweave**. `pokekin.com` was registered and `pokesync.com.br`/`.com` were registered. Example official query references: [pokeelo.com.br](https://registro.br/v2/ajax/avail/raw/pokeelo.com.br), [pokepact.com.br](https://registro.br/v2/ajax/avail/raw/pokepact.com.br), [pokeconflux.com.br](https://registro.br/v2/ajax/avail/raw/pokeconflux.com.br), [pokeaffinity.com.br](https://registro.br/v2/ajax/avail/raw/pokeaffinity.com.br), and [pokeelo.com RDAP](https://rdap.verisign.com/com/v1/domain/pokeelo.com). Dynamic status is preliminary only, neither a reservation nor clearance of similar names/marks.

The **Poké** prefix itself creates separate Pokémon trademark/IP considerations, independently of the availability of the central word and domain. Reconfirm the chosen candidate at INPI and in game/app/community markets before any registration/public deployment.

## Historical epic single-word direction

Before choosing Skadyn, the Human Owner requested **more epic names** after the Nexus/Bond study remained unconvincing. This phase still considered **Poké [one real existing word] Idle**, **now superseded**. Here *epic* means a sense of scale, perseverance, discovery, power and a visual symbol; it does not authorize new fantasy lore, PvP, an empire or features absent from the current solo/Idle gameplay.

| Middle word | Intended positioning | Material risk |
| --- | --- | --- |
| **Exalt** | Achievement, ascending beyond limits, optimizing the strongest team; compact and assertive. | Verb rather than noun; unfamiliar to some PT-BR speakers, and adjacent Pokémon TCG *Dragons Exalted* naming exists. |
| **Regent** | Noble leadership, prestige and a concise six-letter crest/wordmark. | Royal theme may imply kingdom/territory mechanics not currently offered; term appears as a trainer rank in another fan game, not a verified exact-title clash. |
| **Axiom** | Logic, mastery and the mathematical optimization side of the game; short, clean high-tech logo. | More analytical than heroic; weaker player-facing capture/creature imagery without art. |
| **Sentinel** | Guardian, determination, protection and an imposing emblem. | Eight letters, longer than Nexus; can imply defensive gameplay rather than a creature-collection loop. |

These are **unapproved brand directions**, with no definitive legal clearance. Favor comparing *Exalt*, *Regent*, and *Sentinel* as three different feelings — achievement, prestige, and heroism. *Axiom* remains a strategic/numerical wildcard with a less mythic tone. These subjective judgments are not validated consumer scores.

### Collision notes and preliminary domains

- **Direct/current same-fandom names that block a confident new title:** [PokeLegacy Online](https://www.pokelegacyonline.com.br/) (Pokémon browser idle), [PokeSaga](https://pokesaga.org/) (Pixelmon community), [PokeOdyssey](https://www.curseforge.com/minecraft/modpacks/poke-odyssey) (Cobblemon server/modpack), [PokeFable](https://otarchive.com/server/6797acc11e4f84bfb60662cb) (PokéTibia server), [PokeGenesis](https://www.mpcforum.pl/topic/1688159-pokegenesis-start-bety-31072026-ots-tworzony-z-pasji-do-pokemonow-od-gracza-dla-graczy-nowoczesny-client-launcher/) (2026 PokéTibia beta), and a [PokéAPEX Pokémon database app](https://github.com/dbeniteza/PokeAPEX). *Legacy*, *Saga*, *Odyssey*, *Fable*, *Genesis* and *Apex* are therefore unsuitable for this iteration even if domains are available.
- **Further relevant name overlap:** [Pokémon Arcana Force](https://www.pokecommunity.com/threads/pok%C3%A9mon-arcana-force.538420/) was released in 2025–26; **Arcana** is lower priority. Other fan games and TCG sellers use short epic words such as *Relic*, *Mythos*, *Aegis*, *Paragon*, *Glory*, *Titan*, *Vanguard* and *Crown*. Their exact/adjacent categories must be distinguished; avoid treating free domains as brand clearance.
- **Oath excluded:** [Pokémon Oath](https://www.pokecommunity.com/threads/the-pokemon-oath-team-recruitment-thread.540303/) is an independently named Pokémon fangame in development during 2026, in addition to *Pokémon Legends: Twilight Oath*. The dictionary word remains viable in other contexts, but creates avoidable same-fandom title confusion here.
- **Quasar excluded from preferred shortlist:** a Pokémon TCG seller uses the exact [`pokequasar` identity on eBay](https://www.ebay.com/itm/376764263670). This is an adjacent seller rather than a competing game, but is a direct handle collision. The related [Quasartico Inc.](https://bulbapedia.bulbagarden.net/wiki/Quasartico_Inc._%28building%29) is a different official Pokémon setting term, not an independent game-title collision.
- Domain probes from the operator workstation on **2026-10-15** returned Registro.br `status=0` for `pokeexalt.com.br`, `pokequasar.com.br`, `pokeoath.com.br`, `pokeaxiom.com.br` and `pokesentinel.com.br`; Verisign RDAP returned HTTP `404` for corresponding `.com` forms. Example independently reproducible endpoints: [pokeexalt.com.br](https://registro.br/v2/ajax/avail/raw/pokeexalt.com.br), [pokequasar.com.br](https://registro.br/v2/ajax/avail/raw/pokequasar.com.br), [pokeoath.com.br](https://registro.br/v2/ajax/avail/raw/pokeoath.com.br), [pokeaxiom.com.br](https://registro.br/v2/ajax/avail/raw/pokeaxiom.com.br), [pokesentinel.com.br](https://registro.br/v2/ajax/avail/raw/pokesentinel.com.br) and [pokeexalt.com RDAP](https://rdap.verisign.com/com/v1/domain/pokeexalt.com). These are mutable, unreserved availability **indicators**, not legal trademark clearance.

## Decision gates

1. The prior **Skadyn Idle** local display-copy implementation passed independent source QA and delegated Class-B **technical ACCEPT 0/0/1** (P2 coverage deferral recorded above). It is now in ACCEPTANCE awaiting the Human Owner's inspection/decision about those code changes. Preferred visual brand artwork uses **Skadyn Poke Idle**; any reconciliation of user-visible app copy is a separate follow-up after Human review.
2. Research exact/phonetic variants of Skadyn and Skadi in official [INPI trademarks](https://www.gov.br/inpi/pt-br/servicos/marcas) (including classes 9 software and 41 entertainment), international marks, game stores, social handles and domain purchase availability before any public launch.
3. Brand iconography and logo typography still require independent visual Human approval. Evaluate use of **Poke/Poké** and existing Pokémon characters/assets/data separately.
4. Future public-domain deployment, provider sending domain and WebAuthn **RP ID** changes require their own gated implementation, not this copy pass.
5. No Git history mutation, public deployment, provider activation, DNS registration or final logo approval is implied by this authorized local change.

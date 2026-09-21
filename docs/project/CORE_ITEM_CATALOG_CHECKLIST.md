# PokeNexus — Core Item Catalog Checklist

Status: **CAPTURED — 2026-09-20**
Owner: **Human Owner**
Scope: TASK-087 first Kanto/Johto Core review candidate (`National Dex 1..251`)

## Purpose

TASK-087 now uses an explicit `profile.items[]` whitelist. Nothing enters the first Core Item
catalog by generation, upstream category, examples, or open discovery. This checklist fixes the
exact membership before the first real full-candidate review artifact is generated.

The identifiers below use the Bulbapedia-primary `sourceKey` produced by the accepted TASK-087
parser. Display names are review labels only. Selecting an Item here approves static identity
membership, not executable behavior; Item rules remain owned by their accepted rule/spec tasks.

## ITEM-01 — Ability-change Items

The existing Core decision explicitly adopted Ability Capsule + Ability Patch.

- [ ] Include both in the Core Item catalog:
  - `ability-capsule` — Ability Capsule
  - `ability-patch` — Ability Patch
- [X] Keep their static identities out of TASK-087 until executable Ability-item rules are authored

## ITEM-02 — Nature Mints

The existing Core decision adopted Nature Mints, but did not capture exact Item membership.

- [X] Include the complete current Mint family in the Core Item catalog:
  - `lonely-mint`
  - `adamant-mint`
  - `naughty-mint`
  - `brave-mint`
  - `bold-mint`
  - `impish-mint`
  - `lax-mint`
  - `relaxed-mint`
  - `modest-mint`
  - `mild-mint`
  - `rash-mint`
  - `quiet-mint`
  - `calm-mint`
  - `gentle-mint`
  - `careful-mint`
  - `sassy-mint`
  - `timid-mint`
  - `hasty-mint`
  - `jolly-mint`
  - `naive-mint`
  - `serious-mint`
- [ ] Use an explicit smaller Mint subset instead; list exact `sourceKey` values below:

```text

```

## ITEM-03 — Hyper Training resources

Hyper Training is approved for the Core, but the accepted decision does not require an Item-based
implementation.

- [X] Include both standard Hyper Training resources:
  - `bottle-cap` — Bottle Cap
  - `gold-bottle-cap` — Gold Bottle Cap
- [ ] Hyper Training will not depend on Item identities; exclude both from the TASK-087 Core catalog

## ITEM-04 — Apricorn Balls

Apricorn Balls are approved for launch. The exact static roster still needs capture.

- [X] Include the complete standard Apricorn Ball family:
  - `fast-ball` — Fast Ball
  - `friend-ball` — Friend Ball
  - `heavy-ball` — Heavy Ball (Gen II identity)
  - `level-ball` — Level Ball
  - `love-ball` — Love Ball
  - `lure-ball` — Lure Ball
  - `moon-ball` — Moon Ball
- [ ] Use an explicit smaller Apricorn Ball subset; list exact `sourceKey` values below:

```text

```

`heavy-ball-hisui` is a distinct Gen VIII source identity and is **not** included by the standard
Apricorn Ball option above.

## ITEM-05 — Other capture Items

Capture-item mechanics exist independently of this membership decision. Choose exact additional
capture Item identities, if any, for the first Core catalog.

- [X] No additional capture Items in this first Core catalog
- [ ] Include this explicit set of additional capture Item `sourceKey` values:

```text

```

## ITEM-06 — Held Items

Held Items are approved for launch, but no accepted document currently defines their exact roster or
effect set.

- [X] Defer Held Item catalog membership until the owning Held Item/rule content defines the roster
- [ ] Include this explicit Held Item `sourceKey` set now:

```text

```

## ITEM-07 — TMs / machine Items

TASK-087 stores selected Learnset machine identifiers, while machine/item-to-Move relations and Move
acquisition semantics are owned by TASK-088.

- [X] Keep TM Item identities outside this first TASK-087 Core catalog; TASK-088 will define the
      exact machine Item roster and relation
- [ ] Include this explicit TM Item `sourceKey` set now without assigning Move-acquisition behavior:

```text

```

## ITEM-08 — Evolution Items

Evolution graph/triggers are outside TASK-087 and the accepted Core direction allows adapted methods.

- [X] Defer Evolution Item membership until the accepted evolution graph/rules identify required
      Item identities
- [ ] Include this explicit Evolution Item `sourceKey` set now:

```text

```

## ITEM-09 — Other consumables / inventory content

- [X] No other Item identities in the first Core catalog
- [ ] Include these additional exact `sourceKey` values:

```text

```

## Capture rule

When this checklist is accepted, TASK-087 must materialize `profile.items[]` from exactly the selected
`sourceKey` set, with one explicit PokémonDB complementary URL per Item. The generated review stage
must contain the same exact Item key set; no later discovery may add Items implicitly.

Captured membership count: **30 Items** — 21 Nature Mints, Bottle Cap, Gold Bottle Cap, and the
7 standard Apricorn Balls selected above. All other ITEM-01/05/06/07/08/09 branches selected above
remain outside or deferred from this first TASK-087 Core catalog exactly as marked.

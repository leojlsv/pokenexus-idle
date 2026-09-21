# PokeNexus Idle — MoveDefinition Checklist

> **Status:** CAPTURED / PARTIAL HUMAN-APPROVED em 2026-09-18.
>
> **Captured SHA-256:** `AAF5266EC35C235B487BF5FE98569BCFE0C5C6474E42A4BDDA9388A9C339D267`
>
> A opção `MOVE-03 = DECIDIR CAMPO A CAMPO` mantém aberto somente o placement/shape dos campos
> estáticos ainda não aprovados individualmente. As demais cinco escolhas deste checklist estão
> ratificadas.
>
> **Objetivo:** fechar somente as decisões que ainda mudam de fato a arquitetura de dados de Moves.
> O comportamento executável continua pertencendo ao `MoveRule` já aprovado no motor.

Alterar qualquer opção marcada reabre o respectivo Human gate.

---

# Já decidido

- Bulbapedia é a fonte factual primária; PokémonDB é complementar.
- O Core usa Physical / Special / Status por Move.
- O motor usa **Global Action Cooldown + cooldown individual por Move**.
- PP **não é consumido**.
- **Normal Base Cooldown de Pokémon Legends: Z-A** é a referência primária de cooldown quando
  houver correspondência clara.
- Sem Z-A utilizável, a curva já implementada **Power + Base PP** é fallback para simple-damage
  Moves compatíveis.
- Status/complex Moves sem Z-A utilizável precisam de cooldown explícito no `MoveRule`.
- Override explícito/versionado pode substituir Z-A ou fallback.
- Não importamos Speed scaling, wind-up, duração, range espacial, Plus Moves ou outras regras
  real-time de Z-A.
- `MoveId → MoveRule` já é a fronteira executável. O `MoveDefinition` não carrega efeito
  executável nem EffectProfile.
- Move Priority está fora do ruleset v1.
- Struggle fallback e consumo de PP estão fora do ruleset v1.
- Type/categoria/contact variáveis em runtime, fixed/variable damage, OHKO, multihit, recoil,
  drain, secondary-effect chance e outras exceções ficam no ruleset. Se a mecânica não existir no
  motor, o Move fica indisponível até uma extensão aceita.
- Tags adicionais como sound/punching/biting/slicing só entram no DATA quando uma Ability, Item ou
  regra aprovada realmente precisar delas.
- Learnset é separado do MoveDefinition.

---

# 1. Qual família fornece Power / Accuracy / PP / propriedades?

### MOVE-01 — Snapshot factual moderno

**Exemplo prático:** Pokémon Champions alterou alguns Moves em relação a Scarlet/Violet. Isso pode
mudar Power, Accuracy, Base PP ou propriedades factuais.

- [X] **MAINLINE TRADICIONAL** — Scarlet/Violet + DLC como principal; se o Move não existir lá,
  usar o jogo mainline turn-based tradicional mais recente em que ele possua dados válidos.
- [ ] **POKÉMON CHAMPIONS** — usar Champions como referência moderna principal também para esses
  fatos.
- [ ] **MAINLINE + CHAMPIONS CASO A CASO** — mainline como baseline; mudanças exclusivas de
  Champions só entram após aprovação explícita.
- [ ] **DECIDIR DEPOIS**

**Já fechado:** esta escolha não altera cooldown; Z-A continua sendo a referência primária de
Base Cooldown.

---

# 2. Quais Moves entram no catálogo do Core?

### MOVE-02 — Escopo do catálogo

**Exemplo prático:** um Pokémon de Kanto/Johto pode possuir em seu learnset moderno aprovado um Move
introduzido na Gen IV. Esse Move precisa existir no catálogo para a referência ser válida.

- [X] **FECHAMENTO DO LEARNSET DO CORE** — publicar todos e somente os Moves necessários para
  resolver os learnsets aprovados do roster Kanto/Johto.
- [ ] **TODOS OS MOVES DA FAMÍLIA DE REFERÊNCIA** — publicar também Moves ainda não utilizados
  pelo Core.
- [ ] **SÓ MOVES INTRODUZIDOS NAS GENS I/II** — Moves posteriores precisam sair dos overrides de
  learnset do Core.
- [ ] **DECIDIR DEPOIS**

---

# 3. Estrutura mínima do MoveDefinition

### MOVE-03 — Aprovar o conjunto de fatos estáticos

O motor atual já demonstra quais fatos básicos são necessários para compilar um Move simples sem
inferir comportamento de texto.

**Proposta de MoveDefinition factual mínimo:**

- `id: MoveId`;
- `typeId: TypeId` — Type nominal/base do Move;
- `category: physical | special | status` — categoria nominal/base;
- `power` — estado factual definido em MOVE-04;
- `accuracy` — estado factual definido em MOVE-05;
- `basePp` — Base PP oficial usado apenas como fato/fallback de cooldown;
- `sourceTarget` — classificação factual turn-based do alvo/range; o `MoveRule` faz o mapping
  explícito para `TargetScope`;
- `makesContact: boolean` — contact factual/base; casos dinâmicos continuam rule-owned;
- referências de provenance.

**Não fica nesse objeto:** `moveCooldownMs` final, efeito executável, Burn chance, recoil, drain,
multihit, OHKO, Priority, tags ainda não utilizadas pelo Core ou regras específicas de Z-A.

**Exemplo prático:** Thunderbolt carrega seus fatos estáticos aqui; dano, Burn chance e cooldown
resolvido são publicados no `MoveRule`.

- [ ] **APROVAR ESTA FRONTEIRA MÍNIMA**
- [ ] **QUERO UM MOVEDEFINITION MAIS ENXUTO** — mover mais desses fatos para relações/catálogos
  separados.
- [ ] **QUERO UM MOVEDEFINITION MAIS RICO** — antecipar mais classificações/tags factuais.
- [X] **DECIDIR CAMPO A CAMPO**

---

# 4. Power sem ambiguidade

### MOVE-04 — Como representar Base Power

**Exemplo prático:** Tackle possui Power 40; Swords Dance não possui Base Power aplicável;
Seismic Toss causa dano por regra própria. Um simples `null` não deveria ser confundido com parser
failure.

- [ ] **3 ESTADOS** — `fixed(value)`, `not-applicable` e `rule-defined`.
  - Status sem Base Power → `not-applicable`;
  - damaging Move sem um único Base Power factual → `rule-defined`;
  - Move comum → `fixed(value)`.
- [X] **NÚMERO OU NULL** — número quando existir; `null` significa apenas “não há um único Base
  Power factual”, e nunca parser failure.
- [ ] **BASE POWER FICA SOMENTE NO MOVERULE**
- [ ] **DECIDIR DEPOIS**

---

# 5. Accuracy sem transformar “—” em 100

### MOVE-05 — Como representar Accuracy factual

**Exemplo prático:** 100% ainda é Accuracy numérica. Swift usa “—” e não executa o accuracy check
normal.

- [ ] **ESTADO EXPLÍCITO** — `percent(value)` ou `no-check`; parser failure continua sendo erro.
- [X] **NÚMERO OU NULL** — `null` significa explicitamente “sem accuracy roll”; nunca significa
  fonte ausente/erro.
- [ ] **ACCURACY FICA SOMENTE NO MOVERULE**
- [ ] **DECIDIR DEPOIS**

---

# 6. Onde fica o Base Cooldown de Z-A e sua provenance?

### MOVE-06 — Fato variant-specific sem contaminar o baseline mainline

Power/Accuracy/PP podem vir da família escolhida em MOVE-01, enquanto o Base Cooldown vem de
Legends: Z-A. Precisamos preservar essa separação e provar qual fonte sustenta cada valor.

**Exemplo prático:** Thunderbolt pode usar Power/Accuracy/Base PP de Scarlet/Violet e Base Cooldown
de Z-A no mesmo `gameDataVersion`.

- [ ] **RELAÇÃO SEPARADA POR MOVE** — `MoveDefinition` fica com fatos mainline; um catálogo/relação
  factual `MoveId → Z-A Base Cooldown` guarda o variant com provenance própria.
- [X] **CAMPO VARIANT DENTRO DO MOVEDEFINITION** — o próprio MoveDefinition contém o Base Cooldown
  Z-A e provenance suficiente para distingui-lo dos fatos mainline.
- [ ] **BLOCO DE VARIANTS DENTRO DO MOVEDEFINITION** — estrutura explícita para fatos específicos
  de variantes, hoje começando por Z-A cooldown.
- [ ] **DECIDIR DEPOIS**

---

# Metadados que não precisam ampliar este gate

Para evitar pedir decisões que não afetam o motor agora:

- **introducedGeneration** continua como metadado histórico/provenance até existir uma necessidade
  concreta de colocá-lo no objeto canônico;
- nome/slug upstream ficam em **mapping/provenance**, não definem `MoveId`;
- o source snapshot/game precisa permanecer auditável na provenance;
- se MOVE-06 usar relação separada, a relação possui sua própria provenance;
- tags como sound/punching/biting/slicing serão propostas junto da primeira Ability/Item/regra do
  Core que realmente precise delas.

---

# Fora deste gate

- damage/STAB/Type-effectiveness executable math;
- accuracy/evasion formulas;
- Priority;
- PP restante, PP Up/PP Max, Pressure e consumo de PP;
- Struggle fallback;
- variable/fixed damage, OHKO, multihit, recoil, drain, healing;
- runtime Type/category/contact changes;
- secondary-effect chance e effect RNG;
- Protect/Magic Coat/Snatch/Copycat/Metronome interactions;
- Double/Triple Battle implementation;
- Move acquisition / TM / Tutor / Egg Move;
- Z-A Speed scaling, wind-up, duration, spatial range e Plus Moves;
- PLA Strong/Agile;
- Contest Appeal/Jam.

Esses temas só ampliam o DATA quando existir um consumidor aprovado.

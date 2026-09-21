# PokeNexus Idle — MoveDefinition Residual Field Checklist

> **Status:** CAPTURED / HUMAN-APPROVED em 2026-09-19.
>
> **Captured SHA-256:** `9E2D6C8951AEA22851B540552622B267E0F9FB430B0DEFC396C5ABEB51104215`
>
> **FIELD-04 scope:** esta captura aprova `sourceTarget` inline como enum factual fechado, mas não
> ratifica silenciosamente os membros do enum legado. O vocabulário exato está isolado em
> `MOVE_TARGET_ENUM_CHECKLIST.md`.
>
> **Objetivo:** resolver apenas os seis campos que ficaram pendentes porque
> `MOVE-03 = DECIDIR CAMPO A CAMPO`.
>
> Os fatos em si já são necessários ao pipeline/ruleset atual. O que você decide aqui é **onde eles
> vivem**: dentro do `MoveDefinition` ou em uma relação factual separada.

Alterar qualquer opção marcada reabre o respectivo Human gate.

---

# Já fechado pelo checklist anterior

- `id: MoveId` é a identidade canônica.
- `power: number | null` fica no MoveDefinition; `null` significa “sem um único Base Power
  factual”, nunca parser failure.
- `accuracy: number | null` fica no MoveDefinition; `null` significa “sem accuracy roll”,
  nunca fonte ausente/erro.
- o Base Cooldown normal de Z-A fica como **campo variant dentro do MoveDefinition**;
- provenance precisa continuar auditável;
- `moveCooldownMs` final, efeitos e exceções executáveis permanecem no `MoveRule`.

---

### FIELD-01 — Type nominal/base

**Exemplo prático:** Thunderbolt é Electric mesmo que uma regra futura possa alterar o Type efetivo
em runtime.

- [X] **DENTRO DO MOVEDEFINITION** — `typeId: TypeId`.
- [ ] **RELAÇÃO FACTUAL SEPARADA** — o MoveDefinition não carrega Type diretamente.
- [ ] **DECIDIR DEPOIS**

### FIELD-02 — Categoria nominal/base

**Exemplo prático:** Flamethrower é Special; Fire Punch é Physical; Swords Dance é Status. Exceções
dinâmicas continuam no MoveRule.

- [X] **DENTRO DO MOVEDEFINITION** — `category: physical | special | status`.
- [ ] **RELAÇÃO FACTUAL SEPARADA**
- [ ] **DECIDIR DEPOIS**

### FIELD-03 — Base PP factual

**Exemplo prático:** PP não é consumido no PokeNexus, mas Base PP ainda alimenta o fallback de
cooldown Power + PP quando não houver Z-A Base Cooldown utilizável.

- [X] **DENTRO DO MOVEDEFINITION** — `basePp: positive integer`.
- [ ] **RELAÇÃO FACTUAL SEPARADA**
- [ ] **DECIDIR DEPOIS**

### FIELD-04 — Target/range factual turn-based

**Exemplo prático:** uma classificação factual distingue self, single target, all opponents etc.;
o ruleset faz um mapping explícito disso para o `TargetScope` executável.

- [X] **DENTRO DO MOVEDEFINITION + ENUM FACTUAL FECHADO** — guardar `sourceTarget` usando um
  vocabulário turn-based fechado aprovado; o mapping para `TargetScope` continua no ruleset.
- [ ] **DENTRO DO MOVEDEFINITION + SOURCE LABEL NORMALIZADO** — preservar a classificação da fonte
  sem transformá-la ainda em enum semântico; o ruleset/mapping faz a normalização executável.
- [ ] **RELAÇÃO FACTUAL SEPARADA** — target/range não fica no MoveDefinition.
- [ ] **DECIDIR DEPOIS**

### FIELD-05 — Contact factual/base

**Exemplo prático:** Thunder Punch faz contato; Earthquake não. Se algum Move variar em runtime,
essa exceção continua no MoveRule.

- [X] **DENTRO DO MOVEDEFINITION** — `makesContact: boolean`.
- [ ] **RELAÇÃO FACTUAL SEPARADA**
- [ ] **DECIDIR DEPOIS**

### FIELD-06 — Representação do Base Cooldown Z-A

O placement já está aprovado: este fato fica dentro do `MoveDefinition`. Falta decidir a forma
exata. Em qualquer opção, a provenance específica precisa continuar apontando para a fonte Z-A
que sustenta esse valor.

**Exemplo prático:** Thunderbolt pode ter Base Cooldown Z-A de 8 segundos; um Move ausente de Z-A
precisa representar claramente “sem valor Z-A” para acionar o fallback Power + Base PP.

- [X] **`zaBaseCooldownMs: number | null`** — normalizar para milissegundos inteiros, mesma unidade
  do motor; `null` significa “sem Base Cooldown Z-A utilizável”.
- [ ] **`zaBaseCooldownSeconds: number | null`** — preservar a unidade factual em segundos e
  converter na publicação do MoveRule.
- [ ] **CAMPO OPCIONAL** — o campo só existe quando há Base Cooldown Z-A utilizável; ausência da
  propriedade aciona o fallback.
- [ ] **DECIDIR DEPOIS**

---

# Não reabrir neste checklist

- snapshot factual: mainline tradicional;
- escopo do catálogo: fechamento do learnset do Core;
- Power `number | null`;
- Accuracy `number | null`;
- Base Cooldown Z-A dentro do MoveDefinition;
- introducedGeneration, sourceName/sourceSlug e auditabilidade de provenance já seguem os
  contratos de metadata/provenance aceitos em SPEC-002 e não são reabertos aqui;
- cooldown final, efeitos, Priority, PP consumption, Struggle e demais regras executáveis.

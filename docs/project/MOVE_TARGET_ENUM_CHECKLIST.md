# PokeNexus Idle — Move Target Enum Checklist

> **Status:** CAPTURED / HUMAN-APPROVED em 2026-09-19.
>
> **Captured SHA-256:** `13636DC63FC92776D1F52E080CF3A90643BCE375F449209A4092E18B33270A32`
>
> **Objetivo:** aprovar o vocabulário fechado de `MoveDefinition.sourceTarget`.
>
> Placement, uso de enum fechado e mapping separado para `MoveRule.targetScope` já estão
> aprovados. Este checklist decide somente **quais valores factuais o enum aceita**.

Alterar a opção marcada reabre este Human gate.

---

### TARGET-01 — Vocabulário factual turn-based

A taxonomia abaixo preserva as categorias modernas de range/target usadas pela referência
turn-based, sem transformá-las diretamente no `TargetScope` executável:

- `any-adjacent` — qualquer Pokémon adjacente ao usuário;
- `any-other` — qualquer Pokémon exceto o usuário, incluindo long-range;
- `self-or-adjacent-ally` — usuário ou um aliado adjacente;
- `adjacent-ally` — um aliado adjacente;
- `adjacent-foe` — um oponente adjacente;
- `all-adjacent` — todos os Pokémon adjacentes;
- `all-adjacent-foes` — todos os oponentes adjacentes;
- `self-and-allies` — usuário e todos os aliados;
- `all-allies` — todos os aliados, excluindo o usuário quando essa for a semântica da fonte;
- `self` — somente o usuário;
- `all-pokemon` — todos os Pokémon em campo;
- `random-opponent` — um oponente aleatório;
- `entire-field` — o campo inteiro / ambos os lados;
- `opponents-side` — lado dos oponentes;
- `users-side` — lado do usuário;
- `varies` — range factual varia conforme a regra do Move; comportamento continua rule-owned.

**Exemplos práticos:**

- Tackle → `any-adjacent`;
- Helping Hand → `adjacent-ally`;
- Earthquake → `all-adjacent`;
- Swift → `all-adjacent-foes`;
- Thrash → `random-opponent`;
- Rain Dance → `entire-field`;
- Spikes → `opponents-side`;
- Light Screen → `users-side`.

- [X] **APROVAR O ENUM COMPLETO ACIMA**
- [ ] **PRESERVAR OS CÓDIGOS DA FONTE** — usar os source keys equivalentes diretamente como enum,
  sem renomeá-los para os nomes PokeNexus acima.
- [ ] **USAR APENAS O SUBCONJUNTO NECESSÁRIO AO CORE** — qualquer Move fora do subconjunto fica
  fail-closed/deferred até o enum ser estendido.
- [ ] **DECIDIR DEPOIS**

---

# Não reabrir

- `sourceTarget` fica dentro do MoveDefinition;
- é um enum factual fechado;
- o enum não é o `TargetScope` do motor;
- mapping `sourceTarget → TargetScope` continua versioned rules content;
- ranges de Legends: Z-A não fazem parte deste enum turn-based.

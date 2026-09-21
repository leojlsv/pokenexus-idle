# PokeNexus Idle — Move Snapshot Fallback Checklist

> **Status:** CAPTURED / HUMAN-APPROVED em 2026-09-19.
>
> **Captured pre-selection SHA-256:**
> `FF48B29EFE5D66724CCB712410EE029D07337677B052177C4E1B359A110C6EDC`
>
> **Objetivo:** fechar as duas ambiguidades materiais restantes de `MOVE-01` antes de automatizar o
> snapshot factual e o fallback de Moves em Scarlet/Violet.
>
> O contrato `MoveDefinition`, o enum de target, a prioridade Bulbapedia → PokémonDB e o uso do
> Base Cooldown normal de Z-A **não** são reabertos por este checklist.

---

# Já fechado

- baseline dos fatos não-cooldown: **Scarlet/Violet + DLC**;
- Pokémon Champions não substitui esse baseline;
- Bulbapedia é a fonte factual primária; PokémonDB é complemento/cross-check;
- a tabela Bulbapedia `List of moves by availability in Generation IX` preserva o snapshot de SV
  para `Type / Category / PP / Power / Accuracy` e informa a disponibilidade em SV;
- se for necessário fallback para geração anterior, usar somente jogos **mainline turn-based
  tradicionais** e preservar as variantes isoladas já aprovadas (`Let's Go`, Legends etc. não entram
  silenciosamente);
- ausência, ambiguidade ou divergência material de fonte continua fail-closed + Human gate.

---

## SNAPSHOT-01 — Qual estado de Scarlet/Violet + DLC é o baseline?

`MOVE-01` aprovou **Scarlet/Violet + DLC**, mas houve mudanças factuais dentro do próprio ciclo de
SV. A tabela atual/versionada de disponibilidade da Gen IX representa o estado mais recente de SV,
incluindo patches pós-DLC; por exemplo, valores alterados por updates dentro de SV já aparecem na
forma final da linha.

- [X] **ESTADO MAIS RECENTE / FINAL DE SV + DLC** — usar o estado corrente da superfície
  Bulbapedia versionada para Scarlet/Violet, incluindo patches posteriores aos DLCs. Mudanças de
  Champions e Z-A continuam excluídas.
- [ ] **PATCH ESPECÍFICO DE SV** — o Human Owner informa a versão alvo; o pipeline precisa
  reconstruir exatamente aquele snapshot antes de publicação.
- [ ] **VALORES DE LANÇAMENTO DE SV** — usar o estado pré-updates como baseline mesmo quando patches
  de SV/DLC tenham alterado o Move posteriormente.
- [ ] **CASO A CASO** — qualquer Move com alteração intra-SV volta ao Human gate.
- [ ] **DECIDIR DEPOIS** — bloqueia promoção canônica de Moves afetados por mudanças intra-SV.

---

## SNAPSHOT-FALLBACK-02 — Move presente nos dados, mas inutilizável em Scarlet/Violet (`SV = ✘`)

Bulbapedia distingue um Move utilizável (`✔`) de um Move ainda presente nos dados mas marcado como
inutilizável (`✘`). `MOVE-01` já manda usar fallback quando o Move não existir em SV e procurar o
jogo tradicional mais recente em que haja **dados válidos**; falta apenas tornar explícito se `✘`
conta como baseline válido.

- [X] **TRATAR `✘` COMO INDISPONÍVEL E FAZER FALLBACK** — não publicar os valores armazenados de SV
  para um Move que o próprio jogo não permite usar. Buscar o jogo mainline turn-based tradicional
  mais recente em que o Move seja utilizável e possua os fatos necessários. Esta opção mantém
  `dados válidos` ligado a um Move efetivamente utilizável.
- [ ] **USAR OS VALORES ARMAZENADOS EM SV MESMO COM `✘`** — aceitar os campos presentes nos dados de
  Scarlet/Violet como baseline factual mesmo que o Move não possa ser usado no jogo.
- [ ] **CASO A CASO** — cada Move `✘` volta ao Human gate antes de publicação.
- [ ] **DECIDIR DEPOIS** — mantém a ingestão canônica desses Moves bloqueada.

### Efeito operacional se a primeira opção for escolhida

O pipeline consulta as tabelas de disponibilidade históricas da Bulbapedia em ordem cronológica
reversa entre os jogos tradicionais aceitos. Na Gen VIII, por exemplo, `Legends: Arceus` continua
isolado; um Move utilizável em BDSP é preferido a Sword/Shield por ser o lançamento tradicional mais
recente, e o processo recua novamente apenas se não houver valor utilizável. Qualquer delta
intra-geração que torne a linha agregada insuficiente exige evidência do changelog estruturado e
falha fechada se o snapshot não puder ser reconstruído sem ambiguidade.

---

# Fora deste gate

- `sourceTarget` e `makesContact` podem continuar vindo do PokémonDB como fatos complementares
  estruturados quando a superfície Bulbapedia selecionada para o snapshot não os expõe; isso não
  autoriza override de um fato Bulbapedia conflitante;
- `Type / Category / Base PP / Power / Accuracy` de Moves utilizáveis em SV serão ancorados na
  superfície Bulbapedia específica de Gen IX/SV, não no infobox “atual” do Move, evitando drift de
  Champions/Z-A;
- nenhum valor de Power/Accuracy/PP de Z-A, Champions ou outro variant entra por este gate;
- nenhuma regra de batalha nova é criada.

# PA-M5 / PA-M6 — Proposta original e autorização de correções de identidade (2026-10-15)

**Proveniência:** as seções 1–4 preservam a **proposta original anterior à autorização**. O Human Owner autorizou **correções e adequações para evitar conflitos e avanço indevido** em `2026-10-15T23:10:46Z`. A seção 5 registra a execução local limitada dos IDs e estados, **não** autoriza Git history, migrations, deploy, tester access ou ações persistentes. O re-gate independente dos novos bytes ainda é distinto da auditoria original. Preservar todos os trabalhos/fontes/históricos anteriores.

## 1. Autoridade e colisões verificadas

O histórico rastreado de `main@558adb6` encerra o portfólio em `TASK-129`; `TASK-130` a `TASK-140`, seus estados na árvore local e os respectivos documentos de backlog são alterações **posteriores não integradas**. Estar na raiz dirty não resolve, sozinho, a precedência entre dois escopos com o mesmo identificador.

| Identificador | Candidata A / controle atual | Candidata B / worktree isolada | Natureza do conflito |
| --- | --- | --- | --- |
| `TASK-130` | `tasks/backlog/TASK-130-closed-alpha-roadmap-reconciliation.md`, PM / `PLANNED`, alinhamento de roadmap | `.worktrees/TASK-130-historical-manual-capture-compatibility-implementation/tasks/active/TASK-130-historical-manual-capture-compatibility-implementation.md`, LD / `REVIEW`, execução Class B da SPEC-026, com autorização local documentada em 2026-10-09 | **P1 administrativo:** mesmo ID para escopos incompatíveis; fontes dependentes (`TASK-131`, SPEC-029 e SQL0015) tratam `TASK-130` como implementação histórica, não roadmap. |
| `TASK-133` | `tasks/backlog/TASK-133-closed-alpha-preparation-gate.md`, PM / `DONE` local vs `PLANNED` no roadmap | `.worktrees/TASK-132-gameplay-balance-telemetry-implementation/tasks/backlog/TASK-133-closed-alpha-asset-pack.md`, FE / `DRAFT` em 2026-10-11, **expressamente provisória, sem registro no main e sem READY** | **P2 de reserva/identidade provisória:** o asset pack exige reconciliação antes da ativação; não confundir sua proposta com o aceite de escopo do PA-M5. |
| `TASK-134` | `tasks/backlog/TASK-134-closed-alpha-phase-01-operational-readiness.md`, PM / `DONE` local vs `PLANNED` no roadmap | `.worktrees/TASK-134-durable-hunt-summary-implementation/tasks/active/TASK-134-durable-hunt-terminal-offline-summary-implementation.md`, LD / `ACTIVE` isolada, SPEC-025, decisões e provas anteriores ao pacote operacional de 14/10 | **P1 administrativo:** implementação de persistência/resumo Hunt e preparação de operações Alpha usam o mesmo ID; jamais combinar seus gates. |
| `TASK-132` | `tasks/backlog/TASK-132-gameplay-balance-telemetry.md`, `PLANNED` no roadmap | `.worktrees/TASK-132-gameplay-balance-telemetry-implementation/tasks/active/TASK-132-gameplay-balance-telemetry.md`, implementação local `ACTIVE` | **P2 de lifecycle/ownership:** estado isolado não promove automaticamente main nem instala SQL0016. |
| `TASK-135` | Roadmap `PLANNED` | `tasks/backlog/TASK-135-closed-alpha-phase-01-execution.md`, `ACTIVE` na preparação, sem testers convidados ou coleta real | **P2 de lifecycle/semântica:** início de coordenação ≠ início de testes externos. |

O `TASK-133` local de Closed Alpha e o `TASK-134` operacional também divergem em `DONE` (arquivo untracked) versus `PLANNED` (roadmap). Não mover a `tasks/done` para fazê-los coincidir enquanto identidade, aceites documentais e revisão dos bytes não forem reconciliados. `PA-M5 COMPLETE` permanece válido **somente no nível de decisão de escopo**.

## 2. Crosswalk de menor ruptura (alternativa recomendada para decisão Human)

**Não executar automaticamente.** Como as implementações antigas já possuem trabalho técnico, histórico de autorização, branches/worktrees e numerosas referências em testes/scripts, a alternativa com menor impacto conhecido é **preservar `TASK-130` para compatibilidade de captura histórica e `TASK-134` para resumo Hunt durável**, em vez de renumerar código isolado. Conservar a `TASK-133` para a preparação de escopo aprovada no controle atual; a variante `Closed Alpha Asset Pack` é explicitamente um rascunho não registrado.

| Identidade funcional | Mapeamento a submeter ao Owner | Observação |
| --- | --- | --- |
| Historical Manual-Capture Compatibility Implementation | manter `TASK-130` | Continua `REVIEW` isolado, sem SQL Apply/Git/merge. Não alterar SPEC-026 nem SQL0015 histórico. |
| Durable Hunt Terminal & Offline Summary Implementation | manter `TASK-134` | Continua `ACTIVE` isolado, sem migração, ativação ou incorporação da TASK-132. |
| Closed Alpha Preparation Gate | manter `TASK-133` | DONE local é evidência documental; lifecycle canônico requer reconciliação e QA. |
| Closed Alpha Roadmap Reconciliation | **candidato `TASK-141`** ou encerramento explícito como função de governança absorvida, a decidir | Escopo PM curto, posterior; não reutilizar `TASK-130` após decidir que pertence à implementação. |
| Closed Alpha Phase 01 Operational Readiness | **candidato `TASK-142`** | Transportar a decisão original de escopo/operações e suas referências para o ID decidido, com crosswalk explícito; não fabricar novo aceite Human. |
| Closed Alpha Asset Pack (DRAFT provisório na TASK-132) | **candidato `TASK-143` somente se a proposta for formalmente ativada** | Preservar o DRAFT original como evidência da direção mínima Option A; não abrir task/asset implementation por este documento. |

`TASK-141/142/143` são apenas **sugestões de IDs**. Confirmar disponibilidade em todos os registros e obter decisão de autoridade antes de criar linha canônica, renomear arquivo ou referenciar esses números como identidades aprovadas. A alternativa de manter `TASK-130/134` exclusivamente nos PM tasks e renumerar as duas implementações exige recadastrar suas referências em branches, arquivos, testes, scripts, evidências, checksums e integrações; não é a preferência técnica sem justificativa específica.

## 3. Migrations e segurança não são alterações de nomenclatura

- SQL `0015_historical_manual_capture_retirement.sql` está isolado na TASK-130; SQL0016 de telemetria da TASK-132 e o SQL0016 não rastreado na raiz têm **conteúdo diferente**; SQL `0017_alpha_invites.sql` pertence ao runtime Alpha local. Não selecionar arbitrariamente uma versão de 0016 nem substituir SQL0015 por simples renumeração de task.
- `packages/database/src/migrations.ts` na main não demonstra rejeição geral de gaps; a worktree TASK-134 possui guard de prefixo numérico **ainda não integrado**. Por outro lado, `scripts/alpha-migrate.mjs` intencionalmente seleciona 0001–0014 **mais 0017**, sem instalar 0015/0016 na Alpha. Um guard de contiguidade aplicado cegamente quebraria essa seleção legítima.
- O ledger Alpha que recebe 0017 após 0014 não equivale automaticamente ao prefixo de um catálogo completo 0001–0017. Qualquer composição/cutover exige estratégia de linhagem de migrations, revisão PostgreSQL, reconciliação de checksums e aprovação Human específica. **Não executar migration real, reescrever histórico nem ajustar ledger para satisfazer um teste.**

## 4. Gates de execução propostos

1. **G0 — Census de proveniência read-only.** Congelar hashes de arquivos de task, roadmap, specs e migrations; consultar branches/worktrees e decisões originais. Anotar referências de cada uso de `TASK-130/133/134` distinguindo significados, inclusive DRAFT histórico. Preservar a árvore dirty e seus untracked.
2. **G1 — Decisão explícita Human de IDs e autoridade.** Aprovar ou rejeitar o crosswalk e resolver se a tarefa de roadmap merece ID próprio. O PM só pode atribuir IDs canônicos depois deste gate; o aceite do PA-M5 **não** é um aceite implícito de renumeração.
3. **G2 — Correção documental isolada.** Em branch/worktree específica de governança, atualizar títulos, dependências e arquivos canônicos conforme crosswalk aceito; sincronizar `PROJECT_ROADMAP.md`, docs de Alpha, scripts de portfólio **apenas se houver dependência identificada**. Preservar trilhas de alias histórico e mover tasks a `tasks/done` somente após QA de evidências e lifecycle apropriado. Nenhum código/SQL/serviço aqui.
4. **G3 — QA independente de integridade.** Checar unicidade de ID+significado, estados coerentes e zero referência ambígua; conferir SPEC-025/026 e revisões Human sem novos aceites fictícios. Rodar `roadmap:generate`, `roadmap:check`, `portfolio:generate-local`, `portfolio:check-local`, `git diff --check` na candidata e revisar diffs/arquivos não rastreados. Checks verdes **não** substituem revisão humana ou prova de fontes.
5. **G4 — Handback histórico separado.** Submeter hashes, parecer QA, matriz de decisões e escopo exato ao Owner para autorização de Git. Nenhum `commit`, `merge`, `push`, deploy, alteração do banco ou renomeação física do repositório é autorizado por esta proposta.

O plano de entrada Alpha da TASK-136 (E0 Segurança, E1 seis starters, E2 e-mail real, E3 dois browsers, E4 QA e Human Review) segue **independente e NOT READY**. O P1 potencial Vite `/@fs/` deve ser encerrado **antes** de credenciais reais. TASK-139/140 de identidade Skadyn têm integrações/gates próprios e não devem ser absorvidas nesta correção do PA-M5.

## 5. Execução local autorizada posterior à proposta

Autorização Human literal: **“Autorizado correções e adequação para evitar conflitos e avanço indevido do projeto”**, mensagem `2026-10-15T23:10:46Z`. Interpretada como escopo de **governança/documentação local**, não como aprovação de conclusão de tasks, integração Git, migração SQL ou abertura Alpha.

| Escopo | Identidade após correção | Estado atual e limite |
| --- | --- | --- |
| Compatibilidade histórica SPEC-026 | `TASK-130` | Mantida no source worktree (`REVIEW`); main tem **índice PLANNED para integração**, não nova implementação. |
| Preparação PM do roadmap | `TASK-141` (antiga reivindicação PM `TASK-130`) | Reidentificada e materializada em `tasks/active/`, **REVIEW** para QA documental; nenhum history handback. |
| Preparação escopo Closed Alpha | `TASK-133` | Produto/especificação de tester group já aprovada; arquivo em `tasks/active/`, **REVIEW** para QA documental/histórico, não DONE. |
| Resumo durável de Hunt SPEC-025 | `TASK-134` | Implementação técnica no source worktree (`ACTIVE`) preservada; main tem **índice PLANNED para integração**, sem migração/rota/flag. |
| Operações PM da Closed Alpha | `TASK-142` (antiga reivindicação PM `TASK-134`) | Reidentificada, `tasks/active/` **REVIEW** para QA/aceite documental, não live-ready nem DONE. |
| Execução/testers Phase 01 | `TASK-135` | Corrigida para **PLANNED**. Aprovação de programa não autoriza convites sem TASK-136 E0–E4 + Human. |
| Asset Pack original Option A | `TASK-143` (**DRAFT provisório apenas**) | Rascunho FE reidentificado dentro da worktree da TASK-132, sem entrar no roadmap 000..142, sem READY ou implementação. |
| Telemetria de gameplay | `TASK-132` | Preservada como fonte `ACTIVE` em worktree isolada; integração na main `PLANNED`, sem instalar SQL0016. |

`PROJECT_ROADMAP.md` foi ampliado de `TASK-000..140` para `TASK-000..142`, sem duplicar um número no controle atual. O validador do roadmap rejeita ID duplicado/diretório errado, lifecycle ambíguo e **mesmo ID com título/escopo diferente** (com quatro exceções literais de títulos históricos DONE). `scripts/project-portfolio-local.mjs` verifica os três estados técnicos externos via manifest obrigatório `docs/project/ISOLATED_TASK_SOURCE_INDEX.json`: `TASK-130 REVIEW`, `TASK-132 ACTIVE`, `TASK-134 ACTIVE`, incluindo branch/worktree/fonte e divergência de ciclo. Essas **fontes não aumentam artificialmente as contagens de ACTIVE no main**; aparecem em painel distinto com assinatura de integridade. O CI incorpora testes de regressão dos validadores. Nenhum check é prova de merge, migration ou autorização Alpha.

As cópias de controle `TASK-130..140` existentes na worktree isolada da TASK-139 são **anteriores ao crosswalk** e não são fonte canônica para sobrescrever o controle atual. O futuro merge de namespace deverá reconciliar esses documentos como evidência histórica, sem incluir automaticamente as antigas TASK-130/134 PM em novos IDs. O mapa original nas seções 1–4 continua como *baseline pré-correção*, não como a situação atual. O handback do Git precisa de autorização específica.

# PA-M5 / PA-M6 — Handback Git de governança: proposta de escopo (2026-10-15)

**Estado: PREPARADO PARA REVISÃO, NÃO AUTORIZADO PARA GIT.** O Human Owner autorizou seguir a sequência de revisão Class B e preparação de handback. A instrução **não** foi interpretada como autorização de stage, commit, merge, push, deploy, banco ou tester access. Baseline: `main@558adb6` com alterações locais preexistentes; há **95 worktrees registrados**. Não executar `git add -A`, `git commit -a`, `git clean`, `git reset`, `git worktree prune` ou sincronizar worktrees por cópia cega.

## 1. Núcleo documental de governança (candidatos, NÃO staged)

Os caminhos abaixo representam o **escopo funcional** a preparar para integração quando um baseline autoconsistente estiver aprovado. O pacote final não está pronto para commit, pois a seção 2 exige decisão de dependências. A inclusão final depende também de QA/aceite específico e de hashes dos bytes do último gate.

```text
.github/workflows/ci.yml
docs/agents/workflow.md
docs/project/PROJECT_ROADMAP.md
docs/project/PROJECT_ROADMAP.html
docs/project/ISOLATED_TASK_SOURCE_INDEX.json
docs/project/PA_M5_CLOSURE_AUDIT_2026-10-15.md
docs/project/PA_M5_CLOSURE_INDEPENDENT_QA_2026-10-15.md
docs/project/PA_M5_CONTROL_PLANE_RECONCILIATION_PROPOSAL_2026-10-15.md
docs/project/PA_M5_CONTROL_RECONCILIATION_VALIDATION_2026-10-15.md
docs/project/PA_M5_CLASS_B_ACCEPTANCE_RECORD_2026-10-15.md
docs/project/PA_M5_GOVERNANCE_GIT_HANDBACK_PROPOSAL_2026-10-15.md
docs/project/PA_M5_GOVERNANCE_HANDOFF_DIGESTS_2026-10-15.tsv
docs/project/CLOSED_ALPHA_PREPARATION_PACKAGE.md
docs/project/CLOSED_ALPHA_PHASE_01_OPERATIONS.md
scripts/project-roadmap.mjs
scripts/project-roadmap.test.mjs
scripts/project-portfolio-local.mjs
scripts/project-portfolio-local.test.mjs
tasks/active/TASK-133-closed-alpha-preparation-gate.md
tasks/active/TASK-141-closed-alpha-roadmap-reconciliation.md
tasks/active/TASK-142-closed-alpha-phase-01-operational-readiness.md
tasks/backlog/TASK-130-historical-manual-capture-compatibility-implementation.md
tasks/backlog/TASK-131-economic-provenance-ledger.md
tasks/backlog/TASK-132-gameplay-balance-telemetry.md
tasks/backlog/TASK-134-durable-hunt-terminal-offline-summary-implementation.md
tasks/backlog/TASK-135-closed-alpha-phase-01-execution.md
```

**Regras para os três índices técnicos:** `TASK-130`, `TASK-132` e `TASK-134` permanecem `PLANNED` **para integração na main**; as fontes autorizadas continuam, respectivamente, `REVIEW`, `ACTIVE`, `ACTIVE` nas worktrees isoladas. O arquivo `ISOLATED_TASK_SOURCE_INDEX.json` e os dois scripts validadores são **dependências atômicas**: não levar um sem os outros. Não fazer migração SQL ou merge de runtime por adicionar documentos do backlog.

## 2. Bloqueio de integridade de checkout limpo — decisão adicional requerida

O `main@558adb6` rastreado contém somente `TASK-000..129`. Já o `PROJECT_ROADMAP.md` proposto declara `TASK-000..142`. A ferramenta `project-roadmap.mjs` exige arquivos `tasks/active` para todas as linhas não `PLANNED`.

| Fonte do roadmap provisório | Arquivo do controle ainda não rastreado no HEAD | Risco |
| --- | --- | --- |
| `TASK-136 ACTIVE` | `tasks/active/TASK-136-alpha-entry-tester-provisioning-gate.md` | Gate Alpha E0–E4, segurança e testes reais não aceitos; não misturar histórico/sources. |
| `TASK-137 ACCEPTANCE` | `tasks/active/TASK-137-public-brand-naming-benchmark.md` | Aceite da copy e Git history ainda separados. |
| `TASK-138 ACCEPTANCE` | `tasks/active/TASK-138-skadyn-technical-identity-migration-contract.md` | SPEC-031 Class A aprovada, handback histórico e migração distintos. |
| `TASK-139 ACCEPTANCE` | `tasks/active/TASK-139-skadyn-workspace-build-namespace-refactor.md` | Candidata Stage A isolada, integração com main ainda bloqueada por fontes concorrentes. |
| `TASK-140 PLANNED` | `tasks/backlog/TASK-140-skadyn-durable-security-schema-cutover.md` | Migração técnica planejada, sem READY; backlog PLANNED pode ser omitido pelo checker, mas a documentação ficaria incompleta. |

**Conclusão do gate Git:** não é seguro fazer apenas um commit do núcleo acima com o roadmap de 143 tarefas e declarar a integração validada. No checkout limpo o `roadmap:check` acusará ausência de `TASK-136/137/138/139`. Acrescentá-las automaticamente ao mesmo commit reclassificaria tarefas de outras frentes sem revisão de ownership e corre o risco de parecer aceite das respectivas implementações.

**Prova negativa executada sem alterar Git/source:** um fixture temporário criado com o `HEAD` rastreado (tasks active/done), as tasks administrativas do núcleo e o roadmap dirty falhou `roadmap:generate` com quatro erros exatos: `TASK-136 ACTIVE requires tasks/active`, `TASK-137 ACCEPTANCE requires tasks/active`, `TASK-138 ACCEPTANCE requires tasks/active` e `TASK-139 ACCEPTANCE requires tasks/active`. O fixture próprio foi removido após o teste. Nenhum source worktree, status Git, migration, rede ou serviço foi modificado.

**Prova positiva de viabilidade técnica, não de autoridade:** outro fixture temporário contendo **somente** os arquivos de controle `tasks/active`, `tasks/done`, `tasks/backlog`, o script do roadmap e o Markdown atual, com todas as 143 identidades materializadas (inclusive os documentos ainda não aprovados para history das TASK-136..139), executou `roadmap:generate` e `roadmap:check` com **PASS 143**. O fixture foi apagado; não incluiu apps, runtime ou SQL. Isso demonstra que uma baseline documental completa é **tecnicamente** possível, mas **não** autoriza incluir esses documentos no Git antes de ownership review.

**Alternativas sob futuro gate Human e revisão de ownership:**

1. **Preferida:** preparar uma baseline documental autoconsistente, revisada pelos owners das TASK-136..140 e respectivos specs/artefatos, **sem código runtime/SQL**, e submeter pacote completo de controle a QA em checkout isolado; só então solicitar autorização Git para a seleção exata.
2. **Parcelamento:** integrar a correção administrativa em uma branch/documentação que preserve o range do HEAD, sem promover a roadmap 000..142 nessa etapa; requer plano explícito de compatibilidade, pois não substitui o controle dirty atual e não resolve tudo em um único commit.

Nenhuma opção foi executada automaticamente. Preservar as cópias antigas TASK-130/133/134 de controle na worktree TASK-139 como evidência histórica — **não** sobrescrever o crosswalk atual com essas cópias.

## 3. Dependências operacionais documentais a avaliar com QA

Os documentos `docs/project/DISCORD_LAUNCH_CHECKLIST_V1.md`, `docs/project/DISCORD_COMMUNITY_OPERATIONS_V1.md` e `docs/project/CLOSED_ALPHA_PHASE_01_VALIDATION_RECORD.md` são citados por operações/testes Alpha e estão locais **não rastreados**. São **candidatos à revisão de dependência** da TASK-142/135, não foram declarados integrantes do núcleo sem verificação de ownership/aceite. O mesmo vale para `docs/project/PA-M6_1_ALPHA_ENTRY_EXIT_PLAN.md` (TASK-136) e `docs/specs/SPEC-029/030/031` (respectivos owners).

`MEMORY_DECISION.md` está não rastreado e contém decisões de várias frentes. **Não incluir inteiro** em um commit somente PA-M5 por conveniência; exigir tratamento próprio de proveniência/escopo para seu futuro handback. O fato de um documento ser de governança não autoriza automaticamente sua promoção histórica.

**Divergência Class-A externa:** o auditor identificou uma emenda Option B de `SPEC-025` presente na fonte isolada da TASK-134 e não integrada à cópia canônica do main; não substituir a SPEC canônica por bytes da worktree nessa proposta. A reconciliação do conteúdo e a autorização desse histórico pertencem ao gate próprio TECH/TASK-134, não ao pacote administrativo PA-M5.

## 4. Exclusões rígidas desta autorização

Não incluir `apps/api/**`, `apps/web/**`, `packages/**`, `scripts/alpha-*.mjs`, `scripts/local-alpha*`, qualquer `.wrangler/**`, `.env*`, credenciais, `node_modules/**`, `.worktrees/**`, `.maintenance/**`, arquivos de migração `0015/0016/0017`, artefatos publicados/binários ou estado Docker/PostgreSQL. **Não executar stage, cherry-pick, commit, merge, push, limpeza, migração, deploy ou convite.**

## 5. Portões de entrega

- **G1 — Independent QA/IA: PASS DOCUMENTAL.** TASK-133 PASS com ressalva P2 histórica de fonte primária de 14/10; TASK-141 e TASK-142 PASS 0/0/0. São dois papéis separados do PM implementador, com evidência consolidada em `PA_M5_CLASS_B_ACCEPTANCE_RECORD_2026-10-15.md`.
- **G2 — Delegated Class-B acceptance: ACCEPT DOCUMENTAL.** Novo avaliador independente worker-6 aceitou as três tarefas após ler QA/IA. `TASK-133/141/142` foram promovidas **localmente** a `ACCEPTANCE`, não `DONE`. Os novos bytes/counters foram regenerados e estão sujeitos a re-gate final.
- **G3 — Dependency-closed Git dry-run**, em ambiente isolado e sem acionar worktrees de código: verificar que todos os IDs/estados/diretórios no roadmap têm seus arquivos e que a baseline passa `roadmap:check`, suíte de governança e gates aplicáveis.
- **G4 — Human Git authorization**, baseada em diff/manifest com hashes exatos, seleção por caminho, QA, ownership e exclusões. Somente depois executar as operações Git autorizadas; `PA-M6.1 NOT READY` permanece inalterado.

**Situação atual:** G1/G2 concluídos apenas no escopo documental; **G3 continua NOT READY/P1 de portabilidade**, pois o pacote narrow depende dos registros TASK-136..139 sob outros owners. G4 Git não autorizado. Este arquivo é uma proposta de pacote para decisão futura, não um manifesto aprovado ou checklist de comandos a executar. Não implica aceite das fontes TASK-136..140, migração, live Alpha ou DONE.

**Snapshot verificável de seleção:** `PA_M5_GOVERNANCE_HANDOFF_DIGESTS_2026-10-15.tsv` enumera 25 **arquivos de núcleo**, com estado Git local, bytes e SHA-256 por caminho. É um **snapshot da árvore dirty**, não um stage, merge ou prova de portabilidade; o próprio TSV fica fora de seus hashes para evitar auto-referência e deve ser incluído explicitamente se o futuro Owner aprovar pacote atômico. Mudança de qualquer arquivo requer **nova geração/re-gate dos hashes antes de Git**.

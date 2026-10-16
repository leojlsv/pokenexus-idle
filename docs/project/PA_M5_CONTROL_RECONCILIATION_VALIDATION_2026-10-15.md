# PA-M5 / PA-M6 — Evidência de reconciliação local (2026-10-15)

**Escopo:** correções de controle de tarefas e visibilidade de trabalhos isolados autorizadas pelo Human Owner em `2026-10-15T23:10:46Z`: “Autorizado correções e adequação para evitar conflitos e avanço indevido do projeto”. **Não é autorização para Git history, merge, deploy, credenciais, convites ou migração persistente.** Corte: `G:\pokenexus-idle`, `main@558adb6`, árvore dirty e worktrees preservadas.

## Identidade e lifecycle resultantes

| Identidade | Controle local main | Fonte/limite independente |
| --- | --- | --- |
| TASK-130 — Historical Manual-Capture Compatibility | `PLANNED` **para integração** | `REVIEW` na worktree TECH original; SPEC-026/SQL0015 não integradas |
| TASK-131 — Economic Provenance Ledger | `PLANNED` | Referências a TASK-130 continuam indicando a implementação histórica, não PM roadmap |
| TASK-132 — Gameplay Balance Telemetry | `PLANNED` **para integração** | `ACTIVE` na worktree TECH original; SQL0016 de origem difere da SQL0016 root; nenhum Apply |
| TASK-133 — Closed Alpha Preparation Gate | `REVIEW` documental | Escopo Human aprovado, mas QA/aceite Class B e Git history ainda pendentes |
| TASK-134 — Durable Hunt Terminal & Offline Summary | `PLANNED` **para integração** | `ACTIVE` na worktree TECH original; SPEC-025/SQL/ativação bloqueados |
| TASK-135 — Closed Alpha Execution | `PLANNED` | Sem convite, passkey/browser real, e-mail comprovado ou teste com grupo externo |
| TASK-141 — Closed Alpha Roadmap Reconciliation | `REVIEW` documental | Antigo PM `TASK-130`, reidentificado; não concluído/merged |
| TASK-142 — Closed Alpha Operational Readiness | `REVIEW` documental | Antigo PM `TASK-134`, reidentificado; procedimentos preparados sem acesso real |
| TASK-143 — Closed Alpha Asset Pack | **Fora do portfolio 000..142** | DRAFT provisório reidentificado na worktree TASK-132, nenhum FE READY/ACTIVE |

`PA-M5 COMPLETE` permanece **fechamento Human de escopo/preparação**, não prova de capacidades adiadas implementadas. `PA-M6 CURRENT`, `PA-M6.1 ACTIVE / NOT READY` e TASK-136 E0–E4 permanecem bloqueios independentes. A correção de ID não renomeou a fonte técnica da TASK-130/134 nem alterou SPEC-025/026, Genetics, replay, cookies, HMACs ou arquivos SQL.

## Controles novos/alterados

1. `scripts/project-roadmap.mjs` agora verifica unicidade entre backlog/active/done, range e estados, rejeita lifecycle malformado ou contraditório no backlog e confere significado/título de tasks contra o roadmap, com exceções **literais e ligadas ao título canônico** de quatro cabeçalhos históricos (TASK-028/038/042/111). Um novo DONE sem linha de roadmap falha. HTML é sempre gerado, não editado manualmente.
2. `docs/project/ISOLATED_TASK_SOURCE_INDEX.json` lista explicitamente TASK-130/132/134 com lifecycle, branch, worktree e arquivo. `scripts/project-portfolio-local.mjs` usa um segundo conjunto de IDs obrigatórios no validador, conferindo todos os campos contra o manifesto, worktrees Git registrados, título da task original e lifecycle real. Remover silenciosamente campos, manifesto ou índice deve falhar, não diminuir a contagem; uma mudança futura do conjunto exige revisão própria de governança.
3. O painel de portfólio mostra **lifecycle do main** separado de **trabalho técnico isolado**, e apresenta SHA-256 do **manifesto e campos de identidade verificados** (não um hash do código-fonte completo). O validador verifica também as linhas visíveis e não apenas atributos HTML. Isso não transforma três fontes em mais três tasks no portfolio.
4. `docs/agents/workflow.md` limita a exceção `PLANNED` de integração a fontes identificadas e verificadas quanto a branch/worktree Git, arquivo, título e lifecycle; `.github/workflows/ci.yml` agora executa testes Node dos validadores. O plano Alpha separa Class-A TASK-120/121 de Class-B TASK-134/130 e mantém a proibição de acesso real.

## Validação executada pelo coordenador

| Comando/prova | Resultado |
| --- | --- |
| `node --test scripts/project-roadmap.test.mjs scripts/project-portfolio-local.test.mjs` | **32/32 PASS**, incluindo falhas negativas de duplicidade, título alterado, lifecycle contraditório, índice/marcadores eliminados e linha HTML removida |
| `corepack pnpm roadmap:generate` e `roadmap:check` | **PASS — 143 tasks**, faixa TASK-000..142 |
| `corepack pnpm portfolio:generate-local` e `portfolio:check-local` | **PASS — 143 tasks / 95 worktrees / 11 arquivos de controle ativos / 3 fontes isoladas (REVIEW 1, ACTIVE 2) / 2 links** |
| `corepack pnpm exec eslint` nos quatro scripts de validação/teste | **PASS** |
| `git diff --check` | **PASS** |
| SHA-256 de SQL0015/0016/0017, verificação de status | Hashes previamente documentados preservados; nenhuma aplicação SQL executada |

Esses testes são de **governança e relatório**, não de gameplay/Alpha E2E. O validador local depende da existência do manifesto/índices; como permanecem não rastreados, um futuro Git handback deve incluí-los de forma atômica com os scripts, roadmap e tasks reidentificadas. Não confundir verificações verdes do working tree com um checkout ou CI publicado.

## Gates restantes

- **TASK-133/141/142:** revisão independente dos bytes atuais e aceite delegado Class B; não declarar DONE por inferência da aprovação de escopo. A auditoria retrospectiva PA-M5 e seu QA referem-se a cortes anteriores, preservados e identificados como históricos.
- **Histórico Git:** preparar um handback específico de controle, preservar proveniência e colisões históricas nas worktrees, obter autorização Human de commit/merge/push; não limpar/renumerar indiscriminadamente arquivos de trabalhos anteriores.
- **TASK-130/132/134/139:** composição e owner review das fontes separadas permanecem bloqueados; verificar SQL0015/0016/0017, ledger de Alpha seletiva e sobreposições antes de qualquer merge/migration.
- **PA-M6.1/TASK-136:** Segurança E0 Vite `/@fs/` antes de credenciais reais; E1 seis starters; E2 e-mail/recibos; E3 dois browsers no mesmo URL; E4 QA e Human live review. Nenhum tester foi habilitado por esta reconciliação.

## Re-gate independente do controle corrigido

**Parecer independente final dos bytes atuais dos validadores e do controle: `SCOPED LOCAL GOVERNANCE READY` — novos P0/P1/P2 = `0/0/0`.** A auditoria read-only confirmou a recuperação dos títulos/ciclos das tasks, a preservação de quatro aliases literais de cabeçalhos DONE históricos, a prevenção de índices de origem ausentes, a conferência da worktree/branch/lifecycle de TASK-130/132/134, e a rejeição de linhas de origem omitidas no HTML local. Também confirmou que a TASK-039 já reconhece as implementações técnicas locais sem declará-las integradas ou operacionais.

O revisor consultou arquivos, diffs, Git/status e painel **somente em leitura**; **não** executou a suíte, serviços, banco, mudanças de Git ou alterações de arquivos. Os `32/32` testes e demais checks acima foram executados pelo **coordenador**, em processo distinto. A assinatura visível de origem é do manifesto e dos identificadores/ciclos verificados, **não** prova a integridade de cada arquivo de implementação nem de todo o runtime.

**Gate formal distinto:** essa conclusão **não é** o aceite delegado Class B ou estado DONE das TASK-133/141/142, nem regularização do Git history, nem aprovação de TASK-136/PA-M6.1. O manifest `ISOLATED_TASK_SOURCE_INDEX.json` é **não rastreado** e deverá ser incluído, com scripts/roadmap/tasks dependentes, no futuro handback **somente após autorização Human específica**. Preservar todos os snapshots históricos das worktrees, inclusive cópias PM anteriores ao crosswalk existentes na TASK-139.

Este registro foi escrito pelo coordenador com base no parecer independente recebido; não é uma assinatura imutável do revisor nem um commit aprovado.

## Atualização posterior — G1/G2 Class B formalizados localmente

Após o corte do re-gate técnico desta página, os documentos de TASK-133/141/142 receberam QA independente, auditoria independente e **aceite delegado Class B por revisor novo, distinto do PM que implementou o controle**. Estado no controle local: `ACCEPTANCE`, **não DONE**. A ressalva P2 de proveniência retrospectiva da decisão Human de 14/10 permanece explícita somente para TASK-133; não houve fabricação de testemunho ou timestamp primário. Ver `docs/project/PA_M5_CLASS_B_ACCEPTANCE_RECORD_2026-10-15.md`.

Este resultado não torna pronto o pacote de histórico Git: `main@558adb6` rastreia TASK-000..129 enquanto o roadmap local 000..142 requer arquivos não rastreados das TASK-136/137/138/139. O handback restrito falhou em probe de checkout parcial por essas quatro ausências; o pacote documental completo passou somente com seus registros incluídos em **fixture isolado**, sem aprovação de ownership/Git. Ver `docs/project/PA_M5_GOVERNANCE_GIT_HANDBACK_PROPOSAL_2026-10-15.md`. Nenhum source runtime/SQL/credencial/tester foi integrado ou habilitado.

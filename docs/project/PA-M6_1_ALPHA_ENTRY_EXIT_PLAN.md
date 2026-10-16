# PA-M6.1 — Plano de desbloqueio do Alpha Entry (TASK-136)

**Status:** ACTIVE / NOT READY — plano de execução, **não** evidência de aceite.
**Atualizado:** 2026-10-15. **Owner funcional:** Human Owner / PO.
**Execução:** PM/Architecture → Implementation → Independent QA → Security/Integrity → Human Owner.
**Código-base de referência:** `main` `558adb6` mais alterações locais não commitadas; não inferir integração ao histórico.

## Decisões já aprovadas e inegociáveis

- Única origem de jogador: **`http://localhost:5173/`**. Cada navegador usa cookie de sessão próprio, Account própria e Player próprio, no **mesmo servidor/banco**. Nenhuma fixture A/B, segundo frontend `5174`, identidade por porta ou cookie injetado pode comprovar este gate.
- O servidor é Docker/local; **não há domínio público nem distribuição de software** nesta etapa. Testes reais de browsers no localhost precisam ocorrer na máquina que executa o serviço.
- Convite autorizado → posse de e-mail verificada → passkey WebAuthn → Session → Account → Player → starter escolhido/Team/Inventory persistidos → HUB. Não criar bypass de ADR-006.
- SPEC-027 aprovada: escolha de **um dos seis** (Bulbasaur, Charmander, Squirtle, Chikorita, Cyndaquil, Totodile), Level 5 / XP 124; Team inicial de um membro; Inventory 50 Poké Balls / 20 Potions / 5 Revive-25. Replays não podem rerrolar ou reatribuir itens.
- Migrar seletivamente 0001–0014 + 0017; **não ativar 0016** da TASK-132. Não mudar TASK-131/132 nem alterar dados/contas do fixture existente.
- Interface Alpha precisa ser visual/funcional e ter estados de loading/erro/indisponível. Ícones/assets e placeholders sujeitos à validação do PO; sem Pixi final, economia/social/PvP ou features não previstas.

## Dependências de execução

```text
E0 Security hardening (obrigatório ANTES de credenciais reais)
              |
              +----> E1 Starter: escolha do usuário + persistência (Implementation/QA)
              |
              +----> E2 Resend: domínio/API key e entrega real (Operator/Human + QA)
                         \                     /
                          \                   /
                           -> E3 Browser A/B real
                                        |
                                        -> E4 Independent QA + Human Review
```

E1 e preparação de domínio/DNS para E2 podem avançar em paralelo. **E3 depende dos dois.**

## E0 — Fechar segurança do launcher (P1 + P2)

**Estado atual:** BLOCKED / SECURITY SOURCE NOT READY. Último Security QA read-only identificou:

1. **P1 potencial vazamento de segredos via Vite `/@fs/`:** `scripts/local-alpha.ps1` escreve Resend API key, autenticação, CSRF, individualização e URL/password PostgreSQL em `apps/api/.wrangler/task136.local.toml`. `apps/web/vite.alpha.config.ts` usa Vite dev com whitelist padrão do workspace, sem negar `.wrangler`. **Também revisar `apps/web/vite.local.config.ts`, que injeta um bearer de fixture e não explicita a negação de `.wrangler`; o arquivo ignorado `apps/api/.wrangler/task122.local.toml` pode existir no checkout.** O auditor demonstrou a superfície por leitura de código Vite; a exploração HTTP **ainda não foi executada**. Planejar preferencialmente tirar a configuração secreta da árvore servível (validando compatibilidade do Wrangler); no mínimo usar `server.fs.strict`, negar `**/.wrangler/**` e arquivos locais de configuração secreta em `server.fs.deny` **preservando todos os padrões de negação nativos do Vite**, e restringir `server.fs.allow` aos diretórios de código necessários **em ambas as configurações**. Não colocar segredos em `public/`.
2. **P2 falha antes de criar state.json:** inicialização do Docker/migrations antecede o `try/catch` de processos no launcher. Se falhar cedo, não pode deixar container vivo enquanto `Status` informa parado e `Stop` não consegue reconciliar. Implantar cleanup **somente** de container com nome, label, porta e mount do checkout verificados; preservar volume e chaves; registrar estado parcial se cleanup também falhar.
3. **P2 proveniência incompleta:** incluir os auxiliares críticos `auth/crypto.ts`, `auth/webauthn.ts`, `auth/email.ts`, `alpha-auth-state.ts`, `alpha-session.ts`, SQL 0001–0014 e hash de configuração relevante no escopo, ou deixar explícito que a verificação é parcial e não é prova da integridade integral.

**Implementação (automaticamente executável):** patch mínimo e testes em ambiente local com **valores sentinela não secretos**, sem chave real de provedor; validar acesso anônimo por `/@fs/` **tanto em Alpha quanto no Vite local de fixtures**, caminhos codificados/alternativos e acesso ao arquivo bruto — **HTTP 403/404 e nenhum byte sentinela retornado**. Exercitar injeção de falha de migrations/readiness, Stop/restart e colisão de checkouts, sem tocar containers alheios. Runbook e hashes atualizados.

**Critério de saída E0:** regressões passam, nenhuma rota Web serve arquivo sensível, nenhum processo/volume de outro checkout é modificado e Security QA **independente**, read-only, aprova os hashes exatos. **Não inserir credencial real antes de E0 READY.**

## E1 — Seleção de starter conforme SPEC-027

**Estado atual:** INCOMPLETE. `apps/api/src/local-alpha.ts` força Bulbasaur; `AuthenticatedApp` chama imediatamente `PlayerApi.createProfile(csrf)`; `PUT /player/profile` não recebe starter. Esse comportamento impede a escolha do jogador.

**Implementação proposta, de menor superfície:**

1. **Backend/contrato:** preservar `PUT /player/profile` e autenticação/CSRF existentes. Introduzir um `starterSpeciesId` **obrigatório no provisionamento de um novo jogador Alpha**, validado pelo servidor contra exatamente os seis IDs imutáveis aprovados. Na outra configuração (prealpha fixture), preservar o contrato atual e o starter predefinido — não quebrar o fluxo legado. Sem novo endpoint genérico de gameplay.
2. **Estado autoritativo:** ampliar a leitura de perfil (ou serviço de status associado) para distinguir `needs_starter`, `bootstrap_incomplete` e `ready`; uma linha de Player pré-criada após falha **não** significa bootstrap concluído. Nenhum HUB, Hunt ou mutação de coleção antes de bootstrap persistido. Resposta perdida reconcilia DB antes de reenviar. **Mudança de Account na mesma origem:** o `AuthenticatedApp` atual conserva `provisioning.current` em `useRef` entre mudanças de CSRF da Session; resetar/keyar este estado pela identidade autoritativa da sessão e reconsultar o Player para não considerar Player B pronto por reutilizar Promise de A.
3. **Persistência:** reutilizar `PlayerBootstrapApplicationService.bootstrap` e `commitPlayerBootstrap`, que já persistem Pokémon, Team e Inventory em transação e identificam replay/conflito de starter. Validar input **antes** de criar dados, associar Player à Account da sessão, aceitar replay do mesmo starter e rejeitar troca posterior com conflito explícito, inclusive em duas abas simultâneas.
4. **Frontend:** entre Session autenticada e HUB, mostrar seleção visual dos seis starters com nome, representação visual/placeholder aprovado, confirmação explícita, navegação por teclado, estados de erro/loading. **Remover auto-PUT com Bulbasaur** do Alpha; permitir carga/reconciliação para conta já provisionada sem pedir segunda escolha. Confirmado → provisionar → HUB. Não reescrever origin/proveniência v1 de contas antigas.

**Testes automáticos:** seis opções válidas, inválida/ausente sem gravar Player, cada Level 5/XP124/HP completo/Moves SPEC-027, Team/Inventory 50/20/5, replay pós-resposta perdida sem duplo grant, duas abas com escolhas divergentes → exatamente uma persistida, falha de bootstrap sem HUB, **substituição de cookie de A por B na mesma origem enquanto um bootstrap está em voo**, re-probe do Player B antes de habilitar HUB, regression fixture local intacto.

**Critério E1:** todas as seis escolhas realmente funcionam e ficam imutavelmente persistidas no servidor; Backend + UX/A11y + Integrity QA aprovam antes do teste A/B.

## E2 — E-mail real pelo Resend

**Estado atual:** adapter HTTPS implementado e testes com transporte mock PASS. Variáveis de operador `ALPHA_RESEND_API_KEY` e `ALPHA_EMAIL_FROM` **não configuradas**; nenhum e-mail real recebido.

**Dependência humana/operacional (sem compartilhar segredos no chat/repo):**

- Acesso a uma conta Resend com domínio/subdomínio **de envio** controlado pelo operador; verificar DNS conforme instruções do provedor (SPF/DKIM relevantes). Confirmar domínio como apto a enviar e origem `From` autorizada.
- Criar credencial de API de escopo mínimo e armazená-la no cofre/ambiente do operador, fora do Git, histórico de shell e saída de QA. Configurar as duas variáveis **somente após E0 READY**.
- Disponibilizar duas caixas de e-mail reais e distintas, com consentimento de uso no teste, e acesso aos navegadores/passkeys dessa mesma máquina de validação. Segredos de código, convite e cookie não entram em relatórios.

**Implementação/QA:** startup fail-closed sem chave ou remetente; emitir convites reais individualizados pelo operador; observar ID de aceitação do Resend, status de entrega do provedor quando disponível, e **recebimento efetivo nas duas caixas**, usando o segredo no frontend para comprovar posse. Verificar ação consumida, convite redeemed e Account criada somente após prova de email; falha, bounce, expiração/retry limitado à mesma caixa, reenvio após até 15 min, nenhuma conta fantasma. Não equiparar HTTP 202/ID do provedor a entrega/recebimento.

**Critério E2:** dois destinatários recebem e resgatam seus próprios códigos, de modo auditável e redigido (sem segredos). Não existe bypass de verificação nem vazamento em logs.

## E3 — Duas jornadas reais na mesma URL

**Estado atual:** infra nãofixture/HTTP smoke PASS, mas sem A/B WebAuthn real. O teste fixture 5173/5174 não serve como aceite.

**Roteiro controlado:**

| Verificação | Evidência exigida |
| --- | --- |
| Entrada | Browser A e Browser B em **perfis limpos separados**, ambos em `http://localhost:5173/`. Sem `5174`, sem bearer injetado, mesmo servidor/banco. |
| Enrollment | Convites e e-mails distintos, verificação real, WebAuthn `navigator.credentials.create()` real (não emulado), Session cookies independentes. |
| Identidade | IDs `Account A != Account B`, `Session A != Session B`, `Player A != Player B`, correlacionados por leitura segura do banco, nunca pela porta/URL. |
| Bootstrap | A e B escolhem starters (preferencialmente diferentes), possuem Pokémon, Team e Inventory próprios; Level/XP/quantidades e autoridade v2 corretos. |
| Isolamento | Browser B não consegue ler ou alterar Pokémon/Team/Inventory de A, e vice-versa; resposta apropriada e nenhum vazamento. |
| Recuperação | Reload, logout, re-login por passkey, parada/restart da API com dados/segredos preservados; não regrant, alterar starter ou perder progresso. |
| Falhas | 401/403/429, e-mail expirado, credencial cancelada, timeout/resposta perdida e duas entradas quase simultâneas no bucket loopback compartilhado. |

**Automação:** preparar ambiente/convites e capturar evidência DB/logs sanitizados; testes sintéticos para regressão e negativas. **Humano/tester:** receber e-mail real, registrar passkey em browser real e avaliar a experiência. Um autenticador virtual/CDP não substitui a prova real exigida.

**Critério E3:** dois cookies, duas Accounts, duas Sessions, dois Players e dois bootstraps distintos comprovados na **mesma URL**, sem identidade fixture e sem leak; passar reload/retorno. Esse é o mínimo do PA-M6.1, não substitui a validação ampliada de gameplay PA-M6.2/6.3.

## E4 — QA independente e Human Owner Gate

**Ordem:** Implementation tests e review → QA Web/UX/A11y **read-only** → QA Security/Integrity **read-only** (dados, ORIGIN/CSRF/WebAuthn, autorizações, file serving, migração e cleanup) → coleta de evidência real E2/E3 → decisão do Human Owner.

**Exigências finais:** todos os P0/P1 = 0; qualquer P2 residual explicitado e decidido; `typecheck`, `lint`, suites focal/full, build e `roadmap:check` PASS nos hashes exatos; eventos/identidades auditados em documento sem tokens; serviços gerenciados sem orfandade. Nenhum reviewer implementador é o único aprovador da sua própria alteração.

**Human Review:** Owner percorre primeiro acesso, starter picker, e-mail, passkey, loading/erro, ícones/assets/placeholders e chegada ao HUB. O gate não fecha por PASS de suite isolada ou por screenshot de fixture; só autorização explícita do Owner conclui PA-M6.1.

## Dependências resumidas / responsável

| Frente | Implementation / QA pode fazer | Necessário do operador ou Human |
| --- | --- | --- |
| E0 Segurança | Código, testes, smoke com segredos sentinela, re-gate independente | Nenhuma credencial ou ação de tester |
| E1 Starter | Backend, UI, testes dos seis, regressão | Aprovação posterior da UX/placeholder pelo Owner; regra dos seis já está aprovada |
| E2 Resend | Integrar/verificar adaptador, logs redigidos, testes de falha | Domínio verificado, key configurada localmente, duas caixas reais |
| E3 Browsers A/B | Preparar cenários, evidência DB, controles de isolamento | Duas cerimônias WebAuthn reais e leitura dos emails pelo(s) testador(es) |
| E4 Review | QA multiagente, Security/Integrity, atualizar documentos | Aprovação humana explícita do entry/UX |

### Atualização de governança

E0 BLOCKED pelo P1 potencial leitura do TOML; E1 PLANNED, E2 WAITING REAL PROVIDER, E3 WAITING E1/E2, E4 PENDING. TASK-136 continua **ACTIVE**, PA-M6.1 **NOT READY**, PA-M6.2/6.3/6.4 **PENDING**. O roteiro acima **não** autoriza liberar testers ou anunciar início da Phase 01.

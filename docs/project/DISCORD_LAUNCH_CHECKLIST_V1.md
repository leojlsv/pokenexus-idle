# Skadyn Idle Discord Launch Checklist v1

## Uso

Checklist para **configurar e testar**, ainda sem pressupor que o servidor foi criado. A estrutura oficial e a matriz de permissões estão no [Discord Blueprint v1](DISCORD_BLUEPRINT_V1.md); atendimento e automações têm instruções próprias em [Community Operations](DISCORD_COMMUNITY_OPERATIONS_V1.md) e [Bot & Automation Plan](DISCORD_BOT_AUTOMATION_PLAN_V1.md).

## 1. Base do servidor

- [ ] Definir proprietário, responsáveis pela comunidade e pessoas que atenderão suporte.
- [ ] Habilitar Community e configurar Rules Screening com as regras publicadas.
- [ ] Configurar AutoMod, proteção contra raid, segurança de links e limites para spam.
- [ ] Confirmar idioma padrão PT-BR e condições de atendimento reais.
- [ ] Preparar testes de acesso com contas sem privilégios.

## 2. Categorias e canais públicos do núcleo

- [ ] `START HERE`: `#welcome`, `#rules`, `#faq` (leitura pública; equipe publica).
- [ ] `OFFICIAL`: `#announcements` (leitura pública; Owner/Community Manager publicam).
- [ ] `COMMUNITY HUB`: `#general`, `#media` (membros conversam após o aceite das regras).
- [ ] `GAMEPLAY & FEEDBACK`: `#help`, `#feedback`, `#bug-reports`.
- [ ] Configurar `#feedback` e `#bug-reports` como fóruns, com diretrizes e tags. Se Forum não estiver habilitado, documentar a alternativa de texto e threads.
- [ ] `SUPPORT`: `#support` (painel e instruções, sem denúncias públicas).
- [ ] Garantir que `#general` é facilmente encontrado e que perguntas comuns sobre o jogo não exigem migração de canal.

## 3. Áreas restritas

- [ ] Criar `STAFF/#staff-chat` com acesso somente a membros internos designados.
- [ ] Criar `STAFF/#moderation-log` visível somente a Owner, Community Manager, Moderator e automação necessária.
- [ ] Criar `STAFF/#ticket-log` visível somente a Owner, Community Manager, atendentes designados e bot necessário.
- [ ] Quando houver convidados da Closed Alpha: criar `ALPHA TESTING/#alpha-testing` e restringir a Alpha Tester, QA, Developer e responsáveis designados.
- [ ] Na Beta: criar área separada se necessária, visível somente a Beta Tester e equipe autorizada, sem herança automática de Alpha Tester.
- [ ] Verificar que um Alpha Tester ou Beta Tester sem função interna não enxerga canais STAFF.

## 4. Cargos

- [ ] Usar `@everyone` como base de acesso público, com participação limitada pelo Rules Screening até a aceitação.
- [ ] Criar apenas cargos de equipe efetivamente ocupados: Community Manager, Moderator, Developer, QA e Artist; Owner é a propriedade real do servidor.
- [ ] Criar `Alpha Tester` e `Beta Tester` como cargos distintos; conceder manualmente conforme aprovação de acesso em cada fase.
- [ ] Permitir que o membro mantenha o reconhecimento histórico de Alpha e Beta, sem autorizar automaticamente a próxima fase ou canais encerrados.
- [ ] Definir critérios e marco de elegibilidade de `Founder` e `Early Supporter` antes das concessões; ambos são reconhecimentos sem privilégios.
- [ ] Considerar `Bug Hunter`, `Guide Author`, `Community Helper`, `Content Creator` e `Event Champion` apenas quando houver contribuições verificáveis e operação correspondente.
- [ ] Não criar `Competitive`, `Staff` genérico com acesso irrestrito ou `Support` apenas por conveniência.
- [ ] Não exigir `Player` para entrar nos canais públicos; não presumir que Rules Screening atribui cargos.
- [ ] Adiar `Updates`, `Events` e avisos PvP até existirem notificações regulares e autoatribuição verificada.
- [ ] Configurar, quando houver seleção confiável, `🇧🇷 PT-BR` e `🌐 EN` como preferências opcionais e cumulativas por Onboarding ou menu de bot; manter um único `#general`.

## 5. Permissões efetivas

- [ ] START HERE e OFFICIAL: `@everyone` pode ler; apenas responsáveis autorizados podem publicar.
- [ ] COMMUNITY HUB e GAMEPLAY & FEEDBACK: membros após screening podem conversar e criar respostas/threads adequadas.
- [ ] Moderator: apenas permissões de moderação necessárias, sem `Administrator`/`Manage Roles`/`Manage Channels` por padrão.
- [ ] Developer/QA/Artist: nenhum poder de moderação concedido só pelo cargo.
- [ ] STAFF, ALPHA TESTING e tickets: `View Channel` explicitamente restrito; validar sobreposições de cargos e hierarquia.
- [ ] Bots: nenhuma permissão `Administrator`; validar hierarquia e acesso apenas aos canais necessários.

## 6. Suporte e automação

- [ ] Testar Rules Screening do início ao fim sem etapa adicional obrigatória de bot.
- [ ] Configurar `#support` e um mecanismo funcional de tickets privados antes de anunciar atendimento privado.
- [ ] Testar abertura/encerramento, visibilidade, escalonamento e política de transcrições dos tickets.
- [ ] Confirmar logs de moderação, acesso aos logs e quais eventos são efetivamente gravados.
- [ ] Publicar orientação de como reportar vulnerabilidades e denunciar usuários sem exposição pública.
- [ ] Se forem adotados Community Onboarding e autoatribuição de cargos, validar pré-requisitos, perguntas e preview; não ativá-los apenas para atribuir `Player`.

## 7. Validação com perfis reais de teste

- [ ] Convidado que ainda não aceitou regras: não consegue conversar ou participar.
- [ ] Membro que aceitou regras: encontra `#general`, conversa e usa canais de ajuda/feedback.
- [ ] Membro comum: não encontra STAFF, ALPHA TESTING ou tickets de terceiros.
- [ ] Alpha Tester: vê a área Alpha somente na fase ativa e não ganha moderação nem acesso a denúncias.
- [ ] Beta Tester: sozinho não vê Alpha; Alpha Tester sozinho não vê Beta; ambos só veem canais de fase autorizados.
- [ ] Idiomas: testar escolha isolada e múltipla, troca posterior, ausência de visibilidade privilegiada e operação no mesmo `#general`.
- [ ] Moderator: consegue conter abuso e consultar `#moderation-log`, sem publicar anúncios oficiais nem acessar indiscriminadamente outros tickets.
- [ ] Developer e QA: conseguem contribuir nos canais designados, mas não acessam logs de denúncia sem autorização específica.
- [ ] Bot: opera somente as funções previstas; falhas de bot não deixam dados privados visíveis.
- [ ] Revisar canais, mensagens fixadas, tags, links e nomes usados em todos os documentos.

## 8. Ativações posteriores

- [ ] Avaliar novos canais somente após haver uso frequente: `#guides`, `#team-building`, `#strategy`, `#events`, `#trading`, `#guilds` ou `#server-status`.
- [ ] Criar notificações opt-in apenas com rotina de publicações e um mecanismo de inscrição testado.
- [ ] Integrar identidade de jogador, rankings e eventos automáticos somente quando os sistemas correspondentes existirem no jogo.
- [ ] Reavaliar roles/permissões após testes com a comunidade e antes de qualquer abertura pública maior.

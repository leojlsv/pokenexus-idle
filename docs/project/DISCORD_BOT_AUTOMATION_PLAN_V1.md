# Skadyn Idle Discord Bot & Automation Plan v1

## Objetivo

Automatizar apenas o que reduz trabalho operacional real: proteção contra abuso, tickets privados e notificações escolhidas pelo membro. Seguir os canais e privilégios definidos no [Discord Blueprint v1](DISCORD_BLUEPRINT_V1.md).

## Fase inicial: recursos nativos primeiro

| Recurso | Implementação | Critério de ativação |
| --- | --- | --- |
| Regras de entrada | Discord Community + Rules Screening | Antes de abrir convites à comunidade |
| Antispam e contenção | AutoMod e recursos de segurança do próprio Discord | Antes de abrir convites; testar alertas e falsos positivos |
| Fóruns `#feedback` e `#bug-reports` | Canais Forum do Discord | Quando Community estiver habilitado; senão usar texto e threads provisoriamente |
| Logs de moderação | Recursos nativos e/ou automação restrita | Confirmar quem acessa e quais eventos são registrados |
| Tickets privados | Um bot de tickets com permissões mínimas | Somente depois de validar criação, visibilidade, encerramento e retenção |
| Autoatribuição de notificações | Onboarding nativo ou bot de roles | Somente quando existirem cargos de opt-in e avisos recorrentes |

Não instalar bots redundantes de XP, economia, níveis ou vários moderadores ao mesmo tempo. A escolha de fornecedor de tickets deve ser feita na implementação, considerando escopo de acesso, exportação, retenção e disponibilidade. Não presumir que o log de auditoria nativo contenha o histórico completo dos tickets.

## Entrada dos membros

```text
Convite → aceite no Rules Screening → acesso aos canais públicos → #general
Convidado à Closed Alpha → atribuição manual de Alpha Tester → #alpha-testing
Convidado à Beta → atribuição manual de Beta Tester → área de beta quando existir
```

O Rules Screening limita a participação antes do aceite; **não concede automaticamente `Player`**. No núcleo inicial, `@everyone` recebe as permissões públicas necessárias. `Alpha Tester` e `Beta Tester` são concedidos manualmente após autorização para a fase respectiva, sem acesso cruzado automático. O reconhecimento pode ser preservado após o encerramento, enquanto permissões de canais de testes continuam revogáveis.

Quando o servidor já tiver atividade que justifique a personalização, avaliar Community Onboarding para selecionar canais e opt-ins. O Discord atualmente exige sete canais padrão, incluindo cinco com envio permitido para `@everyone`; verificar a exigência no momento de configurar. Não criar conversas artificiais para cumprir esse mínimo.

Para seleção de idioma, oferecer uma pergunta opcional **"Quais idiomas você fala?"**, permitindo múltiplas respostas: `🇧🇷 PT-BR` e `🌐 EN`. Cada resposta atribui o cargo correspondente. Sem Onboarding, um bot restrito pode disponibilizar essa escolha por menu em `#welcome`, desde que a interação funcione com o canal em modo somente leitura. Nenhum dos cargos de idioma deve alterar a visibilidade de `#general`, dar acesso interno ou traduzir mensagens automaticamente.

## Tickets e dados privados

O `#support` deve conter apenas instruções e um mecanismo testado de abertura de ticket. O bot cria espaço privado visível ao solicitante e atendentes designados, sem expor outros tickets. Categorias possíveis: assistência técnica, denúncia, conta e vulnerabilidade.

Antes de habilitar o bot:

- verificar que um membro não vê, pesquisa ou exporta tickets de terceiros;
- limitar permissões do bot a canais e operações necessárias; sem `Administrator`;
- confirmar acesso a `#ticket-log` somente de operadores designados;
- decidir e comunicar tratamento de transcrições e dados pessoais;
- testar encerramento, reabertura, falha do bot e encaminhamento de incidentes críticos;
- jamais solicitar senha, código de autenticação ou token.

## Logs e moderação

`#moderation-log` é privado para Owner, Community Manager e Moderator. Registrar somente eventos úteis à revisão de ações, com evidência mínima, evitando coleta excessiva. Um eventual `#bot-events` só será criado se o volume justificar; não conceder acesso universal à categoria STAFF para facilitar logs.

AutoMod deve priorizar spam, menções excessivas, links suspeitos e tentativa de ataque coordenado, com revisão humana. Evitar filtros que silenciem discussões legítimas de jogo.

## Notificações e cargos

O cadastro em `Updates`/`Events` é opcional e só será disponibilizado quando estiver operando. `Competitive` não será cargo de identidade; `PvP Alerts` poderá existir para torneios futuros. Os cargos de idioma podem identificar preferências antes de haver canais separados, mas comunicados bilíngues dependem de atendimento/editoria real.

Evitar pings repetitivos: anúncios importantes aparecem em `#announcements`; menções a cargos opt-in ficam reservadas a eventos relacionados ao interesse assinalado. Bots de autoatribuição não podem modificar cargos de staff, `Alpha Tester`, `Beta Tester` ou reconhecimentos que exijam concessão manual.

## Integrações futuras com o jogo

Vincular Discord a conta Skadyn Idle, conceder identidade de jogador verificado, publicar rankings ou eventos somente após existir autoridade server-side e um fluxo de autorização/recusa de vínculo. O Discord nunca determina recompensas ou progressão do jogo. Integrar apenas funcionalidades efetivamente entregues no produto.

## Validação de segurança

Usar contas de teste sem privilégios, com regras pendentes, com regras aceitas, com `Alpha Tester`, com `Beta Tester`, com ambos, com dois idiomas e com funções moderadoras. Verificar isolamento entre fases, permissões resultantes de múltiplos cargos, hierarquia e isolamento de áreas privadas. Bots ficam abaixo dos cargos de staff na hierarquia e só recebem os privilégios indispensáveis.

Referências: [Rules Screening](https://support.discord.com/hc/en-us/articles/1500000466882-Rules-Screening-FAQ), [Community Onboarding](https://support.discord.com/hc/en-us/articles/11074987197975-Community-Onboarding-FAQ), [Roles and Permissions](https://support.discord.com/hc/en-us/articles/214836687-Discord-Roles-and-Permissions).

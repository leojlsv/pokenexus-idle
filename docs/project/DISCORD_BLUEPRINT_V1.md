# Skadyn Idle Discord Blueprint v1

## Objetivo e estágio

O Discord será o ponto de encontro da comunidade e um canal de comunicação oficial, ajuda e feedback do Skadyn Idle. Este é um projeto de configuração; os canais, cargos e automações descritos aqui ainda precisam ser criados e testados no servidor.

O Skadyn Idle está em pré-alpha. A estrutura pública deve crescer conforme o jogo e a comunidade realmente utilizarem seus recursos, sem antecipar canais de PvP, trocas, guildas ou rankings.

**Princípio central:** `#general` é a praça da comunidade. Conversas casuais sobre Pokémon, times, estratégias e atualizações podem permanecer ali. Um canal dedicado só é necessário quando a atividade exige registro, acompanhamento, privacidade ou consulta posterior.

## Estrutura inicial recomendada

| Categoria | Canal | Tipo | Finalidade |
| --- | --- | --- | --- |
| START HERE | `#welcome` | Texto, somente equipe publica | Orientação de entrada e links essenciais |
| START HERE | `#rules` | Texto, somente equipe publica | Regras oficiais e caminho para denúncias |
| START HERE | `#faq` | Texto, somente equipe publica | Como jogar, estágio do projeto e dúvidas recorrentes |
| OFFICIAL | `#announcements` | Texto, somente equipe publica | Atualizações do jogo, desenvolvimento, testes e avisos operacionais |
| COMMUNITY HUB | `#general` | Texto | Conversa principal de todos os assuntos do jogo |
| COMMUNITY HUB | `#media` | Texto | Prints, vídeos e criações que precisam ser encontrados depois |
| GAMEPLAY & FEEDBACK | `#help` | Texto | Dúvidas que pedem acompanhamento ou respostas reutilizáveis |
| GAMEPLAY & FEEDBACK | `#feedback` | Fórum | Sugestões e discussões estruturadas, com tags como Jogabilidade, Balanceamento e Interface |
| GAMEPLAY & FEEDBACK | `#bug-reports` | Fórum | Bugs reproduzíveis sem dados privados nem detalhes exploráveis |
| SUPPORT | `#support` | Texto, somente equipe/bot publica | Orientação e abertura de tickets privados, inclusive denúncias |

O uso de Fórum requer habilitar **Community** no Discord. Se ainda não estiver habilitado, `#feedback` e `#bug-reports` podem começar como canais de texto com uma thread por assunto; a equipe deve validar a migração antes de ativar os fóruns.

Categorias e canais privados são criados quando houver responsáveis para operá-los:

| Área restrita | Canal | Quem acessa |
| --- | --- | --- |
| STAFF | `#staff-chat` | Owner, Community Manager e equipe interna designada |
| STAFF | `#moderation-log` | Owner, Community Manager, Moderator e automação de moderação |
| STAFF | `#ticket-log` | Owner, Community Manager e operadores de suporte designados |
| ALPHA TESTING | `#alpha-testing` | Alpha Tester autorizado, QA, Developer e responsáveis pelo teste |

Os logs e tickets devem permanecer restritos; ser Developer, Artist ou QA não concede automaticamente acesso a denúncias e dados de atendimento. Uma pessoa pode receber mais de um cargo quando acumular funções.

## Canais sob demanda

| Gatilho observado | Canal candidato | Regra |
| --- | --- | --- |
| Guias recorrentes que se perdem no chat | `#guides` | Abrir como fórum ou canal curado, com responsável pela manutenção |
| Pedidos constantes de composição de times | `#team-building` | Incluir PvP e PvE inicialmente no mesmo lugar |
| Discussões avançadas frequentes prejudicando o fluxo do chat | `#strategy` | Reunir meta, PvP, cálculos e teoria; subdividir só se houver demanda sustentada |
| Eventos recorrentes com calendário real | `#events` | Canal de programação, não de conversa paralela |
| Trocas efetivamente disponíveis no jogo | `#trading` | Publicar regras de fraude e moderação antes de ativar |
| Guildas e grupos efetivamente disponíveis | `#guilds` | Usar recrutamento e organização no mesmo canal |
| Volume persistente de incidentes operacionais | `#server-status` | Separar avisos de disponibilidade dos anúncios gerais |

`#pvp`, `#theorycrafting`, `#balance`, `#economy`, `#pokemon`, `#memes`, `#introductions` e `#rankings` não são necessários no núcleo. Discussões comuns acontecem em `#general`; feedback recorrente entra em `#feedback`. Reavaliar a necessidade após observar o uso, sem criar canais apenas porque um sistema está no roadmap.

## Modelo canônico de cargos

### Administração e equipe

| Cargo | Atribuição | Permissões e escopo |
| --- | --- | --- |
| Owner | Proprietário do servidor | Controle final; cargo visual é opcional e não substitui a propriedade real do servidor |
| Community Manager | Nomeação manual | Comunicação oficial, triagem, coordenação da moderação e dos tickets; permissões operacionais apenas onde necessárias |
| Moderator | Nomeação manual | Gerenciar mensagens/threads e aplicar timeout nos espaços moderados; sem `Administrator`, `Manage Roles` ou `Manage Channels` por padrão |
| Developer | Nomeação manual | Participar das áreas internas autorizadas e orientar questões técnicas; sem poderes de moderação por função |
| QA | Nomeação manual | Verificar bugs e participar de testes internos; sem poderes de moderação por função |
| Artist | Nomeação manual, quando houver | Participar das áreas internas autorizadas; sem poderes de moderação por função |

`Staff` é apenas o nome da categoria privada, **não é um cargo de acesso irrestrito**. `Support` é uma responsabilidade que pode ser exercida por membros designados; não criar um cargo separado até existir uma equipe e um fluxo que o justifiquem.

### Comunidade

| Cargo | Regra | Atribuição |
| --- | --- | --- |
| `@everyone` | Base dos canais públicos, sujeita à aceitação das regras pelo Rules Screening | Automática do Discord |
| `Founder` | Reconhecimento permanente de participantes fundamentais da fundação da comunidade; critérios e lista são definidos pelo Owner antes da primeira concessão | Manual, exclusiva |
| `Early Supporter` | Reconhecimento permanente de apoiadores no estágio inicial; definir marco temporal e elegibilidade antes da primeira concessão | Manual, exclusiva |
| `Alpha Tester` | Participante aceito na Closed Alpha; durante a fase, abre apenas os canais de alpha autorizados | Manual, com aprovação |
| `Beta Tester` | Participante aceito na Beta; abre apenas canais de beta quando eles existirem | Manual, com aprovação |
| `Player` | **Não necessário no lançamento.** Só criar se houver função real; aceitar as regras não atribui automaticamente esse cargo | Não criar por enquanto |

`Alpha Tester` e `Beta Tester` são distinções cumulativas: um participante pode possuir ambos. O histórico visual pode permanecer após a fase, mas um cargo antigo nunca autoriza automaticamente a próxima etapa. Quando o teste encerrar, bloquear/arquivar o canal da fase; se conteúdo restrito precisar continuar acessível apenas a participantes ativos, usar concessão operacional separada e revogável, sem retirar o reconhecimento histórico.

`Founder` e `Early Supporter` não dão autoridade sobre jogadores, vantagens no jogo, direito a acesso futuro ou poderes de equipe. Definir publicamente critérios verificáveis para evitar reivindicações e reclassificações arbitrárias. Membros podem acumular ambos quando elegíveis.

### Reconhecimento adicional e interesses

| Cargo candidato | Critério de concessão | Quando avaliar |
| --- | --- | --- |
| `Bug Hunter` | Contribuições reproduzíveis e relevantes confirmadas pela equipe; evitar recompensar quantidade de reports | Após fluxo de triagem estabelecido |
| `Guide Author` | Guias úteis, atualizados e revisados; sem obrigação de atendimento | Quando houver guias públicos |
| `Community Helper` | Ajuda consistente e comportamento positivo; **não representa equipe de suporte** | Quando houver moderação capaz de revisar indicações |
| `Content Creator` | Participação em programa de criadores com critérios transparentes | Quando o programa existir |
| `Event Champion` | Resultado verificado em evento oficial; reconhecimento visual sem privilégios | Quando houver eventos |

Interesses cosméticos como `Shiny Hunter`, `Collector` e `Strategist` podem ser autoatribuídos no futuro, mas não justificam novos canais nem múltiplos cargos no lançamento. `Competitive` não é cargo de identidade; se houver torneios, oferecer uma inscrição de avisos de competição.

### Notificações e idiomas

`Updates` e `Events` são opt-ins futuros, criados somente quando houver publicações frequentes e um fluxo funcional de autoatribuição. Avisos da fase Alpha podem mencionar `Alpha Tester` com parcimônia; os da fase Beta, `Beta Tester`. Um eventual `PvP Alerts` depende da existência de torneios. Não usar ping de `@everyone` como substituto das inscrições.

O idioma padrão inicial é PT-BR. A proposta de cargos de preferência linguística é `🇧🇷 PT-BR` e `🌐 EN`. É possível exibir `🇺🇸 EN` ou `🇬🇧 EN` como alternativa visual, mas uma bandeira representa um país, não toda a comunidade anglófona. O membro poderá escolher ambos ou nenhum, sem afetar acesso básico.

**Seleção:** quando existir Community Onboarding, apresentar uma pergunta opcional, com respostas múltiplas, que atribui cada cargo. Antes disso, a mesma escolha pode ser oferecida por menu de um bot restrito de autoatribuição em `#welcome`, se a operação e a segurança forem testadas. Os cargos identificam preferência de comunicação e permitem menções direcionadas; **não traduzem mensagens**. Anúncios devem ser traduzidos editorialmente quando houver capacidade, sem exigir um novo `#general`.

Manter `#general` único e aberto a mensagens em ambos os idiomas. Considerar `#english-general` apenas com volume estável e moderação bilíngue real. Os cargos de idioma não devem ter permissões administrativas, controlar visibilidade pública nem separar membros na lista por `Display role members separately`. Ícones próprios exibidos junto aos nomes exigem o benefício de ícones de cargos do servidor (Boost nível 2); emojis no nome do cargo independem disso.

## Matriz de permissões

| Área | Membro após Rules Screening | Alpha Tester / Beta Tester | Equipe autorizada |
| --- | --- | --- | --- |
| START HERE | Ler; sem publicar | Igual | Owner/Community Manager publicam |
| OFFICIAL | Ler; sem publicar | Igual | Owner/Community Manager publicam; Developer sugere conteúdo |
| COMMUNITY HUB | Ler e conversar | Igual | Moderator/Community Manager moderam |
| GAMEPLAY & FEEDBACK | Ler, postar e responder | Igual | Moderator modera; QA/Developer fazem triagem conforme responsabilidade |
| SUPPORT `#support` | Ver instruções e abrir ticket | Igual | Bot e responsáveis publicam instruções |
| Tickets privados | Apenas seu próprio ticket | Apenas seu próprio ticket | Equipe de atendimento designada; sem acesso global a outros cargos |
| ALPHA TESTING | Sem visualizar | Apenas Alpha Tester autorizado na fase Alpha; Beta Tester sozinho não recebe acesso | QA, Developer e responsáveis designados |
| Futuro BETA TESTING | Sem visualizar | Apenas Beta Tester autorizado na fase Beta; Alpha Tester sozinho não recebe acesso | QA, Developer e responsáveis designados |
| STAFF `#staff-chat` | Sem visualizar | Sem visualizar por ter cargo de teste | Equipe interna designada |
| STAFF logs | Sem visualizar | Sem visualizar | Somente responsáveis por moderação/atendimento e bots necessários |

Regras de aplicação:

- Definir `View Channel`, `Send Messages`, `Create Public Threads`, `Manage Messages`, `Manage Threads` e `Moderate Members` explicitamente onde aplicável. Evitar permissões amplas no servidor inteiro.
- `Administrator` ignora bloqueios dos canais; reservar ao proprietário. Não conceder `Manage Roles`, `Manage Webhooks`, `Manage Channels`, `Kick Members` ou `Ban Members` a bots e moderadores sem necessidade e delegação específicas.
- Conferir a hierarquia de cargos e o acesso efetivo com contas de teste: a combinação de permissões de diferentes cargos pode permitir acessos inesperados.
- Denúncias, segurança de conta e possíveis exploits são tratados exclusivamente por ticket privado, nunca em um canal público como `#player-reports`.

## Entrada e atribuição de cargos

```text
Convite → Rules Screening (aceita regras) → canais públicos → #general
                                                   ├─ #help / #feedback / #bug-reports
                                                   └─ #support → ticket privado
Convidado à Closed Alpha → concessão manual de Alpha Tester → #alpha-testing
Convidado à Beta → concessão manual de Beta Tester → área Beta quando existir
```

O **Rules Screening** nativo bloqueia participação até a aceitação das regras, mas não deve ser tratado como automação de atribuição de `Player`. No modelo inicial, a participação pública depende de `@everyone` e do screening, sem etapa adicional de bot.

O **Community Onboarding** (seleção de canais e cargos) é opcional em uma fase posterior. A documentação atual do Discord exige configurar pelo menos sete canais padrão, cinco deles com permissão de envio para `@everyone`; não abrir canais artificiais para satisfazer essa condição. Ao adotá-lo, rever critérios e testar o preview antes de publicar.

## Critérios de evolução

Abrir canais adicionais apenas quando existir atividade frequente que se perca no `#general`, necessidade clara de consulta posterior ou operação/segurança específica, e alguém responsável por moderar o canal. Revisar a estrutura após o início dos testes de comunidade e novamente quando novas funcionalidades efetivamente chegarem ao jogo.

## Referências de configuração

- [Discord — Rules Screening](https://support.discord.com/hc/en-us/articles/1500000466882-Rules-Screening-FAQ)
- [Discord — Community Onboarding](https://support.discord.com/hc/en-us/articles/11074987197975-Community-Onboarding-FAQ)
- [Discord — Roles and Permissions](https://support.discord.com/hc/en-us/articles/214836687-Discord-Roles-and-Permissions)
- [Discord — Forum Channels](https://support.discord.com/hc/en-us/articles/6208479917079-Forum-Channels-FAQ)
- [Discord — Custom Role Icons](https://support.discord.com/hc/en-us/articles/4409571023639-Custom-Role-Icons-FAQ)

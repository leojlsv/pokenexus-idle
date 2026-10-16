# Skadyn Idle Discord Community Operations v1

> **Estado documental (2026-10-16): PLANO, não operação em produção.** Todo o texto abaixo define **fluxos futuros** e usa o presente como instrução operacional, não como prova de canais, fóruns, tickets, bots, equipe ou permissões efetivamente configurados. O checklist `DISCORD_LAUNCH_CHECKLIST_V1.md` permanece aberto; nenhum usuário, Alpha Tester, canal privado, ticket de suporte ou função real foi habilitado por este documento. Revisar owner/atendente, Rules Screening, visibilidade cruzada e retenção antes de executar ou publicar; TASK-136 E0–E4 e Human live review permanecem gates separados.

## Objetivo

Operar o Discord com `#general` como ponto central, atendimento identificável e moderação consistente. A estrutura de canais, cargos e permissões está definida em [Discord Blueprint v1](DISCORD_BLUEPRINT_V1.md); este documento define os procedimentos humanos.

## Responsabilidades

| Função | Responsabilidade operacional |
| --- | --- |
| Owner | Decidir políticas, nomeações, mudanças de acesso e casos graves |
| Community Manager | Publicar comunicados, organizar a equipe, revisar incidentes e coordenar atendimento |
| Moderator | Conter spam/assédio, orientar canais, documentar medidas e escalar casos |
| Atendente designado | Conduzir tickets autorizados; a função não exige criar um cargo `Support` |
| Developer | Analisar questões técnicas encaminhadas e produzir informações para comunicados |
| QA | Reproduzir bugs e validar correções, sem receber acesso geral a denúncias |
| Artist | Produzir material da comunidade quando designado, sem privilégios de moderação |
| Alpha Tester | Participar dos testes da fase Alpha autorizada, sem acesso à área interna da equipe |
| Beta Tester | Participar dos testes da fase Beta autorizada, sem herdar acesso da Alpha nem acesso à equipe |

## Fluxos da comunidade

### Conversa e dúvidas

Uma dúvida casual pode começar e terminar no `#general`. Encaminhar para `#help` apenas quando houver necessidade de acompanhar respostas, organizar informações ou evitar repetição. Não aplicar advertências por conversas sobre estratégia, Pokémon ou progressão dentro de `#general`.

### Feedback

Quando a estrutura de canais estiver criada e validada, o jogador poderá discutir livremente no `#general` e, se quiser registrar uma proposta, usar `#feedback`. O fórum **planejado** usará tags de tema e permitirá procurar duplicatas; a equipe registrará avaliação, eventual decisão e motivação quando houver. Votos e popularidade não representam aprovação de produto.

### Bugs públicos

Jogador publica em `#bug-reports` com versão, comportamento observado, reprodução e evidências sem dados sensíveis. Moderador/QA identifica duplicatas e verifica necessidade de reprodução; Developer recebe apenas o necessário para investigação. Não prometer resolução ou prazo sem decisão da equipe técnica.

### Atendimento privado e denúncias

Após a configuração e os testes do mecanismo privado, o jogador poderá acessar `#support` e abrir um ticket com visibilidade controlada. A equipe classificará como suporte, denúncia, segurança de conta ou vulnerabilidade, restringirá participantes ao solicitante e operadores autorizados e encaminhará internamente o mínimo necessário. **Esse fluxo ainda não foi provisionado nem testado.** Nunca solicitar senha, token ou código de autenticação. Evitar expor denúncias em canais públicos, logs acessíveis a toda a equipe ou mensagens diretas não verificadas.

Tickets recebem identificação, responsável, estado e resultado do atendimento. A política de retenção, exportação e exclusão de transcrições precisa ser definida antes de habilitar qualquer armazenamento automático; não pressupor arquivamento irrestrito.

## Moderação e escalonamento

| Situação | Resposta inicial | Escalonamento |
| --- | --- | --- |
| Conversa em canal pouco adequado | Orientar somente quando necessário | Nenhum |
| Spam, flood ou conteúdo inadequado leve | Remover conteúdo/avisar | Moderator ou Community Manager |
| Reincidência, assédio, conflito persistente | Timeout proporcional e registro | Community Manager |
| Golpe, ameaça, exposição de dados ou ataque coordenado | Contenção imediata, preservando evidência mínima | Community Manager e Owner |
| Suspeita de exploit/abuso da conta do jogo | Ticket privado e triagem técnica | Owner e equipe do jogo, por processo separado |

Registrar medidas relevantes em `#moderation-log`: responsável, regra aplicada, evidência mínima, medida e eventual revisão. Acesso restrito a moderação autorizada. Pessoas envolvidas em um conflito não decidem sozinhas recursos relativos à própria atuação.

Não aplicar punição na conta do jogo apenas com base em uma ação de Discord; decisões no jogo seguem autoridade e regras próprias.

## Comunicação oficial

Quando criado, validado e formalmente aberto, `#announcements` será a fonte oficial de mudanças, avisos de teste e disponibilidade. Owner ou Community Manager publicarão; Developer e QA fornecerão informações verificadas para revisão. **A designação não indica canal atualmente existente ou boletim publicado.** Evitar múltiplos canais vazios de roadmap, patch notes e manutenção antes de existir um fluxo de publicação recorrente.

As operações são realizadas conforme a capacidade da equipe. Não prometer atendimento 24/7 nem um SLA numérico na fase inicial. Casos de risco imediato à comunidade têm prioridade sobre sugestões e suporte rotineiro.

## Reconhecimento e idiomas

Owner/Community Manager validam a elegibilidade de `Founder`, `Early Supporter` e reconhecimentos futuros (`Bug Hunter`, `Guide Author`, `Community Helper` etc.) segundo os critérios do Blueprint. São títulos sem privilégios de staff ou garantia de gameplay. `Alpha Tester` e `Beta Tester` podem coexistir no histórico do membro, mas a equipe controla separadamente o acesso aos canais ativos da fase.

O atendimento público começa em PT-BR; mensagens em inglês podem participar do mesmo `#general`. Cargos `🇧🇷 PT-BR` e `🌐 EN` identificam a preferência e ajudam a organizar comunicações, sem tradução automática ou obrigação de atendimento bilíngue imediato. Uma segunda praça social só faz sentido se houver demanda constante e responsável por moderá-la.

## Evolução

Reavaliar novos canais, divisão de equipe, automação de tickets e programa de criadores quando houver uso e responsáveis sustentáveis. Mudanças de permissões devem ser revisadas conforme o Blueprint e verificadas com contas de teste antes de abrir novas áreas.

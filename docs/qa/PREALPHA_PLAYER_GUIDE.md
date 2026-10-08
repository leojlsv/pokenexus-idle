# Pre-alpha local — acesso e roteiro de teste

Este guia cobre o candidato local da TASK-122. O objetivo é testar o fluxo de gestão e progresso com dados reais, identificar falhas reproduzíveis e preservar evidências. Não é uma versão pública nem um aceite do M1 completo.

**Starters no nível 5:** conforme a [emenda aprovada SPEC-027](../specs/SPEC-027-starter-level-five-bootstrap-amendment.md), novos starters nascem com **124 de XP acumulado e HP cheio**, mantendo Player1/XP0 e estoque inicial50/20/5. Os dois starters existentes das contas A/B também foram convertidos pela operação local separada e autorizada, preservando IDs, IVs, genética, nascimento v1, inventário e histórico. Recarregue com **Ctrl+F5**; não execute Reset nem Bootstrap para repetir a conversão.

## 1. Como acessar

Abra os endereços **no mesmo computador que executa o ambiente**:

| Conta | Acesso inicial, sem abrir a sincronização do Hunt | Uso sugerido |
|---|---|---|
| B | [http://localhost:5174/pokemon](http://localhost:5174/pokemon) | Primeiro teste controlado; Cyndaquil e nenhum Hunt iniciado na última conferência. |
| A | [http://localhost:5173/pokemon](http://localhost:5173/pokemon) | Bulbasaur; comparação de isolamento e novo teste de Hunt, sem Hunt ativa na conferência pós-conversão. |

Não precisa criar conta, informar senha ou escolher starter: as duas contas de teste já foram inicializadas. Cada porta seleciona sua própria conta; podem ser abertas no mesmo navegador. Use uma aba por conta durante o primeiro teste e mantenha `localhost` nos endereços. Alternar para `127.0.0.1` cria outra origem para o armazenamento do navegador.

Os endereços não estão publicados na internet nem disponíveis no celular/outro computador. No celular, `localhost` apontaria para o próprio celular. Não configure túnel ou acesso externo para estes testes.

### Estado conferido após a conversão e a primeira Hunt real da B — 07/10/2026

| Dado | Conta A — porta 5173 | Conta B — porta 5174 |
|---|---|---|
| Player | Lv.1 / XP0 | Lv.1 / XP6 |
| Pokémon | Mesmo Bulbasaur, Lv.5 / XP124 | Mesmo Cyndaquil, Lv.5 / XP142 |
| HP atual | 20/20 | 0/20 após o encerramento da Hunt |
| Moves | Vine Whip → Growl → Tackle | Leer → Tackle |
| Teams preservados | 2 Teams, incluindo o original com o starter | 1 Team com o starter |
| Inventory | 50 Poké Balls / 18 Basic Potions / 5 Revives de 25% | 50 Poké Balls / 20 Basic Potions / 5 Revives de 25% |
| Hunt | Nenhum Hunt ativo; histórico anterior preservado | Nenhum Hunt ativo; recovery anchor atual `2026-10-07T18:15:39.299Z` |

Esses valores são uma referência de conferência, não saldos a restaurar depois. As duas Potions já consumidas na A não foram repostas. A primeira Hunt real da B concedeu +18 XP ao Cyndaquil e +6 XP ao Player, sem drop de item, e terminou depois com o Cyndaquil KO; por isso B já não está no baseline XP124/HP20 da conversão. Antes de iniciar outra Hunt na B, aguarde a recuperação se necessário e cure o Team no PokéCenter. Não use Reset/Bootstrap para voltar aos valores anteriores.

### Se a página não abrir

Abra o PowerShell neste worktree; as correções atuais ainda não foram integradas ao `main`:

```powershell
Set-Location -LiteralPath 'G:\pokenexus-idle\.worktrees\TASK-122-local-prealpha-environment-runbook'
corepack pnpm local:prealpha:status
```

Se o ambiente estiver parado, mantenha o Docker Desktop com o engine Linux em execução e inicie com a autoridade aprovada:

```powershell
powershell -NoProfile -File scripts/local-prealpha.ps1 -Action Start -Players 2 -GeneticProfilesPath docs/qa/PREALPHA_GENETIC_PROFILE_RELEASES.json
```

Depois confira:

```powershell
corepack pnpm local:prealpha:smoke
```

O esperado é `Infrastructure smoke PASS` e `Genetic Profile authority preflight READY`. Se houver estado existente com processos quebrados, use o Stop controlado antes de tentar Start novamente:

```powershell
corepack pnpm local:prealpha:stop
```

Se Stop, Start ou Smoke recusarem a operação, registre a mensagem; não mate processos indiscriminadamente nem apague arquivos para contornar a proteção. Doctor verifica portas livres e não é um teste de saúde para um ambiente já em execução.

**Não execute Reset nem Bootstrap para o acesso cotidiano.** Reset apaga o progresso local. Bootstrap já foi concluído e não é um mecanismo para repor itens ou trocar starter. Não altere os pares genéticos, a chave de individualization, o relógio do sistema ou as tabelas do banco para provocar resultados.

## 2. O que está disponível — e o que não está

| Tela | Como chegar | O que observar |
|---|---|---|
| Pokémon | Menu **Pokémon** → **View Pokémon** | Coleção, instância, nível, seis IVs, experiência total e ordem dos Moves salvos. |
| Teams | Menu **Teams** → **Edit roster** | Membros, ordem, gravação e criação de presets. |
| Inventory | Menu **Inventory** | Quantidades atuais; **Refresh** relê o servidor. Não existe uso manual de itens nessa tela. |
| Hunt | Menu **Hunt** | Escolha de Zone/Hunt e Team, preview, Start e PokéCenter quando não há Hunt ativo. |
| Active Hunt | **Open active Hunt** | HP, Encounter atual, sincronização, **Hunt activity**, **Automation policies** e **Retreat**. |
| Automações | **Settings** → **Hunt settings**, ou **Open Hunt settings** no Inventory | Capture, Potion e Revive; cada política tem seu próprio botão Save. |

Limitações conhecidas, que não devem ser confundidas com regressões:

- **Combat Card:** mostra aviso porque o feed de combate detalhado não está habilitado. Não há animação ou sequência visual de golpes para validar. Use HP, Encounter e Hunt activity; o aviso não impede, por si só, a sincronização do Hunt.
- **Moves:** a ordem salva pode ser consultada, mas a edição ainda não está disponível. Evolução, PvP, Duo e navegação livre de um HUB multiplayer não fazem parte deste teste.
- **Hunt Result:** mostra o estado atual **No active Hunt**, a recuperação do Player e a atividade da Hunt referenciada nesta aba. **End reason unavailable** significa que essa tela não recebe o motivo final; não é uma confirmação de derrota ou Retreat. O botão **Open last viewed Hunt activity**, quando disponível em Hunt, abre a referência local sem afirmar que ela é a última Hunt encerrada.
- **Activity vazia:** **No activity records available** significa que o servidor não retornou entradas para a Hunt consultada, não que nenhum combate ou gasto ocorreu. A derrota terminal e seus consumos podem não constar dessa Activity. **No Hunt selected in this tab** significa que o histórico não foi consultado por falta de referência local. Mesmo após a última página, a lista não é um extrato completo da Hunt. Confira os saldos atuais por **Check current Inventory** e a progressão por **Check Pokémon**, sem deduzir o custo de uma Hunt apenas desses saldos.
- **Apresentação:** algumas telas mostram IDs técnicos no lugar de nomes amigáveis. Registre problemas de legibilidade, mas IDs longos não significam corrupção. Em Settings, mantenha **Card**; escolher Visual não habilita o feed ausente.

## 3. Roteiro principal — conta B

### T1 — Conferir a base antes de gastar recursos

Em **Pokémon**, abra Cyndaquil e anote instância, nível, IVs e experiência total. Em **Teams → Edit roster**, confirme um único membro. Em **Inventory**, anote os três saldos e capture a tela. Em **Hunt settings**, confira se Capture, Potion e Revive estão desligados antes do teste sem automação.

**Esperado:** recarregar essas telas não cria Pokémon/Teams nem concede novamente50/20/5. A conversão autorizada deixou a A com **Bulbasaur Lv.5/XP124, Vine Whip → Growl → Tackle** e a B inicialmente com **Cyndaquil Lv.5/XP124, Leer → Tackle**; a B agora está em **XP142** após a vitória real já validada. Novas criações v2 começam em XP124; Squirtle usa Water Gun → Tackle → Tail Whip. Não complete quatro Moves artificialmente: somente os elegíveis até Lv.5 e já suportados entram no bootstrap. Após novos testes, use nível, XP, HP e saldos efetivamente lidos como referência, sem Reset.

### T2 — Iniciar e observar um Hunt sem automações

1. Em **Hunt**, escolha **Verdant Edge · Wilds** em **Zone / Hunt** e o Team do starter em **Saved Team**.
2. Confira **Selected Team** e **Authoritative Encounter preview** antes de iniciar. As seis espécies possíveis são Pidgey, Rattata, Caterpie, Sentret, Ledyba e Sunkern; não é necessário encontrar todas numa sessão curta.
3. Clique uma vez em **Start Hunt**, confirme e depois em **Open active Hunt**.
4. Observe por alguns ciclos de sincronização, até resolver Encounters ou retornar ao HUB. O progresso é automático; não há botão manual de atacar, capturar, Potion, Checkpoint ou Claim.

**Esperado:** HP e tempo lógico são atualizados pelo servidor; Encounters resolvidos aparecem em **Hunt activity**. A atualização ocorre em blocos, não como animação contínua. Sem vitórias, não exija XP ou drops. Com Capture desligado não deve haver gasto de Ball nem captura automática; com Potion/Revive desligados não deve haver consumo desses itens. Drops podem aumentar o inventário mesmo com todas as automações OFF.

Evidência real já obtida nessa conta: uma vitória resolveu no tempo lógico8000, concedeu **+18 XP ao Cyndaquil e +6 XP ao Player, sem drop**, e o mesmo comando de sincronização continuou a Hunt até15521 com um segundo Encounter. Repetir a chave idempotente já concluída retornou o mesmo resultado sem duplicar a recompensa. Isso valida esse caminho específico; não garante vitória/captura nas próximas Hunts.

Não é obrigatório o starter vencer ou sobreviver por um tempo mínimo. Se não houver mais Pokémon consciente e nenhum Revive aplicável, o Hunt deve terminar. Registre travamento se, com o serviço saudável, não houver atualização nem explicação; não confunda um sincronismo em andamento com um comando concluído.

Pokémon capturados podem mostrar uma Ability selecionada, como **Chlorophyll**. No catálogo atual essas Abilities estão inativas por política de combate: o valor permanece salvo no Pokémon, mas não é aplicado ao Battle até existir regra executável. Isso não deve tornar um Team com 2+ membros inadmissível. Se aparecer `HTTP 422: hunt_not_admissible` junto de **Pending Hunt command**, recarregue com **Ctrl+F5** e use **Continue exact saved command** uma vez. Para um 422 terminal já confirmado, essa repetição exata limpa a correlação antiga; não crie outra key para contornar o erro.

### T3 — Retreat, recuperação e PokéCenter

Se o Hunt ainda estiver ativo, use **Retreat** quando disponível e confirme. Se ele já terminou, vá para **Back to Hunt / PokéCenter**. Na tela Hunt, selecione o Team e use **Heal Team at PokéCenter**.

**Esperado:** o personagem retorna à gestão do HUB, sem exigir deslocamento manual. O HP persiste após sair do Hunt; esperar a recuperação de 30 segundos não deve curar automaticamente. PokéCenter cura o Team selecionado gratuitamente, sem gastar Potion/Revive, inclusive membros KO. Um novo Hunt só pode iniciar quando o servidor aceitar a recuperação e houver membro consciente. Não repita Start continuamente durante o bloqueio.

Um Encounter não resolvido pode reaparecer ao reiniciar na mesma zona; isso preserva a seleção e não deve ser tratado automaticamente como falha de aleatoriedade.

### T4 — Configurar e testar automações

Faça a primeira configuração sem Hunt ativo, para separar consumo de recursos de tempo acumulado. Estes são **ajustes opcionais da conta de teste**, não novos defaults ou mudanças de balanceamento:

| Política | Como configurar | Proteção inicial sugerida |
|---|---|---|
| Automatic Capture | Marque **Enable automatic Capture**; permita **Allow automatic use** somente para `pokenexus:item:poke-ball:v1`; clique **Add catch rule**, selecione essa Ball, deixe Shiny em **Any** e as demais condições vazias; **Save Capture policy**. | Com saldo 50, **Minimum reserve = 45**. |
| Auto-Potion | Marque **Enable Auto-Potion**; **HP trigger = 50% or lower**; permita somente `pokenexus:item:basic-potion:v1`; **Save Potion policy**. | Com saldo 20, **Minimum reserve = 18**. |
| Auto-Revive | Deixe OFF na primeira rodada. Para um teste posterior de KO, permita somente `pokenexus:item:revive-25:v1`, marque **Enable Auto-Revive** e use **Save Revive policy**. | Com saldo 5, **Minimum reserve = 4**. |

No candidato atual, Auto-Potion lista somente a Basic Potion possuída e Auto-Revive lista somente o Revive-25 possuído. Poké Ball não deve aparecer em nenhuma dessas duas seções. `Minimum reserve` não pode ser maior que o saldo atualmente possuído do item; a própria tela limita a entrada e o servidor repete essa validação no Save. O servidor continua sendo a autoridade final de compatibilidade. Apenas marcar o toggle não basta: Capture exige Ball permitida e regra, e cada seção precisa ser salva separadamente. Espere a confirmação e releia a tela depois de cada Save.

Também é válido salvar Auto-Potion **OFF**, com o item permitido e o **HP trigger** já configurados. O percentual e as reservas ficam salvos, mas a política desligada não autoriza uso automático. A ausência inicial de configuração não é a mesma coisa que uma configuração salva e desligada.

Se um Save OFF anterior deixou **HTTP 400: invalid_request** e um **Pending Hunt command** de `potion_policy`, recarregue a mesma aba com **Ctrl+F5** e use **Reconcile and discard local correlation**. O botão lê a política atual antes de pedir confirmação; após confirmar, confira/refaça a seleção e use **Save Potion policy** novamente. **Continue exact saved policy command** repete o payload antigo, incluindo seu erro. O descarte remove somente a correlação local e não desfaz efeitos no servidor; não use esse procedimento automaticamente para comandos em processamento (`202`) ou falhas de resultado incerto.

Reserva é o saldo que o uso automático deve preservar, **não uma quantidade máxima de utilizações**. Ajuste conforme seu saldo atual; uma reserva **igual** ao saldo impede o gasto enquanto não houver reposição. Uma reserva maior que o saldo é inválida e não pode ser salva. Drops podem repor Balls/Potions e permitir usos adicionais. Não altere a reserva para um valor menor sem considerar esse consumo real.

Inicie um novo Wilds e observe os resultados. Capture pode falhar legitimamente: cada tentativa consome uma Ball, sucesso ou falha; não há captura garantida. Uma captura bem-sucedida deve aparecer em Pokémon depois de Refresh. Potion não revive e usa o gatilho/intervalo autorizado; não deve consumir um item a cada atualização da tela. Revive só é elegível num KO coberto pela política e não pode converter derrota/empate já encerrado em vitória ou prêmio.

Para verificar o limite da reserva, observe os saldos após sincronização, considerando também os drops. Não deve haver quantidade negativa ou gasto que viole a reserva vigente. Depois do teste de Revive, desligue e salve a política para não gastar o restante inadvertidamente.

As políticas também podem ser alteradas durante um Hunt. Teste isso numa rodada posterior por **Automation policies**, uma mudança por vez: a alteração é prospectiva, não reescreve consumo/capturas anteriores. O Save pode reconciliar progresso pendente com a política antiga antes de aplicar a nova; compare os limites confirmados, não apenas a ordem dos cliques.

### T5 — Conferir progresso e montar um Team

Compare **Hunt activity**, **Inventory → Refresh** e **Pokémon → View Pokémon → Total experience**. Use a relação:

```text
Saldo final = saldo inicial + drops confirmados − itens consumidos confirmados
```

Faça essa conferência após sincronização e, preferencialmente, com o Hunt encerrado, para não misturar instantes diferentes. Não confunda duas capturas da mesma espécie com duplicação: compare o ID da instância e o Encounter que a originou. Um mesmo resultado não deve conceder XP, itens ou Pokémon outra vez só por Refresh/reload.

Se capturou outro Pokémon, use **Teams → Edit roster → Add a Collection member → Add member → Save roster**. Reabra e confira a ordem. Uma alteração no preset não troca imediatamente os membros do Hunt em andamento: ele preserva o Team admitido no início. A nova composição vale para o próximo Start autorizado. Não apague o único Team útil durante a primeira rodada.

**Delete Team** também é válido para o Team que foi criado originalmente pelo bootstrap. A exclusão remove apenas o saved Team/preset; não apaga o Pokémon e não reescreve uma Hunt já pinada. O registro histórico do bootstrap continua preservando o ID original do Team para proveniência/replay. Depois de excluir o único Team utilizável, será necessário criar/configurar outro Team antes de um novo Start que exija roster elegível.

Se nenhum Pokémon foi capturado, marque o teste de múltiplos membros como **não exercitado**, não como aprovado ou falho. Não fabrique capturas, altere Moves ou force resultados para fechar o checklist.

## 4. Retomada, isolamento e usabilidade

### T6 — Recarregar e voltar após ausência

Depois de uma sincronização concluída, anote Hunt, último Encounter resolvido, XP e inventário. Feche **todas as abas desse Player**, mantendo Docker e os serviços locais em execução. Após um intervalo registrado, por exemplo 2–5 minutos, reabra diretamente [Active Hunt B](http://localhost:5174/hunt/active).

**Esperado:** a reconciliação de retorno processa o intervalo cabível sem nova concessão do bootstrap e sem duplicar resultados já resolvidos. Se o Team cair antes de cobrir o intervalo, o Hunt termina; não se espera progresso produtivo após a derrota. Se a página disser **No active Hunt**, consulte Hunt e, quando a referência estiver disponível, Hunt Result. A recuperação completa de resumos históricos continua limitada pelo contrato pendente.

O limite produtivo offline é de 8 horas; um teste de poucos minutos **não valida esse teto**. Para um ensaio prolongado, registre o intervalo real e o estado do Team. Não avance o relógio artificialmente. Desligar Wi-Fi não interrompe necessariamente um jogo servido em `localhost`; fechar a aba testa ausência do cliente, enquanto Stop/Start testa reinício do ambiente e deve ser registrado separadamente.

Se houver **Retry synchronization**, registre a mensagem e use essa retomada para o comando já guardado. Quando a sincronização estiver pausada por erro, a mensagem deve mostrar a causa real (`Automatic Hunt synchronization paused: ...`); permanecer apenas em `Synchronizing automatic Hunt progression: ...` depois da pausa é um bug. Para **Continue exact saved command**, **Continue exact saved Retreat** ou **Continue exact saved policy command**, mantenha a intenção anterior. Um Start `422 hunt_not_admissible` é exceção conhecida porque o próprio servidor já marcou o comando como terminal; a UI atual limpa essa correlação após a repetição exata. Não apague armazenamento do navegador, nem use **Reconcile and discard local correlation** para mascarar erro incerto: isso pode eliminar a chave necessária para diagnosticar/repetir o comando.

### T7 — Confirmar isolamento A/B

Mantenha A em Pokémon/Teams/Inventory, sem abrir Active Hunt. Execute uma ação de teste na B e releia as telas equivalentes da A. Os Pokémon, Teams, itens e políticas de uma conta não devem aparecer na outra. Se também executar Hunts na A, passe a comparar o progresso de cada conta separadamente.

Teste negativo somente de leitura: copie a URL de um detalhe de Pokémon ou Team da B e troque **apenas a porta para 5173**. O esperado é indisponibilidade/404, nunca os detalhes privados da B. Não envie comandos HTTP manuais para tentar mutações cruzadas; esses cenários já possuem testes automatizados descartáveis.

### T8 — Usabilidade básica

Percorra as telas com mouse e Tab/Enter; reduza a largura da janela e teste zoom de 125% ou 150%. Verifique se mensagens e números continuam legíveis, se botões essenciais permanecem alcançáveis e se um Save oferece retorno claro. Registre textos cortados, foco perdido, confirmação confusa e necessidade de rolagem horizontal excessiva como problemas de UI, separados de falhas de dados.

## 5. Como classificar e relatar

Use **PASS**, **FALHOU**, **NÃO EXERCITADO** ou **LIMITAÇÃO CONHECIDA** em cada T1–T8. Não marque captura/Revive/paginação/offline de 8h como PASS sem observar a condição correspondente. A ausência de drop ou captura numa amostra pequena não prova erro de probabilidade.

Interrompa novas ações que alterem dados se houver conta trocada, Pokémon desaparecido, duplicação de recompensa, inventário negativo, perda do Team ou falha persistente de sincronização. Preserve o estado; não use Reset como solução. Um 409 de versão desatualizada pode ser uma proteção correta, mas bloqueio sem caminho claro de recuperação deve ser relatado.

```text
Teste: T4 — Auto-Potion
Conta/porta: B / 5174
Data e hora local:
Tela/URL e navegador:
Passos executados:
Resultado esperado:
Resultado observado / mensagem exata:
Hunt / Encounter / Pokémon / Team ID, quando visível:
HP, XP, inventário e políticas antes → depois:
Ocorreu após reload, ausência ou Stop/Start?
Consegue reproduzir? Quantas vezes?
Screenshot ou vídeo:
```

IDs de Hunt/Player/Team e mensagens ajudam a investigação; **não compartilhe cookies, tokens, o arquivo de individualization ou a configuração Wrangler gerada**. Se usar F12 para complementar o relato, copie somente a mensagem e o status da requisição, sem cabeçalhos de autenticação.

Ao encerrar, use Retreat no Hunt que não pretende continuar, confira o retorno e saldos e depois `corepack pnpm local:prealpha:stop` no worktree indicado. Stop preserva o banco, mas não substitui Retreat: parar o ambiente não significa encerrar um Hunt ativo.

## Referências do roteiro

- [Runbook técnico e diagnóstico](PREALPHA_LOCAL_TEST.md).
- [TASK-122: escopo, evidências e limites de aceite](../../tasks/active/TASK-122-local-prealpha-environment-runbook.md).
- Telas implementadas: [Hunt](../../apps/web/src/hunt-pages.tsx), [automações](../../apps/web/src/hunt-settings.tsx), [Pokémon/Teams](../../apps/web/src/player-pages.tsx) e [Inventory](../../apps/web/src/inventory-page.tsx).

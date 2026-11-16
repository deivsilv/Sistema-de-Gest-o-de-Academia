# SteakUp — Supabase

Front em React + Vite + TypeScript conectado diretamente ao Supabase Auth e à API REST. O perfil vem da tabela perfis protegida por RLS, nunca de uma escolha no login ou de metadados editáveis pelo usuário.

## Executar

```sh
npm install
npm run dev
```

O servidor Vite abre em http://127.0.0.1:5173. A API Express anterior não é mais usada pelo front. O código em server/ permanece como referência da etapa anterior; suas contas e testes não representam a autenticação atual do Supabase.

Crie `.env.local` com:

```dotenv
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUBSTITUA_AQUI
```

O projeto local já tem esses valores configurados. Somente a URL e a chave pública são usadas no front. Chaves secretas nunca devem ter prefixo VITE_.

## Banco e login

A estrutura é a dos scripts SQL entregues na conversa: perfis, planos, matriculas, pagamentos e treinos, com RLS. E-mail e senha são gerenciados pelo Supabase Auth. A conta precisa ter um perfil ativo. ADMIN, PERSONAL e ALUNO abrem suas respectivas interfaces automaticamente.

O SDK mantém e renova a sessão do Supabase no navegador. A autorização continua no banco, por RLS. O projeto atual é uma SPA com o SDK do Supabase; o cookie HttpOnly da implementação Express anterior não é usado. Nenhuma senha é armazenada pelo front.

As contas locais antigas não existem no Supabase. Use a conta criada em Authentication > Users. O perfil inicial inativo exige ativação administrativa. O cadastro público deve ser desabilitado em Authentication > Sign In / Providers > Allow new users to sign up.

Planos e treinos usam REST. Trocar plano usa a RPC transacional vincular_plano. Treinos mantêm aluno e autor após a criação; edite a descrição ou desative e crie uma nova rotina. Os registros exibidos vêm do banco, sem importar dados do antigo localStorage.

Os e-mails dos outros usuários não estão na tabela pública perfis. Por isso, o painel apresenta os nomes dos cadastros e o e-mail apenas do próprio usuário; o botão Acesso consulta o e-mail no Auth e permite ao administrador alterar e-mail e redefinir senha, sem expor dados de login a alunos ou personal trainers.

## Cadastro de contas: função publicada

A Edge Function `admin-users` foi publicada no projeto Supabase e está ativa. Seu código está em `supabase/functions/admin-users/index.ts`. O gateway valida o JWT (`verify_jwt = true`); o handler também valida a identidade via Auth.getUser e consulta o perfil ADMIN ativo antes de usar a API administrativa. Sem token válido ou sem ADMIN ativo, a operação é recusada.

A função usa SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do ambiente interno do Supabase. Não copie esses segredos para o front. O cadastro público foi desativado no painel: novas contas são criadas por administradores autenticados por esta função.

Por padrão, CORS permite apenas http://localhost:5173 e http://127.0.0.1:5173. Quando houver endereço de produção, configure ALLOWED_ORIGINS nas secrets da função com a origem correta.

A função cria contas confirmadas por uma ação de administrador autenticado. Se o perfil falhar após a criação no Auth, a conta permanece inativa e o erro orienta a conferir o painel. Se somente o vínculo de plano falhar, a conta já existe; edite o aluno para concluir o vínculo, sem repetir o cadastro.

Login, leitura, planos, edição de perfis permitida por RLS e treinos usam o Supabase. A criação de contas pelo site usa a função publicada. O menu Pagamentos permite registrar recebimentos presenciais e analisar comprovantes.

## Verificar

```sh
npm run build
```

A compilação verifica os tipos do front e o código legado do Express. Os testes `test:api` validam somente a API antiga. A integração autenticada e as políticas RLS do projeto remoto precisam ser verificadas com contas de cada perfil; a chave pública não permite testar uma sessão sem o titular entrar.

## Verificação da publicação

Confirmado no projeto remoto: admin-users ACTIVE, JWT habilitado; cadastro público desativado; requisições sem sessão, com token adulterado ou chave pública no lugar de sessão recusadas com HTTP 401; preflight CORS local respondeu HTTP 204. A criação autenticada deve ser conferida com o administrador entrando no site; não foram criadas contas de teste no banco remoto.

## Comprovantes e pagamentos

Aluno: Meu plano > Enviar comprovante. Aceita PNG, JPEG e PDF até 5 MB, com valor e data. O arquivo fica no bucket privado comprovantes, sem acesso público. O upload não registra pagamento nem libera treino. Depois de concluir o upload, o envio fica PENDENTE.

Administrador: Pagamentos > Preparar download > baixar arquivo por link assinado de 60 segundos. Após conferir o recebimento, pode aprovar ou rejeitar. Rejeição exige motivo, visível ao aluno. Aprovação insere exatamente um pagamento e marca APROVADO na mesma transação, com bloqueio de linha e relação única. O prazo de acesso considera a data do pagamento; aprovar comprovante de mais de 30 dias preserva o histórico sem liberar os treinos atuais.

Pagamento presencial: Pagamentos > Registrar recebimento. Selecionar aluno ativo, valor, data e forma, e confirmar que o recebimento foi conferido. A operação usa um identificador de solicitação para evitar duplicação em tentativas do mesmo formulário. Não processa Pix, cartão ou transferência; é um registro de pagamento já recebido.

A aprovação não é uma validação automática de autenticidade bancária: o administrador precisa conferir valor, data e efetivo recebimento. Os arquivos não podem ser sobrescritos nem excluídos pelo cliente. Uploads interrompidos ficam RASCUNHO (envio incompleto), visíveis somente ao próprio aluno; se o arquivo já chegou, Concluir envio tenta finalizar novamente. Arquivos de rascunhos abandonados precisam de uma rotina de retenção/limpeza antes do uso prolongado em produção.

Tabelas/RPCs adicionadas em supabase/comprovantes.sql. Esse SQL já foi aplicado ao projeto remoto; não execute novamente. supabase/comprovantes.test.sql usa transação e ROLLBACK e foi executado: aprovação única, rejeição sem pagamento, motivo obrigatório, proibição de data futura, idempotência de registro manual, janela de 30 dias, isolamento RLS e bucket privado. Nenhum recebimento fictício permaneceu no banco.

O botão Atualizar situação recarrega os pagamentos e comprovantes. Navegar entre seções da área do aluno também atualiza a situação. Não há notificações em tempo real.

## Gerenciar acesso

Administrador: Alunos ou Personal trainers > Acesso. A Edge Function consulta a conta pelo ID, verifica ADMIN ativo, confirma o tipo do alvo e impede usar essa operação para alterar administradores. A troca de e-mail é imediata; a redefinição exige nova senha de pelo menos 10 caracteres, confirmação e oferece mostrar/ocultar. Não alterei credenciais reais durante os testes.

## Validação desta entrega

npm run build e npm run test:edge passaram. Os 10 testes de Edge usam um cliente Auth simulado, sem criar usuários ou mudar senhas reais. A versão 2 de admin-users está publicada com JWT habilitado; sua consulta de e-mail foi conferida no site em sessão administrativa real. A área financeira também carregou sem erros no navegador. O envio real de um arquivo e a aprovação pela interface ainda devem ser conferidos com uma conta de aluno; não há aluno cadastrado neste momento.

O advisor sinaliza as funções RPC SECURITY DEFINER expostas a authenticated: isso é intencional para as transações, com autorização explícita no corpo e sem EXECUTE para anon. A função interna rls_auto_enable teve EXECUTE público revogado. A proteção de senhas vazadas do Auth continua uma configuração separada do projeto: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .

## Situação financeira separada do cadastro

O aluno novo é criado com cadastro ativo para poder entrar e enviar comprovante. A situação financeira começa como Aguardando primeiro pagamento. Enviar comprovante muda a apresentação para Comprovante em análise, sem liberar treinos. Um pagamento confirmado nos últimos 30 dias exibe Em dia, inclusive quando registrado presencialmente. Sem pagamento recente, quem já teve pagamento confirmado aparece como Inadimplente; se houver um novo comprovante pendente, aparece Em análise. Se já estiver em dia e enviar outro comprovante, continua Em dia enquanto o pagamento confirmado for válido.

A lista de alunos mostra cadastro e situação financeira em colunas separadas. Novos alunos sem pagamento não entram no contador de inadimplentes; têm um resumo próprio no financeiro. A diferenciação é calculada pelos pagamentos e comprovantes do Supabase, sem campo de status manual duplicado. Não muda as políticas de acesso aos treinos.

Validação: npm run test:finance verifica 17 cenários, incluindo início do cadastro, análise, confirmação, vencimento, rejeição sem pagamento, limite de 30 dias, outro aluno e pagamento presencial.

## Pix na área do aluno

Em Meu plano, o aluno pode copiar a chave e exibir QR Code, depois abrir o envio de comprovante. O QR é gerado localmente, sem serviço externo de imagens. Não inclui valor fixo nem confirma recebimento; o administrador continua analisando o comprovante.

A chave atual é fictícia: 8d72f4a1-6b3c-4e90-a125-9f08c7d63b42. O bloco e o QR exibem Demonstração e não devem ser usados para pagar. Configuração futura em .env.local: VITE_PIX_KEY, VITE_PIX_RECEIVER_NAME, VITE_PIX_RECEIVER_CITY e VITE_PIX_DEMO=false somente com a chave real registrada da academia. O código mantém a indicação de demonstração quando a chave fictícia continua selecionada, mesmo se essa flag for alterada.

npm run test:pix cobre CRC16 com vetor conhecido, exemplo de QR estático sem valor do Banco Central, chave fictícia exata, geração de imagem PNG local e rejeição de entradas inválidas. Fonte do formato: https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf . O QR não foi validado para uma transferência real: não existe chave bancária real configurada.


## Correcao da recursao de politicas de treino

A politica de leitura de perfis continha uma consulta direta a treinos, enquanto o cadastro/edicao de treinos consultava perfis. O PostgreSQL expandia essas politicas em ciclo e recusava INSERT com RETURNING (42P17). Aplicado supabase/corrigir_recursao_treinos.sql no projeto remoto: a consulta de vinculo foi isolada em helper no schema private, com search_path vazio, acesso restrito, identidade auth.uid e verificacoes de aluno ativo/adimplente. As politicas de autoria e bloqueio financeiro foram mantidas. O script inicial entregue na conversa foi atualizado para refletir a correcao.

Executado supabase/treinos-rls.test.sql com SET LOCAL ROLE authenticated: criar com RETURNING, consultar aluno, editar, impedir autoria forjada, bloquear sem pagamento, liberar apos pagamento, consultar personal vinculado, impedir aluno de editar, impedir administrador de consultar treinos e ocultar treino inativo. Tudo em transacao revertida, sem criar registros permanentes.

## Relatórios e exigência de plano ativo (14/11/2026)

Administrador > Pagamentos: o histórico permite combinar aluno (incluindo inativos) e datas inicial/final, ambas inclusivas. Exibe status Pago e o total dos registros filtrados. Datas invertidas mostram um erro, sem resultados. Limpar filtros restaura todo o histórico.

O relatório Inadimplência e pendências inclui todos os alunos ativos sem pagamento confirmado nos últimos 30 dias, como exige RF-13. Exibe nome, último pagamento confirmado (ou ausência de pagamento) e situação, com busca por nome. Inclui cadastros aguardando primeiro pagamento e comprovantes pendentes, preservando esses rótulos. O contador antigo de inadimplentes continua separado dos primeiros pagamentos e das análises.

RN-04: o acesso do aluno aos treinos exige matrícula ativa vinculada a plano ativo, com início até hoje, além de pagamento confirmado nos últimos 30 dias. A interface informa quando falta plano. A proteção foi aplicada também no banco com supabase/exigir_plano_ativo.sql, função restrita em private e política RLS. Meu plano e envio de comprovantes continuam disponíveis para regularização. A duração contratada não cria vencimento automático adicional: a regra financeira da documentação permanece em 30 dias.

Arquitetura vigente: React/Vite/TypeScript no cliente; src/api.ts e src/finance.ts concentram chamadas; Supabase Auth, REST/PostgreSQL/RLS/Storage e Edge Function admin-users (TypeScript, runtime Deno) no backend. A API Node/Express anterior em server/ é referência, sem participação no fluxo atual. Isso substitui a proposta original Java/Spring e as camadas específicas daquela stack. O projeto local ainda não tem repositório Git configurado; publicação/versionamento no GitHub permanece pendente.

Verificações: build aprovado; 17 testes financeiros; teste real de RLS em transação revertida cobrindo ausência de plano, plano desativado, falta de pagamento e liberação com ambos. Relatórios conferidos no Brave com dados fictícios temporários, incluindo filtros combinados, intervalo inválido, limpeza e busca. Largura de 390 px conferida: filtros empilhados e tabelas com rolagem horizontal. A página temporária foi removida; nenhum dado fictício foi inserido permanentemente no banco.

Ainda não certificados: navegação completa nos três perfis no Chrome, Firefox e Edge; desempenho de até 2 segundos com 50 usuários distintos; aceite final do fluxo completo pelo usuário. Não confundir build ou testes unitários com essa certificação.

## Teste de carga de leitura (preparado, não executado)

npm run test:load executa consultas REST de 50 usuários distintos simultaneamente, respeitando o conjunto de leituras de cada perfil. Requer STEAKUP_LOAD_URL, STEAKUP_LOAD_PUBLISHABLE_KEY e STEAKUP_LOAD_SESSIONS_FILE. O último aponta para um arquivo JSON privado com exatamente 50 objetos {"accessToken":"token de conta de teste","role":"ALUNO"} (perfis aceitos: ADMIN, PERSONAL, ALUNO). Use contas e sessões de teste; não compartilhe o arquivo nem tokens. .load-sessions.json é ignorado pelo Git. Nenhuma senha é necessária. O script verifica IDs distintos e expiração, não registra tokens, nomes ou respostas e não cria nem altera dados. Reporta erros HTTP, consultas acima de 2 segundos, p95 e máximo. Falha se houver erro ou consulta acima do limite. Esse teste mede leituras REST; não certifica login ou renderização da interface. Ele não foi executado porque ainda não há 50 sessões de teste disponíveis.

## PWA publicado na Vercel (14/11/2026)

Endereço público: https://steakup.vercel.app . Projeto: warsdvd-6274s-projects/steakup. Publicação estática pré-compilada, sem repositório Git vinculado. As mesmas contas do Supabase funcionam no endereço público; a sessão do localhost não é transferida para outro domínio, portanto é necessário entrar novamente.

O manifesto usa display standalone, ícones PNG 192/512, ícone com área segura para máscara e apple-touch-icon 180. O botão Instalar SteakUp usa o prompt quando o navegador o disponibiliza; caso contrário mostra instruções. Android: Chrome > Instalar aplicativo/Adicionar à tela inicial. iPhone: Safari > Compartilhar > Adicionar à Tela de Início. A disponibilidade e os nomes dos comandos dependem do navegador. Instalação final em aparelhos Android/iPhone ainda precisa ser conferida em dispositivos reais.

O service worker só é registrado no build de produção. scripts/build-pwa.mjs gera dist/sw.js com uma versão derivada do conteúdo do build e uma lista explícita de arquivos públicos. Somente JS/CSS do aplicativo, ícones e aviso offline são pré-carregados. Não há cache de respostas do Supabase, Storage, comprovantes, dados de usuários, HTML autenticado ou página principal. Navegações buscam a rede e exibem offline.html se a conexão falhar. Na página já aberta, o evento offline desmonta a interface para evitar operações sem conexão. Ao reconectar, o aplicativo recarrega a situação autenticada. Não há fila de pagamentos/uploads offline nem sincronização posterior automática.

Atualizações: ao detectar novo worker, mostra Nova versão disponível. A pessoa salva o formulário e escolhe Atualizar agora. Não há recarga automática de formulários por troca de versão. Versões anteriores do cache estático são removidas na ativação. Em ambiente de desenvolvimento npm run dev não instala worker, preservando HMR. Para conferir o build local: npm run build e npm run preview (porta 4173). O localhost é apenas um teste no computador; o celular deve acessar o endereço HTTPS público.

Publicação: npm run build, npm run test:pwa e npm run prepare:vercel. Depois, com Vercel CLI autenticada: npx --yes vercel@65.16.0 deploy --prebuilt --prod --project steakup --scope warsdvd-6274s-projects --yes. O artefato .vercel/output contém somente dist e configuração pública de rotas/headers. .env.local e backend não são enviados. A URL e chave publicável Supabase são compiladas no cliente, como previsto; nunca colocar service_role em variável VITE_. Para publicar a partir de Git no futuro, configurar no ambiente de build da Vercel VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY e manter npm run build. .vercel é ignorado pelo Git.

Headers de sw.js impedem cache HTTP duradouro e o manifesto revalida. A função admin-users foi atualizada para versão 3, mantendo JWT e validação de ADMIN ativo, adicionando exclusivamente https://steakup.vercel.app às origens aceitas. Outros domínios Vercel continuam recusados. As origens adicionais de ALLOWED_ORIGINS e os padrões de desenvolvimento continuam funcionando. Se mudar o domínio, ajustar essa lista antes de usar as ações administrativas.

Validação: build concluído; cinco testes de manifesto/ícones, ciclo do worker, fallback offline e exclusão das rotas privadas; onze testes da função administrativa, incluindo origem de produção exata; HTTP público 200 em /, /manifest.webmanifest, /sw.js e /offline.html; headers conferidos sem autenticação Vercel; preflight remoto 204 com CORS exato no domínio do app e 403 para domínio diferente. Tela pública conferida no Brave, em desktop e largura 390px. Nenhum usuário, pagamento ou treino foi criado por estes testes. Login real e instalação em aparelhos físicos ficam para o aceite do usuário. Teste de carga com 50 usuários não será ampliado nesta etapa, conforme decisão do usuário.

Referências: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers ; https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt ; https://vercel.com/docs/build-output-api ; https://vercel.com/docs/cli/deploy .

## APK Android

Versão Android própria com Capacitor. Execute npm run android:apk para gerar um APK release assinado. Consulte ANDROID.md para instalação das ferramentas, assinatura privada, distribuição e limites de validação. O site/PWA permanece disponível. A configuração nativa usa interface local incluída no pacote e o mesmo Supabase; o service worker não é registrado dentro do APK.

# SteakUp — Gestão de Academia

O SteakUp é uma aplicação para organizar a rotina de uma academia, reunindo cadastros, planos, treinos e acompanhamento de pagamentos. O sistema oferece áreas próprias para administrador, personal trainer e aluno, de acordo com o perfil da conta autenticada.

## Tecnologias utilizadas

| Tecnologia | Papel no projeto |
| --- | --- |
| React | Construção das interfaces com componentes reutilizáveis. |
| TypeScript | Tipagem dos dados e das regras da aplicação. |
| Vite | Ambiente de desenvolvimento e geração do build web. |
| Tailwind CSS | Organização dos estilos e do tema visual compartilhado. |
| Supabase | Autenticação, banco PostgreSQL, API REST e armazenamento de arquivos. |
| Capacitor | Integração da aplicação web com o aplicativo Android. |
| PWA | Instalação pelo navegador nos dispositivos compatíveis. |

## Funcionalidades por perfil

| Perfil | Principais funcionalidades |
| --- | --- |
| Administrador | Gerenciar alunos, personal trainers e planos; acompanhar pendências; registrar recebimentos e analisar comprovantes. |
| Personal trainer | Acompanhar alunos e criar, editar ou desativar treinos vinculados a eles. |
| Aluno | Consultar seu plano, acompanhar a situação financeira, enviar comprovantes e visualizar os treinos disponíveis. |

## Como funciona

1. A administração cadastra os usuários e organiza os planos da academia.
2. Ao entrar, cada pessoa acessa automaticamente a interface correspondente ao seu perfil.
3. O personal prepara os treinos vinculados aos alunos.
4. O aluno pode enviar um comprovante para análise. Pagamentos presenciais também podem ser registrados pela administração.
5. A administração confere o recebimento e aprova ou rejeita o comprovante. O envio, sozinho, não confirma o pagamento.
6. A disponibilidade dos treinos considera o cadastro, o plano e a situação de pagamento do aluno.

O acompanhamento financeiro diferencia primeiro pagamento pendente, comprovante em análise, pagamento em dia e inadimplência. O histórico e os filtros ajudam a administração a consultar os recebimentos e acompanhar as pendências.

## Construção da aplicação

A interface é organizada em componentes React, com áreas separadas por perfil e elementos compartilhados, como navegação, formulários, tabelas e diálogos. Os tipos em TypeScript descrevem os dados utilizados nas telas, enquanto módulos de integração concentram a comunicação com os serviços de autenticação e dados.

O Tailwind compõe os estilos dos componentes por meio de `@apply`. Cores e fontes são centralizadas em um tema compartilhado, mantendo a identidade visual em preto e roxo. Animações, gradientes e regras específicas também utilizam CSS.

O layout se adapta a celulares, tablets e computadores. Quando uma tabela precisa de mais espaço, a rolagem horizontal fica dentro de sua própria área para preservar a largura da página.

A autenticação identifica o usuário, e as permissões de acesso são verificadas nos serviços de dados. A interface apresenta as funções correspondentes a cada perfil.

## Web e mobile

A mesma base de interface atende à versão web, ao PWA e ao aplicativo Android com Capacitor. O acesso às contas, aos treinos, aos pagamentos e aos comprovantes depende de conexão com os serviços da aplicação.

## Evolução do projeto

O SteakUp está em desenvolvimento contínuo, com melhorias de usabilidade, responsividade e organização do código. O projeto inclui verificações de tipos e testes para regras financeiras, recursos de Pix, operações administrativas e comportamento do PWA.

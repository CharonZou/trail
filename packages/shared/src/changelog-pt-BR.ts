import type { ChangelogEntry } from "./changelog.js";

export const ptBREntries: ChangelogEntry[] = [
  {
    version: "1.0.4",
    date: "2026-11-20",
    highlights: [
      "A Central de ativos é um novo destino principal na barra lateral e reúne Visão geral, Memória, Skills e Subagentes em um único espaço, sem rotas de configuração separadas para cada tarefa.",
      "A Visão geral apresenta ativos integrados e do usuário, diferencia escopos global e de projeto e mostra os totais atuais de memória e capacidades antes de abrir cada aba.",
      "Memória permite selecionar projeto ou grupo, pesquisar, criar entradas rapidamente, editar e salvar usando a mesma memória administrada pelo host do diálogo de memória do projeto.",
      "O editor compartilhado migra textos antigos para entradas estruturadas, normaliza IDs e itens vazios e bloqueia a troca de projeto enquanto há alterações não salvas para proteger rascunhos.",
      "Skills reutiliza o gerenciador completo de capacidades globais e de projeto, incluindo criação, edição, ativação, importação, movimentação e gerenciamento de diretórios, não apenas uma lista somente leitura.",
      "Subagentes oferece o catálogo completo de agentes integrados e do usuário com os fluxos existentes de criação, edição e ativação, sem dividir a gestão entre várias páginas.",
      "As abas visitadas permanecem montadas e a rota da Central de ativos é carregada sob demanda; alternar entre visão geral e editores não apaga rascunhos nem recarrega todo o espaço.",
      "O backup JSON versionado captura um novo instantâneo do host na exportação, incluindo a memória do projeto ou grupo atual e os skills e subagentes do usuário nos escopos global e do projeto atual.",
      "Os backups incluem o conteúdo necessário para restaurar skills e subagentes do usuário, mas excluem documentos integrados e credenciais; o renderizador não cria um segundo armazenamento persistente.",
      "Os textos estão disponíveis nos nove idiomas da interface, com layouts responsivos, estilos de movimento reduzido e testes de regressão para navegação, migração, backup e limites do host.",
    ],
  },
  {
    version: "1.0.3",
    date: "2026-11-17",
    highlights: [
      "Configurações › Geral › Aparência ganha um seletor de layout: a janela inteira mantém uma bancada contínua, enquanto o cartão flutuante eleva a área principal como um cartão arredondado sobre o fundo lateral.",
      "O modo de cartão flutuante também integra o painel de trabalho direito à mesma superfície arredondada, fazendo dele parte do espaço em vez de uma coluna separada.",
      "A própria página de Configurações pode ser exibida como página inteira ou camada flutuante na mesma seção, sem alterar a preferência de layout das conversas.",
      "O controle de pensamento ganha um cabeçalho mais claro com nível atual e dica Ctrl+T, trilho em degradê verde-azul com seis marcas e partículas luminosas no nível máximo.",
      "Ctrl+T percorre os níveis de pensamento diretamente no compositor, permitindo ajustar os parâmetros do modelo pelo teclado sem abrir o menu de modelos.",
      "O chip de modelo do compositor usa a marca de cada provedor, facilitando a distinção entre modelos com nomes parecidos.",
      "Pastas de projeto podem ser abertas pela barra lateral no VS Code, Trae ou IntelliJ IDEA, com detecção dos editores por PATH, locais comuns de instalação ou Windows App Paths.",
      "Se o editor escolhido não estiver disponível, uma mensagem clara explica o problema em vez de tentar outro executável aleatoriamente ou falhar sem contexto útil.",
    ],
  },
  {
    version: "1.0.2",
    date: "2026-11-06",
    highlights: [
      "Cada projeto pode ter seu próprio ícone e cor de espaço de trabalho, exibidos diretamente na linha da barra lateral para facilitar o reconhecimento.",
      "Os diálogos de criação e edição oferecem um interruptor independente para o índice do espaço, permitindo desativá-lo apenas nos projetos que não precisam dele.",
      "Com a indexação desativada, as sugestões @ deixam de listar arquivos, mas os caminhos já referenciados nas conversas continuam sendo resolvidos normalmente.",
      "O cartão de uso de tokens acima do compositor inicial mostra o total dos últimos doze meses e uma faixa diária de intensidade para identificar padrões de atividade.",
      "O mesmo cartão divide o total por modelo e ajuda a entender quais modelos concentram o consumo recente.",
      "O novo cartão Janela em Configurações oferece ações diretas de minimizar e usar tela cheia sem depender da barra de menus do sistema.",
      "Mais provedores exibem marcas oficiais nas listas, incluindo Mistral, Kimi e Moonshot, facilitando o reconhecimento durante a configuração de modelos.",
      "O ícone do aplicativo é unificado como uma marca limpa em todas as superfícies, incluindo a barra de tarefas do Windows e o alternador Alt+Tab.",
    ],
  },
  {
    version: "1.0.1",
    date: "2026-11-04",
    highlights: [
      "Versão inicial do Trail: um espaço de trabalho desktop local-first para agentes de IA em que projetos, sessões, revisões, pré-visualizações e agentes compartilham um ambiente persistente.",
      "Funciona como aplicativo independente, não como extensão de IDE ou interface de terminal, e os dados do espaço permanecem no computador do usuário.",
      "Modelos na nuvem, locais, endpoints personalizados e APIs compatíveis usam o mesmo fluxo, sem reconstruir o espaço ao trocar de provedor.",
      "As conversas são salvas com o uso de tokens e a duração de cada turno, preservando a transcrição e o contexto de execução ao retornar.",
      "Conversas paralelas em um projeto são isoladas em seus próprios Git worktrees, reduzindo conflitos entre tarefas simultâneas.",
      "O trabalho pode ser delegado a subagentes e várias sessões podem ser coordenadas em paralelo, mantendo a conversa principal como superfície de coordenação.",
      "Plugins podem contribuir painéis, visualizações, ferramentas, servidores MCP, temas e serviços em segundo plano para expandir o espaço gradualmente.",
      "Disponível para macOS, Windows e Linux com o mesmo fluxo local-first de agentes nas três plataformas de desktop.",
    ],
  },
];

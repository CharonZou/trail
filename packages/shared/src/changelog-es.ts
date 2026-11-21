import type { ChangelogEntry } from "./changelog.js";

export const esEntries: ChangelogEntry[] = [
  {
    version: "1.0.4",
    date: "2026-11-20",
    highlights: [
      "El Centro de activos llega a la barra lateral como destino principal y reúne Resumen, Memoria, Skills y Subagentes en un solo espacio, sin rutas de ajustes separadas para cada gestión.",
      "El Resumen muestra activos integrados y del usuario, distingue el ámbito global del de proyecto y presenta los totales actuales de memoria y capacidades antes de entrar en cada pestaña.",
      "Memoria permite elegir proyecto o grupo, buscar, crear entradas rápidamente, editarlas y guardarlas usando la misma memoria administrada por el host que el diálogo de memoria del proyecto.",
      "El editor compartido migra texto antiguo a entradas estructuradas, normaliza ID y elementos vacíos y bloquea el cambio de proyecto con cambios sin guardar para no perder borradores.",
      "Skills reutiliza el gestor completo de capacidades para skills globales y de proyecto: crear, editar, activar, importar, mover y administrar directorios, no solo consultar una lista.",
      "Subagentes incluye el catálogo completo de agentes integrados y del usuario con sus flujos de creación, edición y activación, evitando dividir la gestión entre varias páginas.",
      "Las pestañas visitadas permanecen montadas y la ruta del Centro de activos se carga bajo demanda; cambiar entre resumen y editores no borra borradores ni recarga todo el espacio.",
      "La copia JSON versionada obtiene una instantánea nueva del host al exportar e incluye la memoria del proyecto o grupo actual y los skills y subagentes del usuario en ámbito global y del proyecto actual.",
      "Las copias contienen el contenido necesario para restaurar skills y subagentes del usuario, pero excluyen documentos integrados y credenciales; el renderizador no crea otro almacén persistente.",
      "Los nuevos textos llegan en los nueve idiomas, con diseño adaptable, estilos de movimiento reducido y pruebas de regresión para navegación, migración, copias y límites del host.",
    ],
  },
  {
    version: "1.0.3",
    date: "2026-11-17",
    highlights: [
      "Ajustes › General › Apariencia añade un selector de diseño: la ventana completa mantiene un banco continuo y la tarjeta flotante eleva el área principal como una tarjeta redondeada sobre el fondo lateral.",
      "El modo de tarjeta flotante integra también el panel de trabajo derecho en la misma superficie redondeada, de modo que forma parte del espacio y no de una columna separada.",
      "La página de Ajustes puede presentarse como página completa o capa flotante desde la misma sección, sin cambiar la preferencia de diseño de las conversaciones.",
      "El deslizador de pensamiento tiene un encabezado más claro con nivel actual y pista Ctrl+T, un raíl degradado de verde a azul con seis marcas y partículas luminosas en el nivel máximo.",
      "Ctrl+T recorre los niveles de pensamiento directamente desde el compositor, permitiendo ajustar el modelo con el teclado sin abrir el menú de modelos.",
      "El chip de modelo del compositor usa la marca de cada proveedor, lo que facilita distinguir modelos con nombres parecidos.",
      "Las carpetas de proyecto pueden abrirse desde la barra lateral en VS Code, Trae o IntelliJ IDEA; los editores se localizan mediante PATH, ubicaciones habituales o Windows App Paths.",
      "Si el editor elegido no está disponible, se muestra un error claro en lugar de probar otro ejecutable al azar o fallar sin una explicación útil.",
    ],
  },
  {
    version: "1.0.2",
    date: "2026-11-06",
    highlights: [
      "Cada proyecto puede tener su propio icono y color de espacio de trabajo, visibles en su fila de la barra lateral para distinguirlo mejor que con el mismo icono de carpeta repetido.",
      "Los diálogos de creación y edición incluyen un interruptor independiente para el índice del espacio, de modo que solo se desactive en los proyectos que no lo necesitan.",
      "Con el índice desactivado, las sugerencias @ dejan de listar archivos, pero las rutas ya citadas en las conversaciones siguen resolviéndose con normalidad.",
      "La tarjeta de uso de tokens sobre el compositor de inicio muestra el total de los últimos doce meses y una franja diaria de intensidad para reconocer patrones de actividad.",
      "La misma tarjeta desglosa el total por modelo y ayuda a entender cuáles concentran el consumo reciente.",
      "La nueva tarjeta Ventana en Ajustes ofrece acciones directas para minimizar y usar pantalla completa sin depender de la barra de menús del sistema.",
      "Más proveedores muestran sus marcas oficiales en las listas, incluidos Mistral, Kimi y Moonshot, facilitando el reconocimiento al configurar modelos.",
      "El icono de la aplicación se unifica como una marca limpia en todas las ventanas, incluida la barra de tareas de Windows y el selector Alt+Tab.",
    ],
  },
  {
    version: "1.0.1",
    date: "2026-11-04",
    highlights: [
      "Versión inicial de Trail: un espacio de escritorio local primero para agentes de IA donde proyectos, sesiones, revisiones, vistas previas y agentes comparten un entorno persistente.",
      "Funciona como aplicación independiente, no como extensión de IDE ni interfaz de terminal, y los datos del espacio permanecen en el equipo del usuario.",
      "Modelos en la nube, locales, endpoints propios y API compatibles comparten un flujo de trabajo, así que cambiar de proveedor no exige reconstruir el espacio.",
      "Las conversaciones se guardan con el uso de tokens y la duración de cada turno, conservando tanto la transcripción como el contexto de ejecución al volver.",
      "Las conversaciones paralelas de un proyecto se aíslan cada una en su propio Git worktree para reducir conflictos entre tareas concurrentes.",
      "Permite delegar trabajo en subagentes y coordinar varias sesiones en paralelo, manteniendo la conversación principal como superficie de coordinación.",
      "Los plugins pueden aportar paneles, vistas, herramientas, servidores MCP, temas y servicios en segundo plano para ampliar el espacio progresivamente.",
      "Disponible en macOS, Windows y Linux con el mismo flujo de agentes local primero en las tres plataformas de escritorio.",
    ],
  },
];

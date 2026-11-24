# 1.0.5 changelog (shipped 2026-11-24)

Status: **applied.** Every catalog in `packages/shared/src/changelog-<locale>.ts`
now carries this entry first (13 highlights, all nine locales, `date`
`2026-11-24`), `changelog.test.ts` pins `1.0.5` newest-first, and
`node scripts/release.mjs 1.0.5` bumped the version surfaces. The blocks below
are kept as the source record of what shipped; do not paste them again.

Scope of this entry: the three user-visible additions on
`feat/knowledge-and-agent-apps` — knowledge base, Agent applications, and the
titlebar back/forward pair — plus the two correctness fixes that changed what a
user sees, plus the five merged-but-unreleased items previously listed in
`docs/project/unreleased.md` (Fast mode, runtime-rebuild prompt cache, Chinese
IME slash alias, regenerated-prompt ordering, visualization preload). All of
them share one entry: **13 highlights**.

## How it was applied

1. For each catalog in `packages/shared/src/changelog-<locale>.ts`, the block
   below was inserted as the **first** element of its array (newest-first), with
   `date` set to the release day, `2026-11-24`.
2. English is the source of truth (ADR 0009); every shipped locale keeps the
   same version list and the same highlight count (13 here).
3. `packages/shared/src/changelog.test.ts` asserts `versions[0] === "1.0.5"` and
   `["1.0.5", "1.0.4", "1.0.3", "1.0.2", "1.0.1"]`.
4. `node scripts/release.mjs 1.0.5` then bumped the version surfaces (root +
   `apps/*` + `packages/*` + `docs/package.json`, `Cargo.toml` / `Cargo.lock`,
   `APP_VERSION`), and `node scripts/check-release-docs.mjs 1.0.5` passed on the
   result.

## Provenance of highlights 9–13

These five were carried by `docs/project/unreleased.md` from merges after
`1.0.4`; they are folded in here so the tagged tree never ships them silently.
They now count as shipped, so `unreleased.md` no longer lists them. Fast mode
reaches every edit here (`/fast`, priority tier, composer chip); the
visualization preload lives in `resources/gen-ui/visualize-helpers.js` and the
visualize skill; the IME, cache and ordering fixes are in the renderer and
runtime.

## English (`packages/shared/src/changelog-en.ts`)

```ts
  {
    version: "1.0.5",
    date: "YYYY-MM-DD",
    highlights: [
      "Knowledge base joins the sidebar as a first-class destination: its hub reports library, document and chunk totals with an availability read-out, beside health, access trend and recent activity, so the state of the index is visible before opening a library.",
      "Each library opens into a document list you can search, import into and index, and clicking a document reads its indexed text as Markdown in the same window instead of leaving the app.",
      "Import accepts text, PDF and DOCX files a batch at a time, reports duplicates instead of storing them twice, and keeps a per-library activity log; a legacy `.doc` file is refused with an actionable message while the rest of the batch still imports.",
      "Search answers offline from a local full-text index, including two-character Chinese queries; semantic search stays optional and falls back to keyword hits with a stated reason when no embedding provider is configured.",
      "Agents can query the library through a built-in tool and receive ranked passages with their document titles, so a conversation can quote what you imported without pasting it first.",
      "Agent applications register either a web URL or a local folder and open in the work-panel browser, remembering when each was last opened; a folder that loses its `index.html` stays listed as unavailable with Open disabled.",
      "The content titlebar now carries a back/forward pair on every destination, including the conversation row, matching `Cmd/Ctrl+[` and `Cmd/Ctrl+]`: both buttons read the same history stack, so pointer and keyboard always agree on what is reachable.",
      "A keyword-only library no longer claims pending vectorization, and the knowledge page keeps a readable layout when the side panel is docked.",
      "Fast mode can be turned on per model for a ChatGPT subscription or an OpenAI Responses connection and toggled in a conversation with `/fast`; requests use the provider's priority service tier and the composer's model chip marks it while it is on.",
      "Rebuilding a conversation's runtime no longer rewrites its history: thinking, reasoning and Gemini function-call signatures survive the rebuild, so prompt caches keep hitting after a restart or a settings change.",
      "Opening slash commands with a Chinese input method no longer inserts a duplicate `/、`; the alias applies only after the composition commits.",
      "A regenerated prompt from an older turn can no longer appear above the latest reply when its branch archive finishes outside the loaded history window.",
      "Inline visualizations render sooner: the visualization shell preloads the bundled D3 and a `viz` chart helper layer, a failing fragment shows its error instead of an empty card, and the visualize skill asks for one write plus a reply.",
    ],
  },
```

## 简体中文 (`packages/shared/src/changelog-zh-CN.ts`)

```ts
  {
    version: "1.0.5",
    date: "YYYY-MM-DD",
    highlights: [
      "「知识库」成为侧栏一级入口：总览页直接给出知识库、文档与片段数量及可用度，并在旁边汇总健康度、访问趋势与最近活动，打开某个库之前就能看清索引状态。",
      "每个库都能打开为可搜索的文档列表，支持导入与建立索引；点开任意文档即可在同一窗口内以 Markdown 阅读其已入库内容，不再跳到应用外。",
      "导入支持文本、PDF 与 DOCX，单次可提交 1 到 100 个文件；重复内容会明确标记而不重复占用空间，并为每个库保留活动记录；旧版 `.doc` 会被拒绝并给出可操作提示，同批其他文件照常导入。",
      "搜索基于本地全文索引、离线可用，两个汉字的关键词也能命中；语义检索为可选项，未配置向量服务时按关键词返回并说明降级原因，而不是直接报错。",
      "智能体可以调用内置工具检索知识库，拿到带文档标题的排序片段，对话里可以直接引用你导入的内容，不需要先粘贴一遍。",
      "Agent 应用既可以登记网址，也可以登记本地文件夹，并在工作面板浏览器中打开、记录最近打开时间；文件夹一旦缺少 `index.html` 会保持列出但标记不可用，「打开」按钮被禁用。",
      "内容区标题栏的每个页面都带上一对「后退 / 前进」，会话页也一样，与 `Cmd/Ctrl+[`、`Cmd/Ctrl+]` 完全等价：两者读同一个历史栈，指针和键盘不会给出不同答案。",
      "纯关键词知识库不再被误报为「待向量化」；侧边工作面板展开时，知识库页仍保持可读的窄容器布局。",
      "对 ChatGPT 订阅或 OpenAI Responses 连接，可按模型开启 Fast 模式，并在对话中用 `/fast` 切换；请求走服务商的 priority 服务层级，开启期间输入框的模型 chip 会显示标记。",
      "重建会话运行时不再改写历史：思考内容、推理内容和 Gemini 函数调用签名都会保留，重启或改设置之后的提示词缓存仍能命中。",
      "用中文输入法打开斜杠命令时不再多插入一个 `/、`；别名只在输入法上屏后才生效。",
      "旧轮次重新生成的消息，即使其分支归档在已加载的历史窗口之外完成，也不会再出现在最新回复上方。",
      "内联可视化生成更快：可视化外壳预加载内置 D3 与 `viz` 图表助手层；脚本出错的片段会显示错误而不是空白卡片；visualize 技能改为「一次写入加一条回复」。",
    ],
  },
```

## 繁體中文 (`packages/shared/src/changelog-zh-TW.ts`)

```ts
  {
    version: "1.0.5",
    date: "YYYY-MM-DD",
    highlights: [
      "「知識庫」成為側欄一級入口：總覽頁直接列出知識庫、文件與片段數量及可用度，並在旁邊彙總健康度、存取趨勢與最近活動，開啟某個庫之前就能看清索引狀態。",
      "每個庫都能開啟為可搜尋的檔案清單，支援匯入與建立索引；點開任一文件即可在同一視窗內以 Markdown 閱讀已入庫內容，不必離開應用程式。",
      "匯入支援文字、PDF 與 DOCX，單次可送出 1 到 100 個檔案；重複內容會被明確標示而不重複佔用空間，並為每個庫保留活動紀錄；舊版 `.doc` 會被拒絕並顯示可行動提示，同批其他檔案照常匯入。",
      "搜尋採用本機全文索引、離線可用，兩個中文字也能命中；語意檢索為選項，未設定向量服務時改以關鍵字回傳並說明降級原因，而非直接報錯。",
      "智慧代理可呼叫內建工具檢索知識庫，取得附文件標題的排序片段，對話中可直接引用你匯入的內容，無須先貼上一遍。",
      "Agent 應用可登記網址或本機資料夾，並在工作面板瀏覽器中開啟、記錄最近開啟時間；資料夾一旦缺少 `index.html` 仍會列出但標為不可用，「開啟」按鈕停用。",
      "內容區標題列在每個頁面都提供「上一頁 / 下一頁」，會話頁亦同，與 `Cmd/Ctrl+[`、`Cmd/Ctrl+]` 完全等效：兩者讀取同一個歷史堆疊，滑鼠與鍵盤不會出現不同結果。",
      "純關鍵字知識庫不再被誤判為「待向量化」；側邊工作面板展開時，知識庫頁仍維持可讀的窄容器版面。",
      "對 ChatGPT 訂閱或 OpenAI Responses 連線，可依模型開啟 Fast 模式，並在對話中以 `/fast` 切換；請求走服務商的 priority 服務層級，開啟期間輸入框的模型 chip 會顯示標記。",
      "重建會話執行環境不再改寫歷史：思考內容、推理內容與 Gemini 函式呼叫簽章都會保留，重新啟動或變更設定後的提示詞快取仍能命中。",
      "使用中文輸入法開啟斜線指令時不再多插入一個 `/、`；別名只在輸入法完成組字後才生效。",
      "舊輪次重新產生的訊息，即使其分支封存在已載入的歷史視窗之外完成，也不會再出現在最新回覆上方。",
      "內嵌視覺化產生更快：視覺化外殼預先載入內建 D3 與 `viz` 圖表輔助層；腳本出錯的片段會顯示錯誤而不是空白卡片；visualize 技能改為「一次寫入加一則回覆」。",
    ],
  },
```

## Deutsch (`packages/shared/src/changelog-de.ts`)

```ts
  {
    version: "1.0.5",
    date: "YYYY-MM-DD",
    highlights: [
      "Die Wissensdatenbank wird ein eigener Haupteintrag der Seitenleiste: Die Übersicht nennt Bibliotheks-, Dokument- und Chunk-Zahlen samt Verfügbarkeit und stellt Gesundheit, Zugriffsverlauf und letzte Aktivität daneben, sodass der Indexzustand schon vor dem Öffnen einer Bibliothek sichtbar ist.",
      "Jede Bibliothek öffnet sich als durchsuchbare Dokumentliste mit Import und Indexierung; ein Klick auf ein Dokument liest den indexierten Text als Markdown im selben Fenster, statt die App zu verlassen.",
      "Der Import nimmt Text-, PDF- und DOCX-Dateien stapelweise an, meldet Duplikate statt sie doppelt zu speichern und führt ein Aktivitätsprotokoll je Bibliothek; eine alte `.doc`-Datei wird mit einer umsetzbaren Meldung abgelehnt, während der übrige Stapel weiterläuft.",
      "Die Suche antwortet offline aus einem lokalen Volltextindex, auch bei zweistelligen chinesischen Suchbegriffen; die semantische Suche bleibt optional und fällt ohne Embedding-Anbieter mit genanntem Grund auf Stichwort-Treffer zurück.",
      "Agenten können die Bibliothek über ein eingebautes Werkzeug abfragen und erhalten sortierte Textstellen mit Dokumenttiteln, sodass ein Gespräch importierte Inhalte zitieren kann, ohne dass sie vorher eingefügt werden.",
      "Agent-Anwendungen registrieren entweder eine Web-Adresse oder einen lokalen Ordner und öffnen im Browser des Arbeitsbereichs, wobei der letzte Öffnungszeitpunkt erhalten bleibt; einem Ordner ohne `index.html` bleibt gelistet, aber als nicht verfügbar mit deaktiviertem Öffnen.",
      "Die Titelleiste des Inhaltsbereichs trägt nun auf jedem Ziel, auch in der Konversationszeile, ein Paar Zurück/Vorwärts, das `Cmd/Ctrl+[` und `Cmd/Ctrl+]` entspricht: Beide Schaltflächen lesen denselben Verlaufsstapel, daher stimmen Zeiger und Tastatur immer überein.",
      "Eine reine Stichwort-Bibliothek meldet nicht mehr ausstehende Vektorisierung, und bei angedocktem Seitenpanel bleibt die Wissensseite auch in schmaler Breite lesbar.",
      "Fast Mode lässt sich pro Modell für ein ChatGPT-Abo oder eine OpenAI-Responses-Verbindung aktivieren und im Gespräch mit `/fast` umschalten; Anfragen nutzen die Priority-Service-Stufe, und der Modell-Chip im Composer markiert den Zustand.",
      "Der Neuaufbau der Laufzeit eines Gesprächs schreibt den Verlauf nicht mehr um: Denken, Reasoning und Gemini-Funktionsaufruf-Signaturen bleiben erhalten, sodass Prompt-Caches nach Neustart oder Einstellungsänderung weiter treffen.",
      "Slash-Befehle mit chinesischer Eingabemethode fügen kein doppeltes `/、` mehr ein; der Alias greift erst, nachdem die Komposition übernommen wurde.",
      "Eine neu erzeugte Antwort aus einem älteren Turn erscheint nicht mehr über der letzten Antwort, wenn ihr Branch-Archiv außerhalb des geladenen Verlaufsfensters fertig wird.",
      "Inline-Visualisierungen erscheinen schneller: Die Visualisierungsschale lädt das gebündelte D3 und eine `viz`-Hilfsschicht vor, ein fehlerhaftes Fragment zeigt seinen Fehler statt einer leeren Karte, und der visualize-Skill verlangt ein Schreiben plus eine Antwort.",
    ],
  },
```

## Español (`packages/shared/src/changelog-es.ts`)

```ts
  {
    version: "1.0.5",
    date: "YYYY-MM-DD",
    highlights: [
      "La base de conocimiento pasa a ser un destino principal de la barra lateral: su panel muestra totales de bibliotecas, documentos y fragmentos con la disponibilidad, junto a salud, tendencia de accesos y actividad reciente, para conocer el estado del índice antes de abrir una biblioteca.",
      "Cada biblioteca se abre como una lista de documentos con búsqueda, importación e indexación, y al hacer clic en un documento se lee su texto indexado como Markdown en la misma ventana en lugar de salir de la aplicación.",
      "La importación acepta texto, PDF y DOCX por lotes, informa duplicados en lugar de guardarlos dos veces y mantiene un registro de actividad por biblioteca; un `.doc` antiguo se rechaza con un mensaje accionable mientras el resto del lote sigue importándose.",
      "La búsqueda responde sin conexión desde un índice de texto completo local, incluso con consultas chinas de dos caracteres; la búsqueda semántica sigue siendo opcional y, sin proveedor de embeddings, vuelve a resultados por palabra clave indicando el motivo en lugar de fallar.",
      "Los agentes pueden consultar la biblioteca con una herramienta integrada y reciben pasajes ordenados con el título de su documento, de modo que una conversación cite lo importado sin pegarlo antes.",
      "Las aplicaciones de agente registran una URL web o una carpeta local y se abren en el navegador del panel de trabajo, recordando cuándo se abrieron por última vez; una carpeta que pierde su `index.html` sigue listada como no disponible con Abrir desactivado.",
      "La barra de título del contenido incorpora ahora un par atrás/adelante en todos los destinos, incluida la fila de conversación, equivalente a `Cmd/Ctrl+[` y `Cmd/Ctrl+]`: ambos botones leen la misma pila de historial, así que ratón y teclado nunca discrepan.",
      "Una biblioteca solo de palabras clave deja de anunciar vectorización pendiente, y la página de conocimiento mantiene un diseño legible cuando el panel lateral está acoplado.",
      "Fast mode se activa por modelo para una suscripción de ChatGPT o una conexión de OpenAI Responses y se alterna con `/fast`; las solicitudes usan el nivel de servicio priority y el chip del modelo en el compositor lo marca mientras está activo.",
      "Reconstruir el runtime de una conversación ya no reescribe su historial: el pensamiento, el razonamiento y las firmas de llamadas a funciones de Gemini sobreviven, así que las cachés de prompt siguen acertando tras un reinicio o un cambio de ajustes.",
      "Abrir comandos de barra con un método de entrada chino ya no inserta un `/、` duplicado; el alias se aplica solo cuando la composición se confirma.",
      "Un prompt regenerado de un turno anterior ya no puede aparecer por encima de la última respuesta cuando su archivo de rama termina fuera de la ventana de historial cargada.",
      "Las visualizaciones en línea aparecen antes: el armazón de visualización precarga el D3 incluido y una capa de ayuda `viz`, un fragmento con error muestra el error en lugar de una tarjeta vacía, y la skill visualize pide una escritura más una respuesta.",
    ],
  },
```

## Français (`packages/shared/src/changelog-fr.ts`)

```ts
  {
    version: "1.0.5",
    date: "YYYY-MM-DD",
    highlights: [
      "La base de connaissances devient une destination de premier niveau de la barre latérale : son accueil affiche les totaux de bibliothèques, documents et fragments avec la disponibilité, à côté de la santé, de la tendance des accès et de l'activité récente, pour connaître l'état de l'index avant d'ouvrir une bibliothèque.",
      "Chaque bibliothèque s'ouvre en une liste de documents interrogeable, importable et indexable ; un clic sur un document lit son texte indexé en Markdown dans la même fenêtre au lieu de quitter l'application.",
      "L'import accepte texte, PDF et DOCX par lots, signale les doublons au lieu de les stocker deux fois et tient un journal d'activité par bibliothèque ; un ancien `.doc` est refusé avec un message actionnable tandis que le reste du lot continue.",
      "La recherche répond hors ligne depuis un index plein texte local, y compris pour des requêtes chinoises de deux caractères ; la recherche sémantique reste facultative et, sans fournisseur d'embeddings, retombe sur les résultats par mot-clé en indiquant la raison au lieu d'échouer.",
      "Les agents peuvent interroger la bibliothèque via un outil intégré et reçoivent des passages classés avec le titre de leur document, si bien qu'une conversation cite ce que vous avez importé sans le coller au préalable.",
      "Les applications d'agent enregistrent une URL web ou un dossier local et s'ouvrent dans le navigateur du panneau de travail, en retenant la dernière ouverture ; un dossier qui perd son `index.html` reste listé comme indisponible, avec Ouvrir désactivé.",
      "La barre de titre du contenu porte désormais une paire précédent/suivant sur chaque destination, y compris la ligne de conversation, équivalente à `Cmd/Ctrl+[` et `Cmd/Ctrl+]` : les deux boutons lisent la même pile d'historique, donc souris et clavier ne divergent jamais.",
      "Une bibliothèque en mots-clés seuls n'annonce plus une vectorisation en attente, et la page de connaissances reste lisible lorsque le panneau latéral est ancré.",
      "Le mode Fast s'active par modèle pour un abonnement ChatGPT ou une connexion OpenAI Responses et se bascule avec `/fast` ; les requêtes passent par le palier de service priority et la puce du modèle dans le composeur l'indique tant qu'il est actif.",
      "Reconstruire le runtime d'une conversation ne réécrit plus son historique : la réflexion, le raisonnement et les signatures d'appel de fonction Gemini survivent, donc les caches de prompt continuent de toucher après un redémarrage ou un changement de réglages.",
      "Ouvrir les commandes slash avec une méthode de saisie chinoise n'insère plus un `/、` en double ; l'alias ne s'applique qu'une fois la composition validée.",
      "Un prompt régénéré d'un tour ancien ne peut plus apparaître au-dessus de la dernière réponse lorsque son archive de branche se termine hors de la fenêtre d'historique chargée.",
      "Les visualisations intégrées s'affichent plus tôt : l'enveloppe de visualisation précharge le D3 embarqué et une couche d'aide `viz`, un fragment en erreur montre son erreur au lieu d'une carte vide, et la skill visualize demande une écriture puis une réponse.",
    ],
  },
```

## 한국어 (`packages/shared/src/changelog-ko.ts`)

```ts
  {
    version: "1.0.5",
    date: "YYYY-MM-DD",
    highlights: [
      "지식 베이스가 사이드바의 주요 목적지가 되었습니다. 허브에서 라이브러리·문서·청크 수와 사용 가능 비율을 보여 주고, 옆에 상태 점검, 접근 추세, 최근 활동을 함께 정리해 라이브러리를 열기 전에 색인 상태를 알 수 있습니다.",
      "각 라이브러리는 검색·가져오기·색인을 지원하는 문서 목록으로 열리고, 문서를 클릭하면 색인된 내용을 같은 창에서 Markdown으로 읽을 수 있습니다.",
      "가져오기는 텍스트, PDF, DOCX를 한 번에 최대 100개까지 받고, 중복 내용은 다시 저장하지 않고 알려 주며 라이브러리별 활동 기록을 남깁니다. 구형 `.doc` 파일은 안내 메시지와 함께 거부되지만 같은 배치의 나머지 파일은 계속 처리됩니다.",
      "검색은 로컬 전체 텍스트 색인으로 오프라인에서도 동작하며 두 글자 중국어 질의도 찾아냅니다. 의미 검색은 선택 사항이고, 임베딩 제공자가 없으면 오류 대신 이유와 함께 키워드 결과로 대체됩니다.",
      "에이전트는 내장 도구로 지식 베이스를 조회해 문서 제목이 붙은 순위 결과를 받을 수 있어, 가져온 내용을 붙여 넣지 않고도 대화에서 인용할 수 있습니다.",
      "에이전트 앱은 웹 주소나 로컬 폴더를 등록해 작업 패널 브라우저에서 열고 마지막으로 연 시각을 기억합니다. `index.html`이 사라진 폴더는 목록에 남되 사용할 수 없음으로 표시되고 열기 버튼이 비활성화됩니다.",
      "콘텐츠 제목 표시줄의 모든 목적지, 대화 행에도 뒤로/앞으로 한 쌍이 추가되어 `Cmd/Ctrl+[`, `Cmd/Ctrl+]`와 동일하게 동작합니다. 두 버튼은 같은 기록 스택을 읽으므로 마우스와 키보드가 서로 다른 결과를 주지 않습니다.",
      "키워드 전용 라이브러리는 더 이상 \"벡터화 대기\"로 잘못 표시되지 않으며, 사이드 패널이 도킹된 좁은 폭에서도 지식 베이스 화면이 읽기 좋게 유지됩니다.",
      "ChatGPT 구독 또는 OpenAI Responses 연결에서 모델별로 Fast 모드를 켜고 대화에서 `/fast`로 전환할 수 있습니다. 요청은 제공자의 priority 서비스 등급을 쓰고, 켜져 있는 동안 입력창의 모델 칩에 표시됩니다.",
      "대화 런타임을 다시 만들 때 기록이 더 이상 다시 쓰이지 않습니다. 사고, 추론, Gemini 함수 호출 서명이 유지되어 재시작이나 설정 변경 뒤에도 프롬프트 캐시가 계속 적중합니다.",
      "중국어 입력기로 슬래시 명령을 열 때 `/、`가 중복 입력되지 않습니다. 별칭은 조합이 확정된 뒤에만 적용됩니다.",
      "이전 턴의 재생성 프롬프트는 분기 아카이브가 불러온 기록 창 밖에서 끝나더라도 최신 답변 위에 나타나지 않습니다.",
      "인라인 시각화가 더 빨리 나타납니다. 시각화 셸이 내장 D3와 `viz` 차트 도우미 계층을 미리 불러오고, 스크립트가 실패한 조각은 빈 카드 대신 오류를 보여 주며, visualize 스킬은 한 번 쓰고 한 번 답하도록 요청합니다.",
    ],
  },
```

## Português (BR) (`packages/shared/src/changelog-pt-BR.ts`)

```ts
  {
    version: "1.0.5",
    date: "YYYY-MM-DD",
    highlights: [
      "A base de conhecimento passa a ser um destino principal da barra lateral: a visão geral informa totais de bibliotecas, documentos e trechos com a disponibilidade, ao lado de saúde, tendência de acessos e atividade recente, para mostrar o estado do índice antes de abrir uma biblioteca.",
      "Cada biblioteca abre como uma lista de documentos pesquisável, com importação e indexação, e clicar em um documento lê o texto indexado como Markdown na mesma janela em vez de sair do aplicativo.",
      "A importação aceita texto, PDF e DOCX em lotes, informa duplicatas em vez de armazená-las duas vezes e mantém um registro de atividade por biblioteca; um `.doc` antigo é recusado com uma mensagem acionável enquanto o restante do lote continua.",
      "A busca responde offline a partir de um índice de texto completo local, inclusive para consultas em chinês de dois caracteres; a busca semântica segue opcional e, sem provedor de embeddings, retorna resultados por palavra-chave com o motivo em vez de falhar.",
      "Os agentes podem consultar a biblioteca por uma ferramenta integrada e recebem trechos ordenados com o título do documento, para que uma conversa cite o que você importou sem colar antes.",
      "Os aplicativos de agente registram uma URL web ou uma pasta local e abrem no navegador do painel de trabalho, lembrando quando foram abertos pela última vez; uma pasta sem `index.html` continua listada como indisponível, com Abrir desativado.",
      "A barra de título do conteúdo agora traz um par voltar/avançar em todos os destinos, inclusive na linha da conversa, equivalente a `Cmd/Ctrl+[` e `Cmd/Ctrl+]`: os dois botões leem a mesma pilha de histórico, então mouse e teclado nunca divergem.",
      "Uma biblioteca somente por palavras-chave deixa de anunciar vetorização pendente, e a página de conhecimento continua legível em larguras estreitas com o painel lateral encaixado.",
      "O Fast mode é ativado por modelo para uma assinatura do ChatGPT ou uma conexão OpenAI Responses e alternado com `/fast`; as requisições usam o nível de serviço priority e o chip do modelo no compositor o marca enquanto está ligado.",
      "Reconstruir o runtime de uma conversa não reescreve mais o histórico: pensamento, raciocínio e assinaturas de chamada de função do Gemini sobrevivem, então os caches de prompt continuam acertando após reinício ou mudança de ajustes.",
      "Abrir comandos de barra com um método de entrada chinês não insere mais um `/、` duplicado; o alias só se aplica depois que a composição é confirmada.",
      "Um prompt regenerado de um turno antigo não pode mais aparecer acima da última resposta quando o arquivo do seu branch termina fora da janela de histórico carregada.",
      "Visualizações em linha aparecem mais cedo: a estrutura de visualização pré-carrega o D3 incluído e uma camada de ajuda `viz`, um fragmento com erro mostra o erro em vez de um cartão vazio, e a skill visualize pede uma escrita mais uma resposta.",
    ],
  },
```

## Türkçe (`packages/shared/src/changelog-tr.ts`)

```ts
  {
    version: "1.0.5",
    date: "YYYY-MM-DD",
    highlights: [
      "Bilgi tabanı kenar çubuğunda ana hedef oldu: merkez, kitaplık, belge ve parça sayılarını kullanılabilirlik oranıyla gösteriyor; sağlık, erişim eğilimi ve son etkinlik yanında durduğu için bir kitaplığı açmadan dizin durumu görülebiliyor.",
      "Her kitaplık; aranabilir, içe aktarılabilir ve dizinlenebilir bir belge listesi olarak açılıyor; bir belgeye tıklamak, dizinlenmiş metnini aynı pencerede Markdown olarak okutuyor.",
      "İçe aktarma metin, PDF ve DOCX dosyalarını tek seferde en fazla 100 adet kabul ediyor, yinelenenleri ikinci kez saklamak yerine bildiriyor ve kitaplık başına etkinlik kaydı tutuyor; eski bir `.doc` dosyası eyleme dönük bir mesajla reddedilirken partinin kalanı aktarılmaya devam ediyor.",
      "Arama, yerel tam metin dizininden çevrimdışı yanıt veriyor ve iki karakterli Çince sorguları da buluyor; anlamsal arama isteğe bağlı kalıyor ve gömme sağlayıcısı yoksa hata vermek yerine nedeniyle birlikte anahtar sözcük sonuçlarına düşüyor.",
      "Ajanlar, yerleşik bir araçla bilgi tabanını sorgulayıp belge başlıklarıyla sıralanmış pasajlar alabiliyor; böylece bir konuşma, önce yapıştırmadan aktardığınız içeriği alıntılayabiliyor.",
      "Ajan uygulamaları bir web adresi ya da yerel klasör kaydedip çalışma paneli tarayıcısında açılıyor ve son açılma zamanını hatırlıyor; `index.html` dosyasını kaybeden klasör listede kalıyor, kullanılamaz olarak işaretleniyor ve Aç devre dışı bırakılıyor.",
      "İçerik başlık çubuğu artık her hedefte, konuşma satırı dahil, `Cmd/Ctrl+[` ve `Cmd/Ctrl+]` ile eşdeğer bir geri/ileri çifti taşıyor: iki düğme de aynı geçmiş yığınını okuduğu için fare ve klavye hiçbir zaman farklı sonuç vermiyor.",
      "Yalnızca anahtar sözcükle çalışan bir kitaplık artık beklemede vektörleştirme bildirmiyor; yan panel yerleşikken bilgi tabanı sayfası dar genişlikte de okunabilir kalıyor.",
      "Fast modu, bir ChatGPT aboneliği veya OpenAI Responses bağlantısı için model bazında açılabiliyor ve konuşmada `/fast` ile değiştirilebiliyor; istekler sağlayıcının priority hizmet katmanını kullanıyor ve açıkken besteci model çipi bunu işaretliyor.",
      "Bir konuşmanın çalışma zamanını yeniden kurmak artık geçmişi yeniden yazmıyor: düşünme, akıl yürütme ve Gemini işlev çağrısı imzaları korunuyor, böylece yeniden başlatma veya ayar değişikliğinden sonra istem önbellekleri isabet etmeye devam ediyor.",
      "Çince bir giriş yöntemiyle eğik çizgi komutlarını açmak artık yinelenen bir `/、` eklemiyor; takma ad yalnızca kompozisyon tamamlandıktan sonra uygulanıyor.",
      "Eski bir turdan yeniden oluşturulan istem, dal arşivi yüklenen geçmiş penceresinin dışında tamamlansa bile en son yanıtın üzerinde görünemiyor.",
      "Satır içi görselleştirmeler daha erken görünüyor: görselleştirme kabuğu paketlenmiş D3 ve bir `viz` grafik yardımcı katmanını önceden yüklüyor, betiği hata veren parça boş kart yerine hatayı gösteriyor ve visualize becerisi tek yazma artı tek yanıt istiyor.",
    ],
  },
```

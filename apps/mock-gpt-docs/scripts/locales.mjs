// MockGPT 文档站语言配置：各语言位于同级目录（/en/ 与 /zh/）；根路径直接渲染英文首页，不放跳转页。

export const locales = [
  {
    id: 'zh',
    dir: 'zh',
    prefix: '/zh',
    viteKey: 'zh',
    label: '简体中文',
    switchLabel: 'English',
    lang: 'zh-CN',
    title: 'MockGPT',
    description: '可配置的模拟应答 SDK：规则、生成器、响应描述与可选 Node 服务。',
    nav: {
      guide: '指南',
      api: 'API 参考',
      playground: 'Playground',
    },
    theme: {
      outlineLabel: '本页目录',
      returnToTopLabel: '返回顶部',
      sidebarMenuLabel: '目录',
      darkModeSwitchLabel: '外观',
      lightModeSwitchTitle: '切换浅色',
      darkModeSwitchTitle: '切换深色',
      docFooterPrev: '上一页',
      docFooterNext: '下一页',
      searchButtonText: '搜索接口、类型、示例',
      searchButtonAriaLabel: '搜索文档',
      searchNoResultsText: '未找到结果',
      searchResetButtonTitle: '清空搜索',
      searchDisplayDetails: '显示上下文',
      searchSelectText: '选择',
      searchNavigateText: '切换',
      searchCloseText: '关闭',
      footerMessage: '可配置的模拟应答 SDK。',
      footerCopyright: 'MockGPT',
    },
    text: {
      guideTitle: 'MockGPT 指南',
      guideIntro:
        '用规则、生成器与响应描述，在本地构造可复现的模型应答。本课程以小可乐咖啡的智能客服为例，从固定应答逐步走到流式接线。',
      apiTitle: 'API 参考',
      apiIndexLink: '/api/',
      home: {
        heroText: '可配置的模拟应答 SDK',
        tagline: '无需真实 LLM、API key 或 fixture，用规则与生成器组织回复。',
        actions: [
          { theme: 'brand', text: '从零开始', path: '/guide/' },
          { theme: 'alt', text: '查阅 API 参考', path: '/api/' },
        ],
        features: [
          {
            title: '声明式规则',
            details: '按声明顺序匹配，首个满足条件的规则执行；字符串、正则与请求谓词即可组织业务应答。',
            path: '/guide/step-2',
          },
          {
            title: '结构化回复',
            details: '普通对象产生 JSON 内容，显式 helper 区分工具提议与故障，不猜测字段含义。',
            path: '/api/responses',
          },
          {
            title: '生成器',
            details: '固定资料、随机字段、摘要、关键词与字段提取都能随输入变化。',
            path: '/api/generators',
          },
          {
            title: '流式与接线',
            details: '同一份规则产出 JSON 或 SSE；内置 fetch 适配与最小 Node 服务可接入既有模型客户端。',
            path: '/guide/step-6',
          },
        ],
      },
      render: {
        kindLabel: (kind) =>
          ({ class: '类', interface: '接口', type: '类型别名', function: '函数', constant: '常量' })[
            kind
          ] ?? kind,
        tableField: '字段',
        tableType: '类型',
        tableRequired: '必需',
        tableDescription: '说明',
        tableMember: '成员',
        tablePurpose: '用途',
        tableSymbol: '符号',
        tableKind: '类别',
        optional: '可省略',
        required: '必需',
        readonly: '只读。',
        rest: '剩余参数',
        noParameters: '无调用参数。',
        returns: '**返回：**',
        import: '**导入：**',
        definition: '## 定义',
        constructor: '构造函数',
        call: '调用',
        overload: (index) => `重载 ${index + 1}`,
        members: '## 成员目录',
        examples: '## 使用示例',
        repoFile: (path) => `（仓库文件 ${'`' + path + '`'}）`,
      },
    },
  },
  {
    id: 'en',
    dir: 'en',
    prefix: '/en',
    viteKey: 'en',
    label: 'English',
    switchLabel: '中文',
    lang: 'en-US',
    title: 'MockGPT',
    description:
      'Configurable mock-response SDK: rules, generators, response descriptions and an optional Node server.',
    nav: {
      guide: 'Guide',
      api: 'API Reference',
      playground: 'Playground',
    },
    theme: {
      outlineLabel: 'On this page',
      returnToTopLabel: 'Return to top',
      sidebarMenuLabel: 'Menu',
      darkModeSwitchLabel: 'Appearance',
      lightModeSwitchTitle: 'Switch to light theme',
      darkModeSwitchTitle: 'Switch to dark theme',
      docFooterPrev: 'Previous',
      docFooterNext: 'Next',
      searchButtonText: 'Search interfaces, types, examples',
      searchButtonAriaLabel: 'Search documentation',
      searchNoResultsText: 'No results found',
      searchResetButtonTitle: 'Reset search',
      searchDisplayDetails: 'Display details',
      searchSelectText: 'to select',
      searchNavigateText: 'to navigate',
      searchCloseText: 'to close',
      footerMessage: 'Configurable mock-response SDK.',
      footerCopyright: 'MockGPT',
    },
    text: {
      guideTitle: 'MockGPT Guide',
      guideIntro:
        'Build reproducible model responses locally with rules, generators and response descriptions. This tutorial uses a Microcola Coffee smart customer service as an example, starting from a fixed reply and ending with streaming wiring.',
      apiTitle: 'API Reference',
      apiIndexLink: '/api/',
      home: {
        heroText: 'Configurable mock-response SDK',
        tagline:
          'No real LLM, API key or fixture needed. Organize replies with rules and generators.',
        actions: [
          { theme: 'brand', text: 'Start here', path: '/guide/' },
          { theme: 'alt', text: 'Browse API reference', path: '/api/' },
        ],
        features: [
          {
            title: 'Declarative rules',
            details:
              'Rules execute in declared order; the first match wins. Match with strings, RegExp or request predicates.',
            path: '/guide/step-2',
          },
          {
            title: 'Structured replies',
            details:
              'Plain objects become JSON content. Explicit helpers separate tool calls and failures from normal fields.',
            path: '/api/responses',
          },
          {
            title: 'Generators',
            details:
              'Fixed data, random fields, summaries, keywords and field extraction all vary with the input.',
            path: '/api/generators',
          },
          {
            title: 'Streaming & wiring',
            details:
              'The same rules produce JSON or SSE. Built-in fetch adapter and minimal Node server fit existing model clients.',
            path: '/guide/step-6',
          },
        ],
      },
      render: {
        kindLabel: (kind) =>
          ({ class: 'class', interface: 'interface', type: 'type alias', function: 'function', constant: 'constant' })[
            kind
          ] ?? kind,
        tableField: 'Field',
        tableType: 'Type',
        tableRequired: 'Required',
        tableDescription: 'Description',
        tableMember: 'Member',
        tablePurpose: 'Purpose',
        tableSymbol: 'Symbol',
        tableKind: 'Kind',
        optional: 'Optional',
        required: 'Required',
        readonly: 'Read-only. ',
        rest: 'Rest parameter',
        noParameters: 'No call parameters.',
        returns: '**Returns:**',
        import: '**Import:**',
        definition: '## Definition',
        constructor: 'Constructor',
        call: 'Call',
        overload: (index) => `Overload ${index + 1}`,
        members: '## Member index',
        examples: '## Examples',
        repoFile: (path) => ` (repository file ${'`' + path + '`'})`,
      },
    },
  },
];

export const defaultLocale = locales[0];
export const localeById = Object.fromEntries(locales.map((locale) => [locale.id, locale]));
export const localePath = (locale, value) => locale.prefix + value;
export const storageKey = 'mockgpt-doc-lang';
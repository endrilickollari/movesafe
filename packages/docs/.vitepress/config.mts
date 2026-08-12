import { defineConfig } from 'vitepress';

export default defineConfig({
  lang: 'en-US',
  title: 'movesafe',
  titleTemplate: ':title · movesafe',
  description: 'Move TypeScript files without leaving broken imports behind.',
  base: '/movesafe/',
  outDir: './dist',
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/movesafe/mark.svg' }],
    ['meta', { name: 'theme-color', content: '#0A7467' }],
  ],
  themeConfig: {
    logo: { src: '/mark.svg', alt: 'movesafe' },
    siteTitle: 'movesafe',
    nav: [
      { text: 'Quickstart', link: '/' },
      { text: 'mv', link: '/mv' },
      { text: 'check', link: '/check' },
      { text: 'Monorepos', link: '/monorepos' },
      { text: 'MCP', link: '/mcp' },
    ],
    sidebar: [
      {
        text: 'Use movesafe',
        items: [
          { text: 'Quickstart', link: '/' },
          { text: 'Move files', link: '/mv' },
          { text: 'Check imports', link: '/check' },
          { text: 'Monorepos', link: '/monorepos' },
          { text: 'MCP for agents', link: '/mcp' },
        ],
      },
    ],
    outline: { level: [2, 3] },
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: 'https://github.com/endrilickollari/movesafe' }],
    editLink: {
      pattern: 'https://github.com/endrilickollari/movesafe/edit/main/packages/docs/:path',
      text: 'Edit this page on GitHub',
    },
    footer: {
      message: 'Deterministic TypeScript moves for developers and agents.',
      copyright: 'Released under the MIT License.',
    },
  },
});

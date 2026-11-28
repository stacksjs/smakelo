import type { BuddyConfig } from '@buddysh/buddy'

export default {
  repository: {
    owner: 'stacksjs',
    name: 'smakelo',
    baseBranch: 'main',
    provider: 'github',
    // token: process.env.BUDDY_BOT_TOKEN,
  },
  dashboard: {
    enabled: true,
    title: 'Buddy Bot Dependency Dashboard',
    // issueNumber: undefined, // Auto-generated
  },
  workflows: {
    enabled: true,
    outputDir: '.github/workflows',
    templates: {
      daily: true,
      weekly: true,
      monthly: true,
    },
    custom: [],
  },
  packages: {
    strategy: 'all',
    ignore: [
      // Keep these in lockstep with the vendored defaults through buddy upgrade.
      'stacks',
      '@stacksjs/components',
      '@stacksjs/stx',
      'bun-plugin-stx',
    ],
    ignorePaths: [
      'storage/framework/**',
    ],
  },
  verbose: false,
} satisfies BuddyConfig

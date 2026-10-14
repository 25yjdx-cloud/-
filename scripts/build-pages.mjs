import { build } from 'vite';

process.env.GITHUB_PAGES = 'true';
await build();

/** The Paper.js boolean engine for Node tests, via paper-jsdom (headless, per the Paper.js README). */
import { createRequire } from 'node:module';
import { makePaperEngine } from '../src/boolean/paper-adapter';

const require = createRequire(import.meta.url);
export const engine = makePaperEngine(require('paper-jsdom') as typeof import('paper'));

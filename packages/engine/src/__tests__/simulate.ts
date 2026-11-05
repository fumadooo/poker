// Standalone: node dist/__tests__/simulate.js [hands] [seedHex]
import { runSimulation, formatStats } from './sim.js';

const hands = Number(process.argv[2] ?? 10000);
const seed = process.argv[3] ?? '5eed5eed5eed5eed5eed5eed5eed5eed5eed5eed5eed5eed5eed5eed5eed5eed';
const st = runSimulation(hands, seed);
console.log(formatStats(st));

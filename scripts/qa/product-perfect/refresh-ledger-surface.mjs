import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReleaseSurface } from './claims.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ledgerPath = path.join(root, 'qa/product-perfect/claims.json');
const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
if (!ledger.releaseSurface || !/^[0-9a-f]{40}$/i.test(ledger.releaseSurface.sourceCommit || '')) {
  throw new Error('claims ledger must name an exact source snapshot before refreshing');
}
ledger.releaseSurface = buildReleaseSurface(root, { candidateCommit: ledger.releaseSurface.sourceCommit });
fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
console.log(JSON.stringify({ sourceCommit: ledger.releaseSurface.sourceCommit, files: ledger.releaseSurface.files.length, pathSetSha256: ledger.releaseSurface.pathSetSha256 }));

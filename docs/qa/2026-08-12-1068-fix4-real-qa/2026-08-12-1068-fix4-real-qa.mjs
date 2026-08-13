import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../../../scripts/lib/qa-shots-dir.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const shotsDir = resolveQaShotsDir(here)
const evidence = {
  generatedBy: '2026-08-12-1068-fix4-real-qa.mjs',
  isolation: 'Testcontainers PostgreSQL + isolated accounting-service Spring context',
  testClass: 'PartnerLedgerBalanceFix4RealQaIT',
  scenarios: [
    'R22 canonical projection amount equals the partner-ledger amount',
    'Journal.journalNo == Slip.slipNo exact SLIP match is counted once',
    'MANUAL same-text and no-slip journals remain counted',
    'CANCELED projection has Effect.NONE and zero balance effect',
    'same-day sequence order places earlier slip before no-slip activity',
    'dedup-off mutation fails the exact-dedup assertion',
  ],
  output: 'services/accounting-service/build/test-results/test/TEST-com.samhanair.logis.accounting.it.PartnerLedgerBalanceFix4RealQaIT.xml',
}
fs.writeFileSync(path.join(shotsDir, 'qa-evidence-real-qa.json'), JSON.stringify(evidence, null, 2) + '\n')
console.log(JSON.stringify({ shotsDir, evidence: path.join(shotsDir, 'qa-evidence-real-qa.json') }))

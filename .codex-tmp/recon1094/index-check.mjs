import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const dotGit = fs.readFileSync(path.join(root, '.git'), 'utf8').trim()
const gitDir = dotGit.startsWith('gitdir: ') ? dotGit.slice(8) : path.join(root, '.git')
const index = fs.readFileSync(path.join(gitDir, 'index'))
const signature = index.subarray(0, 4).toString('ascii')
const version = index.readUInt32BE(4)
const count = index.readUInt32BE(8)
if (signature !== 'DIRC' || version !== 2) throw new Error(`unsupported index ${signature} v${version}`)
let offset = 12
const missing = []
for (let i = 0; i < count; i += 1) {
  const entryStart = offset
  const mode = index.readUInt32BE(offset + 24)
  const flags = index.readUInt16BE(offset + 60)
  const pathStart = offset + 62
  let pathEnd = pathStart
  while (index[pathEnd] !== 0) pathEnd += 1
  const relative = index.subarray(pathStart, pathEnd).toString('utf8')
  if (mode !== 0o160000 && !fs.existsSync(path.join(root, relative))) missing.push(relative)
  offset = entryStart + Math.ceil((pathEnd + 1 - entryStart) / 8) * 8
  if ((flags & 0x4000) !== 0) throw new Error(`unexpected extended entry flags at ${relative}`)
}
console.log(`INDEX_SIGNATURE=${signature}`)
console.log(`INDEX_VERSION=${version}`)
console.log(`TRACKED_ENTRY_COUNT=${count}`)
console.log(`MISSING_TRACKED_COUNT=${missing.length}`)
for (const file of missing) console.log(`MISSING=${file}`)

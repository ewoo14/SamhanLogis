const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { StringDecoder } = require('node:string_decoder')

/**
 * Capture a child process without Node's finite spawnSync stdout/stderr buffer.
 * The child writes directly to temporary files. Callers consume those files in
 * bounded chunks and must call cleanup() when they are done.
 */
function spawnSyncWithFileOutput(command, args, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'samhan-child-output-'))
  const stdoutPath = path.join(directory, 'stdout')
  const stderrPath = path.join(directory, 'stderr')
  const stdoutFd = fs.openSync(stdoutPath, 'w')
  const stderrFd = fs.openSync(stderrPath, 'w')

  let result
  try {
    result = spawnSync(command, args, {
      ...options,
      encoding: undefined,
      stdio: ['ignore', stdoutFd, stderrFd],
    })
  } finally {
    fs.closeSync(stdoutFd)
    fs.closeSync(stderrFd)
  }

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    fs.rmSync(directory, { recursive: true, force: true })
  }

  const { stdout: _stdout, stderr: _stderr, ...processResult } = result
  return { ...processResult, stdoutPath, stderrPath, cleanup }
}

function summarizeOutputFile(filePath, { delimiter = '\n', limit = 200, chunkSize = 64 * 1024 } = {}) {
  if (delimiter.length !== 1) throw new Error('delimiter must be one character')
  const decoder = new StringDecoder('utf8')
  const fd = fs.openSync(filePath, 'r')
  const buffer = Buffer.allocUnsafe(chunkSize)
  const records = []
  let carry = ''
  let totalCount = 0

  const consume = (text) => {
    carry += text
    let delimiterIndex
    while ((delimiterIndex = carry.indexOf(delimiter)) !== -1) {
      const record = carry.slice(0, delimiterIndex)
      carry = carry.slice(delimiterIndex + 1)
      if (record.length > 0 || delimiter !== '\n') {
        totalCount += 1
        if (records.length < limit) records.push(record)
      }
    }
  }

  try {
    let bytesRead
    do {
      bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)
      if (bytesRead > 0) consume(decoder.write(buffer.subarray(0, bytesRead)))
    } while (bytesRead > 0)
    consume(decoder.end())
    if (carry.length > 0) {
      totalCount += 1
      if (records.length < limit) records.push(carry)
    }
  } finally {
    fs.closeSync(fd)
  }

  return { records, totalCount, truncated: totalCount > records.length }
}

module.exports = { spawnSyncWithFileOutput, summarizeOutputFile }

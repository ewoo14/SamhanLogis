const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

/**
 * Capture a child process without Node's finite spawnSync stdout/stderr buffer.
 * The child writes directly to temporary files; callers still receive strings.
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

  try {
    return {
      ...result,
      stdout: fs.readFileSync(stdoutPath, 'utf8'),
      stderr: fs.readFileSync(stderrPath, 'utf8'),
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

module.exports = { spawnSyncWithFileOutput }

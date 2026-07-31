import { resolve } from 'node:path'
import { loadConfigFromFile } from 'vite'
import { describe, expect, it } from 'vitest'

const qaRendererConfigPath = resolve(__dirname, '../../../vite.renderer.dev.config.ts')

describe('QA renderer version-policy wiring', () => {
  it('검증된 VITE_APP_VERSION을 renderer에 주입하고 5175 strictPort로 고정한다', async () => {
    const previousVersion = process.env.VITE_APP_VERSION
    process.env.VITE_APP_VERSION = '2026/07/30-1'

    try {
      const loaded = await loadConfigFromFile(
        { command: 'serve', mode: 'development' },
        qaRendererConfigPath,
      )

      expect(loaded?.config.define).toEqual(expect.objectContaining({
        'import.meta.env.VITE_APP_VERSION': JSON.stringify('2026/07/30-1'),
      }))
      expect(loaded?.config.server).toMatchObject({
        port: 5175,
        strictPort: true,
      })
    } finally {
      if (previousVersion === undefined) {
        delete process.env.VITE_APP_VERSION
      } else {
        process.env.VITE_APP_VERSION = previousVersion
      }
    }
  })

  it('semver처럼 보이는 malformed 환경값으로 dev server를 시작하지 않는다', async () => {
    const previousVersion = process.env.VITE_APP_VERSION
    process.env.VITE_APP_VERSION = '8.98029556650246'

    try {
      await expect(loadConfigFromFile(
        { command: 'serve', mode: 'development' },
        qaRendererConfigPath,
        undefined,
        'silent',
      )).rejects.toThrow(/YYYY\/MM\/DD/)
    } finally {
      if (previousVersion === undefined) {
        delete process.env.VITE_APP_VERSION
      } else {
        process.env.VITE_APP_VERSION = previousVersion
      }
    }
  })
})

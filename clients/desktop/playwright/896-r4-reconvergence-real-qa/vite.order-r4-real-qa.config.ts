import { defineConfig, mergeConfig } from 'vite'
import baseConfig from '../../../web/order-app/vite.config'

export default mergeConfig(
  baseConfig,
  defineConfig({
    server: {
      host: '127.0.0.1',
      port: 5320,
      strictPort: true,
      proxy: {
        '/api/v1/partner-orders/bootstrap': {
          target: 'http://127.0.0.1:28088',
          changeOrigin: true,
        },
      },
    },
  }),
)

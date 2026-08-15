import axios, { type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMenuCatalog } from './menuCatalog'
import { menuCatalogClient } from './menuCatalog'
import { useAuthStore } from '../stores/authStore'

describe('arologis menu catalog authentication boundary', () => {
  const originalAdapter = menuCatalogClient.defaults.adapter

  beforeEach(() => {
    window.arologisAuth = {
      getToken: vi.fn(),
      setToken: vi.fn(),
      clearToken: vi.fn().mockResolvedValue(undefined),
    }
    useAuthStore.setState({
      bootstrapped: true,
      auth: {
        accessToken: 'arologis-access-token',
        refreshToken: 'arologis-refresh-token',
        userId: 'user-1',
        role: 'AROLOGIS_MASTER',
        loginId: 'qa-admin',
        fullName: 'QA Admin',
        expiresAt: '2099-01-01T00:00:00Z',
      },
    })
  })

  afterEach(() => {
    menuCatalogClient.defaults.adapter = originalAdapter
    vi.restoreAllMocks()
    useAuthStore.setState({ bootstrapped: true, auth: null })
  })

  it('keeps the arologis token when catalog responds with 401', async () => {
    menuCatalogClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      const response = {
        data: { message: 'gateway rejected the request' },
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config,
        request: {},
      }
      throw new axios.AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, {}, response)
    }

    await expect(fetchMenuCatalog()).rejects.toMatchObject({ response: { status: 401 } })
    expect(useAuthStore.getState().auth?.accessToken).toBe('arologis-access-token')
    expect(useAuthStore.getState().auth?.refreshToken).toBe('arologis-refresh-token')
  })
})

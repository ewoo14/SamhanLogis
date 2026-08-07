import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from './App'

describe('App QueryClient defaults', () => {
  afterEach(() => {
    queryClient.clear()
  })

  it('권한 외 쿼리는 창 포커스에서 전역 재조회하지 않는다', () => {
    expect(queryClient.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { classifyDesktopUpdaterError } from './update-error'

describe('삼한 데스크톱 updater 오류 분류', () => {
  it('인증서 오류는 TRUST 사용자 문구로 분류한다', () => {
    expect(classifyDesktopUpdaterError(new Error('certificate chain was not trusted'))).toEqual({
      kind: 'trust',
      message: '업데이트 파일의 인증서를 신뢰할 수 없습니다. 사내 IT 지원팀에 인증서 배포를 요청한 뒤 다시 확인해 주세요.',
    })
  })

  it('파일 검증 오류는 INTEGRITY 사용자 문구로 분류한다', () => {
    expect(classifyDesktopUpdaterError(new Error('checksum mismatch'))).toEqual({
      kind: 'integrity',
      message: '업데이트 파일이 손상되었거나 검증에 실패했습니다. 다시 확인해 주세요.',
    })
  })

  it('연결 오류는 NETWORK 사용자 문구로 분류한다', () => {
    expect(classifyDesktopUpdaterError(new Error('ETIMEDOUT'))).toEqual({
      kind: 'network',
      message: '업데이트 서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 확인해 주세요.',
    })
  })
})

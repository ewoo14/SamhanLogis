export function classifyDesktopUpdaterError(error: unknown): { kind: 'trust' | 'integrity' | 'network' | 'unknown'; message: string } {
  const raw = error instanceof Error ? error.message : String(error || '')
  if (/invalid[_ ]signature|unknownerror|certificate chain|not trusted by the trust provider/i.test(raw)) {
    return { kind: 'trust', message: '업데이트 파일의 인증서를 신뢰할 수 없습니다. 사내 IT 지원팀에 인증서 배포를 요청한 뒤 다시 확인해 주세요.' }
  }
  if (/checksum|hash mismatch|integrity|corrupt|damaged|blockmap/i.test(raw)) {
    return { kind: 'integrity', message: '업데이트 파일이 손상되었거나 검증에 실패했습니다. 다시 확인해 주세요.' }
  }
  if (/net::|econn|enotfound|etimedout|timed out|network|socket|dns|http (?:4|5)\d\d/i.test(raw)) {
    return { kind: 'network', message: '업데이트 서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 확인해 주세요.' }
  }
  return { kind: 'unknown', message: '업데이트에 실패했습니다. 잠시 후 다시 확인해 주세요.' }
}

/**
 * JournalFormPage 순수 로직 (#831 R-3/R-5 후속).
 *
 * 배경: partner-service 표시명 조회가 UNAVAILABLE 이면 BE 는 write/detail 경로(저널 상세 포함)를
 * 표시명 공란으로 성사시킨다(#924 개발책임자 결정 — 롤백하지 않음). 그런데 저널 상세 응답은
 * UUID 비공개 정책상 partnerId 를 아예 주지 않고 partnerName 만 준다 — 즉 FE 입장에서
 * "이 라인은 원래 거래처가 없다"와 "거래처가 있었는데 조회가 실패해 이름이 비었다"를 응답만으로
 * 구분할 수 없다.
 *
 * 이 파일의 판정은 그 구분을 시도하지 않는다. 대신 더 단순하고 안전한 불변식을 지킨다:
 * "편집 화면에서 서버가 채워준(hydrate) 라인 중 지금도 partnerId 가 없는 의미있는 라인은,
 * 왜 없는지 확실하지 않은 채로 무경고 저장되지 않는다." 사용자가 이번 세션에 새로 추가한
 * 라인(hydrate 아님)은 의식적으로 비워둔 것이므로 제외한다.
 */

export interface RiskyPartnerLineCandidate {
  uid: string
  accountCode: string
  partnerId?: string | null
  debit: number
  credit: number
}

function isMeaningfulLine(line: Pick<RiskyPartnerLineCandidate, 'accountCode' | 'debit' | 'credit'>): boolean {
  return Boolean(line.accountCode) && (line.debit > 0 || line.credit > 0)
}

/**
 * 저장 시점에 거래처 귀속을 무경고로 잃을 위험이 있는 라인을 찾는다.
 *
 * hydrate(서버가 채운) 라인이면서 의미있고(계정+금액 있음) 지금도 partnerId 가 없는 라인을
 * 위험으로 본다 — 이름이 애초에 공란이었던 경우와, 이름은 있었지만 검색으로 partnerId 를
 * 복원하지 못한 경우를 모두 같은 결과(partnerId 없음)로 취급해 동일하게 가드한다.
 */
export function findRiskyPartnerLines<T extends RiskyPartnerLineCandidate>(
  lines: T[],
  hydratedLineUids: ReadonlySet<string>,
): T[] {
  return lines.filter((line) => {
    if (!hydratedLineUids.has(line.uid)) return false
    if (!isMeaningfulLine(line)) return false
    return !line.partnerId
  })
}

/**
 * 위험 라인 경고 문구를 만든다.
 *
 * suspectedUnavailable=true (이번 세션에 partner-service UNAVAILABLE 502 를 실제로 관측한 경우)
 * 이면 외부 조회 장애를 명시해 사용자 귀책으로 오인시키지 않는다. 그렇지 않으면(장애 근거가
 * 없으면) "실제로 거래처가 없는지 확인"으로 헤지한다 — 조회 실패인지 원래 무파트너인지 FE 가
 * 확정할 수 없는 상태를 확정적 진단으로 단정하지 않는다.
 */
export function buildRiskyPartnerLinesWarning(
  riskyLines: Array<{ accountCode: string }>,
  suspectedUnavailable: boolean,
): string {
  const codes = riskyLines.map((l) => l.accountCode).join(', ')
  if (suspectedUnavailable) {
    return `거래처 조회 서비스에 일시 장애가 있어 다음 라인의 거래처를 확인할 수 없습니다: ${codes}. `
      + '그대로 저장하면 해당 라인은 거래처 없이 저장됩니다. 계속하려면 "그대로 저장"을 다시 누르고, '
      + '거래처를 지키려면 잠시 후(조회가 복구된 뒤) 다시 시도하세요.'
  }
  return `다음 라인은 거래처 정보가 비어 있습니다: ${codes}. `
    + '실제로 거래처가 없는 라인이면 "그대로 저장"을 다시 눌러 계속하고, 아니라면 취소 후 거래처를 다시 선택하세요.'
}

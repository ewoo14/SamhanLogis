import type { DocCoeditProvider } from './createCoeditProvider'

/**
 * coedit 라인의 서버 lineId 해석 — 전표/견적 공용.
 *
 * <p><b>왜 이 모듈이 있나 (R8-FE-1 = R8-QA-2 · BLOCKING · 라이브 2/2 결정적 재현)</b>:
 * 종전 전표/견적 폼은 coedit Y.Doc → 폼 라인 변환 시 lineId 를 <b>위치(index)로 복원</b>했다
 * ({@code lineId: current[index]?.lineId ?? null}). 위치는 CRDT 에서 안정적이지 않다 —
 * 원격 피어가 1행을 삭제하면 Y.Doc 은 즉시 한 칸 당겨지지만 로컬 {@code current} 배열은
 * 그 시점에 아직 구 스냅샷이라, 남은 모든 행이 <b>이웃 행의 lineId</b>를 물려받는다.
 * 서버는 lineId 를 무조건 신뢰하므로(휴리스틱 폴백 의도적 제거) 그대로 각인된다:
 * 단품이 남의 세트 계보를 상속하고, {@code set_head} 가 탈취되고, 사용자가 입력한 단가가
 * 가격기억에서 증발한다.
 *
 * <p><b>처방</b>: lineId 를 위치로 추정하지 않고 <b>Y.Doc 에서 직독</b>한다. Y.Doc 행과 lineId 는
 * 같은 CRDT 트랜잭션으로 이동/삭제되므로 원격 편집과 무관하게 항상 자기 자신을 가리킨다.
 *
 * <p><b>🔴 그런데 직독만으로는 안전하지 않다 (R8-FE-9 — fix 지뢰)</b>:
 * {@link DocCoeditProvider.replaceItems} 는 seed row 의 lineId 가 비어 있으면
 * <b>클라이언트 랜덤 UUID</b>({@code generateLineId()})를 대신 채운다. 그 값을 그대로 저장
 * payload 에 실으면 서버 소유검증에 걸려 <b>전 라인 400</b> 이 난다. 실제로 견적 seed 는
 * lineId 를 pick 하지 않아 기존 Y.Doc 이 전부 랜덤 UUID 다(본 PR 에서 seed 를 고쳤으나,
 * <b>이미 서버에 영속된 구 Y.Doc</b> 은 여전히 랜덤 UUID 를 담고 있다).
 *
 * <p>따라서 직독값은 반드시 <b>현재 문서의 서버 라인 id 집합</b>으로 검증한다. 미검증 값은
 * null(신규 평면 라인) 로 강등해 400 대신 안전한 fail-soft 로 수렴시킨다. 이 검증은
 * BE {@code validateLineIds} (타 문서 lineId → 400) 의 클라이언트측 미러이며,
 * 서버 방어를 대체하지 않는다.
 */

/** Y.Doc 라인 map 의 lineId 필드명 — {@code createCoeditProvider.LINE_ID_FIELD} 와 동일 규약. */
const LINE_ID_CELL = 'lineId'

/**
 * Y.Doc index 행의 lineId 를 직독한다 — 위치복원 금지.
 *
 * @returns Y.Doc 에 실린 lineId 문자열. 미보유 시 빈 문자열.
 */
export function readCoeditLineId(provider: DocCoeditProvider, index: number): string {
  return provider.getItemValue(index, LINE_ID_CELL)
}

/**
 * Y.Doc index 행의 lineId 를 직독하고 <b>현재 문서 소유</b> 인지 검증해 저장 payload 값을 만든다.
 *
 * @param knownServerLineIds 현재 로드된 문서 상세 응답의 라인 id 집합
 * @returns 서버가 아는 기존 라인이면 그 lineId, 아니면 null(= 신규 평면 라인)
 */
export function resolveServerLineId(
  provider: DocCoeditProvider,
  index: number,
  knownServerLineIds: ReadonlySet<string>,
): string | null {
  const docLineId = readCoeditLineId(provider, index)
  if (!docLineId) return null
  // 클라 랜덤 UUID(replaceItems 폴백/addItem 신규행)는 서버가 모르는 값이다 → 신규 라인으로 강등.
  return knownServerLineIds.has(docLineId) ? docLineId : null
}

/** 문서 상세 라인 배열에서 서버 lineId 집합을 만든다 (null/빈값 제외). */
export function toServerLineIdSet(
  lines: ReadonlyArray<{ id?: string | null; lineId?: string | null }>,
): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const line of lines) {
    const id = line.id ?? line.lineId
    if (id) ids.add(id)
  }
  return ids
}

/**
 * provider Y.Doc 이 서버 lineId 를 담고 있지 않은 <b>구 스냅샷</b>인지 판정한다 — 재시드 게이트.
 *
 * <p>lineId seed 도입 이전에 만들어져 서버에 영속된 Y.Doc 은 라인마다 클라 랜덤 UUID 를 갖는다.
 * 그대로 두면 {@link resolveServerLineId} 가 전 라인을 null 로 강등해 계보가 조용히 소실되고,
 * 계보 보유 문서라면 BE {@code requireLineIdContract} 가 400 을 낸다. 열람 시점에 서버 기준으로
 * lineId 를 복구해 그 두 경로를 모두 닫는다.
 *
 * <p>이 재시드 게이트는 <b>provider 생성 시 1회</b>만 본다. [D-R8-11] 로 전표는 coedit 중 행삭제
 * 잠금을 제거했으나(견적은 잠금 유지), 행삭제는 {@link resolveServerLineId} 가 매 행을 Y.Doc
 * 직독+검증하므로 남의 행으로 옮겨가지 않는다 — 세션 중 삭제된 행의 lineId 는 사라질 뿐이다.
 * 따라서 "서버가 모르는 lineId 가 하나라도 있다" = "이 Y.Doc 은 lineId seed 이전의 구 스냅샷"
 * 이라는 생성-시점 판정은 잠금 제거와 무관하게 그대로 성립한다.
 */
export function coeditLineIdsAreStale(
  provider: DocCoeditProvider,
  knownServerLineIds: ReadonlySet<string>,
): boolean {
  const rowCount = provider.items.toArray().length
  const seenServerLineIds = new Set<string>()
  for (let index = 0; index < rowCount; index += 1) {
    // trailing 입력행은 아직 품목을 확정하지 않은 화면 전용 행이다. replaceItems가
    // 호환성을 위해 client lineId를 부여하더라도 서버 라인 집합의 정합성 판정에는
    // 참여시키지 않는다. 이 행을 stale로 보면 원격 삭제 뒤 위치 재시드가 빈행에
    // 서버 lineId를 붙여 다음 행의 계보를 오염시킨다.
    if (!provider.getItemValue(index, 'productId').trim()) continue
    const docLineId = readCoeditLineId(provider, index)
    if (!docLineId || !knownServerLineIds.has(docLineId)) return true
    if (seenServerLineIds.has(docLineId)) return true
    seenServerLineIds.add(docLineId)
  }
  return false
}

/**
 * 구 스냅샷 Y.Doc 의 라인 lineId 를 서버 기준으로 <b>in-place</b> 복구한다 — 헤더·셀 값 보존.
 *
 * <p><b>왜 이 함수가 있나 (R8 mock 게이트 회귀 · 원격 memo/수량 소실)</b>:
 * {@link coeditLineIdsAreStale} 가 true 인 비어있지-않은 Y.Doc 은 lineId 만 없을 뿐 원격 피어의
 * 텍스트/셀 편집(예: header.memo, items.0.quantity)을 이미 담고 있을 수 있다. 종전 재시드는
 * 헤더·아이템을 통째 서버값으로 덮어쓰는 full-seed({@code syncSlipCoeditProvider→replaceItems})라
 * 그 원격 편집을 파괴했다(라이브 원격 memo="…"가 서버 memo 로 되돌아가고 수량 7→서버값). 계보
 * 복구의 <b>본래 의도는 lineId 부착뿐</b>이므로, 여기서는 아이템의 {@code lineId} 셀만 서버 라인
 * 순서대로 채우고 헤더·나머지 셀은 건드리지 않는다.
 *
 * <p>lineId 는 열람 시점(원격 삭제 이전)의 위치 정합을 신뢰한다 — 종전 replaceItems 가 이미 취하던
 * 위치 정렬 규약과 동일하며 값 보존만 더한다. 서버 라인 수를 초과하는 아이템은 미보유로 두어
 * {@link resolveServerLineId} 가 신규 평면 라인으로 안전 강등한다.
 */
export function reseedCoeditLineIds(
  provider: DocCoeditProvider,
  orderedServerLineIds: ReadonlyArray<string>,
  previousServerLineIds?: ReadonlySet<string>,
): void {
  const serverLineIds = new Set(orderedServerLineIds.filter(Boolean))
  provider.doc.transact(() => {
    if (previousServerLineIds) {
      // 현재 REST에 없는 직전 서버 라인은 원격 삭제행이다. 먼저 제거해야 위치 재시드가
      // 삭제행을 신규행으로 부활시키거나 생존 행에 같은 ID를 덧씌우지 않는다.
      const seenServerLineIds = new Set<string>()
      for (let index = provider.items.toArray().length - 1; index >= 0; index -= 1) {
        if (!provider.getItemValue(index, 'productId').trim()) continue
        const lineId = readCoeditLineId(provider, index)
        if (lineId && serverLineIds.has(lineId)) {
          if (seenServerLineIds.has(lineId)) provider.items.delete(index, 1)
          else seenServerLineIds.add(lineId)
        } else if (lineId && previousServerLineIds.has(lineId)) {
          provider.items.delete(index, 1)
        }
      }

      // 남은 legacy 행은 현재 서버 ID에 아직 대응하지 않는 행이다. 현재 서버 라인보다
      // 많으면 초과분은 삭제된 행의 잔재이므로 제거하고, 부족한 ID만 순서대로 복구한다.
      const presentServerLineIds = new Set<string>()
      const unknownIndexes: number[] = []
      for (let index = 0; index < provider.items.toArray().length; index += 1) {
        if (!provider.getItemValue(index, 'productId').trim()) continue
        const lineId = readCoeditLineId(provider, index)
        if (lineId && serverLineIds.has(lineId)) presentServerLineIds.add(lineId)
        else unknownIndexes.push(index)
      }
      const missingServerLineIds = orderedServerLineIds.filter(
        (lineId) => lineId && !presentServerLineIds.has(lineId),
      )
      for (let i = unknownIndexes.length - 1; i >= missingServerLineIds.length; i -= 1) {
        provider.items.delete(unknownIndexes[i]!, 1)
      }
      const remainingUnknownIndexes = unknownIndexes.slice(0, missingServerLineIds.length)
      remainingUnknownIndexes.forEach((index, position) => {
        provider.setItemValue(index, LINE_ID_CELL, missingServerLineIds[position]!)
      })
      return
    }

    let serverIndex = 0
    for (let index = 0; index < provider.items.toArray().length && serverIndex < orderedServerLineIds.length; index += 1) {
      // 미확정 빈행은 서버 라인이 아니므로 서버 ID를 소비하지 않고 그대로 둔다.
      if (!provider.getItemValue(index, 'productId').trim()) continue
      const lineId = orderedServerLineIds[serverIndex]
      if (lineId) provider.setItemValue(index, LINE_ID_CELL, lineId)
      serverIndex += 1
    }
  })
}

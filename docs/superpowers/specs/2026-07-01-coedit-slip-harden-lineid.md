# 협업 full-form 트랙A 하드닝 slA1 — 라인 안정키(lineId) + add/remove CRDT (설계)

> 2026-07-01. 공유 provider(createDocCoeditProvider/CollaborativeSlipInput) 하드닝. 정찰 a24d2ed9. slip+주문+잔여 롤아웃 공용 수혜. **backward-compat 필수**(주문/타 패널 index fieldPath 무손상).

## 문제 (정찰)
- 라인 식별이 **위치(index)** 기반: fieldPath `items.{index}.{cell}` → remote 라인 insert/delete 시 셀·awareness 커서 한 칸 밀려 오귀속.
- `ensureItemMap` index 패딩(동시 같은 index push=행 중복) · `replaceItems`(배열 통째 nuke=동시 라인편집 유실) · coedit 모달에 라인 **추가/삭제 버튼 없음**(삭제는 replaceItems 재구성).
- ⚠️ `Y.Array.move` 부재(yjs 13.6.31) → 정렬은 slA1b(fractional order-key)로 분리. 본 slA1=라인 **추가/삭제 + lineId 안정키**만.

## slA1 범위 (라인 add/remove + lineId, reorder=slA1b 후속)
**createCoeditProvider.ts `createDocCoeditProvider`:**
- 각 라인 Y.Map에 불변 `lineId` 필드(seed 시 서버 `SlipLineDetail.id` 또는 `crypto.randomUUID()`). Y.Map 식별·React key·향후 dnd-kit id 통일.
- 신규 API: `addItem(seed?): string(lineId)`(Y.Array.push 새 Y.Map[lineId 포함]), `removeItem(lineId)`(transact 내 lineId→현 index 재해석 후 `items.delete(idx,1)`, findIndex<0 no-op 멱등).
- `getItemValue/setItemValue`: **lineId 키 + index 둘 다 지원(backward-compat)** — 경로 세그먼트가 숫자면 index, 아니면 lineId 조회. fieldPath `items.{lineId|index}.{cell}`.
- `replaceItems`: seed 전용 유지하되 **lineId 보존**(없으면 부여)·Y.Text/제어필드 파괴 금지(현 `String(value)` flatten 수정).
- awareness 커서/edit fieldPath도 lineId 경유 허용(index 호환).

**CollaborativeSlipInput.tsx:** fieldPath 파싱이 `items.{seg}.{cell}` 에서 seg=숫자(index)/문자(lineId) 양용(backward-compat). 주문/타 패널(index) 무손상.

**SlipDetailPage.tsx coedit 모달(매출/매입):** 라인 row를 lineId 키로 렌더. **라인 추가 버튼**→`provider.addItem()`, **행 삭제**→`provider.removeItem(lineId)`(현 replaceItems 대체). fieldPath를 lineId로 전환.

## 검증
- collab vitest: createCoeditProvider(addItem/removeItem/lineId·backward-compat index) + CollaborativeSlipInput(lineId/index 양용) + SlipDetailPage coedit(추가/삭제) + **주문 SalesPartnerOrderDetailPage.coedit(index 무손상 회귀)**.
- **2세션 라이브 QA**: 두 창에서 라인 추가/삭제 동시 → 무손실·오귀속 없음·셀 동시편집 보존.
- backward-compat: 주문/회계/결재/배차 패널(index) 회귀 0.

## 후속
- slA1b: dnd-kit reorder + fractional order-key(정렬 동시안전). slA2: 라인 셀 char-CRDT(Y.Text + applyDelta).

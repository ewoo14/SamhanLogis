# 협업 full-form 트랙B 롤아웃 — 견적(Estimate) 전체폼 coedit (설계)

> 2026-07-01. 4문서 fit 정찰 종합(견적 ✅M·결재 ✅M본문·회계 ❌BE·배차 ❌저가치) 중 **견적=clean FE-only**. 주문(#689) 패턴을 EstimateFormPage 에 이식. **BE 변경 0**.

## 재사용 (BE 신규 불요)
- coedit 전송: `/slips/estimates/:id/collab/coedit|/update|/awareness|/stream` — **이미 가동**(EstimateCollaborationPanel 메모가 사용 중). full-form 이 동일 doc 공유(Y.Text 'memo' ↔ Y.Map 'header'+Y.Array 'items' 공존, awareness `field.` 네임스페이스 분리 기적용).
- 저장: `updateEstimate(id, body)` **PUT** `/slips/estimates/:id` (lines replace, `estimateApi.ts:196`). 기존 updateMutation 재사용.
- infra: createDocCoeditProvider / CollaborativeSlipInput / DocCoeditProvider — 전부 재사용.

## 레퍼런스
`SalesPartnerOrderDetailPage.tsx`(주문 #689) coedit 모달 = 본 슬1의 1:1 패턴. **차이=대상이 모달이 아닌 별도 페이지 `EstimateFormPage.tsx`**(`/sales/estimates/:id/edit`).

## 슬1 범위 (주문 패턴 그대로, index seed-lock)
1. **provider 생애주기**: EstimateFormPage 가 **edit 모드(isEdit + 편집가능 status)** 일 때 `createDocCoeditProvider({documentId: editId, basePath: '/slips/estimates/'+editId, headerTextFields: ESTIMATE_HEADER_TEXT_FIELDS={'memo'}})` 생성, 언마운트 시 destroy. provider reject 시 평문 폴백. /new(생성)은 coedit 비대상.
2. **seed**(provider empty 시): header {partnerName, partnerBusinessNo, partnerAddress, estimateDate, validUntil, memo} + `replaceItems(lines→{modelName, productName, specification, quantity, unitPrice, productId})`. **productId=비편집 셀로 시드**(저장·lookup 동기화용).
3. **역동기화**: subscribeDoc → provider header/items 를 로컬 React state(lines/header)로 반영(totals/buildBody 동작). 주문 applyProviderState 패턴.
4. **바인딩**: 헤더 partnerName/businessNo/address/estimateDate/validUntil/memo → CollaborativeSlipInput `header.X`. 라인 modelName/productName/specification/quantity/unitPrice → `items.${index}.cell`(index seed-lock). **거래처 자동완성(AsyncAutocomplete)=coedit 중 평문/비활성**(주문 categoryKey Select 평문과 동일). 단가/금액 파생(totals)은 로컬 계산 유지.
5. **productId lookup 동기화**: handleModelLookup 이 productId/productName/unitPrice 갱신 시 **provider 에도 기록**(setItemValue items.index.productName/unitPrice/productId) → 타 편집자 반영.
6. **행 생성/삭제**: 수동 행 추가 버튼 없이 마지막 행 입력 시 자동 빈행을 생성한다. coedit 중에도 사용자의 미저장 행은 보존하며, 서버보다 앞선 provider를 행 수 불일치로 간주해 재시드하지 않는다. 행 삭제는 최소 행 규칙을 따른다.
7. **BUNDLE setOptions**: coedit 제외(로컬 전용; edit 모드는 이미 전개완료 productType=null).
8. **게이트**: coedit = isEdit && 편집가능(DRAFT/SENT, isReadOnly 반대) && 권한. coeditPending 시 입력/저장 잠금.
9. **저장**: 기존 updateMutation(updateEstimate PUT). buildBody 는 동기화된 로컬 state 사용.

## 검증
- typecheck + vitest 신규 `EstimateFormPage.coedit.test.tsx`(주문 coedit 테스트 미러: provider 옵션·헤더/라인 fieldPath 배선·subscribeDoc 역동기화·평문 폴백·coeditPending 잠금·잠금상태 게이트·productId lookup 동기화·server-wins 재시드).
- **라이브 2세션 동시편집 QA**(불가시 정직 BLOCKED+스샷).

## 후속 / defer
- 견적 슬2: byId 협업 라인 add/remove(slA1 infra) + BUNDLE setOptions coedit.
- 낙관적 잠금: 견적 PUT 에 version 미전송(주문 updatedAt 대비) — 슬2/후속.
- **결재**(다음 트랙B): 본문(title/content/동적필드) coedit, 저장=changeSet commit(full-PUT 아님), content 멀티라인 어댑터·SELECT 필드 폴백 필요, items[] 미사용.
- **회계**: BE update 엔드포인트(낙관락 version+라인 DTO)+차/대변 균형 재검증+slA1 라인CRDT = 큰 BE+FE 슬.
- **배차**: full-form 저가치(자유편집=memo뿐, 라인=전표참조 불변)+BE 부재 → 개발책임자 확인(메모 coedit 유지 권고).

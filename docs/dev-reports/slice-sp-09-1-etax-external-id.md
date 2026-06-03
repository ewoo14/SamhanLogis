# Slice: SP-09-1 T3 — eTaxExternalId 표시 + 자동재게이트

> branch `feat/sp-09-1-etax-external-id-display` / 2026-06-04 / clients/desktop. ⑥ B/C feature 잔여 #1.
> 세금계산서 NTS 발행 후 홈택스 접수번호(eTaxExternalId)를 상세에 표시 — FE 신규 + sp-09-1 재게이트.

## 1. 구현 (FE)

- **TaxInvoiceDetailPage**: NTS 발행 완료 시 `eTaxExternalId`(홈택스 접수번호, 비즈니스 식별자) 값을
  `data-testid="tax-invoice-detail-etax-external-id"` 로 표시(기존 "NTS 발행 완료" 배지는 라벨만, 값 미표시였음).
- emit onSuccess: detail invalidate(재조회) → **setQueryData 낙관적 갱신**으로 변경. DRY_RUN mock 은 eTaxExternalId
  를 미영속하므로 invalidate 재조회 시 값이 사라졌다 — emit 응답의 eTaxExternalId 를 상세 캐시에 즉시 반영(실 BE 도
  emit 응답에 eTaxExternalId 포함하므로 동일하게 동작). 목록/audit invalidate 는 유지.

## 2. 테스트 정합 (sp-09-1 T3)

- T3 진입 URL 을 목록(`tax-invoices?mockStatus=ISSUED`)이 아닌 **단건 상세**(`/tax-invoices/ti-001`, ISSUED·미발행)로
  교정 — NTS 발행 버튼은 상세 페이지에서만 노출.
- step2 의 `emitNtsCallCount`(test page.route 카운터) 단언 제거 — VITE_MOCK_MODE 에서 page.route 는 no-op
  (in-process mock 이 emit-nts 처리)이라 카운터 미증가. emit 효과는 step3(eTaxExternalId 표시)로 검증.

## 3. 검증

- sp-09-1 **5/5 green** → testIgnore 해제 재게이트.
- 게이트 합동(sp-d4·sp-d2·sp-d3·admin-hr·phase-2-5·sp-08-6-6·sp-09-3·sp-09-1) **64 passed / 0 skipped**. desktop tsc 0.

## 3.5 리뷰 반영 (FE + Codex)

- **중복 testid(FE P0)**: 페이지에 이미 NTS 발행 결과 배너(`tax-invoice-detail-etax-external-id`)가 있었음 → 처음 추가했던 인라인 블록 제거(중복 testid strict-mode 위반 방지). 실제 T3 해결은 URL(ti-001 상세)+setQueryData(기존 배너가 emit 후 표시되게)였음.
- **setQueryData undefined 가드(FE P0)**: `old` 없을 때 undefined 반환=캐시 삭제 시맨틱 → 캐시 존재 시만 갱신, 없으면 invalidate fallback.
- **CANCELLED 가드(FE P1)**: 배너 조건 `t.eTaxExternalId && t.status !== 'CANCELLED'` — 취소된 세금계산서에 NTS 발행 유효 오해 방지.
- **confirm 정밀화(FE P1)**: step2 의 dead `dialog` 핸들러 제거 + `[data-testid="tax-invoice-emit-nts-modal-confirm"]` 정확 클릭.
- **step3 false-green 강화(Codex P1)**: 일반 문구('전자세금계산서'/'e-Tax') fallback 제거 → canonical 배너 testid `toBeVisible` + `toContainText('DRY-')` 로 emit 실행 효과 엄격 검증.
- **submittedAt(FE P1)**: `EmitNtsResponse.submittedAt` 화면 미표시는 `TaxInvoiceDetail` DTO 확장(BE) 필요 → Phase 11 후속(DRY_RUN 불요).

## 4. 후속

- 실 BE(TaxInvoiceEmitService)는 eTaxExternalId 를 영속하므로 운영에선 setQueryData + 자연 refetch 모두 값 반환.

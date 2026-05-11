# 구매조회 시나리오 — sales-purchase-query-redesign

슬라이스: `feature/sales-purchase-query-redesign`
작성일: 2026-05-11
담당: QA agent

---

## TC-P1: /purchases/query 진입 — 컬럼 11개 노출 검증

**목적**: 구매조회 페이지 최초 진입 시 기획서 명세 컬럼 11개가 모두 노출됨을 검증한다.

**사전조건**:
- 인증된 사용자 (역할: MASTER 이상)로 로그인 완료

**절차**:
1. `/purchases/query` 페이지 진입 및 로딩 완료 대기
2. 테이블 헤더 행의 컬럼명 목록 확인

**대상 컬럼 (11개)**:

| 순번 | 컬럼명 | 비고 |
|------|--------|------|
| 1 | ☑ (체크박스) | 다중선택 |
| 2 | 순번 | |
| 3 | 구매번호 | slipNo (INBOUND) |
| 4 | 거래처 | partnerName |
| 5 | 거래처코드 | partnerCode |
| 6 | 품목 | 라인 품목명 |
| 7 | 금액 | totalAmount |
| 8 | 수량합계 | totalQuantity |
| 9 | 입고창고 | destinationWarehouseId |
| 10 | 적요 | memo |
| 11 | 비고 | note / remark |

**예상 결과**:
- 헤더 행에 11개 컬럼 텍스트 모두 노출
- 체크박스 컬럼 존재
- 누락 컬럼 0개
- pageerror 없음

**Acceptance Criteria**:
- 11개 컬럼명 전부 DOM 에 포함
- 스크린샷: `TC-P1-purchase-query-11-columns.png`

---

## TC-P2: slipType=INBOUND 전용 조회 — OUTBOUND 행 0건

**목적**: 구매조회 페이지가 입고전표(INBOUND)만 표시하고 출고전표(OUTBOUND)는 0건임을 검증한다.

**사전조건**:
- OUTBOUND 슬립 1건 이상 존재 (판매 전표)
- INBOUND 슬립 1건 이상 존재 (구매 전표)

**절차**:
1. `/purchases/query` 페이지 진입 (slipType=INBOUND 필터 자동 적용 확인)
2. 목록 데이터 행 전체 검토

**예상 결과**:
- tbody 모든 행의 slipType 이 INBOUND
- "출고전표" / "OUTBOUND" 텍스트가 데이터 행에 0건
- 입고창고 컬럼 노출 (INBOUND 전용 컬럼 정상 표시)
- pageerror 없음

**BE 대응 검증**: `SlipQueryRedesignSpecIT.specIt1_slipTypeInboundFilter()`

**Acceptance Criteria**:
- OUTBOUND 행 0건 확인
- 입고창고 컬럼 정상 노출
- 스크린샷: `TC-P2-purchase-query-inbound-only.png`

---

## TC-P3: 검색 모달 — 사업자등록번호 입력 후 조회

**목적**: 검색 모달에서 사업자등록번호로 거래처를 조회하고 결과가 필터링됨을 검증한다.

**사전조건**:
- 인증된 사용자 로그인
- 사업자등록번호 "123-45-67890" 을 가진 거래처의 INBOUND 슬립 데이터 존재 (mock)

**절차**:
1. `/purchases/query` 진입
2. "검색" / "조건" 버튼 클릭 → 검색 모달 오픈 확인
3. 사업자등록번호 입력란에 "123-45-67890" 입력
4. "조회" 버튼 클릭
5. 결과 목록 확인

**예상 결과**:
- 검색 모달에 사업자등록번호 입력란 존재
- 조회 후 에러 없음 (pageerror 없음)
- 해당 사업자등록번호 거래처 슬립만 목록 노출
- 빈 결과 시 "검색 결과 없음" 메시지 정상 표시

**도메인 정합성 연계**:
- partner-service 의 `business_registration_no` ↔ slips.business_number snapshot 일치 검증
- 자세한 SQL: `docs/qa/sales-purchase-query-redesign/domain-integrity-check.md` 참조

**Acceptance Criteria**:
- 사업자등록번호 입력란 존재
- 조회 후 pageerror 없음
- 스크린샷: `TC-P3-purchase-query-search-biz-no.png`

---

## 스크린샷 위치

모든 스크린샷은 `docs/qa/sales-purchase-query-redesign/` 에 자동 저장.
PR 본문 인라인 첨부 의무 (메모리 `feedback_pr_qa_screenshots`).

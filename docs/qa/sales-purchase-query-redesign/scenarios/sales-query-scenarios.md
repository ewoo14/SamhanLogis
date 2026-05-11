# 판매조회 시나리오 — sales-purchase-query-redesign

슬라이스: `feature/sales-purchase-query-redesign`
작성일: 2026-05-11
담당: QA agent

---

## TC-S1: 기본 날짜 범위 — Asia/Seoul 오늘 ±15일 자동 설정

**목적**: 판매조회 페이지 최초 진입 시 날짜 범위 기본값이 서울 시각 기준 오늘 ±15일로 설정됨을 검증한다.

**사전조건**:
- 인증된 사용자 (역할: MASTER 이상)로 로그인 완료

**절차**:
1. `/sales/query` 페이지 진입
2. 날짜 범위 picker (from/to) 의 기본값 확인

**예상 결과**:
- `from` picker 값 = 오늘(Asia/Seoul) - 15일 (YYYY-MM-DD)
- `to` picker 값 = 오늘(Asia/Seoul) + 15일 (YYYY-MM-DD)
- 공차 ±1일 허용 (렌더 시점 자정 교차 경우)
- 페이지 오류 없음 (console error/pageerror 없음)

**Acceptance Criteria**:
- from 날짜와 오늘-15일의 차이가 1일 이하
- to 날짜와 오늘+15일의 차이가 1일 이하
- 화면에 한국어 텍스트 정상 노출

---

## TC-S2: 컬럼 17개 모두 노출

**목적**: 판매조회 테이블 헤더에 기획서 명세 컬럼 17개가 빠짐없이 노출됨을 검증한다.

**사전조건**:
- 인증된 사용자 로그인 완료

**절차**:
1. `/sales/query` 페이지 진입 및 로딩 완료 대기
2. 테이블 헤더 행의 컬럼명 목록 확인

**대상 컬럼 (17개)**:

| 순번 | 컬럼명 | 비고 |
|------|--------|------|
| 1 | ☑ (체크박스) | 다중선택 |
| 2 | 순번 | |
| 3 | 판매번호 | slipNo |
| 4 | 거래처 | partnerName |
| 5 | 거래처코드 | partnerCode |
| 6 | 배송주소 | deliveryAddress |
| 7 | 품목 | 라인 품목명 |
| 8 | 특이사항 | memo |
| 9 | 금액 | totalAmount |
| 10 | 출고창고 | sourceWarehouseId |
| 11 | 인수자번호 | recipientPhone |
| 12 | 전표수정내역 | editHistoryCount |
| 13 | 감리주소 | supervisionAddress |
| 14 | 프로젝트명 | projectName |
| 15 | 담당자명 | salesPersonName |
| 16 | 인쇄 | printed |
| 17 | 입금예정일 | paymentDueDate |

**예상 결과**:
- 헤더 행에 17개 컬럼 텍스트 모두 노출
- 체크박스 컬럼 존재 (input[type=checkbox] 또는 ☑ 아이콘)
- 누락 컬럼 0개

**Acceptance Criteria**:
- 17개 컬럼명 전부 DOM 에 포함
- 스크린샷: `TC-S2-sales-query-17-columns.png`

---

## TC-S3: 다중 선택 — 행 3개 체크 후 toolbar 선택 카운트

**목적**: 행 체크박스 3개 선택 시 toolbar에 "3행 선택됨" 또는 동등한 카운트 표시가 나타남을 검증한다.

**사전조건**:
- 판매조회 목록에 3건 이상 데이터 존재 (mock 데이터 또는 시드 데이터)

**절차**:
1. `/sales/query` 페이지 진입
2. tbody 첫 번째 행 체크박스 체크
3. tbody 두 번째 행 체크박스 체크
4. tbody 세 번째 행 체크박스 체크
5. toolbar 영역 텍스트 확인

**예상 결과**:
- toolbar 에 "3행 선택됨" / "3개 선택" / "선택: 3" 중 하나 노출
- 다른 행 체크박스는 미체크 상태 유지
- pageerror 없음

**Acceptance Criteria**:
- 숫자 "3" 이 toolbar 선택 카운트 UI 에 노출
- 스크린샷: `TC-S3-sales-query-multi-select-3rows.png`

---

## TC-S4: 헤더 체크박스 클릭 → 현재 페이지 전체 선택

**목적**: 헤더(thead) 체크박스 클릭 시 현재 페이지의 모든 행이 일괄 선택됨을 검증한다.

**사전조건**:
- 판매조회 목록에 1건 이상 데이터 존재

**절차**:
1. `/sales/query` 페이지 진입
2. 테이블 헤더(thead)의 체크박스 클릭
3. tbody 모든 행 체크박스 상태 확인

**예상 결과**:
- tbody 모든 행 체크박스가 checked 상태
- 헤더 체크박스도 checked 또는 indeterminate 상태 (전체 선택 기준)
- pageerror 없음

**Acceptance Criteria**:
- 현재 페이지 N개 행 전부 선택 (N = 현재 페이지 행 수)
- 스크린샷: `TC-S4-sales-query-header-select-all.png`

---

## TC-S5: 검색 모달 — 거래처명 입력 후 조회

**목적**: 검색 모달을 열고 거래처명 입력 후 조회 시 결과가 필터링됨을 검증한다.

**사전조건**:
- 인증된 사용자 로그인
- "삼한" 포함 거래처 슬립 데이터 존재 (mock)

**절차**:
1. `/sales/query` 진입
2. "검색" / "조건" 버튼 클릭 → 검색 모달 열림 확인
3. 거래처명 입력란에 "삼한" 입력
4. "조회" 버튼 클릭
5. 결과 목록 확인

**예상 결과**:
- 검색 모달 정상 오픈
- 거래처명 "삼한" 포함 슬립만 목록에 노출
- 조회 중 에러 없음 (pageerror 없음)
- 검색 결과 0건도 오류 아님 (빈 목록 UI 정상)

**Acceptance Criteria**:
- 검색 모달 트리거 버튼 존재
- 거래처명 입력 후 조회 버튼 클릭 시 pageerror 없음
- 스크린샷: `TC-S5-sales-query-search-modal.png`

---

## TC-S6: 페이지네이션 — 51~100건 (2페이지)

**목적**: 데이터 50건 초과 시 페이지네이션 "다음" 버튼으로 2페이지(51~100번) 이동이 동작함을 검증한다.

**사전조건**:
- 판매조회 목록에 51건 이상 슬립 데이터 존재

**절차**:
1. `/sales/query` 진입 (기본 1페이지, size=50)
2. 페이지네이션 "다음" 버튼 확인 및 클릭
3. 페이지 변경 후 순번 / 페이지 번호 확인

**예상 결과**:
- "다음" 버튼 활성화 상태 (데이터 51건 이상 시)
- 클릭 후 순번 51 이상 또는 "2페이지" 표시
- URL 또는 페이지 상태에 page=2 반영
- pageerror 없음

**Acceptance Criteria**:
- 2페이지 이동 동작
- 순번 51 이상 데이터 노출 또는 페이지 번호 2 표시
- 스크린샷: `TC-S6-sales-query-pagination-page2.png`

---

## 스크린샷 위치

모든 스크린샷은 `docs/qa/sales-purchase-query-redesign/` 에 자동 저장.
PR 본문 인라인 첨부 의무 (메모리 `feedback_pr_qa_screenshots`).

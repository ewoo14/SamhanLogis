# 2026-07-03 — 전표현황 "입금보고서" 표시명 통일·CashReceipt IT override 보강 (PR #716)

> PR #710(E3 S2) 소급 Codex 대칭 재검이 적발한 신규 MED 2건+LOW 1건의 정비 fix. 마감 역분개 정책(개발책임자 결정 대기)과 무관한 즉시 처리분 분리 — "S3 착수 전 소형 정비" disposition 이행.

## 변경

- **표시명 단일 진실원화**: 전표현황 `CASH_RECEIPT` 표시명 "현금입금"→"입금보고서"(BE switch·FE 옵션 라벨·mock parity·IT 기대값) + **리뷰 라운드가 추가 적발한 제3 라벨 "현금회수"**(분개목록 Excel 다운로드) — `JournalExcelExportService.sourceTypeLabel` 자체 switch 폐기, `JournalStatusReportService.sourceTypeDisplayName`(public static) **위임**으로 6종 라벨(전표/수기/결산/계좌입금/지출결의서/입금보고서) 화면·Excel 구조 통일(향후 drift 차단, "슬립자동" 폐기는 용어 규약 부합).
- **IT override false-green 해소**: `CashReceiptControllerIT` override 계정이 기본값(102/110)과 동일해 override 무시 회귀도 green 이던 구조 → **leaf 101(현금)/120(미수금)**(V1 시드 `is_leaf=TRUE`)로 create/confirm·CONFIRMED PATCH 재게시의 `journal_lines.account_code`까지 단언. aging MV 가 120 미분류인 점을 인지해 aging 계열 3케이스만 `defaultAccountUpdateBody` 분리(간섭 회피 설계).
- 주석 스테일 정정: 전표현황 화면/서비스 "POSTED 분개 기반"→실동작(상태 필터 기준·기본 POSTED, 잔액 계열=POSTED+REVERSED(보상쌍 상쇄)는 별도 리포트 계열) + FE 라벨 회귀 테스트 신설.

## 라운드 이력 (실행=게시 1:1)

1. Codex 개발(gpt-5.5/high) + 오포함 잔재 제외 정정 → 게시
2. **Opus full 5-agent**: FE 0·DevOps PASS·QA 0(IT 29/29 — FROM-CACHE 의심에 `--rerun-tasks` 강제 재실행으로 정직성 확보·라이브 GUI "입금보고서" 3표면 실증)·**BE HIGH 1+Design MED 1 동일 지점 수렴**(Excel 제3 라벨 — 리터럴 grep 사각지대, 같은 enum 라벨링 switch 전수 스윕 필요 교훈)·Design LOW 1(괄호 표기) → 게시
3. Opus fix(위임 리팩터+표기) — 모듈 전체 테스트 0 fail → 게시
4. **Codex full 5-agent: 전 차원 0건 — 0수렴** → 게시

## 교훈

- **용어 스윕은 리터럴 grep 이 아니라 "동일 enum 을 라벨링하는 지점 전수"로**: 제3의 라벨("현금회수")은 구용어 문자열 검색으로는 원리적으로 못 잡는다 — 라벨 switch/맵 자체를 인벤토리해야 함.
- 라벨류는 **단일 진실원 위임**이 정답: 두 곳 하드코딩은 반드시 drift 한다(이번 건이 실증 — "화면 따로 Excel 따로").

## backlog

- KFTC_DEPOSIT 이 FE 유니온/옵션/mock 에 자체 누락 — pre-existing(E3 S2 backlog "KFTC_DEPOSIT FE union" 동일 건, 트래킹 유지).

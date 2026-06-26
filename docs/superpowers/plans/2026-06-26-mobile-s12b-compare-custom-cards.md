# 모바일 슬12b — 비교/커스텀 4종 모바일 카드화 (plan)

> 에픽: [모바일 레이아웃 갭 클로저](../specs/2026-06-26-mobile-layout-gap-closure-design.md) 슬12b.
> 선행: 슬12a(#613, 표준 리스트 4종 DataTable 카드화) 머지 완료.

## 대상 (원시 `<table>` 4화면 / 7 table)
| 화면 | 파일 | 성격 | 접근 |
|---|---|---|---|
| 카카오 자동매칭 | KakaoAutoDispatchPage (table1) | 표준 배차 리스트(슬12a ManualDispatch와 동형) | **DataTable + mobilePriority + rowTestId** |
| DPS 입고 비교 | InventoryDpsComparePage (table1+grid) | 비교/대조(매트릭스성) | **useIsMobile 카드 폴백**(데스크탑 raw table 보존) |
| 가배차 분류 | ArologisPreClassifyPage (table4) | 분류/대조 | **useIsMobile 카드 폴백** |
| 실배차 비교 | ArologisDispatchReconcilePage (table1) | 운송사 실배차 대조 | **useIsMobile 카드 폴백** |

## 접근 (spec per-page 규칙)
- **표준 리스트성**(Kakao): 공용 `@samhan/design-system` DataTable 전환 → 슬3 자동 카드화 + `mobilePriority`(primary=DOM 첫 컬럼/secondary/hidden) + `rowTestId`(슬12a 신설 prop 재사용, 행 testid 보존). 액션 버튼 컬럼=render 보존.
- **비교/매트릭스성**(DPS비교·가배차·실배차): `useIsMobile()` 분기 — 데스크탑 raw `<table>` **그대로 보존**, 모바일(≤768px)은 각 행/비교쌍을 세로 스택 카드(라벨-값, 좌/우 대조는 카드 내 2열 또는 상하 배치). 컬럼헤더 모바일 숨김. global.css `.mobile-*` 재사용 또는 페이지 한정 클래스.

## 불변(엄수)
- **데스크탑 렌더 동일 보존**(@media≤768 또는 isMobile 분기, 1280px 무회귀).
- 모든 `data-testid`(행/버튼/wrapper) 보존 — mock 스펙·라이브 QA 의존.
- 가로 오버플로 0(390px). Flyway 0, BE 무변경, FE only.
- DataTable 전환 시 액션/UUID성 컬럼=hidden 또는 '선택 핵심기능'=secondary(슬12a 교훈).

## 워크플로우
canonical 8단계: Opus 기획+조기PR → Codex 구현 → ④Opus 5차원+fix+라이브QA ↔ ⑤Codex 5차원+fix+라이브QA(0수렴) → ⑥PM종합 → ⑦CI green → ⑧PM 자율머지. 매 라운드 라이브 Docker QA(390/1280, dev_master), 매 Bundle ScheduleWakeup 자각.

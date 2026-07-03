# 2026-07-04 — 마감기간 원분개 역분개 가드 (PR #719, A안 409 차단)

> #710 소급 Codex 대칭 재검 적발 HIGH(마감된 기간의 원분개가 취소/재게시 역분개로 오염 가능)의 fix. 집PC 야간 자율 세션에서 캐논 완주.

## 📌 개발책임자 결정 2건 (채팅 선택 UI → PR 기록)

1. **A안: 409 차단**(4877750770) — 원분개가 마감기간이면 취소/계정변경 재게시 차단, 정정=마감 해제 후. 확정/수정 409 와 대칭.
2. **세금계산서도 동일 차단**(4879355985) — 리뷰가 적발한 가드 파급(기존 "세금계산서는 마감이어도 역분개 허용" 문서화 예외의 조용한 철회)을 공식 승인. **D-E3-05(E3 S2 dev-report)의 "cancel 역분개는 기존 정책대로 허용" 문구는 본 결정으로 철회됨** — 원문은 이력 보존, 가드 Javadoc 각주와 본 절이 정정 기록.

## 구현

- `JournalService.autoReverse`(모든 자동 역분개 공통 진입점)+`reverse`(수동)에 원분개 journalDate 마감 가드 — "마감된 회계 기간의 분개는 역분개할 수 없습니다 — 해당 일자(…)는 마감 해제 후 다시 시도하세요"
- `CashReceiptService.cancel/updateConfirmed` 선검증(조기 409·상태 불변 보장) — TaxInvoice 는 autoReverse 내부 가드+트랜잭션 롤백으로 ISSUED/POSTED 보존(IT 실증)
- **FE 파급 동시 해소**: 가드가 여는 세금계산서 취소/발행 경로의 raw axios 메시지 노출(known-class H-02 계열) → **공용 `apiError.ts` 승격**(상세+편집 양 화면+accounting.ts 통합·RED/GREEN 테스트) — BE 한국어 409 안내가 전 경로 표출
- Swagger 409 어휘 6곳 "원분개 일자가 마감된 회계 기간" 통일(+update 대칭 정밀화)

## 라운드 체인 (실행=게시 1:1 — 총 게시 12)

①Codex 개발(RED 선확인) ②Opus full: **BE HIGH**(세금계산서 파급=결정문 밖 확장 적발→결정 질의) · **FE HIGH**(메시지 노출) · Design MED3 · QA 0(라이브 — **사전결함 적발: 월마감 실행 100% 실패 → 이슈 #720**) ③📌 결정(동일 차단) ④Opus fix(TaxInvoice IT 신설·메시지/Swagger·FE 추출) ⑤Codex full: **QA HIGH**(편집 화면 sweep 미완 — 동계열 3번째) ⑥Codex fix(apiError.ts 공용 승격) ⑦Opus full 재검2: blocking 0(QA **2-tab 결정적 경합**으로 409 한국어 표출 라이브 실증) ⑧Opus 정리 fix(승격 잔재 JSDoc·고아 타입 re-export·null 케이스 테스트) ⑨**Codex 재검3 전 차원 0 — 0수렴**

## 검증

- 모듈 전체 테스트 3회(각 push 전) 0 fail · targeted 141 · vitest 526→529 · IT: 마감 취소/PATCH 409+불변·해제 후 정상·TaxInvoice 왕복(flush/clear — IT 동일 tx 공유 대응, 프로덕션 무관)
- 라이브: 오픈 기간 역분개/취소 정상(무회귀)·409 한국어 메시지 상세+편집 실증(캡처 14장). 마감 409 라이브 재현은 **#720**(사전결함)으로 불가 — GREEN IT 대체(정직 disposition)

## 파생 이슈/백로그

- **#720** 월마감 실행 100% 실패(slip `/slips/lock-by-period` 가 internal prefix 밖 → 403→409) + 마감 FE 배너 raw 메시지 — 별도 fix PR
- 전 앱 로컬 extractErrorMessage 중복(8+ 파일) → apiError.ts 표준화 백로그 · FormPage 작성 모드 partnerId=사업자번호 기존 한계(QA 참고) · CashReceipt 경로 메시지 재포장=E3 S4

## 교훈

- **공통 진입점 가드는 호출자 전수 파급 분석이 선행** — autoReverse 가드가 결정문 밖(세금계산서)까지 조용히 확장될 뻔한 것을 리뷰가 적발, 결정으로 공식화. 무결성 preconfirm 은 구현 중 스코프 확장에도 적용.
- 게시 커밋 SHA 는 **사전 확정 문자열로만**(미확장 셸 치환 게시 재발 — 즉시 PATCH 자가 정정).

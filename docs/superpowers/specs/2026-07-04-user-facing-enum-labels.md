# 사용자 노출 메시지의 기술 enum 용어 한국어화 spec (이슈 #721)

> 2026-07-04 개발책임자 지시: "경고 문구에 'DRAFT 상태'라는 건 기술용어잖아. 사용자 입장에서 알아보기 힘들지." 발단 = #719 라이브 캡처의 "발행은 DRAFT 단계에서만 허용됩니다 (현재: ISSUED)".
> 정찰 실측(2026-07-04, main 기준): GlobalExceptionHandler 가 BusinessException.getMessage() 를 그대로 사용자 응답 body 로 노출 — 아래 지점 전부 실노출.

## 정책 (PM 확정 — 리뷰에서 정정 가능)

1. **사용자 메시지 = 한국어 라벨만**(enum 원어 병기 없음) — 지시 취지 그대로. 프로그램 계약(JSON status 필드·collab payload·로그)은 비대상(절대 불변).
2. **BE 상태 라벨 SSOT 신설**: 각 상태 enum 에 `displayName` 필드(생성자 주입)+`getDisplayName()` — FE 분산 라벨맵과 도메인별 정합(아래 표). BE 에 기존 SSOT 없음(순수 enum) — 정찰 확인.
3. **도메인별 canonical 라벨 = 기존 FE 화면 라벨 채택**(화면과 메시지 일치가 사용자 혼란 최소):

| enum | 라벨 |
|---|---|
| JournalStatus | DRAFT=임시저장 · POSTED=확정 · REVERSED=역분개 |
| TaxInvoiceStatus | DRAFT=임시저장 · ISSUED=발행 · CANCELLED=취소 |
| CashReceiptStatus | DRAFT=임시저장 · CONFIRMED=확정 · CANCELLED=취소 |
| AccountingPeriodStatus | OPEN=열림 · CLOSED=마감 |
| SlipPostingStatus(매출/매입 회계전표) | DRAFT=임시저장 · POSTED=반영완료 |
| MatchStatus(통장) | UNREFLECTED=미반영 · REFLECTED=반영 · FORCED=강제 — **#722 지시 반영: '회계반영'→'반영'** |
| TaxInvoiceDirection | OUTBOUND=매출(발행) · INBOUND=매입(수신) |

> 리뷰 판정으로 정정(PR #724 Opus 5-agent 리뷰, 2026-07-04): JournalStatus.DRAFT(작성중→임시저장) · AccountingPeriodStatus.OPEN(미마감→열림) · MatchStatus.FORCED(강제반영→강제) 3건 — 정책 3 "기존 FE 화면 라벨 채택" 기계 적용 결과이며, spec 초안이 FE 실물 미검증 상태로 작성되어 상충이 발생했다.

4. 메시지 문형: "…은(는) [라벨] 상태에서만 가능합니다 (현재: [라벨])" — 기존 문형 유지·토큰만 치환.

## 대상 (정찰 전수 — accounting-service)

**패턴 A** (`(현재: " + status + ")"` 인터폴레이션): AccountingPeriod 163/186 · CashReceipt 136/167/215 · Journal 177/192/214/244 · Purchase/SalesAccountingSlip 116/117 · TaxInvoice 441/469/496/540/576 · CashReceiptService 110 · TaxInvoiceEmitService 124 · Purchase/SalesAccountingSlipCreateAttemptService 81
**패턴 B** (enum 리터럴 하드코딩): TaxInvoice 435 · CashReceiptService 114/126/189 · TaxInvoiceBatchFromSalesSlips 141 · TaxInvoiceInbound 141 · TaxInvoiceService 351

**FE 동반**: 상태 라벨맵 중복/불일치 정리는 **비대상**(별도 — 이번엔 BE 메시지만. 단 BE 라벨과 FE 라벨이 다른 지점이 발견되면 FE 를 BE SSOT 값으로 정렬하는 최소 수정 허용). #722 의 '회계반영'→'반영' 은 MatchStatus 라벨로 이번에 BE 확정 — FE BANK_MATCH_STATUS_LABEL 도 '반영' 으로 동기(1줄, 화면 라벨이 곧 지시 대상).

**타 서비스**(slip 배차 IllegalState 11곳·partner-order 등): 스코프 밖 — 후속 이슈(동일 패턴 확산은 이번 SSOT 선례 확립 후).

## 함정

1. 기존 테스트 문자열 단언 동기화(JournalServiceTest "마감된 회계 기간…" 등 — grep 전수)
2. #719 가드 메시지("마감된 회계 기간의 분개는…")는 이미 한국어 — 비대상(회귀 금지)
3. IllegalArgumentException(GlobalExceptionHandler 47행) 경로도 노출 — BusinessException 외 도메인 require* 계열의 enum 노출도 같은 규칙
4. Swagger @ApiResponses 는 개발자 문서 — enum 원어 유지 허용(사용자 비노출)
5. CashReceipt.java:215 는 가변 message 인자+status 접미 — 시그니처 유지하며 라벨 치환

## 검증

- 단위/IT 문자열 단언 전수 동기화 · 모듈 전체 테스트
- 라이브: 대표 3경로(세금계산서 발행 실패·분개 역분개 불가·입금보고서 취소 불가) GUI 배너에서 enum 원어 부재 실증 캡처

## 이후

브랜치 fix/user-facing-enum-labels → 조기 OPEN PR → Codex 개발 → 순차 듀얼 캐논 → 머지. #722(계좌/카드 관리+필터 모달)는 별도 슬라이스.

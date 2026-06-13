# 전표/주문번호 표준 = 슬래시 `YYYY/MM/DD-{번호}` (전 영역 통일)

2026-05-31 개발책임자 정정 (D2 #334 회고).

**규칙**: 모든 영역의 전표·주문번호는 **슬래시 포맷 `YYYY/MM/DD-{번호}`** (예: `2026/05/31-8`) 로 통일한다. 화면 표시·DB 저장·API 요청 본문 전부 슬래시. BE 채번은 `DateTimeFormatter.ofPattern("yyyy/MM/dd")`.

**Why**: 회계·전표 식별자 일관성. 개발책임자가 "모든 영역의 전표번호는 YYYY/MM/DD-{전표번호} 통일하기로 했잖아" 로 명시 정정. 슬래시를 하이픈으로 "정규화/변환"한다고 표현하거나 표준 자체를 바꾸면 안 됨.

**How to apply**:
- 슬래시 포맷을 honor. 번호를 하이픈으로 치환하는 것은 **오직 URL 경로 세그먼트 한정** (게이트웨이/Spring StrictHttpFirewall 가 경로의 인코딩 슬래시 `%2F` 를 차단하기 때문).
- URL 경로 변환은 공용 `clients/desktop/src/renderer/utils/orderNo.ts` 의 **`toOrderPathId(슬래시→하이픈)`** 단일 헬퍼 사용 (목록 페이지·병합 모달 공유). 새 호출부 추가 시 별도 변환 함수 만들지 말고 이걸 재사용.
- BE `PartnerOrderIdResolver.findByIdentifier` 가 하이픈/슬래시 모두 처리(하이픈→`toSlashOrderNo` 역변환)하므로 경로 하이픈은 안전. API **본문(body)** 에는 슬래시 그대로 전송(경로 아님 → `%2F` 무관).
- ⚠️ 게이트웨이 `%2F` 차단은 mock/Playwright(게이트웨이 미경유)가 못 잡음 → 경로 파라미터에 번호 쓰는 신규 화면은 Docker 실 QA 필수([[feedback_no_fake_data_ever]]). D2 FE-BUG-1(병합 모달이 슬래시 주문번호를 그대로 경로에 → 400)이 실 QA에서만 검출됨.

**회계 문서 전면 적용 (2026-06-13, §7 슬라이스1 PR #475)**: 개발책임자 "슬래 모두 표준화" — 회계 문서 번호도 전부 `yyyy/MM/dd-{번호}`. 분개(JournalNumberService)·세금계산서(TaxInvoiceNumberService)·매출/매입전표(Sales/PurchaseAccountingSlipNumberGenerator, `SAS-`/`PAS-` prefix 제거) 생성기 통일. 회계 문서는 UUID 라우팅(상세 URL=UUID)이라 게이트웨이 `%2F` 이슈 없음(번호=표시/저장 전용). 표준 기준 = `SlipNumberService`(`yyyy/MM/dd`+seq).

**시드/마이그레이션 2대 함정 (PR #475 회고)**:
1. **기존 Flyway 마이그레이션 내용 수정 금지** — 적용된 마이그(V2/V6/..) seed 값 직접 변경 시 체크섬 불일치 → 기존 DB validate 실패(부팅 불가). accounting-service validate-on-migrate 기본 true. seed 값 변경은 **신규 forward 마이그(V37)에서 명시 per-row UPDATE**. ([[feedback_migration_fresh_postgres_probe]] 연장: fresh DB만 통과하는 false-safety 주의 — 기존 dev DB 재부팅으로도 검증)
2. **결정적 시드 UUID 를 비즈니스번호에서 파생 금지** — JournalSeeder 가 `deterministicId("journal", journalNo)` 로 UUID 도출 → journalNo 형식 변경 시 UUID 전부 변동 → 멱등 깨짐(재기동 시 중복 50건 실측). **UUID 는 형식 독립 안정키(seq 등)로 도출**. 형식 변경 후 dev DB 클린 리셋(스키마 drop+재시드)로 중복 제거.

관련: [[project_order_slip_conversion]], [[feedback_no_fake_data_ever]], [[project_local_stack_qa_gotchas]], [[feedback_migration_fresh_postgres_probe]], [[project_global_collab_epic]].

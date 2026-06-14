# §7 그룹웨어 결재 첨부 — 통합 문서 참조 (유형 선택 + 번호/키워드 자동완성)

> PR #480 통합. 개발책임자 2026-06-14 실시간 설계(채팅 누적). 기존 첨부(SLIP_REF/PARTNER_LEDGER_REF/FILE)를 **통합 문서 참조**로 일반화.

## 개발책임자 확정 설계
- 결재 첨부 시 **참조 유형을 한국어로 먼저 선택** → 유형별 **번호(`YYYY/MM/DD-{번호}`) 또는 키워드(거래처명 등)로 자동완성** → 선택 → 실 문서 참조 첨부(클릭 시 원본 이동, 실시간).
- **유형 목록(구체 명시 — 회계문서도 분개장/세금계산서/거래명세서 등 개별)**:
  | 유형 | 소스 서비스 | 번호 | 검색 키 |
  |---|---|---|---|
  | 출고전표 | slip-service (OUTBOUND) | slipNo YYYY/MM/DD-N | slipNo · 거래처명 |
  | 입고전표 | slip-service (INBOUND) | slipNo | slipNo · 거래처명 |
  | 분개장(회계전표) | accounting-service Journal | journalNo YYYY/MM/DD-N | journalNo · 적요 |
  | 세금계산서 | accounting-service TaxInvoice | 번호 | 번호 · 거래처명 |
  | 거래명세서 | accounting-service Statement | 번호 | 번호 · 거래처명 |
  | 거래처원장 | accounting-service Ledger | (번호 아님) | 거래처명/코드 + 기간(월) |
  | 파일 | MinIO | — | 업로드 |
- 회계문서도 "회계문서" 통칭 금지 — **분개장/세금계산서/거래명세서** 개별 유형으로.

## 데이터 모델 (groupware) — 일반화
- `ApprovalAttachmentType`: `FILE` 유지 + 참조는 **`DOCUMENT_REF` 단일**(또는 기존 SLIP_REF/PARTNER_LEDGER_REF 보존 + 신규 JOURNAL_REF/TAX_INVOICE_REF/STATEMENT_REF). **권장: 일반화** — `refDocType` enum(OUTBOUND_SLIP/INBOUND_SLIP/JOURNAL/TAX_INVOICE/STATEMENT/PARTNER_LEDGER) 컬럼 도입.
- `ApprovalAttachment` 참조 컬럼: `refDocType`(enum) + `refDocNo`(YYYY/MM/DD-N, ledger 는 null) + `refDocLabel`(거래처명/적요 요약) + `refPartnerCode`/`refPartnerName`/`refPeriod`(ledger). 기존 refSlipNo/refSlipType 은 refDocNo/refDocType 으로 흡수(또는 호환 유지).
- **마이그 V6**(groupware, V5 미머지지만 라이브 적용됨 → forward V6): refDocType 컬럼 + CHECK 확장. 기존 SLIP_REF/PARTNER_LEDGER_REF row 백필(refDocType 매핑). [[enum-expansion-check-constraint]] [[migration-fresh-postgres-probe]].

## 검색 엔드포인트 (각 서비스, 게이트웨이 노출 /admin)
- slip-service `/admin/slips/search?q=&slipType=&limit=` — **구현됨**(slipNo OR partnerName, OUTBOUND/INBOUND). 유지.
- accounting-service 신규:
  - `/admin/accounting/journals/search?q=&limit=` — journalNo OR description LIKE, 최근순. {journalNo, journalDate, description, totalAmount}.
  - `/admin/accounting/tax-invoices/search?q=&limit=` — 번호 OR 거래처명. {번호, date, partnerName, amount}.
  - `/admin/accounting/statements/search?q=&limit=` — 번호 OR 거래처명. {번호, date, partnerName, amount}.
  - `/admin/accounting/ledgers/partners/search?q=&limit=` — 거래처명/코드 LIKE(거래처원장은 거래처+기간 참조). {partnerCode, partnerName}.
  - 권한: 각 문서 조회 page-code VIEW 재사용(accounting.journals/tax-invoice.list/partner-ledger 등). 게이트웨이 /admin/accounting/** 라우트 확인/추가. UUID 비공개.

## 다중 첨부 (개발책임자 2026-06-14)
- **문서 참조 N개 + 파일 N개를 동적으로 추가/삭제**. "문서 참조 추가" 클릭 → 행(유형 select + 검색 picker) 누적, 각 행 삭제 가능. 파일도 다중 선택 + 행별 삭제. (CreatePage references[]/files[] 이미 배열 — 통합 picker 도 다중 행 유지. DetailPage 는 행 추가 시마다 첨부 누적.)

## FE (desktop) — 통합 picker
- `components/groupware/DocumentReferencePicker.tsx`(신규, SlipReferencePicker 대체/흡수): **유형 Select(한국어 6종)** → 유형별 검색 입력(번호/키워드 debounce) → 드롭다운(번호·거래처/요약·금액·날짜) → 선택 시 refDocType/refDocNo/refDocLabel/(partner/period) 세팅. 거래처원장은 거래처 선택 + 기간(월) 입력.
- CreatePage/DetailPage: 기존 "전표 참조" + "거래처원장 참조" 2버튼 → **단일 "문서 참조 추가"** + DocumentReferencePicker. 파일 업로드는 별도 유지.
- 상세 첨부 렌더: refDocType 별 한국어 라벨 + 번호 + 클릭 시 유형별 원본 경로 이동.
- api: documentReferenceSearch.ts(유형별 검색 디스패치) + groupwareApprovalAttachment.ts(refDocType 반영). mock 6유형 핸들러.

## 검증
- BE: groupware 첨부 IT(refDocType 6종) + 각 accounting search 단위/IT. 마이그 V6 fresh-postgres probe.
- 실 QA: 유형별(출고전표/분개장/세금계산서/거래명세서/거래처원장) 번호·키워드 자동완성 → 선택 → 첨부 → 상세 링크. dev_master, 합성 0.

## 단계 (Codex)
1. accounting-service 4 검색 엔드포인트(분개/세금계산서/거래명세서/거래처 partner) + 게이트웨이 라우트.
2. groupware 첨부 모델 일반화(refDocType) + V6 + service/controller/DTO.
3. FE DocumentReferencePicker(6유형) + Create/Detail 통합 + api + mock.
4. IT + 실 QA.

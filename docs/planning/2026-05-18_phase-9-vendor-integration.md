# Phase 9 vendor 연동 시리즈 (master plan)

> 작성: 2026-05-18 PM
> 기준 main: `054faa52` (PR #235 SP-08-9 시리즈 종료 후)
> 직전 시리즈: SP-08 legacy GAS DB/API parity 완전 종료 (16 PR)

## 1. 시리즈 범위

SP-08-6-6 옵션 A 결정 후속 — vendor 실연동 단계:
- **NTS e-tax (홈택스)** — 세금계산서 실 발행/수신/상태 동기화
- **Aligo SMS** — 알림 실 발송 (현재 dryRun mock)
- **OCR vendor** — 매입 영수증 (Naver Clova 또는 동등)
- **오픈뱅킹 (KFTC)** — 입금 매칭 + 자동 분개 (Phase 10)

각 vendor: **endpoint shell + mock client + IT** + **실 sandbox 운영 PC `.env`** 분리. 실 키 commit 금지.

## 2. Sub-task

### SP-09-1 — NTS e-tax 세금계산서 실 발행 shell
- BE: `ETaxClient` 신규 + `TaxInvoice.linkETaxExternalId()` 활성 + POST `/{id}/emit-nts`
- IT: mock 발행/실패/타임아웃 + @MockBean
- FE: TaxInvoiceDetailPage "NTS 발행" CTA

### SP-09-2 — Aligo SMS 실 발송
- BE: AligoClient dryRun → 실 발송 + send_audit

### SP-09-3 — OCR 영수증
- BE: ReceiptOcrClient + upload + parse + 매입 자동 생성

### SP-09-4 — 오픈뱅킹 (KFTC) — Phase 10
- accounting-service 연동

### SP-09-5 — 통합 검증

## 3. 패턴

- @MockBean 외부 client 격리
- placeholder + `.env.ops` 분리
- dryRun mock + 실 sandbox
- 5회차 + 사용자 6/7회차

**tech-manager — 2026-05-18**

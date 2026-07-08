# #771 역분개 저널 → 입금보고서 딥링크 소실 — Journal cash_receipt_id 전용 링크 (dev-report)

- **PR**: #772 (`feat/e3-link-journal-cash-receipt`)
- **연관 Issue**: #771
- **일자**: 2026-07-08
- **운영 모드**: 정찰·구현·5-agent 리뷰·라이브 QA = Sonnet 5, PM 판단·STEP4 독립 적대검증 = Opus.

## 1. 문제
역분개(autoReverse) 저널 상세에서 "입금보고서 보기" 딥링크 버튼이 사라짐. 편집(updateConfirmed) 후 superseded 원분개에서도 동일.

## 2. 근본원인
`journals.source_ref_id` **과부하**: 원분개 게시 시 CashReceipt UUID를 담지만, `JournalService.autoReverse`가 역분개 생성 시 `Journal.create(..., original.getId())`로 **원분개 UUID로 덮어씀**. → 역분개의 CashReceipt 링크 소실 → `resolveCashReceiptSlipNo(sourceRefId)`가 CashReceipt 미발견 → null → FE 딥링크 게이트(`cashReceiptId && cashReceiptSlipNo`) 소멸. FE `normalizeJournal`의 sourceRefId fallback은 역분개에서 원분개 UUID를 CashReceipt로 라우팅하는 latent 오링크(단 slipNo=null AND-gate로 실제 미렌더였음).

## 3. fix
- **V56 마이그**: `journals.cash_receipt_id` UUID nullable + 부분 인덱스 + **기존 데이터 backfill(3-pass 단일컬럼)**:
  1. `cash_receipts.journal_id` — 현 원분개 + MIG-9(source_ref_id 비는 배치).
  2. `source_ref_id` 불변 — updateConfirmed 재게시로 cash_receipts.journal_id가 덮여 놓친 **superseded/orphaned 원분개** 전수.
  3. 역분개는 원분개 cash_receipt_id 승계 — **orphaned 역분개까지 전수**.
- **Journal**: `cashReceiptId` 필드 + `linkCashReceipt(UUID)`(linkReversal 미러, create() 불변).
- **JournalService**: postAutoJournal(CASH_RECEIPT 링크)·autoReverse(원분개 값 승계, non-CR은 null)·resolveCashReceiptSlipNo(cashReceiptId 기준)·toDetailResponse.
- **Mig9CashJournalService.insertJournal**: CASH_RECEIPT 배치에 `cash_receipt_id=row.id()` 설정(CASH_DISBURSEMENT은 null 가드 — 오배선 방지).
- **JournalDetailResponse**: cashReceiptId 노출. **FE accounting.ts**: sourceRefId fallback 제거(오링크 landmine 제거). JournalDetailPage 무변경.

## 4. 리뷰 (캐논)
Sonnet 5 5-agent → **BE P1**(backfill이 cash_receipts 현재 저널만 도달 → 편집체인 orphan 원/역분개 놓침 + resolveCashReceiptSlipNo가 sourceRefId→cashReceiptId 전환돼 **superseded 원분개 딥링크 회귀**) + **QA P1×2**(MIG-9 갭·backfill 무테스트) + **DevOps P1×2**(OR-join perf·무테스트). Opus STEP4가 놓친 실제 회귀를 리뷰가 포착 → fix 라운드(3-pass·MIG-9 가드·backfill IT) → **Opus STEP4 0수렴**. #744(`docs/dev-reports/2026-07-05-3-journal-cashreceipt-link.md`, "sourceRefId 재사용 유지") **supersede**(당시 역분개 갭 미인지).

## 5. 검증 (genuine)
- accounting compile OK, JournalServiceTest 11·CashReceiptControllerIT 24·**JournalCashReceiptIdBackfillIT 1**(편집체인 6저널 orphan 복원 실증)·Mig9 23·**전체 스위트 1172/1172**(0 fail, `--rerun-tasks --no-build-cache`). desktop typecheck 0 신규, vitest 26.
- **라이브 QA(실 dev accounting_db에 V56 적용)**: CASH_RECEIPT 저널 **370/370 backfilled, still_null=0**. 편집체인 CANCELLED 영수증(slip 2026/07/03-1)의 **4개 저널 전부**(REVERSED 원분개 포함) cash_receipt_id match=true — 구 OR-join이 놓쳤을 orphan 복원 실증. 역분개(2026/07/03-2) API `cashReceiptId(89cffe91)≠sourceRefId(원분개 id)`·slipNo 노출 → 딥링크 복원. 실 GUI 스샷 `docs/qa/771-journal-cashreceipt-deeplink/`.

## 6. 📌 개발책임자 결정
- 결정 A(전용 cash_receipt_id 컬럼) 채택. PR #744 "sourceRefId 재사용" supersede(역분개 이중용도 불가 실증).

## 7. ⚠️ 배포 노트
accounting-service jar 재빌드 → Flyway가 부팅 시 V56 적용(backfill 자동). prod 이미지 재빌드/푸시 수동. V56 backfill은 단일컬럼 3-pass·idempotent라 대규모 journals에도 안전(cash_receipts는 MIG-only 저볼륨).

## 8. 백로그
- V56 backfill 무자동커버리지는 JournalCashReceiptIdBackfillIT(jdbcTemplate로 SQL 재실행)로 해소했으나, 향후 마이그 backfill도 동일 패턴 권장.
- DevOps P2: cash_receipts.journal_id/reverse_journal_id UNIQUE 부재(3-pass 설계가 회피, 잔여 방어는 optional).

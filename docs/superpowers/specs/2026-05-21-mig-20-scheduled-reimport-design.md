# MIG-20 이카운트 raw 자동 재import 스케줄 — Design Spec

> 작성일: 2026-05-21
> branch: `spec/2026-05-21-mig-20-scheduled-reimport`

## 개요

MIG-19 머지 후 PM 자율 연속 — **H 자동 재import 스케줄** (BE 작은 슬라이스).

- baseline: MIG-1~19 머지
- 옵션 C 21단계 + Codex 전체 권한

## 분리 전략

Spring `@Scheduled` 대신 **수동 trigger admin endpoint + 외부 cron 등록 가이드** — 운영 친화 (실행 시점/주기 운영자 결정).

## 산출

### accounting-service
- `POST /admin/ecount/reimport/{slice}` endpoint (MASTER 권한 + `@RequirePermission(EDIT)`)
- slice 파라미터: `mig-1` ~ `mig-11`
- 기존 MIG-N importer 재호출 wrapper (각 slice 별 raw 파일 디렉토리 monitoring)
- `EcountReimportService` 신규 — file system 감지 + 멱등 (source_file_hash SHA-256 기존 검증)
- 응답: `EcountReimportResult` (filesProcessed/skipped/imported/rejected)

### 운영자 가이드
- `docs/migration/ECOUNT-CUTOVER-GUIDE.md` §7 추가 (자동 재import 절차)
- Linux crontab 예시 (매월 1일 02:00 KST 실행)
- Windows Task Scheduler 예시
- 실패 시 notification-service Slack/email alert

## 결정 (D-MIG-20-XX)

- D-MIG-20-01 수동 trigger endpoint + 외부 cron (Spring @Scheduled 폐기)
- D-MIG-20-02 단일 endpoint 11 slice 모두 지원
- D-MIG-20-03 MASTER + `@RequirePermission(EDIT)` 양쪽 가드
- D-MIG-20-04 raw 파일 디렉토리 monitoring (`docs/migration/ecount-data/raw/`)
- D-MIG-20-05 멱등 (source_file_hash 기존 검증)
- D-MIG-20-06 옵션 C 21단계 + Codex 전체 권한

🤖 PM Claude — 2026-05-21

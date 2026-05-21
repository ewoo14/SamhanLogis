# MIG-19 이카운트 cutover 가이드 — Design Spec

> 작성일: 2026-05-21
> branch: `spec/2026-05-21-mig-19-cutover-guide`

## 개요

MIG-18 머지 후 PM 자율 연속 — **J cutover 가이드** (docs only).

- baseline: MIG-1~18 머지
- 옵션 C 21단계 + Codex 전체 권한 ([feedback_codex_plugin_setup])

## 산출

`docs/migration/ECOUNT-CUTOVER-GUIDE.md`:
1. 사전 준비 (raw 다운로드, 백업, 비밀번호 발급)
2. 단계별 절차 (마스터 → 트랜잭션 → 검증)
3. 운영자 트레이닝 (admin UI 4 화면 사용법)
4. 롤백 절차 (반려 시 처리)
5. 사후 검증 (DailyClosing 대조 + sample 5건 cross-check)
6. FAQ + 트러블슈팅

## 결정 (D-MIG-19-XX)

- D-MIG-19-01 운영자 대상 (개발자 X) — 한국어, 비전문 용어
- D-MIG-19-02 admin UI 캡처 활용 (MIG-14 의 docs/qa/mig-14-admin-ui/screenshots/)
- D-MIG-19-03 롤백 절차 명시 (soft-delete 복구 + journal_no 충돌 회피)
- D-MIG-19-04 옵션 C 21단계 + Codex 전체 권한

🤖 PM Claude — 2026-05-21

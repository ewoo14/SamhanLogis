# V5 dev 계정 해시 교정 (V49) — 실행 계획

> 2026-06-07 PM 계획. PR #421 잔여 후속 — dev 계정 계열 PM 자율.

## 1. 배경
V5 seed 9계정의 공통 해시 `$2a$12$6cxHjNrguvlnEE...` 는 문서된 평문 "${QA_DEV_DEFAULT_PASSWORD}" 와 **불일치** (#411 QA `bcrypt.checkpw=False` 실증, `docs/qa/permission-groups-phase-c-fullstack/real-qa-evidence.md:38`). 이후 실QA 마다 psql 수동 UPDATE 로 우회 — 재기동/재시드 시 재발. #421(V48)은 검증 해시 `$2b$12$g9/AnrEr4...` 로 비전파 완료, **V5 기존 계정은 잔존**.

## 2. 작업 범위
1. **V49__repair_v5_dev_account_hashes.sql** (auth-service): V5 의 9계정(login_id `dev_master`~`dev_disabled`) `password_hash` 를 #411/#421 검증 해시로 UPDATE. WHERE 는 V5 고정 id 목록 + 기존 결함 해시 일치 조건(이중 가드 — 운영자가 수동 변경한 비번 보호). password_change_required 등 다른 컬럼 불변(정책 비변경). 한국어 주석: 결함 출처/검증 근거/idempotent.
2. **회귀 IT**: AuthFlywayV48SeedIT 패턴 — dev_sales(비-MASTER 대표) 실 로그인 200 단언 추가 (V49 적용 검증). 기존 V48 IT 와 중복 최소화.
3. QA Docker: dev_sales/dev_master "${QA_DEV_DEFAULT_PASSWORD}" 실 로그인 200 (psql 우회 없이) 실측.
4. 문서: dev-report 간략 + CURRENT-WORK.

## 3. 비범위
- password_change_required 정책 변경 (V5 TRUE 유지 — AuthService.login 미분기로 무영향).
- dev seed Flyway location 분리 (Phase 11 정책).

## 4. 워크플로우
조기 PR → Codex 구현(백그라운드 표준) → dual review → QA Docker → CI → PM 종합 → 자율 머지.

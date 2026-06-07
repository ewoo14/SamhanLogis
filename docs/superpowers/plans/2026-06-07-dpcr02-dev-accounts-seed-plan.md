# D-PCR-02 — 무권한 역할 dev 계정 seed 추가 실행 계획

> 2026-06-07 PM 계획. PR #420 QA 잔여 D-PCR-02(P2) 해소 슬라이스. 권한 계열 = PM 전권 자율.

## 1. 배경
PR #420 QA Docker 에서 products.list VIEW=FALSE 역할(기사/사원)의 dev 계정이 V5 seed 에 없어 403 deny 실증을 psql 임시 revoke 로 우회. 403 실QA 상시화를 위해 무권한 역할 dev 계정 seed 추가.

## 2. 정찰 확정 사실 (Explore, file:line 은 정찰 보고 참조)
- auth-service 최신 = V47. V5 dev 계정 9종 — DRIVER/STAFF/DISPATCH 부재.
- DRIVER(빌트인 107)/STAFF(108): V32 에서 products.list can_view=FALSE → V43 group_page_permissions 전파 — **403 실증 적합 확정**.
- V46 에서 accounts.role DROP → 신규 INSERT 는 role 컬럼 없이 (V5 패턴과 차이).
- V5 bcrypt 해시 일관(결함 미존재), password_change_required=TRUE 정책.
- 계정-그룹 배속 = account_groups (V44 패턴) + account_page_permissions materialize (V47 패턴).

## 3. 작업 범위
1. **V48__seed_driver_staff_dispatch_dev_accounts.sql** (auth-service):
   - accounts 3건: dev_driver(기사)/dev_staff(사원)/dev_dispatch(배차담당) — V5 동일 해시, password_change_required 는 **dev 실QA 즉시 로그인 가능해야 하므로 FALSE** (V5 의 TRUE 가 실QA 차단 이력 — #411 QA 부수 정비 참조), UUID b0000000-... 대역, ON CONFLICT idempotent.
   - account_groups 배속: 107/108/106 빌트인.
   - account_page_permissions materialize: V47 BOOL_OR 패턴.
2. 회귀 IT: 로그인 가능 + products.list deny(403) 계약 (기존 auth IT 패턴 내 최소).
3. QA Docker: dev_driver 실 로그인 → GET /api/v1/products 403 + categories 403 실측 (psql 우회 없이) — #420 T2/T7b 정식 재실증.
4. 문서: dev-report + CURRENT-WORK. (운영 가드: dev seed profile 분리는 본 슬라이스 비범위 — 기존 V5 와 동일 정책 유지, 후속 후보 기록)

## 4. 워크플로우
조기 PR → Codex 구현 → dual review → QA Docker 실QA → CI green → PM 종합 → 자율 머지.

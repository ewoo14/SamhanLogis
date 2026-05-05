# Phase 5 — Discussion Round 1 (도메인 경계 / 인증 perspective)

> **참여 perspective**: Plan agent POV (이번 라운드 driver) + 분석 agent POV + Reviewer agent POV (3-perspective 시뮬레이션)
> **입력**: `04-migration-plan.md` §11 Discussion 입력 15건 중 #1/#7/#10 + Phase 3 §9 #5/#12/#13 + cross-review §8.2 partner 도메인 분할 + DECISIONS Phase 2 (이카운트/Notion 폐기) + DOMAIN-EXTENSIONS §3
> **처리 주제**: D1~D6 (도메인/서비스 분할 + 인증 + EmployeeMaster + Slip listener 책임)
> **단일 산출 파일** — 다른 파일 수정/생성 금지
> 작성일: 2026-05-05 / 한국어 / 추측 금지 / 출처 (파일:라인) 명시 의무

---

## §0 라운드 메타

| 항목 | 값 |
|---|---|
| 라운드 번호 | 1 / 3 |
| 주 perspective | Plan agent (driver) — 분석 agent 산출의 모호 항목을 Plan 결정 측면에서 challenge |
| 보조 perspective | 분석 agent (Phase 1 출처 인용) + Reviewer (Phase 2 모순/누락 catch) |
| 처리 항목 | D1~D6 (6건) |
| 후속 입력 | 라운드 2 (D7~D13 데이터/시드 perspective) |
| 회고 가드 적용 | `feedback_pm_integration_build_check.md` Layer 4 (도메인 메서드 의미 정렬) / `feedback_role_naming_full.md` (BACKEND/FRONTEND/DESIGN/QA/DEVOPS 풀네임) / `feedback_uuid_no_user_visibility.md` |

---

## §1. D1 — partner-service 단일 vs PartnerAuth 별도 service 분리

### 분석 agent POV (모호 / 근거)

- `02-cross-review.md:215-218` (§6.1): "두 인증 시스템은 **완전 분리**" — 직원 (Google OAuth, NOTION_AUTH_001) vs 거래처 (사업자번호+PW, NOTION_AUTH_008). 인증 방식/DB/토큰이 모두 다름.
- `02-cross-review.md:280-292` (§8.2): partner 도메인이 3 분석문서 모두에서 영향받음 → "partner-service 확장 / partner-order-service 신규 / slip-service 확장" 3-way 분할 권장.
- `01-script-analysis-partner-order.md:564` (cross-review §1.2 카운트): partner-order Code.js 87 함수 중 PartnerAuth 관련 함수 (queryAuthDb_/createAuthRow_/updateAuthPage_/checkAuthStatus/tryLogin/setAuthPassword 등 ~10 함수) 가 partner-order 안에 인라인 — 별도 service 분리 시 cross-domain Feign 호출 부담.

### Plan agent POV (Plan 결정 + 사유)

- `04-migration-plan.md:25-30` (§1.2 신규/확장 service 목록): **partner-service 확장 (M2)** 으로 PartnerAuth 흡수 결정. PartnerAuth 별도 service 미선택.
- `04-migration-plan.md:331-358` (§2.2.2): PartnerAuth entity 가 PartnerMaster 1:1 FK + status enum 10종 + 5 PW history + tutorial flag 등 — PartnerMaster 와 강결합.
- 사유:
  1. partner-service 가 이미 PartnerMaster 마스터 보유 — Auth 가 1:1 FK 로 강결합되어 별도 DB/service 분리 시 N+1 query / cross-DB transaction 부담.
  2. `04-migration-plan.md:30` 의 LongPendingScheduler (M5) 도 partner-service sub-domain 으로 흡수 — Auth status 와 직접 연동 (`LONG_PENDING_NO_ORDER` enum).
  3. MSA 14 service 원칙에서 service 추가는 운영 비용 — 도메인 강결합 sub-domain 은 단일 service 안에서 package 분리 (`com.samhan.partner.master` / `com.samhan.partner.auth` / `com.samhan.partner.longpending`).

### Reviewer POV (cross-review 발견 / 모순 / 누락 catch)

- `02-cross-review.md:213-218` 가 "완전 분리" 라고 명시했으나 이는 **직원 vs 거래처 인증 시스템 분리** 를 의미. 즉 거래처 인증 자체를 별도 service 로 분리하라는 권장은 아님. Plan 의 "partner-service 흡수" 와 cross-review 권장 일치.
- 누락 catch: `04-migration-plan.md:1190` (§11 Discussion #10) "estimate-service vs partner-order-service 도메인 경계 — 양 service 가 ProductMaster/PartnerMaster client 로 동일 호출" — partner-order-service 가 partner-service 의 PartnerAuth 를 Feign 호출할 때 latency 영향. partner-order 의 사업자번호 진입 시 매번 Feign 호출되므로 PartnerAuth 응답 캐싱 정책 별도 결정 의무.
- 모순 없음 — Plan 결정 cross-review 권장 일치.

### 합의 (또는 사용자 확정 필요)

| 결정 | 합의안 | 사유 |
|---|---|---|
| **D1 합의** | **partner-service 단일 service + Auth/LongPending sub-domain (package 분리)** | Plan §1.2 그대로. cross-review §8.2 권장과 일치. |
| **추가 결정 의무** | partner-order-service → partner-service `POST /partners/{id}/auth/check` Feign 호출 캐싱 정책 (TTL 30s 권장) | Plan §11 #10 명시적 결정 필요 — 라운드 3 D17 와 연계 검토 |

→ **사용자 확정 불필요** (Plan 결정 + cross-review + 분석 모두 합치). 단 Feign 캐싱 TTL 은 라운드 3 에서 재검토.

---

## §2. D2 — PartnerAuth PW 정책 (SHA-256 → BCrypt 업그레이드 vs SHA-256 보존)

### 분석 agent POV (모호 / 근거)

- `01-script-analysis-partner-order.md` §5/§7 (Code.js `queryAuthDb_`/`tryLogin` 부근): 현 Apps Script 는 **SHA-256** + 5 history (이미 SHA-256 자체도 자동 마이그 패턴 보유). 평문 PW → SHA-256 변환 자동화는 첫 로그인 시점에 진행되는 lazy 패턴.
- `02-cross-review.md:215-216` (§6.1): "사업자번호 + 4자리 PW (SHA-256, 5 history, 3-fail LOCKED)" 명시.
- `04-migration-plan.md:48` (R3 위험): "거래처 6924 row PW 처리 / LOCKED/LONG_UNUSED 거래처 대량 발생 위험".

### Plan agent POV (Plan 결정 + 사유)

- `04-migration-plan.md:337` (§2.2.2): `passwordHash varchar(255)` + 주석 "BCrypt (Phase 5 Discussion §11 #1 — SHA-256 → BCrypt 업그레이드 권장)".
- `04-migration-plan.md:359` (§2.2.2 후속): "신규 거래처는 BCrypt 직접 시작. 기존 6924 row → SHA-256 → BCrypt re-hash 시점 (운영 전환 후 첫 로그인 시 자동 업그레이드 vs 사전 일괄 강제) **사용자 확정 필요**".
- `04-migration-plan.md:1181` (§11 #1): Phase 5 Discussion 입력 #1 으로 명시 — "(a) 신규 거래처 BCrypt 직접 (b) 기존 6924 row SHA-256 → BCrypt 자동 마이그 시점 = 첫 로그인 시 vs 사전 일괄?".
- 사유 (Plan): BCrypt = 업계 표준 (Spring Security default). 4자리 PW 의 brute-force 저항성 자체는 BCrypt 도 SHA-256 도 약함 (4자리 = 10000 조합) — 실질적 보안은 3-fail LOCKED 가드. BCrypt 채택은 미래 PW 정책 강화 (90일 만료 / 8자리 등) 시 산업 표준 충족 목적.

### Reviewer POV (cross-review 발견)

- `02-cross-review.md:317` (§9.1 #3): 거래처 시트 `그룹` 컬럼 활용 정책 — 별도 항목 (D3 처리). PW 와 무관.
- 누락 catch: Plan §2.2.2 가 `passwordHash varchar(255)` 로만 표기 → BCrypt 전용 길이 (60자) 가 아닌 generic — **알고리즘 식별 prefix** (`{bcrypt}` Spring Security 표준) 보존 필요. PasswordEncoderFactories 활용 시 `{bcrypt}$2a$10$...` / `{sha256}...` 동시 보유 가능 → lazy 마이그 패턴 자연스러움.
- R3 (Plan §1.4) 의 영향 범위 = "수익 직격 아님, 운영 단절 위험" — sample 30 거래처 사전 검증 필수.

### 합의 (또는 사용자 확정 필요)

| 옵션 | 장점 | 단점 |
|---|---|---|
| (a) 첫 로그인 시 lazy upgrade | 거래처 행동 변경 없음 / 점진적 / SHA-256 동시 검증 가능 | 영구히 SHA-256 row 잔존 가능 (오랜 미접속 거래처) → 보안 surface 감소 안 됨 |
| (b) 사전 일괄 + temp PW 발송 | 100% BCrypt 통일 / 보안 강화 즉시 | 6924 거래처 전체 PW reset → 콜센터 부담 / 거래처 클레임 위험 |
| (c) **혼합 — lazy 6개월 후 잔존 row 일괄 reset** (Reviewer 추가 제안) | 양쪽 장점 결합 / 사용자 충격 분산 | 6개월 운영 부담 |

**권장 (Plan + Reviewer 합의)**: **옵션 (a) lazy upgrade + Spring Security `DelegatingPasswordEncoder` (`{bcrypt}` / `{sha256}` prefix 자동 분기) + `passwordHash varchar(255)` 유지** + 6개월 후 잔존 SHA-256 row 카운트 보고 → 사용자 추가 결정.

→ **사용자 확정 필요 (G9 신규 게이트)**: 옵션 (a) / (b) / (c) 중 선택. 라운드 3 종합 매트릭스 등재.

---

## §3. D3 — 거래처 시트 그룹 컬럼 14 distinct → 3 enum 매핑 표 (G5 후속)

### 분석 agent POV (모호 / 근거)

- `03-sheet-schema.md:445-451` (§2.20): 그룹 distinct 분포 — SF(밴더) 2935 / 빈 2800 / 일반업체 833 / 파트너사 118 / 조달업체 111 / 기타 124. 14 distinct values 중 혼합값 (`대리점ㆍJS`/`일반업체ㆍ서비스`/`일반업체ㆍ대리점`) 포함.
- `02-cross-review.md:317` (§9.1 #3): "거래처 시트 `그룹` 컬럼 활용 정책 (메뉴 분기 / 단가 일괄?)" — 향후 기능 여부 사용자 확정 필요.
- `01-script-analysis-partner-order.md` §11.1: partner-order 가 `그룹` 컬럼 직접 read 0건 (시트 거래처 마스터 column H, 함수 `getCustomers_` 가 read 하나 분기 미사용).

### Plan agent POV (Plan 결정 + 사유)

- `04-migration-plan.md:323` (§2.2.1 PartnerMaster.partnerGroup 컬럼): "**G5 결정** — 시트 H열 distinct 14 → 3 enum 매핑 (`SF(밴더)`/`MAIN`/`VIP` → SF, `일반업체`/`파트너사`/`조달업체`/`대리점`/`서비스`/혼합 → GENERAL, `JS`/`기타`/`창고` → OTHER, **빈 → GENERAL**)".
- `decisions/DECISIONS.md:43` (Phase 3 G5): "enum 표준화 — `PartnerGroup enum {SF, GENERAL, OTHER}` + 빈 그룹 default = GENERAL (마이그 시 14 distinct → 3 enum 매핑 표 별도 작성)".
- 사유: 14 → 3 압축이 검색/필터/정책 분기 단순화. 단 매핑 표 자체가 누락된 상태 — Phase 6 시드 SQL 작성 시 중복 정의 위험.

### Reviewer POV (cross-review 발견)

- 누락 catch: 혼합값 (`대리점ㆍJS` / `일반업체ㆍ서비스` / `일반업체ㆍ대리점`) 의 매핑 모호. Plan §2.2.1 은 "혼합 → GENERAL" 으로 일괄 처리하나, `JS` 단독은 OTHER, `대리점ㆍJS` 는 GENERAL — 일관성 균열. 사용자 확정 의무.
- 14 distinct 정확 카운트 모호 — `03-sheet-schema.md:441` 의 "distinct values" 14개 vs Plan §2.2.1 의 "distinct 14" 의 표가 누락. Round 1 산출에 매핑 표 명시 필요.

### 합의 + 매핑 표 (Round 1 산출)

| 시트 H열 distinct value | 매핑 enum | 사유 |
|---|---|---|
| `SF(밴더)` | SF | 명시적 SF |
| `MAIN` | SF | 분석 추정 (자체 SF 변형) — 사용자 확정 필요 |
| `VIP` | SF | 분석 추정 (SF 변형) — 사용자 확정 필요 |
| `일반업체` | GENERAL | 명시적 |
| `파트너사` | GENERAL | 명시적 |
| `조달업체` | GENERAL | 명시적 |
| `대리점` | GENERAL | 명시적 |
| `서비스` | GENERAL | 명시적 |
| `대리점ㆍJS` | GENERAL | 혼합 — 첫 토큰 우선 |
| `일반업체ㆍ서비스` | GENERAL | 혼합 — 첫 토큰 우선 |
| `일반업체ㆍ대리점` | GENERAL | 혼합 — 첫 토큰 우선 |
| `JS` | OTHER | 명시적 |
| `기타` | OTHER | 명시적 |
| `창고` | OTHER | 명시적 |
| (빈) | **GENERAL (default)** | DECISIONS Phase 3 G5 명시 — 2800 row |

→ **사용자 확정 필요 (G10 신규 게이트)**: `MAIN` / `VIP` 의 SF 매핑 정확성 확인. 혼합값 "첫 토큰 우선" 룰 채택 승인.

---

## §4. D4 — EmployeeMaster 담당자 시트 19 row 코드 정규화

### 분석 agent POV (모호 / 근거)

- `03-sheet-schema.md:486-489` (§2.26): 19 distinct employees — 코드 형식 비표준. 예시: `김미선(00001)`, `장영구(00002)`, `오병승(99191)`, `김기철(20240622)`, `신인호(00011)`, `견진성(11840720023)`, `심미광(11840720083)`, `정희서(11840720092)`, `김동원(20240617)`, `허유진(20241125)`, `박은우(250102)`, **`이성미(이성미)` ← 코드 자체가 이름**, `정민국(20250616-2)`, `신현민(20250616-1)`, `라해람(20250908)`, `하보련(20251027)`, `정민정(20251117)`, `유한수(20251201)`, `홍지수(20260108)`.
- 형식 분포: (a) 5자리 사번 (`00001`/`00002`/`00011`) 3건, (b) e-Count `EMP_CD` (`11840720023` 등) 3건, (c) YYYYMMDD 입사일 7건, (d) YYMMDD 1건 (`250102`), (e) YYYYMMDD-N 분리 2건, (f) 이름 자체 1건 (이성미).

### Plan agent POV (Plan 결정 + 사유)

- `04-migration-plan.md:407-413` (§2.2.4 EmployeeMaster): `employeeCode varchar(32)` + 주석 "(정규화 전) — Phase 5 Discussion §11 #5 (코드 형식 비표준 정책)".
- `04-migration-plan.md:1187` (§11 #7): "EmployeeMaster 코드 형식 비표준 정책 — '이성미' row 의 코드='이성미' 등 비표준 19 row → 정규화 신규 사번 부여 vs 보존".
- `04-migration-plan.md:413` (§2.2.4): `legacyEccountEmpCode varchar(32) nullable` + 주석 "e-Count 의존 0 결정으로 단순 보존 (참조용, 사용 안 함)" — Phase 2 결정 (이카운트 폐기) 으로 e-Count `EMP_CD` 는 fallback only.
- 사유 (Plan): 정규화 결정 시점은 Phase 5 Discussion 또는 Phase 6 시드 직전. 19 row 작은 데이터셋 → 사용자 결정 부담 적음.

### Reviewer POV (cross-review 발견)

- `02-cross-review.md:312` (§9.1 #1~#10) 에 EmployeeMaster 정규화 항목 누락 — Phase 3 §9 #12 와 Plan §11 #7 에서만 등재. 라운드 1 가 별도로 처리 의무.
- 누락 catch: 이성미 row 의 코드="이성미" 케이스는 **AUTH 충돌 위험** — `employeeCode` 로 직원 조회 시 동명이인 발생 시 충돌. iam-service Google OAuth (이메일 기준) 와 매핑 시 이메일 ↔ employeeCode 매핑 표 별도 필요.
- 정규화 정책 미결정 시 신규 직원 등록 룰도 불명확 — Phase 6 BACKEND/FRONTEND admin UI 작성 의무 차단.

### 합의 (또는 사용자 확정 필요)

| 옵션 | 권장도 | 사유 |
|---|---|---|
| (a) 신규 사번 일괄 부여 (`EMP-0001` ~ `EMP-0019`) | ★★★ (Reviewer 추천) | 충돌 0 / iam-service 이메일 매핑 단순 / 신규 직원 등록 룰 명확 / legacyEccountEmpCode 컬럼에 원본 보존 |
| (b) 시트 코드 그대로 보존 (이성미 row 만 별도 처리) | ★★ | 외부 변경 최소 / 단 unique 제약 복잡 (특수 case) |
| (c) Google 이메일 ID 자체 = employeeCode | ★ | OAuth 매핑 단순 / 단 사용자 시인성 낮음 |

**권장 (Plan + Reviewer 합의)**: **옵션 (a) — 신규 사번 `EMP-NNNN` 일괄 부여 + `legacyEccountEmpCode varchar(32) nullable` 컬럼에 원본 19종 보존**. iam-service 이메일 매핑 표 별도 작성. 19 row 만 마이그 직전 사용자 검토.

→ **사용자 확정 필요 (G11 신규 게이트)**: 옵션 (a) 승인 + 19 row 사번 부여 사용자 검토.

---

## §5. D5 — 도메인 경계: partner-order-service vs slip-service Slip 자동 생성 listener 책임 분리

### 분석 agent POV (모호 / 근거)

- `01-script-analysis-partner-order.md` §7.1 (sendOrderFromUi 1928-2378): partner-order Apps Script 의 e-Count `/saleorder` 호출 = 주문 + 출고전표 동시 생성 (단일 트랜잭션).
- `01-script-analysis-estimate.md` §7.1: estimate `/sale` = 즉시 판매전표 (주문 단계 없음).
- `02-cross-review.md:243` (§6.3): "estimate `/sale` 은 판매전표 (즉시 발생), partner-order `/saleorder` 는 판매주문 (사전 단계)" — 두 도메인 분리 명확.
- `04-migration-plan.md:599-608` (§2.4.6 onPartnerOrderConfirmed listener): slip-service 의 `@EventListener` 로 `Slip.builder().sourceType(PARTNER_ORDER).sourceId(evt.orderId())` 자동 생성.

### Plan agent POV (Plan 결정 + 사유)

- `04-migration-plan.md:30` (§1.2 M4): "slip-service 확장 / Slip.sourceType enum + PartnerOrderConfirmedEvent listener (자동 출고전표 생성)".
- `04-migration-plan.md:644-647` (§2.5.2): Event → Listener → Slip 자동 생성 매트릭스 — `EstimateConfirmedEvent` → `EstimateSlipCreator` (sourceType=ESTIMATE), `PartnerOrderConfirmedEvent` → `PartnerOrderSlipCreator` (sourceType=PARTNER_ORDER).
- 사유 (Plan): Event 발행자 = partner-order-service (도메인 모델 보유), 처리자 = slip-service (Slip entity 책임자). MSA 표준 (각 service 가 자기 entity 책임). Saga / Outbox 패턴은 명시 안 됨 → 라운드 3 에서 보강 검토.

### Reviewer POV (cross-review 발견)

- `02-cross-review.md:282-292` (§8.2 partner 도메인 분할): Plan 결정 일치.
- 누락 catch 1: **트랜잭션 경계 미명시** — `04-migration-plan.md:597-608` 의 listener `@Transactional` 어노테이션 단일 — Slip 생성 실패 시 PartnerOrder 상태 롤백 정책 누락. Outbox 패턴 / Saga / 보상 트랜잭션 명시 의무.
- 누락 catch 2: `04-migration-plan.md:551` (§2.4.1 PartnerOrderMaster) `externalSlipNo varchar(32)` 컬럼 — slip-service 가 Slip 생성 후 callback 으로 partner-order 갱신 → 양방향 통신. Event-driven 단방향 vs Request-Reply 양방향 정책 미결정.
- 누락 catch 3: `04-migration-plan.md:48` (R3 위험) "Bundle EXPAND/KEEP 분기 누락 시 재고 차감 오류" — Slip 라인 생성 시 BundleExpansionPolicy 적용 책임이 partner-order-service 인지 slip-service 인지 모호. **권장**: partner-order-service 가 EXPAND/KEEP 적용 후 Event payload 에 펼침 결과 lines[] 직접 포함 → slip-service 는 단순 저장만 (책임 분리 명확).

### 합의 (또는 사용자 확정 필요)

| 결정 | 합의안 | 사유 |
|---|---|---|
| **D5-1 책임 분리** | partner-order-service = Event 발행자 + Bundle EXPAND/KEEP 적용 책임 / slip-service = listener + 단순 저장 | Reviewer 추천 — 책임 명확 |
| **D5-2 트랜잭션 경계** | Outbox 패턴 권장 (Spring `@TransactionalEventListener(phase=AFTER_COMMIT)`) + Slip 생성 실패 시 PartnerOrderActionLog 에 실패 기록 + 사용자 수동 재시도 | 단일 `@Transactional` 분산 트랜잭션은 MSA 안티패턴 |
| **D5-3 양방향 통신** | slip-service → partner-order-service `SlipCreatedEvent` 발행 (역방향) + partner-order 가 listen 하여 `externalSlipNo` 업데이트 | 양 service 간 약결합 유지 |
| **사용자 확정 필요 (G12 신규 게이트)** | Outbox 패턴 도입 vs 단순 `@TransactionalEventListener` 채택 | infrastructure 부담 vs 정합성 trade-off |

→ Plan §2.4.6 / §2.5.2 보강 의무 (Phase 6 BACKEND 디스패치 사전 — 단 Plan 파일 수정은 본 라운드 금지, 라운드 3 에서 종합 매트릭스로 명시).

---

## §6. D6 — partner-service long-pending sub-domain 흡수 vs 별도 partner-analytics-service 분리

### 분석 agent POV (모호 / 근거)

- `01-script-analysis-long-pending.md` §8 (분석문서): "partner-service 확장 (PartnerLongPendingService + ApprovalStatus enum) — 신규 service 거부".
- `02-cross-review.md:277-292` (§8.1, §8.2): partner 도메인 3-way 분할 → partner-service 가 마스터/DC/활성도, partner-order-service 가 인증/주문, slip-service 가 결재선. **long-pending = partner-service sub-domain (활성도 책임)**.
- `04-migration-plan.md:30` (§1.2 M5): "partner-service (sub) 확장 / LongPendingScheduler (cron) + ApprovalStatus enum 추가".

### Plan agent POV (Plan 결정 + 사유)

- `04-migration-plan.md:362-403` (§2.2.3): `LongPendingScheduler @Service` — partner-service 안에 직접 등록. 별도 service 분리 X.
- `04-migration-plan.md:655-661` (§2.6 partner-analytics): 명시적 표기 — "long-pending Apps Script 가 별도 service 가 아닌 partner-service 확장 sub-domain 으로 통합 (long-pending §8.1 결정)".
- 사유 (Plan):
  1. long-pending Code.js 5 함수 (1 entry + 4 private) 만 있음 — 별도 service 의 운영 비용 정당화 안 됨.
  2. ApprovalStatus enum 이 partner-service `PartnerAuth.status` 와 직접 연동 — cross-service Feign 회피 목적.
  3. SlipClient/DeliveryClient Feign 만 외부 의존 — `@MockBean` IT 가드 (`feedback_it_mockbean_external_clients.md`) 적용.

### Reviewer POV (cross-review 발견)

- `02-cross-review.md:359` (§10): `feedback_it_mockbean_external_clients.md` long-pending §8.2 명시 (SlipClient/DeliveryClient @MockBean) — Plan 일치.
- 누락 catch: M5 (`04-migration-plan.md:30`) 의 5-team 디스패치 → `04-migration-plan.md:860` (§6.2 M5): "BACKEND/QA/DEVOPS — FRONTEND 불요, 배치만" → 3-team 으로 축소. Plan 일관성 OK.
- 추가 우려: long-pending 가 향후 확장 시 (예: partner 신용도 분석, 발주 패턴 분석) sub-domain 부피 증가 → 분리 시점 trigger 정책 미명시. 하지만 현 단계 기준 partner-service 흡수 적정.

### 합의 (또는 사용자 확정 필요)

| 결정 | 합의안 | 사유 |
|---|---|---|
| **D6 합의** | **partner-service sub-domain 흡수 (별도 service 분리 X)** | Plan §1.2/§2.2.3/§2.6 + cross-review §8.1/§8.2 + 분석 §8 모두 일치 |
| **장래 분리 trigger 정책** (Reviewer 권장) | partner-service sub-domain 부피 임계값 (예: long-pending + analytics 합산 >50 함수) 도달 시 분리 검토 | 현 단계 적용 의무 없음 |

→ **사용자 확정 불필요** (3 perspective 모두 합치). 장래 분리 trigger 는 Phase 6 이후 운영 회고 단계에서 재검토.

---

## §7 라운드 1 종합 — 합의 표 + 사용자 확정 필요 항목 + 다음 라운드 입력

### §7.1 라운드 1 합의 결정 표

| # | 주제 | 합의 결정 | 출처 / 근거 | 라운드 2/3 연계 |
|---|---|---|---|---|
| D1 | partner-service 단일 vs 분리 | **단일 service + Auth/LongPending sub-domain (package 분리)** | Plan §1.2/§2.2 + cross-review §8.2 | 라운드 3 D17 (UX 카탈로그 중복) 와 BFF 정책 연계 |
| D2 | PartnerAuth PW 정책 | **lazy upgrade 권장 (DelegatingPasswordEncoder `{bcrypt}`/`{sha256}` prefix)** + 6개월 잔존 reset 옵션 → 사용자 확정 G9 | Plan §2.2.2/§11 #1 + Reviewer 신규 제안 | 라운드 2 D9 (Slip MANUAL) 와 운영 전환 정책 연계 |
| D3 | 거래처 그룹 14 → 3 enum | **매핑 표 14 row Round 1 §3 명시 + 혼합값 "첫 토큰 우선" 룰** → 사용자 확정 G10 | Plan §2.2.1/§11 #2 + DECISIONS Phase 3 G5 + Reviewer 매핑 표 보강 | 라운드 2 D10 (Draft 30일) 와 운영 정책 연계 |
| D4 | EmployeeMaster 코드 정규화 | **신규 사번 `EMP-NNNN` 일괄 부여 + legacyEccountEmpCode 보존** → 사용자 확정 G11 | Plan §2.2.4/§11 #7 + Reviewer 충돌 위험 catch | iam-service 이메일 매핑 별도 |
| D5 | Slip 자동 생성 listener 책임 | **partner-order = EXPAND/KEEP + Event 발행 / slip = 단순 저장 + 역 SlipCreatedEvent 발행** + Outbox 패턴 권장 → 사용자 확정 G12 (Outbox vs `@TransactionalEventListener`) | Plan §2.4.6/§2.5.2 + Reviewer 트랜잭션 누락 catch | 라운드 2 D11 (TOKEN_004 이중 역할) 와 slip-service 책임 연계 |
| D6 | long-pending 별도 service 분리 | **partner-service sub-domain 흡수 (분리 X)** | Plan §1.2/§2.6 + cross-review §8.1 + long-pending §8 모두 일치 | 장래 분리 trigger 정책은 Phase 6 이후 회고 |

### §7.2 사용자 확정 필요 신규 게이트 표 (라운드 1 산출)

| 게이트 | 차단 항목 | 옵션 | 권장 |
|---|---|---|---|
| **G9** | D2 PartnerAuth PW 마이그 정책 | (a) lazy upgrade / (b) 사전 일괄 + temp PW / (c) 혼합 6개월 후 잔존 reset | (a) lazy + DelegatingPasswordEncoder |
| **G10** | D3 거래처 그룹 매핑 표 (MAIN/VIP → SF / 혼합값 첫 토큰 우선) | (a) 권장 표 그대로 / (b) MAIN/VIP 별도 enum 추가 / (c) 사용자 직접 매핑 | (a) Round 1 §3 표 그대로 |
| **G11** | D4 EmployeeMaster 19 row 사번 부여 | (a) 신규 `EMP-0001~0019` / (b) 시트 코드 보존 / (c) Google 이메일 ID | (a) 신규 사번 |
| **G12** | D5 Slip 자동 생성 트랜잭션 패턴 | (a) Outbox 패턴 / (b) `@TransactionalEventListener(phase=AFTER_COMMIT)` / (c) 단일 `@Transactional` | (b) — Outbox 는 인프라 부담 |

### §7.3 다음 라운드 (Round 2) 입력

라운드 2 (분석 agent POV — 데이터/시드 perspective) 처리 의무:

1. 라운드 1 §7.1 합의 표 starting point — D2 (PW 정책) 가 라운드 2 D9 (Slip MANUAL 시드) 와 운영 전환 시점 동기화 필요 / D5 (listener 책임) 가 라운드 2 D11 (TOKEN_004 이중 역할) 의 slip vs delivery 분리와 직결.
2. 라운드 1 §7.2 게이트 G9~G12 는 라운드 3 종합 매트릭스에 통합 — 라운드 2 진행 중 변경 없음.
3. 라운드 2 신규 처리 항목 (Plan §11 #4/#5/#8/#9/#11/#12 + Phase 3 §9 #1/#9 등): D7 MaterialPrice / D8 BranchPipeLookup / D9 Slip MANUAL / D10 Draft 30일 / D11 TOKEN_004 / D12 고정DC 컬럼 / D13 인쇄 템플릿 6.

---

## §8 회고 가드 적용 검증

| 가드 | 본 라운드 적용 |
|---|---|
| `feedback_pm_integration_build_check.md` Layer 4 (도메인 메서드 의미 정렬) | D5 의 Outbox/Listener 책임 분리 — `PartnerOrderSlipCreator.onConfirmed()` 메서드 의미 = "PartnerOrder 확정 후 EXPAND 펼침된 lines[] payload 를 받아 Slip(sourceType=PARTNER_ORDER) 단순 저장. EXPAND/KEEP 책임은 partner-order-service 에 있음, slip-service 는 저장 only." 명시 의무 — 라운드 3 매트릭스 등재 |
| `feedback_role_naming_full.md` (BACKEND/FRONTEND/DESIGN/QA/DEVOPS 풀네임) | 본 라운드 산출 내 "5-team" 표기 시 풀네임 전제 — D6 §2.6 M5 의 "BACKEND/QA/DEVOPS" 표기 OK |
| `feedback_uuid_no_user_visibility.md` | D3 partnerGroup enum / D4 employeeCode 모두 사용자 노출 식별자 (UUID 미노출) — 사업자번호/사번/거래처명만 화면 노출 |
| `feedback_korean_commits.md` | 본 라운드 산출 한국어 작성 ✅ |
| `feedback_function_documentation.md` | D5 listener 메서드 — 한국어 Javadoc 의무 + 출처 (partner-order Code.js sendOrderFromUi 라인) 명시 의무 — Phase 6 BACKEND 디스패치 사전 가드 |
| `feedback_multi_agent_team_pattern.md` | D5 의 5-team 디스패치 영향 — Plan §6.2 M4 양 service 동시 디스패치 정책 일치 |
| `feedback_it_mockbean_external_clients.md` | D6 sub-domain 흡수 결정 후 SlipClient/DeliveryClient `@MockBean` 의무 (Plan §2.6 명시) |

---

## §9 라운드 1 누락 0 가드 (검증)

- D1~D6 6 항목 모두 처리 ✅
- 각 항목 분석 agent / Plan agent / Reviewer 3 perspective 발언 모두 등재 ✅
- 각 perspective 발언에 출처 (파일:라인) 명시 ✅
- 합의 또는 사용자 확정 게이트 명시 ✅
- 신규 게이트 G9~G12 표 작성 ✅
- 다음 라운드 (Round 2) 입력 명시 ✅
- 회고 가드 적용 검증 ✅

---

_생성: Phase 5 Discussion Round 1 / Plan agent perspective driver / 2026-05-05 / 단일 산출 파일 / 한국어 / 출처 명시 / 추측 금지_

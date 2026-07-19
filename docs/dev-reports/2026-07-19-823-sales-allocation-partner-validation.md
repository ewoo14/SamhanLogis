# #823 매출·매입전표 배분 원천 거래처 검증 구현 보고

## 범위
- 매출/매입전표 배분(create/draft) 시 **원천 출고/입고전표 거래처 = 대상 헤더 거래처** 검증·불일치/결손 **차단 reject(422)**. 회계 오귀속(세금계산서·분개·일마감 UNIQUE 키) 원천 차단.
- `SlipLineSnapshot`(slip producer + accounting consumer 양 record) += `partnerId`·`toSnapshot` = `slip.getPartnerId()`(헤더). accounting record `@JsonIgnoreProperties(ignoreUnknown=true)`(롤링 안전).
- `verifySourceAndAllocation(ar, headerPartnerId)`: null 원천→`SAS_SOURCE_PARTNER_MISSING`·불일치→`SAS_SOURCE_PARTNER_MISMATCH`(둘 다 422). 헤더 partner 필수 선검증(`INVALID_INPUT` 400·채번/원천조회 前). **원천 identity 권위=스냅샷 slipId/slipNo 저장**(client 값 무신뢰·분열 배분 차단).
- **매출+매입 대칭**(defect-family sweep). **DB 마이그 0건**(양측 partner_id 컬럼 존재).

## 2026-07-19 R2 재수렴 — code/name-required

- **BE MISSING 판정 복원**: 매출·매입 모두 `partnerId == null || partnerCode == null/blank || partnerName == null/blank`이면 저장·채번 전에 `SAS_SOURCE_PARTNER_MISSING`(422)으로 거부한다. 통과한 원천의 code/name은 스냅샷 권위로 회계전표 헤더에 저장하며 DB `NOT NULL` 계약과 정합한다.
- **실 DB IT 추가**: `SalesAccountingSlipControllerIT`·`PurchaseAccountingSlipControllerIT`에 각각 code/name null 원천 케이스를 추가했다. 두 IT 모두 Testcontainers 실 Postgres와 실제 repository 경로를 사용하고 `saveAndFlush`를 mock하지 않는다. 따라서 partnerId만 있는 원천을 잘못 통과시키면 `partner_code`/`partner_name NOT NULL` 위반이 DB 예외(500 계열)로 드러나며, 올바른 구현은 DB 저장 전에 clean `422 SAS_SOURCE_PARTNER_MISSING`을 반환한다. code/name이 완전한 원천의 실제 저장 성공 케이스도 각 IT에 유지한다.
- **FE/mock 계약**: resolver와 mock은 이미 `partnerId+partnerCode+partnerName` 전체가 있어야 valid로 해석한다. code/name null 원천을 매출·매입 mock 저장에서 `SAS_SOURCE_PARTNER_MISSING`으로 차단하는 vitest와 resolver 계약 vitest를 명시했다.

## 라이브QA 발견 결함 fix (pre-existing·IT 마스킹)
- **`SlipInternalController.getSlipLine`/`getSlipLines` LazyInitializationException 500** — slip-service OSIV off(`open-in-view: false`)에서 `line.getSlip()`/`slip.getLines()` lazy 접근이 세션 밖 → 500. **accounting 배분이 `getSlipLine`을 사용** → 프로드 배분 전면 500(dev에 CONFIRMED 원천 부재로 잠복). `SlipInternalControllerIT`의 클래스 `@Transactional`이 세션 유지로 **이 프로드 버그를 마스킹**(그래서 그간 green).
- fix: 명시적 **fetch-join**(`findByIdWithSlip = JOIN FETCH l.slip`·`findByIdWithLines = LEFT JOIN FETCH s.lines`)로 컨트롤러 tx/OSIV 비의존 초기화 + IT에 **`Propagation.NOT_SUPPORTED` 테스트**(fix 전 LazyInit RED 재현·후 partnerId/slipId/lineId 검증) — 마스킹 해소.
- **교훈**: 라이브 QA가 IT의 `@Transactional` 세션-마스킹을 관통해 OSIV-off 프로드 결함 포착. 슬라이스가 확장·의존하는 endpoint이므로 본 PR에서 fix(scope 확장·R2 재검).

## 검증
- **BE genuine**(`--rerun-tasks --no-build-cache`·Docker Testcontainers): slip-service 전체 **1363 tests BUILD SUCCESSFUL**(단독)·accounting 매출/매입 verify·다중원천 rollback(DB row-0)·계약테스트 롤링 4-단언·헤더 선검증 순서·identity 저장 권위. **CI 34/34 PASS**(exact SHA `728b98bc7`·이후 LazyInit fix 커밋).
- **R1 적대검증(OPUS 4-agent)**: accounting 정합·무결성/엣지·slip producer/롤링·테스트 genuineness **전 차원 신규 HIGH/MED 0**. 분열 배분 실차단·매출/매입 대칭·UUID 비노출 확증.
- **라이브QA(실 스택·gateway→accounting→slip 크로스서비스·mock OFF·throwaway CONFIRMED 원천)**:
  - ① 불일치(헤더 거래처B ← 원천 거래처A) → **422 `SAS_SOURCE_PARTNER_MISMATCH`** "원천 전표 거래처가 대상 전표 거래처와 일치하지 않습니다 (전표=QA823/TEST-1)"(UUID 미노출).
  - ② 일치(헤더 A ← 원천 A) → **200 성공**(매출전표 생성·DRAFT·supply 10000/vat 1000).
  - ③ null 원천 → **422 `SAS_SOURCE_PARTNER_MISSING`** "원천 전표에 거래처가 없습니다".
  - throwaway 데이터 완전 정리(실 데이터 오염 0).

## R2 재수렴 검증 결과 (2026-07-19)

- **BE exact combined**: `./gradlew :services:accounting-service:test :services:slip-service:test --rerun-tasks --no-build-cache`(Windows 실행은 `.\gradlew`) → **BUILD SUCCESSFUL in 5m 40s**, accounting **1,311 tests / skipped 10 / failures 0 / errors 0**, slip **1,363 tests / skipped 0 / failures 0 / errors 0**. 합계 **2,674 tests, failures/errors 0**.
- **실 DB IT**: 매출 controller IT 12/12·매입 controller IT 12/12, Testcontainers Postgres 사용·skip 0. code/name 완전 원천 저장 성공과 code/name null 원천의 clean `422 SAS_SOURCE_PARTNER_MISSING`을 모두 실제 경로로 확인했다.
- **FE exact**: `cd clients/desktop && npm run typecheck` exit 0, `npm run test` exit 0. resolver 계약 2건과 mock 계약(매출·매입 code/name null 차단)을 포함한 전체 Vitest가 통과했다.
- **DB 불변**: `SalesAccountingSlip`·`PurchaseAccountingSlip`의 `partner_code`/`partner_name nullable=false`와 Flyway `V18`/`V19` `NOT NULL`을 유지했으며 신규/수정 migration은 없다.

## R2 최종 수렴 소fix — MED 2건 (2026-07-19)

- **whitespace-only 정합**: FE `resolveAllocationPartner`와 `slipAllocationSourceApi` mock의 code/name 유효 판정을 `value != null && value.trim().length > 0`로 통일했다. BE 양 서비스의 기존 `isBlank()`와 정합하며 `"   "` 원천은 FE 저장 차단/mock `SAS_SOURCE_PARTNER_MISSING`(422)으로 처리한다.
- **실 DB IT 4-way 독립**: 매출·매입 `SalesAccountingSlipControllerIT`/`PurchaseAccountingSlipControllerIT`에 각각 `code=null/name-valid`, `code-valid/name=null`, `code="   "`, `name="   "`의 독립 테스트를 추가했다. 각 케이스는 Testcontainers 실 Postgres 경로에서 `422 SAS_SOURCE_PARTNER_MISSING`과 repository 저장 건수 불변을 단언한다. 완전한 code/name 원천의 기존 DRAFT 저장 성공 케이스도 유지한다.
- **FE 계약 4-way 독립**: 매출·매입 form 계약테스트가 동일한 4개 입력을 각각 submit disabled·거래처 안내·mutation 미호출로 단언하고, resolver 순수 계약과 mock 저장 계약도 whitespace를 포함한다.
- **preflight SQL**: `partner_code=''`/`partner_name=''` 조건을 `BTRIM(partner_code)=''`/`BTRIM(partner_name)=''`로 강화해 공백-only를 런타임 `isBlank()`와 동일하게 검출한다.

최종 genuine 검증:

| 검증 | 결과 |
|---|---|
| `./gradlew :services:accounting-service:test :services:slip-service:test --rerun-tasks --no-build-cache` | **BUILD SUCCESSFUL** (accounting 1,319 tests / skipped 10 / failures 0 / errors 0, slip 1,363 / skipped 0 / failures 0 / errors 0) |
| `cd clients/desktop && npm run typecheck && npm run test` | **PASS** (Vitest 131 files / 965 tests) |

## 🚀 배포 런북 (D-823-02 — 필수 순서)
1. **preflight**: 배포 대상 환경에서 아래 결과가 **0**인지 확인한다.
   ```sql
   SELECT count(*)
   FROM slips
   WHERE status = 'CONFIRMED'
     AND is_deleted = false
     AND (partner_id IS NULL
          OR partner_code IS NULL OR partner_code ~ '^[[:space:]]*$'
          OR partner_name IS NULL OR partner_name ~ '^[[:space:]]*$');
   ```
   `^[[:space:]]*$` 정규식으로 빈 문자열 + 공백/탭/개행 등 whitespace-only code/name을 검출한다(`BTRIM`은 ASCII space만 제거해 tab/newline을 놓침). **런타임 권위는 Java `isBlank()`**(모든 whitespace-only → `SAS_SOURCE_PARTNER_MISSING` 422·fail-safe)이며 preflight는 배포 전 예측용 best-effort — 이색 Unicode 공백(em-space 등)이 실 partner_code(영숫자 업무코드)에 올 가능성은 없으므로 [[:space:]] 범위로 충분. >0이면 원천 거래처의 partnerId/code/name을 보정한 뒤 배포한다.
2. **순서 = producer(slip-service) 먼저 → consumer(accounting-service) 나중**. consumer-first 배포 시 구 producer 응답에 partnerId 부재→null→**전 배분이 MISSING(422)로 전면 거부**. accounting record `@JsonIgnoreProperties`는 미지 필드 무시일 뿐 순서 안전 아님.
3. **readiness = contract readiness**: 단순 health 아님. slip-service `/internal/slips/lines/{lineId}` 응답에 **partnerId + nonblank partnerCode + nonblank partnerName**이 모두 존재하고 Eureka LB 풀에서 **구 slip 인스턴스 부재**를 확인한 후 accounting을 배포한다. (롤링 중 stale 인스턴스 잔존 시 일시 다량 422 MISSING 가능·fail-CLOSED·가역.)

## 처분 (pre-existing/별건)
- **[별건 #850]** 동일 요청 내 같은 원천 라인 중복 배분 과할당(요청 내 누적 미반영) — over-allocation 계열·#823 범위 밖.
- **[스코프 경계]** 배분 이후 원천 CONFIRMED 전표 거래처 변경(revision restore)+`post()` 미재검증 — 배분 시점 불변식만 보장(spec §0·§6).
- **[LOW·pre-existing]** `AllocationRequest.sourceSlipId/sourceSlipNo` dead(스냅샷 권위로 대체·D-823-05 의도)·`sourceLineNo` 무검증(cosmetic)·`partnerCode/partnerName` 표시상 잔여(하류 귀속=partnerId).

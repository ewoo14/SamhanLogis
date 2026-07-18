# #823 매출·매입전표 배분 원천 거래처 검증 구현 보고

## 범위
- 매출/매입전표 배분(create/draft) 시 **원천 출고/입고전표 거래처 = 대상 헤더 거래처** 검증·불일치/결손 **차단 reject(422)**. 회계 오귀속(세금계산서·분개·일마감 UNIQUE 키) 원천 차단.
- `SlipLineSnapshot`(slip producer + accounting consumer 양 record) += `partnerId`·`toSnapshot` = `slip.getPartnerId()`(헤더). accounting record `@JsonIgnoreProperties(ignoreUnknown=true)`(롤링 안전).
- `verifySourceAndAllocation(ar, headerPartnerId)`: null 원천→`SAS_SOURCE_PARTNER_MISSING`·불일치→`SAS_SOURCE_PARTNER_MISMATCH`(둘 다 422). 헤더 partner 필수 선검증(`INVALID_INPUT` 400·채번/원천조회 前). **원천 identity 권위=스냅샷 slipId/slipNo 저장**(client 값 무신뢰·분열 배분 차단).
- **매출+매입 대칭**(defect-family sweep). **DB 마이그 0건**(양측 partner_id 컬럼 존재).

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

## 🚀 배포 런북 (D-823-02 — 필수 순서)
1. **preflight**: 배포 대상 환경 `SELECT count(*) FROM slips WHERE status='CONFIRMED' AND partner_id IS NULL AND is_deleted=false` = 0 확인. >0이면 원천 거래처 보정 후 배포(미보정 시 해당 원천 배분이 SAS_SOURCE_PARTNER_MISSING로 거부).
2. **순서 = producer(slip-service) 먼저 → consumer(accounting-service) 나중**. consumer-first 배포 시 구 producer 응답에 partnerId 부재→null→**전 배분이 MISSING(422)로 전면 거부**. accounting record `@JsonIgnoreProperties`는 미지 필드 무시일 뿐 순서 안전 아님.
3. **readiness = contract readiness**: 단순 health 아님. slip-service `/internal/slips/lines/{lineId}` 응답에 non-null partnerId 존재 + Eureka LB 풀에서 **구 slip 인스턴스 부재** 확인 후 accounting 배포. (롤링 중 stale 인스턴스 잔존 시 일시 다량 422 MISSING 가능·fail-CLOSED·가역.)

## 처분 (pre-existing/별건)
- **[별건 #850]** 동일 요청 내 같은 원천 라인 중복 배분 과할당(요청 내 누적 미반영) — over-allocation 계열·#823 범위 밖.
- **[스코프 경계]** 배분 이후 원천 CONFIRMED 전표 거래처 변경(revision restore)+`post()` 미재검증 — 배분 시점 불변식만 보장(spec §0·§6).
- **[LOW·pre-existing]** `AllocationRequest.sourceSlipId/sourceSlipNo` dead(스냅샷 권위로 대체·D-823-05 의도)·`sourceLineNo` 무검증(cosmetic)·`partnerCode/partnerName` 표시상 잔여(하류 귀속=partnerId).

# F3 — 옵션 default DB 승격 + 설정 UI + estimate-app 시트 의존 제거

> 2026-06-18 개발책임자 결정 시퀀스(F1.5✅→**F3**→F4→F5). estimate-app 종합견적서의 옵션 default(homeDefaults/singleDefaults)를 estimate_configs(Phase1 싱글톤) 확장으로 DB 승격 + 데스크톱 설정 UI + 시트 Row2 read 제거. [[project_formula_builder_epic]]

## 0. 목표 / parity
- estimate-app `getHomeDefaults`/`getSingleDefaults`(code.js:1179/1209, 시트 Row1-2 read)를 **DB(estimate_configs) 기반**으로 전환 + 데스크톱 설정 UI + 시트 의존 제거.
- 🚨 **parity 완전 보존**: 신규 견적 초기 옵션 상태 불변. **라이브 Row2 검증 완료**(SA키 read) → 전 항목 코드 fallback 정확 일치(업무 미커스터마이즈) → 시드 = 검증값 = parity.

## 1. 검증된 parity 시드 (라이브 Row2, 2026-06-18 SA키 read)
| 그룹 | 항목 | 라이브 Row2 = 시드값 |
|---|---|---|
| home | 유연호스 제외 | false |
| home | 분기관 제외 | false |
| home | 발통포함 | false |
| home | 판넬변경 | '' (빈=기본 판넬) |
| home | 리모컨 | '선택 안함' (코드 하드코딩·시트 무관 상수) |
| single | 유선리모컨 | '' |
| single | 리모컨 제외 | false (Row1 라벨 부재→default) |
| single | 실외기 받침대 포함 | false |
| single | 판넬변경 | '' |
| single | 360판넬 | '원형' |
| single | 할인 | 0 |
| single | 1WAY할인 | 0 |
| single | 자재 포함 여부 | '별도' |

> 근거: `<SHEET_ID>` 홈멀티_단가인상/싱글 세트_단가인상 Row2 read. 전 항목 코드 fallback 일치 → 시드 = 이 값.

## 2. 핵심 설계 (PM, 비정책 — 브리프 §2 전역 default 가정·GAS parity)
- **저장 = estimate_configs 확장**(Phase1 EstimateConfig 싱글톤, dc-config-service). 전역 default(GAS Row2도 전역). per-partner/품목 세분화는 **F3 범위 외**(향후).
- estimate-app 은 Phase1 에서 추가한 `db-catalog.estimateConfig()` 응답에 default 필드 포함 → `getHomeDefaults`/`getSingleDefaults` 가 DB config 반환(시트 read 대체). 시트 모드(CATALOG_SOURCE=sheet) fallback 유지.

## 3. 구현 (Codex)
### BE — dc-config-service
- `EstimateConfig` 신규 필드(검증 시드 기본값): home(noHose/noBranch/withFoot bool, defaultPanel str), single(defaultWiredRemote str, noRemote/withBase bool, defaultPanel str, panelShape '원형', discount/oneWayDiscount BigDecimal 0, materialInclusion '별도'). 리모컨'선택 안함'은 상수(저장 불요, estimate-app 유지).
- Flyway `V5`(estimate_configs 컬럼 ADD, **fresh PG probe**). seed 행 UPDATE(기존 V4 행에 default 컬럼 = 검증 시드).
- `EstimateConfigController` GET/PUT DTO 확장(default 필드). `/internal/estimate-config`(InternalDcConfigController)도 default 포함.
- 검증: EstimateConfig IT(default 직렬화·PUT 왕복·CHECK 없음 nullable). 기존 Phase1 IT 회귀 0.

### estimate-app
- `db-catalog.estimateConfig()` 응답 default 필드 매핑. `getHomeDefaults`/`getSingleDefaults`: useDb 시 DB config 에서 구성(시트 read 안 함), sheet 모드 fallback 유지(기존 함수). bootstrap `t.homeDefaults`/`t.singleDefaults` DB 값.
- **시트 prefetch 정리**: DB 모드 prefetch [HOME/SINGLE/COMM] 중 각 탭의 DB-모드 실 사용처 grep → home/single Row2 default 가 유일 사용처면 제거. COMM 등 잔여 사용처 있으면 유지(과제거 금지). 목표=DB 모드 시트 read 최소화(이상적 0).
- normalizeEstimateConfig_ 확장(default 필드 정규화·하위호환 fallback).

### FE — clients/desktop
- `EstimatePricingConfigPage` 에 **옵션 기본값 섹션** 추가(또는 동일 메뉴 내 탭): home(체크박스 3 + 판넬 select), single(유선리모컨 select·체크박스 2·판넬 select·360판넬 select 원형/사각·할인/1WAY할인 number·자재포함 select). 기존 `canAccess('sales.estimate-config', view/update)` 재사용(권한 동일). sales.ts/mock.ts DTO 확장.

## 4. 검증
- BE: EstimateConfig IT(default 왕복) + V5 fresh PG probe + Phase1 회귀 0.
- estimate-app: jest — getHomeDefaults/getSingleDefaults DB 모드 = 검증 시드, sheet fallback 유지. 3탭 prefetch 제거분 회귀 0.
- desktop: typecheck + 설정 UI 렌더/저장.
- **실QA**: estimate-app DB 모드(estimateConfig 에 default 포함) → 신규 견적 초기 옵션 = 검증 시드(360판넬 원형·자재 별도 등) 불변(parity). 데스크톱 설정 변경 → 견적 반영. dc-config 재빌드 + 실 endpoint.

## 5. 리뷰 워크플로우
Opus 5-agent(BE/FE/estimate-app parity/QA/DevOps) → Codex 교차 → Opus 수렴 → Docker 실QA(설정→견적 반영·parity) → CI green → 머지. (BE+FE+estimate-app 3면이라 5-agent.)

## 6. 리스크
- parity: 시드 검증 완료(라이브=fallback). 단 estimate-app default 적용 경로(뷰 초기 옵션) 회귀는 실QA 로 확인.
- 시트 prefetch 과제거 주의(DB 모드 실 사용처 grep 후 제거).
- V5 마이그 fresh probe. Phase1 estimate_configs 행 UPDATE(기존 단일 행에 default 컬럼).

# RC9 lookup 3종 시트 sync — Docker 실서버 실 QA 증빙 (PR #425)

> 2026-06-08. **실 Google Sheet `<SHEET_ID>` + 실 Postgres 16 + 실 SA(`samhan@samhan-homepage`) 인증** end-to-end. 가짜 데이터/합성/목업 0 ([[no-fake-data-ever]] 준수). 실 측정값만.

## 환경
- product-service.jar 부팅 → Docker Postgres 16-alpine(`qa-product-pg`, 5433) + 실 시트 SA sync.
- Flyway: **Successfully applied 10 migrations, now at version v10** (V10 COALESCE partial unique index 가 실 Postgres 에 정상 적용 — H2 로컬 프로파일로는 검증 불가했던 부분).

## ✅ 실 DB 적재 행수 (active)
```
 material_price            | 28
 odu_recommendation_lookup | 32   (MULTI_HEATING_COOLING 24 + HOME_MULTI 8)
 branch_pipe_lookup        |  6
```
- material 28 = 싱글 자재가격 28 데이터행. branch 6 = 분기계산 코드 6개.
- odu 32 = 추천실외기 24 데이터행 → 엔티티 확장(행당 MULTI 1 + HOME_MULTI 최대 2, putIfAbsent dedup 후). 스펙 "24 데이터행"과 정합.

## ✅ 실데이터 + null 정직성 (합성 0)
### material (C/D 사이드블록 D2~D8 = optionLabel 실값 / D9~ = null)
```
 D2 | 유선리모컨     |  40000 | 유선선택  | 0
 D3 | 컬러유선리모컨 |  75000 | 판넬선택  | 0
 D4 | 블랙판넬       |  50000 | 합계      | 0
 ...
 D8 | 1WAY 대형 공청 | 260000 | 대형 합계 | 0
 D9 | FPH-1412XS3    | 130000 | (null)    | (null)   ← i<=7 경계: 사이드블록 밖 = null
```
materialKey=D{시트행번호} 파생 실증. 사이드블록 밖 optionLabel/computedFormula **합성 없이 null**.

### branch (코드만, desc/qty 정직 null)
```
 1509 | (null) | (null)
 2512 | (null) | (null)
 ... 4119 | (null) | (null)
```
개발책임자 결정대로 코드 6개만, description·summary_qty **전부 NULL** (시트 무 실값 → 합성 금지).

### odu (HOME_MULTI capacity null / MULTI capacity 실값)
```
 HOME_MULTI            | capacity=(null) | count=7  | 2.5HP
 MULTI_HEATING_COOLING | capacity=5.50   | count=(null) | 4HP
```
HOME_MULTI 8행 전부 indoor_capacity NULL (cap_notnull=0), MULTI 24행 capacity 보유. 시트 형상 그대로, 무값 합성 0.

## ✅ 동시성/정합성 fix 실증 (dual review P1 검증)
- **ODU 중복 감지(P2 fix)**: 1차 sync 로그 `[ProductLookupSheetSync] 추천실외기 natural key 중복: key=HOME_MULTI|null|7|2.5HP, firstRow=3, duplicateRow=4` — 실 데이터에서 충돌 기록 발화.
- **ODU BigDecimal scale fix(P1) 실증**: MULTI 행이 DB 에 `5.50`(NUMERIC scale 2)로 저장됨. **2차 sync(재부팅) 결과 `inserted=0, softDeleted=0`** — scale 정규화(stripTrailingZeros) 덕에 `5.5`(시트)≠`5.50`(DB) 오인 삭제 0건. (정규화 부재 시 전 MULTI 행 soft-delete+재insert 됐을 것.)
- **idempotency**: 2회 sync 후 카운트 28/32/6 무변동. (2차 updated=66 은 in-memory rowHash 캐시 재기동 cold-start 로 동일값 재기록 — 기존 ProductSheetSyncService 동일 무해 패턴, 데이터 무결성 0 영향.)

## CI
- 24/24 ALL PASS (product-service 빌드+테스트 = 신규 lookup IT 5건 CI Linux 실행 / Desktop Playwright mock 게이트 포함).

## FE
- lookup 모달(LineLookupReferenceModal)은 RC9 기존 구현(본 PR 미변경). mock 계약을 실 sync 계약(branch/odu null)으로 동기화, rc9 Playwright spec green.

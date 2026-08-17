# RC9 lookup 3종 시트 sync 확장 — 시드 소스 확보 슬라이스 (스코핑 스펙)

> 2026-06-08 PM 사전 스코핑 (개발책임자 "Google Service Account key 제공" 결정 후). 키 도착 즉시 Codex 디스패치용. 본 문서는 **legacy `clients/web/estimate-app/lib/code.js` + 3 entity 컬럼 대조 결과**이며, ★ 표시는 **live 시트 실 read 로 검증 필요**(가짜 데이터 금지 [[no-fake-data-ever]]).

## 0. 배경

- RC9 lookup 3종(material-prices/odu-recommendations/branch-pipes)은 BE/FE/mock 구현 완료, **3 테이블 0 row**. V3 Flyway=스키마만.
- 시드 소스 = legacy Google Sheet `<SHEET_ID>` 3탭. SA(`samhan@samhan-homepage.iam.gserviceaccount.com`) 인증.
- 기존 `ProductSheetSyncService` 는 6 ProductMaster 카테고리만 sync (modelCode 기반). lookup 3종은 스키마 상이(modelCode 없음) → **별도 sync 경로**.
- 참조: [[lookup-seed-source]], dev-report `migration-be-product-google-sheets-sync.md` §8 후속과제.

## 1. 시트 → entity 매핑 (live recon 2026-06-08 확정 — `.claude/tmp/sheet-recon.mjs`)

> live read 검증 완료: SA 접근 정상, 행수 M1a dry-run 보고서와 일치(28/24/6). ★ 항목 전부 실측 해소.

### 1-A. MaterialPrice ← `싱글 자재가격` (실 29행 = 헤더1 + **28 데이터**)
- 실 레이아웃: r0 헤더 A="품 명" B="가격". 데이터 r1~r28: **A=name, B=price**(FORMATTED, 천단위 콤마 → parseDecimal). 예: `유선리모컨/40,000`, `FPH-1412XS3/130,000`.
- C/D 사이드블록(r1~r7만): C=옵션라벨(유선선택/판넬선택/합계/1WAY중형공청/1WAY대형공청/중형합계/대형합계) D=계산값(현재 0). = 견적 formula 의 `$D$N` master cell 참조군.
- entity: `materialKey(8) name(128) price(12,2) optionLabel(64) computedFormula(TEXT)`.
- 매핑: name←A, price←B. **materialKey = `D{시트행번호}`**(MaterialPrice.java:20 + m1a-seed-dryrun §formula: `'싱글 자재가격'!$D$4` 등 = D열 cell 참조, 행번호 = 시트 row). optionLabel/computedFormula = C/D 사이드블록 매칭 행만 채우고 나머지 null(시트 무값 → **합성 금지**). ⚠️ MaterialPrice.java 주석의 D7/D8 라벨이 현 시트 C7/C8(중형/대형 합계)과 불일치 — **Codex 가 현 live 시트 기준으로 재대조**(주석 맹신 금지).

### 1-B. OduRecommendationLookup ← `추천실외기` (실 26행 = 헤더2 + **24 데이터**)
- 실 레이아웃: r0=섹션(A="멀티 냉난방" C="홈멀티"), r1=컬럼헤더(A=실내기 B=마력 C=실내기 D=실내기 E=마력). 데이터 r2~r25:
  - **A=용량, B=마력** → `recommendationType=MULTI_HEATING_COOLING` (예 5.5/4HP, 11.1/5HP). indoorCapacity←A, indoorCount=null.
  - **C=실내기대수, E=마력** → `recommendationType=HOME_MULTI` (예 7/2.5HP). indoorCount←C, outdoorHp←E.
  - **D=실내기대수(변형), E=마력** → HOME_MULTI 합류(homeEx). indoorCount←D, outdoorHp←E.
- entity: `recommendationType(enum) indoorCapacity(8,2) indoorCount(int) outdoorHp(8)`.
- ⚠️ comm 행은 indoorCapacity 보유·indoorCount=null / home·homeEx 행은 indoorCount 보유·indoorCapacity **무값**. entity `indoorCapacity` NOT NULL 제약과 충돌 → **Codex 가 V-마이그레이션으로 indoorCapacity nullable 완화**(또는 RC9 controller/mock 계약 재확인). 시트 무값 컬럼 합성 금지.

### 1-C. BranchPipeLookup ← `분기계산` (계산 시트 — 개발책임자 결정 2026-06-08: **코드 6개만 정직 시드**)
- 실 레이아웃: r0=계산 grid 헤더(전체 분기관 개수/수동추가/선택 실내기/실외기1~11, maxCols=26). **A열 비공백 = branchCode 6개**: 1509/2512/2812/2815/3419/4119(r1~r6). B열=summaryQty=0(per-견적 live 계산값). C~Z=계산셀.
- entity: `branchCode(16) description(255) summaryQty(int)`.
- 매핑(개발책임자 결정): **branchCode 6개만 시드, description=null, summaryQty=null**(시트 무 실값 → 합성 금지). FE 탭은 코드 목록만 노출. ⚠️ RC9 mock 의 `description:'분지관 코드 1509'`/`summaryQty:1..5` = 예시 합성값 → **실 시드는 null 로 교정**(mock 도 동기화).

## 2. 구현 범위 (Codex 디스패치)

1. **BE**: `ProductLookupSheetSyncService` 신규 — 3탭 read → upsert(rowHash 변경감지 + soft-delete, 기존 service 패턴 1:1) → MaterialPrice/Odu/BranchPipe repository. natural key: materialKey / (type+capacity) / branchCode.
2. **scheduler/admin**: 기존 `ProductSheetSyncScheduler`·admin endpoint 에 lookup sync 합류 (동일 cron, 별도 트랜잭션).
3. **IT**: `@MockBean GoogleSheetsClient` 격리 + 3탭 stub → insert/rowHash-unchanged/update/soft-delete 4-way (기존 `ProductSheetSyncServiceIT` 패턴).
4. **dev-report** + 핸드오프 갱신.
- FE/mock 무변경 (RC9 에서 이미 구현). 신규 page-code 없음 → seed/SP_D1_PAGES 무변경.
- Flyway 0건 (V3 스키마 재사용).

## 3. 검증 (가짜 데이터 금지 — live 시트 실측 의무)

1. SA key 적재 후 `GOOGLE_SERVICE_ACCOUNT_KEY=<로컬경로>` + 3탭 실 read **컬럼 layout 실측** → §1 ★ 항목 확정.
2. Docker 실서버(Testcontainers Postgres) + 실 시트 sync → 3 테이블 실 row 적재 확인(material ~28/odu ~24/branch 가변).
3. FE 모달(`LineLookupReferenceModal`) 실화면 3탭 실데이터 노출 스크린샷 (실 캡처).

## 4. 게이트 (현재 대기)

- 🔴 SA JSON 키 파일 경로 (개발책임자 배치 후 전달) — **본 슬라이스 착수 전 필수**.
- 🔴 시트가 `samhan@samhan-homepage.iam.gserviceaccount.com` 에 뷰어 공유 확인 (미공유 시 403).

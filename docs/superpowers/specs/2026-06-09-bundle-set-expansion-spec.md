# 세트품목 → 전표 구성품 전개 (GAS 완전 충실) — Spec / 에픽

> **R17 현재 계약:** 과거의 FE `BundleOptionRow`/세트 구성 옵션 picker 표면은 제거되었다. 세트 선택 시 저장된 구성품 행으로 자동 전개하며, 이 문서의 과거 picker 언급은 역사적 설계 기록으로만 남긴다.

> 2026-06-09 개발책임자 지시: 세트품목이 실제 전표에 **세트구성품으로 전개**되어 올라가야 한다(기존 GAS 종합견적서/주문서 동일). 현재 우리 구현은 세트가 전표에 한 줄로 올라감 → GAS 동등성 미달. **완전 충실(가격 재배분 6:4 + 옵션 선별 포함)** 으로 이식.

## 0. 현황 (검증됨)
- `ProductSheetSyncService`: Product 전부 `SINGLE` 고정, BundleComponent 미적재, BUNDLE 미마킹.
- `ProductSeedRunner`: dry-run 전용 → `bundle_component` 실 적재 0.
- `BundleExpander`: 로직 골격만, **production 호출 0**(IT만). `SEND_AS_SET_IDS` = 가짜 placeholder.
- `EstimateToSlipConverter`: estimate_lines → slip_lines **1:1 copy**(전개 없음). `SlipLine`에 세트-구성품 참조 필드 없음.

## 1. GAS 전개 알고리즘 (충실 이식 대상 — `tools/legacy-gas/종합견적서|거래처 발송 주문서`)
- **연결키**: 구성품의 `세트` 컬럼 = 부모 세트 modelCode(정규화 후 매칭). 헤더이름 기반 동적 파싱(`findIdx_`).
- **수량 전파**: 싱글 = 구성품수량 = 세트수량(자식수량 무시, 전부 FOLLOW_SET). 상업 = `수량`='Q'→FOLLOW_SET(세트수량), 숫자 N→FOLLOW_SET(N)(전개 시 세트수량×N — BundleExpander FOLLOW_SET 정합).
- **KEEP(통째 발송) 판정**: 모델/이름 패턴 — 유선보드(`AIM-A01N`)·실링 드레인펌프·발통세트·`SI-AL700a` + 분류 부자재/실외기받침. (정적 ID 아님 → 패턴 매칭.)
- **가격(핵심)**:
  - 싱글: 세트단가를 **실내:실외 6:4(가정)/4:6 비율 재배분**. 고정부품(패널/리모컨/자재/발통=실내·실외 본체 아님) 합계 선차감 → 잔액을 실내/실외 그룹 비례배분(그룹 다수면 기존단가 비례 + 잔차 마지막행), 천원 단위 반올림. 구성품 합 = 세트단가.
  - 상업: 구성품 **개별 단가**(`getRealCommPrice(model)`), 재배분 없음.
- **옵션 선별(picked)**: 패널 1개 선택, 리모컨 선택/교체, 자재 포함여부 — 사용자 옵션으로 구성품 일부만 전개. 발통/유연호스I형/운임/절삭 제외.
- **표시**: 견적=세트헤더+`└[구성]` 들여쓰기 / 전표 payload=**구성품 행만**(헤더행 없음), 싱글 첫 구성품 `isSetHead`+`setId/setName`.

## 2. 설계 결정 (확정)
- **전개 위치 = BE 중심**(DB 진실원 원칙 [[sp-08-legacy-gas-db-api-parity]]). FE 견적화면이 세트+옵션선택을 BE로 전송 → BE가 전개(옵션필터+재배분) → estimate_lines에 구성품 라인 영속 → 전표 1:1 흐름. (GAS는 클라가 explode; 우리는 BE가 진실원.)
- **충실도 = 완전(GAS 동일)** — 6:4 재배분 + 옵션 선별 + 리모컨 교체.
- **상업 구성품 가격 우선순위 = EST(종합견적서) 기준**(납품가>출고가). (ORD와 불일치 → EST 채택.)

## 3. 3-PR 분해
### PR-1 (본 PR) — 데이터 기반: 구성품 적재 + BUNDLE 마킹
- `ProductSheetSyncService`: 싱글구성품/상업멀티구성 탭을 **헤더이름 기반**으로 추가 파싱(`세트`/`구분`/`수량`/`구성품특징`/`규격`) → `BundleComponent` upsert.
- 부모 Product `productType=BUNDLE` 마킹 + `bundleMode`(KEEP 패턴 → KEEP, else EXPAND) + 구성품 `parentBundleSetModel`.
- 수량: 싱글 FOLLOW_SET(qty 1), 상업 'Q'→FOLLOW_SET(1) / N→**FOLLOW_SET(N)**(둘 다 setQty 비례 = legacy explodeCommSets_, BundleExpander FOLLOW_SET=setQty×defaultQty 정합). `componentKind` 매핑(구분 1순위→INDOOR/OUTDOOR/PANEL/REMOTE/MATERIAL/ACCESSORY/FOOT). variant/spec/isDefault. 멱등=부분 유니크 인덱스(V11).
- 멱등 sync + soft-delete(시트에서 사라진 구성품). 실 Postgres IT(부모 BUNDLE + 구성품 N + KEEP 4종).
- 비스코프: 가격 재배분·옵션 선별·전표 전개(PR-2/3).

### PR-2 — 전개 엔진: 6:4 재배분 + 옵션 선별 + 리모컨 교체
- `BundleExpander` 확장: 옵션 파라미터(패널/리모컨/자재) + `splitIndoorOutdoorToK`(재배분) + KEEP 패턴 실연결. GAS fixture 단위테스트(세트→구성품 가격합=세트가 검증).

### PR-3 — 견적/전표 통합 + 직접 전표생성 + FE 옵션 UI
> 개발책임자 2026-06-09 추가: ① 종합견적서로 판매전표 생성, ② **직접 새 전표 생성** 두 경로 모두 **등록된 품목(우리 DB 품목리스트)** 으로 전표 생성 가능해야 함.
- `EstimateService`가 BUNDLE+옵션 수신 → 전개 → estimate_lines 구성품 영속. `EstimateToSlipConverter`/PartnerOrder 경로 흐름.
- **직접 전표생성 경로**: slip-service 신규 전표 생성 시 **product-service 등록품목 catalog 조회**(검색/선택) + 세트 선택 시 동일 BundleExpander 전개 → 구성품 라인. (견적 경유/직접 양쪽 동일 전개 엔진.)
- `SlipLine`/`PartnerOrderLine` 세트헤더/구성품 참조 필드. FE 견적화면 + 직접 전표화면에서 등록품목 세트 선택 후 자동 전개. 전개 회귀 IT(견적→전표 + 직접→전표) + 풀스택 Docker 실QA(세트→전표 구성품).

## 3.5 PR-1b 후속(머지차단 아님 — PR-2 동반 정리 대상)
- **사양 flapping**: 동일 modelCode 가 여러 사양탭/row 로 등장 시 `loadSpecsForProduct` 의 row-단위 soft-delete 가 서로 키를 지워 flapping + soft-deleted 누적(active set 은 last-row-wins 결정적이라 정합). → **syncAll 전역 spec-key 누적 후 1회 reconcile** 로 전환(union, 누적 차단). 실 QA: 7866 active 정상, deleted 누적 관찰.
- **clean bootJar 교훈**: 신규 Flyway 마이그레이션 추가 시 `processResources UP-TO-DATE` 로 jar 에 미반영 → 실 QA 가 구 제약 위반 재현. **standalone QA/배포 전 `clean :bootJar` 필수**([[standalone-boot-real-qa]] 보강).

## 4. 워크플로우
6단계 슬라이스 × 3 PR. **Codex 다운(~6/11) → Claude 대체**(환경한계 예외). QA 에이전트 실 Docker 의무. 각 PR dual리뷰+CI green+Docker 실QA.

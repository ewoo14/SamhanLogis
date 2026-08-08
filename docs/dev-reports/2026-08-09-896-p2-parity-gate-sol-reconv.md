# PR #1146 재수렴 — P2 parity gate 한계·뮤테이션 적대 검증

- 검증일: 2026-08-09 (Asia/Seoul)
- 대상: PR #1146, `feat/896-p2-parity-gate`
- 검증 HEAD: `2b75f6f9250843f49c2e8eb83433b76a3bd8ced7`
- 제한 준수: 코드 수정·commit·push·실 DB/실 Sheets·Docker 작업 없음. 뮤테이션은 OS 임시 디렉터리의 골든/manifest 복사본에만 수행하고 제거했다.

## 판정 — 머지 전 도달 가능한 결함 3건

사용자 요약은 **일부 사실과 다르다**. `27 = 6 + 21`이라는 배열 계수와 21개 이름 자체는 물리 탭 인벤토리와 일치하지만, 실제 게이트 전개에 관여하는 탭은 6개가 아니라 4개다. 따라서 실효 범위는 `27 = 4 + 23`이고, 현재 `scope-outside-tabs`는 `홈멀티`, `구형` 2개를 범위 안인 것처럼 보이게 한다.

1. **한계 과소선언 — 실효 4개 탭을 6개로 표시한다.** `readSource()`는 6개 탭의 `catalog-row`를 읽지만 `createCatalogSource()`와 `expandCatalog()`가 소비하는 것은 `싱글 세트`, `싱글 구성품`, `상업멀티`, `상업멀티 구성`뿐이다. 임시 manifest에서 `홈멀티`와 `구형`의 `model`·`price`를 각각 바꿔도 두 실행 모두 `EXIT 0 / PASS`였다.
2. **`uncovered`가 다른 실행 축을 누락한다.** `02-set-expansion.json`의 직렬화된 행 필드만 보면 미비교 필드는 `feature`, `isDefault` 두 개가 전부다. 그러나 게이트는 수량 1·기본 옵션·기본 가격의 단일 상태만 실행하며 P0의 `04-quantity-derived`, `05-price-scenarios`, `06-toggle-off-on` 골든을 읽지 않는다. 또한 상업 전개는 레거시 `explodeCommSets_`를 실행하지 않고 게이트 내부 `expandCommercial()`로 재구현한다. 이 한계들은 출력에 없다.
3. **`#1089` 결론의 근거가 잘못됐다.** “이 게이트는 #1089를 검증하지 못한다”는 결론 자체는 맞다. 그러나 원천 데이터가 축을 담지 못한 것이 아니다. P0 원천 카탈로그에는 `feature` 비공백 1,451행과 `isDefault=true` 855행이 있고 `03-options-features-defaults.json`에도 그대로 남는다. `02-set-expansion` 캡처가 `explodeSetParts()` 반환 객체에서 이미 빠진 `feat`·`isDefault`를 읽어 기본값으로 만든다. 더 근본적으로 #1089는 삼한 퍼블릭 4개 화면만 대상이고 레거시 GAS는 명시적 비대상인데, 이 게이트는 레거시 GAS 전개 parity 게이트다.

비교 대상으로 남은 8개 필드의 뮤테이션 감지는 모두 정상이고, 무변경 연속 2회도 결정적이었다.

## (a) 한계 선언 검증

### 물리 탭 집합 계수

`docs/dev-reports/2026-08-08-896-sheet-tab-inventory.md`의 27개 탭 이름과 게이트의 `ALL_SHEET_TABS`를 독립 대조했다.

```text
INVENTORY=27 unique=27
ALL=27 unique=27
SOURCE=6 OUTSIDE=21 SUM=27
MISSING=[]
EXTRA=[]
OVERLAP=[]
SCOPE_EXIT=0
```

따라서 하드코딩된 집합의 **산술과 이름 대조는 `27 = 6 + 21`로 맞고, 중복·누락도 없다.** 그러나 이것은 실효 범위 계수가 아니다.

manifest의 `catalog-row` 분포는 다음과 같다.

| sourceTab | 행 | 게이트 전개 소비 |
|---|---:|---|
| 홈멀티 | 109 | 아니오 |
| 싱글 세트 | 226 | 예 |
| 싱글 구성품 | 1,451 | 예 |
| 상업멀티 | 392 | 예 |
| 상업멀티 구성 | 516 | 예 |
| 구형 | 41 | 아니오 |

임시 source 뮤테이션 결과:

```text
SOURCE_MUTATION=홈멀티 PREP_EXIT=0 GATE_EXIT=0 RESULT=PASS: 전개 상세행 0건 차이
SOURCE_MUTATION=구형 PREP_EXIT=0 GATE_EXIT=0 RESULT=PASS: 전개 상세행 0건 차이
SOURCE_MUTATION=component-feature PREP_EXIT=0 GATE_EXIT=0 RESULT=PASS: 전개 상세행 0건 차이
```

따라서 현재 21개 밖 목록은 물리 집합의 여집합으로는 맞지만, **게이트가 실제로 보지 않는 탭 목록으로는 2개가 빠졌다.** 실효 계수는 다음이다.

```text
실효 전개 sourceTab 4개
실효 scope-outside-tabs 23개 = 현재 21개 + 홈멀티 + 구형
27 = 4 + 23
```

### `uncovered` 과소선언

`02-set-expansion.json` 스키마의 키를 전수 열거하면 set은 `model/name/quantity/error/parts`, part는 `model/name/kind/feature/isDefault/unit/quantity/unitPrice/subtotal/spec`이다. 게이트는 set count·part count·set 4필드와 part 8필드를 비교한다. **직렬화된 `02` 행 필드에 한정하면** 미비교 필드는 출력한 `feature`, `isDefault` 두 개가 전부다.

그러나 실행 범위에는 다음 미검증 축이 더 있다.

- P0 `04-quantity-derived.json`의 수량 입력 5개: 게이트는 모든 set을 수량 1로만 전개한다.
- P0 `05-price-scenarios.json`의 가격 시나리오 5개: 게이트는 별도 가격 시나리오 골든을 읽지 않는다.
- P0 `06-toggle-off-on.json`: 자재 포함, 리모컨/판넬 선택, 단가 인상 등 toggle off/on 축을 읽지 않는다. 게이트 VM은 `PRICE_INC={single:{}}`, `SHOW_I_HOSE=false`, DOM 기본값, `allowRemoteChange_=false`로 고정한다.
- 상업 전개의 레거시 함수 축: `buildLegacyExpander()`는 싱글 `explodeSetParts()`만 추출한다. 상업은 `expandCommercial()` 자체 구현이므로 레거시 `explodeCommSets_` 변경을 직접 검증하지 않는다.
- manifest의 `component-feature` 1,451행: `readSource()`가 `recordType === 'catalog-row'`만 남기므로 이 레코드의 `feature/isDefault` 뮤테이션은 `EXIT 0`이다.
- 삼한 퍼블릭의 기본 구성품 전개 축: 이 게이트의 oracle과 실행 대상은 #1089에서 명시적으로 제외한 레거시 GAS다.

따라서 현재 `uncovered: feature · isDefault`만으로는 “나머지 실행 축은 모두 검증했다”는 오독을 막지 못한다.

## (b) 남은 8개 필드 뮤테이션

방법: 커밋 골든을 OS 임시 디렉터리에 필드별로 복사하고 `single[0].parts[0]`의 해당 필드만 변경한 뒤 `--golden=<임시 복사본>`으로 실행했다. 각 게이트 실행 직후 `$LASTEXITCODE`를 저장했으며 파이프 뒤 종료코드를 읽지 않았다.

| 필드 | 뮤테이션 | 게이트 로그 | 종료 |
|---|---|---|---:|
| `model` | 문자열 suffix 추가 | `FAIL: 차이 1건`, `필드=model` | 1 |
| `name` | 문자열 suffix 추가 | `FAIL: 차이 1건`, `필드=name` | 1 |
| `kind` | 문자열 suffix 추가 | `FAIL: 차이 1건`, `필드=kind` | 1 |
| `unit` | 문자열 suffix 추가 | `FAIL: 차이 1건`, `필드=unit` | 1 |
| `quantity` | `1 → 2` | `FAIL: 차이 1건`, `필드=quantity` | 1 |
| `unitPrice` | `606000 → 606001` | `FAIL: 차이 1건`, `필드=unitPrice` | 1 |
| `subtotal` | `606000 → 606001` | `FAIL: 차이 1건`, `필드=subtotal` | 1 |
| `spec` | 문자열 suffix 추가 | `FAIL: 차이 1건`, `필드=spec` | 1 |

대표 원문:

```text
FIELD=model PREP_EXIT=0 GATE_EXIT=1
FAIL: 차이 1건
- 세트=AC060CS6PBH1SY 모델=AC060CN6PBH1 필드=model 기대="AC060CN6PBH1__SOL_MUT__" 실제="AC060CN6PBH1"

FIELD=quantity PREP_EXIT=0 GATE_EXIT=1
FAIL: 차이 1건
- 세트=AC060CS6PBH1SY 모델=AC060CN6PBH1 필드=quantity 기대=2 실제=1

FIELD=unitPrice PREP_EXIT=0 GATE_EXIT=1
FAIL: 차이 1건
- 세트=AC060CS6PBH1SY 모델=AC060CN6PBH1 필드=unitPrice 기대=606001 실제=606000
```

### 골든 복구·무손상 증명

```text
GOLDEN_HASH_BEFORE=C8F85E9320722C75F4800EF914CD1B86856CBF32E6BA512ACB1F0E475615DA97
GOLDEN_HASH_AFTER=C8F85E9320722C75F4800EF914CD1B86856CBF32E6BA512ACB1F0E475615DA97
GOLDEN_HASH_EQUAL=True
GOLDEN_DIFF_BEGIN
<빈 출력>
GOLDEN_DIFF_END
```

뮤테이션 직후 `git status --short`에는 세션 시작 전부터 있던 미추적 문서 2개만 남았고, 커밋된 골든·코드 변경은 없었다.

## (c) 정상 오탐 없음

아무 파일도 바꾸지 않은 상태에서 게이트를 연속 2회 실행했다.

```text
NORMAL1_EXIT=0
NORMAL2_EXIT=0
NORMAL1_SHA256=C7420355D353778826C753117B949FDA7F3D44A3B3AC7FECD1565D8E56A490AC
NORMAL2_SHA256=C7420355D353778826C753117B949FDA7F3D44A3B3AC7FECD1565D8E56A490AC
OUTPUT_EQUAL=True
sets: single=226/226, commercial=86/86
PASS: 전개 상세행 0건 차이
```

두 실행 모두 `EXIT 0`이고 전체 출력 바이트의 SHA-256이 동일하다.

## (d) 증거 무결성

현재 `runGate()`가 만든 actual과 커밋 골든 expected의 동일 index/필드를 엄격 비교했다. 차이가 있으면 프로세스 종료코드를 1로 설정했다.

```text
DIFF_TOTAL=1361
single feature=682
single isDefault=679
commercial feature=0
commercial isDefault=0
EVIDENCE_EXIT=1
```

따라서 보고서의 `차이 1,361건`, `feature 682`, `isDefault 679`는 재현된다.

골든 계수도 재현된다.

```text
GOLDEN single sets=226 parts=682 featureNonEmpty=0 isDefaultTrue=0
GOLDEN commercial sets=86 parts=170 featureNonEmpty=0 isDefaultTrue=0
```

manifest의 PM 계수:

| 계수 | 재현값 |
|---|---:|
| GAS formula items / groups / substantive groups | 3,392 / 2,649 / 2,648 |
| main sheet tabs / code-read tabs | 27 / 17 |
| catalog reference models / price cells | 1,118 / 8,094 |
| catalog rows | 2,735 |
| single / commercial set rows | 226 / 86 |
| component feature rows | 1,451 |
| quantity inputs / price scenarios | 5 / 5 |
| source manifest records | 4,186 |

수치 인용은 재현되지만 해석은 수정해야 한다. 1,361건은 “골든 원천 전 행이 실제 기본값”의 증거가 아니라, `02-set-expansion` 파생 캡처가 두 속성을 버린 결과와 현재 게이트 actual이 원천 메타데이터를 다시 붙인 결과의 차이다.

## (e) `#1089` 축 발견의 타당성

### 결론

**“이 게이트는 #1089 축을 검증하지 못한다”는 결론은 맞다.** 다만 보고서가 든 이유는 불완전하고 일부 틀리다.

### 필드가 떨어진 정확한 경로

1. P0 원천 `01-catalog-and-categories.json`: 2,735행 중 `feature` 비공백 1,451행, `isDefault=true` 855행.
2. P0 `03-options-features-defaults.json`: 구성품 1,451행에 같은 `feature`·`isDefault` 축이 보존된다.
3. `tools/legacy-gas/종합견적서/index.html`의 `explodeSetParts()`는 source part를 `mapped`로 만들 때와 반환할 때 `feat`, `isDefault`를 복사하지 않는다. 반환 객체는 `section/name/model/unit/qty/price/kind/spec`뿐이다.
4. `docs/qa/896-legacy-output-baseline/capture-baseline.mjs`는 그 반환값을 받은 뒤 `part.feat ?? ''`, `part.isDefault === true`로 정규화한다. 이미 속성이 없으므로 `feature=''`, `isDefault=false`가 된다.
5. `scripts/generate-896-p0-golden-manifest.mjs`는 이 파생 `02-set-expansion.json`을 그대로 P0 골든으로 복사한다.

즉 **P0 원천 수집이 아니라 `02-set-expansion` 파생 캡처 경계에서 소실**된다.

### #1089와의 대상 불일치

GitHub Issue #1089 본문은 다음을 명시한다.

```text
대상: 삼한 퍼블릭 견적서 · 주문서 · 구매전표 · 판매전표
비대상: 레거시 GAS 종합견적서 · 주문서 웹 — 현행 세트전개 유지
기본 = bundle_component.is_default = true
```

현재 게이트는 레거시 GAS `explodeSetParts()`와 P0 레거시 출력 골든을 비교한다. 따라서 `isDefault`가 파생 골든에 보존되더라도 이것만으로 삼한 퍼블릭 4개 화면의 `bundle_component.is_default=true` 필터를 검증할 수 없다. 보고서의 결론은 유지하되, 근거는 “골든 전 행이 기본값”이 아니라 **파생 캡처 소실 + 검증 대상 시스템 불일치**로 고쳐 읽어야 한다.

## 이 라운드가 보지 않은 것

- 코드 수정안·골든 재생성안·DB 적재/스키마 설계의 적절성은 검토하지 않았다.
- 실 Google Sheets와 현재 저장소의 27개 탭 목록을 다시 온라인 조회하지 않았다. 커밋된 2026-08-08 읽기 전용 인벤토리와 게이트 목록만 대조했다.
- 실 DB 쓰기/조회, 실 Sheets 접근, Docker 재배포, 데스크톱 4개 화면의 #1089 실제 동작은 실행하지 않았다.
- 8개 필드 뮤테이션은 커밋 골든의 임시 복사본에서 첫 single part 한 행씩 수행했다. 각 필드의 모든 행·모든 section을 변형한 것은 아니다.
- P0 `01`, `03`~`06` 골든 자체의 품질은 증거 무결성과 현재 한계 판정에 필요한 범위만 읽었다.

## 신규 파일

이번 라운드에서 만든 파일:

```text
docs/dev-reports/2026-08-09-896-p2-parity-gate-sol-reconv.md
```

세션 시작 전에 이미 있던 아래 미추적 파일은 수정하지 않았다.

```text
docs/dev-reports/2026-08-09-896-p2-parity-gate-sol-verify.md
docs/superpowers/plans/2026-08-09-896-p2-parity-gate.md
```

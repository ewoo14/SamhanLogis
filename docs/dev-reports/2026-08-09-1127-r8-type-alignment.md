# PR #1127 R8 — R7 타입 정합성 수정

## ① 두 타입의 의미와 수정 방식

`TabSyncResult`와 `ComponentSyncResult`는 같은 결과를 뜻하지 않는다.

- `clients/desktop/src/renderer/api/sheetSyncApi.ts:25`의 `TabSyncResult`는 Product 탭의 `insertedRows`, `updatedRows`, `softDeletedProductRows`를 표현한다.
- `clients/desktop/src/renderer/api/sheetSyncApi.ts:40`의 `ComponentSyncResult`는 구성품 탭의 `linkedOccurrences`, `bundlesMarkedProducts`, `softDeletedComponentRows`를 표현한다.
- `clients/desktop/src/renderer/api/sheetSyncApi.ts:57`에서 `SyncSummary.byTab`가 `Record<string, TabSyncResult>`이고, `sheetSyncRows.ts:18`에서 `byComponentTab`가 `Record<string, ComponentSyncResult>`로 분리되어 있다.
- `clients/desktop/src/renderer/routes/admin/sheetSyncRows.ts:54`의 `normalizeResult`가 API 타입에서 화면용 행 결과로 변환하는 경계다.

따라서 두 API 타입을 합치거나 넓히지 않았다. `SheetSyncRowResult`를 화면 투영 타입으로 유지하고, `SheetSyncPage.tsx:336`의 `formatTabRemark`가 그 화면 타입을 받도록 고쳤다. `sheetSyncRows.ts:30`에는 `SheetSyncRow[]`를 명시해 Product 행과 Component 행의 discriminant(`'product' | 'component'`)를 보존했다.

기준 실패 원문:

```text
src/renderer/routes/admin/SheetSyncPage.tsx(250,38)
  error TS2345: Argument of type 'SheetSyncRowResult' is not assignable to parameter of type 'TabSyncResult'

src/renderer/routes/admin/sheetSyncRows.ts(39,7)
  error TS2322: Type '"component"' is not assignable to type '"product"'
```

## ② `product`/`component` 표현

`SheetSyncRow.kind`는 `sheetSyncRows.ts:25`의 `'product' | 'component'`로 표현한다. Product 행은 `insertedRows`·`updatedRows`·`softDeletedProductRows`, 구성품 행은 `linkedOccurrences`·`bundlesMarkedProducts`·`softDeletedComponentRows`를 각각 렌더링한다(`SheetSyncPage.tsx:241-247`). 한쪽 값을 다른 쪽으로 좁히거나 타입을 느슨하게 만들지 않았다.

## ③ R7 불변식 다섯 가지 원문

### 1. `softDeletedComponentRows` 3건 → 화면 3

```text
✓ API의 softDeletedComponentRows 3건을 화면에 3건으로 표시한다
Test Files  1 passed (1)
Tests       3 passed (3)
```

구현 경계 원문:

```text
sheetSyncRows.ts:44  softDeletedComponentRows: result.softDeletedComponentRows,
sheetSyncRows.ts:60  softDeletedComponentRows: result.softDeletedComponentRows ?? 0,
SheetSyncPage.tsx:246 {kind === 'component' ? result.softDeletedComponentRows : result.softDeletedProductRows}
```

### 2. `linkedOccurrences` 라벨

```text
SheetSyncPage.tsx:205: 신규 Product row / 연결 occurrence
SheetSyncPage.tsx:241: {kind === 'component' ? result.linkedOccurrences : result.insertedRows}
```

### 3. 옛 이름 grep 0건

대상은 이번 시트 sync 계열의 `sheetSyncApi.ts`, `SheetSyncPage.tsx`, `sheetSyncRows.ts`, `sheetSyncRows.test.ts`다.

```text
rg -n --glob '*.{ts,tsx}' '\b(softDeletedRows|inserted|updated|softDeleted|skipped|preservedManual|linked|bundlesMarked)\b' ...
rg_exit=1
```

`rg_exit=1`은 매칭 0건을 뜻한다. 다른 도메인의 `updated`/`skipped` 필드는 이 계약의 옛 이름이 아니므로 범위에서 제외했다.

### 4. suffix 강제 테스트 mutation RED

정본 Gradle 결과 XML 원문:

```text
<testcase name="sync_카운터_필드는_단위_suffix를_강제한다()" classname="com.samhanair.logis.product.it.ProductSheetSyncServiceIT" time="0.008"/>
```

또한 화면 매핑을 일회성으로 `softDeletedComponentRows: 0`으로 mutation한 뒤 실행한 원문:

```text
AssertionError: expected +0 to be 3 // Object.is equality
- Expected
- 3
+ Received
+ 0
1 failed | 2 passed (3)
```

mutation은 검증 직후 원래 `result.softDeletedComponentRows ?? 0`으로 복구했다.

### 5. API↔화면 필드 계약 mutation RED

위 일회성 mutation은 API의 `softDeletedComponentRows: 3`을 화면 변환에서 버리는 계약 mutation이다. 실제 RED 원문은 다음과 같다.

```text
src/renderer/routes/admin/sheetSyncRows.test.ts > buildSheetSyncRows > API의 softDeletedComponentRows 3건을 화면에 3건으로 표시한다
AssertionError: expected +0 to be 3 // Object.is equality
- Expected  3
+ Received  0
```

즉 API 필드를 화면에서 0으로 바꾸면 기대 3/수신 0으로 실패하며, 현재 구현은 이 mutation을 살려두지 않는다.

### 정정 — R9 `totalUnchanged` 검색 범위 보완

당시 위 검색식에는 `unchanged`/`totalUnchanged`가 포함되어 있지 않았다. 따라서 이 절의 "0건"은 `ProductLookupSheetSyncService.totalUnchanged`까지 포함한 전수 검색 결과가 아니었다. R9에서 `ProductLookupSheetSyncService`의 내부 집계 필드를 형제 필드 규칙에 맞춰 `totalUnchangedRows`로 개명하여 이 누락을 닫았다. 새 검증에는 다음 검색식을 원문 그대로 사용했다.

```powershell
git grep -n -I -w -- totalUnchanged -- services/ clients/
```

R9 변경 후 위 검색식은 0건이며, `tools/legacy-gas/**`의 동명 지역변수는 별도 코드베이스라 대상에 포함하지 않았다.

## ④ 정본 typecheck와 같은 계열 전수 결과

실행 위치: `clients/desktop`

```text
> npx tsc -p tsconfig.node.json --noEmit
Exit code: 0

> npx tsc -p tsconfig.web.json --noEmit
Exit code: 0
```

관련 Vitest:

```text
✓ API의 softDeletedComponentRows 3건을 화면에 3건으로 표시한다
✓ RED-A: 전체 실패 11건을 failedTabs와 같은 11행으로 만든다
✓ RED-B: 구성품을 구분하고 skip은 실패 행으로 중복하지 않으며 빈 구성품도 숨긴다
Test Files  1 passed (1)
Tests       3 passed (3)
```

같은 계열 전수 확인 결과는 다음과 같다.

- FE API 타입, admin 화면, 행 변환기/테스트 전체에서 Product 카운터는 `insertedRows`, `updatedRows`, `softDeletedProductRows`, `skippedOccurrences`로만 사용된다.
- 구성품 카운터는 `linkedOccurrences`, `bundlesMarkedProducts`, `softDeletedComponentRows`, `skippedOccurrences`로만 사용된다.
- Backend `ProductSheetSyncService`와 `ProductSheetSyncServiceIT`에도 동일한 분리가 반영되어 있다. `ProductSheetSyncService.java:1172-1176`, `2126-2130`, `ProductSheetSyncServiceIT.java:652`, `766`에서 확인했다.
- 이번 변경으로 추가 타입 오류는 `rg` 및 두 정본 typecheck에서 발견되지 않았다.

Gradle 정본 실행:

```text
> .\\gradlew :services:product-service:test --tests '*Sync*' --rerun-tasks
Exit code: 0
Note: Some input files use or override a deprecated API.
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes...
```

## 신규 파일 경로

```text
docs/dev-reports/2026-08-09-1127-r8-type-alignment.md
```

코드 신규 파일은 없고, 기존 수정 파일은 다음 세 개다.

```text
clients/desktop/src/renderer/routes/admin/SheetSyncPage.tsx
clients/desktop/src/renderer/routes/admin/sheetSyncRows.ts
clients/desktop/src/renderer/routes/admin/sheetSyncRows.test.ts
```

커밋/푸시는 하지 않았다. 기존 미추적 `clients/desktop/playwright/1127-r7-sol-reconv-real-qa/` 디렉터리는 건드리지 않았다.

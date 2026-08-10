# PR #1156 R13 — CI 회복 전용 라운드

일자: 2026-08-10  
브랜치: `fix/1155-inbound-partner-code`  
기준 HEAD: `45d7c0f51e50ec2fe2c1baecff3726cb2ef45b67`

## 범위

`clients/desktop/src/renderer/api/mock.ts`의 홈택스 batch mock CSV 응답에서 R12 이후 남아 있던 옛 필드명 참조만 새 DTO 필드명으로 정합화했다.

- `issueDate` → `writeDate`
- `supplierBusinessNo` → `supplierRegNo`
- `recipientName` → `buyerName`
- `recipientBusinessNo` → `buyerRegNo`

동일 mock 생성부의 R12 코드에서 TypeScript target 호환성 오류를 내던 `replaceAll('-', '')` 2곳은 값이 동일한 `replace(/-/g, '')`로 바꿨다. mock 값, 행 수, CSV 열 순서와 열 값은 변경하지 않았다.

변경 파일은 `mock.ts`와 본 보고서뿐이다. 커밋·푸시는 하지 않았다. 신규 생성 파일은 본 보고서 1개다.

## RED-A — 수정 전 원문

실행: `cd clients/desktop; npm run typecheck`

수정 전 `tsc -p tsconfig.web.json --noEmit`에서 다음 TS2339 8건을 재현했다.

```text
src/renderer/api/mock.ts(13238,31): error TS2339: Property 'issueDate' does not exist
src/renderer/api/mock.ts(13238,60): error TS2339: Property 'supplierBusinessNo' does not exist
src/renderer/api/mock.ts(13239,13): error TS2339: Property 'recipientName' does not exist
src/renderer/api/mock.ts(13239,30): error TS2339: Property 'recipientBusinessNo' does not exist
src/renderer/api/mock.ts(13339,31): error TS2339: Property 'issueDate' does not exist
src/renderer/api/mock.ts(13339,60): error TS2339: Property 'supplierBusinessNo' does not exist
src/renderer/api/mock.ts(13340,13): error TS2339: Property 'recipientName' does not exist
src/renderer/api/mock.ts(13340,30): error TS2339: Property 'recipientBusinessNo' does not exist
```

같은 실행에서 R12가 도입한 `replaceAll` 관련 TS2550 2건도 함께 확인되어 ES2020 호환 표현으로 정리했다.

## 옛 이름 저장소 전수 표

기준: `git grep -n -F`로 Git 추적 파일 전체 검색. `mock.ts` 열의 잔여 항목은 홈택스 batch row가 아닌 별도 도메인이다.

| 옛 이름 | 저장소 전체 적중 | `mock.ts` 적중 | 판정 |
|---|---:|---:|---|
| `issueDate` | 160 | 4 | 약속어음 mock의 발행일/타입·생성값. 홈택스 batch 참조 아님 |
| `supplierBusinessNo` | 10 | 0 | 홈택스 batch mock 잔여 0. API DTO·서버 계약은 범위 밖 |
| `recipientName` | 39 | 2 | 외부 배송 요청 mock의 수령자 필드/타입. 홈택스 batch 참조 아님 |
| `recipientBusinessNo` | 6 | 0 | 홈택스 batch mock 잔여 0. 타 API·문서 계약은 범위 밖 |

결론: R12가 변경한 홈택스 batch mock 행을 소비하는 `mock.ts` 내부의 옛 이름 4개는 0건이다. 동명 필드를 사용하는 별도 도메인과 DTO는 변경하지 않았다.

## 검증 실행 원문

### typecheck

```text
> @samhan/desktop@0.1.0 typecheck
> node scripts/real-qa-scope.cjs --phase=typecheck && tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && npm run typecheck:real-qa

✔ real-QA cleanup scope checks: 2 passed
✔ real-QA scope checks: 50 passed
Exit code: 0
```

### lint

```text
> @samhan/desktop@0.1.0 lint
> eslint "src/**/*.{ts,tsx}"

✖ 157 problems (0 errors, 157 warnings)
Exit code: 0
```

### Vitest

```text
npx vitest run
Test Files  232 passed (232)
Tests       2067 passed (2067)
Exit code: 0
```

mock 관련 확인:

```text
src/renderer/api/mock.test.ts  138 tests passed
```

### build

```text
npm run build
✓ built in 177ms
✓ built in 46ms
✓ built in 8.31s
Exit code: 0
```

빌드에는 기존 경고(legacy source 없음, 폰트 resolve 지연, 동적/정적 import 혼용)가 있었으나 실패는 없었다.

### DataGrid Playwright

실행한 명령:

```text
npx playwright test datagrid
npx playwright test playwright/datagrid/datagrid-interaction.spec.ts --reporter=line
```

두 실행 모두 web server/브라우저 실행 결과를 내지 못하고 각각 약 240초/180초 제한으로 `Exit code: 124` timeout 됐다. 따라서 DataGrid Playwright의 fresh pass 수치는 확보하지 못했다. 이 라운드에서 새 Playwright 파일이나 캡처는 생성하지 않았다.

### 변경 상태

```text
git diff --check
Exit code: 0

git status --short
 M clients/desktop/src/renderer/api/mock.ts
?? docs/dev-reports/2026-08-10-1156-r13-mock-name-parity.md
```

## 못 한 것

- DataGrid Playwright는 로컬 web server/브라우저 실행이 timeout되어 통과 원문을 확보하지 못했다.
- `PartnerAuthService.java:144,326`, 서버 코드, DTO, `tools/legacy-gas/**`, 실 DB, main, 커밋·푸시는 건드리지 않았다.

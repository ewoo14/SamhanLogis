# PR #1130 R4 — MASTER 권한 계약 감시 보강

## 판정

R3 진단은 맞았다. 기존 검사는 MASTER를 제외한 10역할만 순회했고, MASTER의
`/auth/admin/permissions/my` mock 응답은 `inbound.inspection`을 `1111111`로
반환했다. R4에서 MASTER를 포함한 mock 역할 전수 exact 검사를 추가하고, 해당
mock 셀을 실 DB 계약 `1111000`으로 수정했다.

V98 파일·실 DB·다른 page mock 비트는 변경하지 않았다.

## ① 역할 전수 순회와 양방향 검사

역할 목록을 테스트에 별도로 손으로 나열하지 않는다. mock이 제공하는 전체 권한
매트릭스 endpoint에서 역할 key를 읽는다.

- `clients/desktop/src/renderer/test-utils/inbound-permission-contract.test.ts:33-40`
  — `GET /auth/admin/permissions`의 `Object.keys(response.data)`를 mock 역할
  집합으로 사용한다.
- `clients/desktop/src/renderer/test-utils/inbound-permission-contract.test.ts:49-50`
  — mock 역할 집합과 기대표 key 집합을 양방향 `toEqual`로 비교한다. mock에 새
  역할이 추가되거나 기대표에서 역할이 빠지면 실패한다.
- `clients/desktop/src/renderer/test-utils/inbound-permission-contract.test.ts:52-53`
  — mock이 낸 역할 집합을 기준으로 모든 역할을 순회하고 7비트 exact 비교를 한다.
- `clients/desktop/src/renderer/api/mock.ts:19138-19157`
  — MASTER와 `SP_D1_ROLES` 전체를 `_mockPermissionCells`에 생성하는 mock 역할
  원천이다.

비트 순서는 기존 테스트의 `ACTIONS` 선언(`.../inbound-permission-contract.test.ts:3`)
과 동일하다.

```text
can_view / can_create / can_update / can_delete / can_restore / can_download / can_print
```

## ② MASTER mock 셀 수정

`clients/desktop/src/renderer/api/mock.ts:13925-13930`의 MASTER
`/auth/admin/permissions/my` 분기에서 `inbound.inspection`만
`allActions.slice(0, 4)`로 반환하도록 했다. 결과는 `VIEW/CREATE/UPDATE/DELETE`
이며 7비트는 `1111000`이다. MASTER의 다른 page mock 비트는 기존 `allActions`
그대로 유지된다.

## ③ Playwright 영향 전수 grep

다음 범위를 전수 검색했다.

```text
rg -n --hidden --glob '!node_modules' \
  "inbound\.inspection" clients/desktop/playwright \
  --glob '*.{spec,test}.{ts,tsx,js,jsx}'
```

결과:

- `inbound.inspection`을 참조하는 Playwright spec은 검수 CTA·page-code 정적 계약이다.
- MASTER로 `inbound.inspection`의 다운로드 또는 인쇄를 사용하는 spec은 0건이다.
- 따라서 MASTER 셀을 `1111111`에서 `1111000`으로 좁혀도 확인된 Playwright 영향은
  없다.
- 관련 파일의 다른 MASTER 화면과 `inbound.inspection` 자체의 view/검수 CTA 계약은
  존재하지만, 다운로드·인쇄 사용은 확인되지 않았다.

## ④ 뮤테이션 3종 RED와 복구 증명

각 뮤테이션은 `clients/desktop`에서 다음 명령으로 실행했다.

```text
npx vitest run src/renderer/test-utils/inbound-permission-contract.test.ts
```

1. 권한 없는 DRIVER에 UPDATE 임시 부여

원문 임시 변경: `MOCK_ACTION_MATRIX_OVERRIDES`에
`DRIVER:inbound.inspection`의 `update: true`를 추가했다.

```text
DRIVER inbound.inspection: expected '0010000' to be '0000000'
Test Files  1 failed (1)
Tests       1 failed (1)
Exit code: 1
```

임시 override 블록을 삭제해 원복했다. 복구 뒤 `git status --short`에는 기존 의도
변경인 `mock.ts`, `inbound-permission-contract.test.ts`만 남았고, DRIVER 임시
override는 diff에 남지 않았다.

2. MASTER PRINT 초과 비트 삽입

원문 임시 변경: MASTER inbound 응답을
`['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'PRINT']`로 바꿨다.

```text
MASTER inbound.inspection: expected '1111001' to be '1111000'
Test Files  1 failed (1)
Tests       1 failed (1)
Exit code: 1
```

원래의 `allActions.slice(0, 4)`로 복구했다. 복구 뒤 status에는 의도한 두 파일만
남았고 PRINT 삽입은 diff에 남지 않았다.

3. MASTER 필요한 UPDATE 비트 제거

원문 임시 변경: MASTER inbound 응답을
`['VIEW', 'CREATE', 'DELETE']`로 바꿨다.

```text
MASTER inbound.inspection: expected '1101000' to be '1111000'
Test Files  1 failed (1)
Tests       1 failed (1)
Exit code: 1
```

원래의 `allActions.slice(0, 4)`로 복구했다. 복구 뒤 status에는 의도한 두 파일만
남았고 UPDATE 제거는 diff에 남지 않았다.

최종 `git diff --check`도 종료코드 0이며, 최종 status는 다음 두 파일뿐이다.

```text
 M clients/desktop/src/renderer/api/mock.ts
 M clients/desktop/src/renderer/test-utils/inbound-permission-contract.test.ts
```

## ⑤ #1145 349셀 동결 목록 상호작용

있다. `#1145` 최신 R11 커밋 `14445b883`의
`clients/desktop/src/renderer/test-utils/permission-mock-divergences.ts`에
다음 셀이 동결되어 있다.

```text
role: MASTER
pageCode: inbound.inspection
snapshotBits: 1111000
mockBits: 1111011
```

R4는 이 셀의 mock `/permissions/my` 값을 `1111000`으로 고친다. 따라서 #1145의
349셀 동결 목록과 함께 머지될 때 이 셀의 동결 상태가 어긋난다는 사실을 보고한다.
`#1145` 파일과 동결 목록은 수정하지 않았다.

## 검증

```text
npx vitest run src/renderer/test-utils/inbound-permission-contract.test.ts
Test Files  1 passed (1)
Tests       1 passed (1)
```

기존 관련 테스트:

```text
npx vitest run \
  src/renderer/test-utils/inbound-permission-contract.test.ts \
  src/renderer/api/mock.test.ts \
  src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts

Test Files  3 passed (3)
Tests       162 passed (162)
```

실 DB 쓰기, V98 변경, commit, push는 수행하지 않았다.

## 신규 파일 경로

```text
docs/dev-reports/2026-08-09-1130-r4-master-contract.md
```

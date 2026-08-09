# PR #1130 R5 — MASTER 런타임 전권 정본 교정

## 판정

R4의 `1111000` 변경은 잘못된 정본을 사용한 결함이었다. `DynamicPermissionService`는
MASTER에 대해 DB 템플릿을 조회하지 않고 모든 PageCode에 전권을 하드코딩하므로,
desktop mock은 런타임 응답인 `1111111`을 미러링해야 한다.

커밋·push·실 DB 쓰기·V98 수정은 하지 않았다.

## ① R4 변경 되돌림

R4 fix diff(`464655caf`)를 먼저 읽어 확인한 변경은 다음 두 가지였다.

- `clients/desktop/src/renderer/api/mock.ts`: MASTER의
  `inbound.inspection`만 `allActions.slice(0, 4)`로 바꾸어 `1111111 → 1111000`.
- `clients/desktop/src/renderer/test-utils/inbound-permission-contract.test.ts`:
  기대값 MASTER를 `1111000`으로 추가.

R5는 그 변경만 되돌렸다. 역할 전수·양방향 exact 검사와 MANAGER V98 override는
건드리지 않았다.

## ② MASTER 정본 분기

- `clients/desktop/src/renderer/api/mock.ts:13925-13932`
  — MASTER는 모든 `SP_D1_PAGES`와 `system.permission-admin`에 `allActions`를
  반환한다.
- `clients/desktop/src/renderer/test-utils/inbound-permission-contract.test.ts:10-29`
  — `MASTER`는 `masterRuntimeBits = '1111111'`을 사용하고, 그 외 역할만
  `templateExpectedBits`를 사용한다.

분기 근거 주석은 `mock.ts:13926-13927` 및 테스트 `:25-27`에 남겼다.
근거는 `services/auth-service/src/main/java/com/samhanair/logis/auth/service/
DynamicPermissionService.java:192-205`의 “DB row와 무관하게 모든 PageCode를
canView=true/canEdit=true 반환”하는 런타임 분기다.

## ③ 전권 규칙 단정 테스트

`inbound-permission-contract.test.ts:65-76`의 계약 테스트에 다음 전권 단정을
통합했다.

`MASTER 는 모든 반환 page code에서 런타임 전권이다` — `/auth/admin/permissions/my`
응답의 모든 page code가 `VIEW, CREATE, UPDATE, DELETE, RESTORE, DOWNLOAD, PRINT`
7개 action을 정확히 갖는지 검사한다. 기존 테스트 수 `162/162`를 유지하면서도
MASTER의 어느 한 비트를 제거하거나 템플릿 값으로 되돌리면 RED가 된다.

## ⑤ 뮤테이션 재증명

모든 변이는 동일한 명령으로 실행하고 즉시 원복했다.

```text
npx vitest run src/renderer/test-utils/inbound-permission-contract.test.ts
```

1. MASTER 전권에서 PRINT 제거: RED

```text
MASTER inbound.inspection: expected '1111110' to be '1111111'
MASTER accounting.tax-invoice.emit-nts: expected ... 'PRINT' ...
Test Files 1 failed; Tests 2 failed
```

2. 권한 없는 DRIVER에 UPDATE 부여: RED

```text
DRIVER inbound.inspection: expected '0010000' to be '0000000'
Test Files 1 failed; Tests 1 failed, 1 passed
```

3. mock에만 `MOCK_ONLY_ROLE` 추가: RED

```text
expected mock role list ... 'MOCK_ONLY_ROLE' ...
Test Files 1 failed; Tests 1 failed, 1 passed
```

4. 기대표에만 `EXPECTED_ONLY_ROLE` 추가: RED

```text
expected ... 'EXPECTED_ONLY_ROLE' ...
Test Files 1 failed; Tests 1 failed, 1 passed
```

네 변이의 임시 변경은 모두 제거했다.

## #1145 349셀 MASTER 행 — 보고만 함

조상 커밋 `14445b883`의
`clients/desktop/src/renderer/test-utils/permission-mock-divergences.ts`를
읽어 확인했다. MASTER 행은 110개이며, 그중 78개가

```text
snapshotBits 1111000 → mockBits 1111011
```

형태다. `inbound.inspection`도 그 78개에 포함된다. MASTER 런타임 전권 정본에
비추면 이 78개는 템플릿과 런타임을 비교한 오분류 가능성이 있다. #1145 파일과
동결 목록은 수정하지 않았다.

## 검증

최종 관련 회귀:

```text
npx vitest run src/renderer/test-utils/inbound-permission-contract.test.ts \
  src/renderer/api/mock.test.ts \
  src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts

Test Files 3 passed (3)
Tests 163 passed (163)
```

`git diff --check`도 통과했다. V98 파일 변경은 없다.

Desktop 정본 typecheck도 `npm run typecheck`로 실행했고 종료코드 0이었다.
real-QA scope 단계에서 미추적 로컬 스펙 경고가 출력됐지만, 로컬 실행 허용 모드의
검증 테스트 50개는 모두 통과했다.

## 라이브 QA

브라우저 자체는 `clients/desktop` 안에서 다음을 실행해 성공했다.

```text
chromium.launch({ headless: true })
resolveQaShotsDir(...) 경유 캡처 성공
```

캡처:

```text
docs/qa/1130-r5-live-qa/_local/00-browser-probe.png
```

실 앱·실 서버 QA는 실행하지 못했다. 실행 시점 실패 원문/관측은 다음과 같다.

```text
8080 listen 없음
5175 listen 없음
5173 listen 없음
QA_DEV_DEFAULT_PASSWORD=unset QA_MASTER_PASSWORD=unset QA_MANAGER_PASSWORD=unset
```

따라서 MASTER 입고 검수 화면, MANAGER 입고 검수 화면, MANAGER 검수 완료,
권한 없는 역할 차단의 실 서버 캡처는 생성하지 않았다. 특히 MANAGER 검수 완료는
실 DB 쓰기를 수반하므로 `실 DB 쓰기 금지` 불변식상 강행하지 않았다.

## 신규/변경 파일

- `clients/desktop/src/renderer/api/mock.ts` — R4 MASTER 비트 되돌림 + 정본 근거 주석
- `clients/desktop/src/renderer/test-utils/inbound-permission-contract.test.ts` — MASTER
  런타임 전권 분기 및 단정 테스트
- `docs/dev-reports/2026-08-09-1130-r5-master-authority.md` — 본 보고서
- `docs/qa/1130-r5-live-qa/_local/00-browser-probe.png` — headless 브라우저 probe

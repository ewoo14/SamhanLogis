# R38 — 협업 동시성·대시보드 권한 재수렴 보고서

- 작업 브랜치: `feat/874-set-riusage-global-dc`
- 검증 HEAD: `f560ad1314dd4dcdd62f9cbf82c57d72f9d28e64`
- 범위: PR #1057 R38
- 기준 보고서: `docs/dev-reports/2026-08-05-874-r37-sol-reconvergence.md`

## 1. 결함별 진단과 조치

### 결함 1 — 협업 저장이 직접 저장과 다른 동시성 계약을 가짐

진단 결과는 R37 원문과 일치했다.

- 직접 수정은 `SlipUpdateRequest.updatedAt`을 필수로 받고 `SalesSlipUpdateService`/`SlipUpdateService`가 stale 값을 409로 거부했다.
- 협업 수정은 프런트가 보낸 `before`를 서버가 무시하고 저장 직전 DB 현재값으로 덮어썼다. 그 결과 오래된 초안도 현재값을 기준으로 새 변경처럼 저장되어 직접 저장의 최신값을 잃을 수 있었다.
- 협업 서버가 `after`만 patch map으로 파싱해 baseline을 `SlipService`까지 전달하지 않았다.
- 협업 패널은 원격 갱신으로 `currentValues`가 바뀌어도 로컬 초안을 유지했지만, 저장 시 `currentValues`를 `before`로 다시 읽어 stale 초안 식별에 실패했다.

조치:

1. 협업 `changeSet` 계약을 필드별 `{before, after}` 필수 계약으로 확정했다. `SlipDocumentCollaborationPort`가 두 map을 보존해 `SlipService`로 전달하고, `enrichChangeSetWithBefore`는 DB 현재값으로 덮어쓰지 않고 클라이언트 baseline을 정규화해 재직렬화한다.
2. `SlipService.applyOverlayPatchBatch`가 실제 저장 직전에 모든 대상 필드의 현재값과 baseline을 먼저 비교한다. 어느 필드라도 다르면 mutation 전에 `SLIP_OPTIMISTIC_LOCK_CONFLICT` 409를 발생시켜 부분 저장도 막는다.
3. JPA `@Version`이 서로 다른 필드의 진짜 동시 저장을 막지 않도록 `SlipRepository.findByIdForCollabUpdate`에 저장 시점 `PESSIMISTIC_WRITE` 행 잠금을 추가했다. 편집 화면을 잠그지 않고 짧은 저장 transaction만 직렬화하므로, 두 번째 저장은 첫 번째 저장 후 최신 row를 읽어 필드별로 판단한다.
4. 데스크톱 패널은 편집모드 진입 시 `editBaselineRef`를 캡처하고, 저장·dirty 판정 모두 이 baseline과 로컬 draft를 비교한다. 원격 `currentValues` 갱신은 로컬 draft나 baseline을 덮어쓰지 않는다.
5. 데스크톱 mock도 모든 필드 baseline을 먼저 검증하고, 전체 필드 검증 후에만 mutation/store를 수행하도록 맞췄다.

### 결함 2 — 접근성 landmark 라벨 불일치

`SlipCollaborationPanel.tsx`의 단일 `<section aria-label="수정">`을 `<section aria-label="협업 수정">`으로 변경했다. 버튼·Playwright selector·mock·매뉴얼의 옛 진입점 라벨은 변경하지 않았다.

### 결함 3 — 조회 권한이 없는 판매 통계 카드가 0으로 표시됨

`DashboardPage.tsx`는 `canQuerySales`/`canQueryPurchases`만 사용하고 `canAccess`를 취득해 놓고도 목록 PageCode를 소비하지 않았다. 다음으로 수정했다.

```ts
const canReadSales = canAccess('sales.slip.list', 'view') && canQuerySales(auth)
const canReadPurchases = canAccess('purchases.slip.list', 'view') && canQueryPurchases(auth)
```

판매 처리중 카드와 판매·구매 빠른 액션은 이 최종 조회 권한을 공통으로 사용한다. 판매를 조회하지 못하는 계정에는 query가 실행되지 않고 카드도 렌더링되지 않는다.

## 2. 불변식과 A4 보장

협업 저장은 전역 revision 일치 검사가 아니다.

```text
같은 필드 + 같은 baseline  → 첫 저장 후 두 번째 stale 저장은 409
서로 다른 필드 + 같은 baseline → 두 저장 모두 201, 두 필드 병합
```

행 잠금은 이 비교를 저장 transaction 안에서 원자적으로 수행하기 위한 것이다. 따라서 서로 다른 두 사용자가 같은 전표에서 `memo`와 `shippingAddress`를 각각 수정하면 두 저장이 순서와 관계없이 최신 row를 기준으로 각각의 대상 필드를 검증하고 둘 다 저장한다. 같은 필드의 패배자는 최신 값을 덮어쓰지 않는다.

프런트도 원격 갱신된 `currentValues`를 stale draft의 `before`로 사용하지 않는다. 편집 시작 시점 baseline만 보내므로, 서버가 저장 직전 현재값으로 baseline을 바꿔 lost update를 숨기는 경로가 닫혔다.

직접 수정의 기존 전체 문서 `updatedAt` 계약은 바꾸지 않았다. 따라서 직접 수정이 먼저 반영된 뒤 stale 협업 초안은 필드 baseline 충돌로 409가 되고, 협업 수정이 먼저 반영된 뒤 stale 직접 수정은 기존 `updatedAt` 검증으로 409가 된다. 직접 수정의 기존 stale 409와 협업의 정상적인 서로 다른 필드 병합을 동시에 보존한다.

## 3. RED 원문

### RED-A — 되돌리면 안 되는 것

```text
A1  R35 의 전 라우트 권한 정합이 그대로다 (작동 기능 차단 0 · 비전표 메뉴 감소 0)
A2  같은 페이지에서 직접·협업 폼이 함께 열리지 않는다
A3  열었다 닫으면 다른 진입점이 다시 나온다
A4  🚨 정상 실시간 협업 편집이 막히지 않는다 — 두 사용자가 서로 다른 필드를 동시에 고치면 둘 다 저장된다
A5  직접 수정의 기존 409(stale updatedAt) 동작이 그대로다
A6  R33 의 "전표 삭제"/"전표 취소" · R35 의 "직접 수정"/"협업 수정" 라벨이 그대로다
```

### RED-B — 결함이 재발하지 않는다

```text
B1  B 가 직접 저장한 뒤 A 가 오래된 초안을 협업 저장해도 B 의 값이 조용히 되돌아가지 않는다
B2  section[aria-label="협업 수정"] 이 1, section[aria-label="수정"] 이 0
B3  판매를 못 읽는 계정에게 판매 카드가 0 으로 보이지 않는다 (카드가 없거나 "조회 권한 없음" 이 보인다)
```

## 4. GREEN 원문

```text
GREEN-1  필드별 before baseline이 저장 시점까지 보존되고, 같은 필드 stale 협업 저장은 409다.
GREEN-2  서로 다른 필드의 협업 저장은 저장 순서와 사용자(actor)가 달라도 둘 다 201이며 최종 전표에 두 값이 남는다.
GREEN-3  직접 선저장 → stale 협업 저장은 409이고 직접 저장값은 유지된다.
GREEN-4  협업 선저장 → stale 직접 저장은 기존 updatedAt 409 동작을 유지한다.
GREEN-5  section[aria-label="협업 수정"] = 1, section[aria-label="수정"] = 0.
GREEN-6  판매 조회 권한이 없으면 processing query와 처리중 판매전표 카드가 함께 사라지고, 판매·구매 빠른 액션도 PageCode와 유형 권한을 모두 만족할 때만 보인다.
```

검증으로 `SlipCollabIT.commitEdit_rejects_stale_same_field_without_lost_update`와 `SlipCollabIT.commitEdit_merges_concurrent_different_fields`를 추가해 GREEN-1/2를 고정했다. 직접 stale 409는 기존 `SlipUpdateIT`를 지정 실행해 GREEN-4를 확인했다. 프런트는 원격 갱신 후에도 편집 시작 baseline으로 `{before:"초기 메모", after:"로컬 초안"}`을 보내는 테스트로 GREEN-1/5를 고정했다.

## 5. 자기 표면 닫기

### 5.1 조합 열거 및 실행 결과

아래 각 행은 저장 순서 `1→2`와 역순 `2→1`을 모두 포함한다. `같은 사용자/다른 사용자`는 협업 actor header로, 직접 경로는 기존 `updatedAt` 계약으로 구분했다.

| 두 저장 경로 | 사용자 | 대상 필드 | 1→2 / 2→1 결과 |
|---|---|---|---|
| 직접·직접 | 같음 | 같음 | 첫 저장 성공, stale 두 번째 409 / 역순도 동일 |
| 직접·직접 | 같음 | 다름 | 직접 경로는 전체 `updatedAt` 계약이므로 stale 두 번째 409 / 역순도 동일 |
| 직접·직접 | 다름 | 같음 | 첫 저장 성공, stale 두 번째 409 / 역순도 동일 |
| 직접·직접 | 다름 | 다름 | 직접 경로의 전체 문서 stale 409 / 역순도 동일 |
| 협업·협업 | 같음 | 같음 | 첫 저장 성공, stale 두 번째 409 / 역순도 동일 |
| 협업·협업 | 같음 | 다름 | 두 저장 모두 성공, 두 필드 병합 / 역순도 동일 |
| 협업·협업 | 다름 | 같음 | 첫 actor 성공, 두 번째 stale actor 409 / 역순도 동일 |
| 협업·협업 | 다름 | 다름 | 두 actor 모두 성공, 두 필드 병합 / 역순도 동일 |
| 직접→협업 | 같음 | 같음 | 직접 선저장 후 협업 baseline 충돌 409 |
| 직접→협업 | 같음 | 다름 | 직접이 다른 필드를 저장하면 협업 대상 필드가 unchanged인 경우 협업 성공 |
| 직접→협업 | 다름 | 같음 | 직접 선저장 후 협업 baseline 충돌 409 |
| 직접→협업 | 다름 | 다름 | 직접이 다른 필드를 저장하면 협업 대상 필드가 unchanged인 경우 협업 성공 |
| 협업→직접 | 같음 | 같음 | 협업 선저장 후 stale 직접 `updatedAt` 409 |
| 협업→직접 | 같음 | 다름 | 직접은 전체 문서 `updatedAt`이 stale이므로 기존 409 |
| 협업→직접 | 다름 | 같음 | 협업 선저장 후 stale 직접 `updatedAt` 409 |
| 협업→직접 | 다름 | 다름 | 직접은 전체 문서 `updatedAt`이 stale이므로 기존 409 |

실제 backend IT는 협업·협업의 같은 필드/서로 다른 필드 양순서의 핵심 저장 규칙을 행 잠금과 함께 실행했고, 서로 다른 actor ID를 사용했다. 직접 경로는 변경하지 않고 기존 `SlipUpdateIT`의 stale `updatedAt` 409를 재실행했다. 직접·협업 교차 조합은 구현 계약을 대조해, 직접 선저장→협업은 필드 baseline 409, 협업 선저장→직접은 기존 전체 문서 `updatedAt` 409가 되는 것을 확인했다. 이 교차 경로에서 409는 lost update가 아니라 명시적인 stale 거부다.

### 5.2 바뀐 계약·식별자 전수 grep

- 전표 협업 소스·테스트·mock의 저장 entry는 모두 `{before, after}`로 맞췄다.
- `SlipDocumentCollaborationPort`, `SlipCollabEditService`, `SlipService.applyOverlayPatchBatch`, `SlipRepository.findByIdForCollabUpdate`, `CommitSlipCollabEditRequest`, `editBaselineRef` 참조를 워크트리 전체에서 재검색했다.
- grep에 남은 `path -> {after}` 계약과 after-only 테스트는 회계전표·그룹웨어·파트너주문·견적·배차라는 별도 문서 어댑터와 그 과거 사양 문서뿐이다. 이번 R38에서 해당 계약을 변경하지 않았고, slip 협업 경로와 혼용되지 않는다.
- `aria-label="수정"` exact landmark는 제거했고, 남은 `수정 사유`는 다른 접근성 입력 라벨이므로 결함 2의 대상이 아니다.

### 5.3 변경 파일 참조 테스트

- 백엔드 `SlipDocumentCollaborationPortTest`, `SlipCollabIT` 및 기존 `SlipUpdateIT`를 실행했다.
- mock 변경은 전체 Vitest에서 `src/renderer/api/mock.test.ts` 129개가 통과했다.
- 패널 변경은 `SlipCollaborationPanel.coedit.test.tsx` 4개가 통과했고, 협업 Playwright 7개도 통과했다.
- 대시보드 변경은 `npm run typecheck`와 지정 Playwright CRUD surface에서 타입·라우팅 회귀를 확인했다.

## 6. 검증 결과

| 명령 | 결과 |
|---|---|
| `./gradlew :services:slip-service:test --tests '*SlipCollab*' --tests '*SlipUpdate*' --tests '*SlipDocumentCollaboration*'` | 통과, 76 tests, 0 failures/errors/skips |
| `npx vitest run` | 새 코드 관련 실패 0. 전체는 기존 `build-output-cjs-interop.test.ts` 1건 실패 — 로컬 `node_modules/electron` 설치 불량으로 `Electron failed to install correctly` |
| `npx vitest run src/renderer/components/collab/SlipCollaborationPanel.coedit.test.tsx` | 통과, 4/4 |
| `npm run typecheck` | 통과, tsc + real-QA 50/50 |
| `npx playwright test playwright/sp-05-crud-surface/sp-05-crud-surface.spec.ts` | 통과, 3/3 |
| `npx playwright test playwright/slip-collab` | 통과, 7/7 |

전체 Playwright 게이트는 실행하지 않았다. 테스트 과정의 Spring IT는 격리 Testcontainers DB에서만 수행했으며 운영 DB 쓰기·컨테이너 재배포·commit/add/push는 하지 않았다.

## 7. 안 본 것

- R35 전 라우트 권한 정합, R33/R35 라벨 및 같은 페이지 edit mode 배타화는 되돌리거나 재설계하지 않았다.
- 회계 배분·전기 시나리오 2~5는 개발책임자 A안 분리 범위라 다루지 않았다.
- 다른 트랙 #1061·#1045·#1063·#1066, `docs/handoff/`, 타 문서 협업 어댑터의 동시성 계약은 건드리지 않았다.
- 전체 Playwright, 컨테이너 재배포, 운영 DB, 원격 PR 상태와 머지는 수행하지 않았다.


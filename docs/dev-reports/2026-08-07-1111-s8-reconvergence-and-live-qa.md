# PR #1117 / 이슈 #1111 S8 재수렴 + UI 라이브 QA

> 실행일: 2026-08-07 23:53 ~ 2026-08-08 00:08 KST  
> 브랜치/HEAD: `feat/1111-bundle-components-to-base-product` / `11cc223a843719fb5972d517183eb9d9c06ec5ac`  
> 결론: **UI 라이브 QA PASS, S7 소스·소비처 계약 PASS, 실 배포 artifact 불일치 1건 BLOCKING.**

## 1. 환경 확인

| 항목 | 직접 확인한 값 |
|---|---|
| 워크트리 | `C:\dev\Samhan-Public\.claude\worktrees\t1111`만 사용 |
| 브랜치/HEAD | `feat/1111-bundle-components-to-base-product` / `11cc223a8` |
| CI | PR #1117 GitHub checks **49/49 SUCCESS** |
| product-service | `samhan-product-service`, healthy, container 생성 **2026-08-07 22:44:03 KST** |
| S7 commit 시각 | **2026-08-07 23:24:33 KST** — container보다 약 40분 늦음 |
| DB | V32 적용 상태, `bundle_components_manual` 컬럼 사용 가능 |
| 프런트 | 이 워크트리 `vite.web.config.ts`, `http://127.0.0.1:5217`, mock off |
| 브라우저 | `clients/desktop` cwd, Playwright 1.59.1, Chromium **147.0.7727.15**, `headless: true` |
| 실제 API | `http://127.0.0.1:8080`, `dev_master` / `dev_warehouse` 실제 로그인 |

컨테이너 재빌드·재기동, SA key 설정, 코드 수정, commit, push는 하지 않았다. 비밀번호/JWT는 산출물에 기록하지 않았다. 사용자 창은 띄우지 않았다.

## 2. 발화 조건 카운트

S6 종료값과 S8 종료 실측은 같다. S8 표본은 공개 UI/API로 생성한 뒤 정상 삭제해 순증이 없다.

| 조건 | S6 종료 기준 | S8 종료 직접 SELECT |
|---|---:|---:|
| 활성 세트 | 344 | **344** |
| raw 활성 구성품 | 1,598 | **1,598** |
| 활성 부모 아래 활성 구성품 | 1,585 | **1,585** |
| 활성 구성품 0건 세트 | 0 | **0** |
| 활성 `bundle_components_manual=true` | 1 | **1** |
| 삭제 부모 아래 활성 고아 | 13 | **13** |

S8 표본 최종 상태:

```text
S8-1111-COMP-20260807145603  is_deleted=true · 활성 구성품 0
S8-1111-ZERO-20260807145603  is_deleted=true · 활성 구성품 0
```

기존 고아 13행은 조회만 했고 손대지 않았다. 신규 고아는 0건이다.

## 3. UI 라이브 QA

### 3.1 기초품목 세트 구성품 CRUD

`S8-1111-COMP-20260807145603`을 실제 기초품목 등록 화면에서 세트로 만들었다. 최초 create 응답 관측기가 `/api/v1/products`를 기다리는 실수로 timeout됐지만 실제 계약 `/api/products`의 POST 201은 완료돼 있었다. 정확 조회로 그 1건을 재사용했고 중복 생성하지 않았다.

| 경로 | 실측 | 판정 |
|---|---|---|
| 구성품 2건 추가·저장 | PUT 200, 화면 행 2 | PASS |
| 첫 구성품 수량 수정 | `1 → 2.5`, PUT 200 | PASS |
| 둘째 구성품 삭제·저장 | PUT 200, 화면 행 1 | PASS |
| 구성품 1건 세트 삭제 | dialog `이 품목을 삭제하면 구성품 1건도 함께 삭제됩니다...`, 확인 후 DELETE 204 | PASS |
| 삭제 후 정리 | 목록에서 부모 미노출, DB 활성 구성품 0 | PASS |

- [구성품 2건 추가](../qa-shots/1111-s8-live-qa/01-components-added.png)
- [수량 2.5 수정](../qa-shots/1111-s8-live-qa/02-component-quantity-updated.png)
- [1건 삭제 후 1건 유지](../qa-shots/1111-s8-live-qa/03-component-deleted-one-remains.png)
- [구성품 보유 세트 삭제 직전](../qa-shots/1111-s8-live-qa/05-componentful-before-delete-confirm.png)
- [확인 삭제 후 목록 미노출](../qa-shots/1111-s8-live-qa/06-componentful-confirmed-deleted.png)

`window.confirm`은 브라우저 네이티브 dialog라 페이지 PNG에는 합성되지 않는다. Playwright dialog event에서 위 문구를 직접 읽고 accept했으며, 이어진 DELETE 204와 DB 자식 0건까지 결박했다.

### 3.2 견적품목

| 경로 | 실측 | 판정 |
|---|---|---|
| `싱글중대형` 탭에서 `AC060CS6PBH1SY` 검색 | UI 1행, `세트 · 13` | PASS |
| 구성품 편집 진입 | `estimate-items-components-button-*` 0, `components-modal-*` 0 | PASS |
| 납품가 | 동일 live API 검색 응답 `deliveryPrice=1,660,000` | PASS |

현 UI 테이블에는 납품가 열이 없으므로 납품가는 같은 검색의 실 API 응답으로 확인했다. 화면 검색과 구성 편집 진입 부재는 실제 DOM으로 확인했다.

- [견적 세트 검색·구성 편집 진입 부재](../qa-shots/1111-s8-live-qa/04-estimate-search-delivery-no-component-entry.png)

### 3.3 구성품 0건 세트 — RED-B

`S8-1111-ZERO-20260807145603`을 실제 등록 화면에서 세트로 생성하고 상세 구성품 행이 0개임을 확인했다.

| 경로 | 실측 | 판정 |
|---|---|---|
| 화면 create | POST 201 |
| 삭제 전 구성품 행 | 0 |
| 삭제 클릭 dialog event | **0회** |
| DELETE | **204** |
| 삭제 후 | 목록 미노출, DB 활성 구성품 0 |

따라서 확인창 오차단 없이 삭제되는 실 UI 경로를 밟았다.

- [구성품 0건 세트 삭제 직전](../qa-shots/1111-s8-live-qa/07-zero-component-before-no-confirm-delete.png)
- [무확인 삭제 후 목록 미노출](../qa-shots/1111-s8-live-qa/08-zero-component-deleted-without-confirm.png)

### 3.4 권한

실제 `dev_warehouse`(`WAREHOUSE`) 계정으로 기초품목에 진입했다.

```text
조회 전용 — 품목 수정 권한이 없습니다.
등록 버튼 0 · 수정 버튼 0
```

- [WAREHOUSE 조회 전용](../qa-shots/1111-s8-live-qa/14-warehouse-view-only.png)

## 4. S7 sync 상태코드와 소비처

### 4.1 실 배포 endpoint — S7 코드가 아님

SA key가 없는 상태에서 실제 `POST /api/v1/products/admin/sync`를 호출했다.

```text
제품/lookup 9/9 error + 구성품 2/2 error
HTTP 200
success=true · code=OK
failedTabs/successfulTabs/totalTabs 필드 없음
SheetSyncPage: "탭 결과 undefined/undefined 성공"
```

- [실 배포 200과 undefined/undefined](../qa-shots/1111-s8-live-qa/09-live-sync-stale-deployment-200.png)
- [GET last에도 누락된 탭 합계](../qa-shots/1111-s8-live-qa/10-live-sync-stale-deployment-undefined-tab-count.png)

이는 S7 소스 회귀가 아니라 **S7 commit보다 40분 앞선 container가 계속 배포된 artifact 불일치**다. 현재 배포본에서는 207/502를 만들 수 없다. SA key를 설정하거나 컨테이너를 재빌드하지 말라는 범위를 지켰다.

### 4.2 S7 소스 controller 계약 — fresh test

다음 명령을 `--rerun-tasks`로 새로 실행했다.

```text
.\gradlew.bat :services:product-service:test \
  --tests "com.samhanair.logis.product.web.ProductAdminControllerTest" \
  :shared:common:test --rerun-tasks --no-daemon

BUILD SUCCESSFUL
ProductAdminControllerTest: 4 tests · failures 0 · errors 0 · skipped 0
```

테스트가 만드는 세 경우:

| 경우 | controller 실측 | envelope |
|---|---:|---|
| 실패 0 | 200 | `success=true` |
| 성공 6 / 실패 5 | 207 | `success=false`, 상세 summary 유지 |
| 성공 0 / 실패 11 | 502 | `success=false`, 상세 summary 유지 |

### 4.3 SheetSyncPage 소비처

실 배포가 S7 이전이라, 소비처는 브라우저 network response를 200/207/502로 각각 격리해 S7 JSON envelope를 공급했다. 이는 product-service 라이브 증거가 아니라 **현재 HEAD SheetSyncPage의 HTTP 소비 동작 증거**다.

| 응답 | 화면 실측 | 판정 |
|---:|---|---|
| 200, 성공 11/11, manual 1 | `수동 보존 1`, `탭 결과 11/11 성공`, 오류 없음 | PASS |
| 207, 성공 6/11, 실패 5, manual 1 | `수동 보존 1`, `탭 결과 6/11 성공`, 실패 5행 적색 비고, generic 오류 없음 | PASS |
| 502, 성공 0/11 | generic 오류 banner + `탭 결과 0/11 성공` + 실패 11행 | PASS |

- [소비처 200 — manual skip은 성공](../qa-shots/1111-s8-live-qa/11-consumer-200-manual-skip-success.png)
- [소비처 207 — manual 보존과 실패 분리](../qa-shots/1111-s8-live-qa/12-consumer-207-partial-failure.png)
- [소비처 502 — 전체 실패](../qa-shots/1111-s8-live-qa/13-consumer-502-total-failure.png)

manual skip은 `수동 보존` 합계로, 예외 실패는 `탭 결과`와 탭별 적색 오류로 구분된다. 207은 Axios 성공 범위라 generic 오류 banner 없이 상세 결과를 표시하고, 502는 오류 banner를 추가한다.

### 4.4 shared `ApiResponse` 파급

- diff는 `fail(String code, String message, T data)` 오버로드 1개 추가뿐이다.
- 기존 `ok(T)`, `ok(T,String)`, `fail(ErrorCode,String)` 시그니처와 필드는 바뀌지 않았다.
- fresh `:shared:common:test`와 product-service compile/test가 성공했다.
- PR checks 49/49 SUCCESS다.

따라서 소스 기준 다른 서비스 파급은 0으로 판정한다.

## 5. Playwright spec 갱신 판정

S7 반대급부 세 테스트를 이 워크트리 전용 mock 서버(`VITE_MOCK_MODE=1`, 5220, HashRouter)에서 좁혀 재실행했다.

```text
product-catalog.spec.ts --grep "시나리오 4"
3/3 PASS · exit 0
```

| spec | 판정 |
|---|---|
| 시나리오 4 — 견적품목 구성 버튼·모달 없음 | 요구사항의 negative guard, 정당 |
| 시나리오 4b — `#/products/SET-HM2WAY/edit` editor 존재 | mock HashRouter에서 살아 있음, 정당 |
| 시나리오 4c — 구성품 행·추가·저장 | 저장 경로까지 살아 있음, 정당 |

라이브 웹은 `vite.web.config.ts`라 BrowserRouter(`/products/...`)이고 mock gate는 `vite.config.ts`라 HashRouter(`#/products/...`)다. 처음 라이브 관측기에 hash를 넣어 대시보드로 낙착한 것을 발견해 실제 웹 경로로 보정했다. spec의 hash는 그 spec 하네스에서는 죽은 경로가 아니다.

## 6. 결함 수

**S8 결함 수: 1건 BLOCKING.**

### F1 — S7 이전 product-service artifact가 배포돼 sync 200 결함이 실환경에 남아 있음

```text
container 생성 22:44:03 KST
S7 commit     23:24:33 KST
→ 배포본에 S7 200/207/502 계약 없음
→ SA key 부재로 11/11 실패
→ 실 endpoint HTTP 200 / success=true
→ SheetSyncPage 탭 결과 undefined/undefined 성공
```

소스 결함은 0건이다. 그러나 사용자가 요구한 라이브 200/207/502 세 경우 중 product-service 실배포 증거는 충족되지 않았고, 전체 실패가 여전히 거짓 200이므로 머지 게이트 기준 결함 1건으로 센다. 컨테이너 재빌드 금지 범위라 수정하지 않았다.

## 7. 본 범위와 안 본 범위

본 범위:

- t1111 HEAD 프런트 + 기존 배포 gateway/product-service의 headless UI 라이브 QA.
- 실제 관리자 화면의 세트 생성, 구성품 추가·수정·삭제, 확인 삭제와 자식 정리.
- 실제 관리자 화면의 구성품 0건 세트 생성·무확인 삭제 RED-B.
- 견적품목 세트 검색, 구성 편집 진입 부재, 동일 live API 납품가.
- 실제 WAREHOUSE 계정의 조회 전용.
- 실제 sync 호출과 last summary, 배포/commit 시각 대조.
- S7 controller 200/207/502 fresh test, SheetSyncPage 세 응답 소비, shared/common 파급.
- S7 반대급부 Playwright 3 spec의 하네스 경로 생존.
- 종료 DB 집계와 신규 고아 0.

안 본 범위:

- SA key 설정 후 실제 Google Sheets read 성공/부분 실패.
- S7 HEAD를 담은 product-service 재배포 후 live 200/207/502.
- 컨테이너 재빌드·재기동, DB 직접 변경, 기존 고아 13행 정리.
- PR #1117 밖 가격 모델·타 화면.
- 화면 상단의 PWA `업데이트 실패` banner 원인. 모든 dev-server 캡처에 공통 노출된 별도 범위이며 #1111 결함 수에 넣지 않았다.

## 8. 프로세스 회수

- 모든 Chromium은 `browser.close()` / context close로 종료했다.
- 이 워크트리 전용 Vite 5217과 mock Vite 5220을 실행 명령·포트 소유 PID로 식별해 종료했다.
- 종료 확인: 5217/5220 listener **0**, `s8-1111-live-qa` Chromium/Node **0**.
- 임시 QA 스크립트와 stdout/stderr log를 삭제했다.
- 다른 워크트리의 5173 listener와 사용자 Edge/게임 프로세스는 건드리지 않았다.

## 9. 새 파일 목록

- `docs/dev-reports/2026-08-07-1111-s8-reconvergence-and-live-qa.md`
- `docs/qa-shots/1111-s8-live-qa/01-components-added.png`
- `docs/qa-shots/1111-s8-live-qa/02-component-quantity-updated.png`
- `docs/qa-shots/1111-s8-live-qa/03-component-deleted-one-remains.png`
- `docs/qa-shots/1111-s8-live-qa/04-estimate-search-delivery-no-component-entry.png`
- `docs/qa-shots/1111-s8-live-qa/05-componentful-before-delete-confirm.png`
- `docs/qa-shots/1111-s8-live-qa/06-componentful-confirmed-deleted.png`
- `docs/qa-shots/1111-s8-live-qa/07-zero-component-before-no-confirm-delete.png`
- `docs/qa-shots/1111-s8-live-qa/08-zero-component-deleted-without-confirm.png`
- `docs/qa-shots/1111-s8-live-qa/09-live-sync-stale-deployment-200.png`
- `docs/qa-shots/1111-s8-live-qa/10-live-sync-stale-deployment-undefined-tab-count.png`
- `docs/qa-shots/1111-s8-live-qa/11-consumer-200-manual-skip-success.png`
- `docs/qa-shots/1111-s8-live-qa/12-consumer-207-partial-failure.png`
- `docs/qa-shots/1111-s8-live-qa/13-consumer-502-total-failure.png`
- `docs/qa-shots/1111-s8-live-qa/14-warehouse-view-only.png`

코드 파일 수정, commit, push, container 재빌드는 하지 않았다.

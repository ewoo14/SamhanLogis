# PR #1272 CODEX SOL 최종 재판정 3회차

검증일: 2026-08-18 KST  
판정: **PR #1272로 인해 실사용자가 화면에서 재현할 수 있는 도달 결함 0건. 기능 증거상 머지 허용 가능하나, 현재 CI가 1 failure + 1 in-progress라 현 상태에서는 머지 불가.**

## ① 검증 SHA·main 병합

- 브랜치: `feat/category-settings-migration`
- 지시 SHA·검증 HEAD·게시 직전 PR head: `b8bf8b16a7c212735e9c3263ab1cea76b7db9871`
- 시작 시 `git fetch origin main` 후 `git merge origin/main --no-edit` 원문: `Already up to date.`
- 시작 시 병합 대상 `origin/main`: `eae5578fff8a4decf42c70ba9ca0f93ecc80c1b0`. 충돌 0건, 검증 SHA 변화 없음.
- 07:59 KST에 다른 세션의 fetch로 `origin/main` 참조가 `ba1271b97af7fbd9d7590db2baba616193bbcc4a`로 전진했다. 새 커밋의 변경은 `.claude/memory/feedback_sol_review_includes_live_qa.md` 한 파일뿐이며 제품 코드·마이그레이션 변화가 없다. `git merge-tree` 충돌 신호도 0건이다.
- 지정 SHA를 바꾸는 추가 merge commit은 만들지 않았다. `git add`·commit·push 및 제품 코드 수정은 수행하지 않았다.
- 현재 SHA에서 Eureka/Gateway/product-service bootJar: `BUILD SUCCESSFUL in 17s`.

## ② A — 브랜치 Gateway 경유 무권한 실서버 403

공유 auth/gateway에서 `dev_staff` JWT를 발급받고, `SAMHAN_GATEWAY_ATTESTATION`을 공유 Gateway와 같은 값으로 브랜치 Gateway/product-service에 주입했다. 호출은 모두 브랜치 Gateway `http://127.0.0.1:18084`를 통과했다. 서비스 직접 호출은 없다.

```text
GET /api/v1/products/AM260AXVHHH1SY/component-settings?estimateCategory=COMMERCIAL_MULTI
HTTP 403
{"success":false,"code":"FORBIDDEN","message":"[SP-PO-1] 동적 권한 deny — page=products.list action=VIEW subject=GROUP_BASED reason=account permission missing","data":null,"timestamp":"2026-08-17T22:47:51.400095700Z"}

POST /api/v1/products/AM260AXVHHH1SY/specs
HTTP 403
{"success":false,"code":"FORBIDDEN","message":"[SP-PO-1] 동적 권한 deny — page=products.admin action=CREATE subject=GROUP_BASED reason=account permission missing","data":null,"timestamp":"2026-08-17T22:47:51.492967900Z"}

PATCH /api/v1/products/AM260AXVHHH1SY/usage
HTTP 403
{"success":false,"code":"FORBIDDEN","message":"[SP-PO-1] 동적 권한 deny — page=products.admin action=UPDATE subject=GROUP_BASED reason=account permission missing","data":null,"timestamp":"2026-08-17T22:47:51.521509800Z"}

DELETE /api/v1/products/AM260AXVHHH1SY/specs/00000000-0000-0000-0000-000000000000
HTTP 403
{"success":false,"code":"FORBIDDEN","message":"[SP-PO-1] 동적 권한 deny — page=products.admin action=DELETE subject=GROUP_BASED reason=account permission missing","data":null,"timestamp":"2026-08-17T22:47:51.547444400Z"}
```

초기 기동 직후에는 Gateway가 product-service 등록 전 캐시를 잡아 4경로 모두 503이었으나, Eureka에서 product-service `UP`을 확인하고 Gateway를 다시 띄운 뒤 위 403이 안정적으로 재현됐다. `@MockBean`으로 IT가 통과한 사실과 별도로 실서버 권한 차단을 확인했다.

## ③ B — exposure main↔브랜치와 주문서웹 503 귀속

공유 V45 `product_db`를 읽기 전용 `pg_dump`로 복제했다. main 격리본에는 `origin/main`의 V46 SQL을 적용하고, 브랜치 격리본에는 실제 브랜치 JAR로 V46·V47을 적용했다. `product_estimate_exposure`의 11개 열 전부를 ID 순으로 직렬화해 비교했다.

```text
origin/main(V46) 전체 exposure = 892행
브랜치(V47) 전체 exposure     = 892행
전행 차이                     = 0행

활성 exposure 양쪽 동일       = 867행
COMMERCIAL_MULTI 416 / HOME_MULTI 123 / LEGACY 40 / SINGLE_SET 288
```

따라서 개발책임자 결정인 “설정 전용 354쌍은 판매 노출을 늘리지 않는다”는 데이터 축으로 확정됐다. V47은 `bundle_component_estimate_setting.configuration_only=true`에만 설정을 만들고 exposure 행을 추가하지 않는다.

주문서웹 실제 브랜치를 `5184`에 띄우고 `resolveQaCredential()`·`resolveQaShotsDir()`을 사용하는 Playwright로 재현한 결과는 다음과 같다.

```text
GET /api/v1/partner-orders/bootstrap = HTTP 503
주문서웹 데이터행 = 0 (오류 화면이므로 품목 0행으로 판정하지 않음)
화면 문구 = 주문서 데이터를 불러오지 못했습니다. / 오류: HTTP 503
```

503 귀속:

- 공유 Eureka 등록 목록에 `PARTNER-ORDER-SERVICE`가 없었다.
- 공유 Gateway 로그 원문: `No servers available for service: partner-order-service`.
- PR #1272는 partner-order-service·order-app을 변경하지 않고 Gateway에 product `component-settings` exact route만 추가한다.
- 열린 PR #1265는 실제로 `BootstrapService.java`, order-app 및 partner-order-service를 고치는 별도 PR이다.

따라서 이 503은 PR #1272 도달 결함이 아니라 공유 격리 스택에 partner-order-service가 기동되지 않은 환경 원인이다. 단, 성공 bootstrap 뒤 주문서웹 실제 렌더 행 수 자체는 미검증으로 남긴다.

## ④ C — 다중 카테고리 BUNDLE 부모와 장래 위험

격리 V47 DB 실측:

```text
활성 구성품을 가진 활성 BUNDLE 부모 중 활성 exposure 카테고리 2개 이상 = 0개
```

따라서 현재 실데이터에는 카테고리 설정이 섞일 인스턴스가 없고, A→B mutation 축은 대상 0이라 미검증으로 남겨도 현재 도달 결함은 아니다.

장래에는 다중 노출 BUNDLE 부모가 생길 수 있다. 저장 키와 조회는 `(bundle_component_id, estimate_category)` exact라 기존 카테고리 설정끼리 섞이지 않는다. 다만 V47 backfill 뒤 새 exposure가 추가되면 자동 설정 생성 trigger가 없어 해당 카테고리는 전역 `bundle_component` fallback을 읽고, 내부 구성품 API는 부모의 단일 `product_category`로 부모를 고른다. 즉 장래 위험은 “A/B 설정 혼합”보다는 “두 번째 카테고리 설정·구성품 누락 또는 전역 fallback”이며, 실제 다중 부모 생성 시 별도 회귀가 필요하다.

## ⑤ 잃으면 안 되는 6가지 재현 숫자

| 항목 | 3회차 직접 재현 |
|---|---:|
| 수량/설정값 변경 부모 | `0/343` |
| V47 설정 이전 | `1,584행 / 343세트` |
| exposure 전행 차이 | 전체 `892↔892`, 차이 `0행`; 활성 `867↔867` |
| 미매핑 fallback | `14행 / soft-delete 부모 3개` |
| 옵션 충돌 | `2쌍` 보존 |
| fresh V1→V47 | `Successfully validated 47 migrations`, `Successfully applied 47 migrations ... v47`, health 200 |

옵션 충돌 원문 집계:

```text
COMMERCIAL_MULTI / AM100AXVHHR1 = NULL 기본 4부모 + S6-1111-MANUAL 기본 1부모
SINGLE_SET / AWR-WE13N          = 기본 기본 3부모 + 유선 비기본 62부모
```

라이브 Playwright도 2/2 통과했다. 저장 전후 종합견적 행 수는 `COMMERCIAL_MULTI 기본 310 / SINGLE_SET 기본 133 + 구성 718 / 합계 1,161`로 동일했다. 세트 수량 2에서 상업멀티 FIXED 구성품은 1, 변경하지 않은 싱글 FOLLOW_SET 구성품은 2였다. 검증 후 격리 DB 설정을 원값으로 복원하고 `1,584/343`, 변경 `0`, fallback `14`를 다시 확인했다.

## ⑥ 기초품목 3종 편집 제거의 손실 여부

실제 기초품목 수정 화면 `AM260AXVHHH1SY` 재현:

- 구성품 2행 유지.
- 수량동기화·품목구분·옵션 편집기 각 0개: 의도대로 견적품목 카테고리 설정으로 이동.
- 구성 관계·기본수량 유지.
- 고정금액 편집기 2개 유지.
- 가격 영역의 납품가 대응 필드 `deliveryPrice` 유지, 화면 라벨 `배송가`, 값 `13,299,110`.
- 판매가·매입가·출고가·배송가 모두 화면에 존재.

제거한 3종 때문에 기초품목에서 다른 필수 편집까지 사라진 도달 결함은 재현되지 않았다. 납품가는 남아 있다.

## ⑦ product-service 마이그레이션 번호 3중 확인

REST와 git tree를 새 main 전진 후 다시 셌다.

```text
이 브랜치: 46개 파일, 최대 V47 = V47__category_component_settings.sql
origin/main: 45개 파일, 최대 V46
열린 PR: 12개 전부 REST files 순회
열린 PR의 product-service migration 추가: PR #1272 V47 1개만
다른 열린 PR의 V47: 0개
```

현재 마이그레이션 번호 충돌은 없다.

## ⑧ 스크린샷 — 직접 연 결과와 행 수

모두 `QA_SHOTS_DIR=docs/qa/1272-sol-reverdict-3/screenshots`, `QA_ALLOW_OVERWRITE=1`, `resolveQaShotsDir()` 경유다. 자격은 `resolveQaCredential()`을 사용했다. PNG 6장을 원본 해상도로 직접 열었다.

| 파일 | 직접 확인한 내용 | 행 수 |
|---|---|---:|
| `screenshots/01-order-app-bootstrap-503-real-qa.png` | 주문서 503 오류 화면 | 데이터행 0, 품목 0으로 판정 안 함 |
| `screenshots/01-commercial-fixed-saved-real-qa.png` | 상업멀티 설정 모달, 첫 행 고정/부속/probe | 설정 2행 |
| `screenshots/02-single-unchanged-real-qa.png` | 싱글 sentinel 값 보존 | 설정 7행 |
| `screenshots/03-commercial-set-qty-two-real-qa.png` | 상업멀티 세트 수량 2 | viewport 15행, 전체 기본 310행 |
| `screenshots/04-single-follow-set-remains-two-real-qa.png` | 싱글 세트 수량 2 | viewport 15행, 전체 기본 133 + 구성 718행 |
| `screenshots/05-basic-product-boundary-real-qa.png` | 기초품목 경계·가격 영역 | 구성품 2행 |

라이브 스펙:

- `clients/desktop/playwright/1272-sol-reverdict-3/1272-order-app-bootstrap-live.spec.mjs`
- 재사용: `clients/desktop/playwright/1272-sol-reverdict-2/1272-sol-reverdict-2-real-qa.spec.ts`

## ⑨ 미검증 축

1. partner-order-service를 정상 기동한 성공 bootstrap 뒤 주문서웹 실제 품목 렌더 행 수. 데이터 원천 exposure의 main↔브랜치 완전 동일성은 검증됐지만 UI 성공 경로는 503으로 미도달했다.
2. 동일 활성 BUNDLE 부모가 둘 이상의 견적 카테고리에 실제 노출된 상태의 A→B 화면 mutation. 현재 대상이 0개다.

두 축을 결함 0으로 세지 않았다.

## ⑩ CI 귀속

2026-08-18 07:59 KST, head `b8bf8b16a` REST check-runs 48개:

```text
success 46 / failure 1 / in_progress 1
```

- `CI` 본 workflow는 성공했고 fix2 backend 권한 컨텍스트 실패도 해소됐다. 로컬 `ProductPermissionControllerIT` 집중 실행도 `BUILD SUCCESSFUL`이다.
- failure: `Desktop Playwright (mock 회귀 hard gate)`.
  - `Set up job`은 success.
  - 실패 artifact의 실제 원문은 커밋된 `1272-live-3axes-order-app.spec.mjs`가 mock gate에서 자동 수집되어 `http://127.0.0.1:5184/`로 이동하다 `net::ERR_CONNECTION_REFUSED`, 이어 `No tests found`가 난 것이다.
  - PR #1272가 추가한 스펙에서 발생했으므로 GitHub 장애가 아니라 PR 귀속 CI 실패다. 실사용 기능 결함으로 세지는 않는다.
- in-progress: `Playwright (web + electron + mobile emul)`.
  - `Set up job` success.
  - `Playwright 브라우저 설치 (system deps 포함)` 단계가 장시간 in-progress라 아직 성공/실패 귀속 불가. 현재로서는 외부 runner/네트워크 지연 가능성이 있지만 미완료를 성공으로 보지 않는다.

따라서 이번 head에서 “Set up job 실패 = GitHub 장애” 사례는 현재 실패 원인이 아니다.

## ⑪ 최종 판정 — 머지 가능 여부와 잔여 위험

**실사용자가 PR #1272 때문에 화면에서 재현할 수 있는 도달 결함: 0건.**

기능·데이터 기준으로는 머지를 지지한다. B의 성공 UI 행 수가 미검증이어도 exposure 전체 892행의 모든 열이 main과 브랜치에서 동일하고 활성 867행의 카테고리별 수까지 같으므로, “설정 전용 354쌍 때문에 웹 노출이 늘어나는가”라는 잔여 위험은 머지를 막을 수준이 아니다. 503도 PR #1272가 아닌 미기동 partner-order-service에 귀속된다.

C도 현재 대상 0개이며 exact 카테고리 키가 혼합을 막으므로 현재 머지를 막지 않는다. 다만 최초 다중 노출 BUNDLE 부모가 생길 때 두 번째 카테고리 설정 생성·내부 구성품 조회 회귀를 반드시 추가해야 한다.

**그러나 현재 머지 가능 여부는 `불가`다.** 이유는 기능 결함이 아니라 PR 귀속 CI failure 1건과 미완료 check 1건이다. 해당 CI 실패를 해소하고 전체 green이 된 뒤에는 이 3회차 기능 판정상 추가 차단 사유가 없다. 최종 머지 판단은 개발책임자 권한이다.

## ⑫ 프로세스 회수

```text
회수 전 전용 listener:
5175, 5183, 5184, 18084, 18085, 18095, 18761 = 7개

회수 후 전용 listener = 0
격리 컨테이너 회수:
sol1272-r3-main-pg / sol1272-r3-branch-pg / sol1272-r3-fresh-pg
격리 컨테이너 잔여 = 0
공유 samhan-* 컨테이너 = 24개 running / unhealthy 0
```

- 공유 컨테이너 stop/restart/recreate 없음.
- 공유 DB write 없음. 공유 `product_db`는 `pg_dump`와 SELECT만 수행.
- auth-service 격리 기동 없음.
- 다른 워크트리와 타 작업 컨테이너를 건드리지 않음.
- `git status --porcelain`: 이번 판정용 Playwright 하네스와 `docs/qa/1272-sol-reverdict-3/`만 미추적. `git add`·commit·push 0건.

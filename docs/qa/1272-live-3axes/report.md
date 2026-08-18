# PR #1272 라이브 미검증 3축 덮기 보고서

검증일: 2026-08-18 KST  
워크트리: `C:\dev\Samhan-Public\.claude\worktrees\wcat`  
브랜치: `feat/category-settings-migration`  
시작 검증 SHA: `bf6c43c7a`  
실행 HEAD: `43f16e956` (`git merge origin/main --no-edit` 충돌 없음)

## ① 기동 방법

공유 `samhan-postgres`의 `product_db`를 `pg_dump -Fc`로 읽기만 한 뒤, 별도 `sol1272-live3axes-pg` 컨테이너(PostgreSQL 17, 호스트 포트 15457)에 복원했다. 복원 확인 원문은 `products=3237`이다. 공유 컨테이너/공유 DB에는 쓰지 않았다.

브랜치 JAR는 다음 포트로 별도 기동했다.

```text
Eureka       18761  services/eureka-server/build/libs/eureka-server.jar
product      18085  services/product-service/build/libs/product-service.jar
Gateway      18084  services/api-gateway/build/libs/api-gateway.jar
order-app    5184   clients/web/order-app (Vite)
```

실행 명령은 다음 형태였다.

```powershell
java -jar services/eureka-server/build/libs/eureka-server.jar --spring.profiles.active=local
java -jar services/product-service/build/libs/product-service.jar
java -jar services/api-gateway/build/libs/api-gateway.jar
npm run dev -- --host 127.0.0.1 --port 5184 --strictPort
```

product-service에는 `DB_HOST=127.0.0.1`, `DB_PORT=15457`, `DB_NAME=product_db`, `EUREKA_URL=http://127.0.0.1:18761/eureka/`, `SAMHAN_AUTH_SERVICE_URL=http://127.0.0.1:8081`을 주입했다. Gateway에는 `EUREKA_URL=http://127.0.0.1:18761/eureka/`, `SAMHAN_JWT_SECRET`, `SAMHAN_INTERNAL_TOKEN`, `SAMHAN_GATEWAY_ATTESTATION`을 환경변수로 주입했다. attestation 값 자체는 보고서에 노출하지 않았다.

헬스 원문:

```text
eureka=200
product=200 {"status":"UP"}
gateway=200 {"status":"UP"}
```

## ② A — 무권한 계정 브랜치 Gateway HTTP 403

공유 Gateway `http://127.0.0.1:8080/auth/login`으로 `dev_staff`를 로그인한 뒤, 발급 JWT를 브랜치 Gateway `http://127.0.0.1:18084`에 전달했다. 서비스 직접 호출은 하지 않았다.

대표 엔드포인트별 원문:

```text
조회 GET /api/v1/products/AM260AXVHHH1SY/component-settings?estimateCategory=COMMERCIAL_MULTI
HTTP 403
{"success":false,"code":"FORBIDDEN","message":"[SP-PO-1] 동적 권한 deny — page=products.list action=VIEW subject=GROUP_BASED reason=account permission missing","data":null,"timestamp":"2026-08-17T22:30:49.577638800Z"}

생성 POST /api/v1/products/AM260AXVHHH1SY/specs
HTTP 403
{"success":false,"code":"FORBIDDEN","message":"[SP-PO-1] 동적 권한 deny — page=products.admin action=CREATE subject=GROUP_BASED reason=account permission missing","data":null,"timestamp":"2026-08-17T22:31:23.312515500Z"}

수정 PATCH /api/v1/products/AM260AXVHHH1SY/usage
HTTP 403
{"success":false,"code":"FORBIDDEN","message":"[SP-PO-1] 동적 권한 deny — page=products.admin action=UPDATE subject=GROUP_BASED reason=account permission missing","data":null,"timestamp":"2026-08-17T22:31:23.336519900Z"}

삭제 DELETE /api/v1/products/AM260AXVHHH1SY/specs/00000000-0000-0000-0000-000000000000
HTTP 403
{"success":false,"code":"FORBIDDEN","message":"[SP-PO-1] 동적 권한 deny — page=products.admin action=DELETE subject=GROUP_BASED reason=account permission missing","data":null,"timestamp":"2026-08-17T22:31:23.351690200Z"}
```

A 판정: **실제 브랜치 Gateway 경유 403 확인 완료(4/4)**.

## ③ B — 주문서웹 품목 행 수

실제 주문서웹은 `http://127.0.0.1:5184/`에서 기동하고 Chromium으로 열었다. 주문서웹의 bootstrap 경로를 공유 Gateway로 연결해 확인했으나 다음 원문으로 중단됐다.

```text
GET /api/v1/partner-orders/bootstrap
HTTP 503
주문서 데이터를 불러오지 못했습니다.
오류: HTTP 503
```

따라서 **주문서웹 UI의 이전 대비 행 수는 측정하지 못했다**. 빈 목록을 0행으로 세지 않았다. 브랜치 Gateway에 `dev_master` JWT로 직접 조회한 제품 원천 카탈로그의 현재 `totalElements`는 다음과 같지만, 이것은 주문서웹 UI 행 수의 대체 증거가 아니다.

```text
COMMERCIAL_MULTI status=200 totalElements=416
HOME_MULTI       status=200 totalElements=123
SINGLE_SET       status=200 totalElements=288
LEGACY           status=200 totalElements=40
```

## ④ C — 다중 카테고리 부모 격리

격리 복제 DB에서 먼저 집계했다.

```text
multi_category_parent_count (전체 활성 상품) = 71
bundle_parents = 343
multi_category_bundle_parent_count = 0
```

즉, 실 데이터에 “동일 부모가 여러 견적 카테고리에 속하면서 구성품 설정을 가질 수 있는 활성 BUNDLE 부모”가 **0개**였다. 대상 0개이므로 A 카테고리를 변경하고 B 카테고리를 확인하는 mutation 시나리오는 실행하지 않았다. 0개를 격리 성공으로 과장하지 않으며, 이 축은 **실 다중 부모 mutation 미검증**으로 남긴다.

설정/노출 경계의 read-only 수치:

```text
bundle_component_estimate_setting total_setting_rows = 1584
setting_components = 1584
product_estimate_exposure = COMMERCIAL_MULTI 416 / HOME_MULTI 123 / LEGACY 40 / SINGLE_SET 288
qty_diff_rows (원본 bundle_component와 설정의 qty/kind/variant 비교) = 0
```

## ⑤ 잃으면 안 되는 것 재현

이번 격리 DB read-only/비파괴 점검에서 확인한 수치:

```text
수량 변경: 0/343
V47 설정: 1,584행 / 343세트
exposure 카테고리 행: 416 + 123 + 40 + 288 = 867행
exposure 전행 차이: 0행 (이번 라운드에는 원본 V45 dump를 별도 복원하지 않아 기존 보고 수치 보존)
미매핑 fallback: 14행 (기존 fix2 보고 수치 보존; 이번 DB mutation 없음)
옵션 충돌: 2쌍 보존 (기존 fix2 보고 수치 보존; 이번 DB mutation 없음)
fresh V1→V47: 성공 (기존 fix2 보고 수치 보존)
게이트웨이 200: A와 별개로 브랜치 health 200, 권한 있는 카탈로그 GET 200
설정의 종합견적 반영: 기존 라이브 검증 수치 보존(이번 주문서 bootstrap 503으로 재실행 불가)
Playwright: 기존 2/2 수치 보존(이번 주문서 B 시나리오는 bootstrap 503)
```

## ⑥ 스크린샷

실제 Chromium으로 주문서웹을 열고 캡처한 뒤 PNG를 직접 열어 확인했다. 화면은 품목 목록이 아니라 bootstrap 실패 화면이었다.

```text
C:\dev\Samhan-Public\.claude\worktrees\wcat\docs\qa\1272-live-3axes\screenshots\01-order-app-bootstrap-503-real-qa.png
```

육안 확인 내용: “주문서 데이터를 불러오지 못했습니다”, “오류: HTTP 503”, 하단 “버전 정책을 확인하지 못했습니다”가 표시됐다. 행 수 증거로 사용하지 않았다.

라이브 스펙은 다음 경로에 두었고, credential은 `resolveQaCredential('QA_PARTNER_ORDER_PASSWORD')`, 캡처 경로는 `resolveQaShotsDir()`를 사용했다.

```text
clients/desktop/playwright/1272-live-3axes/1272-live-3axes-order-app.spec.mjs
```

## ⑦ 못 한 것과 이유

1. B 주문서웹 이전 대비 행 수: 공유 Gateway의 `/api/v1/partner-orders/bootstrap`가 HTTP 503이어서 실제 품목 화면에 진입하지 못했다.
2. C A→B mutation 격리 확인: 활성 다중 카테고리 BUNDLE 부모가 0개여서 실 데이터 대상이 없었다. 임의 fixture나 합성 부모를 만들지 않았다.
3. 따라서 이번 라운드의 미검증 3축을 모두 결함 0으로 판정하지 않는다. A만 실제 HTTP 403으로 덮였고, B/C는 각각 503/대상 0으로 미검증이다.

## ⑧ `git status --porcelain` 원문

보고서 작성 및 스펙 생성 후 원문:

```text
?? clients/desktop/playwright/1272-live-3axes/
?? docs/qa/1272-live-3axes/
```

커밋·`git add`·push는 수행하지 않았다.

## ⑨ 프로세스 및 컨테이너 회수

회수 명령:

```powershell
Stop-Process -Id 95060,94284,60432 -Force
docker rm -f sol1272-live3axes-pg
```

회수 확인 원문:

```text
95060
94284
60432
11016
remaining_listeners=0
remaining_pids=
shared_count=24
```

`sol1272-live3axes-pg`는 제거됐고, 공유 `samhan-*` 컨테이너 24개는 중지·재생성·변경하지 않았다.

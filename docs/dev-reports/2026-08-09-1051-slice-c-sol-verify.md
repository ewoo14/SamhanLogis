# PR #1129 슬라이스 C 적대검증 — 막는 장치가 정상까지 막지 않는가

> 검증자: CODEX SOL 5.6  
> 브랜치/HEAD: `fix/1051-product-link-track` / `9fcf69dde7678d8bc3c65378909b36dbc5af7cad`  
> 검증 시각: 2026-08-09 02:46~03:02 KST  
> 코드 수정·commit·push·Docker 재배포·DB 쓰기·기존 행 수정/삭제 없음. DB SQL은 모두 `BEGIN TRANSACTION READ ONLY`로 실행했다.

## 0. 먼저 보고할 요약 불일치

개발책임자가 준 요약 중 다음은 실제와 다르다.

1. **“시딩 토글을 켠 정상 환경에서 100건을 만든다”는 주장은 거짓이다.** 신규 DB에서 `HvacProductSeeder`가 만드는 100개 중 seq 25·50·75·100, 즉 **4개는 의도적으로 `DISCONTINUED`**다. `SlipSeeder`는 100개 모두 `ACTIVE`여야 한다. 정상 표준 seed는 `ACTIVE 96 + DISCONTINUED 4`이고, 전표는 **100건 전부 차단·저장 0건**이다.
2. 슬라이스 C 보고서의 “정상 100건 생성·정상 차단 0건”은 실 product seed와 결합한 결과가 아니다. 테스트가 product 100개를 전부 가짜 `ACTIVE`로 만들어 Mockito repository로 실행한 결과다.

현재 공유 DB는 이 100개가 모두 존재하지만 V31 cleanup으로 **soft-delete 100개**다. 원 status는 `ACTIVE 96 / DISCONTINUED 4`이고 실제 lookup 응답은 HTTP 200 `data=[]`다.

## 1. 판정

**BLOCKING — 정상 seed 경로를 막는다.**

| 환경 | product 상태 | 생성 예정 | 저장 | 정상 차단 |
|---|---:|---:|---:|---:|
| 슬라이스 C 테스트의 인공 입력 | ACTIVE 100 | 100 | 100 | 0 |
| 신규 DB + 실제 `HvacProductSeeder` | ACTIVE 96 + DISCONTINUED 4 | 100 | **0** | **100** |
| 현재 공유 DB | soft-delete 100 | 100 | **0** | **100** |
| lookup 4xx/5xx/네트워크 예외 | 조회 실패 | 100 | **0** | **100** |

한 품목만 불일치해도 all-or-nothing 선행 검증이 전체 100건을 막는다.

## 2. 도달 가능한 결함

### C-SOL-1 BLOCKING — 실제 정상 product seed의 단종품 4개 때문에 전표 100건 전부 차단

재현:

1. `HvacProductSeeder.buildAllRows()`는 100행을 만든다.
2. `row.seq() % 25 == 0`인 25·50·75·100을 `markDiscontinued()` 처리한다.
3. `SlipSeeder.loadSeedProducts()`는 `status == ACTIVE`만 map에 넣는다.
4. map은 96개라 전표 저장 전 예외가 난다.

실행/조회 원문:

```text
측정 2026-08-09 02:51:50.419 KST
expected_count=100
status_counts={ACTIVE:96, DISCONTINUED:4}
fresh_seed_discontinued_formula=4
```

영향: **정상 전표 100건 차단, 저장 0건**. 누락 UUID는 0개이고 정상 seed의 상태 필터 탈락이 4개다.

### C-SOL-2 BLOCKING — cleanup 이후 표준 seed로도 100 master가 돌아오지 않는다

현재 deterministic UUID 100개는 모두 soft-delete다. product 시더의 멱등 확인은 `existsByModelNameAndIsDeletedFalse`라 100개 모두 “없음”으로 판단한다. 이어 같은 deterministic PK로 INSERT하여 100개 모두 PK 충돌하고, 행별 예외를 catch하므로 product-service는 계속 기동한다. 재활성화 경로는 없다.

실제 read-only API 원문:

```text
POST http://127.0.0.1:8084/products/internal/lookup
requested=100
HTTP 200
{"success":true,"code":"OK","message":"성공","data":[],...}

expected_active=0
expected_absent=0
expected_soft_deleted=100
```

영향: product 100개 복원 실패, slip 100전표 차단·저장 0.

### C-SOL-3 HIGH — Docker Compose가 product 준비를 기다리지 않아 slip 기동이 실패한다

유효 compose 합성 원문:

```text
product-service depends=api-gateway,eureka-server,postgres,rabbitmq,redis
slip-service    depends=api-gateway,eureka-server,postgres,rabbitmq,redis
product-service restart=unless-stopped
slip-service    restart=unless-stopped
```

상호 `depends_on`은 0개다. 동시 시작 중 lookup 예외가 `CommandLineRunner` 밖으로 전파되어 해당 slip-service 기동은 실패하고, compose 재시작에 의존한다. 시더 자체 retry/backoff는 없다.

별도 `infrastructure/scripts/start-local-full.ps1`는 product health 후 slip을 시작해 timing race는 피한다. 그러나 C-SOL-1/2는 product가 healthy여도 발생하므로 순차 기동만으로 해결되지 않는다.

영향: 실패 시도마다 lookup 1회, 전표 100건 차단, save 0회, slip healthy 0. 영구 미준비 시 재시작 상한도 없다.

### C-SOL-4 HIGH — bulk lookup이 일부 조회 불가를 “품목 없음”으로 오분류하고 timeout 상한도 없다

| 상황 | 분류/메시지 | 결과 |
|---|---|---:|
| HTTP 200 일부/빈 목록 | NOT_FOUND, “일부 제품을 찾을 수 없습니다” | 100 차단·0 저장 |
| 모든 4xx — 401/403/408/429 포함 | INVALID_INPUT, “존재하지 않는 제품 ID” | 100 차단·0 저장 |
| 5xx | INTERNAL_ERROR, “product-service 호출 실패” | 100 차단·0 저장 |
| connection/client timeout 예외 | INTERNAL_ERROR | 100 차단·0 저장 |

5xx·네트워크 예외는 없음과 구분하지만, **401/403/408/429 네 종류를 품목 없음으로 합친다.** `ProductClient`는 공용 `RestClient.builder()`에 connect/read timeout을 설정하지 않으며 전용 timeout 설정 검색 결과는 **0건**이다. hang 응답의 bounded timeout 보장이 없다.

현재처럼 200 빈 목록이면 `ProductClient.lookup()`이 먼저 NOT_FOUND를 던진다. 따라서 새 “product-service seed를 먼저 완료하십시오” `IllegalStateException`은 일반적인 누락 경로에서 도달하지 않는다.

### C-SOL-5 HIGH — 다른 생성 사각지대가 남아 있다

- `SlipDuplicateService.duplicate`: `SlipLine.copyOf`로 원본을 복제하며 product lookup이 없다. 03:02 KST 현재 활성 끊긴 후보는 **636라인 / 295전표**다.
- `SlipService.restoreToRevision` → `Slip.restoreFromSnapshot`: snapshot productId로 새 라인을 만들지만 lookup이 없다.
- `EstimateSeeder`: 자체 lookup 없이 40견적·정확히 **79라인**을 만든다. 정상 startup에서는 선행 `SlipSeeder(@Order 20)` 통과를 간접 전제로 `@Order 40`에서 실행되지만, 두 runner 사이 삭제/장애 race에는 독립 방어가 없다.

## 3. ①~④ 답

### ① 정상 환경에서 100건을 만드는가

**아니다. 실제 표준 product seed와 결합하면 정상 100건 모두 막힌다.**

보고서와 같은 테스트 fresh 실행:

```text
.\gradlew.bat :services:slip-service:test --tests "*SlipSeederProductIntegrityTest" --rerun-tasks --no-daemon
BUILD SUCCESSFUL in 38s
18 actionable tasks: 18 executed
tests=2, failures=0, errors=0
[SlipSeeder] 완료 — 신규 100건, skip 0건 (총 100건)
```

이는 mock `save()` 100회이며 실 DB INSERT가 아니다. mock은 100개를 모두 ACTIVE로 만들었다. 실제 조합은 생성 0, 차단 100이다.

### ② product 미기동/seed 중 slip 기동

- compose 직접 기동: 상호 dependency 0 → 동시에 뜰 수 있음 → lookup 예외 → slip 기동 실패 → `unless-stopped` 재시작.
- 표준 PowerShell 스크립트: product health 후 slip 시작 → timing race 0회. 하지만 4 DISCONTINUED/soft-delete 100 때문에 여전히 실패.
- 실패 시도 1회당 생성 0, 차단 100. 재시도 상한 0개(무제한 restart).

정상 `-RunSeed`에서도 결정적으로 실패하므로 감당 가능한 기동 실패로 볼 수 없다.

### ③ 조회 실패와 품목 없음 구분

- 200 부분/빈 응답과 5xx·connection 예외는 error code가 다르다.
- bulk 4xx 전체를 품목 없음으로 합쳐 **401/403/408/429 네 종류는 구분 실패**다.
- 명시 connect/read timeout 설정은 **0건**이다.
- 어느 예외든 전표 **100건 차단·저장 0**이다.

### ④ 100의 출처와 증감 내성

| 고정점 | 숫자 |
|---|---:|
| product `HvacProductSeeder.buildAllRows()` | 100 |
| slip `HvacSeedProductCatalog.buildProducts()` | 100 + size assertion |
| `SlipSeeder.buildSpecs()` | 100 + size assertion |
| ProductClient / LookupRequest batch max | 100 |

동적 catalog가 아니라 두 서비스에 복제된 Java 목록이다.

- product만 101로 증가: slip은 옛 100만 사용, 신규 1개 무시.
- slip이 101로 증가: batch max 100에 걸려 전표 100 전체 차단.
- product 1개 삭제/rename/soft-delete/status 변경: 전표 100 전체 차단.
- slip 목록이 99로 감소: modulo로 99개를 반복 사용하면서 전표 spec 100은 유지될 수 있다.

증감 내성은 없다.

## 4. (b) product_id를 받아 라인을 만드는 경로 전수

| 생성 경로 | 검증 | 판정 |
|---|---|---|
| `SlipService.create` | bulk lookup | 직접 입력 차단 |
| `SlipService.addLine` | requireExists | 직접 입력 차단 |
| `SlipUpdateService.update` | bulk lookup | 직접 입력 차단 |
| `SalesSlipUpdateService.update` | bulk lookup | 직접 입력 차단 |
| `MobilePartnerOrderService.createOrder` | bulk lookup | 직접 입력 차단 |
| `SlipPublishService` 3경로 | model lookup으로 ID 결정 | 차단 |
| `EstimateToSlipConverter` | 기존 견적 ID 전부 lookup | 차단 |
| `SlipSeeder` | 100 bulk lookup | 차단하나 정상도 차단 |
| `SlipDuplicateService.duplicate` | **없음** | **636라인/295원본 사각지대** |
| `SlipService.restoreToRevision` | **없음** | **snapshot 사각지대** |
| `SlipRestoreService.restore` | 신규 라인 없이 삭제행 재활성화 | 생성 범위 아님 |
| `EstimateService.create/update` | bulk lookup | 직접 입력 차단 |
| `MobileQuotationService.create` | lookup; bundle은 product expand 응답 | 차단 |
| `EstimateService.restoreToRevision` | 복원 후 모든 ID lookup | 차단 |
| `EstimateSeeder` | 자체 검증 없음, SlipSeeder 순서에 간접 의존 | **40견적/79라인 race 사각지대** |

따라서 “모든 생성 경로가 없어졌다”는 판정은 불가하다.

## 5. (c) fixture 교체와 grep 전수

주문전환 두 곳은 모두 `MOCK_PRODUCT_AJ040_ID`를 사용한다.

```text
mock.ts:12383 productId: MOCK_PRODUCT_AJ040_ID
mock.ts:12415 productId: MOCK_PRODUCT_AJ040_ID
```

정확한 mock 실행:

```text
VITE_MOCK_MODE=1
AUDIT_BASE_URL=http://127.0.0.1:15174
npx playwright test playwright/phase-2-6a-order-convert/phase-2-6a-order-convert.spec.ts --reporter=line
12 passed (10.4s)
PLAYWRIGHT_EXIT=0
```

초기 기본 5173 실행과 mock env 순서가 틀린 고유 포트 실행은 로그인 화면에서 12/12 실패했다. 이를 fixture 회귀로 세지 않고 환경변수를 Vite 시작 전에 넣은 마지막 실행만 판정 근거로 썼다.

`p-aj040` 전수:

- 저장소 전체 **11개 파일** 잔존.
- `mock.ts` **9곳** 잔존: 1997, 2050, 5361, 5401, 5403, 12745, 15580, 15596, 17110.
- 직접 spec: `playwright/slip-collab/coedit-s2a.shots.spec.ts` 1곳.
- 설명/단언 의존: `playwright/d2-6d-inventory-lookup/inventory-lookup.spec.ts`.
- design-system stories: ProductAutocomplete 3곳, LineRow 1곳.

주문전환 12개 spec은 통과했다. 단 교체 UUID는 현재 DB에서 soft-delete라 mock이 아닌 실 backend에 보내면 active lookup을 통과하지 못한다.

## 6. (d) 증거 무결성

| 보고서 주장 | 재현 | 판정 |
|---|---|---|
| 정상 시더 100건 | mock save 100, skip 0 | 재현 |
| 정상 차단 0건 | mock ACTIVE 100에서 0 | 재현 |
| 실제 정상 seed 조합도 100건 | actual 96 ACTIVE/4 DISCONTINUED | **재현 안 됨** |
| 누락 시 저장 0건 | mock 빈 목록에서 save 0 | 재현 |

보고서가 실제 product seed와 결합한 정상을 증명하지 않았고, test fixture가 실제 status 분포를 바꿔 정상 차단 100건을 숨겼다.

추가 fresh 실행:

```text
.\gradlew.bat :services:slip-service:test --tests "*ProductClientTest" --tests "*EstimateSeederTest" --rerun-tasks --no-daemon
BUILD SUCCESSFUL in 36s
ProductClientTest: tests=11 failures=0
EstimateSeederTest: tests=2 failures=0
[EstimateSeeder] 완료 — 신규 40건, skip 0건 (총 40건)
```

`ProductClientTest` 11개는 bulk lookup의 401/403/408/429 분류나 timeout 설정을 검증하지 않고 주로 `lookupByModel`을 검증한다.

## 7. (e) 기존 데이터 무손상

최종 측정: **2026-08-09 03:02:45.226 KST**.

| 테이블 | 전체 | ACTIVE | ABSENT | SOFT_DELETED | BROKEN | 사용자 노출 BROKEN |
|---|---:|---:|---:|---:|---:|---:|
| `slip_lines` | 3,586 | 308 | 303 | 2,975 | **3,278** | **636행 / 295전표** |
| `estimate_lines` | 2,095 | 38 | 0 | 2,057 | **2,057** | **51행 / 25견적** |

정찰 01:36 KST의 BROKEN 3,278/2,057 및 사용자 노출 라인 636/51과 같다. 공유 DB에서 활성 전표 문서 수는 289→295로 움직였지만 끊긴 라인 수는 변하지 않았다. 본 라운드 DB 변경은 0건이다.

## 8. 이 라운드가 보지 않은 것

- product-service를 실제 중지/지연시켜 restart 횟수와 시간을 재지 않았다. Docker 재배포·중지 금지 때문에 compose graph와 예외 전파로 판정했다.
- 실 DB에 시더 100건을 INSERT하지 않았다. 실제 시더는 mock repository로 실행하고 실제 master는 read-only DB/API로 측정했다.
- 범위 밖 D(snapshot 경고)·E(관리자 삭제 정책)는 검증하지 않았다.
- 남은 `p-aj040`를 쓰는 주문전환 외 모든 Playwright spec은 실행하지 않았다. grep 전수와 직접 주문전환 12개 spec까지만 실행했다.

## 9. 신규 파일

- `docs/dev-reports/2026-08-09-1051-slice-c-sol-verify.md`

그 외 tracked 파일 변경 없음. Playwright `test-results/`는 ignored 실행 산출물이다.

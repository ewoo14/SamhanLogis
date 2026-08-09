# PR #1097 / 이슈 #1096 — S12 SOL 재수렴 + 직접 라이브 QA

검증일: 2026-08-07 KST  
검증자: SOL  
결론: **S12 도달 결함 0건. S10의 F1은 새 배포본에서 종결됐고, F3도 S11 페이지네이션으로 종결됐다. F2는 개발책임자 결정대로 이번 판정 분모와 실행 범위에서 제외했다. S11을 되돌릴 조건에 해당하지 않는다.**

## 0. 환경 확인 — 직접 확인한 배포본 시각·SHA

| 항목 | 직접 확인 결과 |
|---|---|
| cwd | `C:\dev\Samhan-Public\.claude\worktrees\t1096` |
| 브랜치 / HEAD | `chore/1096-test-seed-cleanup` / `2eeaa2b43c10e084d53669a89addedfd6340a8df` |
| slip-service 이미지 | `sha256:a126ff0c419766f92319f097dcfd359123784a8a3aca23b03d95ed3c47bcf9e5`, **2026-08-07 19:08:01.217 KST 생성** |
| slip-service 컨테이너 | `ac126a3205fd…`, **19:08:18.718 KST 생성 / 19:08:51.467 시작 / healthy** |
| 실행 JAR | `/app/app.jar`, **19:07:28 KST**, 124,749,910 byte |
| 실행 artifact 내용 | `EstimateRepository.class`에서 `WHERE (:includeDeleted = TRUE OR e.is_deleted = FALSE)` 직접 추출. V117 포함, 범위 제외된 V118 없음 |
| HEAD와 backend 동등성 | S9 `4e261682d`부터 HEAD까지 `services/slip-service` diff가 0파일이다. 즉 JAR에서 확인한 S9 조건은 HEAD의 slip-service 소스와 동일하다 |
| Git SHA 표기 한계 | 이미지 label/JAR manifest에는 Git SHA가 내장돼 있지 않다. 따라서 임의의 embedded SHA를 주장하지 않고 **HEAD SHA + 이미지 digest + JAR 내용 동등성**으로 확인했다 |
| Gateway / slip health | `:8080/actuator/health` UP, `:18086/actuator/health` UP |
| Flyway | `slip_db V117 success=true`, `partner_order_db V18 success=true` |
| 렌더러 | HEAD의 `clients/desktop`, `VITE_MOCK_MODE=0`, `VITE_APP_VERSION=2026/08/07-109612`, `http://localhost:5196` |
| 주문 웹 | HEAD의 `clients/web/order-app`, `http://localhost:5180` |
| 브라우저 | `node + @playwright/test`, **`chromium.launch({ headless: true })`**, 데스크톱 1600×1000 / 주문 주소검색 390×844 |
| 인증 | 실제 로그인 UI 사용. 자격정보는 이 보고서에서 `<redacted>` |
| DB 변경 | 직접 SQL은 전부 `SELECT`. 생성·삭제는 지시된 라이브 UI에서만 실행 |
| 금지 준수 | 컨테이너 재빌드·재기동, 소스 수정, commit, push, 다른 워크트리 접근 없음 |

이미지 시각과 artifact 내용 모두 S10의 16:54 배포본과 다르다. 특히 실행 class 자체에 S9 조건이 존재하므로 이번에는 F1을 판정할 수 있다.

## 1. 발화 조건 카운트와 측정 시각

### 최초 UI/API 측정

| 시각(KST) | 화면/조건 | OFF(활성) | ON(삭제 포함) | 차이 |
|---|---|---:|---:|---:|
| 19:17:37~38 | 견적, size=50 | **42** | **2,035** | +1,993 |
| 19:18:13~14 | 주문, 화면 기본 `status=DRAFT`, size=50 | **3** | **1,988** | +1,985 |
| 19:19:05~06 | 판매전표 OUTBOUND, size=20 | **311** | **2,473** | +2,162 |

주문의 모든 상태를 직접 API로 합친 값은 같은 라운드 초기에 활성 3 / 전체 2,024였다. 화면은 기본 DRAFT 필터를 유지하므로 UI의 ON 값 1,988이 정상 모집단이다.

### 종료 직전 SELECT-only 재측정 — 19:37:21 KST

| 집합 | 활성 | 삭제 | 전체 |
|---|---:|---:|---:|
| 견적 | **43** | 1,993 | **2,036** |
| 주문(모든 상태) | **4** | 2,021 | **2,025** |
| 판매전표 OUTBOUND | **311** | 2,163 | **2,474** |

증감은 S12 정상 생성 3건과 동시성 검증용 판매전표 UI 삭제 1건을 포함한다. 병렬 트랙의 공유 DB 사용 때문에 라운드 중 다른 수치 변화 가능성을 전제로 시각을 함께 기록했다.

## 2. 라이브 QA ①~⑤

### ① 기본 진입 — 활성만 노출: PASS

- 견적: 체크 OFF, 42건, 받은 42행 전부 `isDeleted=false`.
- 주문: 체크 OFF + 기본 DRAFT, 3건, 받은 3행 전부 활성.
- 판매전표: 체크 OFF + OUTBOUND, 311건 / 16페이지, 첫 20행 전부 활성.
- F1의 핵심 재측정에서 견적 `includeDeleted=false`가 42, `true`가 2,035로 **서로 다른 값**을 반환했다.

증거: [견적 기본](../qa-shots/1096-s12-live-qa/01-estimate-default.png), [주문 기본](../qa-shots/1096-s12-live-qa/01-order-default.png), [판매전표 기본](../qa-shots/1096-s12-live-qa/01-slip-default.png)

### ② `삭제 문서 포함` ON — 삭제행 유입: PASS

- 견적: 2,035건 / 41페이지, 첫 페이지 삭제행 8건과 삭제 배지 노출.
- 주문: DRAFT 1,988건 / 40페이지, 첫 50행 중 삭제행 47건. 취소선·삭제자 배지·복원 버튼 노출.
- 판매전표: 2,473건 / 124페이지, 첫 페이지에서도 삭제행 1건 확인.
- 세 화면 모두 OFF/ON 값이 명확히 분리됐다. S10의 “둘 다 2,029”는 재현되지 않았다.

증거: [견적 ON](../qa-shots/1096-s12-live-qa/02-estimate-include-deleted-first.png), [주문 ON](../qa-shots/1096-s12-live-qa/02-order-include-deleted-first.png), [판매전표 ON](../qa-shots/1096-s12-live-qa/02-slip-include-deleted-first.png)

### ③ S11 페이지네이션 — 실제 마지막 페이지: PASS

| 화면 | 페이지 크기 | ON 첫 페이지 | 실제 마지막 페이지 | 마지막 `다음` | OFF 복귀 |
|---|---:|---:|---:|---|---|
| 견적 | 50 | 1 / 41 | **41 / 41** | disabled | page=0, 활성 42, pagination 소멸 |
| 주문 | 50 | 1 / 40 | **40 / 40** | disabled | page=0, 활성 3, pagination 소멸 |
| 판매전표 | 20 | 1 / 124 | **124 / 124** | disabled | **1 / 16**, 활성 page=0 |

각 화면에서 `다음` 버튼을 실제로 반복 클릭하고 매 페이지 표시 변경을 기다렸다. 단순 API 마지막 페이지 호출이 아니다.

증거: [견적 마지막](../qa-shots/1096-s12-live-qa/04-estimate-include-deleted-last-page.png), [주문 마지막](../qa-shots/1096-s12-live-qa/04-order-include-deleted-last-page.png), [판매전표 마지막](../qa-shots/1096-s12-live-qa/04-slip-include-deleted-last-page.png), [견적 OFF 복귀](../qa-shots/1096-s12-live-qa/05-estimate-toggle-off-page-zero.png), [주문 OFF 복귀](../qa-shots/1096-s12-live-qa/05-order-toggle-off-page-zero.png), [판매전표 OFF 복귀](../qa-shots/1096-s12-live-qa/05-slip-toggle-off-page-zero.png)

### ④ 삭제 문서 직접 URL — 상세 차단: PASS

| 문서 | 직접 진입 결과 |
|---|---|
| 삭제 견적 | 상세 API 404, 오류 화면. 문서 본문 미노출 |
| 삭제 주문 | 상세 API 404, 조회 실패. 문서 본문 미노출 |
| 삭제 판매전표 | 상세 API 404, 오류 화면. 문서 본문 미노출 |

증거: [삭제 견적](../qa-shots/1096-s12-live-qa/06-deleted-estimate-direct-blocked.png), [삭제 주문](../qa-shots/1096-s12-live-qa/06-deleted-order-direct-blocked.png), [삭제 판매전표](../qa-shots/1096-s12-live-qa/06-deleted-slip-direct-blocked.png)

### ⑤ 정상 생성 경로 — 3종 모두 생성 후 상세 진입: PASS

| 문서 | 직접 수행한 정상 경로 | 결과 |
|---|---|---|
| 견적 | 데스크톱 신규 작성 → 활성 거래처 선택 → 모델 lookup → 수량/단가 확인 → 임시저장 | **`2026/08/07-12` 생성**, 상세 진입 |
| 주문 | 주문 웹 실제 로그인 → 홈멀티 품목 수량 1 → 카카오 주소검색 → 전송목록 확인 → 최종 발송 | draft **201**, confirm **200**, **`2026/08/07-1` 생성**, 데스크톱 상세 진입 |
| 판매전표 | 데스크톱 새 판매전표 → 본사창고 → 활성 거래처 → 모델 선택/4라인 전개 → 저장 | POST **201**, **`2026/08/07-29` 생성**, 상세 진입 |

증거: [견적 저장 전](../qa-shots/1096-s12-live-qa/07-new-estimate-ready.png), [견적 상세](../qa-shots/1096-s12-live-qa/08-new-estimate-saved-detail.png), [판매전표 저장 전](../qa-shots/1096-s12-live-qa/09-new-slip-ready.png), [판매전표 상세](../qa-shots/1096-s12-live-qa/10-new-slip-saved-detail.png), [주문 작성](../qa-shots/1096-s12-live-qa/11-new-order-ready-mobile.png), [주문 최종 확인](../qa-shots/1096-s12-live-qa/12-new-order-final-confirm.png), [주문 발송 완료](../qa-shots/1096-s12-live-qa/13-new-order-sent.png), [주문 상세](../qa-shots/1096-s12-live-qa/14-new-order-saved-detail.png)

## 3. S11 새 표면

### 페이지 이동 중 토글 OFF

세 화면 모두 마지막 페이지에서 OFF로 바꿨다. 견적·주문은 활성 결과가 1페이지라 pagination이 사라졌고, 판매전표는 `124 / 124`에서 `1 / 16`으로 복귀했다. stale 마지막 페이지 데이터는 남지 않았다.

### 검색어 + 삭제포함 + 2페이지

주문에서 삭제포함 ON, 검색어 `2026`을 입력하고 `2 / 40`까지 실제 이동했다. 검색어를 제거하면 page=0으로 복귀한 뒤 전체 DRAFT 삭제포함 결과를 다시 표시했다.

증거: [검색+삭제포함+2페이지](../qa-shots/1096-s12-live-qa/03-order-search-include-deleted-page-2.png)

### 정렬 변경 + 페이지 유지

세 목록의 DOM에서 `th button`, `[aria-sort]`가 모두 0개였고 API 응답도 `sort.unsorted=true`였다. 현재 세 화면에는 사용자 정렬 조작이나 sort query parameter가 없다. 따라서 **정렬 변경 후 페이지 유지라는 실행 가능한 표면이 없으며**, S11이 추가한 이전/다음 계약의 실패로 세지 않았다. 향후 정렬 기능을 추가한다면 별도 상태 계약이 필요하다.

### 마지막 페이지에서 삭제 문서가 하나 늘어나는 동시성

두 headless 브라우저 페이지를 동시에 사용했다.

1. A: 판매전표 삭제포함 ON → 실제 `124 / 124` 마지막 페이지 도달.
2. B: S12가 생성한 `2026/08/07-29` 상세에서 UI 삭제 실행 → DELETE 200.
3. SELECT: OUTBOUND `활성 312 / 삭제 2,162` → `활성 311 / 삭제 2,163`.
4. A: realtime/refetch 뒤에도 **`124 / 124` 유지**, `다음` disabled, API 전체 2,474 / 124페이지.

마지막 페이지가 빈 stale page로 밀리거나 page index가 범위를 벗어나지 않았다.

증거: [동시 삭제 뒤 마지막 페이지](../qa-shots/1096-s12-live-qa/18-slip-last-page-after-concurrent-delete.png)

### 화면 이동 후 상태 잔존

각 화면에서 홈으로 이동한 뒤 같은 목록으로 재진입했다. 세 화면 모두 토글 OFF, page=0으로 초기화됐고 이전 삭제포함 마지막 페이지 데이터가 노출되지 않았다.

## 4. 결함 수 — S10 대비

```text
S10 결함 수: 3  (F1 판정불가 · F2 범위제외 전 · F3 페이지네이션)
S10 실도달:  2
S12 결함 수: 0
증감:         -3 (현재 확정 범위 기준)
```

| S10 항목 | S12 도달 경로 | S12 판정 |
|---|---|---|
| F1 | 로그인 → 견적 목록 OFF 42 → ON 2,035 → 다시 OFF 42 | **종결. 새 배포본에서 필터 동작** |
| F2 | 실행·SELECT·판정하지 않음 | **개발책임자 결정대로 범위 제외** |
| F3 | 세 목록 ON → `다음` 반복 → 각각 41/41, 40/40, 124/124 → OFF | **종결. S11 동작** |

S12 신규 결함은 없으므로 신규 결함별 도달 경로도 없다. PM의 “같거나 늘면 S11 되돌림” 조건은 성립하지 않는다.

### 주문 QA 계정 음성 분기 — 결함 미산입

과거 QA 기록의 전용 인증 계정은 로그인되지만 활성 거래처 master와 연결되지 않아 최종 confirm에서 “거래처 정체성 확인 불가”로 거절됐다. 이 분기는 과거 보고서에도 같은 결과가 기록돼 있고, 유효한 활성 거래처라는 정상 생성 발화 조건을 충족하지 않는다. 실제 활성 거래처 계정으로 같은 UI를 다시 수행해 주문 생성과 상세 진입이 성공했으므로 S11 결함으로 세지 않았다. 오히려 매핑 없는 신원으로 주문을 만들지 않은 음성 가드다.

## 5. F2 범위 제외 판정

이번 S12에서는 `created_by='system-internal'` 3건을 조회·수정·삭제하지 않았다.

개발책임자 판정에 동의한다. `system-internal`은 `InternalTokenFilter.INTERNAL_PRINCIPAL`이며 “내부 서비스 호출로 만들어졌다”만 증명한다. 테스트 실행 provenance, deterministic 모델명, 전용 memo 같은 추가 표식이 없으면 실제 업무와 테스트 데이터를 구분할 수 없다. `SlipPartnerBackfillIT`의 principal 단언도 호출 주체를 설명할 뿐 데이터의 테스트 성격을 증명하지 않는다. 따라서 provenance 불명 3건을 cleanup migration으로 삭제하는 것은 근거 부족이고, V118 제외가 맞다.

## 6. 본 범위와 안 본 범위

본 범위:

- 새 slip-service 배포 artifact 시각/digest/JAR 내용과 HEAD backend diff 확인.
- 실제 gateway 로그인과 headless Chromium GUI.
- 견적·주문·판매전표의 기본/삭제포함 목록, count, 모든 마지막 페이지, OFF 복귀.
- 주문 검색어+삭제포함+2페이지, route 왕복 초기화.
- 삭제 문서 3종 직접 URL 차단.
- 견적·주문·판매전표 각 1건 정상 UI 생성과 상세 진입.
- UI 동시 삭제 중 판매전표 마지막 페이지 안정성.
- DB의 문서 활성/삭제 count와 Flyway 버전 SELECT.

안 본 범위:

- **F2 `system-internal` 3건의 조회·수정·삭제·추가 provenance 조사.**
- 모바일 직원 앱, 아로로지스, 회계/구매 mutation.
- 삭제 복원 실행. 목록의 복원 버튼 노출만 확인.
- Excel export 파일 생성.
- 사용자 정렬 기능. 현재 화면에 정렬 조작 자체가 없다.
- cleanup 전체 문서의 행별 수동 열람.

## 7. 프로세스와 새 파일

라운드용 Chromium은 각 시나리오 종료 때 모두 닫았다. renderer/order-app Vite는 보고서 작성 후 PID·실행파일 경로를 확인해 종료하고 5196/5180 listener 해제를 최종 확인한다. 주문 웹 QA를 위해 설치한 ignored `node_modules`도 해당 앱 경로만 확인해 회수한다.

새 파일:

```text
docs/dev-reports/2026-08-07-1096-s12-reconvergence-and-live-qa.md
docs/qa-shots/1096-s12-live-qa/*.png  (25개)
```

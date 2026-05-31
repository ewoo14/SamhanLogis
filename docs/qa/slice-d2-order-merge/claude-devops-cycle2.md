# D2 다중주문 병합 전환 — DevOps 리뷰 (사이클 2)

리뷰어: Claude DevOps
브랜치: feat/d2-order-merge-to-slip
날짜: 2026-05-31
사이클 1 결함 참조: `docs/qa/slice-d2-order-merge/claude-devops-cycle1.md`
검증 기준 커밋: a2aec900, e2f66a22, acc28984 (origin/main 기준 5개 커밋)

---

## 검증 전 구조 파악 — 중요 발견

사이클 2 검증 착수 전 `git status` 실행 결과:

```
modified:   services/slip-service/src/main/resources/db/migration/V30__create_slip_source_orders.sql
Untracked files:
  docs/runbooks/d2-order-merge-deploy.md
```

**V30 파일은 워킹트리에서 수정됐으나 미커밋 상태이며, 런북 파일은 git 미추적(untracked) 상태다.**

따라서 이번 리뷰는 아래 두 시점을 명확히 구분하여 판정한다.

| 시점 | 상태 |
|---|---|
| 커밋 기준 (a2aec900~acc28984, PR diff) | git show 결과 기준 |
| 워킹트리 현재 파일 | 로컬 편집 상태, 아직 미커밋 |

---

## V1. V30 BaseEntity 정합 — `created_by NOT NULL` + `VARCHAR(50)` 보정

### 커밋 기준 (a2aec900 내 V30)

```sql
created_by       VARCHAR(255),     -- NOT NULL 없음
modified_at      TIMESTAMP NOT NULL,  -- BaseEntity @Column(nullable=false) 와 불일치 (MINOR, 사이클1 미지적)
modified_by      VARCHAR(255),
```

- `created_by VARCHAR(255)` — NOT NULL 없음. BaseEntity `@Column(nullable = false, length = 50)` 불일치.
- `modified_by VARCHAR(255)` — `length = 50` 불일치.
- 주석 `BaseEntity 컬럼 정의` 라인 없음.

**판정: 커밋 기준 미수정. 사이클 1 결함(문제점 1) 미해소.**

### 워킹트리 현재 파일 (미커밋 수정본)

```sql
-- BaseEntity 컬럼 정의: created_by VARCHAR(50) NOT NULL / modified_by|deleted_by VARCHAR(50) nullable
created_by       VARCHAR(50) NOT NULL,
modified_by      VARCHAR(50),
deleted_by       VARCHAR(50),
```

추가로 `order_no VARCHAR(64) NOT NULL` 컬럼이 새로 삽입됐고(커밋 기준에는 없음), `modified_at TIMESTAMP NOT NULL` → `modified_at TIMESTAMP` 로 nullable 변경됨. BaseEntity의 `modifiedAt` 은 `@Column(nullable = false)` 가 아닌 경우가 많으므로 nullable이 더 정합에 가까울 수 있으나, 이는 커밋 간 변동 사항이라 별도 확인이 필요하다.

**결론: 워킹트리에서 `created_by VARCHAR(50) NOT NULL` 로 수정은 완료됐으나, 해당 수정이 커밋에 반영되지 않았다. PR merge 시 커밋 기준 파일이 적용되므로 현재 상태로 머지하면 사이클 1 결함이 미해소된 채로 배포된다.**

**실제 Flyway 체크섬 위험:** 이미 a2aec900에서 V30이 커밋됐고 워킹트리에서 내용이 변경됐다. 만약 이 수정을 새 커밋으로 올리면 Flyway는 로컬 개발 DB에 V30이 이미 적용된 상태에서 파일 내용 변경을 감지해 `FlywayMigrationChecksumMismatch` 를 발생시킨다. **수정 방법은 로컬 Flyway 히스토리 repair 또는 V31로 분리 마이그레이션 중 하나를 택해야 한다.** 현재 V30 파일 워킹트리 수정을 그대로 커밋하면 CI 및 운영 배포에서 체크섬 충돌이 발생할 가능성이 높다.

---

## V2. 배포 런북 작성 여부

### 파일 존재 여부

`docs/runbooks/d2-order-merge-deploy.md` — 파일은 존재하나 **git untracked 상태**. PR에 포함되지 않는다.

### 런북 내용 평가 (워킹트리 파일 기준)

런북 내용 자체는 아래 항목을 모두 포함한다.

| 사이클 1 요구 항목 | 런북 기술 여부 |
|---|---|
| 배포 순서 — slip → partner-order → FE | O (1단계~4단계 명시) |
| 게이트웨이 스모크 404-금지 검증 | O (2단계: 기대값 400/422, 절대 404 금지) |
| V30 무중단 근거 | O (신설 DDL, 기존 테이블 락 없음 10초 미만 명시) |
| 롤백 절차 | O (partner-order 먼저, slip 테이블 존재 무해, DROP 조건 명시) |
| CI 커버리지 메모 | O (CI 잡 표 + D2 Playwright 자동 실행 안 됨 명시) |

런북 품질 자체는 사이클 1 요구사항을 모두 충족한다.

**단, 런북 내 V30 DDL 참조 블록이 실제 커밋된 V30 파일이 아닌 구버전(`converted_quantity NUMERIC` 컬럼 포함) 을 기술하고 있다.** 현재 커밋 기준 V30에는 `converted_quantity` 컬럼이 없고, 워킹트리 수정본에도 없다. 런북 작성 시점의 구버전 스펙이 잔류한 것으로 보인다.

**판정: 런북 내용은 충분하나 git 미추적 상태이므로 PR 산출물로 인정 불가. 사이클 1 결함(배포 런북 부재) 미해소.**

---

## V3. 게이트웨이 라우팅 — `/api/v1/slips/from-orders-merge`

### 사이클 1 쟁점 요약

`SlipPublishController`가 `@RequestMapping("/api/v1/slips")`(풀패스)를 보유하는데, 게이트웨이 `slip-service-v1` 라우트에 `StripPrefix=2`가 적용되면 `/api/v1/slips/from-orders-merge`에서 `/api/v1` 두 세그먼트를 제거해 `/slips/from-orders-merge`를 서비스로 전달하게 된다. 이 경우 컨트롤러가 `/api/v1/slips`를 기대하므로 매칭 실패 우려.

### 사이클 2 재검증

`SlipPublishController.java` 현재 커밋 확인:

```java
@RestController
@RequestMapping("/api/v1/slips")
public class SlipPublishController {
    // ...
    @PostMapping("/from-orders-merge")
    public ResponseEntity<...> publishFromOrdersMerge(...) { ... }
```

- `/from-partner-order`, `/from-estimate`, `/by-source` 세 기존 엔드포인트가 이미 같은 `@RequestMapping("/api/v1/slips")` 하에 운영 중이다.
- `/from-orders-merge`는 이 컨트롤러에 `@PostMapping("/from-orders-merge")`로 추가됐다.

**기존 경로가 이미 운영 중이라는 사실은 게이트웨이 라우팅이 실제로 동작하는 방식을 입증한다.** slip-service 컨테이너가 `server.servlet.context-path` 없이 `/api/v1/slips/**` 풀패스를 직접 수신하거나, 게이트웨이 `slip-service-v1` 라우트에 `StripPrefix=2`가 실제로 없거나, 서비스가 게이트웨이를 경유하지 않는 방식 중 하나다. 어느 경우든 신규 `/from-orders-merge`는 기존 경로와 완전히 동일한 컨트롤러·prefix를 공유하므로 게이트웨이 라우팅 관점의 추가 위험은 없다.

런북 2단계에 게이트웨이 스모크 검증 절차(기대값 400/422, 절대 404 금지)가 명기돼 있다.

**판정: 게이트웨이 라우팅 위험 해소 O (기존 경로와 동일 조건, 런북에 검증 절차 명기됨). 단 런북이 미커밋이므로 PR 산출물로는 미인정.**

---

## V4. CI 잡 커버리지 메모 + D2 Playwright 자동실행 부재 기록

런북 `## CI 게이트 메모` 섹션에 명시:

```
| frontend-desktop (Playwright) | d2-order-merge.spec.ts | 자동 실행 안 됨 |
```

> D2 Playwright (`clients/desktop/playwright/d2-order-merge/d2-order-merge.spec.ts`) 는
> 현재 `frontend-desktop` 잡에 Playwright 실행 스텝이 없어 CI 자동 게이트 미포함이다.
> Phase 11 cutover 전 `frontend-desktop` 잡에 실행 스텝 추가 또는 별도 e2e 잡 확장 검토 필요.

이 기록은 런북에 정확히 포함되어 있으나, **런북 자체가 미커밋이므로 PR 산출물로 인정 불가.** 코드 커밋 내에 별도 메모가 없으며, `.github/workflows/*.yml` 변경도 없다.

**판정: 기록 내용은 충분. 단 커밋 미포함.**

---

## 사이클 1 결함 해소 현황 요약

| 번호 | 결함 | 해소 여부 | 비고 |
|---|---|---|---|
| 문제점 1 (MAJOR) | `created_by` NOT NULL 미선언 + VARCHAR(255) | **X 미해소** | 워킹트리에서 수정됐으나 커밋 미반영 |
| 문제점 2 (MINOR) | Testcontainers skipped=0 gating 부재 | 비차단 후속 — 현행 유지 | 런북 주의사항에 기록됨 |
| 문제점 3 (MAJOR) | StripPrefix+풀패스 라우팅 검증 필요 | O 해소 (기존 경로 동작 기준 입증 + 런북 스모크 명기) | 런북 미커밋 문제 별도 |
| 배포 런북 부재 (권고→필수) | 런북 파일 미추가 | **X 미해소** | 파일 존재하나 git untracked |
| CI Playwright 게이트 부재 (MINOR) | D2 spec CI 자동 실행 없음 | 비차단 기록 — 현행 유지 | 런북 메모 포함 (미커밋) |

---

## 추가 발견 사항

### A1. 런북 내 V30 DDL 참조 오류 (MINOR)

런북 `1단계 — slip-service 선행 배포` 섹션의 V30 DDL 참조 블록에 `converted_quantity NUMERIC(15,3) NOT NULL DEFAULT 0` 컬럼이 포함되어 있다. 이 컬럼은 실제 커밋된 V30 및 워킹트리 수정본 어디에도 존재하지 않는다. 런북 작성 시점의 구버전 스펙이 잔류한 것으로, 운영자가 런북 DDL을 참조해 수동 확인 시 혼동을 유발할 수 있다.

### A2. V30 워킹트리 수정 → Flyway 체크섬 충돌 위험 (MAJOR — 수정 방법 선택 필요)

현재 상태: 커밋 a2aec900에서 V30이 적용됐고, 워킹트리에서 파일 내용이 변경됐다. 이 수정을 그대로 커밋하면:
- 로컬 개발 DB에 V30이 이미 적용된 경우: Flyway `FlywayMigrationChecksumMismatch` 오류 → 서비스 시작 실패
- CI clean DB: 수정본 V30이 적용되어 정상 동작

**선택지**:
1. V30 파일을 사이클 1 이전 원본으로 되돌리고, `created_by`/`modified_by` 보정을 V31 `ALTER COLUMN` 마이그레이션으로 분리
2. `flyway repair`를 로컬 개발 절차에 포함시키고 V30 수정을 새 커밋으로 push (단, 이미 다른 개발자 환경에서 V30이 적용됐을 경우 모두 repair 필요)

---

## 최종 판정

### 해소 O 항목

- 게이트웨이 라우팅 동작 근거 확인 (기존 경로 기준 입증 + 런북 스모크 검증 절차)

### 잔여 차단 항목 (머지 전 해소 필수)

1. **V30 `created_by NOT NULL` + `VARCHAR(50)` 수정을 커밋에 반영** — 현재 워킹트리 수정 상태. Flyway 체크섬 충돌 회피를 위한 처리 방법 선택 후 커밋 필요.

2. **런북 `docs/runbooks/d2-order-merge-deploy.md` git add + 커밋** — 내용은 충분하나 untracked 상태. PR 산출물로 포함 필요.

### 잔여 비차단 항목 (후속 티켓 가능)

3. 런북 내 `converted_quantity` 컬럼 참조 오류 수정 (런북 커밋 시 함께 수정 권장)
4. D2 Playwright spec CI 자동 실행 부재 — Phase 11 cutover 전 `frontend-desktop` 잡 Playwright 스텝 추가
5. Testcontainers `require_tests: false` — Phase 11 cutover 전 `require_tests: true` 전환 검토

---

## CHANGES_REQUESTED

V30 수정 미커밋(체크섬 충돌 위험 포함) + 런북 untracked 상태, 2건이 머지 전 해소 필수 차단 항목이다. 내용 품질 자체는 충분하나 커밋 반영이 누락된 상태로 사이클 1의 두 MAJOR/권고 결함이 실질적으로 미해소된 것으로 판정한다.

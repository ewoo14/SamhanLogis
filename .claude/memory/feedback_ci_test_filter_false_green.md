# CI 테스트 필터 = 패키지 allowlist 라 누락 패키지 false-green

**2026-06-01 발견 (S2 #338 회고).**

`.github/workflows/ci.yml` 의 slip 테스트 잡들은 **패키지 allowlist `--tests` 필터**로 실행한다:
- `slip-units`: `--tests "...slip.client.*" --tests "...slip.domain.*" --tests "...slip.delivery.domain.*" --tests "...slip.delivery.service.*" --tests "...slip.service.*"`
- `slip-it-core`: `--tests "...slip.it.*"`, `slip-it-public`: `--tests "...slip.delivery.it.*" --tests "...slip.publish.*"`

→ **이 필터에 없는 패키지(예: `slip.attachment.*`)의 테스트는 CI 에서 아예 실행되지 않는다.** `SlipPhotoAuditAdminControllerTest`(slip.attachment.web)가 #316 권한 enum 마이그레이션 이후 `action()` enum↔String 비교로 **상시 실패 상태였으나 CI green** 이었던 원인이 이것.

**왜**: gradle `--tests` 가 화이트리스트라, 신규 컨트롤러/패키지를 추가해도 CI 필터에 등재 안 하면 그 테스트는 침묵 미실행 → false-green.

**적용**:
- slip-service 에 **새 테스트 패키지를 추가하면 반드시 `ci.yml` 의 해당 잡 `--tests` 필터에도 추가**할 것. 신규 IT 는 `slip.it.*` 안에 두면 `slip-it-core` 가 자동 커버(S2 IT 가 그 경우).
- 차기 작업 시 **CI 필터 보강 별도 PR** 권장(누락 패키지 전수 등재 또는 exclusion 방식 전환). inventory 잡은 모듈 전체(`:inventory-service:test`, 필터 없음)라 안전.
- "CI green ≠ 전 테스트 통과" — 특히 slip-service. [[feedback_enforcement_real_http_test]](false-green 차단) 계열.

관련: date-bomb 테스트(하드코딩 월범위 조회)도 같은 PR 에서 6월 진입 시 노출 — 하드코딩 날짜 테스트 전수점검 필요.

---

## 🚨 두 번째 형태 — Testcontainers IT 의 **조용한 skip** (2026-07-22 실측, 하루에 2건)

allowlist 누락(=아예 안 돌림)과 별개로, **모듈은 실행되는데 IT 만 skip 되는** 경로가 있다. `AbstractPostgresIT` 계열은 `@ExtendWith(DockerAvailableCondition.class)` 로 **Docker 미가용 시 IT 를 skip 시켜 `gradle test` 를 통과**시킨다(한글경로 JDK 트랩 회피용 의도된 설계 — [[feedback_korean_path_jdk]] [[feedback_testcontainers_windows_docker]]).

⟹ 그 상황에서 **IT 가 유일한 방어선인 fix 는 미검증인 채 CI green** 이 된다.

**이 저장소는 이미 대응 패턴을 제도화해 뒀다** — `ci.yml` 에 특정 IT 의 JUnit XML 을 읽어 `skipped="0"` 을 강제하는 **hard gate 가 9개 이상**:
```
#848 DocumentTemplateIT · #850 SalesAccountingSlipConcurrencyIT · #850 PurchaseAccountingSlipConcurrencyIT
#854 SlipPublishOutboxProcessorIT(+ tests>=25 하한) · #848 ApprovalLineConfigInstantiationIT
#848 ApprovalLineConfigControllerIT · E2 CollectionRealtimePublisherTest · S3-2 EstimateCollabIT · S3-5 DispatchCollabIT …
```

**실측 누락 2건(같은 날)**: `TaskSchedulerPoolSizeIT`(#876 N-3 의 유일 방어선) · `GroupwareAdminControllerIT`(#865 ACTIVE-0 각인의 유일 방어선, 뮤테이션으로 2차원이 독립 확인). 둘 다 `grep -c <클래스> ci.yml` = **0**.

**적용**:
- **신규 IT 가 어떤 fix 의 유일한/핵심 방어선이면 `skipped=0` hard gate 를 함께 등재**한다([[feedback_defect_family_sweep_fix]] — 확립된 패턴이 있으면 계열 전수 적용).
- PM 검증 시 *"이 fix 를 지키는 테스트가 무엇인가"* → *"그 테스트가 안 돌아도 CI 가 green 인가"* 를 **한 쌍으로** 물을 것. 앞만 물으면 통과한다.
- 로컬 genuine 실행에서 `skipped=0` 을 확인했다 해도 **CI 러너에서의 skip 은 별개** — 권위는 exact SHA 의 CI 아티팩트(테스트 **이름 단위** 대조가 가장 강함).
- 하한 없는 게이트도 같은 구멍 — `clients/desktop/scripts/assert-playwright-ran.mjs` 는 `expected>0`·`unexpected==0`·`skipped==0` 만 강제하고 **최소 실행 건수 하한이 없어** `testMatch`/`testIgnore` 축소를 못 잡는다(#864 가 공유 config 를 좁혀 82스펙을 무력화했는데 통과한 경로). 백엔드 게이트는 이미 `tests>=25` 하한 사용.

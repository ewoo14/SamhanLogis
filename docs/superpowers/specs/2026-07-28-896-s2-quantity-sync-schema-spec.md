# #896 슬2 (단계 1) — 수량 동기화 규칙 스키마 · 저장 검증 · 명시 시드

> 작성 2026-07-28 · OPUS 기획 · 근거 SHA `5d433d8e2`
> 연관 Issue: #896 · 선행 슬1 = PR #948(`2cb21872b`, 머지 완료)

> 🚨 **2026-07-28 범위 축소 정정(개발책임자 결정, PR #958 R5 이후)** — 아래 §4 **I-2 는 이
> 슬라이스에서 더 이상 성립하지 않는다.** V24 의 DB constraint trigger 6개(products·
> bundle_component·product_estimate_exposure 3개 기존 테이블 + quantity_sync_rule/
> source/target 자신)를 전부 제거했다 — 그 테이블들의 오래된 쓰기 경로(품목 CRUD·시트
> sync·이카운트 임포트·구성품 관리)가 라운드마다 새로 걸려 5라운드 연속 도달 가능 결함을
> 냈기 때문이다(수렴비 c 1.00→3.50 악화). **I-1·I-3·I-4·I-5·I-6 은 그대로 성립**하며,
> 강제는 이제 Java 계층(`QuantitySyncRuleValidator`) 단독이다 — DB 를 직접 SQL 로 우회하면
> 더 이상 막히지 않는다. I-2 재도입은 #896 슬3(evaluator 도입 시점, 실측 기반)으로 미룬다.
> 상세 근거·제거/유지 목록 전수·검증 원문은
> `docs/dev-reports/2026-07-28-896-s2-quantity-sync-schema.md` §10 을 참조.

---

## 1. 이 슬라이스가 서는 자리

에픽 #896 은 **6개 슬라이스**로 쪼개져 있고(PR #948 코멘트 #1), 슬1(단계 0 — 정답 고정)이 끝났습니다.

| 슬 | 범위 | 상태 |
|---|---|---|
| 슬1 | 단계 0 — legacy 수량 계산을 순수 입력→출력 경계로 감싸고 golden matrix 생성. **런타임 동작·금액 변경 0** | ✅ PR #948 |
| **슬2 (본 PR)** | **단계 1 — `product-service` 규칙 스키마 · 저장 검증 8종 · 명시 시드** | 🚧 |
| 슬3 | 단계 2 — config evaluator + shadow exact diff | 대기 |
| 슬4 | 단계 3 — 저장 견적/주문 문서 replay (금액 허용차 전 항목 0원) | 대기 |
| 슬5 | 단계 4 — 앱별 `LEGACY`/`SHADOW`/`CONFIG` cutover | 대기 |
| 슬6 | 칩 UI (견적품목 관리 부착) | 대기 |

🔑 **본 슬라이스도 런타임 동작 변경이 0입니다.** 스키마와 데이터를 만들 뿐, 이것을 읽는 evaluator 는 슬3 입니다. 견적·주문 금액에 영향이 없어야 합니다.

---

## 2. 확정된 설계 결정 (개발책임자 일괄 승인, 2026-07-27)

`docs/superpowers/specs/2026-07-27-896-survey.md` §11 의 10항이 **권장안 그대로 승인**됐습니다(PR #948 코멘트 #1). 슬2 에 직접 걸리는 것:

| 결정 | 슬2 에서의 의미 |
|---|---|
| **#3 명시 Product 관계** | source/target 은 **Product FK 행으로 펼친다.** 품명 정규식·`catM`·attribute 를 조건 컬럼으로 저장 **금지**. 현재 정규식이 뽑아내는 결과를 마이그레이션 시 명시 행으로 전개 |
| **#6 BUNDLE 경계 거부 강제** | *"BUNDLE source → 그 BUNDLE 의 `BundleComponent` target"* 연결은 **BE 400**. `BundleComponent.defaultQty/QtyMode` 가 유일 진실원 |
| **#4 H-07 · #5 C-09** | **설정 레코드를 만들지 않는다.** legacy evaluator 소유로 남기고 그 사실을 주석·테스트로 잠근다 |
| **#8 C-08 → C-05 흡수** | C-08 을 별도 중복 경로로 시드하지 않는다 |
| **#2 앱별 현행 시드** | 견적/주문의 기존 드리프트 8건을 시드에서 **통일하지 않는다** |
| **#1 정본 read-only** | 슬2 는 정본 2파일을 건드리지 않는다 |

---

## 3. 스키마 — 정본은 survey.md

**`survey.md` §6.2(`:503-541`)의 테이블 3개 필드 정의를 그대로 따르세요.** 여기 옮겨 적지 않습니다 — 전사하면 어긋납니다.

- `quantity_sync_rule` — `rule_key` · `estimate_category` · `name` · `enabled` · `aggregation` · `condition_json` · `inactive_behavior` · `conflict_policy` · `priority` · `legacy_ref`
- `quantity_sync_source` — `rule_id` · `source_product_id` · `factor`
- `quantity_sync_target` — `rule_id` · `target_product_id` · `multiplier` · `rounding_mode` · `display_order`

조건 JSON 은 `optionEquals` · `optionIn` · `all` · `any` · `not` 만 허용하고, **품명 정규식 · 함수명 · 임의 expression 문자열은 저장하지 않습니다**(`survey.md:537-541`).

**신규 마이그레이션 = `V24__`** (product-service 현재 최신 `V23`).

⚠️ **적용된 마이그레이션은 주석조차 수정 금지**입니다(checksum). V1~V23 무접촉, 신규 V24 만.

---

## 4. 불변식 (구현 수단은 지정하지 않는다)

- **I-1** — `survey.md` §6.5(`:584-591`)의 **저장 검증 8종이 전부 성립**한다. 각각을 위반하는 입력이 **저장에 실패**한다.
- **I-2** — 검증이 **DTO·서비스 층에서만 막히고 DB 는 통과하는 구조가 아니다.** 🚨 이 저장소는 정확히 그 결함을 겪었습니다(#887 MED-1 — `ALL`+refs 금지 조합이 두 층에서만 차단되고 엔티티·DB 는 통과. throwaway PostgreSQL probe 로 실측됨). **격리 PostgreSQL 에 직접 SQL 을 던져 확인**하세요.
- **I-3** — UUID 가 **사용자에게 노출되지 않는다.** DB 는 Product 내부 FK 를 쓰되 API·표시는 `modelCode + 품목명` 입니다.
- **I-4** — **런타임 동작 변경 0.** 기존 견적·주문 금액 계산 경로가 이 스키마를 읽지 않는다. 슬1 의 golden 테스트가 **그대로 통과**한다.
- **I-5** — 시드 데이터는 **실 카탈로그에서 도출한 것만** 존재한다. (§5 참조)
- **I-6** — H-07 · C-09 에 대한 설정 레코드가 **존재하지 않고**, 그것이 의도임을 **테스트가 잠근다**(누가 나중에 무심코 추가하면 RED).

---

## 5. 🚨 시드 — 실 카탈로그가 없으면 만들지 마세요

`survey.md:741-749` 의 단계 1 절차 1번은 *"현 카탈로그 snapshot 에 기존 정규식/모델 맵을 1회 실행한다"* 입니다. 즉 **시드는 실 카탈로그 snapshot 에 의존**합니다.

그리고 PR #948 이 이 제약을 명시적으로 이월했습니다:

> 🚩 **이월 제약**: 실 카탈로그 snapshot 을 확보하는 슬2/3 에서 golden 을 그 snapshot 으로 재생성해야 합니다. 그때 값이 또 바뀔 수 있고, 그것이 정상입니다.

### 요구 순서

1. **먼저 실 카탈로그 snapshot 을 이 환경에서 확보할 수 있는지 판정하고 보고하세요.** product-service 의 실 DB(Docker 로컬 스택)에서 읽어내는 것이 정공법입니다.
2. **확보되면** — 시드 생성기를 만들고 실행해 시드를 만듭니다. 생성기는 **재현 가능**해야 합니다(같은 snapshot 에서 같은 결과).
3. **확보되지 않으면** — 🚨 **합성하지 마세요.** 스키마와 검증만 내고, 시드는 *"실 snapshot 미확보로 미생성"* 이라고 **정직하게 보고**하세요. 범위 축소는 정상이고, 가짜 데이터가 사고입니다.

⚠️ 이 저장소는 **가짜 데이터·목업을 영구 배제**합니다. 실데이터·실서버·실측정만 인정됩니다.

⚠️ 공유 실 DB 에 write 하지 마세요. 읽기 전용이거나, 쓴다면 **run 고유 식별자를 가진 throwaway** 만 쓰고 정리 후 **행 수를 다시 세어** 보고하세요.

---

## 6. 🚨 RED-first

검증 8종 각각에 대해, **그 검증이 없으면 통과해버리는 입력**을 테스트로 먼저 쓰고 RED 원문을 남긴 뒤 고칩니다.

특히 **I-2**(DB 층까지 막히는가)는 **격리 PostgreSQL 컨테이너에 직접 SQL** 을 던져 확인하세요. 서비스 층 테스트만으로는 이 성질을 증명하지 못합니다.

⚠️ **마이그레이션 검증은 fresh PostgreSQL 에서** 하세요. Windows 로컬 skip 이 문제를 가립니다 — `DROP`/`CREATE` 후 `psql -f` + `ON_ERROR_STOP` 로 V1~V24 전체 적용이 성공함을 실행 원문으로 보이세요.

⚠️ `docker exec` 에 heredoc 으로 SQL 을 넣으면 **stdin 이 전달되지 않아 조용히 무동작**합니다(무출력 exit 0). **`docker cp` + `psql -f`** 를 쓰세요(`MSYS_NO_PATHCONV=1`). `-c "SQL"` 은 정상입니다.

---

## 7. 범위

### 포함
- `V24__` 마이그레이션 (테이블 3개)
- 엔티티 · 레포지토리 · 서비스 · DTO — **BaseEntity 7 audit + Soft Delete + 한국어 Javadoc + 도메인 메서드 chain(직접 set 금지)** 컨벤션 준수
- 저장 검증 8종 (I-1 · I-2)
- CRUD API (UUID 비노출)
- 시드 생성기 + 실행 (§5 조건부)
- 테스트: 검증 8종 RED-first · DB 층 probe · H-07/C-09 부재 잠금 · 슬1 golden 무회귀
- `ci.yml` 신규 테스트 hard gate 등재
- 문서 동기화 (dev-report · 관련 README)

### 제외 — 손대지 마세요
- **evaluator** (슬3) · **shadow diff** (슬3) · **문서 replay** (슬4) · **cutover** (슬5) · **칩 UI** (슬6)
- 🚫 **정본 2파일** — `clients/web/estimate-app/views/index.ejs` · `clients/web/order-app/index.html`
- 🚫 **`tools/legacy-gas/**`** — 감사 원본 read-only
- 🚫 기존 `BundleComponent` · `classification` · `estimate_configs` 스키마 변경 (참조만)
- 🚫 `clients/web/legacy-quantity-golden/**` 의 하네스 로직 변경 — 실 snapshot 으로 golden 을 **재생성**하는 것은 §5 범위이나, 경계 추출 로직 자체는 건드리지 마세요

---

## 8. 금지

- 🚫 **git 상태 변경 금지** — 파일만. commit·push·branch·stash 전부 PM 대행.
- 🚫 **새 이슈 등록 금지.**
- 🚫 **적용된 Flyway 마이그레이션 수정 금지** — 주석조차. 신규 `V24` 만.
- 🚫 **가짜 데이터·합성 시드 금지.** 확보 못 하면 정직하게 보고.
- 🚫 **UUID 사용자 노출 금지.**
- 🚫 🚨 **실행하지 않은 것을 실행한 것처럼 인용 금지.** 보고서의 "실행 원문" 은 리뷰어가 같은 명령으로 재현합니다. 임시 계측판 출력을 커밋본 출력인 것처럼 적으면 잡힙니다(직전 PR 실측).

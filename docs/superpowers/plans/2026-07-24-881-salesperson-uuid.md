# #881 판매조회 담당자명 raw UUID 노출 제거 — 기획서

- 작성: OPUS 4.8 기획자 · 2026-07-24
- 브랜치: `feat/881-sales-query-salesperson-code` (origin/main 3236a5e34)
- 슬라이스 성격: **UUID 비공개 규약 위반 결함 fix** (기능 재설계 아님)
- 관련 메모리: `feedback_uuid_no_user_visibility.md`, `feedback_mock_value_format_be_parity.md`, `feedback_recon_grep_false_negative.md`

---

## 1. 문제 — 라이브 증거 + UUID 노출 위치 전수

판매관리(판매조회) 화면 **담당자명** 컬럼에 직원 성명 대신 **raw UUID 원문**이 렌더된다.

라이브 실측(개발책임자 확인): `salesPersonName: "a0000000-0000-0000-0000-000000000003"` 가 담당자명 셀에 그대로 표시.

### 노출 표면 전수 (코드·실데이터 sweep 결과)

| # | 위치 | 파일:라인 | 노출 조건 | 판정 |
|---|---|---|---|---|
| 1 | 판매조회 기본 테이블 담당자명 셀 | `clients/desktop/src/renderer/routes/sales-query/SalesQueryPage.tsx:758` | 항상 | **누출** |
| 2 | 판매조회 Excel(DataGrid) 보기 담당자명 열 | `SalesQueryPage.tsx:308` | "Excel 보기" 토글 시 | **누출** |
| 3 | 구매조회 Excel(DataGrid) 보기 담당자명 열 | `clients/desktop/src/renderer/routes/purchase-query/PurchaseQueryPage.tsx:196` | "Excel 보기" 토글 시 | **누출** |
| — | 구매조회 기본 테이블 | `PurchaseQueryPage.tsx` (컬럼 없음) | — | 담당자명 컬럼 미표시 (안전) |
| — | Excel 다운로드(.xlsx) | `services/slip-service/.../SlipExcelExportService.java:45` | — | salesPersonName/requesterId **미포함** (QA BUG-2 fix, PR #146) → 안전 |

세 누출은 **단일 원천**(`SlipResponse.salesPersonName`)에서 나온다. FE 3곳은 `SlipQueryRow.salesPersonName` 을 그대로 렌더할 뿐 가공하지 않는다 → **BE 한 곳을 고치면 3곳 모두 해소**.

FE 전수 grep(`clients/**`) 결과 `salesPersonName` 을 화면 렌더하는 곳은 위 3곳뿐. 그 외 `requesterId` 렌더는 전부 다른 도메인이며 이미 **resolve 된 이름**을 쓴다(그룹웨어 결재 `requesterName`, 모바일 전표수정요청 `requesterFullName`, 회계 편집요청 `requesterName`) → 이 슬라이스 범위 밖·누출 아님.

---

## 2. 원천 분석

### 2.1 salesPersonName 이 UUID 인 코드 경로

```
FE querySlips() → GET /slips/query
  → SlipQueryController.listForQuery         (services/slip-service/.../web/SlipQueryController.java:97)
  → SlipQueryService.listForQuery            (.../service/SlipQueryService.java:90, .map(SlipResponse::from))
  → SlipResponse.from(slip)                  (.../web/dto/SlipResponse.java:168)
        salesPersonName = slip.getRequesterId()   ← 여기서 UUID(String) 를 그대로 대입
```

`SlipResponse.java:84-88` Javadoc 이 이미 명시한 **알려진 기술부채**:

> `담당자명 — requesterId 임시값. 후속 슬라이스에서 user-service resolve 로 교체.`
> `UUID 비공개 가드: requesterId(UUID) 대신 사용자 표시명으로 변환 예정.`

즉 SP-08-6-1(2026-05-18)에서 담당자명 컬럼을 도입할 때 **의도적으로 placeholder(requesterId 원문)** 로 채우고 "후속에 resolve" 로 미뤘다. **#881 이 그 후속 슬라이스**다. 당시 dev-report(`docs/dev-reports/sp-08-6-1-sales-slip-list-detail.md`)의 "UUID 비공개 PASS" 는 `data-testid`/`slipNo` 만 검사했고 **salesPersonName 값 자체가 UUID 인 점을 놓쳤다** — 라이브QA 로만 잡히는 유형.

### 2.2 requester_id 원천 = 게이트웨이 X-User-Id (계정 UUID)

- `slips.requester_id` 컬럼: **VARCHAR(50)** (`information_schema` 실측). UUID 전용 타입이 아니다.
- 채워지는 값: `SlipService.create(req, requesterId, requesterName)` 의 `requesterId` = 게이트웨이 `X-User-Id` 헤더(`SlipController.java:109 CALLER_HEADER="X-User-Id"`).
- 게이트웨이는 JWT claim 의 **계정 UUID** 를 X-User-Id 로 주입한다(`JwtAuthenticationGatewayFilterFactory.java:231 h.add(HEADER_USER_ID, userId)`).
- `Employee.id == accountId == auth-service.accounts.id` (Employee.java:26 Javadoc). ⟹ **프로덕션에서 requester_id = 직원 UUID**.

### 2.3 담당자(직원) 마스터 위치 = user-service (별도 DB `user_db`)

- 엔티티: `services/user-service/.../domain/Employee.java` (테이블 `employees`).
- slip-service 는 직원 데이터를 **로컬 보유하지 않는다** → 성명 표시는 **cross-service 조회 필수**.
- 조회 인프라 **이미 존재**:
  - 단건: `UserInternalClient.resolveFullName(UUID)` (slip-service) → `GET /internal/users/{userId}` → fullName. 이미 상세 GET 의 `ownerFullName`/`dispatcherFullName`/`inspectorFullName` 을 이렇게 **라이브 resolve** 중.
  - **다건(핵심)**: `POST /internal/users/display-names` (`InternalUserController.java:225`) — `List<UUID> → Map<UUID,String>`(userId→fullName). 활성 직원만. groupware 결재목록이 이미 사용.
  - 인증: X-Internal-Token(InternalTokenFilter 가 ROLE_MASTER 부여). slip-service UserInternalClient 가 동일 토큰 사용 → display-names 호출 가능.

### 2.4 실 DB 조회 결과 — requester_id → 직원 매핑 (실증)

`slip_db.slips`(활성 2270건, distinct requester_id = **20종**)를 `user_db.employees` 에 대조:

**UUID형 4종** (`employees.id` 로 resolve):

| requester_id | 건수 | full_name | ecount_code |
|---|---|---|---|
| `a0000000-…-04` | 1429 | `[DEV-SEED] 개발영업` (dev_sales) | (blank) |
| `a0000000-…-03` | 712 | `[DEV-SEED] 개발매니저` (dev_manager) ← **개발책임자가 본 그 UUID** | (blank) |
| `a0000000-…-01` | 14 | `[DEV-SEED] 개발마스터` (dev_master) | (blank) |
| `00000000-…-000` | 15 | (employees 에 없음 — system sentinel) | — |

**loginId 문자열형 16종** (`employees.login_id` 로 resolve — 대표적):

| requester_id | full_name | 직급 | requester_id | full_name | 직급 |
|---|---|---|---|---|---|
| `kimmiseon` | 김미선 | 대표 | `obyeongseung` | 오병승 | 이사 |
| `janyeonggu` | 장영구 | 전무 | `kimgicheol` | 김기철 | 부장 |
| `simmigwang` | 심미광 | 과장 | `gyeonjinseong` | 견진성 | 차장 |
| `hongjisu`·`parkjisu`·`rahaeram`·`sinhyeonmin`·`heoyujin`·`jeongminguk`·`kimeunji`·`leejiyong`·`leeseongmi`·`parkeunwoo` | (각 실명) | 사원/주임 | | | |

**핵심 함의 — requester_id 가 이질적(heterogeneous)이다:**
- 프로덕션 semantics = **UUID** (게이트웨이 주입).
- 그런데 시드 2270건 중 다수가 **loginId 문자열**. 이는 `SlipSeeder` 가 `OrgChartSeeder 16명 loginId 풀`을 requesterId 로 순환 대입했기 때문(`SlipSeeder.java:149,156`) — **시드 아티팩트**(프로덕션과 불일치).
- 따라서 화면 담당자명은 지금 두 종류로 새고 있다: UUID형 행은 **UUID 원문**, loginId형 행은 **loginId 문자열**(`kimmiseon` 등). loginId 도 메모리상 "구분자로 쓰지 않는다" 대상이므로 **둘 다 위반**.
- `ecount_code` 는 이 DB 상 **전부 blank** (dev/seed 직원). (메모리의 "실 직원 91/91 ecount_code 100%" 는 이카운트 실 임포트 직원 대상 — 이 QA DB 의 시드 직원엔 미부여.)

---

## 3. 결정

### 3.1 무엇으로 표시할 것인가 = **담당자 성명(full_name)**

- 컬럼 헤더가 **"담당자명"** 이다 → 이름이 정답. `feedback_uuid_no_user_visibility.md` 의 "담당자 노출 코드 = 담당자코드(ecount_code) **또는 담당자명**" 중 **담당자명** 을 택한다.
- ecount_code 병기는 **이번 범위 밖**: (a) 헤더가 이름을 요구, (b) 이 DB 의 대상 직원 ecount_code 전부 blank 라 병기 불가, (c) 메모리의 "동명이인 시 코드 병기·모달 검색 시 코드 열" 규칙은 **검색 모달** 대상이며 본 건은 평면 목록 컬럼 → 기준 표시=이름. (동명이인 코드 병기는 후속 여지로만 기록.)
- **금지값**: raw UUID·loginId·requesterId 원문·이메일.

### 3.2 cross-service 조회 필요 = **YES (필수)**

직원 마스터가 user-service(`user_db`)에 있고 slip-service 로컬에 없다. `POST /internal/users/display-names` 재사용.

### 3.3 스냅샷 vs 실시간 = **실시간(라이브) 다건 resolve**

**결정: 라이브 다건 resolve** (조회 시점 user-service bulk 호출).

근거:
1. **기존 결정 계승** — SlipResponse.java Javadoc 이 명시한 방향이 "user-service resolve"(라이브). 발명이 아니라 예고된 후속의 이행.
2. **상세 화면 선례 일치** — 상세 GET 은 이미 `ownerFullName` 을 `UserInternalClient` 로 라이브 resolve(프로덕션 가동 중). 목록만 다른 방식(스냅샷) 채택 시 화면 간 불일치.
3. **전용 벌크 endpoint 이미 존재** — 신규 endpoint 없이 `display-names` 재사용. 신규 표면 최소(`UserInternalClient` 에 벌크 메서드 1개 + `SlipQueryService` enrich 배선).
4. **마이그레이션·백필 회피** — 스냅샷은 신규 컬럼 + 기존 2270행 백필 필요. 백필도 결국 requesterId→이름 resolve(동일 이질성 문제) + **서비스간 DB 경계**(cross-DB 조인 불가)를 넘어야 해 더 위험.
5. **최신성** — "담당자명" 은 현재 성명 표시가 자연스럽다(개명 시 스냅샷은 과거명 고정).

성능: **페이지당 벌크 1회 RPC**(N+1 아님). 페이지 50행의 distinct requesterId(실측 20종 이하)만 모아 1회 호출.

**반려한 대안(스냅샷)**: `slips` 에 `sales_person_name` 컬럼 추가 + 쓰기 시점 각인(partnerName 패턴) + 2270행 백필. user-service 다운 내성은 우수하나, 마이그+cross-DB 백필+이질 requesterId 백필 비용이 fix 범위를 초과 → 반려. (→ §개발책임자 판단 필요 지점에 재기재)

### 3.4 resolve 대상 actor = 상세와 **동일 인물**로 정합

- 상세: `resolveOwnerFullName(slip.getCreatedBy())` (SlipService.java:1339) — **createdBy** 기준.
- 목록: 현재 **requesterId** 기준.
- 정상적으로 requesterId == createdBy(같은 작성 actor)이나, **목록 담당자명 == 상세 담당자** 가 되도록 구현자가 두 소스의 동일성을 확인하고 하나로 정합할 것(불변식 §5). (권장: 상세와 같은 `createdBy` 사용해 화면 간 일치 보장. requesterId 유지 시 createdBy 와의 동치를 테스트로 고정.)

### 3.5 시드 정합(seeder) — requesterId 를 UUID 로 정규화

`SlipSeeder` 가 requesterId 에 loginId 문자열을 쓰는 것은 프로덕션(UUID)과 어긋난 **시드 결함**이다. 시더를 **직원 UUID** 를 쓰도록 정정한다(`feedback_mock_value_format_be_parity` — 시드 값 형식은 BE/프로덕션 parity). 그래야:
- 라이브QA 데이터가 UUID→이름으로 정상 resolve 되고,
- 프로덕션 경로와 동일해져 UUID형만 처리하면 되며 loginId 전용 벌크 endpoint 신설을 피한다.

⚠️ 기존 시드 행 반영은 **재시드(fresh slip_db)** 가 필요 — 라이브QA 환경 재시드 전제(§8 위험).

---

## 4. 범위

### 이 슬라이스가 고치는 것
1. **BE**: `/slips/query` 응답의 `salesPersonName` 을 requesterId 원문 → **직원 성명(벌크 resolve)** 으로 교체. (구현 위치는 구현자 재량 — SlipResponse.from 시그니처 확장 또는 SlipQueryService 후처리 enrich. **불변식만 규정, 수단 미지정**.)
2. **BE**: `UserInternalClient` 에 **다건 resolve**(`Collection<UUID> → Map<UUID,String>`, `display-names` 호출) 추가.
3. **BE**: `SlipSeeder` requesterId 를 **직원 UUID** 로 정규화(프로덕션 parity).
4. 위 1 하나로 FE 3표면(판매 기본표+판매 DataGrid+구매 DataGrid) 동시 해소 — **FE 코드 변경 불필요**(렌더는 이미 값 그대로 출력).

### 슬라이스 밖 (명시)
- **Excel 다운로드(.xlsx)**: 현재 salesPersonName 미포함(안전). 담당자명 열 추가는 별건.
- **상세 화면**: 이미 `ownerFullName` 라이브 resolve(정상). `SlipDetailResponse.requesterId`(raw)는 응답에 실려 있으나 화면 미렌더 → 이 슬라이스에서 건드리지 않음(정합만 §3.4로 확인).
- **`/internal/slips/sales-query`**(SlipSalesQueryController): accounting 세금계산서 배치용 internal, 응답에 salesPersonName **없음** → 무관.
- **모바일**: 담당자 성명 미렌더(본인 데이터 집계 or resolve 된 requesterFullName) → 무관.
- **동명이인 ecount_code 병기**: ecount_code 미부여 + 목록 컬럼 성격 → 이번 미포함(후속 여지).
- **estimate 도메인 requesterId**: 종합견적서 담당자는 별도 directory 체계 → 이 슬라이스(판매/구매조회) 표면 아님.

---

## 5. 불변식 (구현자에게 — 수단 아닌 불변식)

1. **화면 어디에도 UUID 미노출** — 판매/구매조회 담당자명(기본표·DataGrid) 에 raw UUID 가 나타나지 않는다.
2. **loginId·이메일·requesterId 원문도 미노출** — 담당자명은 오직 **사람이 식별 가능한 직원 성명(full_name)**.
3. **resolve 실패 시 중립 표시** — requesterId 가 UUID 미parse(예: system sentinel `00000000…`, loginId 잔존행)이거나 user-service miss/다운이면 **`—`(또는 빈값)** 을 보이고 **원문 id 를 절대 대체 표시하지 않는다**. (기존 `resolveUserFullName`(SlipService.java:1645)·`resolveActorName`(:769) 의 "UUID면 null 반환" 패턴과 동일 철학.)
4. **벌크 resolve (N+1 금지)** — 페이지 조회당 user-service 호출은 distinct requesterId 를 모은 **소수(상수) 회**. 행마다 단건 호출 금지.
5. **fail-open** — user-service 지연/장애가 판매·구매조회 자체를 500 으로 떨구지 않는다(담당자명만 공백, 목록은 정상 200). 기존 client 타임아웃(connect 2s/read 3s) 준수.
6. **응답 필드명 `salesPersonName` 유지** — 계약 테스트(sp-08-6-1 T1: 응답 문자열에 `salesPersonName` 포함 단언)와 FE `SlipQueryRow.salesPersonName` 를 깨지 않는다. **값만** 바뀐다.
7. **목록 담당자명 == 상세 담당자** — 같은 전표에서 목록의 담당자명과 상세의 담당자(ownerFullName)가 동일 인물·동일 표기(§3.4).
8. **시드 parity** — 시더가 채우는 requesterId 형식이 프로덕션(게이트웨이 UUID)과 일치(§3.5).

---

## 6. 기존 결정 교차검증 결과

| 대조 대상 | 내용 | 충돌 여부 |
|---|---|---|
| `feedback_uuid_no_user_visibility.md` | 담당자 노출 코드=ecount_code **또는 담당자명**; loginID/이메일/UUID 를 구분자로 쓰지 말 것 | **일치** — 담당자명 채택, loginId/UUID 배제 |
| SlipResponse.java Javadoc | "requesterId 임시 — 후속 user-service resolve 로 교체" | **일치** — 예고된 후속의 이행(발명 아님) |
| 상세 GET `ownerFullName` (SlipService:1339, UserInternalClient) | createdBy → user-service 라이브 resolve, 실패 시 null | **일치** — 목록도 동일 방식·동일 fallback |
| `feedback_mock_value_format_be_parity` | 시드 값 형식은 BE/프로덕션 parity | **일치** — 시더 requesterId UUID 정규화 |
| dev-report sp-08-6-1 | 담당자명 컬럼을 "기존 필드로 충족", UUID 검사 미흡 | 본 슬라이스가 그 미흡을 교정(충돌 아님) |

→ **기존 결정과 충돌 없음.** 예고된 방향(user-service resolve)을 그대로 이행.

---

## 7. U-gate (효용)

**1문장**: 판매관리(및 구매관리 Excel 보기) 담당자명 컬럼에서 각 전표의 담당자를 **실제 직원 성명**으로 식별해 담당자별 매출/매입을 눈으로 대조할 수 있다.

**구체 시나리오**: dev_master 로 로그인 → 판매관리 진입 → 담당자명 컬럼이 `a0000000-0000-0000-0000-000000000003` 대신 **`[DEV-SEED] 개발매니저`**(시더 정규화·재시드 후엔 실명, 예 `오병승`)로 표시 → 담당자별로 정렬·대조 가능. 화면·DevTools 응답 어디에도 UUID 없음.

---

## 8. 회귀 위험

| 위험 | 내용 | 완화 |
|---|---|---|
| **핫 경로에 서비스 의존 추가** | 목록 조회가 user-service 에 의존 → 장애 시 목록 자체 실패 우려 | **불변식 5 fail-open**: 담당자명만 공백, 목록 200 유지. 기존 타임아웃 준수 |
| **N+1 cross-service** | 행마다 단건 resolve 하면 페이지당 50 RPC | **불변식 4 벌크**: distinct id 1회 호출 |
| **loginId 잔존행** | 재시드 전 기존 loginId형 행은 UUID-parse 실패 → `—` | 불변식 3(중립표시). 재시드로 실명 복원(§3.5) |
| **재시드 필요** | 시더 정정만으로 기존 2270행 미변경(이미 시드된 DB) | 라이브QA 는 fresh `slip_db` 재시드 전제 — 실행 절차에 명시 |
| **정렬/검색** | salesPersonName 은 조회 후 enrich → BE 정렬·검색 키 아님(현재도 아님). DataGrid 텍스트 필터는 클라 필터라 resolve 된 이름으로 정상 동작 | 요구사항 없음(회귀 아님). 서버 정렬은 slipDate/seqNo 유지 |
| **계약 테스트** | 필드명 변경 시 sp-08-6-1 T1 RED | 불변식 6(필드명 유지, 값만 변경) |
| **display-names 활성 필터** | 퇴사(soft-delete) 직원은 map 누락 → `—` | 허용(중립표시). 필요 시 후속에서 퇴사자 표기 정책 별도 |

---

## 9. 개발책임자 판단 필요 지점 (미해결)

1. **스냅샷 vs 라이브 최종 승인** — 본 기획은 **라이브 다건 resolve** 를 권고(근거 §3.3). 만약 "담당자명은 전표 작성 시점 담당자로 고정(개명·이관에도 불변)" 이 정책이면 스냅샷(신규 컬럼+백필)로 전환 필요. → 기본은 라이브로 진행하되 이견 시 회신.
2. **시더 재시드 승인** — requesterId UUID 정규화는 **fresh slip_db 재시드**가 있어야 기존 행에 반영. 라이브QA 를 재시드 DB 로 수행해도 되는지(공유 데이터 write 아님, throwaway 조회 — `feedback_qa_live_shared_data_readonly` 위반 아님) 확인.
3. **동명이인 코드 병기 후속화** — ecount_code 미부여로 이번엔 이름만 표시. 실 직원 ecount_code 부여 환경에서 동명이인 병기 규칙 적용은 후속으로 분리하는 것에 동의하는지.

(1·2 는 라이브로 기본 진행 가능하다고 판단 — 반대 없으면 그대로 구현 지시.)

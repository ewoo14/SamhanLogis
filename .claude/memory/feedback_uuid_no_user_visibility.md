---
name: UUID 사용자 비공개 원칙 — 모든 클라이언트 화면
description: 모든 UUID는 서버 내부 식별자로만 사용. 사용자에게 노출되는 모든 화면/컴포넌트/입력 필드/표시 영역에서 UUID 표시 금지. 비즈니스 식별자 (모델명/슬립번호/창고 코드/거래처명) 만 노출
type: feedback
originSessionId: 78cac99d-5dee-47ca-8254-3834a088f393
---
**규칙**: SamhanLogis 의 모든 클라이언트 (Electron 데스크톱, React 웹, RN 모바일, 향후 모든 UI) 에서 **UUID 는 사용자에게 절대 노출되지 않는다**. UUID 는 서버 내부 식별자 + API 호출 wire format 한정.

**Why**: 개발책임자 명시 (2026-05-04, Slip output format slice 의사결정 직전) — "모든 UUID는 서버에서만 사용하는 고유번호이며, 이는 사용자에게 표시하지 않는 것이 원칙". 이카운트 / 일반 ERP 사용자 경험 표준이며, UUID 는 사용자가 인지·기억·복사·공유하기 부적합한 식별자.

---

## 🚨 2026-07-22 개발책임자 정정 — **엔티티별 "사용자 노출 코드" 를 지정한다**

> *"UUID는 실제 데이터베이스의 PK이고 노출이 안되는게 맞아. 다만 사용자에게 노출되는 데이터는 **담당자코드, 거래처코드, 품목코드** 같은 걸로 해야지... 이걸로 구분할 수 있게 말야."*
> *"**전표 또는 문서번호(YYYY/MM/DD-{번호})** 도 같은 맥락이야."*

**⟹ 원칙이 "UUID 를 숨긴다"(소극) 에서 "엔티티마다 사용자가 쓰는 코드를 정한다"(적극) 로 확장된다.** 사용자가 **구분·검색·대조**에 쓰는 식별자는 그 코드다. UUID 는 DB PK 로만 존재한다.

| 엔티티 | 사용자 노출 코드 | 실측 (2026-07-22 · 실 DB) |
|---|---|---|
| **담당자(직원)** | **담당자코드** `employees.ecount_code` | VARCHAR(50) · **활성 행 부분 UNIQUE**(`ux_employees_ecount_code_active`) · 실 직원 **91/91 = 100% 부여**(미부여 8건은 전부 `[DEV-SEED]` 계정) · 형식 = 5자리 zero-pad(`00001` 김미선 · `00002` 장영구) |
| **거래처** | **거래처코드** `partner_code` | `V1__init_partner.sql:14` 에 *"partner_code = 사용자 노출 식별자 (UUID 비공개 가드)"* 로 **이미 명문화** · 활성 행 unique |
| **품목** | **품목코드** `product_code` | `Product.productCode` VARCHAR(100) |
| **전표·주문·문서** | **번호** `YYYY/MM/DD-N` | [[feedback_slip_order_number_format]] |

### 동명이인·동명 항목 구분 = **코드로 한다**
실측 증거: 동명이인 `채권추심` 2건이 담당자코드 `00000` / `999-99-99999` 로 **실제로 구분된다**.

**표시 규칙**(2026-07-22 개발책임자 선택): 평소에는 **이름(+부서)만** 간결하게 두고, **같은 이름이 2건 이상 감지될 때만 코드를 병기**한다. 모달 검색(결과 2건 이상)에서는 **코드를 열로 항상 표시**한다.

🚫 **로그인ID·이메일·UUID 를 구분자로 쓰지 않는다** — 엔티티마다 **지정된 코드가 이미 있다**.
🚨 **신규 마스터 엔티티 설계 시 "사용자 노출 코드" 를 함께 설계**한다. 코드 없이 UUID 만 있는 엔티티는 화면에서 **구분이 원천적으로 불가능**해진다(#866 수신자 검색이 이 함정에 빠져 응답 DTO 가 `userId(UUID)·이름·부서` 만 내보내 같은 부서 동명이인을 구분 못 했다).

---

**비즈니스 식별자 (사용자에게 노출 OK)**:
- 슬립번호: `2026/06/02 - 4` (Plan §3.1 표시 형식)
- 창고 코드: `HQ-001`, `VH-001`, `CS-001`, `VR-001`
- 모델명: `AJ040RXH4BC1`
- 품목명: `RX다배관`
- 거래처명: `주식회사 윌리-정현수`
- 사번/직원명: `오병승`
- 날짜: `2026/06/02`

**금지 사례**:
- ❌ 라인 입력 필드의 placeholder "UUID" + 사용자가 직접 UUID 타이핑 (PR #18 SlipFormPage 의 잘못된 패턴)
- ❌ 목록 테이블의 "ID" 컬럼에 UUID 첫 8자 표시
- ❌ Tooltip / hover 에 UUID 노출 (디버깅 목적이라도 일반 사용자에게는 X)
- ❌ URL path 의 `/sales/550e8400-e29b-41d4-a716-446655440000` 같은 노출 (단, URL 은 비즈니스 식별자가 unique 하지 않을 때 어쩔 수 없이 UUID 사용 — 이 경우 사용자에게 보이는 화면 라벨에는 절대 노출 금지)

**허용 사례**:
- ✅ 컴포넌트 props 의 `id: UUID` (호출자가 사용, 내부 wire)
- ✅ axios 요청 body 안 UUID
- ✅ React key prop (`<tr key={slip.id}>`)
- ✅ 라우트 path param 자체 (`/sales/:id`) — UUID 는 URL 에 들어가도 화면 표시 영역엔 노출 안 됨
- ✅ DOM 의 hidden input value
- ✅ 개발자 콘솔 / DevTools / 로그 (사용자 화면 영역 외)
- ⚠️ admin/debug 전용 화면 (예: `/admin/system/objects`) — 마스터/개발자 권한만 접근, 일반 사용자 화면과 분리

**적용 절차** (FE agent prompt 의무 명시):
1. 컴포넌트 props 검토 — `uuid` 같은 노출용 prop 제거
2. 화면 데이터 매핑 시 UUID 필드는 internal use 만, 라벨/표시 영역 미사용
3. PriceField / DataTable 등 디자인 시스템 컴포넌트 사용 시 column 정의에 UUID 포함 금지
4. 모델명 자동완성 등에서 사용자가 입력하는 식별자는 비즈니스 식별자 (모델명) 만
5. 인쇄 양식 (거래명세서 / 출고전표) 도 UUID 노출 금지 — 표시는 슬립번호 (`2026/06/02 - 4`) 만

**과거 위반 사례**:
- **PR #18** (2026-05-04, Electron skeleton): SlipFormPage 라인 입력의 "제품 ID UUID" 필드 (사용자가 productId 를 36자 UUID 로 직접 타이핑) → 개발책임자 지적. 다음 슬라이스 (이카운트 양식 반영) 에서 모델명 입력 + onBlur lookup 으로 교체 + SlipNumberDisplay 의 optional UUID hover tooltip 도 prop 자체 제거
- 본 메모리는 그 사고의 결과. 신규 컴포넌트 작성 시 본 가드 사전 검토 의무

---

## 🚨🚨 2026-08-17 실측 — **"응답에 UUID 가 있으면 위반" 은 오독이다**

PR #1266 이 "UUID 가 API 응답에 노출되는 것" 을 결함으로 보고 응답 DTO 에서 UUID 필드 48개를 제거했다. **CI 8개 잡이 깨졌다.**

```text
DpsSaveHistoryIT.java:169   java.lang.IllegalArgumentException
  ⟹ 목록 응답에서 id 를 읽어 상세 경로를 만들던 코드가 null 을 받았다
  ⟹ 화면도 같은 방식이면 "상세 열기" 가 실 사용자 경로에서 깨진다

깨진 계열   *CollabIT 8건 (코멘트 add/list/resolve/삭제)
            *SaveHistoryIT (목록 → 상세 복원)
            GroupwareAdminControllerIT (일정 참석자)
```

### 🔑 축은 **표시(display)** 이고 **전송(wire)** 이 아니다

```text
금지    화면 라벨 · 목록 "ID" 컬럼 · tooltip · placeholder · 인쇄 양식
허용    요청 body · 라우트 path param · React key · hidden input · 컴포넌트 props
        ⟹ 본문 원문: "UUID 는 서버 내부 식별자 + API 호출 wire format 한정"
```

목록에서 받은 id 로 상세·수정·삭제를 호출하는 것은 **정상 설계다.** 그것을 지우면 기능이 사라진다.

### 판정 절차

```text
응답에서 UUID 를 지우기 전에 물어라
  ① 클라이언트가 이 id 로 무엇을 호출하는가   grep clients/desktop · web · mobile*
  ② 호출처가 있으면 → wire 다. 지우지 마라
  ③ 호출처가 없으면 → 표시용이다. 지워라
  ④ 그 id 없이 같은 일을 할 수 있는 경로가 있는가 (코드·번호 등)
       있으면 그 경로로 갈아타고 지워도 된다

🚫 "테스트가 원한다" 는 되살릴 근거가 아니다 — **호출처 파일:줄**이 근거다
🚫 반대로 테스트를 새 동작에 맞춰 고치는 것도 금지 — 회귀가 숨는다
```

**관련 메모리**:
- `feedback_function_documentation.md` — JSDoc 에 "사용자에게 보이지 않는 internal 식별자" 명시 권장
- `feedback_pr_qa_screenshots.md` — QA 스크린샷에서 UUID 노출 발견 시 본 가드 위반 → hotfix 의무
- `feedback_test_adapted_to_new_behavior_hides_regression.md` — 응답을 지우고 테스트를 맞추면 회귀가 숨는다
- `feedback_join_key_column_empty_uuid_populated.md` — 코드 컬럼이 비어 있으면 UUID 를 대체할 수 없다

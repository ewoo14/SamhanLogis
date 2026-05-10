# P0-6 거래처 4탭 등록/조회 UI 디자인 가이드

> branch: `feature/p0-6-partner-4tab-ui`
> 작성일: 2026-05-11
> 담당: Designer (SamhanLogis 디자인 시스템 기준)

---

## 0. 원칙

- **raw hex 금지**: 모든 색상은 design-system CSS 변수 토큰만 사용 (PR #139 회고).
- **UUID 비공개**: 화면 어디에도 UUID 노출 금지. 식별자는 `partnerCode` / `businessName` / `businessNumber` 등 비즈니스 키만 사용.
- **Role 풀네임**: `MASTER` / `MANAGER` / `SALES` 등 — 약어(M/M) 금지.
- **Pretendard 9 weight 자동 상속**: `body { font-family: var(--font-family-sans) }` 선언으로 전체 화면 자동 적용.
- **한국어 타이포**: 본문 14px Regular / 헤더 18px SemiBold / 서브헤더 16px Medium.
- **이카운트 참조**: 거래처/품목 화면 필드 구성은 이카운트 ERP UX 표준 준용.

---

## 1. 4탭 구성 개요

| 탭 인덱스 | 탭 레이블 | data-testid | 주요 필드 |
|---|---|---|---|
| 1 | 기본정보 | `partner-tab-1` | code / businessName / businessNumber / address / type |
| 2 | 단가/할인 정책 | `partner-tab-2` | basicDiscount% / paymentTerm 일수 / creditLimit |
| 3 | 배송지 | `partner-tab-3` | 다중 행 (alias / address / phone / isDefault) |
| 4 | 담당자 | `partner-tab-4` | 다중 행 (name / position / phone / email / isPrimary) |

---

## 2. 전체 레이아웃

### 2.1 Create (신규 등록) 레이아웃

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [h2] 거래처 등록                                               [취소] [저장] │
├─────────────────────────────────────────────────────────────────────────────┤
│ [ 기본정보 ] [ 단가/할인 정책 ] [ 배송지 ] [ 담당자 ]                       │
│ ─────────────────────────────────────────────────────────────────────────── │
│                                                                             │
│  (선택된 탭 내용 렌더링)                                                     │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                       [이전 탭] [다음 탭] / [저장 완료]     │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Create 탭 이동 방식**: Wizard 순차 + 자유 이동 혼용.
- 탭 클릭으로 자유 이동 가능 (순서 강제 없음).
- 하단 `이전 탭` / `다음 탭` 버튼으로 순차 이동도 지원.
- 마지막 탭(담당자)에서 `다음 탭` 버튼은 `저장 완료` 버튼으로 대체.
- 아직 방문하지 않은 탭 클릭 시 이동 허용 (강제 validation 미적용). 저장 시 전체 탭 필수 필드 일괄 검증.

### 2.2 Edit (수정) 레이아웃

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [h2] 거래처 수정 — (주)ABC냉동              [취소] [저장] ← 변경 사항 있을 때 활성 │
├─────────────────────────────────────────────────────────────────────────────┤
│ [ 기본정보* ] [ 단가/할인 정책 ] [ 배송지* ] [ 담당자 ]                       │
│   (* = 변경된 탭에 dot indicator)                                           │
│ ─────────────────────────────────────────────────────────────────────────── │
│  (선택된 탭 내용 렌더링 — 필드 편집 가능)                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Edit 탭 이동**: 자유 이동. 탭 이동 시 미저장 변경 사항 경고 없음 — 탭 간 변경은 메모리에 누적하여 `저장` 버튼 1회 클릭으로 전체 반영.
미저장 상태에서 `취소` 클릭 시:

```
┌────────────────────────────────────┐
│  저장하지 않은 변경 사항이 있습니다.│
│  취소하시겠습니까?                  │
│              [계속 수정] [취소하기] │
└────────────────────────────────────┘
```

- 경고 다이얼로그 `role="alertdialog"`, 버튼: `계속 수정` (ghost) / `취소하기` (danger).

### 2.3 Detail Dialog (조회/상세)

```
┌──────────────────────────────────────────────────────┐
│ 거래처 상세 — (주)ABC냉동                           ✕ │
├──────────────────────────────────────────────────────┤
│ [ 기본정보 ] [ 단가/할인 정책 ] [ 배송지 ] [ 담당자 ] │
│ ──────────────────────────────────────────────────── │
│  (read-only 렌더링 — 모든 필드 비활성)                │
├──────────────────────────────────────────────────────┤
│                                             [편집]    │
└──────────────────────────────────────────────────────┘
```

- `data-testid="partner-detail-dialog"` — Dialog 래퍼 `<div>` (또는 `<dialog>`).
- 너비: `min(860px, 90vw)`.
- `편집` 버튼: `variant="primary"` — 클릭 시 Detail Dialog 닫고 Edit 화면 라우트 이동.

---

## 3. 탭 헤더 컴포넌트 스타일

```
┌──────────────────────────────────────────────────────┐
│  [ 기본정보 ] [ 단가/할인 정책 ] [ 배송지 ] [ 담당자 ] │
│  ────────────                                         │
│   (활성 탭: 하단 선 2px primary)                      │
└──────────────────────────────────────────────────────┘
```

| 속성 | 토큰 | 값 |
|---|---|---|
| 탭 컨테이너 배경 | `var(--surface-card)` | 흰색 계열 |
| 탭 컨테이너 하단 선 | `1px solid var(--line-default)` | |
| 탭 레이블 폰트 | `var(--font-size-sm)` / `var(--font-weight-medium)` | 14px / 500 |
| 활성 탭 레이블 색상 | `var(--color-brand-600)` | Primary 컬러 |
| 활성 탭 하단 indicator | `2px solid var(--color-brand-600)` | |
| 비활성 탭 레이블 색상 | `var(--ink-secondary)` | |
| 탭 항목 padding | `var(--space-3) var(--space-4)` | 12px 16px |
| 탭 항목 gap | `var(--space-1)` | 4px |
| 변경된 탭 dot indicator | `6px circle var(--color-warning)` | 우상단 absolute |

```tsx
// 탭 변경 dot indicator — Edit 모드 전용
// 탭 레이블 우상단 absolute 6px 원형 dot
{isDirtyTab && (
  <span
    aria-hidden="true"
    style={{
      position: 'absolute',
      top: 4,
      right: 4,
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: 'var(--color-warning)',
    }}
  />
)}
```

---

## 4. 탭 1 — 기본정보

`data-testid="partner-tab-1"` (탭 패널 래퍼 div)

### 4.1 ASCII Mockup

```
┌─────────────────────────────────────────────────────┐
│ 기본정보                                             │
├─────────────────────────────────────────────────────┤
│                                                     │
│  거래처 코드 *     [____________________________]   │
│                   영문 대문자 + 숫자, 최대 20자      │
│                                                     │
│  상호(법인명) *    [____________________________]   │
│                                                     │
│  사업자번호 *      [___-__-_____________________]   │
│                   XXX-XX-XXXXX 형식                  │
│                                                     │
│  거래처 유형 *     [  전체 ▼  ]                     │
│                   CUSTOMER / VENDOR / BOTH          │
│                                                     │
│  주소             [____________________________]   │
│                   (우편번호 조회 연동 — 선택)        │
│                                                     │
│  상태             [  거래중 ▼  ]                    │
│                   ACTIVE / SUSPENDED / TERMINATED   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 4.2 필드 정의

| 필드 | 필수 | HTML | 검증 | 비고 |
|---|---|---|---|---|
| `code` (거래처 코드) | Y | `<input type="text">` | 영문 대문자+숫자, 1-20자. 중복 시 BE 409 표시 | Create 입력 / Edit 읽기 전용 (회색) |
| `businessName` (상호) | Y | `<input type="text">` | 1-100자 | |
| `businessNumber` (사업자번호) | Y | `<input type="text">` | 10자리 숫자 (XXX-XX-XXXXX 포맷 자동) | |
| `type` (유형) | Y | `<select>` | CUSTOMER / VENDOR / BOTH | |
| `address` (주소) | N | `<input type="text">` | | |
| `status` (상태) | N (기본 ACTIVE) | `<select>` | ACTIVE / SUSPENDED / TERMINATED | Edit 전용 표시 (Create 시 고정 ACTIVE) |

### 4.3 유형(type) 표시 라벨

```tsx
export const PARTNER_TYPE_LABEL: Record<PartnerType, string> = {
  CUSTOMER:  '매출처 (고객)',
  VENDOR:    '매입처 (공급사)',
  BOTH:      '매출+매입처',
}
```

### 4.4 코드 읽기 전용 스타일 (Edit 모드)

```
background: var(--surface-subtle)
color:      var(--ink-tertiary)
cursor:     not-allowed
```

---

## 5. 탭 2 — 단가/할인 정책

`data-testid="partner-tab-2"` (탭 패널 래퍼 div)

### 5.1 ASCII Mockup

```
┌─────────────────────────────────────────────────────┐
│ 단가/할인 정책                                        │
├─────────────────────────────────────────────────────┤
│                                                     │
│  기본 할인율       [______] %                        │
│                   0 ~ 100 소수점 2자리까지            │
│                                                     │
│  결제 조건 (일수)  [______] 일                       │
│                   0 이상 정수. 예: 30 → 30일 결제     │
│                                                     │
│  신용 한도         [__________________] 원           │
│                   0 이상 정수 (KRW). 천 단위 콤마 표시│
│                   비워두면 한도 없음 (무제한)          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 5.2 필드 정의

| 필드 | 필수 | HTML | 검증 | 비고 |
|---|---|---|---|---|
| `basicDiscount` (기본 할인율) | N | `<input type="number" step="0.01">` | 0 ≤ value ≤ 100, 소수점 2자리 | 우측 `%` 단위 라벨 |
| `paymentTerm` (결제 조건 일수) | N | `<input type="number" step="1">` | 0 이상 정수 | 우측 `일` 단위 라벨 |
| `creditLimit` (신용 한도) | N | `<input type="text" inputMode="numeric">` | 0 이상 정수 KRW, null = 무제한 | 입력 중 천 단위 콤마 실시간 포맷 |

### 5.3 신용 한도 포맷 규칙

- 입력 시: 숫자만 허용, 천 단위 콤마 실시간 삽입 (e.g., `30000000` → `30,000,000`).
- 저장 시: 콤마 제거 후 정수 문자열로 전송.
- 비어 있으면 `null` → BE 무제한 처리.
- 조회 시: `formatKrw(creditLimit)` 헬퍼 사용 (기존 `PartnersPage.tsx` 동일 함수 재사용).

### 5.4 경고 표시 — 신용 한도 초과

ListPage / Detail Dialog 에서 미수금(`outstandingBalance`) > 신용 한도(`creditLimit`) 인 경우:

```
신용 한도 초과  ⚠  outstandingBalance / creditLimit 수치 표시
badge background: var(--state-warning-bg)
badge text:       var(--state-warning)
```

---

## 6. 탭 3 — 배송지 (다중 행)

`data-testid="partner-tab-3"` (탭 패널 래퍼 div)

### 6.1 ASCII Mockup

```
┌─────────────────────────────────────────────────────────────────┐
│ 배송지                                 [+ 배송지 추가]          │
├──────────────────┬──────────────────┬───────────┬──────────────┤
│ 배송지 별칭       │ 주소             │ 전화번호   │ 기본 여부    │
├──────────────────┼──────────────────┼───────────┼──────────────┤
│ [본사____________] [서울특별시 서초구] [02-1234-5678] ◎ 기본   🗑 │
├──────────────────┼──────────────────┼───────────┼──────────────┤
│ [창고____________] [경기도 안양시____] [031-111-2222] ○       🗑 │
├──────────────────┼──────────────────┼───────────┼──────────────┤
│ (최소 1개 의무 — 기본 배송지 1개 반드시 선택)                    │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 배송지 행(ShippingAddressRow) 필드 정의

| 필드 | 필수 | HTML | 검증 | 비고 |
|---|---|---|---|---|
| `alias` (별칭) | Y | `<input type="text">` | 1-50자 | 예: "본사", "물류창고" |
| `address` (주소) | Y | `<input type="text">` | 1-200자 | |
| `phone` (전화번호) | N | `<input type="tel">` | 숫자/하이픈 | |
| `isDefault` (기본 여부) | 그룹 내 1개 Y | `<input type="radio">` | 그룹 단위 1개만 선택 | 라디오 버튼 그룹 |

### 6.3 다중 행 UX 규칙

- **추가**: `[+ 배송지 추가]` 버튼 클릭 → 새 빈 행 하단 삽입.
  - `data-testid="partner-shipping-address-add-button"`
- **삭제**: 각 행 우측 삭제 아이콘(🗑) 클릭 → 해당 행 제거.
  - **최소 1개 의무**: 행이 1개만 남은 경우 삭제 버튼 `disabled`.
  - 삭제되는 행이 `isDefault=true` 이면 남은 첫 번째 행을 자동으로 `isDefault=true` 로 승격.
  - 삭제 버튼 `aria-label="배송지 {alias} 삭제"`.
- **기본 배송지**: 라디오 버튼 단일 선택. 최초 행 생성 시 자동으로 `isDefault=true`.

### 6.4 삭제 버튼 스타일

```
variant: ghost
color:   var(--state-danger)
size:    sm
icon:    휴지통 SVG (design-system Icon 재사용)
disabled 시: opacity 0.4, cursor not-allowed
```

---

## 7. 탭 4 — 담당자 (다중 행)

`data-testid="partner-tab-4"` (탭 패널 래퍼 div)

### 7.1 ASCII Mockup

```
┌────────────────────────────────────────────────────────────────────────────┐
│ 담당자                                                    [+ 담당자 추가]  │
├──────────┬──────────┬─────────────┬────────────────────┬──────────────────┤
│ 이름      │ 직위     │ 전화번호     │ 이메일             │ 주 담당자        │
├──────────┼──────────┼─────────────┼────────────────────┼──────────────────┤
│ [홍길동__] │ [과장___] │ [010-1234-5678] │ [hong@abc.com_____] │ ◎ 주담당자  🗑 │
├──────────┼──────────┼─────────────┼────────────────────┼──────────────────┤
│ [이영희__] │ [대리___] │ [010-9876-5432] │ [lee@abc.com______] │ ○           🗑 │
├──────────┴──────────┴─────────────┴────────────────────┴──────────────────┤
│ (최소 1개 의무 — 주 담당자 1명 반드시 지정)                                │
└────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 담당자 행(ContactRow) 필드 정의

| 필드 | 필수 | HTML | 검증 | 비고 |
|---|---|---|---|---|
| `name` (이름) | Y | `<input type="text">` | 1-50자 | |
| `position` (직위) | N | `<input type="text">` | 최대 50자 | 예: "과장", "대리" |
| `phone` (전화번호) | N | `<input type="tel">` | 숫자/하이픈 | |
| `email` (이메일) | N | `<input type="email">` | 이메일 형식 | |
| `isPrimary` (주 담당자) | 그룹 내 1개 Y | `<input type="radio">` | 그룹 단위 1개만 선택 | 라디오 버튼 그룹 |

### 7.3 다중 행 UX 규칙

- **추가**: `[+ 담당자 추가]` 버튼 클릭 → 새 빈 행 하단 삽입.
  - `data-testid="partner-contact-add-button"`
- **삭제**: 각 행 우측 삭제 아이콘 클릭 → 해당 행 제거.
  - **최소 1개 의무**: 행이 1개만 남은 경우 삭제 버튼 `disabled`.
  - 삭제되는 행이 `isPrimary=true` 이면 남은 첫 번째 행 자동 승격.
  - 삭제 버튼 `aria-label="담당자 {name} 삭제"`.
- **주 담당자**: 라디오 버튼 단일 선택. 최초 행 생성 시 자동 `isPrimary=true`.

---

## 8. 폼 전체 구조 (data-testid)

```tsx
// Create
<form data-testid="partner-create-form">
  <TabGroup>
    <Tab data-testid="partner-tab-1">기본정보</Tab>
    <Tab data-testid="partner-tab-2">단가/할인 정책</Tab>
    <Tab data-testid="partner-tab-3">배송지</Tab>
    <Tab data-testid="partner-tab-4">담당자</Tab>
  </TabGroup>

  <TabPanel for="partner-tab-1">...</TabPanel>
  <TabPanel for="partner-tab-2">...</TabPanel>
  <TabPanel for="partner-tab-3">
    <button data-testid="partner-shipping-address-add-button">+ 배송지 추가</button>
    {addresses.map((a, i) => <ShippingAddressRow key={i} ... />)}
  </TabPanel>
  <TabPanel for="partner-tab-4">
    <button data-testid="partner-contact-add-button">+ 담당자 추가</button>
    {contacts.map((c, i) => <ContactRow key={i} ... />)}
  </TabPanel>
</form>

// Detail Dialog
<div data-testid="partner-detail-dialog" role="dialog" aria-modal="true">
  ...
</div>
```

### 8.1 data-testid 전체 목록

| data-testid | 컴포넌트 | 조건 |
|---|---|---|
| `partner-create-form` | Create 폼 래퍼 `<form>` | Create 화면 |
| `partner-tab-1` | 기본정보 탭 버튼 | 항상 |
| `partner-tab-2` | 단가/할인 정책 탭 버튼 | 항상 |
| `partner-tab-3` | 배송지 탭 버튼 | 항상 |
| `partner-tab-4` | 담당자 탭 버튼 | 항상 |
| `partner-shipping-address-add-button` | 배송지 추가 버튼 | 탭 3 패널 |
| `partner-contact-add-button` | 담당자 추가 버튼 | 탭 4 패널 |
| `partner-detail-dialog` | Detail Dialog 래퍼 | 상세 다이얼로그 열림 시 |

---

## 9. 컬러 토큰

모든 색상은 design-system CSS 변수 토큰만 사용. raw hex 사용 시 PR CI 실패.

### 9.1 탭 UI 토큰

| 용도 | CSS 토큰 |
|---|---|
| 활성 탭 색상 / indicator | `var(--color-brand-600)` |
| 비활성 탭 색상 | `var(--ink-secondary)` |
| 탭 컨테이너 경계선 | `var(--line-default)` |
| 변경 dot indicator | `var(--color-warning)` |

### 9.2 필드 토큰

| 용도 | CSS 토큰 |
|---|---|
| 입력 필드 border | `var(--line-default)` |
| 입력 필드 focus border | `var(--color-brand-600)` |
| 입력 필드 error border | `var(--state-danger)` |
| 읽기 전용 배경 | `var(--surface-subtle)` |
| 읽기 전용 텍스트 | `var(--ink-tertiary)` |
| 필드 레이블 | `var(--ink-primary)` / `var(--font-weight-medium)` |
| 힌트/설명 | `var(--ink-tertiary)` / `var(--font-size-xs)` |
| 에러 메시지 | `var(--state-danger)` / `var(--font-size-xs)` |

### 9.3 행 삭제 버튼 토큰

| 용도 | CSS 토큰 |
|---|---|
| 삭제 버튼 아이콘 색상 | `var(--state-danger)` |
| 삭제 버튼 hover 배경 | `var(--state-danger-bg)` |
| 삭제 버튼 disabled | `opacity: 0.4` |

### 9.4 상태 Badge 토큰

| 상태 | Badge variant | 표시 라벨 |
|---|---|---|
| `ACTIVE` | `success` | 거래중 |
| `SUSPENDED` | `warning` | 거래중지 |
| `TERMINATED` | `neutral` | 거래종료 |

### 9.5 거래처 유형 Badge 토큰

| 유형 | Badge variant | 표시 라벨 |
|---|---|---|
| `CUSTOMER` | `brand` | 매출처 |
| `VENDOR` | `neutral` | 매입처 |
| `BOTH` | `info` | 매출+매입처 |

---

## 10. 타이포그래피 스케일

| 용도 | 토큰 | 값 |
|---|---|---|
| 페이지 / 다이얼로그 헤더 | `var(--font-size-xl)` / `var(--font-weight-semibold)` | 20px / 600 |
| 탭 레이블 | `var(--font-size-sm)` / `var(--font-weight-medium)` | 14px / 500 |
| 섹션 헤더 (탭 내) | `var(--font-size-base)` / `var(--font-weight-semibold)` | 14px / 600 |
| 필드 레이블 | `var(--font-size-sm)` / `var(--font-weight-medium)` | 13px / 500 |
| 입력값 / 본문 | `var(--font-size-sm)` / `var(--font-weight-regular)` | 13px / 400 |
| 힌트/설명 | `var(--font-size-xs)` / `var(--font-weight-regular)` | 12px / 400 |
| 에러 메시지 | `var(--font-size-xs)` / `var(--font-weight-regular)` | 12px / 400 |
| 다중행 테이블 헤더 | `var(--font-size-xs)` / `var(--font-weight-semibold)` | 12px / 600 |
| 금액 (tabular-nums) | `var(--font-size-sm)` / `var(--font-weight-regular)` | 13px / 400 |

---

## 11. 스페이싱 규칙

| 요소 | 토큰 | 값 |
|---|---|---|
| 탭 항목 padding | `var(--space-3) var(--space-4)` | 12px 16px |
| 탭 패널 padding | `var(--space-5)` | 20px |
| 필드 row gap (세로) | `var(--space-4)` | 16px |
| 필드 label → input gap | `var(--space-2)` | 8px |
| 다중행 테이블 row height | 40px | 인라인 편집 행 |
| 다중행 열 간 gap | `var(--space-3)` | 12px |
| 버튼 그룹 gap | `var(--space-2)` | 8px |
| 다이얼로그 패딩 | `var(--space-6)` | 24px |

---

## 12. UX 흐름 정의

### 12.1 신규 등록(Create) 흐름

```
[거래처 등록] 버튼 클릭 (PartnersPage 우측 상단)
  → Create 화면 라우트 이동 (/admin/partners/new)
    → 탭 1 (기본정보) 기본 포커스
    → 각 탭 자유 이동 또는 [다음 탭] 순차 이동
    → [저장 완료] 또는 [저장] 버튼 클릭
      → 전체 4탭 필수 필드 일괄 검증
        → (성공) POST /admin/partners → 목록으로 돌아감 + 성공 토스트
        → (실패) 에러 발생 탭으로 자동 포커스 이동 + 에러 배너 표시
    → [취소] → 변경 사항 있으면 경고 다이얼로그 → 목록으로 돌아감
```

### 12.2 수정(Edit) 흐름

```
[수정] 버튼 클릭 (PartnersPage 행 액션 또는 Detail Dialog)
  → Edit 화면 라우트 이동 (/admin/partners/{code}/edit)
    → 4탭 기존 데이터 pre-fill
    → 탭 자유 이동 — 변경 사항 메모리 누적
    → [저장] 버튼 클릭 (변경 사항 있을 때만 활성)
      → 전체 검증
        → (성공) PUT /admin/partners/{code} → 목록으로 돌아감 + 성공 토스트
        → (실패) 에러 탭 포커스 + 에러 배너
    → [취소] → 변경 사항 있으면 경고 다이얼로그
```

### 12.3 상세 조회(Detail Dialog) 흐름

```
거래처 행 클릭 (PartnersPage DataTable)
  → Detail Dialog 열림 (read-only 4탭 표시)
    → 탭 자유 이동 (읽기 전용)
    → [편집] 버튼 → Dialog 닫힘 → Edit 화면 이동
    → [✕] 버튼 / 오버레이 클릭 → Dialog 닫힘
```

### 12.4 에러 처리

| 시나리오 | UI 처리 |
|---|---|
| 거래처 코드 중복 (BE 409) | 탭 1 포커스 이동 + `code` 필드 하단 에러 메시지 표시 |
| 사업자번호 형식 오류 | 클라이언트 즉시 검증 + 필드 에러 메시지 |
| 배송지 0개로 저장 시도 | 탭 3 포커스 + "배송지를 1개 이상 등록해야 합니다." |
| 담당자 0개로 저장 시도 | 탭 4 포커스 + "담당자를 1개 이상 등록해야 합니다." |
| 서버 오류 (5xx) | 탭 상단 에러 배너 (`role="alert"`) |

**에러 배너 스타일**:

```
background:  var(--state-danger-bg)
border:      1px solid var(--state-danger)
border-radius: var(--radius-md)
padding:     var(--space-3) var(--space-4)
font-size:   var(--font-size-sm)
color:       var(--state-danger)
role:        "alert"
```

---

## 13. 폼 레이아웃 상세 (탭 내부 그리드)

```css
/* 탭 패널 내부 — 2컬럼 그리드 기본 */
.partner-form-grid {
  display: grid;
  grid-template-columns: 160px 1fr;  /* label : input */
  gap: var(--space-4) var(--space-4);
  align-items: start;
  padding: var(--space-5);
}

/* 필드 레이블 */
.partner-form-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--ink-primary);
  padding-top: var(--space-2); /* input baseline 정렬 */
}

/* 필수 * 마크 */
.partner-form-label.required::after {
  content: ' *';
  color: var(--state-danger);
}

/* input 공통 */
.partner-form-input {
  height: 32px;
  padding: 0 var(--space-3);
  border: 1px solid var(--line-default);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--ink-primary);
  background: var(--surface-card);
  width: 100%;
  box-sizing: border-box;
}

.partner-form-input:focus {
  outline: none;
  border-color: var(--color-brand-600);
  box-shadow: 0 0 0 2px var(--color-brand-100);
}

.partner-form-input.error {
  border-color: var(--state-danger);
}

/* 단위 라벨 (%, 일, 원) */
.partner-form-unit {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.partner-form-unit-label {
  font-size: var(--font-size-sm);
  color: var(--ink-secondary);
  white-space: nowrap;
}
```

---

## 14. 다중행 테이블 스타일 (탭 3/4 공통)

```css
/* 다중행 인라인 편집 테이블 */
.partner-multi-row-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--line-default);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.partner-multi-row-table th {
  background: var(--color-neutral-50);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--ink-secondary);
  padding: var(--space-2) var(--space-3);
  text-align: left;
  border-bottom: 1px solid var(--line-default);
}

.partner-multi-row-table td {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--line-subtle);
  vertical-align: middle;
}

.partner-multi-row-table tr:last-child td {
  border-bottom: none;
}

/* 읽기 전용 (Detail Dialog) */
.partner-multi-row-table.readonly td {
  color: var(--ink-primary);
  font-size: var(--font-size-sm);
}
```

---

## 15. 하단 네비게이션 버튼 (Create 전용)

```
┌─────────────────────────────────────────────────────┐
│                         [이전 탭]   [다음 탭 / 저장] │
└─────────────────────────────────────────────────────┘
```

| 버튼 | variant | 조건 |
|---|---|---|
| 이전 탭 | `ghost` | 탭 1 에서는 `disabled` |
| 다음 탭 | `primary` | 탭 1/2/3 에서 표시 |
| 저장 완료 | `primary` | 탭 4 에서 `다음 탭` 대신 표시 |
| 취소 | `ghost` | 헤더 우측 — 항상 표시 |

---

## 16. Detail Dialog 읽기 전용 처리

- 모든 `<input>` / `<select>` / `<textarea>` 에 `readOnly` / `disabled` 적용.
- 읽기 전용 필드 배경: `var(--surface-subtle)`.
- 라디오 버튼(isDefault/isPrimary) 읽기 전용: 선택 표시만, 클릭 불가.
- 삭제 버튼 숨김 (`display: none`).
- `+ 배송지 추가` / `+ 담당자 추가` 버튼 숨김.
- `편집` 버튼: Dialog 하단 우측 `variant="primary"`.

---

## 17. 접근성 (A11y) 체크리스트

- [ ] 모든 `<input>` / `<select>` 에 연관 `<label>` 또는 `aria-label` 부여
- [ ] 탭 컴포넌트 `role="tablist"` + `role="tab"` + `role="tabpanel"` ARIA 패턴
- [ ] 활성 탭 `aria-selected="true"` + `tabIndex={0}`
- [ ] 비활성 탭 `aria-selected="false"` + `tabIndex={-1}`
- [ ] 에러 배너 `role="alert"` 부여
- [ ] Detail Dialog `role="dialog"` + `aria-modal="true"` + `aria-labelledby`
- [ ] 삭제 버튼 `aria-label="배송지 {alias} 삭제"` / `aria-label="담당자 {name} 삭제"` (구체적 식별자 포함)
- [ ] 경고 다이얼로그 `role="alertdialog"` + `aria-describedby`
- [ ] 필수 필드 `aria-required="true"`
- [ ] 에러 상태 필드 `aria-invalid="true"` + `aria-describedby` (에러 메시지 id 연결)
- [ ] 라디오 그룹 `<fieldset>` + `<legend>` 래핑

---

## 18. API 타입 확장 (Frontend agent 전달)

`adminApi.ts` 에 아래 타입 추가 필요:

```typescript
/** 거래처 유형 — BE PartnerType enum 과 1:1. */
export type PartnerType = 'CUSTOMER' | 'VENDOR' | 'BOTH'

/** 거래처 유형 → 한국어 라벨. */
export const PARTNER_TYPE_LABEL: Record<PartnerType, string> = {
  CUSTOMER: '매출처 (고객)',
  VENDOR:   '매입처 (공급사)',
  BOTH:     '매출+매입처',
}

/** 배송지 단일 항목 — BE ShippingAddressDto 와 1:1. */
export interface PartnerShippingAddress {
  /** 내부 식별자 (mutation 전용, 화면 미노출). */
  id?: string
  alias: string
  address: string
  phone: string | null
  isDefault: boolean
}

/** 담당자 단일 항목 — BE ContactPersonDto 와 1:1. */
export interface PartnerContact {
  /** 내부 식별자 (mutation 전용, 화면 미노출). */
  id?: string
  name: string
  position: string | null
  phone: string | null
  email: string | null
  isPrimary: boolean
}

/** 거래처 전체 상세 — BE PartnerDetailResponse 와 1:1. */
export interface PartnerDetail {
  /** 내부 UUID (mutation path key 전용). */
  id: string
  partnerCode: string
  businessName: string
  businessNumber: string
  address: string | null
  type: PartnerType
  status: PartnerStatus
  basicDiscount: string | null     // BigDecimal string (e.g., "5.00")
  paymentTerm: number | null       // 일수 정수
  creditLimit: string | number | null // KRW
  shippingAddresses: PartnerShippingAddress[]
  contacts: PartnerContact[]
}

/** 거래처 등록 요청 — BE CreatePartnerRequest 와 1:1. */
export interface CreatePartnerRequest {
  partnerCode: string
  businessName: string
  businessNumber: string
  address?: string
  type: PartnerType
  basicDiscount?: string
  paymentTerm?: number
  creditLimit?: string
  shippingAddresses: Omit<PartnerShippingAddress, 'id'>[]
  contacts: Omit<PartnerContact, 'id'>[]
}

/** 거래처 수정 요청 — BE UpdatePartnerRequest 와 1:1. */
export interface UpdatePartnerRequest {
  businessName?: string
  businessNumber?: string
  address?: string
  type?: PartnerType
  status?: PartnerStatus
  basicDiscount?: string
  paymentTerm?: number
  creditLimit?: string | null
  shippingAddresses?: Omit<PartnerShippingAddress, 'id'>[]
  contacts?: Omit<PartnerContact, 'id'>[]
}

/** 거래처 상세 조회. */
export async function getAdminPartner(partnerCode: string): Promise<PartnerDetail> { ... }

/** 거래처 신규 등록. */
export async function createAdminPartner(body: CreatePartnerRequest): Promise<PartnerDetail> { ... }

/** 거래처 정보 수정. */
export async function updateAdminPartner(partnerCode: string, body: UpdatePartnerRequest): Promise<PartnerDetail> { ... }
```

---

## 19. 기존 PartnersPage 보완 사항

| 항목 | 기존 | 보완 |
|---|---|---|
| 신규 등록 버튼 | 없음 | `+ 거래처 등록` 버튼 추가 → Create 화면 라우트 이동 |
| 행 클릭 | 없음 | Detail Dialog 열기 |
| 행 액션 | 없음 | [수정] 버튼 → Edit 화면 이동 |
| 거래처 유형 컬럼 | 없음 | `type` 컬럼 추가 (Badge) |
| raw hex 스타일 | `border: '1px solid #D1D5DB'` | `var(--line-default)` 토큰 교체 (PR #139 회고) |

---

## 20. Iteration 계획

메모리 가드 `feedback_print_design_iteration.md` 준수.

| 회차 | 내용 | 검토 방법 | 완료 기준 |
|---|---|---|---|
| 1차 (현재) | 본 spec 작성 | Designer 산출물 검토 | 4탭 구조 + 필드 정의 확정 |
| 2차 | FE 1차 mock 구현 후 Edge 캡처 | PR comment 이미지 첨부 | 탭 전환 + 다중행 추가/삭제 동작 확인 |
| 3차 | 에러 상태 / 경고 다이얼로그 / Detail Dialog read-only CSS 미세 조정 | Edge 캡처 + 사용자 검토 | 전체 UX 흐름 완성 |
| 4차 | BE API 연결 후 실 데이터 기반 검증 | QA 에이전트 시나리오 검증 | 신규 등록/수정/조회 E2E 통과 |
| 5차 | 이카운트 참조 캡처 vs 결과물 픽셀 비교 + 최종 승인 | QA 에이전트 전체 + 개발책임자 확인 | 최종 승인 |

---

## 21. 관련 파일 경로

| 파일 | 역할 |
|---|---|
| `clients/desktop/src/renderer/routes/admin/PartnersPage.tsx` | 기존 거래처 목록 (보완 대상) |
| `clients/desktop/src/renderer/api/adminApi.ts` | admin API 타입 + 함수 (확장 대상) |
| `clients/desktop/src/renderer/styles/global.css` | 전역 토큰 import |
| `docs/qa/partner-4tab/` | QA 스크린샷 저장 경로 (PR 본문 첨부용) |
| `docs/migration/ecount-reference/` | 이카운트 ERP 거래처/품목 화면 UX 참조 캡처 16종 |

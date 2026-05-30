# Designer Review — Phase 2.4 PartnerOrderVersionHistoryPanel (Cycle 1)

**리뷰어**: Claude Designer  
**날짜**: 2026-05-30  
**브랜치**: feat/phase-2-4-partner-order-restore (HEAD 9d3bcfd4)  
**대상**: `clients/desktop/src/renderer/components/audit/PartnerOrderVersionHistoryPanel.tsx`  
**비교 기준**: `clients/desktop/src/renderer/components/audit/PartnerVersionHistoryPanel.tsx` (Phase 2.3)

---

## 종합 판정

**Designer CONDITIONAL APPROVE** — P1 결함 1건, P2 결함 2건, Minor 2건 존재. P1 수정 후 재검토 권장.

---

## 점검 항목별 결과

### 1. Design-system 토큰 일관성

**[P2] 토스트 닫기 버튼 닫힘 문자 — `x` 리터럴 (하드코딩 ASCII), partner 2.3 은 `×` (HTML entity)**

- Phase 2.3 `PartnerVersionHistoryPanel.tsx` L204: 닫기 버튼 내용 = `×` (HTML named entity, 올바른 곱하기 기호)
- Phase 2.4 `PartnerOrderVersionHistoryPanel.tsx` L241: `x` (소문자 알파벳 x)
- 시각 차이: `×` 는 수학 곱하기 기호(U+00D7)로 더 균형 잡힌 형태, `x` 는 알파벳으로 디자인 일관성 깨짐
- 권장: `×` 로 변경 (partner 2.3 미러링)

**[Minor] 토스트 닫기 버튼 `marginLeft: 8` 하드코딩**

- Phase 2.4 L238: `marginLeft: 8` — partner 2.3 에는 이 속성 없음
- DS 토큰 `--space-2` (8px) 로 대체 권장 (`marginLeft: 'var(--space-2)'`)
- 기능상 문제는 없으나 토큰 일관성 위반

**나머지 색상값**: 모두 `var(--color-*)` CSS 변수 형태로 참조. 하드코딩 hex 는 폴백 값 (쉼표 뒤)으로만 사용됨 — 허용 가능한 패턴.  
**폰트 사이즈**: 13px, 12px, 14px, 16px 모두 raw px 리터럴이나, partner 2.3 에서도 동일 패턴이므로 코드베이스 내 일관성 유지.  
**spacing**: `gap: 8`, `gap: 12`, `padding: '8px 0'` 등 raw px — partner 2.3 동일 패턴.

**판정**: P2 (닫기 버튼 문자), Minor (marginLeft 토큰화)

---

### 2. 배지 의미색상

| revisionType | variant | 의미 | 적절성 |
|---|---|---|---|
| CREATE | neutral | 생성 (중립) | 적절 |
| EDIT | brand | 수정 (브랜드/정보성) | 적절 |
| STATUS | success | 상태변경 (완료류) | **검토 필요** |
| RESTORE | warning | 복원 (주의) | 적절 |
| DELETE | danger | 삭제 (위험) | 적절 |

**[P2] STATUS 유형에 `success` variant 의미 부적절 가능성**

- `STATUS` = 상태변경 이벤트. 내용에 따라 CANCELED/CONFIRMING 등 부정적 상태변경도 포함될 수 있음.
- `success`(초록) 은 "완료/승인"을 연상시켜 상태변경의 성격(긍정/부정 혼재)을 오해할 수 있음.
- partner 2.3 에는 STATUS 유형이 없으므로 비교 기준 없음 — 신규 도입.
- 이카운트 ERP 표준(docs/migration/ecount-reference 참조): 상태변경은 중립(neutral) 또는 brand 톤이 일반적.
- 권장: `brand` 또는 `neutral` variant 검토 (STATUS는 내용 중립적 이벤트로 취급)

**DS Badge variant 정합**: `neutral | brand | warning | success | danger | nts` 모두 정의된 값 사용 — 정합.

---

### 3. slipResyncRequired 경고

**[P1] `role="alert"` 누락 — 접근성 미충족**

- 토스트 영역: L193 `role="status"` — status 는 polite 알림, 긴급 경고에 부적합.
- `slipResyncRequired=true` 일 때 토스트 kind=`warning`으로 표시되지만, 이는 "연결된 출고전표 재발행 필요" 경고로 사업 임팩트가 큰 정보임.
- `role="status"` 는 AT(보조기술)가 현재 작업을 방해하지 않고 읽음; `role="alert"` 는 즉시 인터럽트.
- 설계서 §3 점검 기준: "warning+role=alert" 명시.
- 현재 구현: 토스트 컨테이너 전체에 `role="status"` 하나만 있고, slipResyncRequired 분기 시에도 동일 role 사용.
- 권장: `slipResyncRequired=true` 경고 시 해당 토스트 `div` 에 `role="alert"` 로 교체 (또는 kind 에 따라 분기: warning/danger = `role="alert"`, success = `role="status"`)

**한국어 문구 검토**:
- 성공+slipResync: `"rev N 시점으로 주문을 복원했습니다. 이 주문은 완료(출고전표 발행됨) 상태입니다. 연결된 출고전표 재발행이 필요할 수 있습니다."` — 내용은 충분하나 1개 문장이 너무 길어 가독성 저하.
- 권장 분리: "주문을 rev N 시점으로 복원했습니다." + 별도 줄 경고 아이콘 + "출고전표가 발행된 주문입니다. 연결 전표 재발행을 확인하세요."
- 단, 현재 구현이 1행 span 으로만 구성되어 있어 시각 강조가 없음. 경고 아이콘(⚠) 또는 Bold 처리 권장.

**판정**: P1 (role=alert 누락), Minor (문구 가독성)

---

### 4. 복원 비활성 UX

**[판정: 적절]**

- L176-189: `!restorable` 조건 시 상태별 안내 문구 노출.
  - `CANCELED`: "취소된 주문은 복원할 수 없습니다."
  - 그 외 (CONFIRMING): "확정 처리 중인 주문은 복원할 수 없습니다."
- 안내 문구 색상: `var(--color-neutral-600)` — partner 2.3 동일.
- 버튼: `disabled={!restorable || restoreMutation.isPending}` — 올바른 비활성 조건.
- isLatest 행은 버튼 자체 미렌더 — partner 2.3 과 동일 패턴.
- partner 2.3 에 비해 CONFIRMING/CANCELED 2가지 상태를 구분한 문구 제공이 개선점.

---

### 5. 복원 confirm 모달

**[판정: 적절 (Minor 1건)]**

- DS Modal 컴포넌트 사용 — `native confirm` 미사용, PR #320 교훈 준수.
- `size="sm"` — 단순 확인 모달에 적합.
- 버튼 위계: ghost "취소" + primary "복원" — primary CTA 위계 올바름.
- `aria-modal="true"`, `aria-labelledby`, focus trap, Escape 핸들러 — DS Modal 내장, 접근성 충족.
- `loading={restoreMutation.isPending}` — mutation 진행 중 버튼 disabled 처리 구현.
- `data-testid="partner-order-version-history-restore-modal"` — QA 가능.

**[Minor] 모달 본문에 위험 액션 시각 강조 미흡**

- 현재 본문: "rev N 시점으로 주문을 복원합니다. 현재 내용은 새 버전으로 대체됩니다." — 플레인 텍스트.
- partner 2.3 도 동일한 플레인 텍스트 패턴이나, 주문 복원은 거래처 복원보다 사업 임팩트가 클 수 있음.
- 이카운트 UX 표준: 되돌리기 어려운 액션에 경고 색상(warning/danger) 강조 텍스트 또는 아이콘 권장.
- 권장(선택): CONFIRMED 상태 복원 시 모달 본문에 "※ 출고전표 재발행이 필요할 수 있습니다" 사전 경고 추가.

---

### 6. changeSummary 표시 직관성

**[판정: 적절]**

- `formatChangeSummary`: "헤더 N · 라인 +a/-b/~c" — 직관적인 diff 표기.
- partner 2.3: "헤더 N · 자식 +a/-b/~c" (자식 = partner 자녀 도메인) → partner-order 에서 "라인" 으로 용어 변경 — 도메인에 맞는 적절한 용어 선택.
- 전부 0 일 때 "변경 없음" — CREATE 시 의미 명확.
- `~` 접두사 = 수정(modified) 의미 — 업계 diff 표준(+/- 와 함께 ~) 준수.

---

### 7. UUID 비공개

**[판정: 적절]**

- `orderId` prop: path/query key 전용, 화면 렌더링에 사용 없음 — 규칙 준수.
- `displayActor()`: UUID 패턴 정규식 필터링 + null 반환, actor === null 시 렌더 스킵.
- 화면 표시 식별자: `rev.orderNo` (주문번호, 비즈니스 식별자) 사용 — UUID 아님.
- actorName 이 null 일 때 "−" 대체 미표시 (렌더 완전 생략) — partner 2.3 과 동일. 생략 자체는 허용 가능 (빈 공간이 되지 않도록 레이아웃 gap 처리됨).
- Javadoc 에 UUID 비공개 가드 명시 (`[[uuid-no-user-visibility]]`) — 문서화 적절.

---

### 8. 빈 상태/로딩 UX

**[판정: 적절]**

- 로딩: Spinner(`size="sm"`) + "버전 이력을 불러오는 중..." 텍스트 — `role="status"` 포함, 접근성 충족. partner 2.3 동일 패턴.
- 에러: `role="alert"` + `color: var(--color-danger-600)` + `data-testid` — partner 2.3 동일, 올바름.
- 빈 상태: "아직 버전 이력이 없습니다." + `color: var(--color-neutral-500)` — partner 2.3 동일.
- 세 상태(로딩/에러/빈) 분기가 완결되어 있음.

---

## 결함 요약

| 번호 | 중요도 | 위치 | 결함 | 권장 |
|---|---|---|---|---|
| D-1 | P1 | L193, L196 | 토스트 `role="status"` — slipResyncRequired warning/error 시 `role="alert"` 미적용 | warning/danger kind 시 `role="alert"` 로 분기 |
| D-2 | P2 | L241 | 닫기 버튼 `x` (ASCII 알파벳) — partner 2.3 은 `×` (HTML entity) | `×` 로 통일 |
| D-3 | P2 | REVISION_TYPE_META L57 | STATUS badge `success` variant — 상태변경 의미(긍정/부정 혼재) 와 초록 색상 미스매치 | `brand` 또는 `neutral` 검토 |
| D-4 | Minor | L238 | `marginLeft: 8` 하드코딩 | `'var(--space-2)'` 토큰 사용 |
| D-5 | Minor | L147 | slipResyncRequired 경고 문구 1줄 과밀 + 시각 강조 없음 | 문구 분리 + 아이콘/bold 추가 권장 |

---

## 비교: partner 2.3 vs 2.4 구조 일치 확인

| 항목 | 2.3 PartnerVersionHistoryPanel | 2.4 PartnerOrderVersionHistoryPanel | 일치 |
|---|---|---|---|
| Card wrapper | 동일 | 동일 | ✓ |
| h4 "버전 이력" | 동일 | 동일 | ✓ |
| 비활성 안내 문구 패턴 | TERMINATED 단일 | CANCELED/CONFIRMING 분기 | ✓ (기능 확장) |
| 토스트 구조 | success/danger | success/danger/warning 추가 | ✓ (신규 kind 추가) |
| 로딩/에러/빈 상태 | 동일 | 동일 | ✓ |
| 리스트 행 구조 | 동일 | actor 변수 분리(개선) | ✓ |
| Badge 변형 수 | 3종 | 5종 (STATUS/DELETE 추가) | ✓ (확장) |
| Modal 구조 | 동일 | data-testid 추가 | ✓ (개선) |
| UUID 가드 | 동일 | 동일 | ✓ |

---

## 결론

P1 결함 1건 (D-1: role=alert 누락)이 접근성 표준 미충족으로 수정 필요. P2 2건(D-2, D-3)은 시각 일관성 및 의미색상 재검토. Minor 2건은 선택적 개선.

P1 수정 완료 후 Cycle 2 재검토 요청.

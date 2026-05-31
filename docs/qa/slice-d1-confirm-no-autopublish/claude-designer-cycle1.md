# Designer UX/업무흐름 리뷰 — 슬라이스 D1 (confirm 자동발행 폐지)
- 작성: claude-designer cycle1
- 날짜: 2026-05-31
- 브랜치: feat/slice-d1-confirm-no-autopublish (PR #329)
- 검토 범위: UX/업무흐름 일관성 (BE 동작 변경 + FE 표현 정합). 시각 디자인 변경 없음.

---

## 1. 점검 대상 파일

| 파일 | 역할 |
|---|---|
| `docs/superpowers/specs/2026-05-31-confirm-no-autopublish-design.md` | D1 설계 spec |
| `.claude/memory/project_partner_order_status_model.md` | 업무용어 매핑 원칙 |
| `clients/web/order-app/index.html` | 거래처 포털 order-app (레거시 webview) |
| `clients/desktop/src/renderer/api/sales.ts` | PARTNER_ORDER_STATUS_LABEL 매핑 |
| `clients/desktop/src/renderer/routes/SalesPartnerOrderListPage.tsx` | 본사 주문 리스트 |
| `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx` | 본사 주문 상세 |
| `services/partner-order-service/src/main/.../PartnerOrderConfirmService.java` | BE 구현(D1) |
| `services/partner-order-service/src/main/.../dto/ConfirmResponse.java` | 응답 DTO |

---

## 2. 분석 결과

### 2-A. 상태 용어 일관성

**현황**

`project_partner_order_status_model.md` 의 원래 업무용어 매핑:

| 업무 용어 | code | 비고 |
|---|---|---|
| 진행중 | DRAFT | 리스트 기본 필터 |
| 완료 | CONFIRMED | "confirm = 출고전표 전환 시점" 으로 정의 |
| 전환완료 | CONVERTED | Phase 2.6a 추가 |

이 매핑은 D1 이전 구조 기준이다. D1 이후 confirm 이 DRAFT 를 생성하고, 출고전표 전환 시 CONVERTED 가 된다. **CONFIRMED 상태는 신규 주문에서 발생하지 않는다.** 레거시 PENDING_RETRY 주문만 이론적으로 CONFIRMED 를 가질 수 있고, 운영 신규 주문에서는 DRAFT → CONVERTED 경로만 존재한다.

**결론: 상태 용어 매핑 자체의 업무 일관성은 정합하다.**

- 거래처가 "주문 확정/전송"하면 시스템이 DRAFT(진행중)를 생성하는 흐름은 한국 ERP 관행상 자연스럽다. 한국 ERP(이카운트 포함)에서 거래처 주문 → 본사 검토 → 전표 발행의 2단계 흐름이 표준이며, 거래처 전송 = "주문 접수(진행중)" 은 업무적으로 정확한 표현이다.
- 사용자(거래처)가 보는 피드백 메시지가 "전송이 완료되었습니다" 이므로, 이는 "전표 발행 완료"가 아니라 "주문서 전송 완료" 의미로 사용된다. 즉 전송 행위의 완료이지 전표 발행 완료가 아니다. 거래처 입장에서는 "내 주문서가 서버에 도달했다" 는 의미로 충분히 해석 가능하다.

**단, 하나의 잠재 혼란 지점 발견 (P2):** `PARTNER_ORDER_STATUS_LABEL` 에서 `CONFIRMED: '완료'` 로 매핑되어 있고, `project_partner_order_status_model.md` 도 `CONFIRMED = 완료` 라 정의한다. D1 이후 운영 경로에서 CONFIRMED 가 사실상 발생하지 않으므로, 이 레이블이 잘못 표시될 경우는 없다. 그러나 향후 레거시 CONFIRMED 주문이 리스트에 노출될 때 "완료" 배지가 표시되면, 사용자는 이를 "출고전표 발행 완료(CONVERTED)" 와 혼동할 수 있다. CONVERTED 는 이미 "전환완료" 로 별도 레이블을 가지므로, CONFIRMED 의 "완료" 레이블은 실제 오인 발생 시 P1 로 승격될 수 있다.

---

### 2-B. 거래처 피드백 메시지 — "전송이 완료되었습니다"

**현황**

`clients/web/order-app/index.html` line 6098:
```js
txt.textContent = '전송이 완료되었습니다';
```

버튼 레이블은 `btnFinalSend` = "주문서 발송" (line 1159).
성공 핸들러는 `res.ok` 여부만 확인하고, `res.slipNo` 또는 `res.status` 를 사용하지 않는다 (line 6096).

**분석**

D1 이전: confirm 성공 → slip 자동발행. 사용자가 "전송이 완료되었습니다" 를 보면 "전표까지 발행됐다" 고 기대할 여지가 있었다.

D1 이후: confirm 성공 → DRAFT 주문만 생성, slip 없음. "전송이 완료되었습니다" 는 "주문서가 본사에 전송됐다" 의미다. 이 메시지는 여전히 사실이다. 단, **FE 가 slip 발행 여부를 전혀 확인하지 않으므로**, 자동발행 여부와 무관하게 메시지가 동일하게 표시된다. 이는 D1 이후 오히려 정확도가 높아졌다고 볼 수 있다.

**그러나 과대약속 리스크(P1) 존재:**

메시지 "전송이 완료되었습니다" 자체는 중립적이지만, 거래처의 기대 모델이 "주문을 보내면 즉시 처리된다" 에서 "주문을 보내면 본사가 검토 후 출고한다" 로 바뀌어야 한다. 현재 메시지는 이 기대 변화를 유도하지 않는다. 특히:
- 거래처가 과거에 slip이 자동발행되는 경험을 했다면, 동일 메시지를 보고 여전히 slip 이 발행됐다고 오인할 수 있다.
- 메시지 아래에 "본사 담당자가 출고전표를 발행합니다" 또는 "진행중 상태로 접수되었습니다" 한 줄이 추가되면 기대 정렬에 충분하다.

spec §3.2 FE 확인 요건: "confirm 성공 처리가 slipNo 에 의존하지 않는지 확인. 의존 시 '주문이 접수되었습니다'(slip 비의존) 로 조정. 미의존이면 무변경." FE는 slipNo 비의존이므로 spec 상 무변경이 허용된다. 그러나 UX 관점에서는 메시지 보강을 권고한다.

---

### 2-C. 본사 데스크톱 가시성 — 거래처 직접주문 vs 견적전환 구분

**현황**

`SalesPartnerOrderListPage.tsx`:
- 상태 기본 필터 = DRAFT (진행중)
- 컬럼: 주문 번호 / 거래처 코드 / 거래처명 / 발송일 / 합계 / 상태 / 연결 전표
- "주문 출처(거래처 confirm vs 견적전환)" 구분 컬럼 없음

`SalesPartnerOrderDetailPage.tsx`:
- 상세 formGrid 에도 출처(sourceEstimateId 등) 표시 없음

**분석**

D1 이후 모든 진행중 주문이 DRAFT 상태로 동일하게 표시된다. 거래처가 포털에서 직접 confirm 한 주문과 내부에서 견적을 주문으로 전환한 주문이 동일한 목록에 섞인다.

실무 업무 관행상 이 두 경로는 다른 처리 루틴을 가질 수 있다:
- 거래처 confirm 주문: 거래처 요청사항/배송지/납기 확인 필요
- 견적전환 주문: 이미 내부 합의된 견적 기반

현재는 주문번호 패턴이나 거래처코드로 간접 구분이 가능하나, 명시적 출처 표시가 없어 업무 효율이 떨어질 수 있다. 이는 D1 자체가 도입한 문제는 아니나(견적전환 경로는 이전부터 존재), D1 으로 confirm 주문이 DRAFT 로 진행중 목록에 합류하면서 혼합이 심화된다.

---

## 3. Finding 요약

| ID | 우선순위 | 구분 | 설명 | 블로킹 여부 | 대상 파일/위치 |
|---|---|---|---|---|---|
| F-01 | P1 | UX/피드백 | order-app "전송이 완료되었습니다" — 거래처의 기대 모델(slip 자동발행 → 접수 대기) 전환을 메시지가 유도하지 않음. 과거 자동발행 경험 거래처에서 오인 리스크. 메시지 보강 또는 부제 추가 권고. | **비블로킹** (spec §3.2 슬라이스 D1 허용) — 단, 후속 슬라이스에서 해결 권고 | `clients/web/order-app/index.html` line 6098 |
| F-02 | P2 | 상태용어 | `PARTNER_ORDER_STATUS_LABEL` CONFIRMED='완료' — D1 이후 CONFIRMED 는 레거시 주문에서만 등장. 향후 레거시 CONFIRMED 주문 노출 시 CONVERTED('전환완료') 와 혼동 가능성. status model 정비(memory 갱신 또는 레이블 변경) 권고. | 비블로킹 | `clients/desktop/src/renderer/api/sales.ts` line 334 |
| F-03 | P2 | 가시성 | 본사 데스크톱 주문 리스트에 주문 출처(거래처 confirm vs 견적전환) 구분 표시 없음. D1 이후 진행중 목록에 두 출처가 혼합. 후속 슬라이스에서 출처 컬럼 또는 필터 권고. | 비블로킹 — D1 자체 기능에 결함 없음, 후속 개선 | `clients/desktop/src/renderer/routes/SalesPartnerOrderListPage.tsx` |

---

## 4. 업무흐름 관례 적합성 평가

한국 ERP 관행상 거래처 주문 → 진행중(접수) → 본사 전표 발행 2단계 흐름은 표준이다. D1 의 "confirm = DRAFT 생성, convert = slip 발행" 분리는 이 관행과 완전히 정합한다. 이카운트 참조 화면(docs/migration/ecount-reference/)의 "주문서 → 출고지시서" 분리 워크플로우와도 일치한다. 업무흐름 자체의 설계는 적합하다.

---

## 5. 결론

- **블로킹 finding: 0건**
- D1 슬라이스 자체(BE 동작 변경)는 UX/업무흐름 관점에서 릴리즈 블로킹 결함이 없다.
- P1 finding(F-01)은 후속 슬라이스 권고 사항이며, spec §3.2 에서 D1 범위 외로 허용됨이 명시되어 있다.
- P2 finding(F-02, F-03)은 중장기 개선 권고로 관리.

**최종 판정: 디자이너 UX 검토 통과 (후속 권고 2건, 블로킹 0건)**

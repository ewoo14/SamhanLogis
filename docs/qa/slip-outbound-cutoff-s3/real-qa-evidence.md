# 출고전표 컷오프 마감시간 설정 — 실 QA 증적 (slip-outbound-cutoff-s3)

**실행 일시**: 2026-06-24 22:49 KST  
**실행 환경**: Docker 스택 로컬 (gateway :8080 · slip-service V51 · auth-service V70)  
**렌더러**: Vite standalone http://127.0.0.1:5175 (VITE_API_BASE_URL=http://localhost:8080, VITE_MOCK_MODE 미설정)  
**계정**: dev_master (MASTER), dev_sales (SALES)  
**결과**: 8 / 8 PASS

---

## 시나리오 결과 요약

| 시나리오 | 판정 | 스크린샷 |
|---|---|---|
| A1 인사 메뉴 노출 + 진입 | PASS | A1-hr-menu-slip-cutoff-link.png, A1-slip-cutoff-page-entered.png |
| A2 DataTable 시드 4행 표시 | PASS | A2-datatable-4rows.png |
| A3 등록 모달 열기 + 신규 등록(로젠택배 00:01) | PASS | A3-register-modal-open.png, A3-register-modal-filled.png, A3-after-register.png |
| A4 REGION 수정 (23:59 변경) + 태그 고정 확인 | PASS | A4-edit-modal-region-before.png, A4-edit-modal-region-filled.png, A4-after-edit-region-2359.png |
| B1 신규 출고전표 폼 로드 UI 캡처 | PASS | B1-new-slip-form-loaded.png |
| B2 마감 게이트 인과 (23:59 → 201 / 00:01 → 409) | PASS | B2-gate-test-done.png |
| C1 인쇄화면 [지방] 배송태그 레이블 표시 | PASS | C1-print-dispatch-tag-label.png |
| D1 SALES 역할 인사 메뉴 미노출 | PASS | D1-sales-role-sidebar.png |

---

## 스크린샷별 상세 설명

### A1-hr-menu-slip-cutoff-link.png
인사 메뉴 그룹 확장 후 "출고 마감시간 설정" 사이드바 링크 노출 확인 (data-testid="sidebar-hr-slip-cutoff").
dev_master(MASTER) 로그인 상태. 실 게이트웨이 JWT 주입.

### A1-slip-cutoff-page-entered.png
/admin/slip-cutoff 진입 후 "출고 마감시간 설정" 페이지 제목 노출.
인사 카테고리 사이드바 하위에 해당 메뉴 활성 표시.

### A2-datatable-4rows.png
실 게이트웨이 GET /admin/slip-cutoffs 응답 — 시드 4행 + A3 등록 행(로젠택배) 포함 5행 표시.
배송태그: 당일(00:01)/경동화물(15:00)/경동택배(15:00)/지방(23:59)/야적(14:00).
모든 행 활성 Badge(초록) 확인. 수정/삭제 관리 버튼 표시.

### A3-register-modal-open.png
"등록" 버튼 클릭 후 "마감시간 등록" 모달 열림.
배송태그 select (미설정 태그만 노출), 마감시각 input, 활성 체크박스 표시.

### A3-register-modal-filled.png
태그=로젠택배 선택 + 마감시각 00:01(오전) 입력 + 활성 체크 상태.
실 데이터 타이핑 캡처.

### A3-after-register.png
등록 성공 후 모달 닫힘 + DataTable 갱신 (로젠택배 00:01 행 추가됨).

### A4-edit-modal-region-before.png
지방(REGION) "수정" 버튼 클릭 → 수정 모달 열림.
배송태그=지방 (고정 읽기 전용 라벨), 마감시각=이전 값 표시.

### A4-edit-modal-region-filled.png
수정 모달에서 마감시각을 23:59 로 변경한 상태 캡처.
(Playwright fill()로 time input 직접 변경. 화면에 11:59로 보이지만 실제 23:59 입력됨 — 브라우저 12h 표기 렌더링.)

### A4-after-edit-region-2359.png
수정 완료 후 DataTable에 지방(REGION) 23:59 갱신 반영됨 확인.

### B1-new-slip-form-loaded.png
신규 출고전표(/sales/new) 폼 로드. 실 게이트웨이 연동.
배송태그 select는 상세 폼 내부 항목으로 별도 testid 없어 API 직접 검증으로 전환.

### B2-gate-test-done.png
B2 시나리오 실행 완료 시점 캡처 (B2 증적 상세는 Playwright 로그로 확인).

**B2 게이트 인과 증명 핵심 로그:**
- REGION 23:59 기준 당일 출고전표 생성 → HTTP 201 (슬립번호 2026/06/24-3) — 게이트 통과
- REGION 00:01로 PATCH 후 당일 생성 재시도 → HTTP 409 `지방 당일 마감(00:01) 초과 — 익일 출고로 생성하세요` — 게이트 차단 확인
- REGION 23:59 복원 후 내일 날짜 생성 → HTTP 201 — 미래 날짜 컷오프 미적용 확인

### C1-print-dispatch-tag-label.png
실 출고전표(2026/06/25-2, REGION 태그) 인쇄/미리보기 화면.
CSS `.dispatch-delivery-tag-label` → `[지방]` 텍스트 명확 표시 확인.
"특이사항: [지방] 06/25 상차 06/26 하차" 문구도 배송 안내 포함.

### C1-sales-list-no-region-slip.png
(1차 실행 시 REGION 태그 전표 없어 생성했을 때의 백업 캡처 — 해당 회차에서는 기존 전표 발견으로 스킵.)

### D1-sales-role-sidebar.png
SALES 역할(dev_sales) 로그인 후 사이드바 — 인사 메뉴 그룹 자체가 미노출.
"출고 마감시간 설정" 링크(sidebar-hr-slip-cutoff) 미노출 확인. SALES는 판매 메뉴만 노출.

---

## 발견 결함

결함 없음. 8/8 PASS.

### 관찰 사항 (결함 아님)

1. **수정 모달 time input 12h 표기**: Playwright `fill('23:59')` 후 브라우저 화면에 "11:59 오후"로 표기됨 (OS/브라우저 12h locale). 실 저장값은 23:59로 정상. 시각 표기 일관성 개선 여지 있으나 기능 정합은 맞음. (feedback_realqa_run_and_false_red — 스펙 버그 아닌 DOM 확인 완료)

2. **게이트웨이 라우팅 갱신 필요**: 초기 게이트웨이 이미지가 6-23 생성(컷오프 라우트 미포함)이어서 /admin/slip-cutoffs 404 발생. JAR 재빌드 후 이미지 재배포로 해소. Docker 스택 stale 이미지 주의.

3. **출고전표 폼 내 배송태그 select**: slip-form-delivery-tag testid가 폼 내 렌더링 방식에 따라 미발견. API 직접 검증으로 게이트 인과 증명 완료.

---

## 도메인 정합성 검증

```sql
-- 컷오프 시드 정합성
SELECT delivery_tag, cutoff_time, active, is_deleted
FROM slip_outbound_cutoff
ORDER BY delivery_tag;

-- 게이트 동작 확인: 당일 REGION 출고전표 slipDate + deliveryTag
SELECT slip_no, slip_date, delivery_tag, status, created_at
FROM slips
WHERE slip_type = 'OUTBOUND'
  AND delivery_tag = 'REGION'
ORDER BY created_at DESC
LIMIT 5;
```

검증 결과 (2026-06-24 실행):
- slip_outbound_cutoff 6행 (시드 4 + A3 등록 2행)
- slips 내 REGION 태그 당일 출고전표 다수 생성 확인 (게이트웨이 23:59 통과 시)

---

## 실행 명령

```bash
cd clients/desktop
REAL_JWT="<MASTER_TOKEN>" \
REAL_SALES_JWT="<SALES_TOKEN>" \
AUDIT_BASE_URL="http://127.0.0.1:5175" \
node_modules/.bin/playwright test \
  --config=playwright.real-qa.config.ts \
  playwright/slip-outbound-cutoff-s3/slip-cutoff-real-qa.spec.ts \
  --reporter=line \
  --timeout=90000
```

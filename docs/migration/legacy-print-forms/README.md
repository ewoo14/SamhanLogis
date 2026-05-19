# Legacy 인쇄 양식 baseline (PNG 캡처)

> 작성일: 2026-05-19
> 목적: Figma UI/UX 개선 + 이카운트 마이그레이션 진입 전 legacy 인쇄 양식 baseline 확보
> 가드: `feedback_print_design_iteration.md` — 인쇄 양식은 docs/migration/legacy-print-forms/ 의 실 운영 PNG 와 픽셀 단위 일치, 임의 개선 금지

---

## 1. 첨부 대상 (사용자 업로드)

### 1-A. 출고전표 양식 (Outbound Slip / Dispatch Slip)
- 파일명 권장: `outbound-slip-{YYYYMMDD}.png` (또는 `.jpg`)
- 위치: `docs/migration/legacy-print-forms/`
- 형식: PNG / JPG (legacy ERP 인쇄 결과 캡처)
- 권장 해상도: A4 가로/세로 — 인쇄 양식 픽셀 비교 가능 수준

### 1-B. 거래명세서 양식 (Sales Invoice / Statement)
- 파일명 권장: `sales-invoice-{YYYYMMDD}.png`
- 위치: `docs/migration/legacy-print-forms/`
- 형식: PNG / JPG

---

## 2. 용도

### 2-A. Figma UI/UX 개선
- Figma 진입 시 legacy 양식 baseline 100% 인용
- 픽셀 단위 일치 의무 (legacy GAS parity 정신 일관)
- 카테고리 컬러 토큰화 / Pretendard 9 weight 적용 시 baseline 보존

### 2-B. 이카운트 마이그레이션 양식 매핑
- 이카운트 거래내역 탭 (전표 9종) 의 인쇄 양식과 SamhanLogis 인쇄 양식 정합
- 필드 매핑 (이카운트 컬럼 → SamhanLogis 인쇄 필드)
- 인쇄 회귀 가드 spec (Playwright `@media print` 캡처 + 픽셀 diff)

---

## 3. 파일 보관 정책

- **commit OK**: PNG/JPG 양식 캡처 이미지 (운영 자격 정보 포함 X 가드)
- **commit 금지**: 운영 자격 정보 (사업자등록번호 실값 / 거래처 실명 등) 포함 시 → 마스킹 후 첨부
- 익명화 patterns: `1234-56-7890` → `0000-00-0000`, 실 거래처명 → "삼한물류 (예시)"

---

## 4. 첨부 후 다음 단계

1. **양식 이미지 첨부 완료 통지**: PM (Claude Code) 호출
2. **PM 자동 진행**:
   - 양식 픽셀/컬러/타이포 분석 → Designer agent 활용
   - 이카운트 Excel sample 과 cross-mapping (필드 매핑 명세)
   - Figma 진입 baseline 확정
3. **이카운트 raw Excel 도착 시 (별도)**: MIG-1 PoC 즉시 진행 (`docs/migration/ecount-data/raw/`)

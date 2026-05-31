## 🧪 Docker 실 QA 결과 — 전 컨텍스트 PASS ([[no-fake-data-ever]] 실 캡처)

실 gateway(:8080) + 실 dev_master JWT + 실 inventory_db + FE renderer(VITE_MOCK_MODE 없이). partner-order-service 본 브랜치 재빌드(LineResponse productId). 합성/mock 렌더 없음.

### 컨텍스트별 결과

| 컨텍스트 | 결과 | psql 실값 적중 |
|---|---|---|
| 주문 상세(`2026/05/31-1`) → 모달 | ✅ | HQ-001 가용47/실50/예약3, VH-001 가용63/실63/예약0 — DB 일치 |
| 0토글 OFF → ON | ✅ | OFF=HQ/VH만, ON=CS-001·BK-001(0/0/0) 추가, VR-001(VIRTUAL) 미노출 |
| 출고전표 상세(`2026/05/31-10`) → 모달 | ✅ | AR09…/HQ-001 가용70/실71/예약1 — DB 일치 |
| 입고전표 상세 → 모달 | ✅ | 0재고 품목 빈 상태 UI 정상 |
| UUID 비공개 / VIRTUAL 제외 | ✅ | 모달 내 UUID 0, VR-001 토글 ON/OFF 모두 미노출 |

### 실 화면 캡처

**모달 매트릭스 — 품목 × 창고 가용/실/예약 3줄 (실 데이터)**
![매트릭스](https://github.com/ewoo14/SamhanLogis/blob/feat/2-6d-inventory-lookup-modal/docs/qa/slice-2-6d-inventory-lookup/01-modal-matrix.png?raw=true)

**0수량 토글 OFF (실재고>0 창고만)**
![토글 OFF](https://github.com/ewoo14/SamhanLogis/blob/feat/2-6d-inventory-lookup-modal/docs/qa/slice-2-6d-inventory-lookup/02-toggle-off.png?raw=true)

**0수량 토글 ON (전 창고 — CS-001/BK-001 0/0/0 머지, VIRTUAL 제외)**
![토글 ON](https://github.com/ewoo14/SamhanLogis/blob/feat/2-6d-inventory-lookup-modal/docs/qa/slice-2-6d-inventory-lookup/03-toggle-on.png?raw=true)

**출고전표 상세 → 재고조회 모달**
![출고](https://github.com/ewoo14/SamhanLogis/blob/feat/2-6d-inventory-lookup-modal/docs/qa/slice-2-6d-inventory-lookup/05-slip-outbound-modal.png?raw=true)

증빙 전문: `docs/qa/slice-2-6d-inventory-lookup/real-qa-evidence.md` + 캡처 00~07.

### QA 발견 블로커(수정 완료)
- 준비 단계: partner-order 이전 이미지(productId 없음) → 본 브랜치 재빌드 / Vite 5173 mock 모드 잔존 → 실 모드 재기동. 둘 다 해소 후 실 데이터 검증.

### 부수 발견(비차단, 본 슬라이스 범위 외)
- `GET /partner-orders/{id}/revisions` 500(주문 버전이력 API, 별도) / INBOUND seeder product_id 가 구 TEST-MODEL UUID(seeder 정합 후속).

### 5-team 사이클 N=2 종합
BE/FE/Designer/QA/DevOps **전원 APPROVE**. 사이클1 결함(QA B-2 품목 행 누락 실버그 / Designer 토큰화·가용 색 의미 / FE 상태 리셋 / Playwright 강화) 전량 fix → 사이클2 수렴. CI 23잡 green(skipped=0). 실 QA PASS.

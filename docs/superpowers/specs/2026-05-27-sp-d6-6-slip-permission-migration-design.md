# SP-D6-6 slip-service 권한 마이그레이션 설계

## 목표

slip-service 의 사용자-facing `@PreAuthorize` role guard 를 `@RequirePermission` 기반 동적 RBAC 로 이전한다. `/internal/**` 및 `isAuthenticated()` 전용 조회는 이번 slice 범위에서 제외한다.

## 선행 slice 적용 원칙

- `slip.edit-requests` 와 `slip.edit-requests.decide` 를 분리한다. 승인/거절/처리 대시보드는 `MANAGER`, `MASTER` 만 허용한다.
- `@hr.isExecutiveOffice()` 정적 가드는 발견 시 유지하고 `@RequirePermission` 과 병행한다.
- V36 seed 는 기존 `@PreAuthorize` role 집합을 축소/확대 없이 재현한다.
- WebMvc slice IT 로 AOP 적용 여부를 검증한다.
- `isForbidden()` 검증은 요청 직전 DPC `false` stub 을 명시한다.

## PageCode 매핑

| PageCode | 용도 | 기존 역할 |
|---|---|---|
| `sales.slip.create` | 매출/수동 전표 생성 | SALES, MANAGER, MASTER |
| `sales.slip.edit` | 매출 전표 수정/저장/전송/삭제 | SALES, MANAGER, MASTER |
| `sales.slip.confirm` | 전표 확정 | ACCOUNTANT, MANAGER, MASTER |
| `sales.slip.cancel` | 전표 취소/반려 | SALES, MANAGER, MASTER 또는 MANAGER, MASTER |
| `purchases.slip.edit` | 매입 전표 수정/삭제 | WAREHOUSE, MANAGER, MASTER |
| `slip.transfer.process` | 수락/처리/검수/완료/배송 | WAREHOUSE, INVENTORY, MANAGER, MASTER |
| `slip.receipt-ocr` | 영수증 OCR 보조 코드 | purchases.receipt-ocr 기존 코드 사용 |
| `slip.print.next-day` | 내일자 전표 이미지 | SALES, MANAGER, MASTER |
| `slip.print.export` | 전표 Excel export | MANAGER, MASTER |
| `slip.cleanup` | 전표정리 조회 | SALES, MANAGER, MASTER |
| `slip.cleanup-history` | 전표정리 저장내역 | SALES, MANAGER, MASTER |
| `slip.attachments.upload` | 일반 첨부 업로드 | DRIVER, SALES, MANAGER, MASTER, WAREHOUSE, INVENTORY |
| `slip.attachments.delete` | 일반 첨부 삭제 | SALES, MANAGER, MASTER |
| `slip.delivery-attachments.upload` | 배송 사진 업로드 | DRIVER, SALES, MANAGER, MASTER |
| `slip.photo-audit` | 사진 감사 | WAREHOUSE, MANAGER, MASTER |
| `slip.comments` | 댓글 등록 | SALES, WAREHOUSE, MANAGER, MASTER |
| `slip.audit-overlay` | audit overlay patch | SALES, WAREHOUSE, MANAGER, MASTER |
| `slip.audit-revert` | audit revert | MANAGER, MASTER |
| `slip.edit-requests` | 수정/삭제 요청 생성 | SALES, MANAGER, MASTER |
| `slip.edit-requests.decide` | 요청 목록/승인/거절 | MANAGER, MASTER |
| `slip.signature` | 서명 조회/무효화 | 조회 MANAGER, MASTER / 변경 MASTER |
| `slip.lookup-product` | 전표 라인 상품 lookup | MASTER, MANAGER, SALES, ACCOUNTANT, WAREHOUSE, INVENTORY |
| `slip.delivery-batch` | 배송 배치 admin | MANAGER, MASTER |
| `slip.mobile-sales` | 영업 모바일 API | SALES, MANAGER, MASTER |
| `slip.publish.from-estimate` | 견적 출고전표 발행 | SALES, MANAGER, MASTER, INTEGRATION |
| `slip.publish.from-partner-order` | 거래처 주문 출고전표 발행 | MANAGER, MASTER, INTEGRATION, PARTNER_ADMIN |

`dispatch.board`, `estimates.list`, `purchases.receipt-ocr`, `sales.slip.list`, `purchases.slip.list`, `inbound.inspection` 는 기존 PageCode 를 재사용한다.

## 비범위

- `/internal/slips/**`, `/internal/dispatch-tasks/**`, `/internal/slips/sales-query` 는 내부 토큰 + MASTER 정적 guard 를 유지한다.
- `isAuthenticated()` 조회 endpoint 는 이번 slice raw count 에서 제외한다.

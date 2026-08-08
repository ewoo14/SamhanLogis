/**
 * 권한설정 화면 — SP-D1 슬라이스.
 *
 * MASTER 전용 (`/admin/permission-matrix`).
 * 계정 선택 후 해당 계정의 페이지 × 권한 액션 매트릭스를 관리한다.
 * 행은 PAGE_GROUPS/PAGES_ORDER 전체 페이지 코드이며, 열은 PERMISSION_ACTIONS
 * 7개(view/create/update/delete/restore/download/print)이다.
 * 서버 응답에 없는 페이지도 accountMatrixToState 에서 false 기본값으로 채워 렌더한다.
 *
 * 기능:
 * - account-select 로 계정 선택 (첫 계정 자동 선택)
 * - 페이지 코드 × PERMISSION_ACTIONS 7액션 체크박스 매트릭스
 * - 셀 변경 시 dirty 상태 강조 (노란 배경)
 * - "저장" 버튼 → 변경된 page/action 만 계정 권한 update API 호출 + toast
 * - "초기화" 버튼 → 선택 계정의 서버 데이터로 롤백 (dirty 취소)
 * - 역할 템플릿 적용 / 다른 계정에서 복사 / 도메인·행·열 일괄 토글
 * - 카테고리 그룹 헤더 행: 회계/매입/매출/전표 운영/배차/알림/메신저/관리/시스템 관리 +
 *   견적/거래처주문/재고/직원·계정/거래처/상품/아로로지스 총 16 그룹
 *
 * data-testid:
 * - permission-matrix-table                        — 매트릭스 표 wrapper
 * - perm-matrix-account-select                     — 계정 선택 select
 * - perm-matrix-cell-{pageNorm}-{action}           — 개별 셀 체크박스 (pageCode 를 '.' → '-' normalize)
 * - perm-matrix-row-all-{pageNorm}                 — 페이지 행 7액션 일괄 토글 버튼
 * - perm-matrix-col-all-{action}                   — 액션 열 전체 토글 버튼
 * - perm-matrix-domain-all-{domainId}              — 도메인 그룹 전체 ON 버튼
 * - perm-matrix-domain-all-{domainId}-off          — 도메인 그룹 전체 OFF 버튼
 * - perm-matrix-apply-template                     — 역할 템플릿 적용 버튼
 * - perm-matrix-copy-account                       — 다른 계정 권한 복사 버튼
 * - perm-matrix-change-count                       — 변경 건수 배지 role="status"
 * - perm-matrix-save-btn                           — 저장 버튼 (dirtyKeys.size===0 이면 disabled)
 */
import { useState, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Badge, Spinner } from '@samhan/design-system'
import {
  PERMISSION_ACTIONS,
  applyTemplate,
  copyFromAccount,
  fetchAccountMatrix,
  fetchAccounts,
  updateAccountMatrix,
  type AccountPermissionMatrix,
  type AccountPermissionUpdate,
  type PageCode,
  type PermissionAccount,
  type PermissionAction,
  type PermissionActionMatrix,
  type RbacRole,
} from '../api/permissionsApi'
import { usePageTitle } from '../hooks/usePageTitle'

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

/** 역할 한국어 라벨. */
const ROLE_LABEL: Record<RbacRole, string> = {
  MASTER: '마스터',
  DEVELOPER: '개발자',
  MANAGER: '매니저',
  DISPATCH: '배차담당자',
  SALES: '영업원',
  ACCOUNTANT: '회계원',
  WAREHOUSE: '창고원',
  INVENTORY: '재고원',
  PARTNER: '파트너',
  STAFF: '스태프',
  DRIVER: '운전기사',
}

// ---------------------------------------------------------------------------
// 카테고리 그룹 정의 — SP-D1~D3 기존 + SP-D4 신규 7 그룹
// ---------------------------------------------------------------------------

/**
 * 페이지 카테고리 그룹.
 * label: 그룹 헤더 한국어 명칭.
 * pages: 그룹 내 PageCode 목록 (순서 고정).
 *
 * 그룹 배치 순서 (사용자 업무 흐름 기준):
 *   회계 → 매입 → 매출 → 배차 → 알림 → 관리 (SP-D1~D3 기존)
 *   → 시스템 관리 (SP-D6-1)
 *   → 전표 운영 (SP-D6-6)
 *   → 견적 → 거래처주문 → 재고 → 직원·계정 → 거래처 → 상품 → 아로로지스 (SP-D4 신규)
 */
export interface PageGroup {
  label: string
  pages: PageCode[]
}

/**
 * 전체 카테고리 그룹 13개.
 * SP-D1: 회계·매입·매출·배차·알림·관리 (6 그룹 / 12 코드)
 * SP-D2: 회계 그룹 내 7 코드 추가 (그룹 수 유지)
 * SP-D3: 그룹 수 유지
 * SP-D4: 7 신규 그룹 + 22 코드 추가
 * SP-D6-1: system.* 3종 + dc-config.import/dashboard.admin + sales.partner-dc-config 추가
 * SP-D6-2: messenger.* + products.* 보강 + partner-order edit-request/tutorial 추가
 * SP-D6-3: notifications.admin / aligo.address-book / dispatch.sms-save-history / dispatch.batch 추가
 * SP-D7: notifications.center + 전용 *.view PageCode 추가
 */
export const PAGE_GROUPS: PageGroup[] = [
  // ── SP-D1~D3 기존 그룹 ──────────────────────────────────────────────────
  {
    label: '회계',
    pages: [
      'accounting.tax-invoice.emit-nts',
      'accounting.tax-invoice.list',
      'accounting.tax-invoice.batch-issue',
      'accounting.tax-invoice.inbound',
      'accounting.tax-invoice.cancel',
      'accounting.tax-invoice.issue-request',
      'accounting.tax-invoice.realtime',
      'accounting.tax-invoice.inbound.manage',
      'accounting.sales-slip.list',
      'accounting.sales-slip.accounting',
      'accounting.purchase-slip.list',
      'accounting.purchase-slip.accounting',
      'accounting.daily-closing',
      'accounting.daily-closing.run',
      'accounting.daily-closing.unlock',
      'accounting.general-ledger',
      'accounting.hometax-export',
      // SP-D2 회계 추가
      'accounting.accounts',
      'accounting.journals',
      'accounting.journals.realtime',
      'accounting.balances',
      'accounting.balances.trial-balance',
      'accounting.reports',
      'accounting.receivables',
      'accounting.bank-card-admin',
      'accounting.bank-matching',
      'accounting.deposit-mapping',
      'accounting.deposit-match',
      'accounting.period-close',
      'accounting.period-close.reverse',
      'accounting.statement-batch',
      'accounting.partner-ledger',
      'accounting.supplier-profiles',
      'accounting.cash-receipts',
      'ecount.mig2.account',
      'ecount.mig2.card',
      'ecount.mig3.purchase-slip',
      'ecount.mig3.sales-slip',
      'ecount.mig3.general-voucher',
      'ecount.mig3.journal-entry',
      'ecount.mig4.tax-invoice',
      'ecount.mig4.sales-slip-line',
      'ecount.mig4.summary',
      'ecount.mig4.order',
      'ecount.mig5.expense-voucher',
      'ecount.mig5.deposit-report',
      'ecount.mig6.bank-account',
      'ecount.mig6.fixed-asset-type',
      'ecount.mig7.cash-disbursement',
      'ecount.mig7.cash-receipt',
      'ecount.mig8.order',
      'ecount.mig9.cash-journal.disbursement',
      'ecount.mig9.cash-journal.receipt',
      'ecount.mig10.order-employee-backfill',
      'ecount.mig11.sales-ledger',
      'ecount.mig11.purchase-ledger',
      'ecount.mig14.order-list',
      'ecount.mig14.ledger',
      'ecount.mig.ops-dashboard',
      'accounting.edit-requests',
      'accounting.edit-requests.decide',
      'ecount.reimport',
    ],
  },
  {
    label: '매입',
    pages: [
      'purchases.slip.list',
      'purchases.slip.edit',
      'purchases.slip.delete',
      'inbound.inspection',
    ],
  },
  {
    label: '매출',
    pages: [
      'sales.slip.list',
      'sales.slip.create',
      'sales.slip.edit',
      'sales.slip.confirm',
      'sales.slip.cancel',
      'sales.partner-dc-config',
      'sales.estimate-config',
    ],
  },
  {
    label: '전표 운영',
    pages: [
      'slip.transfer.process',
      'slip.reject',
      'slip.print.next-day',
      'slip.print.export',
      'slip.cleanup',
      'slip.cleanup-history',
      'slip.attachments.upload',
      'slip.attachments.delete',
      'slip.delivery-attachments.upload',
      'slip.photo-audit',
      'slip.comments',
      'slip.audit-overlay',
      'slip.closed-date-exception',
      'slip.closed-date-admin',
      'slip.audit-revert',
      'slip.edit-requests',
      'slip.edit-requests.decide',
      'slip.signature',
      'slip.lookup-product',
      'slip.delivery-batch',
      'slip.mobile-sales',
      'slip.publish.from-estimate',
      'slip.publish.from-partner-order',
    ],
  },
  {
    label: '배차',
    pages: [
      'dispatch.board',
      'dispatch.external-carriers',
      'notification.dispatch-sms.display',
      'notification.dispatch-sms.send-audit',
      'dispatch.sms-save-history',
      'dispatch.batch',
    ],
  },
  {
    label: '알림',
    pages: [
      'notifications.admin',
      'notifications.center',
      'aligo.address-book',
    ],
  },
  {
    label: '그룹웨어',
    pages: [
      'groupware.approvals',
      'groupware.approval-templates',
      'messenger.admin',
      'messenger.send',
      'groupware.schedules',
    ],
  },
  {
    label: '관리',
    pages: [
      'admin.permissions',
      'admin.permission-groups',
      'hr.role-management',
      'hr.slip-cutoff',
      'dc-config.import',
      'dashboard.admin',
    ],
  },
  {
    label: '개발',
    pages: [
      'admin.app-release',
      'dev.popup-notice',
      'dev.activity-log',
    ],
  },
  {
    label: '시스템 관리',
    pages: [
      'system.permission-admin',
      'system.password-admin',
      'system.account-admin',
    ],
  },
  // ── SP-D4 신규 그룹 ──────────────────────────────────────────────────────
  {
    label: '견적',
    pages: [
      'estimates.list',
    ],
  },
  {
    label: '거래처주문',
    pages: [
      'sales.partner-order.list',
      'sales.partner-order.draft',
      'sales.partner-order.edit',
      'sales.partner-order.confirm',
      'sales.partner-order.history',
      'sales.partner-order.history.view',
      'sales.partner-order.print',
      'sales.partner-order.edit-requests',
      'sales.partner-order.edit-requests.decide',
      'sales.partner-order.tutorial',
      'sales.partner-order.convert',
      'sales.partner-order.revisions',
    ],
  },
  {
    label: '재고',
    pages: [
      'inventory.warehouse',
      'inventory.warehouse.admin',
      'inventory.stock',
      'inventory.stock-transfer',
      'inventory.dps',
      'inventory.audit',
      'inventory.list',
      'inventory.detail',
      'inventory.adjust',
      'inventory.transfer',
      'inventory.stock-balance',
      'inventory.stock-balance.view',
      'inventory.safety-stock',
      'inventory.edit-requests',
      'inventory.edit-requests.decide',
      'ecount.import.inventory',
      'ecount.mig2.warehouse',
      'ecount.mig5.stock-transfer',
    ],
  },
  {
    label: '직원·계정',
    pages: [
      'admin.employees',
      'hr.carriers',
      'admin.users',
      'admin.approval-line-config',
      'ecount.mig2.department',
      'ecount.mig6.employee',
      'ecount.mig6.employee-card',
      'ecount.mig6.payroll-employee',
    ],
  },
  {
    label: '거래처',
    pages: [
      'partners.list',
      'partners.detail',
      'partners.detail.view',
      'partners.block',
      'partners.edit-request',
      'partners.search',
      'partners.edit',
      'partners.delete',
      'partners.credit-history',
      'partners.block.bulk',
      'partners.4tab',
      'partners.4tab.edit',
      'partners.edit-requests',
      'partners.edit-requests.decide',
    ],
  },
  {
    label: '상품',
    pages: [
      'products.list',
      'products.list.view',
      'products.admin',
      'products.price',
      'products.edit-requests',
      'products.edit-requests.decide',
      'products.ecount-import',
      'products.sync',
      'products.price-schedule',
      'ecount.mig2.product',
    ],
  },
  {
    label: '아로로지스',
    pages: [
      'arologis.admin',
      'arologis.region',
      'arologis.dispatch.admin',
      'arologis.dispatch.ops',
      'arologis.region.manage',
      'arologis.edit-requests',
      'arologis.edit-requests.decide',
      'arologis.driver',
      'arologis.hr.employees',
      'arologis.hr.departments',
      'arologis.accounting.cashbook',
      'arologis.accounting.summary',
      'arologis.admin.permissions',
      'arologis.accounting.accounts',
    ],
  },
]

/**
 * PAGE_GROUPS 에서 파생된 전체 페이지 코드 순서 배열.
 * 그룹 순서 × 그룹 내 순서가 최종 열 순서.
 */
export const PAGES_ORDER: PageCode[] = PAGE_GROUPS.flatMap((g) => g.pages)

/** 페이지 코드 한국어 라벨. */
export const PAGE_LABEL: Record<PageCode, string> = {
  'accounting.tax-invoice.batch-issue': '세금계산서 발행 묶음',
  'accounting.tax-invoice.inbound': '수신 세금계산서',
  'accounting.tax-invoice.cancel': '세금계산서 취소',
  'accounting.tax-invoice.issue-request': '세금계산서 발행 요청',
  'accounting.tax-invoice.realtime': '세금계산서 실시간',
  'accounting.tax-invoice.inbound.manage': '수신 세금계산서 관리',
  'accounting.sales-slip.list': '매출전표',
  'accounting.sales-slip.accounting': '매출전표 회계분개',
  'accounting.purchase-slip.list': '매입전표',
  'accounting.purchase-slip.accounting': '매입전표 회계분개',
  // SP-D1 12개
  'accounting.tax-invoice.emit-nts': 'NTS 발행',
  'accounting.tax-invoice.list': '세금계산서 목록',
  'accounting.daily-closing': '일마감',
  'accounting.daily-closing.run': '일마감 실행',
  'accounting.daily-closing.unlock': '일마감 해제',
  'accounting.general-ledger': '원장',
  'accounting.hometax-export': '홈택스 export',
  'notifications.admin': '알림 발송',
  'notifications.center': '알림 센터',
  'aligo.address-book': '알리고 주소록',
  'groupware.approvals': '그룹웨어 결재',
  'groupware.approval-templates': '결재 양식',
  'messenger.admin': '메신저 관리',
  'messenger.send': '메신저 발송',
  'groupware.schedules': '그룹웨어 일정',
  'purchases.slip.list': '매입 슬립',
  'purchases.slip.edit': '매입 전표 수정',
  'purchases.slip.delete': '매입 전표 삭제',
  'sales.slip.list': '매출 슬립',
  'sales.slip.create': '매출 전표 생성',
  'sales.slip.edit': '매출 전표 수정',
  'sales.slip.confirm': '전표 확정',
  'sales.slip.cancel': '전표 취소',
  'sales.partner-dc-config': '거래처 DC 설정',
  'sales.estimate-config': '견적 가격 설정',
  'slip.transfer.process': '전표 처리',
  'slip.reject': '전표 반려',
  'slip.print.next-day': '내일자 전표',
  'slip.print.export': '전표 export',
  'slip.cleanup': '전표정리',
  'slip.cleanup-history': '정리 저장내역',
  'slip.attachments.upload': '첨부 업로드',
  'slip.attachments.delete': '첨부 삭제',
  'slip.delivery-attachments.upload': '배송 사진',
  'slip.photo-audit': '사진 감사',
  'slip.comments': '댓글',
  'slip.audit-overlay': 'audit patch',
  'slip.closed-date-exception': '마감일 예외 생성',
  'slip.closed-date-admin': '마감 기준선 관리',
  'slip.audit-revert': 'audit revert',
  'slip.edit-requests': '전표 수정 요청',
  'slip.edit-requests.decide': '전표 요청 승인',
  'slip.signature': '전표 서명',
  'slip.lookup-product': '상품 lookup',
  'slip.delivery-batch': '배송 배치',
  'slip.mobile-sales': '영업 모바일',
  'slip.publish.from-estimate': '견적 전표발행',
  'slip.publish.from-partner-order': '주문 전표발행',
  'inbound.inspection': '입고 검수',
  'dispatch.board': '배차 보드',
  'dispatch.external-carriers': '외부기사/배송사',
  'notification.dispatch-sms.display': '배차안내 SMS',
  'notification.dispatch-sms.send-audit': '배차안내 SMS (회수됨)',
  'dispatch.sms-save-history': '배차문자 저장',
  'dispatch.batch': '배차 SMS batch',
  'admin.permissions': '권한 관리',
  'admin.permission-groups': '권한그룹',
  'admin.app-release': '버전 관리',
  'dev.popup-notice': '팝업공지',
  'dev.activity-log': '로그',
  'admin.approval-line-config': '결재라인 설정',
  'hr.role-management': '인사 역할관리',
  'hr.slip-cutoff': '출고 마감시간 설정',
  'system.permission-admin': '시스템 권한',
  'system.password-admin': '비밀번호 관리',
  'system.account-admin': '계정 관리',
  'dc-config.import': 'DC import',
  'dashboard.admin': '대시보드 관리',
  // SP-D2 회계 7개 신규
  'accounting.accounts': '계정과목',
  'accounting.journals': '분개장',
  'accounting.journals.realtime': '분개 실시간',
  'accounting.balances': '시산표',
  'accounting.balances.trial-balance': '시산표 조회',
  'accounting.reports': '재무 보고서',
  'accounting.receivables': '받을어음/수금계획',
  'accounting.bank-card-admin': '계좌/카드 관리',
  'accounting.bank-matching': '입출금 내역',
  'accounting.deposit-mapping': '입금자명 매핑',
  'accounting.deposit-match': '입금 매칭',
  'accounting.period-close': '월말 마감',
  'accounting.period-close.reverse': '월말 마감 취소',
  'accounting.statement-batch': '거래명세서 일괄',
  'accounting.partner-ledger': '거래처 원장',
  'accounting.supplier-profiles': '공급자 설정',
  'accounting.cash-receipts': '입금보고서',
  'ecount.mig2.account': 'MIG-2 계정',
  'ecount.mig2.card': 'MIG-2 카드',
  'ecount.mig3.purchase-slip': 'MIG-3 매입전표',
  'ecount.mig3.sales-slip': 'MIG-3 매출전표',
  'ecount.mig3.general-voucher': 'MIG-3 일반전표',
  'ecount.mig3.journal-entry': 'MIG-3 분개',
  'ecount.mig4.tax-invoice': 'MIG-4 세금계산서',
  'ecount.mig4.sales-slip-line': 'MIG-4 판매전표 라인',
  'ecount.mig4.summary': 'MIG-4 매출매입내역',
  'ecount.mig4.order': 'MIG-4 주문서',
  'ecount.mig5.expense-voucher': 'MIG-5 지출결의서',
  'ecount.mig5.deposit-report': 'MIG-5 입금보고서',
  'ecount.mig6.bank-account': 'MIG-6 통장계좌',
  'ecount.mig6.fixed-asset-type': 'MIG-6 고정자산유형',
  'ecount.mig7.cash-disbursement': 'MIG-7 지출결의서',
  'ecount.mig7.cash-receipt': 'MIG-7 입금보고서',
  'ecount.mig8.order': 'MIG-8 주문',
  'ecount.mig9.cash-journal.disbursement': 'MIG-9 지출 분개',
  'ecount.mig9.cash-journal.receipt': 'MIG-9 입금 분개',
  'ecount.mig10.order-employee-backfill': 'MIG-10 주문 담당자',
  'ecount.mig11.sales-ledger': 'MIG-11 매출장',
  'ecount.mig11.purchase-ledger': 'MIG-11 매입장',
  'ecount.mig14.order-list': 'MIG-14 주문',
  'ecount.mig14.ledger': 'MIG-14 원장',
  'ecount.mig.ops-dashboard': 'MIG-21 운영 대시보드',
  'accounting.edit-requests': '회계 수정 요청',
  'accounting.edit-requests.decide': '회계 수정 요청 승인',
  'ecount.mig2.product': 'MIG-2 품목',
  'ecount.reimport': '이카운트 재import',
  // SP-D4 신규 22개
  'estimates.list': '견적 목록',
  'sales.partner-order.list': '주문 목록',
  'sales.partner-order.draft': '주문 작성',
  'sales.partner-order.edit': '주문 수정',
  'sales.partner-order.confirm': '주문 확정',
  'sales.partner-order.history': '주문 이력',
  'sales.partner-order.history.view': '주문 이력 조회',
  'sales.partner-order.print': '주문서 인쇄',
  'sales.partner-order.edit-requests': '주문 수정 요청',
  'sales.partner-order.edit-requests.decide': '주문 요청 승인',
  'sales.partner-order.tutorial': '주문 튜토리얼',
  'sales.partner-order.convert': '주문 출고전환',
  'sales.partner-order.revisions': '주문 리비전 복원',
  'inventory.warehouse': '창고관리',
  'inventory.warehouse.admin': '창고관리 admin',
  'inventory.stock': '재고 현황',
  'inventory.stock-transfer': '재고 이동',
  'inventory.dps': 'DPS 비교',
  'inventory.audit': '재고 감사',
  'inventory.list': '재고 목록',
  'inventory.detail': '재고 상세',
  'inventory.adjust': '재고 조정',
  'inventory.transfer': '재고 이동 API',
  'inventory.stock-balance': '재고 잔액',
  'inventory.stock-balance.view': '재고 잔액 조회',
  'inventory.safety-stock': '안전재고',
  'inventory.edit-requests': '재고 수정 요청',
  'inventory.edit-requests.decide': '재고 요청 승인',
  'ecount.import.inventory': '이카운트 재고',
  'ecount.mig2.warehouse': 'MIG-2 창고',
  'ecount.mig5.stock-transfer': 'MIG-5 창고이동',
  'admin.employees': '직원 관리',
  'hr.carriers': '운송사 목록',
  'admin.users': '계정 관리',
  'ecount.mig2.department': '부서 import',
  'ecount.mig6.employee': '사원 import',
  'ecount.mig6.employee-card': '인사카드 import',
  'ecount.mig6.payroll-employee': '급여사원 import',
  'partners.list': '거래처 목록',
  'partners.detail': '거래처 상세',
  'partners.detail.view': '거래처 상세 조회',
  'partners.block': '거래처 차단',
  'partners.edit-request': '편집 결재',
  'partners.search': '거래처 검색',
  'partners.edit': '거래처 편집',
  'partners.delete': '거래처 삭제',
  'partners.credit-history': '신용 이력',
  'partners.block.bulk': '차단 bulk',
  'partners.4tab': '거래처 4탭',
  'partners.4tab.edit': '4탭 편집',
  'partners.edit-requests': '거래처 수정 요청',
  'partners.edit-requests.decide': '거래처 요청 승인',
  'products.list': '상품 목록',
  'products.list.view': '상품 목록 조회',
  'products.admin': '상품 관리',
  'products.price': '상품 가격',
  'products.edit-requests': '상품 수정 요청',
  'products.edit-requests.decide': '상품 요청 승인',
  'products.ecount-import': '상품 import',
  'products.sync': '상품 시트 동기화',
  'products.price-schedule': '단가변동 관리',
  'arologis.admin': '아로로지스 배차',
  'arologis.region': '지역·구역',
  'arologis.dispatch.admin': '배차 admin',
  'arologis.dispatch.ops': '배차 운영',
  'arologis.region.manage': '지역 편집',
  'arologis.edit-requests': '아로로지스 수정 요청',
  'arologis.edit-requests.decide': '아로로지스 요청 승인',
  'arologis.driver': '기사앱',
  'arologis.hr.employees': '아로로지스 직원',
  'arologis.hr.departments': '아로로지스 부서',
  'arologis.accounting.cashbook': '아로로지스 현금출납장',
  'arologis.accounting.summary': '아로로지스 회계 집계',
  'arologis.admin.permissions': '아로로지스 권한',
  'arologis.accounting.accounts': '아로로지스 계정과목',
}

const MATRIX_ACTION_LABEL: Record<PermissionAction, string> = {
  view: '보기',
  create: '생성',
  update: '수정',
  delete: '삭제',
  restore: '복원',
  download: '엑셀',
  print: '인쇄',
}

const MATRIX_ACTION_META: Record<PermissionAction, {
  groupLabel: string
  headerBg: string
  headerBorder: string
  headerColor: string
  accentColor: string
}> = {
  view: {
    groupLabel: '조회',
    headerBg: 'var(--color-neutral-0)',
    headerBorder: 'var(--color-neutral-300)',
    headerColor: 'var(--color-neutral-700)',
    accentColor: 'var(--color-brand-500)',
  },
  create: {
    groupLabel: '변경',
    headerBg: 'var(--color-warning-50)',
    headerBorder: 'var(--color-warning-300)',
    headerColor: 'var(--color-warning-800, #8C5C13)',
    accentColor: 'var(--color-warning-500)',
  },
  update: {
    groupLabel: '변경',
    headerBg: 'var(--color-warning-50)',
    headerBorder: 'var(--color-warning-300)',
    headerColor: 'var(--color-warning-800, #8C5C13)',
    accentColor: 'var(--color-warning-500)',
  },
  delete: {
    groupLabel: '위험',
    headerBg: 'var(--color-danger-50)',
    headerBorder: 'var(--color-danger-300)',
    headerColor: 'var(--color-danger-700)',
    accentColor: 'var(--color-danger-500)',
  },
  restore: {
    groupLabel: '위험',
    headerBg: 'var(--color-danger-50)',
    headerBorder: 'var(--color-danger-300)',
    headerColor: 'var(--color-danger-700)',
    accentColor: 'var(--color-danger-500)',
  },
  download: {
    groupLabel: '출력',
    headerBg: 'var(--color-success-50)',
    headerBorder: 'var(--color-success-200)',
    headerColor: 'var(--color-success-700)',
    accentColor: 'var(--color-success-500)',
  },
  print: {
    groupLabel: '출력',
    headerBg: 'var(--color-success-50)',
    headerBorder: 'var(--color-success-200)',
    headerColor: 'var(--color-success-700)',
    accentColor: 'var(--color-success-500)',
  },
}

const MATRIX_ACTION_GROUP_STARTS = new Set<PermissionAction>(['create', 'restore', 'download'])
/** 위험(DELETE/RESTORE) 액션 — 173×7 그리드 단일 셀 오클릭 방지 시각 가드 대상. */
const MATRIX_DANGER_ACTIONS = new Set<PermissionAction>(['delete', 'restore'])
const MATRIX_LEGEND_ITEMS = [
  { label: '조회', actions: '보기', color: 'var(--color-brand-500)' },
  { label: '변경', actions: '생성 · 수정', color: 'var(--color-warning-500)' },
  { label: '위험', actions: '삭제 · 복원', color: 'var(--color-danger-500)' },
  { label: '출력', actions: '엑셀 · 인쇄', color: 'var(--color-success-500)' },
]

const MATRIX_DOMAIN_ID_BY_LABEL: Record<string, string> = {
  회계: 'accounting',
  매입: 'purchases',
  매출: 'sales',
  '전표 운영': 'slip',
  배차: 'dispatch',
  알림: 'notifications',
  메신저: 'messenger',
  관리: 'admin',
  '시스템 관리': 'system',
  견적: 'estimates',
  거래처주문: 'partner-order',
  재고: 'inventory',
  '직원·계정': 'employees',
  거래처: 'partners',
  상품: 'products',
  아로로지스: 'arologis',
}

type AccountMatrixState = Record<PageCode, PermissionActionMatrix>
type AccountDirtyKey = `${PageCode}__${PermissionAction}`

const matrixDirtyKey = (page: PageCode, action: PermissionAction): AccountDirtyKey => `${page}__${action}`
const matrixPageNorm = (page: PageCode): string => page.replace(/\./g, '-')

function emptyPermissionActions(): PermissionActionMatrix {
  return {
    view: false,
    create: false,
    update: false,
    delete: false,
    restore: false,
    download: false,
    print: false,
  }
}

function accountMatrixToState(matrix: AccountPermissionMatrix | undefined): AccountMatrixState {
  const state = {} as AccountMatrixState
  for (const page of PAGES_ORDER) {
    state[page] = emptyPermissionActions()
  }
  for (const cell of matrix?.cells ?? []) {
    state[cell.pageCode] = {
      view: cell.view,
      create: cell.create,
      update: cell.update,
      delete: cell.delete,
      restore: cell.restore,
      download: cell.download,
      print: cell.print,
    }
  }
  return state
}

function accountDirtyKeys(
  server: AccountMatrixState | null,
  current: AccountMatrixState | null,
): Set<AccountDirtyKey> {
  const dirty = new Set<AccountDirtyKey>()
  if (!server || !current) return dirty
  for (const page of PAGES_ORDER) {
    for (const action of PERMISSION_ACTIONS) {
      if (server[page]?.[action] !== current[page]?.[action]) {
        dirty.add(matrixDirtyKey(page, action))
      }
    }
  }
  return dirty
}

function accountOptionLabel(account: PermissionAccount): string {
  return `${account.displayName} / ${ROLE_LABEL[account.role] ?? account.role}${account.enabled ? '' : ' / 비활성'}`
}

function filteredPageGroups(search: string): PageGroup[] {
  const query = search.trim().toLowerCase()
  if (!query) return PAGE_GROUPS
  return PAGE_GROUPS
    .map((group) => ({
      ...group,
      pages: group.pages.filter((page) => {
        const label = PAGE_LABEL[page] ?? page
        return page.toLowerCase().includes(query) || label.toLowerCase().includes(query)
      }),
    }))
    .filter((group) => group.pages.length > 0)
}

const matrixSelectStyle: React.CSSProperties = {
  height: 34,
  minWidth: 180,
  border: '1px solid var(--color-neutral-300)',
  borderRadius: 6,
  padding: '0 8px',
  background: 'var(--color-neutral-0)',
  color: 'var(--color-neutral-900)',
  fontSize: 13,
}

const matrixButtonStyle: React.CSSProperties = {
  border: '1px solid var(--color-neutral-300)',
  borderRadius: 6,
  padding: '3px 7px',
  background: 'var(--color-neutral-0)',
  color: 'var(--color-neutral-700)',
  fontSize: 11,
  cursor: 'pointer',
}

function matrixActionSeparatorStyle(action: PermissionAction): React.CSSProperties {
  return MATRIX_ACTION_GROUP_STARTS.has(action)
    ? { borderLeft: '2px solid var(--color-neutral-300)' }
    : {}
}

function matrixActionButtonStyle(action: PermissionAction): React.CSSProperties {
  const meta = MATRIX_ACTION_META[action]
  return {
    ...matrixButtonStyle,
    width: '100%',
    padding: '5px 4px',
    background: meta.headerBg,
    borderColor: meta.headerBorder,
    color: meta.headerColor,
    fontWeight: 700,
  }
}

function matrixActionCellStyle(action: PermissionAction, dirty: boolean): React.CSSProperties {
  const isDanger = MATRIX_DANGER_ACTIONS.has(action)
  // 위험(DELETE/RESTORE) 셀: 단일 오클릭 방지용 시각 가드.
  // - dirty 상태는 기존 warning-50 우선(변경 추적 우선), 그 외엔 미세 danger-50 배경.
  // - 셀 내부 점선 danger 테두리로 "위험 셀"임을 한눈에 인지(separator 와 시각 구분).
  const background = dirty
    ? 'var(--color-warning-50)'
    : isDanger
      ? 'var(--color-danger-50)'
      : 'var(--color-neutral-0)'
  return {
    textAlign: 'center',
    borderBottom: '1px solid var(--color-neutral-200)',
    background,
    ...(isDanger ? { outline: '1px dashed var(--color-danger-300)', outlineOffset: '-3px' } : {}),
    ...matrixActionSeparatorStyle(action),
  }
}

function matrixActionCheckboxStyle(action: PermissionAction): React.CSSProperties {
  return {
    accentColor: MATRIX_ACTION_META[action].accentColor,
    cursor: 'pointer',
  }
}

export function PermissionMatrixPage() {
  usePageTitle('권한설정')

  const queryClient = useQueryClient()
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [templateRole, setTemplateRole] = useState<RbacRole>('MANAGER')
  const [copySourceAccountId, setCopySourceAccountId] = useState('')
  const [search, setSearch] = useState('')
  const [editState, setEditState] = useState<AccountMatrixState | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const accountsQuery = useQuery({
    queryKey: ['admin', 'permission-accounts'],
    queryFn: fetchAccounts,
  })

  const matrixQuery = useQuery({
    queryKey: ['admin', 'permission-account-matrix', selectedAccountId],
    queryFn: () => fetchAccountMatrix(selectedAccountId),
    enabled: selectedAccountId.length > 0,
  })

  const selectedAccount = accountsQuery.data?.find((account) => account.id === selectedAccountId)
  const serverState = useMemo(() => accountMatrixToState(matrixQuery.data), [matrixQuery.data])
  const currentState = editState ?? serverState
  const dirtyKeys = useMemo(() => accountDirtyKeys(serverState, currentState), [serverState, currentState])
  const visibleGroups = useMemo(() => filteredPageGroups(search), [search])
  const visiblePages = useMemo(() => visibleGroups.flatMap((group) => group.pages), [visibleGroups])

  useEffect(() => {
    const firstAccount = accountsQuery.data?.[0]
    if (!selectedAccountId && firstAccount) {
      setSelectedAccountId(firstAccount.id)
    }
  }, [accountsQuery.data, selectedAccountId])

  useEffect(() => {
    setEditState(null)
  }, [selectedAccountId, matrixQuery.dataUpdatedAt])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const invalidateMatrix = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'permission-account-matrix', selectedAccountId] })
    void queryClient.invalidateQueries({ queryKey: ['permissions', 'my'] })
  }, [queryClient, selectedAccountId])

  const saveMutation = useMutation({
    mutationFn: (updates: AccountPermissionUpdate[]) => updateAccountMatrix(selectedAccountId, updates),
    onSuccess: (result) => {
      setEditState(null)
      invalidateMatrix()
      setToast({ type: 'success', message: `${result.changedCount}건의 권한 변경을 저장했습니다.` })
    },
    onError: () => setToast({ type: 'error', message: '권한 저장 중 오류가 발생했습니다.' }),
  })

  const templateMutation = useMutation({
    mutationFn: () => applyTemplate(selectedAccountId, templateRole),
    onSuccess: (result) => {
      setEditState(null)
      invalidateMatrix()
      setToast({ type: 'success', message: `${ROLE_LABEL[templateRole]} 템플릿을 적용했습니다. (${result.changedCount}건)` })
    },
    onError: () => setToast({ type: 'error', message: '템플릿 적용 중 오류가 발생했습니다.' }),
  })

  const copyMutation = useMutation({
    mutationFn: () => copyFromAccount(selectedAccountId, copySourceAccountId),
    onSuccess: (result) => {
      setEditState(null)
      invalidateMatrix()
      setToast({ type: 'success', message: `다른 계정 권한을 복사했습니다. (${result.changedCount}건)` })
    },
    onError: () => setToast({ type: 'error', message: '계정 권한 복사 중 오류가 발생했습니다.' }),
  })

  const setPageActions = useCallback((
    pages: readonly PageCode[],
    actions: readonly PermissionAction[],
    allowed: boolean,
  ) => {
    setEditState((prev) => {
      const base = prev ?? currentState
      if (!base) return prev
      const next: AccountMatrixState = { ...base }
      for (const page of pages) {
        const row = { ...(next[page] ?? emptyPermissionActions()) }
        for (const action of actions) {
          row[action] = allowed
        }
        next[page] = row
      }
      return next
    })
  }, [currentState])

  const toggleCell = useCallback((page: PageCode, action: PermissionAction) => {
    const allowed = !(currentState?.[page]?.[action] ?? false)
    setPageActions([page], [action], allowed)
  }, [currentState, setPageActions])

  const toggleRow = useCallback((page: PageCode) => {
    const row = currentState?.[page] ?? emptyPermissionActions()
    const shouldEnable = PERMISSION_ACTIONS.some((action) => !row[action])
    if (!window.confirm(`${PAGE_LABEL[page] ?? page} 1개 행의 7개 권한을 ${shouldEnable ? 'ON' : 'OFF'} 처리할까요?`)) {
      return
    }
    setPageActions([page], PERMISSION_ACTIONS, shouldEnable)
  }, [currentState, setPageActions])

  const toggleColumn = useCallback((action: PermissionAction) => {
    const pages = PAGES_ORDER
    const shouldEnable = pages.some((page) => !(currentState?.[page]?.[action] ?? false))
    if (!window.confirm(`${MATRIX_ACTION_LABEL[action]} 권한을 전체 ${pages.length}개 페이지에 일괄 적용할까요?`)) {
      return
    }
    setPageActions(pages, [action], shouldEnable)
  }, [currentState, setPageActions])

  const setAllPages = useCallback((allowed: boolean) => {
    if (!window.confirm(`전체 ${PAGES_ORDER.length}개 페이지의 모든 권한을 ${allowed ? 'ON' : 'OFF'} 처리할까요?`)) {
      return
    }
    setPageActions(PAGES_ORDER, PERMISSION_ACTIONS, allowed)
  }, [setPageActions])

  const saveChanges = useCallback(() => {
    if (!selectedAccountId || !currentState || dirtyKeys.size === 0) return
    const dirtyPages = new Set<PageCode>()
    for (const key of dirtyKeys) {
      const [page] = key.split('__') as [PageCode, PermissionAction]
      dirtyPages.add(page)
    }
    const updates = Array.from(dirtyPages).map((page) => ({
      pageCode: page,
      actions: currentState[page] ?? emptyPermissionActions(),
    }))
    saveMutation.mutate(updates)
  }, [currentState, dirtyKeys, saveMutation, selectedAccountId])

  const changeAccount = useCallback((accountId: string) => {
    if (dirtyKeys.size > 0 && !window.confirm('저장하지 않은 변경이 있습니다. 계정을 변경할까요?')) return
    setSelectedAccountId(accountId)
  }, [dirtyKeys.size])

  const applySelectedTemplate = useCallback(() => {
    if (!selectedAccountId) return
    if (dirtyKeys.size > 0 && !window.confirm('미저장 변경을 버리고 템플릿을 적용할까요?')) return
    if (!window.confirm(`${ROLE_LABEL[templateRole]} 템플릿을 현재 계정에 적용할까요?`)) return
    templateMutation.mutate()
  }, [dirtyKeys.size, selectedAccountId, templateMutation, templateRole])

  const copySelectedAccount = useCallback(() => {
    if (!selectedAccountId || !copySourceAccountId) return
    if (dirtyKeys.size > 0 && !window.confirm('미저장 변경을 버리고 다른 계정 권한을 복사할까요?')) return
    copyMutation.mutate()
  }, [copyMutation, copySourceAccountId, dirtyKeys.size, selectedAccountId])

  if (accountsQuery.isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spinner />
      </div>
    )
  }

  if (accountsQuery.isError) {
    return (
      <div style={{ padding: 48, color: 'var(--color-danger-600)' }}>
        계정 목록을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.
      </div>
    )
  }

  return (
    <div style={{ padding: '0 4px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>권한설정</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-neutral-500)' }}>
            계정별 페이지 권한을 7개 액션 단위로 관리합니다.
          </p>
        </div>
        {selectedAccount && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Badge variant="brand">{ROLE_LABEL[selectedAccount.role] ?? selectedAccount.role}</Badge>
            <span style={{ fontSize: 13 }}>{selectedAccount.displayName}</span>
          </div>
        )}
      </div>

      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
          padding: 10,
          marginBottom: 10,
          border: '1px solid var(--color-neutral-200)',
          borderRadius: 8,
          background: 'var(--color-neutral-0)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <select
          data-testid="perm-matrix-account-select"
          aria-label="권한을 편집할 계정"
          value={selectedAccountId}
          onChange={(event) => changeAccount(event.target.value)}
          style={{ ...matrixSelectStyle, minWidth: 220 }}
        >
          {(accountsQuery.data ?? []).map((account) => (
            <option key={account.id} value={account.id}>
              {accountOptionLabel(account)}
            </option>
          ))}
        </select>

        <select
          aria-label="적용할 역할 템플릿"
          value={templateRole}
          onChange={(event) => setTemplateRole(event.target.value as RbacRole)}
          style={{ ...matrixSelectStyle, minWidth: 150 }}
        >
          {Object.keys(ROLE_LABEL).map((role) => (
            <option key={role} value={role}>
              {ROLE_LABEL[role as RbacRole]}
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          onClick={applySelectedTemplate}
          disabled={!selectedAccountId || templateMutation.isPending}
          data-testid="perm-matrix-apply-template"
        >
          템플릿 적용
        </Button>

        <Button
          variant="ghost"
          onClick={() => setAllPages(true)}
          disabled={!currentState}
        >
          전체ON
        </Button>
        <Button
          variant="ghost"
          onClick={() => setAllPages(false)}
          disabled={!currentState}
        >
          전체OFF
        </Button>

        <select
          aria-label="복사할 원본 계정"
          value={copySourceAccountId}
          onChange={(event) => setCopySourceAccountId(event.target.value)}
          style={{ ...matrixSelectStyle, minWidth: 190 }}
        >
          <option value="">다른 계정 선택</option>
          {(accountsQuery.data ?? [])
            .filter((account) => account.id !== selectedAccountId)
            .map((account) => (
              <option key={account.id} value={account.id}>
                {accountOptionLabel(account)}
              </option>
            ))}
        </select>
        <Button
          variant="secondary"
          onClick={copySelectedAccount}
          disabled={!selectedAccountId || !copySourceAccountId || copyMutation.isPending}
          data-testid="perm-matrix-copy-account"
        >
          다른 계정 복사
        </Button>

        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="페이지 검색"
          aria-label="페이지 검색"
          style={{
            height: 34,
            width: 220,
            border: '1px solid var(--color-neutral-300)',
            borderRadius: 6,
            padding: '0 10px',
            fontSize: 13,
          }}
        />
      </div>

      {matrixQuery.isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Spinner />
        </div>
      )}

      {matrixQuery.isError && (
        <div style={{ padding: 24, color: 'var(--color-danger-600)' }}>
          계정 권한설정을 불러오지 못했습니다.
        </div>
      )}

      {!matrixQuery.isLoading && !matrixQuery.isError && currentState && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 160px', gap: 12 }}>
          <div
            data-testid="permission-matrix-table"
            style={{
              overflow: 'auto',
              maxHeight: 'calc(100vh - 230px)',
              border: '1px solid var(--color-neutral-200)',
              borderRadius: 8,
              background: 'var(--color-neutral-0)',
            }}
          >
            <div
              aria-label="권한 액션 색상 범례"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                alignItems: 'center',
                padding: '8px 10px',
                borderBottom: '1px solid var(--color-neutral-200)',
                background: 'var(--color-neutral-50)',
                color: 'var(--color-neutral-700)',
                fontSize: 11,
              }}
            >
              {MATRIX_LEGEND_ITEMS.map((item) => (
                <span key={item.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: item.color,
                    }}
                  />
                  <span style={{ fontWeight: 700 }}>{item.label}</span>
                  <span>{item.actions}</span>
                </span>
              ))}
            </div>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 980, fontSize: 12 }}>
              <colgroup>
                <col style={{ width: 300 }} />
                {PERMISSION_ACTIONS.map((action) => (
                  <col key={action} style={{ width: 88, ...matrixActionSeparatorStyle(action) }} />
                ))}
                <col style={{ width: 74 }} />
              </colgroup>
              <thead style={{ position: 'sticky', top: 0, zIndex: 30 }}>
                <tr>
                  <th style={matrixHeaderStyle('left')}>페이지 ({visiblePages.length})</th>
                  {PERMISSION_ACTIONS.map((action) => (
                    <th key={action} style={{ ...matrixHeaderStyle('center'), ...matrixActionSeparatorStyle(action) }}>
                      <button
                        type="button"
                        data-testid={`perm-matrix-col-all-${action}`}
                        onClick={() => toggleColumn(action)}
                        style={matrixActionButtonStyle(action)}
                        title={`${MATRIX_ACTION_META[action].groupLabel} 권한`}
                        aria-label={`${MATRIX_ACTION_LABEL[action]} 권한 전체 페이지 일괄 토글`}
                      >
                        {MATRIX_ACTION_LABEL[action]}
                      </button>
                    </th>
                  ))}
                  <th style={matrixHeaderStyle('center')}>행전체</th>
                </tr>
              </thead>
              <tbody>
                {visibleGroups.length === 0 && (
                  <tr>
                    <td
                      colSpan={PERMISSION_ACTIONS.length + 2}
                      style={{
                        padding: 24,
                        textAlign: 'center',
                        color: 'var(--color-neutral-500)',
                        borderBottom: '1px solid var(--color-neutral-200)',
                      }}
                    >
                      검색 결과가 없습니다.
                    </td>
                  </tr>
                )}
                {visibleGroups.map((group) => {
                  const domainId = MATRIX_DOMAIN_ID_BY_LABEL[group.label] ?? group.label
                  return (
                    <AccountMatrixDomainRows
                      key={group.label}
                      group={group}
                      domainId={domainId}
                      currentState={currentState}
                      dirtyKeys={dirtyKeys}
                      onCellToggle={toggleCell}
                      onRowToggle={toggleRow}
                      onDomainSet={(allowed) => {
                        if (!window.confirm(`${group.label} ${group.pages.length}개 페이지의 모든 권한을 ${allowed ? 'ON' : 'OFF'} 처리할까요?`)) {
                          return
                        }
                        setPageActions(group.pages, PERMISSION_ACTIONS, allowed)
                      }}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>

          <aside
            style={{
              position: 'sticky',
              top: 70,
              alignSelf: 'start',
              border: '1px solid var(--color-neutral-200)',
              borderRadius: 8,
              padding: 12,
              background: dirtyKeys.size > 0 ? 'var(--color-warning-50)' : 'var(--color-neutral-50)',
            }}
          >
            <div
              data-testid="perm-matrix-change-count"
              role="status"
              aria-live="polite"
              style={{ fontWeight: 700, marginBottom: 10, color: 'var(--color-neutral-900)' }}
            >
              변경 {dirtyKeys.size}건
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Button
                variant="primary"
                onClick={saveChanges}
                disabled={dirtyKeys.size === 0 || saveMutation.isPending}
                data-testid="perm-matrix-save-btn"
              >
                {saveMutation.isPending ? '저장 중' : '저장'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setEditState(null)}
                disabled={dirtyKeys.size === 0 || saveMutation.isPending}
              >
                취소
              </Button>
            </div>
          </aside>
        </div>
      )}

      {toast && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            position: 'fixed',
            right: 24,
            bottom: 24,
            zIndex: 100,
            borderRadius: 8,
            padding: '10px 14px',
            background: toast.type === 'success' ? 'var(--color-success-600)' : 'var(--color-danger-600)',
            color: 'var(--color-neutral-0)',
            boxShadow: 'var(--shadow-lg)',
            fontSize: 13,
          }}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}

function AccountMatrixDomainRows({
  group,
  domainId,
  currentState,
  dirtyKeys,
  onCellToggle,
  onRowToggle,
  onDomainSet,
}: {
  group: PageGroup
  domainId: string
  currentState: AccountMatrixState
  dirtyKeys: Set<AccountDirtyKey>
  onCellToggle: (page: PageCode, action: PermissionAction) => void
  onRowToggle: (page: PageCode) => void
  onDomainSet: (allowed: boolean) => void
}) {
  return (
    <>
      <tr>
        <td
          colSpan={PERMISSION_ACTIONS.length + 2}
          style={{
            padding: '7px 10px',
            background: 'var(--color-brand-50)',
            borderTop: '1px solid var(--color-brand-200)',
            borderBottom: '1px solid var(--color-brand-200)',
            color: 'var(--color-brand-700)',
            fontWeight: 700,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span>{group.label} ({group.pages.length})</span>
            <span style={{ display: 'inline-flex', gap: 6 }}>
              <button
                type="button"
                data-testid={`perm-matrix-domain-all-${domainId}`}
                onClick={() => onDomainSet(true)}
                style={matrixButtonStyle}
                aria-label={`${group.label} 전체 ${group.pages.length}개 페이지 권한 ON`}
              >
                전체ON
              </button>
              <button
                type="button"
                data-testid={`perm-matrix-domain-all-${domainId}-off`}
                onClick={() => onDomainSet(false)}
                style={matrixButtonStyle}
                aria-label={`${group.label} 전체 ${group.pages.length}개 페이지 권한 OFF`}
              >
                전체OFF
              </button>
            </span>
          </div>
        </td>
      </tr>
      {group.pages.map((page) => (
        <tr key={page}>
          <th
            scope="row"
            style={{
              position: 'sticky',
              left: 0,
              zIndex: 10,
              padding: '7px 10px',
              textAlign: 'left',
              background: 'var(--color-neutral-0)',
              borderBottom: '1px solid var(--color-neutral-200)',
              fontWeight: 600,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>{PAGE_LABEL[page] ?? page}</span>
              <span style={{ color: 'var(--color-neutral-500)', fontSize: 11, fontWeight: 400 }}>{page}</span>
            </div>
          </th>
          {PERMISSION_ACTIONS.map((action) => {
            const dirty = dirtyKeys.has(matrixDirtyKey(page, action))
            return (
              <td
                key={action}
                style={matrixActionCellStyle(action, dirty)}
              >
                <input
                  type="checkbox"
                  data-testid={`perm-matrix-cell-${matrixPageNorm(page)}-${action}`}
                  checked={currentState[page]?.[action] ?? false}
                  onChange={() => onCellToggle(page, action)}
                  style={matrixActionCheckboxStyle(action)}
                  aria-label={`${PAGE_LABEL[page] ?? page} ${MATRIX_ACTION_LABEL[action]}`}
                />
              </td>
            )
          })}
          <td
            style={{
              textAlign: 'center',
              borderBottom: '1px solid var(--color-neutral-200)',
              background: 'var(--color-neutral-0)',
            }}
          >
            <button
              type="button"
              data-testid={`perm-matrix-row-all-${matrixPageNorm(page)}`}
              onClick={() => onRowToggle(page)}
              style={matrixButtonStyle}
              aria-label={`${PAGE_LABEL[page] ?? page} 행 7개 권한 일괄 토글`}
            >
              전부
            </button>
          </td>
        </tr>
      ))}
    </>
  )
}

function matrixHeaderStyle(align: 'left' | 'center'): React.CSSProperties {
  return {
    position: 'sticky',
    top: 0,
    zIndex: 30,
    padding: '8px 10px',
    textAlign: align,
    background: 'var(--color-neutral-50)',
    borderBottom: '1px solid var(--color-neutral-300)',
    color: 'var(--color-neutral-700)',
    fontWeight: 700,
  }
}

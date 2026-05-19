package com.samhanair.logis.auth.domain;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 동적 RBAC 에서 관리하는 페이지 코드 열거형.
 *
 * <p>dot-separated 계층 구조 규칙:
 * <pre>
 *   {도메인}.{기능}.{액션?}
 *   예) accounting.tax-invoice.emit-nts
 * </pre>
 *
 * <p>SP-D2/D3 에서 전체 121개 페이지로 점진 확장 예정.
 * 신규 페이지 추가 시:
 * <ol>
 *   <li>이 enum 에 상수 추가</li>
 *   <li>Flyway V8+ 마이그레이션으로 신규 seed row 추가</li>
 * </ol>
 *
 * <p>SP-D1 초기 12개 페이지 등록 (Phase 9 vendor 4 + 회계 5 + 매입 2 + admin 1).
 * <p>SP-D2 회계 카테고리 7개 추가 (accounts / journals / balances / reports / period-close / statement-batch / partner-ledger) — 총 19개.
 * <p>SP-D4 잔여 7 도메인 22개 추가 (견적 / 거래처주문 / 재고 / 직원 / 거래처 / 상품 / 아로로지스) — 총 41개.
 */
@Getter
@RequiredArgsConstructor
public enum PageCode {

    // ---- 회계 (accounting) ----

    /** NTS 홈택스 e-Tax 세금계산서 실 발행 (SP-09-1). */
    ACCOUNTING_TAX_INVOICE_EMIT_NTS("accounting.tax-invoice.emit-nts", "세금계산서 NTS 발행"),

    /** 세금계산서 목록 조회 화면. */
    ACCOUNTING_TAX_INVOICE_LIST("accounting.tax-invoice.list", "세금계산서 목록"),

    /** KFTC 오픈뱅킹 입금 매칭 화면 (SP-09-4). */
    ACCOUNTING_DEPOSIT_MATCH("accounting.deposit-match", "입금 매칭"),

    /** 일마감 화면. */
    ACCOUNTING_DAILY_CLOSING("accounting.daily-closing", "일마감"),

    /** 원장(총계정원장) 조회 화면. */
    ACCOUNTING_GENERAL_LEDGER("accounting.general-ledger", "원장"),

    /** 계정과목 트리 조회 화면 (SP-D2). */
    ACCOUNTING_ACCOUNTS("accounting.accounts", "계정과목"),

    /** 분개장 목록/작성/상세 화면 (SP-D2). */
    ACCOUNTING_JOURNALS("accounting.journals", "분개장"),

    /** 시산표 조회 화면 (SP-D2). */
    ACCOUNTING_BALANCES("accounting.balances", "시산표"),

    /** 재무 보고서 (손익/재무상태/부가세/법인세/거래처/현금/자본/일계/월계) (SP-D2). */
    ACCOUNTING_REPORTS("accounting.reports", "재무 보고서"),

    /** 월말 마감 화면 (SP-D2). */
    ACCOUNTING_PERIOD_CLOSE("accounting.period-close", "월말 마감"),

    /** 거래명세서 일괄 화면 (SP-D2). */
    ACCOUNTING_STATEMENT_BATCH("accounting.statement-batch", "거래명세서 일괄"),

    /** 거래처 원장 / 홈택스 일괄 양식 / 사업자 양식 화면 (SP-D2). */
    ACCOUNTING_PARTNER_LEDGER("accounting.partner-ledger", "거래처 원장"),

    // ---- 알림 / SMS (notification) ----

    /** Aligo SMS 발송 이력 화면 (SP-09-2). */
    NOTIFICATION_DISPATCH_SMS_SEND_AUDIT("notification.dispatch-sms.send-audit", "배차 SMS 발송 이력"),

    // ---- 매입 (purchases) ----

    /** Naver Clova OCR 영수증 발급 화면 (SP-09-3). */
    PURCHASES_RECEIPT_OCR("purchases.receipt-ocr", "영수증 OCR"),

    /** 매입 슬립 목록 화면. */
    PURCHASES_SLIP_LIST("purchases.slip.list", "매입 슬립 목록"),

    // ---- 매출 (sales) ----

    /** 매출 슬립 목록 화면. */
    SALES_SLIP_LIST("sales.slip.list", "매출 슬립 목록"),

    // ---- 입고 (inbound) ----

    /** 입고 검수 화면. */
    INBOUND_INSPECTION("inbound.inspection", "입고 검수"),

    // ---- 배차 (dispatch) ----

    /** 배차 보드 화면. */
    DISPATCH_BOARD("dispatch.board", "배차 보드"),

    // ---- 관리 (admin) ----

    /** 동적 RBAC 권한 관리 화면 — MASTER 전용. */
    ADMIN_PERMISSIONS("admin.permissions", "권한 관리"),

    // ---- 견적 (estimate) ----

    /** 견적 목록/상세/작성/수정 화면 (SP-D4) — slip-service EstimateController. */
    ESTIMATES_LIST("estimates.list", "견적 목록"),

    // ---- 거래처주문 (sales partner-order) ----

    /** 거래처 주문 목록 화면 (SP-D4) — partner-order-service PartnerOrderListController. */
    SALES_PARTNER_ORDER_LIST("sales.partner-order.list", "거래처주문 목록"),

    /** 거래처 주문 작성/임시저장/수정/삭제/견적→주문 화면 (SP-D4). */
    SALES_PARTNER_ORDER_DRAFT("sales.partner-order.draft", "거래처주문 작성"),

    /** 주문 확정/편집요청 화면 (SP-D4). */
    SALES_PARTNER_ORDER_CONFIRM("sales.partner-order.confirm", "주문 확정"),

    /** 주문 이력/감사로그 화면 (SP-D4). */
    SALES_PARTNER_ORDER_HISTORY("sales.partner-order.history", "주문 이력"),

    /** 주문서 인쇄 화면 (SP-D4). */
    SALES_PARTNER_ORDER_PRINT("sales.partner-order.print", "주문서 인쇄"),

    /** 벤더(외주) 발주서 업로드/확정 화면 (SP-D4) — VendorOrderController. */
    SALES_VENDOR_ORDER("sales.vendor-order", "벤더(외주) 주문"),

    // ---- 재고 (inventory) ----

    /** 창고 관리 화면 (SP-D4) — inventory-service WarehouseController. */
    INVENTORY_WAREHOUSE("inventory.warehouse", "창고 관리"),

    /** 재고 현황/안전재고 화면 (SP-D4) — StockController / SafetyStockController. */
    INVENTORY_STOCK("inventory.stock", "재고 현황"),

    /** 재고 이동 화면 (SP-D4) — StockTransferController. */
    INVENTORY_STOCK_TRANSFER("inventory.stock-transfer", "재고 이동"),

    /** DPS 비교/저장이력 화면 (SP-D4) — DpsCompareController / DpsSaveHistoryController. */
    INVENTORY_DPS("inventory.dps", "DPS 비교/이력"),

    /** 재고 감사 화면 (SP-D4) — InventoryAuditController. */
    INVENTORY_AUDIT("inventory.audit", "재고 감사"),

    // ---- 직원 관리 (admin employees) ----

    /** 직원 관리 화면 (SP-D4) — user-service EmployeeController. */
    ADMIN_EMPLOYEES("admin.employees", "직원 관리"),

    /** 계정(사용자) 관리 화면 (SP-D4) — user-service AdminUserController. */
    ADMIN_USERS("admin.users", "계정 관리"),

    // ---- 거래처 (partners) ----

    /** 거래처 목록 화면 (SP-D4) — partner-service PartnerAdminController. */
    PARTNERS_LIST("partners.list", "거래처 목록"),

    /** 거래처 4탭 상세 화면 (SP-D4) — Partner4TabController. */
    PARTNERS_DETAIL("partners.detail", "거래처 4탭 상세"),

    /** 거래처 차단 관리 화면 (SP-D4) — PartnerBlockAdminController. */
    PARTNERS_BLOCK("partners.block", "거래처 차단"),

    /** 거래처 편집 결재/목록/승인 화면 (SP-D4) — PartnerEditRequestController. */
    PARTNERS_EDIT_REQUEST("partners.edit-request", "거래처 편집 결재"),

    // ---- 상품 (products) ----

    /** 상품 목록 화면 (SP-D4) — product-service ProductController. */
    PRODUCTS_LIST("products.list", "상품 목록"),

    /** 상품 관리(카테고리 편집) 화면 (SP-D4) — CategoryController. */
    PRODUCTS_ADMIN("products.admin", "상품 관리"),

    // ---- 아로로지스 (arologis) ----

    /** 아로로지스 배차 관리 화면 (SP-D4) — arologis-service ArologisAdminController. */
    AROLOGIS_ADMIN("arologis.admin", "아로로지스 배차 관리"),

    /** 아로로지스 지역/구역 관리 화면 (SP-D4) — RegionAdminController. */
    AROLOGIS_REGION("arologis.region", "아로로지스 지역/구역 관리"),

    /** SAS 매출전표 목록 화면 (SP-SAS-1). */
    ACCOUNTING_SALES_SLIP_LIST("accounting.sales-slip.list", "매출전표(회계분개)"),

    /** SAS 매입전표 목록 화면 (SP-SAS-2). */
    ACCOUNTING_PURCHASE_SLIP_LIST("accounting.purchase-slip.list", "매입전표(회계분개)");

    /** DB + API 에서 사용하는 식별 코드. */
    private final String code;

    /** 사용자 화면 표시용 한국어 명칭. */
    private final String displayName;

    /**
     * 문자열 코드로 {@link PageCode} 조회.
     *
     * @param code dot-separated 페이지 코드
     * @return 해당 PageCode
     * @throws IllegalArgumentException 미등록 코드인 경우
     */
    public static PageCode fromCode(String code) {
        for (PageCode pc : values()) {
            if (pc.code.equals(code)) {
                return pc;
            }
        }
        throw new IllegalArgumentException("등록되지 않은 페이지 코드입니다: " + code);
    }

    /**
     * 문자열 코드가 등록된 PageCode 인지 확인.
     *
     * @param code dot-separated 페이지 코드
     * @return 등록된 코드이면 {@code true}
     */
    public static boolean isValid(String code) {
        for (PageCode pc : values()) {
            if (pc.code.equals(code)) {
                return true;
            }
        }
        return false;
    }
}

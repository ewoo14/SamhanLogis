package com.samhanair.logis.common.exception;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

/** Canonical error catalogue mapped to HTTP status + Korean default messages. */
@Getter
@RequiredArgsConstructor
public enum ErrorCode {
    INVALID_INPUT(HttpStatus.BAD_REQUEST, "잘못된 요청입니다."),
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "인증이 필요합니다."),
    FORBIDDEN(HttpStatus.FORBIDDEN, "접근 권한이 없습니다."),
    NOT_FOUND(HttpStatus.NOT_FOUND, "요청한 리소스를 찾을 수 없습니다."),
    CONFLICT(HttpStatus.CONFLICT, "리소스 상태가 충돌합니다."),
    UNPROCESSABLE_ENTITY(HttpStatus.UNPROCESSABLE_ENTITY, "처리할 수 없는 요청입니다."),
    DISPATCH_HISTORY_PAYLOAD_TOO_LARGE(HttpStatus.UNPROCESSABLE_ENTITY, "배차 저장내역 payload 가 너무 큽니다."),
    SLIP_CLEANUP_HISTORY_NOT_FOUND(HttpStatus.NOT_FOUND,
            "전표정리 저장내역을 찾을 수 없습니다."),
    SLIP_CLEANUP_HISTORY_PAYLOAD_TOO_LARGE(HttpStatus.UNPROCESSABLE_ENTITY,
            "전표정리 저장내역 payload 가 너무 큽니다."),
    DISPATCH_SMS_HISTORY_NOT_FOUND(HttpStatus.NOT_FOUND,
            "배차문자 저장내역을 찾을 수 없습니다."),
    DISPATCH_SMS_HISTORY_PAYLOAD_TOO_LARGE(HttpStatus.UNPROCESSABLE_ENTITY,
            "배차문자 저장내역 payload 가 너무 큽니다."),
    PARTNER_ORDER_NOT_FOUND(HttpStatus.NOT_FOUND,
            "주문서를 찾을 수 없습니다."),
    PARTNER_ORDER_OPTIMISTIC_LOCK_CONFLICT(HttpStatus.CONFLICT,
            "주문서가 이미 변경되었습니다. 최신 내용으로 다시 확인해 주세요."),
    PARTNER_ORDER_UPDATE_INVALID_LINE(HttpStatus.UNPROCESSABLE_ENTITY,
            "주문 라인 입력값이 올바르지 않습니다."),
    PARTNER_ORDER_DELETE_FORBIDDEN_STATUS(HttpStatus.UNPROCESSABLE_ENTITY,
            "현재 상태에서는 주문서를 삭제할 수 없습니다."),
    SLIP_OPTIMISTIC_LOCK_CONFLICT(HttpStatus.CONFLICT,
            "전표가 이미 변경되었습니다. 최신 내용으로 다시 확인해 주세요."),
    SLIP_UPDATE_INVALID_LINE(HttpStatus.UNPROCESSABLE_ENTITY,
            "전표 라인 입력값이 올바르지 않습니다."),
    /**
     * 매입 전표 삭제 불가 — 검수/처리 진행 중이거나 완료된 전표는 삭제할 수 없습니다.
     * DRAFT/SAVED 상태만 삭제 허용 (운영 정책).
     */
    SLIP_DELETE_INSPECTION_COMPLETED(HttpStatus.UNPROCESSABLE_ENTITY,
            "검수 진행 중이거나 완료된 매입 전표는 삭제할 수 없습니다."),
    /**
     * 매입 전표 삭제 불가 — slipType 이 INBOUND 가 아닌 전표에 매입 삭제 endpoint 호출.
     */
    SLIP_DELETE_NON_INBOUND(HttpStatus.FORBIDDEN,
            "매입 전표만 삭제할 수 있습니다."),
    /**
     * 매출 전표 수정 불가 — slipType 이 OUTBOUND 가 아닌 전표에 매출 수정 endpoint 호출.
     */
    SLIP_UPDATE_NON_SALES(HttpStatus.FORBIDDEN,
            "매출 전표만 직접 수정할 수 있습니다."),
    /**
     * 매출 전표 삭제 불가 — 출고 진행 중이거나 완료된 전표는 삭제할 수 없습니다.
     * DRAFT/SAVED 상태만 삭제 허용 (운영 정책).
     */
    SLIP_DELETE_SALES_SHIPPED(HttpStatus.UNPROCESSABLE_ENTITY,
            "출고 진행 중이거나 완료된 매출 전표는 삭제할 수 없습니다."),
    /**
     * 매출 전표 삭제 불가 — slipType 이 OUTBOUND 가 아닌 전표에 매출 삭제 endpoint 호출.
     */
    SLIP_DELETE_NON_SALES(HttpStatus.FORBIDDEN,
            "매출 전표만 삭제할 수 있습니다."),
    PARTNER_ORDER_FROM_ESTIMATE_NOT_FOUND(HttpStatus.NOT_FOUND,
            "변환할 견적을 찾을 수 없습니다."),
    PARTNER_ORDER_FROM_ESTIMATE_ALREADY_CONVERTED(HttpStatus.CONFLICT,
            "이미 주문으로 변환된 견적입니다."),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "서버 내부 오류가 발생했습니다."),
    /**
     * 도메인 specific — product-service 의 modelCode/UUID 조회 미존재.
     * Phase 7 종합 TM 신규 — generic NOT_FOUND + 문자열 메시지 패턴은 클라이언트 분기/모니터링 필터에서
     * 도메인 식별이 어려우므로 product 전용 코드를 분리. HTTP 404 동일.
     */
    PRODUCT_NOT_FOUND(HttpStatus.NOT_FOUND, "해당 코드의 제품을 찾을 수 없습니다."),
    /**
     * 요청 횟수 초과 — rate-limit 적용 endpoint 에서 허용 한도 초과 시 HTTP 429 반환.
     * P0-2 비밀번호 재설정 endpoint (request/confirm) 브루트포스 방지용.
     */
    TOO_MANY_REQUESTS(HttpStatus.TOO_MANY_REQUESTS, "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."),
    /**
     * 세금계산서 e-Tax 실 발행 불가 — ISSUED 상태가 아닌 세금계산서에 emit-nts 호출.
     * DRAFT 또는 CANCELLED 상태일 때 422 반환 (SP-09-1).
     */
    TAX_INVOICE_NOT_EMITTABLE(HttpStatus.UNPROCESSABLE_ENTITY,
            "발행(ISSUED) 상태의 세금계산서만 e-Tax 전송할 수 있습니다."),
    /**
     * 세금계산서 e-Tax 중복 발행 — 이미 eTaxExternalId 가 설정된 세금계산서에 emit-nts 재호출.
     * 409 반환 (SP-09-1).
     */
    TAX_INVOICE_ALREADY_EMITTED(HttpStatus.CONFLICT,
            "이미 e-Tax 전송된 세금계산서입니다."),
    /**
     * e-Tax 외부 API 호출 실패 — NTS 홈택스 API 응답 오류 시 502 반환 (SP-09-1).
     */
    ETAX_SUBMIT_FAILED(HttpStatus.BAD_GATEWAY,
            "e-Tax 전송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."),
    /**
     * Clova OCR API 호출 실패 — Naver Clova OCR 응답 오류 또는 placeholder 키 차단 시 502 반환 (SP-09-3).
     */
    OCR_SUBMIT_FAILED(HttpStatus.BAD_GATEWAY,
            "OCR 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."),
    /**
     * 영수증 파일 유효성 오류 — 빈 파일, 10MB 초과, 비지원 포맷(jpg/png/jpeg 외) 시 422 반환 (SP-09-3).
     */
    RECEIPT_FILE_INVALID(HttpStatus.UNPROCESSABLE_ENTITY,
            "영수증 파일이 유효하지 않습니다. jpg/png 이미지, 10MB 이하만 허용됩니다."),
    /**
     * KFTC 오픈뱅킹 API 호출 실패 — API 키 미설정, placeholder 사용, 또는 실 API 오류 시 502 반환 (SP-09-4).
     */
    KFTC_SUBMIT_FAILED(HttpStatus.BAD_GATEWAY,
            "KFTC 오픈뱅킹 조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."),
    /**
     * 입금 조회 기간 오류 — from 일자가 to 일자보다 늦을 때 422 반환 (SP-09-4).
     */
    DEPOSIT_DATE_RANGE_INVALID(HttpStatus.UNPROCESSABLE_ENTITY,
            "조회 시작일이 종료일보다 늦을 수 없습니다.");

    private final HttpStatus httpStatus;
    private final String defaultMessage;
}

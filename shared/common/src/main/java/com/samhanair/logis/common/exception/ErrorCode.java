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
    TOO_MANY_REQUESTS(HttpStatus.TOO_MANY_REQUESTS, "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");

    private final HttpStatus httpStatus;
    private final String defaultMessage;
}

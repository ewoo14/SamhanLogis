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
            "조회 시작일이 종료일보다 늦을 수 없습니다."),
    /**
     * 인성데이타 퀵프로그램 API 미설정 또는 placeholder 사용 — 실 API 키 미주입 시 502 반환 (SP-10-2).
     *
     * <p>blank / 6 placeholder 키워드 ({@code PLACEHOLDER_DEV_ONLY} / {@code CHANGE_ME_LOCAL_ONLY} /
     * {@code changeme} / {@code dummy} / {@code placeholder}) 차단.
     */
    INSUNG_QUICK_NOT_CONFIGURED(HttpStatus.BAD_GATEWAY,
            "인성데이타 퀵프로그램 API 키가 설정되지 않았습니다. 환경변수를 확인해주세요."),
    /**
     * 인성데이타 퀵프로그램 외부 API 호출 실패 — 5xx/network 런타임 오류 시 502 반환 (SP-10-2).
     */
    INSUNG_QUICK_SUBMIT_FAILED(HttpStatus.BAD_GATEWAY,
            "인성데이타 퀵프로그램 전송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."),
    /**
     * 출고/입고전표를 찾을 수 없음 (SAS 슬라이스, 출고→매출 자동화 워크플로우).
     */
    SAS_SOURCE_SLIP_NOT_FOUND(HttpStatus.NOT_FOUND,
            "출고/입고전표를 찾을 수 없습니다."),
    /**
     * 출고/입고전표가 CONFIRMED 상태가 아님 (SAS 슬라이스).
     */
    SAS_SOURCE_SLIP_NOT_CONFIRMED(HttpStatus.UNPROCESSABLE_ENTITY,
            "출고/입고전표가 CONFIRMED 상태가 아닙니다."),
    /**
     * source 전표 유형 불일치 — 매출은 OUTBOUND, 매입은 INBOUND 만 허용 (SAS 슬라이스).
     */
    SAS_SOURCE_SLIP_TYPE_MISMATCH(HttpStatus.UNPROCESSABLE_ENTITY,
            "source 전표 유형이 잘못되었습니다 (매출=OUTBOUND, 매입=INBOUND 만 허용)"),
    /**
     * 할당 합계가 출고/입고전표 line 잔여를 초과 (SAS 슬라이스).
     */
    SAS_OVER_ALLOCATION(HttpStatus.UNPROCESSABLE_ENTITY,
            "할당 합계가 출고/입고전표 line 잔여를 초과합니다."),
    /**
     * line 의 공급가액+부가세가 line_total 과 다름 (SAS 슬라이스).
     */
    SAS_LINE_AMOUNT_MISMATCH(HttpStatus.UNPROCESSABLE_ENTITY,
            "line 의 공급가액+부가세가 line_total 과 다릅니다."),
    /**
     * 단일 매출/매입전표 내 line 단위 tax_type 혼합 금지 (SAS 슬라이스).
     */
    SAS_TAX_TYPE_MIXED(HttpStatus.UNPROCESSABLE_ENTITY,
            "단일 매출/매입전표 내 line 단위 tax_type 혼합은 금지됩니다."),
    /**
     * 이미 POSTED 된 전표는 수정 불가 (SAS 슬라이스).
     */
    SAS_ALREADY_POSTED(HttpStatus.CONFLICT,
            "이미 POSTED 된 전표는 수정할 수 없습니다."),
    /**
     * 해당 일자 일마감이 잠겨 있음 (SAS 슬라이스).
     */
    SAS_DAILY_CLOSING_LOCKED(HttpStatus.CONFLICT,
            "해당 일자 일마감이 잠겨 있습니다."),
    /**
     * 이미 세금계산서와 매핑된 매출전표 (SAS 슬라이스).
     */
    SAS_TAX_INVOICE_ALREADY_LINKED(HttpStatus.CONFLICT,
            "이미 세금계산서와 매핑된 매출전표입니다."),
    /**
     * 묶음 발행 시 거래처 또는 발행월이 일치하지 않음 (SAS 슬라이스).
     */
    SAS_PARTNER_MONTH_MISMATCH(HttpStatus.UNPROCESSABLE_ENTITY,
            "묶음 발행 시 거래처 또는 발행월이 일치하지 않습니다."),
    /**
     * 매출전표가 POSTED 상태가 아니어서 세금계산서 묶음 발행 불가 (SAS 슬라이스).
     */
    SAS_SALES_SLIP_NOT_POSTED(HttpStatus.UNPROCESSABLE_ENTITY,
            "POSTED 상태 매출전표만 세금계산서 묶음 발행할 수 있습니다."),
    /**
     * 매입전표가 POSTED 상태가 아니어서 수신 세금계산서 매칭 불가 (SAS 슬라이스).
     */
    SAS_PURCHASE_SLIP_NOT_POSTED(HttpStatus.UNPROCESSABLE_ENTITY,
            "POSTED 상태 매입전표만 수신 세금계산서와 매칭할 수 있습니다."),
    /**
     * 매출/매입전표 번호 생성 충돌 — timestamp 기반 PoC 채번 중 slip_no unique 충돌 발생.
     */
    SAS_SLIP_NO_CONFLICT(HttpStatus.CONFLICT,
            "매출/매입전표 번호 충돌 — 재시도 권장"),
    /**
     * MIG-2 이카운트 마스터 CSV 헤더 형식 불일치.
     */
    MIG2_HEADER_MISMATCH(HttpStatus.UNPROCESSABLE_ENTITY,
            "CSV 헤더 형식 불일치"),
    /**
     * MIG-2 이카운트 마스터 CSV 헤더 strict 형식 불일치.
     */
    MIG2_CSV_HEADER_MISMATCH(HttpStatus.UNPROCESSABLE_ENTITY,
            "CSV 헤더 strict 형식 불일치"),
    /**
     * MIG-2 품목명/마스터명 빈값 거부.
     */
    MIG2_ITEM_NAME_NULL(HttpStatus.UNPROCESSABLE_ENTITY,
            "품목명 빈값 거부"),
    /**
     * MIG-2 품목관계의 대표품목코드가 품목 raw 에 없음.
     */
    MIG2_RELATION_ORPHAN(HttpStatus.UNPROCESSABLE_ENTITY,
            "품목관계 main_code 가 raw 에 없음"),
    /**
     * MIG-2 동일 alias_code 가 다른 main 에 매핑되는 충돌.
     */
    MIG2_ALIAS_DUPLICATE(HttpStatus.CONFLICT,
            "동일 alias_code 가 다른 main 에 매핑"),
    /**
     * MIG-2 품목 relation/DB/원천 데이터에서 canonical main 후보를 결정할 수 없음.
     */
    MIG2_NO_MAIN_CANDIDATE(HttpStatus.UNPROCESSABLE_ENTITY,
            "품목 main 후보를 결정할 수 없음"),
    /**
     * MIG-2 business key 원천 코드가 DB 컬럼 폭을 초과함.
     */
    MIG2_CODE_OUT_OF_RANGE(HttpStatus.UNPROCESSABLE_ENTITY,
            "이카운트 코드 길이가 허용 범위를 초과했습니다"),
    /**
     * MIG-2 source file hash 계산 실패.
     */
    MIG2_FILE_HASH_INVALID(HttpStatus.UNPROCESSABLE_ENTITY,
            "파일 hash 계산 실패"),
    MIG3_VOUCHER_NO_DUPLICATE(HttpStatus.CONFLICT,
            "전표번호가 중복되었습니다"),
    MIG3_LOOKUP_MISS(HttpStatus.UNPROCESSABLE_ENTITY,
            "lookup 키 매핑 누락 - 거래처/계정/부서/창고 확인 필요"),
    MIG3_LOOKUP_AMBIGUOUS(HttpStatus.UNPROCESSABLE_ENTITY,
            "lookup 키 다중 매치 - 중복 데이터 정리 필요"),
    MIG3_VOUCHER_NO_INVALID(HttpStatus.UNPROCESSABLE_ENTITY,
            "전표번호 형식 불일치 - yyyy/MM/dd -N 패턴 확인 필요"),
    MIG3_SLIP_AMOUNT_INVALID(HttpStatus.UNPROCESSABLE_ENTITY,
            "전표 금액 형식 불일치 또는 0 이하"),
    MIG3_JOURNAL_BALANCE_MISMATCH(HttpStatus.UNPROCESSABLE_ENTITY,
            "차/대 합계 불일치 - POSTED 전이 차단"),
    MIG3_JOURNAL_LINE_DUPLICATE(HttpStatus.CONFLICT,
            "동일 journal_no/line_no 에 다른 데이터가 존재합니다"),
    MIG3_JOURNAL_GROUP_INVALID(HttpStatus.UNPROCESSABLE_ENTITY,
            "분개 group 내 일부 row 가 reject 되어 전체 group 가 거부되었습니다"),
    MIG3_CSV_HEADER_MISMATCH(HttpStatus.BAD_REQUEST,
            "회계 전표 CSV 헤더 불일치"),
    MIG4_TAX_INVOICE_DUPLICATE(HttpStatus.CONFLICT,
            "동일 source_file 내 세금계산서 중복"),
    MIG4_LOOKUP_MISS(HttpStatus.UNPROCESSABLE_ENTITY,
            "lookup 키 매핑 누락 - 거래처/품목 확인 필요"),
    MIG4_LOOKUP_AMBIGUOUS(HttpStatus.UNPROCESSABLE_ENTITY,
            "거래처명 중복 매칭 - 거래처코드 보강 필요"),
    MIG4_AMOUNT_INVALID(HttpStatus.UNPROCESSABLE_ENTITY,
            "금액 형식 불일치 또는 0 이하"),
    MIG4_DATE_INVALID(HttpStatus.BAD_REQUEST,
            "일자 포맷 불일치 - yyyy/MM/dd 외 포맷"),
    MIG4_SLIP_NO_INVALID(HttpStatus.UNPROCESSABLE_ENTITY,
            "전표번호 또는 회계전표일자-No 포맷 불일치"),
    MIG4_SUMMARY_BALANCE_MISMATCH(HttpStatus.UNPROCESSABLE_ENTITY,
            "매출매입내역 합계 ↔ 도메인 합계 불일치"),
    MIG4_ORDER_STATUS_INVALID(HttpStatus.UNPROCESSABLE_ENTITY,
            "주문서 진행상태 unknown 값"),
    MIG4_CSV_HEADER_MISMATCH(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-4 CSV 헤더 불일치");

    private final HttpStatus httpStatus;
    private final String defaultMessage;
}

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
    TOKEN_EXPIRED(HttpStatus.GONE, "토큰이 만료되었습니다"),
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
    CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT(HttpStatus.CONFLICT,
            "다른 화면에서 가져오기 선택이 변경되었습니다. 최신 선택을 확인한 뒤 다시 저장해 주세요."),
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
    /**
     * 거래처 정체성 확인을 위해 호출한 partner-service가 응답하지 않음.
     * 사용자가 고칠 수 없는 다운스트림 장애를 입력 오류(400)로 오인시키지 않는다.
     */
    PARTNER_IDENTITY_LOOKUP_UNAVAILABLE(HttpStatus.BAD_GATEWAY,
            "거래처 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요."),
    /**
     * 주문 확정에 필요한 서버 가격 계산 결과를 확보하지 못함.
     * 정상가 저장으로 대체하면 미리보기와 다른 금액을 청구할 수 있으므로 503으로 차단한다.
     */
    PRICE_CALCULATION_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE,
            "가격 계산 서버가 응답하지 않아 주문을 확정할 수 없습니다. 잠시 후 다시 시도해 주세요."),
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
            "발행 상태의 세금계산서만 e-Tax 전송할 수 있습니다."),
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
     * KFTC 오픈뱅킹 API 호출 실패 — API 키 미설정, placeholder 사용, 또는 실 API 오류 시 502 반환 (SP-09-4).
     */
    KFTC_SUBMIT_FAILED(HttpStatus.BAD_GATEWAY,
            "KFTC 오픈뱅킹 조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."),
    /**
     * CODEF 은행·카드 거래내역 API 호출 실패 — API 키 미설정, placeholder 사용, 또는 실 API 오류 시 502 반환 (BC1).
     */
    CODEF_SUBMIT_FAILED(HttpStatus.BAD_GATEWAY,
            "금융기관 거래내역 조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."),
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
            "출고/입고전표가 확정 상태가 아닙니다."),
    /**
     * source 전표 유형 불일치 — 매출은 OUTBOUND, 매입은 INBOUND 만 허용 (SAS 슬라이스).
     */
    SAS_SOURCE_SLIP_TYPE_MISMATCH(HttpStatus.UNPROCESSABLE_ENTITY,
            "원천 전표 유형이 잘못되었습니다 (매출=출고, 매입=입고만 허용)."),
    /** 원천 전표의 거래처가 대상 회계전표 거래처와 다름 (SAS #823). */
    SAS_SOURCE_PARTNER_MISMATCH(HttpStatus.UNPROCESSABLE_ENTITY,
            "원천 전표 거래처가 대상 전표 거래처와 일치하지 않습니다."),
    /** 원천 전표에 거래처가 없음 (SAS #823). */
    SAS_SOURCE_PARTNER_MISSING(HttpStatus.UNPROCESSABLE_ENTITY,
            "원천 전표에 거래처가 없습니다."),
    /**
     * 할당 합계가 출고/입고전표 line 잔여를 초과 (SAS 슬라이스).
     */
    SAS_OVER_ALLOCATION(HttpStatus.UNPROCESSABLE_ENTITY,
            "할당 합계가 출고/입고전표 라인 잔여를 초과합니다."),
    /**
     * line 의 공급가액+부가세가 line_total 과 다름 (SAS 슬라이스).
     */
    SAS_LINE_AMOUNT_MISMATCH(HttpStatus.UNPROCESSABLE_ENTITY,
            "라인의 공급가액+부가세가 라인 합계와 다릅니다."),
    /**
     * 단일 매출/매입전표 내 line 단위 tax_type 혼합 금지 (SAS 슬라이스).
     */
    SAS_TAX_TYPE_MIXED(HttpStatus.UNPROCESSABLE_ENTITY,
            "단일 매출/매입전표 내 라인 단위 과세유형 혼합은 금지됩니다."),
    /**
     * 이미 POSTED 된 전표는 수정 불가 (SAS 슬라이스).
     */
    SAS_ALREADY_POSTED(HttpStatus.CONFLICT,
            "이미 반영완료된 전표는 수정할 수 없습니다."),
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
            "반영완료 상태 매출전표만 세금계산서 묶음 발행할 수 있습니다."),
    /**
     * 매입전표가 POSTED 상태가 아니어서 수신 세금계산서 매칭 불가 (SAS 슬라이스).
     */
    SAS_PURCHASE_SLIP_NOT_POSTED(HttpStatus.UNPROCESSABLE_ENTITY,
            "반영완료 상태 매입전표만 수신 세금계산서와 매칭할 수 있습니다."),
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
            "차/대 합계 불일치 - 확정 전환 차단"),
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
            "MIG-4 CSV 헤더 불일치"),
    MIG5_TRANSFER_NO_DUPLICATE(HttpStatus.CONFLICT,
            "동일 source_file 내 transferNo 중복"),
    MIG5_LOOKUP_MISS(HttpStatus.UNPROCESSABLE_ENTITY,
            "lookup 키 매핑 누락 - 거래처/품목/창고 확인 필요"),
    MIG5_WAREHOUSE_LOOKUP_MISS(HttpStatus.UNPROCESSABLE_ENTITY,
            "창고명 lookup miss"),
    MIG5_PRODUCT_LOOKUP_MISS(HttpStatus.UNPROCESSABLE_ENTITY,
            "품목명 lookup miss"),
    MIG5_LOOKUP_AMBIGUOUS(HttpStatus.UNPROCESSABLE_ENTITY,
            "거래처명/창고명/품목명 중복 매칭"),
    MIG5_AMOUNT_INVALID(HttpStatus.UNPROCESSABLE_ENTITY,
            "금액 형식 불일치 또는 음수"),
    MIG5_DATE_INVALID(HttpStatus.BAD_REQUEST,
            "일자 포맷 불일치"),
    MIG5_TRANSACTION_TYPE_INVALID(HttpStatus.UNPROCESSABLE_ENTITY,
            "거래유형 값 불일치 - 지출결의서/입금보고서 외"),
    MIG5_AGING_BALANCE_MISMATCH(HttpStatus.UNPROCESSABLE_ENTITY,
            "Partner aging 잔액 ↔ 누계 합계 불일치"),
    MIG5_CSV_HEADER_MISMATCH(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-5 CSV 헤더 불일치"),
    MIG6_LOOKUP_MISS(HttpStatus.UNPROCESSABLE_ENTITY,
            "lookup 키 매핑 누락 - 계정/부서/사원 확인 필요"),
    MIG6_LOOKUP_AMBIGUOUS(HttpStatus.UNPROCESSABLE_ENTITY,
            "lookup 키 다중 매치 - 중복 데이터 정리 필요"),
    MIG6_EMPLOYEE_CODE_DUPLICATE(HttpStatus.CONFLICT,
            "동일 source_file 내 사원코드 중복"),
    MIG6_BANK_ACCOUNT_CODE_DUPLICATE(HttpStatus.CONFLICT,
            "동일 source_file 내 계좌코드 중복"),
    MIG6_FIXED_ASSET_TYPE_CODE_DUPLICATE(HttpStatus.CONFLICT,
            "동일 source_file 내 고정자산유형코드 중복"),
    MIG6_DATE_INVALID(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-6 일자 포맷 불일치"),
    MIG6_RESIDENT_NUMBER_INVALID(HttpStatus.UNPROCESSABLE_ENTITY,
            "주민등록번호 형식 불일치"),
    MIG6_BOOLEAN_FLAG_INVALID(HttpStatus.UNPROCESSABLE_ENTITY,
            "사용 여부 값 불일치"),
    MIG6_CSV_HEADER_MISMATCH(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-6 CSV 헤더 불일치"),
    MIG7_STAGING_ROW_NOT_FOUND(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-7 변환 대상 staging row 가 없습니다"),
    MIG7_LOOKUP_MISS(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-7 lookup 키 매핑 누락 - 거래처 확인 필요"),
    MIG7_AMOUNT_INVALID(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-7 금액 형식 불일치 또는 0 이하"),
    MIG7_DATE_INVALID(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-7 전표번호 일자 포맷 불일치"),
    MIG7_DUPLICATE_EXTERNAL_REF(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-7 external_ref 도메인 중복"),
    MIG7_KIND_INVALID(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-7 거래유형 값 불일치"),
    MIG8_STAGING_ROW_NOT_FOUND(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-8 변환 대상 staging row 가 없습니다"),
    MIG8_LOOKUP_MISS(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-8 lookup 키 매핑 누락 - 거래처 확인 필요"),
    MIG8_AMOUNT_INVALID(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-8 금액/수량 형식 불일치 또는 0 이하"),
    MIG8_DATE_INVALID(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-8 주문번호/일자 포맷 불일치"),
    MIG8_PROGRESS_STATUS_INVALID(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-8 주문 진행상태 값 불일치"),
    MIG8_SLIP_LINK_MISS(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-8 완료 주문의 SalesAccountingSlip 매칭 실패"),
    MIG8_DUPLICATE_EXTERNAL_REF(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-8 external_ref 도메인 중복"),
    MIG9_CASH_ROW_NOT_FOUND(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-9 Journal 생성 대상 Cash row 가 없습니다"),
    MIG9_DEFAULT_ACCOUNT_MISSING(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-9 기본 ChartOfAccount 계정이 없습니다"),
    MIG9_JOURNAL_DUPLICATE(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-9 Cash Journal source_type/source_ref 중복"),
    MIG9_AGING_REFRESH_FAILED(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-9 Partner aging snapshot refresh 실패"),
    MIG9_CASH_AMOUNT_INVALID(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-9 Cash 금액 형식 불일치 또는 0 이하"),
    MIG10_ORDER_NOT_FOUND(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-10 Employee 연결 대상 주문이 없습니다"),
    MIG10_EMPLOYEE_LOOKUP_MISS(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-10 담당자명과 일치하는 직원이 없습니다"),
    MIG10_EMPLOYEE_AMBIGUOUS(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-10 담당자명과 일치하는 직원이 2명 이상입니다"),
    MIG10_EMPLOYEE_LOOKUP_ERROR(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-10 Employee lookup 호출 실패"),
    MIG10_AGING_VIEW_VERSION_MISMATCH(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-10 Partner aging snapshot view 버전이 올바르지 않습니다"),
    MIG12_INTERNAL_AUTH_MISS(HttpStatus.SERVICE_UNAVAILABLE,
            "내부 서비스 인증 실패 — X-Internal-Token 설정 확인 필요"),
    MIG11_XLSX_PARSE_FAILED(HttpStatus.BAD_REQUEST,
            "MIG-11 XLSX 파싱 실패"),
    MIG11_FILE_HASH_INVALID(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-11 파일 hash 계산 실패"),
    MIG11_HEADER_MISMATCH(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-11 XLSX 헤더 불일치"),
    MIG11_AMOUNT_INVALID(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-11 금액 형식 불일치"),
    MIG11_DATE_INVALID(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-11 일자 포맷 불일치"),
    MIG11_DAILY_CLOSING_MISMATCH(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-11 DailyClosing 합계 불일치"),
    MIG20_SLICE_UNKNOWN(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-20 재import slice 가 허용 목록에 없습니다"),
    MIG20_RAW_DIR_NOT_FOUND(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-20 raw 디렉토리를 찾을 수 없습니다"),
    MIG20_REIMPORT_FAILED(HttpStatus.UNPROCESSABLE_ENTITY,
            "MIG-20 재import 실행 실패");

    private final HttpStatus httpStatus;
    private final String defaultMessage;
}

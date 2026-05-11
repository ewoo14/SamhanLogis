package com.samhanair.logis.accounting.web.dto;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.util.List;

/**
 * 세금계산서 일괄발행 미리보기 요청 DTO.
 *
 * <p>판매조회 기간 + 필터 옵션 → 홈택스 양식 변환 결과 반환.
 */
public record TaxInvoiceBatchPreviewRequest(
        /** 판매조회 시작일 (inclusive). */
        @NotNull LocalDate fromDate,
        /** 판매조회 종료일 (inclusive). */
        @NotNull LocalDate toDate,
        /**
         * 회계반영일자 미전표 제외 여부.
         * {@code true}(기본) = 회계반영일자 없는 슬립 제외, {@code false} = 모든 슬립 포함.
         */
        boolean excludeUnconfirmed,
        /**
         * 추가 제외 거래처 코드 목록 (요청 시점 임시 제외).
         * null 또는 빈 리스트이면 DB 마스터 제외 거래처만 적용.
         */
        List<String> excludePartnerCodes
) {
}

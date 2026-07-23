package com.samhanair.logis.partnerorder.web.dto;

import com.samhanair.logis.partnerorder.domain.PartnerOrderStatus;
import java.time.LocalDate;
import java.util.UUID;

/**
 * 거래처 주문 목록 필터.
 *
 * @param dateFrom 조회 시작일. {@code dateTo} 보다 늦으면 service 에서 자동 교환한다.
 * @param dateTo 조회 종료일. 양 끝 날짜 모두 포함한다.
 * @param partnerId 거래처 코드 또는 사업자번호 부분 검색(기존 목록 검색 계약).
 * @param partnerCode 병합 후보 전용 거래처 코드 정확 검색. {@code partnerId} 와 의미가 다르다.
 * @param partnerIdExact 병합 후보 전용 거래처 UUID 정확 검색. 화면에는 노출하지 않는다.
 * @param status 주문 상태.
 * @param slipPublishStatus 전표 발행 상태. {@code FAILED}는 FAILED_PERMANENT를 의미한다.
 * @param searchKeyword 주문번호, 거래처 코드, 사업자번호, 라인 품목명, 모델명 검색어.
 */
public record PartnerOrderListFilter(
        LocalDate dateFrom,
        LocalDate dateTo,
        String partnerId,
        String partnerCode,
        UUID partnerIdExact,
        PartnerOrderStatus status,
        String slipPublishStatus,
        String searchKeyword
) {
}

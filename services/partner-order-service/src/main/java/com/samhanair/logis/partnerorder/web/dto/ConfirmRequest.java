package com.samhanair.logis.partnerorder.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 주문 확정 요청 (legacy sendOrderFromUi 6074). 일반 라인의 가격은 무시하고 server-side가
 * DC 적용 priceVat를 확정한다. 세트 구성품은 {@code setAllocation=true}일 때만 화면에서
 * 계산한 배분 단가를 미리보기·확정 공통 입력으로 보존한다.
 *
 * @param lines 라인 리스트 (1건 이상)
 * @param deliveryAddress 구조화된 실제 배송주소 (없으면 null 유지, 기존 호출 호환)
 */
public record ConfirmRequest(
        @NotEmpty @Valid List<ConfirmLineRequest> lines,
        @Size(max = 500) String deliveryAddress) {

    /** 기존 라인-only 요청 생성자 호환. */
    public ConfirmRequest(List<ConfirmLineRequest> lines) {
        this(lines, null);
    }
}

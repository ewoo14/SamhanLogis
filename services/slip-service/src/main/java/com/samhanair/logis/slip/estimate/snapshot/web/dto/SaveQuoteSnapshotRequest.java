package com.samhanair.logis.slip.estimate.snapshot.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

/**
 * 종합견적서 JSON 상태 저장·수정 요청.
 *
 * <p>{@code data}는 브라우저의 계산 입력 상태를 JSON 객체로 전달한다. 기존 base64
 * 문자열 요청은 서비스 경계에서 한 번만 JSON으로 복원하여 DB에는 남기지 않는다.
 *
 * @param userEmail 작성자 또는 수정 요청자 이메일
 * @param createdAt 클라이언트 저장시각
 * @param data 계산 재현에 필요한 JSON 상태
 * @param summary 목록 표시용 요약
 * @param supplyAmount 계산 공급가 합계
 * @param vatAmount 계산 부가세 합계
 * @param totalAmount 계산 총액
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record SaveQuoteSnapshotRequest(
        @NotBlank String userEmail,
        String createdAt,
        JsonNode data,
        Summary summary,
        BigDecimal supplyAmount,
        BigDecimal vatAmount,
        BigDecimal totalAmount) {

    /** 목록 표시용 요약. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Summary(String custName) {
    }

    /** 거래처명 또는 null. */
    public String custNameOrNull() {
        return summary == null ? null : summary.custName();
    }
}

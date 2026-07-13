package com.samhanair.logis.product.web.dto;

import com.samhanair.logis.product.service.ProductService;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 회계 라벨 벌크 조회 요청 DTO.
 *
 * <p>#773 후속 회계 마감 검증 N+1 HTTP 제거 경로에서 사용한다. 라벨 단위 해석은 단건
 * {@link LookupByLabelRequest} 와 동일한 fallback 규칙을 공유한다. blank 토큰은 단건과 동일하게
 * batch-level {@code INVALID_INPUT} 으로 실패한다.
 *
 * @param labels 품목명/규격 형태의 회계 라벨 목록. 1~{@link ProductService#LOOKUP_MAX}건,
 *               원소당 최대 200자
 */
public record LookupByLabelBulkRequest(
        @NotEmpty(message = "labels는 필수입니다")
        @Size(max = ProductService.LOOKUP_MAX, message = "labels는 최대 100건입니다")
        List<@NotNull @Size(max = 200, message = "label은 최대 200자입니다") String> labels) {
}

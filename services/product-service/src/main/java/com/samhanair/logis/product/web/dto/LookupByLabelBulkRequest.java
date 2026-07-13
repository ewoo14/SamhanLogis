package com.samhanair.logis.product.web.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 회계 라벨 벌크 조회 요청 — accounting-service #773 일마감 재검증 N+1 HTTP 제거(후속 슬라이스)가 사용.
 *
 * <p>{@link LookupByLabelRequest} 단건과 동일한 3단 fallback(catalogExposedModelCode→alias→
 * unique-LIKE) 판정을 라벨마다 적용하되, 한 번의 HTTP 호출로 여러 라벨을 배치 처리한다. 리스트
 * 상한은 {@code ProductService.LOOKUP_MAX}(100건)와 동일 — 기존 {@link LookupRequest}/
 * {@link LookupByModelCodesRequest} 관례 준용.
 *
 * <p>원소 자체의 blank/토큰추출 실패는 요청 검증(400) 대상이 아니라 서비스 레이어에서 해당
 * 라벨만 개별 {@code NOT_FOUND} 로 소프트 처리한다 — 부분 성공(partial success) 계약이며
 * 기존 {@code applicable-bulk}/{@code fixed-discount-rate-bulk} 철학과 정합한다.
 *
 * @param labels 품목명[규격] 형태의 회계 라인 라벨 목록. 1~100건, 각 원소 최대 200자.
 */
public record LookupByLabelBulkRequest(
        @NotEmpty(message = "labels는 필수입니다")
        @Size(max = 100, message = "labels는 최대 100건입니다")
        List<@Size(max = 200, message = "label은 최대 200자입니다") String> labels) {
}

package com.samhanair.logis.arologis.dto;

import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.domain.DispatchType;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Dispatch 페이징 응답 DTO — P1-5 admin UI backing.
 *
 * <p>UUID 비공개 가드 — dispatchId (admin routing 전용) 만 노출, driver UUID 미포함.
 * 페이지 메타 (totalElements / totalPages / page / size) 포함.
 */
public record DispatchPageResponse(
        List<DispatchSummary> content,
        long totalElements,
        int totalPages,
        int page,
        int size
) {

    /**
     * 배차 요약 1건.
     *
     * @param dispatchId admin routing 용 id (UUID string)
     * @param dispatchDate 배차 도착 일자
     * @param dispatchType 배차 유형 (DAY / NIGHT / EXPRESS)
     * @param vehicleCount 차량 수
     * @param createdAt 생성 일시
     */
    public record DispatchSummary(
            String dispatchId,
            LocalDate dispatchDate,
            DispatchType dispatchType,
            int vehicleCount,
            LocalDateTime createdAt
    ) {
        /** Dispatch entity + vehicleCount 로 요약 생성. */
        public static DispatchSummary from(Dispatch dispatch, int vehicleCount) {
            return new DispatchSummary(
                    dispatch.getId() == null ? null : dispatch.getId().toString(),
                    dispatch.getDispatchDate(),
                    dispatch.getDispatchType(),
                    vehicleCount,
                    dispatch.getCreatedAt());
        }
    }

    /**
     * 페이징 응답 생성.
     *
     * @param content 현재 페이지 배차 요약 리스트
     * @param totalElements 전체 건수
     * @param page 현재 페이지 번호 (0-based)
     * @param size 페이지 크기
     */
    public static DispatchPageResponse of(List<DispatchSummary> content, long totalElements, int page, int size) {
        int totalPages = size > 0 ? (int) Math.ceil((double) totalElements / size) : 0;
        return new DispatchPageResponse(content, totalElements, totalPages, page, size);
    }
}

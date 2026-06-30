package com.samhanair.logis.slip.revision.web.dto;

import java.time.LocalDateTime;
import java.util.List;

/**
 * S2d-1 셀 인라인 레드라인 응답.
 *
 * <p><b>UUID 비공개 가드</b>: 변경 주체 UUID 및 partnerId/productId/warehouseId 같은 내부 식별자는
 * 응답하지 않는다. 값은 S2b 버전이력 fieldChanges 와 같은 formatValue 결과만 담는다.
 *
 * @param anchored 임계 전이 anchor 존재 여부
 * @param fields anchor 이후 실제 변경된 필드/셀 레드라인 목록
 */
public record SlipRedlineResponse(boolean anchored, List<FieldRedline> fields) {

    /**
     * 필드/셀 하나의 누적 변경 체인.
     *
     * @param fieldPath UI 위치 식별 path
     * @param label 사용자 표시 라벨
     * @param layers 오래된 값부터 최신 값까지의 layer. 첫 layer 는 anchor 시점 base 값이다.
     */
    public record FieldRedline(String fieldPath, String label, List<Layer> layers) {
    }

    /**
     * 레드라인 표시 layer.
     *
     * @param value 표시값
     * @param actorName 이 값을 만든 사용자 표시명. base layer 는 null
     * @param actorColor 사용자 색상 hex. base layer 는 null
     * @param changedAt 변경 시각. base layer 는 null
     */
    public record Layer(String value, String actorName, String actorColor, LocalDateTime changedAt) {
    }
}

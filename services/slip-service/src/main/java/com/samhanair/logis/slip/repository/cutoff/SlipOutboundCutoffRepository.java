package com.samhanair.logis.slip.repository.cutoff;

import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.cutoff.SlipOutboundCutoff;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 출고전표 마감시각 마스터 Repository.
 *
 * <p>soft-delete 는 entity {@code @SQLRestriction("is_deleted = false")} 로 기본 제외한다.
 * 게이트 조회({@link #findByDeliveryTagAndActiveTrue}) 는 활성 행만 반환한다.
 */
public interface SlipOutboundCutoffRepository extends JpaRepository<SlipOutboundCutoff, UUID> {

    /**
     * 지정 태그의 활성 마감시각을 조회한다 — 컷오프 게이트 판정용.
     *
     * @param deliveryTag 조회할 배송 태그
     * @return 활성 마감시각 (없으면 empty → 게이트 통과)
     */
    Optional<SlipOutboundCutoff> findByDeliveryTagAndActiveTrue(DeliveryTag deliveryTag);

    /**
     * 지정 태그(활성 + 비활성 모두)의 마감시각을 조회한다 — 태그 중복 검증용.
     *
     * @param deliveryTag 조회할 배송 태그
     * @return 마감시각 row (soft-delete 제외)
     */
    Optional<SlipOutboundCutoff> findByDeliveryTag(DeliveryTag deliveryTag);

    /**
     * 지정 태그의 활성 마감시각이 존재하는지 확인한다 — 중복 생성 방지용.
     *
     * @param deliveryTag 조회할 배송 태그
     * @return 존재 여부
     */
    boolean existsByDeliveryTag(DeliveryTag deliveryTag);

    /**
     * 전체 마감시각 목록을 태그 이름 순으로 반환한다.
     *
     * @return 태그 이름 오름차순 정렬 목록
     */
    List<SlipOutboundCutoff> findAllByOrderByDeliveryTagAsc();
}

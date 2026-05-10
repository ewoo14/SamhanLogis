package com.samhanair.logis.inventory.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 제품별(+창고별) 안전재고 임계값 설정 엔티티 (P1-3).
 *
 * <p>warehouse_id 가 NULL 이면 해당 제품의 전체 창고 합산 기준 임계값으로 해석한다.
 * 특정 창고에 대한 임계값은 warehouse_id 를 지정한다.
 *
 * <p>partial unique index (V7 Flyway) — (product_id, COALESCE(warehouse_id, UUID_ZERO))
 * WHERE is_deleted = false 로 (제품, 창고) 쌍의 중복을 방지한다.
 */
@Entity
@Getter
@Table(name = "safety_stock_configs")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class SafetyStockConfig extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 대상 제품 UUID (product-service logical reference — FK 없음). */
    @Column(name = "product_id", nullable = false)
    private UUID productId;

    /**
     * 대상 창고 UUID. NULL 이면 해당 제품의 전체 창고 합산 기준 임계값.
     * 특정 창고에 대한 임계값은 warehouseId 를 지정한다.
     */
    @Column(name = "warehouse_id")
    private UUID warehouseId;

    /**
     * 안전재고 임계값. 현재 가용 재고(availableQty)가 이 값 이하이면 알림 발생.
     * 0 이상이어야 하며, 도메인 메서드 {@link #updateThreshold(int)} 를 통해서만 변경한다.
     */
    @Column(name = "threshold", nullable = false)
    private int threshold;

    /** 임계값 설정 메모 (선택). */
    @Column(name = "note", length = 500)
    private String note;

    private SafetyStockConfig(UUID productId, UUID warehouseId, int threshold, String note) {
        this.productId = productId;
        this.warehouseId = warehouseId;
        this.threshold = threshold;
        this.note = note;
    }

    /**
     * 신규 안전재고 임계값 설정을 생성한다.
     *
     * @param productId   대상 제품 UUID (필수)
     * @param warehouseId 대상 창고 UUID (null = 전체 창고 합산 기준)
     * @param threshold   임계값 (0 이상)
     * @param note        메모 (선택)
     * @return 영속화 전 SafetyStockConfig 인스턴스
     * @throws IllegalArgumentException threshold 가 0 미만일 때
     */
    public static SafetyStockConfig create(UUID productId, UUID warehouseId,
                                           int threshold, String note) {
        validateThreshold(threshold);
        return new SafetyStockConfig(productId, warehouseId, threshold, note);
    }

    /**
     * 안전재고 임계값을 갱신한다.
     *
     * @param newThreshold 새 임계값 (0 이상)
     * @throws IllegalArgumentException newThreshold 가 0 미만일 때
     */
    public void updateThreshold(int newThreshold) {
        validateThreshold(newThreshold);
        this.threshold = newThreshold;
    }

    /**
     * 메모를 갱신한다.
     *
     * @param newNote 새 메모 (null 허용)
     */
    public void updateNote(String newNote) {
        this.note = newNote;
    }

    private static void validateThreshold(int threshold) {
        if (threshold < 0) {
            throw new IllegalArgumentException("안전재고 임계값은 0 이상이어야 합니다");
        }
    }
}

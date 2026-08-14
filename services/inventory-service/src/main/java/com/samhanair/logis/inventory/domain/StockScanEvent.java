package com.samhanair.logis.inventory.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.inventory.service.StockScanDirection;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/** QR 스캔 감사 이벤트 — movement note와 분리된 BaseEntity 7 audit + soft delete 엔티티. */
@Entity
@Getter
@Table(name = "stock_scan_events")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class StockScanEvent extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "slip_id", nullable = false)
    private UUID slipId;

    @Column(name = "slip_no", nullable = false, length = 64)
    private String slipNo;

    @Column(name = "serial_key", nullable = false, length = 9)
    private String serialKey;

    @Column(name = "product_code", nullable = false, length = 50)
    private String productCode;

    @Enumerated(EnumType.STRING)
    @Column(name = "direction", nullable = false, length = 20)
    private StockScanDirection direction;

    private StockScanEvent(UUID slipId, String slipNo, String serialKey,
                           String productCode, StockScanDirection direction) {
        this.slipId = slipId;
        this.slipNo = slipNo;
        this.serialKey = serialKey;
        this.productCode = productCode;
        this.direction = direction;
    }

    /** 성공한 스캔 한 건을 감사 이벤트로 만든다. */
    public static StockScanEvent of(UUID slipId, String slipNo, String serialKey,
                                    String productCode, StockScanDirection direction) {
        return new StockScanEvent(slipId, slipNo, serialKey, productCode, direction);
    }
}

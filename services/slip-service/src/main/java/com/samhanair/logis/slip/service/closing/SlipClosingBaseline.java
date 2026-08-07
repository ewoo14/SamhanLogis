package com.samhanair.logis.slip.service.closing;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.slip.domain.SlipType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

/** 전표 종류별 자동 마감 기준선. 기본값은 비활성이다. */
@Entity
@Getter
@Table(name = "slip_closing_baselines")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SlipClosingBaseline extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(name = "slip_type", nullable = false, length = 20)
    private SlipType slipType;

    @Column(name = "baseline_date", nullable = false)
    private LocalDate baselineDate;

    @Column(name = "enabled", nullable = false)
    private boolean enabled;

    private SlipClosingBaseline(SlipType slipType, LocalDate baselineDate, boolean enabled) {
        this.slipType = slipType;
        this.baselineDate = baselineDate;
        this.enabled = enabled;
    }

    public static SlipClosingBaseline active(SlipType slipType, LocalDate baselineDate, boolean enabled) {
        return new SlipClosingBaseline(slipType, baselineDate, enabled);
    }
}

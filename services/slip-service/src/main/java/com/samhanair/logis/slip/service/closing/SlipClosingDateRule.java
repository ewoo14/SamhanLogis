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

/** 기준선의 열린 예외 또는 기준선 이후의 명시 마감 날짜. */
@Entity
@Getter
@Table(name = "slip_closing_date_rules")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SlipClosingDateRule extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(name = "slip_type", nullable = false, length = 20)
    private SlipType slipType;

    @Column(name = "closing_date", nullable = false)
    private LocalDate closingDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "rule_type", nullable = false, length = 20)
    private SlipClosingDateRuleType ruleType;

    private SlipClosingDateRule(SlipType slipType, LocalDate closingDate, SlipClosingDateRuleType ruleType) {
        this.slipType = slipType;
        this.closingDate = closingDate;
        this.ruleType = ruleType;
    }

    public static SlipClosingDateRule openException(SlipType slipType, LocalDate closingDate) {
        return new SlipClosingDateRule(slipType, closingDate, SlipClosingDateRuleType.OPEN_EXCEPTION);
    }

    public static SlipClosingDateRule manualClosed(SlipType slipType, LocalDate closingDate) {
        return new SlipClosingDateRule(slipType, closingDate, SlipClosingDateRuleType.MANUAL_CLOSED);
    }
}

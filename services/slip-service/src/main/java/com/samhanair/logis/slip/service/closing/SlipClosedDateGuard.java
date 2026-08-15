package com.samhanair.logis.slip.service.closing;

import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.slip.domain.SlipType;
import java.time.LocalDate;
import java.util.UUID;
import java.time.Clock;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/** 전표가 (종류, 전표일) 마감 정책을 통과하는지 모든 활성화 경로에서 판정한다. */
@Service
@RequiredArgsConstructor
public class SlipClosedDateGuard {

    public static final String PAGE_CODE = "slip.closed-date-exception";

    private final SlipClosingBaselineRepository baselineRepository;
    private final SlipClosingDateRuleRepository dateRuleRepository;
    private final DynamicPermissionClient permissionClient;
    private final Clock clock;

    public void assertCreatable(SlipType slipType, LocalDate slipDate, String requesterId) {
        assertAllowed(slipType, slipDate, requesterId);
    }

    /** HTTP direct-update 경계에서 전달된 MASTER 역할은 마감 예외 권한의 시스템 bypass다. */
    public void assertCreatable(SlipType slipType, LocalDate slipDate, String requesterId, String requesterRole) {
        assertAllowed(slipType, slipDate, requesterId, requesterRole);
    }

    /** 복원·수정·상태 전이도 신규 생성과 동일한 마감일 예외 권한을 사용한다. */
    public void assertAllowed(SlipType slipType, LocalDate slipDate, String requesterId) {
        assertAllowed(slipType, slipDate, requesterId, null);
    }

    public void assertAllowed(SlipType slipType, LocalDate slipDate, String requesterId, String requesterRole) {
        if (isCreatable(slipType, slipDate, requesterId, requesterRole)) {
            return;
        }
        throw new SlipClosedDateException();
    }

    /** 일마감 금액 수정은 잠긴 날짜의 예외 권한 우회도 허용하지 않는다. */
    public void assertAmountEditAllowed(SlipType slipType, LocalDate slipDate) {
        if (isClosed(slipType, slipDate)) {
            throw new SlipClosedDateException();
        }
    }

    /** 조회 화면이 금액 입력을 사전에 비활성화할 수 있도록 마감 여부만 노출한다. */
    public boolean isAmountEditAllowed(SlipType slipType, LocalDate slipDate) {
        return !isClosed(slipType, slipDate);
    }

    /** 날짜 마감과 예외 권한을 함께 판정한다. 대체 출고일 탐색에서도 같은 정책을 재사용한다. */
    public boolean isCreatable(SlipType slipType, LocalDate slipDate, String requesterId) {
        return isCreatable(slipType, slipDate, requesterId, null);
    }

    public boolean isCreatable(
            SlipType slipType, LocalDate slipDate, String requesterId, String requesterRole) {
        if (!isClosed(slipType, slipDate)) {
            return true;
        }
        if ("MASTER".equalsIgnoreCase(requesterRole)) {
            return true;
        }
        UUID accountId = parseUuid(requesterId);
        return accountId != null
                && permissionClient.check(accountId, PAGE_CODE, PermissionAction.CREATE);
    }

    private boolean isClosed(SlipType slipType, LocalDate slipDate) {
        return dateRuleRepository.findBySlipTypeAndClosingDateAndIsDeletedFalse(slipType, slipDate)
                .map(rule -> rule.getRuleType() == SlipClosingDateRuleType.MANUAL_CLOSED)
                .orElseGet(() -> baselineRepository.findBySlipTypeAndIsDeletedFalse(slipType)
                        .filter(baseline -> baseline.isEnabled()
                                && slipDate.isBefore(baseline.getBaselineDate())
                                && !slipDate.isAfter(LocalDate.now(clock)))
                        .isPresent());
    }

    private UUID parseUuid(String requesterId) {
        if (requesterId == null || requesterId.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(requesterId);
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }
}

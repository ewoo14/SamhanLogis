package com.samhanair.logis.slip.service.dispatchgroup;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** 활성 그룹에 담긴 전표의 soft-delete를 막아 그룹의 구조적 참조를 보존한다. */
@Component
@RequiredArgsConstructor
public class DispatchGroupSlipReferenceGuard {
    private final DispatchGroupService dispatchGroupService;

    public void assertDeletable(UUID slipId) {
        if (dispatchGroupService.hasActiveReference(slipId)) {
            throw new BusinessException(ErrorCode.CONFLICT, "배차 그룹에 담긴 전표는 먼저 그룹에서 제외해야 삭제할 수 있습니다.");
        }
    }
}

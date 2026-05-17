package com.samhanair.logis.partnerorder.web;

import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.partnerorder.service.PartnerOrderDeleteService;
import io.swagger.v3.oas.annotations.Operation;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 거래처 주문 soft delete endpoint.
 */
@RestController
@RequestMapping("/api/v1/partner-orders")
@RequiredArgsConstructor
public class PartnerOrderDeleteController {

    private final PartnerOrderDeleteService deleteService;

    /**
     * DRAFT/CONFIRMING 주문 soft delete. CONFIRMED 이후 주문은 삭제할 수 없다.
     */
    @Operation(summary = "거래처 주문 삭제",
            description = "본사 SALES/MANAGER/MASTER 가 주문과 라인을 soft-delete 처리합니다.")
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAnyRole('SALES','MASTER','MANAGER')")
    public void delete(
            @PathVariable String id,
            @RequestHeader(value = HttpHeaderConstants.CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = HttpHeaderConstants.CALLER_NAME_HEADER, required = false) String callerName) {
        deleteService.delete(id, parseActorId(callerId), resolveName(callerId, callerName));
    }

    private UUID parseActorId(String callerId) {
        if (callerId == null || callerId.isBlank()) {
            return new UUID(0L, 0L);
        }
        try {
            return UUID.fromString(callerId);
        } catch (IllegalArgumentException ex) {
            return new UUID(0L, 0L);
        }
    }

    private String resolveName(String callerId, String callerName) {
        if (callerName != null && !callerName.isBlank()) {
            return callerName;
        }
        if (callerId != null && !callerId.isBlank()) {
            return callerId;
        }
        return "system";
    }
}

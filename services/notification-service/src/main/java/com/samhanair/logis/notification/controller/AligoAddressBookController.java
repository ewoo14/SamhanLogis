package com.samhanair.logis.notification.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.notification.dto.AligoAddressBookSyncResponse;
import com.samhanair.logis.notification.service.AligoAddressBookSyncService;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.security.permission.PermissionAction;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Phase 10 PR-F1 BE-1 — 알리고 주소록 자동 sync admin endpoint.
 *
 * <p><b>Samhan Public 이식 — legacy GAS 9번 "알리고 자동 업로드" 의 1단계 자동화.</b>
 * 운영자가 본 endpoint 호출 시 partner-service 의 활성 거래처 (BE-1 Part A 의 CSV) 를 fetch +
 * parse → 알리고 주소록 API client 호출 (현 단계는 외부 미전달 mock, 후속에서 실 구현체 교체).
 *
 * <p>인증 = X-User-* 헤더 (gateway 경유) + {@code @RequirePermission} 동적 권한 가드.
 * SALES / WAREHOUSE 등 일반 사용자는 sync trigger 불가.
 */
@RestController
@RequestMapping("/admin/notification/aligo/address-book")
@RequiredArgsConstructor
public class AligoAddressBookController {

    private final AligoAddressBookSyncService syncService;

    /**
     * 알리고 주소록 sync 실행.
     *
     * <p>현 시점 응답 = {@link AligoAddressBookSyncResponse} 의 4 카테고리와 deliveryStatus.
     * 알리고 실 API spec 사용자 결정 후 추가 메타 (예: requestId, durationMs) 보강 가능.
     *
     * @return 200 + {@link AligoAddressBookSyncResponse}
     */
    @Operation(summary = "알리고 주소록 자동 sync (Phase 10 PR-F1 BE-1)",
            description = "MASTER / MANAGER 권한 필요. 현 단계는 외부 미전달 mock — 실 client 연결 후 전달 상태 전환.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "sync 결과 (added/updated/skipped/failed/deliveryStatus 응답)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "권한 없음")
    })
    @PostMapping("/sync")
    @RequirePermission(page = "aligo.address-book", action = PermissionAction.UPDATE)
    public ApiResponse<AligoAddressBookSyncResponse> sync() {
        return ApiResponse.ok(syncService.sync());
    }
}

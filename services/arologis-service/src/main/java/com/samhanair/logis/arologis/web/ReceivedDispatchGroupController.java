package com.samhanair.logis.arologis.web;

import com.samhanair.logis.arologis.dto.dispatch.ReceivedDispatchGroupRequest;
import com.samhanair.logis.arologis.security.ArologisPageCodes;
import com.samhanair.logis.arologis.service.dispatch.ReceivedDispatchGroupService;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import lombok.extern.slf4j.Slf4j;

@RestController
@RequiredArgsConstructor
@Slf4j
public class ReceivedDispatchGroupController {
    private final ReceivedDispatchGroupService service;

    @PostMapping("/internal/arologis/dispatch-groups")
    public ApiResponse<Void> receive(@RequestBody ReceivedDispatchGroupRequest r) {
        service.receive(r);
        return ApiResponse.ok(null);
    }

    /**
     * 수신 표시 정본 — 아로로지스 화면은 삼한 퍼블릭이 보낸 그룹 snapshot만 표시한다.
     * operational dispatch 상세/GPS/회신 읽기 계약은 별도로 유지한다.
     */
    @GetMapping("/admin/arologis/dispatch-groups")
    @RequirePermission(page = ArologisPageCodes.DISPATCH_OPS, action = PermissionAction.VIEW)
    public ApiResponse<?> list(@RequestParam LocalDate dispatchDate) {
        var groups = service.list(dispatchDate);
        if (groups.isEmpty()) {
            log.info("[dispatch-group-receive] dispatchDate={} 수신 그룹 0건", dispatchDate);
        }
        return ApiResponse.ok(groups.stream()
                .map(g -> java.util.Map.of(
                        "groupNo", g.getGroupNo(),
                        "dispatchDate", g.getDispatchDate(),
                        "vehicleLabel", g.getVehicleLabel(),
                        "carrierCode", g.getCarrierCode(),
                        "carrierName", g.getCarrierName(),
                        "slips", g.getSlipSnapshot()))
                .toList());
    }
}

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

@RestController
@RequiredArgsConstructor
public class ReceivedDispatchGroupController {
    private final ReceivedDispatchGroupService service;

    @PostMapping("/internal/arologis/dispatch-groups")
    public ApiResponse<Void> receive(@RequestBody ReceivedDispatchGroupRequest r) {
        service.receive(r);
        return ApiResponse.ok(null);
    }

    @GetMapping("/admin/arologis/dispatch-groups")
    @RequirePermission(page = ArologisPageCodes.DISPATCH_OPS, action = PermissionAction.VIEW)
    public ApiResponse<?> list(@RequestParam LocalDate dispatchDate) {
        return ApiResponse.ok(service.list(dispatchDate).stream()
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

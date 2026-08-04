package com.samhanair.logis.slip.web.dispatchgroup;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.dto.dispatchgroup.DispatchGroupRequests;
import com.samhanair.logis.slip.dto.dispatchgroup.DispatchGroupResponse;
import com.samhanair.logis.slip.service.dispatchgroup.DispatchGroupService;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** S1 가배차 그룹 CRUD 및 전표 편입 API. 외부 경로는 활성 업무 식별자를 사용한다. */
@RestController
@RequestMapping("/admin/dispatch-groups")
@RequiredArgsConstructor
public class DispatchGroupAdminController {
    private final DispatchGroupService service;

    @GetMapping
    @RequirePermission(page = "dispatch.board", action = PermissionAction.VIEW)
    public ApiResponse<List<DispatchGroupResponse>> list(@RequestParam LocalDate dispatchDate) { return ApiResponse.ok(service.list(dispatchDate)); }

    @GetMapping("/{groupNo}")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.VIEW)
    public ApiResponse<DispatchGroupResponse> get(@PathVariable String groupNo) { return ApiResponse.ok(service.get(groupNo)); }

    @PostMapping
    @RequirePermission(page = "dispatch.board", action = PermissionAction.CREATE)
    public ApiResponse<DispatchGroupResponse> create(@Valid @RequestBody DispatchGroupRequests.Create request) { return ApiResponse.ok(service.create(request)); }

    @PutMapping("/{groupNo}")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.UPDATE)
    public ApiResponse<DispatchGroupResponse> update(@PathVariable String groupNo, @Valid @RequestBody DispatchGroupRequests.Update request) { return ApiResponse.ok(service.update(groupNo, request)); }

    @DeleteMapping("/{groupNo}")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.DELETE)
    public ApiResponse<Void> delete(@PathVariable String groupNo, @RequestHeader(value = "X-User-Id", required = false) String actor) { service.delete(groupNo, actor); return ApiResponse.ok(null); }

    @PutMapping("/{groupNo}/carrier/{carrierCode}")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.UPDATE)
    public ApiResponse<DispatchGroupResponse> assignCarrier(@PathVariable String groupNo, @PathVariable String carrierCode) { return ApiResponse.ok(service.assignCarrier(groupNo, carrierCode)); }

    @DeleteMapping("/{groupNo}/carrier")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.UPDATE)
    public ApiResponse<DispatchGroupResponse> clearCarrier(@PathVariable String groupNo) { return ApiResponse.ok(service.clearCarrier(groupNo)); }

    @PostMapping("/{groupNo}/slips")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.UPDATE)
    public ApiResponse<DispatchGroupResponse> addSlip(@PathVariable String groupNo, @Valid @RequestBody DispatchGroupRequests.AddSlip request) { return ApiResponse.ok(service.addSlip(groupNo, request)); }

    @DeleteMapping("/{groupNo}/slips/{slipNo}")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.UPDATE)
    public ApiResponse<DispatchGroupResponse> removeSlip(@PathVariable String groupNo, @PathVariable String slipNo,
                                                         @RequestHeader(value = "X-User-Id", required = false) String actor) { return ApiResponse.ok(service.removeSlip(groupNo, slipNo, actor)); }

    @PutMapping("/{groupNo}/slips/order")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.UPDATE)
    public ApiResponse<DispatchGroupResponse> reorder(@PathVariable String groupNo, @Valid @RequestBody DispatchGroupRequests.Reorder request) { return ApiResponse.ok(service.reorder(groupNo, request)); }

    @PostMapping("/{groupNo}/transfer")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.UPDATE)
    public ApiResponse<DispatchGroupResponse> transfer(@PathVariable String groupNo) { return ApiResponse.ok(service.transfer(groupNo)); }
}

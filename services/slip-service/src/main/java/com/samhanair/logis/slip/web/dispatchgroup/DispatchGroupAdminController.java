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
import java.util.UUID;
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

/** S1 가배차 그룹 CRUD 및 전표 편입 API. UUID는 내부 경로 라우팅에만 사용하고 응답에는 반환하지 않는다. */
@RestController
@RequestMapping("/admin/dispatch-groups")
@RequiredArgsConstructor
public class DispatchGroupAdminController {
    private final DispatchGroupService service;

    @GetMapping
    @RequirePermission(page = "dispatch.board", action = PermissionAction.VIEW)
    public ApiResponse<List<DispatchGroupResponse>> list(@RequestParam LocalDate dispatchDate) { return ApiResponse.ok(service.list(dispatchDate)); }

    @GetMapping("/{id}")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.VIEW)
    public ApiResponse<DispatchGroupResponse> get(@PathVariable UUID id) { return ApiResponse.ok(service.get(id)); }

    @PostMapping
    @RequirePermission(page = "dispatch.board", action = PermissionAction.CREATE)
    public ApiResponse<DispatchGroupResponse> create(@Valid @RequestBody DispatchGroupRequests.Create request) { return ApiResponse.ok(service.create(request)); }

    @PutMapping("/{id}")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.UPDATE)
    public ApiResponse<DispatchGroupResponse> update(@PathVariable UUID id, @Valid @RequestBody DispatchGroupRequests.Update request) { return ApiResponse.ok(service.update(id, request)); }

    @DeleteMapping("/{id}")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.DELETE)
    public ApiResponse<Void> delete(@PathVariable UUID id, @RequestHeader(value = "X-User-Id", required = false) String actor) { service.delete(id, actor); return ApiResponse.ok(null); }

    @PutMapping("/{id}/carrier/{carrierId}")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.UPDATE)
    public ApiResponse<DispatchGroupResponse> assignCarrier(@PathVariable UUID id, @PathVariable UUID carrierId) { return ApiResponse.ok(service.assignCarrier(id, carrierId)); }

    @DeleteMapping("/{id}/carrier")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.UPDATE)
    public ApiResponse<DispatchGroupResponse> clearCarrier(@PathVariable UUID id) { return ApiResponse.ok(service.clearCarrier(id)); }

    @PostMapping("/{id}/slips")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.UPDATE)
    public ApiResponse<DispatchGroupResponse> addSlip(@PathVariable UUID id, @Valid @RequestBody DispatchGroupRequests.AddSlip request) { return ApiResponse.ok(service.addSlip(id, request)); }

    @DeleteMapping("/{id}/slips/{slipNo}")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.UPDATE)
    public ApiResponse<DispatchGroupResponse> removeSlip(@PathVariable UUID id, @PathVariable String slipNo,
                                                         @RequestHeader(value = "X-User-Id", required = false) String actor) { return ApiResponse.ok(service.removeSlip(id, slipNo, actor)); }

    @PutMapping("/{id}/slips/order")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.UPDATE)
    public ApiResponse<DispatchGroupResponse> reorder(@PathVariable UUID id, @Valid @RequestBody DispatchGroupRequests.Reorder request) { return ApiResponse.ok(service.reorder(id, request)); }
}

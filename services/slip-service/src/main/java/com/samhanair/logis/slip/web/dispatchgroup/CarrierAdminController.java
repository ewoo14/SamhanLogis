package com.samhanair.logis.slip.web.dispatchgroup;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.dto.dispatchgroup.CarrierRequests;
import com.samhanair.logis.slip.dto.dispatchgroup.CarrierResponse;
import com.samhanair.logis.slip.service.dispatchgroup.CarrierService;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 인사 > 운송사 목록의 S1 마스터 API. page code hr.carriers는 신규 카탈로그 항목이다. */
@RestController
@RequestMapping("/admin/carriers")
@RequiredArgsConstructor
public class CarrierAdminController {
    private final CarrierService service;

    @GetMapping
    @RequirePermission(page = "hr.carriers", action = PermissionAction.VIEW)
    public ApiResponse<List<CarrierResponse>> list() { return ApiResponse.ok(service.list()); }

    @GetMapping("/{code}")
    @RequirePermission(page = "hr.carriers", action = PermissionAction.VIEW)
    public ApiResponse<CarrierResponse> get(@PathVariable String code) { return ApiResponse.ok(service.get(code)); }

    @PostMapping
    @RequirePermission(page = "hr.carriers", action = PermissionAction.CREATE)
    public ApiResponse<CarrierResponse> create(@Valid @RequestBody CarrierRequests.Create request) { return ApiResponse.ok(service.create(request)); }

    @PatchMapping("/{code}")
    @RequirePermission(page = "hr.carriers", action = PermissionAction.UPDATE)
    public ApiResponse<CarrierResponse> update(@PathVariable String code, @RequestBody CarrierRequests.Update request) { return ApiResponse.ok(service.update(code, request)); }

    @DeleteMapping("/{code}")
    @RequirePermission(page = "hr.carriers", action = PermissionAction.DELETE)
    public ApiResponse<Void> delete(@PathVariable String code, @RequestHeader(value = "X-User-Id", required = false) String actor) { service.delete(code, actor); return ApiResponse.ok(null); }
}

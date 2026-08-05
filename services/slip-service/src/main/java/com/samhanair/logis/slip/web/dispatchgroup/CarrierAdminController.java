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

    /**
     * 배차 화면의 운송사 선택용 조회 alias.
     *
     * <p>인사 마스터 목록({@code /admin/carriers})은 {@code hr.carriers}를 유지하고,
     * 배차 화면에서만 {@code dispatch.board VIEW}로 같은 읽기 모델에 접근한다.
     */
    @GetMapping("/dispatch-lookup")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.VIEW)
    public ApiResponse<List<CarrierResponse>> dispatchLookupList() {
        return ApiResponse.ok(service.list());
    }

    @GetMapping("/{code}")
    @RequirePermission(page = "hr.carriers", action = PermissionAction.VIEW)
    public ApiResponse<CarrierResponse> get(@PathVariable String code) { return ApiResponse.ok(service.get(code)); }

    /** 배차 화면 운송사 선택용 단건 조회. UUID가 아닌 운송사 code만 응답 식별자로 사용한다. */
    @GetMapping("/dispatch-lookup/{code}")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.VIEW)
    public ApiResponse<CarrierResponse> dispatchLookupGet(@PathVariable String code) {
        return ApiResponse.ok(service.get(code));
    }

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

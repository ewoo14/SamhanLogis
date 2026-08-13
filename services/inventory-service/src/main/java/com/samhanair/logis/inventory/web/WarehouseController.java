package com.samhanair.logis.inventory.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.inventory.realtime.web.dto.InventoryAuditLogResponse;
import com.samhanair.logis.inventory.service.WarehouseService;
import com.samhanair.logis.inventory.web.dto.AdminWarehouseListResponse;
import com.samhanair.logis.inventory.web.dto.CreateWarehouseRequest;
import com.samhanair.logis.inventory.web.dto.OpaqueUuidDeserializer;
import com.samhanair.logis.inventory.web.dto.UpdateWarehouseRequest;
import com.samhanair.logis.inventory.web.dto.WarehouseResponse;
import com.samhanair.logis.security.department.Department;
import com.samhanair.logis.security.department.RequireDepartment;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 창고 마스터 CRUD. 권한 매트릭스:
 * <ul>
 *   <li>읽기 — 인증된 모든 역할</li>
 *   <li>쓰기 (POST/PATCH/DELETE) — MASTER / MANAGER / DEVELOPER</li>
 * </ul>
 *
 * <p>SP-D4 동적 권한 이중 가드:
 * <ul>
 *   <li>{@code @RequireDepartment} 대표실 부서 가드 보존 (regression 0)</li>
 *   <li>GET 조회 → {@link InventoryPermissionGuard#checkView(String, String)} (PAGE_WAREHOUSE)</li>
 *   <li>POST/PATCH/DELETE write → {@link InventoryPermissionGuard#checkEdit(String, String)}</li>
 * </ul>
 */
@RestController
@RequestMapping("/inventory/warehouses")
@RequiredArgsConstructor
public class WarehouseController {

    private static final String CALLER_HEADER = "X-User-Id";
    private static final String CALLER_NAME_HEADER = "X-User-Name";
    private static final String ROLE_HEADER   = "X-User-Role";

    private final WarehouseService warehouseService;
    /** PR-H4b 후속 — 창고 audit overlay 실시간 SSE broadcast 채널. */
    private final RealtimeBroker realtimeBroker;
    private final InventoryPermissionGuard inventoryPermissionGuard;

    /**
     * 활성 창고 전체 조회 — displayOrder ASC. 인증된 모든 역할.
     *
     * @param roleHeader X-User-Role 헤더 (동적 권한 검증)
     * @return 응답 envelope 안 List&lt;WarehouseResponse&gt; (200)
     */
    @Operation(summary = "창고 목록 조회", description = "displayOrder 오름차순으로 활성 창고 전체 반환")
    @GetMapping
    @RequirePermission(page = "inventory.warehouse", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<List<WarehouseResponse>> listAll(
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        inventoryPermissionGuard.checkView(roleHeader, InventoryPermissionGuard.PAGE_WAREHOUSE);
        return ApiResponse.ok(warehouseService.listAll());
    }

    /**
     * 창고 admin 검색 — Phase 10 P0-5 (q + 페이지네이션).
     *
     * <p>frontend {@code /admin/warehouses} 화면 backing — q (code/name/address LIKE) +
     * page/size. 응답은 {@link AdminWarehouseListResponse} (items / total / page / size).
     * 권한: 일반 조회와 동일 — 인증된 모든 역할 (창고 마스터는 운영 정보 외 민감 데이터 없음).
     */
    @Operation(summary = "창고 admin 검색 (Phase 10 P0-5)",
            description = "q (code/name/address LIKE) + page/size. items/total/page/size 응답.")
    @GetMapping("/search")
    @RequirePermission(page = "inventory.warehouse", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<AdminWarehouseListResponse> search(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String q,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        inventoryPermissionGuard.checkView(roleHeader, InventoryPermissionGuard.PAGE_WAREHOUSE);
        Pageable pageable = PageRequest.of(page, size,
                Sort.by(Sort.Direction.ASC, "displayOrder"));
        return ApiResponse.ok(warehouseService.searchAdmin(q, pageable));
    }

    /**
     * 단건 조회. 인증된 모든 역할.
     *
     * @param id 창고 UUID
     * @return WarehouseResponse (200) / NOT_FOUND (404)
     */
    @Operation(summary = "창고 단건 조회")
    @GetMapping("/{id}")
    @RequirePermission(page = "inventory.warehouse", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<WarehouseResponse> getOne(@PathVariable String id) {
        return ApiResponse.ok(warehouseService.getOne(OpaqueUuidDeserializer.decode(id)));
    }

    /**
     * 새 창고 생성. MASTER/MANAGER/DEVELOPER 만 허용.
     *
     * @param request CreateWarehouseRequest (code/name/type/address/displayOrder/description)
     * @return 생성된 WarehouseResponse (201) / 동일 code 시 CONFLICT (409)
     */
    @Operation(summary = "창고 생성", description = "code 중복 불가. MASTER/MANAGER/DEVELOPER 만 허용")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "생성 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "code 중복")
    })
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "inventory.warehouse.admin", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ApiResponse<WarehouseResponse> create(
            @Valid @RequestBody CreateWarehouseRequest request,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        inventoryPermissionGuard.checkEdit(roleHeader, InventoryPermissionGuard.PAGE_WAREHOUSE_ADMIN);
        return ApiResponse.ok(warehouseService.create(request));
    }

    /**
     * 창고 부분 수정 (PATCH). null 이 아닌 필드만 적용. MASTER/MANAGER/DEVELOPER 만 허용.
     *
     * @param id 창고 UUID
     * @param request UpdateWarehouseRequest (모든 필드 null 가능)
     * @return 갱신된 WarehouseResponse (200) / NOT_FOUND (404)
     */
    @Operation(summary = "창고 수정", description = "PATCH 시맨틱: null 이 아닌 필드만 적용 + audit overlay 기록")
    @PatchMapping("/{id}")
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "inventory.warehouse.admin", action = com.samhanair.logis.security.permission.PermissionAction.DELETE)
    public ApiResponse<WarehouseResponse> update(@PathVariable String id,
                                                 @Valid @RequestBody UpdateWarehouseRequest request,
                                                 @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
                                                 @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerNameHeader,
                                                 @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        inventoryPermissionGuard.checkEdit(roleHeader, InventoryPermissionGuard.PAGE_WAREHOUSE_ADMIN);
        return ApiResponse.ok(warehouseService.update(OpaqueUuidDeserializer.decode(id), request, callerHeader,
                callerNameHeader));
    }

    /**
     * 4b 후속 — 창고 변경 이력 timeline 조회. 최신 revision 우선. 인증된 모든 역할.
     *
     * @param id 창고 UUID
     * @return InventoryAuditLogResponse 리스트 (revisionNo desc + changedAt desc)
     */
    @Operation(summary = "창고 변경 이력 조회",
            description = "InventoryAuditLogRecorder 가 PATCH / DELETE 시점에 기록한 audit overlay 를 timeline 형식으로 반환")
    @GetMapping("/{id}/audit-logs")
    @RequirePermission(page = "inventory.warehouse", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<List<InventoryAuditLogResponse>> listAuditLogs(@PathVariable String id) {
        return ApiResponse.ok(warehouseService.listAuditLogs(OpaqueUuidDeserializer.decode(id)).stream()
                .map(InventoryAuditLogResponse::from)
                .toList());
    }

    /**
     * 창고 audit overlay 실시간 SSE 구독 — 동일 broker (entityId=warehouseId) 사용.
     *
     * <p>{@code inventory:edit} 이벤트 stream — heartbeat 30s. 클라이언트는 EventSource 또는
     * fetch streaming 으로 subscribe. PATCH / soft-delete 시점에 자동 publish.
     */
    @Operation(summary = "창고 audit SSE realtime 구독",
            description = "PATCH/DELETE 시 발생하는 inventory:edit 이벤트를 SSE stream 으로 전달")
    @GetMapping(value = "/{id}/realtime", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = "inventory.warehouse", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public SseEmitter subscribeRealtime(@PathVariable String id) {
        return realtimeBroker.subscribe(OpaqueUuidDeserializer.decode(id));
    }

    /**
     * 특정 audit revision 으로 되돌림 (undo) — 신규 revision 으로 audit 자동 기록.
     * 지원 필드: name / type / address / displayOrder / description.
     * isDeleted revert 는 미지원 (POST /restore 또는 DELETE 사용).
     */
    @Operation(summary = "audit revert (특정 revision 복원)",
            description = "선택 revision 의 oldValue 를 entity 에 재적용. 복원 자체도 신규 audit row 1행으로 영원 추적")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "복원 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "revisionNo < 1 또는 isDeleted revert 시도"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "창고/revision 미존재")
    })
    @PostMapping("/{id}/audit/revert/{revisionNo}")
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "inventory.warehouse.admin", action = com.samhanair.logis.security.permission.PermissionAction.RESTORE)
    public ApiResponse<WarehouseResponse> revertAudit(
            @PathVariable String id,
            @PathVariable int revisionNo,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerNameHeader,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        inventoryPermissionGuard.checkEdit(roleHeader, InventoryPermissionGuard.PAGE_WAREHOUSE_ADMIN);
        return ApiResponse.ok(warehouseService.revertToRevision(OpaqueUuidDeserializer.decode(id), revisionNo, callerHeader,
                callerNameHeader));
    }

    /**
     * Soft delete. MASTER/MANAGER/DEVELOPER 만 허용. 204 No Content.
     *
     * @param id 창고 UUID
     * @param callerHeader X-User-Id 헤더 (감사용)
     */
    @Operation(summary = "창고 삭제 (soft)", description = "is_deleted=true 마킹. row 는 보존")
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "inventory.warehouse.admin", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public void delete(@PathVariable String id,
                       @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
                       @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerNameHeader,
                       @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        inventoryPermissionGuard.checkEdit(roleHeader, InventoryPermissionGuard.PAGE_WAREHOUSE_ADMIN);
        warehouseService.delete(OpaqueUuidDeserializer.decode(id), callerHeader, callerNameHeader);
    }

    /**
     * 비활성화된 창고 목록 — 복구 admin 화면 source. MASTER/MANAGER/DEVELOPER 만 허용.
     *
     * <p>일반 GET / 와 별개 endpoint — native query 로 {@code @SQLRestriction} 우회.
     */
    @Operation(summary = "비활성화된 창고 목록",
            description = "soft-deleted 창고 list (modified_at desc). 복구 admin 화면 backing.")
    @GetMapping("/deleted")
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "inventory.warehouse.admin", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<List<WarehouseResponse>> listDeleted() {
        return ApiResponse.ok(warehouseService.listDeleted());
    }

    /**
     * 비활성화된 창고를 복구 (soft-delete undo) — is_deleted=true → false.
     * 동일 code 의 활성 창고가 있으면 409.
     */
    @Operation(summary = "창고 복구 (soft-delete undo)",
            description = "비활성화된 창고를 다시 활성화. 동일 code 의 활성 창고 존재 시 CONFLICT.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "복구 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "비활성화된 창고 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "동일 code 활성 창고 존재")
    })
    @PostMapping("/{id}/restore")
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "inventory.warehouse.admin", action = com.samhanair.logis.security.permission.PermissionAction.RESTORE)
    public ApiResponse<WarehouseResponse> restore(@PathVariable String id,
                                                  @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
                                                  @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerNameHeader,
                                                  @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        inventoryPermissionGuard.checkEdit(roleHeader, InventoryPermissionGuard.PAGE_WAREHOUSE_ADMIN);
        return ApiResponse.ok(warehouseService.restore(OpaqueUuidDeserializer.decode(id), callerHeader,
                callerNameHeader));
    }
}

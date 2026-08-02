package com.samhanair.logis.partner.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.partner.domain.PartnerStatus;
import com.samhanair.logis.partner.dto.AdminPartnerListResponse;
import com.samhanair.logis.partner.dto.CreditHistoryResponse;
import com.samhanair.logis.partner.dto.PartnerAdminRequest;
import com.samhanair.logis.partner.dto.PartnerAdminResponse;
import com.samhanair.logis.partner.dto.PartnerSummaryResponse;
import com.samhanair.logis.partner.service.PartnerAligoExportService;
import com.samhanair.logis.partner.service.PartnerCreditService;
import com.samhanair.logis.partner.service.PartnerExcelExportService;
import com.samhanair.logis.partner.service.PartnerService;
import com.samhanair.logis.security.department.Department;
import com.samhanair.logis.security.department.RequireDepartment;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.security.Principal;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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

/**
 * 거래처 마스터 관리자 CRUD endpoint.
 *
 * <p>인증 = X-User-* 헤더 (gateway 경유) + {@code @RequireDepartment} 부서 가드.
 * 목록/상세 조회는 SALES / MANAGER / MASTER 를 허용하고, 쓰기 작업은 MANAGER / MASTER 이상으로 제한한다.
 * 본 endpoint 는 internal token 필요 X.
 *
 * <p>모든 응답은 {@link PartnerAdminResponse} 사용 — UUID 비공개 가드 (memory feedback_uuid_no_user_visibility)
 * 일관 적용. partnerCode 만 응답에 노출, 후속 조회/수정도 partnerCode path variable.
 *
 * <p>SP-PO-1 동적 권한 가드:
 * <ul>
 *   <li>{@code @RequireDepartment} 대표실 부서 가드 보존 (regression 0)</li>
 *   <li>{@code @RequirePermission} 으로 endpoint 의미별 7-action 검증</li>
 * </ul>
 */
@RestController
@RequestMapping("/admin/partners")
@RequiredArgsConstructor
public class PartnerAdminController {

    private static final String ROLE_HEADER = "X-User-Role";
    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_NAME_HEADER = "X-User-Name";

    private final PartnerService partnerService;
    private final PartnerCreditService creditService;
    private final PartnerAligoExportService aligoExportService;
    private final PartnerExcelExportService excelExportService;

    /**
     * 신규 거래처 등록.
     *
     * @return 200 + PartnerAdminResponse ; 중복 partnerCode/bizNo → 409 CONFLICT
     */
    @Operation(summary = "신규 거래처 등록", description = "MASTER / MANAGER 권한 필요")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "등록 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "필수값 누락 / 검증 실패"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "권한 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "partnerCode 또는 bizNo 중복")
    })
    @PostMapping
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "partners.edit", action = PermissionAction.CREATE)
    public ApiResponse<PartnerAdminResponse> create(
            @Valid @RequestBody PartnerAdminRequest req,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(PartnerAdminResponse.from(partnerService.register(req)));
    }

    /**
     * 거래처 페이지 조회 (admin 목록).
     *
     * <p>Phase 10 W10-6 — 50 partner 시드 검증을 위해 도입. 권한은 SALES / MANAGER / MASTER (memory
     * feedback_uuid_no_user_visibility 가드 — 응답은 partnerCode/name/bizNo 등 비즈니스 식별자만,
     * 내부 UUID 미노출). 페이지 / 정렬은 표준 Spring {@link Pageable} 규약 (예:
     * {@code ?page=0&size=3&sort=partnerCode,asc}).
     *
     * @return {@code ApiResponse<Page<PartnerSummaryResponse>>}
     */
    @Operation(summary = "거래처 페이지 조회 (admin 목록)",
            description = "SALES / MANAGER / MASTER 권한 필요. UUID 비공개 — partnerCode 만 응답.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "권한 없음")
    })
    @GetMapping
    @RequirePermission(page = "partners.search", action = PermissionAction.VIEW)
    public ApiResponse<Page<PartnerSummaryResponse>> findAll(
            Pageable pageable,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        Page<PartnerSummaryResponse> page = partnerService.findAll(pageable)
                .map(PartnerSummaryResponse::from);
        return ApiResponse.ok(page);
    }

    /**
     * 거래처 admin 검색 — Phase 10 P0-5 (q + status 필터 + 페이지네이션).
     *
     * <p>frontend {@code /admin/partners} 화면 backing — q (partnerCode/name/bizNo/phone LIKE) +
     * status (PartnerStatus 필터). UUID 비공개 — 응답은 {@link AdminPartnerListResponse} (items =
     * partnerCode 등 비즈니스 식별자만).
     *
     * <p>{@code GET /admin/partners} (위 {@link #findAll(Pageable)}) 와 별도 — 본 endpoint 는
     * 검색 / 필터 화면용, 위 endpoint 는 Spring Data {@link Page} raw 응답.
     *
     * <p><b>{@code includeDeleted}</b>(기본 {@code false}): false 면 활성 거래처만(JPQL, {@code @SQLRestriction}) —
     * 견적/입금/세금계산서/전표/계좌매칭 등 자동완성 공유 계약 기본값. true 는 <b>E2 거래처 관리자 목록 전용</b>으로
     * soft-delete 행 + 개인정보성 {@code deletedByName} 을 함께 노출(native {@code searchAdminIncludingDeleted})하므로
     * 관리자 화면 외에서는 전달하지 말 것.
     */
    @Operation(summary = "거래처 admin 검색 (Phase 10 P0-5)",
            description = "SALES / MANAGER / MASTER 권한. q + status 필터. includeDeleted=true 는 E2 관리자 목록 전용(삭제행+deletedByName 노출). items / total / page / size 형식 응답.")
    @GetMapping("/search")
    @RequirePermission(page = "partners.search", action = PermissionAction.VIEW)
    public ApiResponse<AdminPartnerListResponse> search(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10000") int size,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) PartnerStatus status,
            @RequestParam(required = false) PartnerStatus type,
            @RequestParam(defaultValue = "false") boolean includeDeleted) {
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.ASC, "partnerCode"));
        PartnerStatus effectiveStatus = status == null ? type : status;
        return ApiResponse.ok(AdminPartnerListResponse.from(
                partnerService.searchAdmin(q, effectiveStatus, includeDeleted, pageable)));
    }

    /**
     * Phase 10 PR-D Part A — 거래처 상호로 partnerCode lookup (admin 화면 backing).
     *
     * <p>BLOCK 발송금지 등록 화면에서 관리자가 거래처 상호를 입력하면 본 endpoint 로 partnerCode 를
     * 역추적한다. {@link PartnerInternalController#lookupByName(String)} 와 흐름은 동일하지만
     * 본 endpoint 는 X-User-Role 헤더 인증 (MASTER/MANAGER) 사용. UUID 비공개 가드 유지 —
     * 응답은 {@link PartnerAdminResponse} (partnerCode + name + bizNo + ...).
     */
    @Operation(summary = "거래처 상호로 partnerCode lookup (admin 화면)",
            description = "MASTER / MANAGER 권한 필요. 정확 일치 우선, 미발견 시 LIKE 1건만 허용.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "단일 매칭"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "미발견"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "다중 매칭 (lookup 모호)")
    })
    @GetMapping("/by-name")
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "partners.edit", action = PermissionAction.VIEW)
    public ApiResponse<PartnerAdminResponse> lookupByName(@RequestParam("name") String name) {
        return ApiResponse.ok(PartnerAdminResponse.from(partnerService.findByName(name)));
    }

    /**
     * partnerCode 로 거래처 단건 조회.
     */
    @Operation(summary = "거래처 단건 조회 (partnerCode)")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "권한 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "거래처 미존재")
    })
    @GetMapping("/{partnerCode}")
    @RequirePermission(page = "partners.detail", action = PermissionAction.VIEW)
    public ApiResponse<PartnerAdminResponse> findOne(
            @PathVariable String partnerCode,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(PartnerAdminResponse.from(partnerService.findByCode(partnerCode)));
    }

    /**
     * 거래처 프로필 수정 (name / address / phone).
     *
     * <p>creditLimit 변경은 본 endpoint 가 아닌 별도 사용 — 신용한도 변경은 history 적재 의무.
     */
    @Operation(summary = "거래처 프로필 수정", description = "name / address / phone 만 변경. creditLimit 변경은 별도 사용")
    @PutMapping("/{partnerCode}")
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "partners.edit", action = PermissionAction.UPDATE)
    public ApiResponse<PartnerAdminResponse> update(
            @PathVariable String partnerCode,
            @Valid @RequestBody PartnerAdminRequest req,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(PartnerAdminResponse.from(partnerService.updateProfile(partnerCode, req)));
    }

    /**
     * 거래처 soft-delete. partial unique index 가 partnerCode 재사용 허용.
     */
    @Operation(summary = "거래처 soft-delete")
    @DeleteMapping("/{partnerCode}")
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "partners.delete", action = PermissionAction.DELETE)
    public ResponseEntity<ApiResponse<Void>> delete(
            @PathVariable String partnerCode,
            Principal principal,
            @RequestHeader(value = USER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = USER_NAME_HEADER, required = false) String callerName) {
        String actor = resolveActorUserId(callerId, principal);
        partnerService.delete(partnerCode, actor, callerName);
        return ResponseEntity.ok(ApiResponse.ok(null));
    }

    /**
     * 거래처 soft-delete 복원.
     *
     * <p>삭제 정책 가드 신설 없이 BaseEntity soft-delete undo 만 수행한다.
     */
    @Operation(summary = "거래처 soft-delete 복원")
    @PostMapping("/{partnerCode}/restore")
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "partners.delete", action = PermissionAction.RESTORE)
    public ApiResponse<PartnerAdminResponse> restore(
            @PathVariable String partnerCode,
            Principal principal,
            @RequestHeader(value = USER_ID_HEADER, required = false) String callerId) {
        return ApiResponse.ok(PartnerAdminResponse.from(
                partnerService.restore(partnerCode, resolveActorUserId(callerId, principal))));
    }

    private String resolveActorUserId(String callerId, Principal principal) {
        if (callerId != null && !callerId.isBlank()) {
            return callerId.trim();
        }
        return principal != null ? principal.getName() : "system";
    }

    /**
     * Phase 10 PR-F1 BE-1 — 알리고 SF벤더 그룹 CSV (UTF-8 BOM) 다운로드.
     *
     * <p>활성 거래처 + 차단 거래처 제외 + 휴대폰 정규화. legacy GAS 9번 "알리고 자동 업로드" 의
     * 자체 구현 — 운영자가 알리고 콘솔에 직접 업로드 (현 단계). PR-F1 BE-2 의 native API sync 로
     * 후속 격상 (수동 → 자동).
     *
     * <p>응답 = {@code text/csv; charset=UTF-8} + {@code Content-Disposition: attachment; filename=...}.
     * 모든 응답 byte 는 UTF-8 BOM 으로 시작 (Excel / 알리고 콘솔 한국어 인식).
     *
     * @return 200 + binary CSV (UTF-8 BOM 포함)
     */
    @Operation(summary = "알리고 SF벤더 그룹 CSV 다운로드 (Phase 10 PR-F1 BE-1)",
            description = "활성 거래처 + 차단 제외 + 휴대폰 정규화. UTF-8 BOM 포함 CSV. MASTER / MANAGER 권한.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "CSV binary 응답 (text/csv; charset=UTF-8, BOM 포함)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "권한 없음")
    })
    @GetMapping("/export/aligo-csv")
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "partners.edit", action = PermissionAction.DOWNLOAD)
    public ResponseEntity<byte[]> exportAligoCsv() {
        byte[] csv = aligoExportService.exportAligoCsv();
        String filename = "aligo-address-book-" + java.time.LocalDate.now() + ".csv";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .body(csv);
    }

    /**
     * P1-6 — 거래처 목록 Excel(.xlsx) 다운로드.
     *
     * <p>복합 필터 (q / status) 로 조회한 결과를 .xlsx 파일로 반환.
     * UUID 비공개 가드 — partnerCode / name / bizNo 등 비즈니스 식별자만 출력.
     * 최대 10,000 행. Content-Type:
     * {@code application/vnd.openxmlformats-officedocument.spreadsheetml.sheet}.
     *
     * @param q      검색어 (partnerCode/name/bizNo/phone LIKE, null 이면 전체)
     * @param status 거래 상태 필터 (null 이면 전체)
     * @return 200 + xlsx binary
     */
    @Operation(summary = "거래처 목록 Excel 다운로드 (P1-6)",
            description = "q + status 복합 필터. MASTER / MANAGER 권한. 최대 10,000 행.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "xlsx binary (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "권한 없음")
    })
    @GetMapping("/export.xlsx")
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "partners.edit", action = PermissionAction.DOWNLOAD)
    public ResponseEntity<byte[]> exportXlsx(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) PartnerStatus status) {
        byte[] xlsx = excelExportService.export(q, status);
        String filename = "partners-" + java.time.LocalDate.now() + ".xlsx";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(xlsx);
    }

    /**
     * 신용 거래 이력 페이지 조회.
     */
    @Operation(summary = "신용 거래 이력 페이지 조회",
            description = "SLIP_ISSUED / PAYMENT / CREDIT_LIMIT_CHANGE 시간 역순")
    @GetMapping("/{partnerCode}/credit-history")
    @RequirePermission(page = "partners.credit-history", action = PermissionAction.VIEW)
    public ApiResponse<List<CreditHistoryResponse>> findHistory(@PathVariable String partnerCode,
                                                                Pageable pageable) {
        Page<CreditHistoryResponse> page = creditService.findHistory(partnerCode, pageable)
                .map(CreditHistoryResponse::from);
        return ApiResponse.ok(page.getContent());
    }
}

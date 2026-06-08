package com.samhanair.logis.arologis.controller;

import com.samhanair.logis.arologis.client.AuthPermissionAdminClient;
import com.samhanair.logis.arologis.client.AuthPermissionAdminClient.RolePagePermissionView;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 아로로지스 권한 관리 admin API — desktop 백오피스 Phase A (MASTER 전용).
 *
 * <p>아로로지스 MASTER 가 {@code arologis.*} page-code 의 롤별 권한(view/edit) 매트릭스를
 * 조회·할당한다. grant 는 중앙 auth-service {@code role_page_permissions} 에 저장되며, 본 컨트롤러는
 * {@link AuthPermissionAdminClient} 를 통해 auth-service 내부 엔드포인트로 위임한다.
 *
 * <p><b>도메인 스코프 가드(핵심 보안)</b>:
 * <ul>
 *   <li>조회 — {@code arologis.} prefix 로만 매트릭스를 요청한다(타 도메인 grant 미노출).</li>
 *   <li>할당 — {@code pageCode.startsWith("arologis.")} 가 아니면 {@link BusinessException}(FORBIDDEN)
 *       으로 거부하여 타 도메인 grant 변조를 차단한다.</li>
 * </ul>
 *
 * <p>인증 = X-User-* 헤더(게이트웨이 주입) + {@code @RequirePermission} 동적 권한 가드. 접근 통제는
 * page-code {@code arologis.admin.permissions} grant(MASTER 전용 시드)로만 하며 — ArologisHrController
 * 선례 동일. 응답 DTO 는 roleCode/pageCode 비즈니스 키만 노출하고 UUID 는 비공개한다.
 */
@RestController
@RequestMapping("/admin/arologis/permissions")
@RequiredArgsConstructor
public class ArologisPermissionAdminController {

    /** 본 화면이 다루는 도메인 page-code prefix — 조회/쓰기 스코프 가드의 단일 출처. */
    private static final String AROLOGIS_PAGE_PREFIX = "arologis.";

    /**
     * 중앙 MASTER 롤 코드 — 변경 사전 거부 대상.
     *
     * <p>auth-service {@code DynamicPermissionService} 가 MASTER 를 항상 전 페이지 전권으로
     * 하드코딩하므로(=DB override 변경 금지), 본 컨트롤러도 정규화 전 중앙 MASTER 변경 시도를
     * 사전 거부하여 auth 의 MASTER 보호 정책과 정합을 맞춘다. (AROLOGIS_MASTER / AROLOGIS_MANAGER /
     * MANAGER 등 정규화 대상 롤은 허용 — 정규화 후 auth 측 가드가 최종 판단한다.)
     */
    private static final String CENTRAL_MASTER_ROLE = "MASTER";

    /** 게이트웨이/JwtFilter 가 주입하는 실 actor userId 헤더 — 감사 actor 전파용. */
    private static final String USER_ID_HEADER = "X-User-Id";

    private final AuthPermissionAdminClient authPermissionAdminClient;

    /**
     * arologis.* 롤별 권한 매트릭스 조회.
     *
     * <p>{@code arologis.} prefix 로 스코프하여 실제 grant 된 롤 행만 반환한다. 롤은 grant 시드에 따라
     * MASTER/MANAGER/AROLOGIS_MASTER/AROLOGIS_MANAGER 등 그대로 노출되며, page-code 는 arologis.* 만
     * 포함된다.
     *
     * @return roleCode → pageCode → 권한 정보 매트릭스
     */
    @Operation(summary = "아로로지스 권한 매트릭스 조회")
    @GetMapping
    @RequirePermission(page = "arologis.admin.permissions", action = PermissionAction.VIEW)
    public ApiResponse<Map<String, Map<String, RolePagePermissionView>>> getMatrix() {
        return ApiResponse.ok(authPermissionAdminClient.getRoleMatrix(AROLOGIS_PAGE_PREFIX));
    }

    /**
     * arologis.* 단일 롤-페이지 권한 할당(upsert).
     *
     * <p><b>스코프 가드</b>: {@code pageCode} 가 {@code arologis.} 로 시작하지 않으면 즉시 거부하여
     * 타 도메인 grant 변조를 차단한다. {@code canEdit=true} 인 경우 중앙 도메인 규칙상 {@code canView}
     * 가 자동 true 로 보장된다.
     *
     * <p><b>MASTER 보호 가드</b>: 정규화 전 중앙 {@code MASTER} 롤 변경 시도는 사전 거부한다.
     * auth-service 는 MASTER 를 항상 전권으로 하드코딩하여 DB override 변경을 막으므로, 클라이언트
     * 호출 전에 동일 정책으로 차단해 불필요한 왕복과 혼선을 방지한다. (AROLOGIS_MASTER /
     * AROLOGIS_MANAGER / MANAGER 등은 허용.)
     *
     * <p><b>감사 actor 전파</b>: 게이트웨이/JwtFilter 가 주입한 {@code X-User-Id}(실 사용자) 를
     * client 로 넘겨 auth role-grant 가 그 actor 로 감사 기록하도록 한다.
     *
     * @param request      권한 할당 요청 (roleCode / pageCode / canView / canEdit)
     * @param actorUserId  요청자 식별자 (X-User-Id 헤더, 게이트웨이 주입)
     * @return upsert 결과 권한 정보
     * @throws BusinessException(FORBIDDEN) pageCode 가 arologis.* 가 아니거나 MASTER 변경 시도인 경우
     */
    @Operation(summary = "아로로지스 권한 할당(upsert)")
    @PutMapping
    @RequirePermission(page = "arologis.admin.permissions", action = PermissionAction.UPDATE)
    public ApiResponse<RolePagePermissionView> updateGrant(
            @Valid @RequestBody RoleGrantRequest request,
            @RequestHeader(value = USER_ID_HEADER, required = false) String actorUserId) {
        if (request.pageCode() == null || !request.pageCode().startsWith(AROLOGIS_PAGE_PREFIX)) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "arologis 외 page-code 변경 불가");
        }
        if (CENTRAL_MASTER_ROLE.equals(request.roleCode())) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "MASTER 롤 권한은 변경할 수 없습니다");
        }
        return ApiResponse.ok(authPermissionAdminClient.updateRoleGrant(
                request.roleCode(), request.pageCode(),
                request.canView(), request.canEdit(), actorUserId));
    }

    /**
     * 권한 할당 요청 (UUID 비공개 — roleCode/pageCode 비즈니스 키만 사용).
     *
     * @param roleCode 역할 코드 (대문자/밑줄)
     * @param pageCode 페이지 코드 (arologis.* — 컨트롤러 가드로 강제)
     * @param canView  조회 권한 부여 여부
     * @param canEdit  편집 권한 부여 여부 (true 이면 canView 자동 true)
     */
    public record RoleGrantRequest(
            @NotBlank(message = "역할 코드는 필수입니다")
            @Size(max = 20, message = "역할 코드는 20자 이내여야 합니다")
            @Pattern(regexp = "^[A-Z_]+$", message = "역할 코드는 대문자와 밑줄만 허용됩니다")
            String roleCode,

            @NotBlank(message = "페이지 코드는 필수입니다")
            @Size(max = 100, message = "페이지 코드는 100자 이내여야 합니다")
            @Pattern(regexp = "^[a-z0-9\\-.]+$", message = "페이지 코드는 소문자, 숫자, 하이픈, 점만 허용됩니다")
            String pageCode,

            boolean canView,
            boolean canEdit) {
    }
}

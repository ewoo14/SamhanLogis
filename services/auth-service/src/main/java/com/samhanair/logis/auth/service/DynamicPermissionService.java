package com.samhanair.logis.auth.service;

import com.samhanair.logis.auth.domain.PageCode;
import com.samhanair.logis.auth.domain.RolePagePermission;
import com.samhanair.logis.auth.repository.RolePagePermissionRepository;
import com.samhanair.logis.auth.service.dto.PermissionDto;
import com.samhanair.logis.auth.web.dto.PermissionBatchUpdateRequest;
import com.samhanair.logis.auth.web.dto.PermissionUpdateRequest;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 동적 RBAC 권한 서비스 — SP-D1.
 *
 * <p>핵심 전략:
 * <ol>
 *   <li>DB {@code role_page_permissions} 에 활성 override row 가 있으면 DB 값 우선 사용.</li>
 *   <li>row 가 없으면 {@code canView = false, canEdit = false} (보수적 fallback).</li>
 *   <li>기존 {@code @PreAuthorize} 는 이 서비스와 독립적으로 작동 — 변경 금지.</li>
 * </ol>
 *
 * <p>권한 갱신은 MASTER 전용. 컨트롤러({@link com.samhanair.logis.auth.web.PermissionAdminController})
 * 레벨에서 {@code @PreAuthorize("hasRole('MASTER')")} 로 가드.
 *
 * <p>Spring Security SpEL 직접 호출용 bean 이름: {@code dynamicPermission}.
 * 사용 예:
 * <pre>
 *   {@code @PreAuthorize("@dynamicPermission.canView(#role, 'accounting.tax-invoice.emit-nts')")}
 * </pre>
 */
@Slf4j
@Service("dynamicPermission")
@RequiredArgsConstructor
public class DynamicPermissionService {

    private final RolePagePermissionRepository repository;

    // -----------------------------------------------------------------------
    // 권한 조회 API (Spring Security SpEL 에서 직접 호출 가능)
    // -----------------------------------------------------------------------

    /**
     * DB override 기반 조회 권한 확인.
     *
     * <p>DB override row 존재 → DB 값 사용. row 없음 → {@code false} (보수적 fallback).
     *
     * @param roleCode 역할 코드 (예: ACCOUNTANT)
     * @param pageCode 페이지 코드 (예: accounting.tax-invoice.emit-nts)
     * @return 조회 가능하면 {@code true}
     */
    @Transactional(readOnly = true)
    public boolean canView(String roleCode, String pageCode) {
        return repository.findByRoleCodeAndPageCode(roleCode, pageCode)
                .map(RolePagePermission::isCanView)
                .orElse(false);
    }

    /**
     * DB override 기반 편집 권한 확인.
     *
     * <p>DB override row 존재 → DB 값 사용. row 없음 → {@code false} (보수적 fallback).
     *
     * @param roleCode 역할 코드
     * @param pageCode 페이지 코드
     * @return 편집 가능하면 {@code true}
     */
    @Transactional(readOnly = true)
    public boolean canEdit(String roleCode, String pageCode) {
        return repository.findByRoleCodeAndPageCode(roleCode, pageCode)
                .map(RolePagePermission::isCanEdit)
                .orElse(false);
    }

    /**
     * 조회 또는 편집 권한 통합 확인 — {@code permissionType} 파라미터로 구분.
     *
     * <p>Spring Security SpEL 에서 단일 메서드로 VIEW/EDIT 구분:
     * <pre>
     *   {@code @PreAuthorize("@dynamicPermission.canAccess(#role, 'dispatch.board', 'VIEW')")}
     * </pre>
     *
     * @param roleCode       역할 코드
     * @param pageCode       페이지 코드
     * @param permissionType {@code "VIEW"} 또는 {@code "EDIT"}
     * @return 권한이 있으면 {@code true}
     * @throws BusinessException(INVALID_INPUT) permissionType 이 VIEW/EDIT 이 아닌 경우
     */
    @Transactional(readOnly = true)
    public boolean canAccess(String roleCode, String pageCode, String permissionType) {
        return switch (permissionType == null ? "" : permissionType.toUpperCase()) {
            case "VIEW" -> canView(roleCode, pageCode);
            case "EDIT" -> canEdit(roleCode, pageCode);
            default -> throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "permissionType 은 VIEW 또는 EDIT 이어야 합니다: " + permissionType);
        };
    }

    // -----------------------------------------------------------------------
    // 매트릭스 조회 (마스터 관리 화면용)
    // -----------------------------------------------------------------------

    /**
     * 전체 권한 매트릭스 조회 — 역할 × 페이지 형태로 반환.
     *
     * <p>구조: {@code Map<roleCode, Map<pageCode, PermissionDto>>}
     * DB 에 row 가 없는 조합은 {@code isOverride = false} 의 기본값 DTO 로 채워짐.
     *
     * @return 전체 매트릭스 (roleCode → pageCode → PermissionDto)
     */
    @Transactional(readOnly = true)
    public Map<String, Map<String, PermissionDto>> getPermissionMatrix() {
        List<RolePagePermission> dbRows = repository.findAllOrderByRoleCodeAndPageCode();

        // DB row 를 (roleCode, pageCode) 키로 인덱싱
        Map<String, Map<String, RolePagePermission>> dbIndex = new LinkedHashMap<>();
        for (RolePagePermission p : dbRows) {
            dbIndex.computeIfAbsent(p.getRoleCode(), k -> new LinkedHashMap<>())
                    .put(p.getPageCode(), p);
        }

        // 모든 역할 × 페이지 조합으로 매트릭스 구성
        // SP-D6-2 cycle 1e: V30에서 seed 된 DEVELOPER/PARTNER row도 GUI 매트릭스에서 편집 가능해야 한다.
        List<String> allRoles = List.of(
                "MASTER", "DEVELOPER", "MANAGER", "ACCOUNTANT", "SALES", "WAREHOUSE", "DISPATCH", "INVENTORY",
                "STAFF", "DRIVER", "PARTNER");
        List<PageCode> allPages = Arrays.asList(PageCode.values());

        Map<String, Map<String, PermissionDto>> matrix = new LinkedHashMap<>();
        for (String role : allRoles) {
            Map<String, PermissionDto> pageMap = new LinkedHashMap<>();
            for (PageCode pc : allPages) {
                String code = pc.getCode();
                RolePagePermission dbRow = dbIndex.getOrDefault(role, Map.of()).get(code);
                if (dbRow != null) {
                    pageMap.put(code, new PermissionDto(
                            role, code, pc.getDisplayName(),
                            dbRow.isCanView(), dbRow.isCanEdit(), true));
                } else {
                    // DB row 없음 = fallback (기본 비허용)
                    pageMap.put(code, new PermissionDto(
                            role, code, pc.getDisplayName(),
                            false, false, false));
                }
            }
            matrix.put(role, pageMap);
        }
        return matrix;
    }

    /**
     * 단일 권한 조회 (PermissionDto 형태).
     *
     * @param roleCode 역할 코드
     * @param pageCode 페이지 코드
     * @return PermissionDto (DB override 여부 포함)
     */
    @Transactional(readOnly = true)
    public PermissionDto getPermission(String roleCode, String pageCode) {
        String displayName = resolveDisplayName(pageCode);
        return repository.findByRoleCodeAndPageCode(roleCode, pageCode)
                .map(p -> new PermissionDto(roleCode, pageCode, displayName,
                        p.isCanView(), p.isCanEdit(), true))
                .orElse(new PermissionDto(roleCode, pageCode, displayName,
                        false, false, false));
    }

    // -----------------------------------------------------------------------
    // 권한 갱신 (MASTER 전용)
    // -----------------------------------------------------------------------

    // -----------------------------------------------------------------------
    // 현재 사용자 권한 목록 조회 (FE GET /auth/admin/permissions/my 용)
    // -----------------------------------------------------------------------

    /**
     * 특정 역할의 활성 권한 row 목록을 조회한다.
     *
     * <p>DB override row 가 존재하는 항목만 반환.
     * row 미존재 항목은 fallback(false)이므로 응답에 포함하지 않는다.
     *
     * <p>MASTER 역할은 특별 처리:
     * DB row 유무에 관계없이 12개 PageCode 모두 canView=true / canEdit=true 반환.
     *
     * @param roleCode 역할 코드 (예: ACCOUNTANT, MASTER)
     * @return 활성 override row 목록 (canView 또는 canEdit 이 true 인 항목만)
     */
    @Transactional(readOnly = true)
    public List<PermissionDto> getMyPermissions(String roleCode) {
        if ("MASTER".equalsIgnoreCase(roleCode)) {
            return Arrays.stream(PageCode.values())
                    .map(pc -> new PermissionDto(
                            "MASTER", pc.getCode(), pc.getDisplayName(), true, true, true))
                    .collect(Collectors.toList());
        }
        return repository.findByRoleCode(roleCode).stream()
                .map(p -> new PermissionDto(
                        p.getRoleCode(), p.getPageCode(),
                        resolveDisplayName(p.getPageCode()),
                        p.isCanView(), p.isCanEdit(), true))
                .collect(Collectors.toList());
    }

    /**
     * 단일 권한 갱신 또는 신규 등록.
     *
     * <p>처리 흐름:
     * <ol>
     *   <li>MASTER roleCode 변경 시도 → 거부 (403 — MASTER 는 항상 전권으로 하드코딩)</li>
     *   <li>pageCode 유효성 검증 ({@link PageCode#isValid(String)})</li>
     *   <li>기존 활성 row 조회 → 있으면 도메인 메서드로 갱신, 없으면 신규 생성</li>
     *   <li>저장 후 {@link PermissionDto} 반환</li>
     * </ol>
     *
     * @param request   갱신 요청 (roleCode / pageCode / canView / canEdit)
     * @param actorId   요청자 userId (X-User-Id 헤더)
     * @return 갱신된 권한 정보
     * @throws BusinessException(FORBIDDEN) MASTER 권한 변경 시도 시 (403)
     * @throws BusinessException(INVALID_INPUT) 미등록 pageCode 인 경우 (400)
     */
    @Transactional
    public PermissionDto updatePermission(PermissionUpdateRequest request, String actorId) {
        return updatePermission(request, actorId, null);
    }

    /**
     * 단일 role override 권한을 갱신한다.
     *
     * <p>관리 page-code 는 위임받은 비MASTER가 role override 로 부여할 수 없도록 MASTER 전용으로
     * 차단한다.
     *
     * @param request   갱신 요청
     * @param actorId   요청자 userId
     * @param actorRole 요청자 role header 값
     * @return 갱신된 권한
     */
    @Transactional
    public PermissionDto updatePermission(PermissionUpdateRequest request, String actorId, String actorRole) {
        if ("MASTER".equalsIgnoreCase(request.roleCode())) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "MASTER 역할의 권한은 변경할 수 없습니다. MASTER 는 항상 전 페이지 전권입니다.");
        }
        validatePageCode(request.pageCode());
        ManagementPageMutationGuard.rejectManagementPageMutation(request.pageCode(), actorRole);
        String displayName = resolveDisplayName(request.pageCode());

        Optional<RolePagePermission> existing =
                repository.findByRoleCodeAndPageCode(request.roleCode(), request.pageCode());

        RolePagePermission saved;
        if (existing.isPresent()) {
            RolePagePermission perm = existing.get();
            perm.updatePermissions(request.canView(), request.canEdit());
            saved = repository.save(perm);
            log.info("[SP-D1] 권한 갱신 — roleCode={} pageCode={} canView={} canEdit={} actorName={}",
                    request.roleCode(), request.pageCode(),
                    request.canView(), request.canEdit(), ActorDisplayName.resolve(actorId, null));
        } else {
            RolePagePermission newPerm = RolePagePermission.create(
                    request.roleCode(), request.pageCode(),
                    request.canView(), request.canEdit());
            // canEdit=true 시 canView 자동 보장은 도메인 메서드에서 처리
            // create 이후 도메인 메서드로 재확인
            newPerm.updatePermissions(request.canView(), request.canEdit());
            saved = repository.save(newPerm);
            log.info("[SP-D1] 권한 신규 등록 — roleCode={} pageCode={} canView={} canEdit={} actorName={}",
                    request.roleCode(), request.pageCode(),
                    request.canView(), request.canEdit(), ActorDisplayName.resolve(actorId, null));
        }

        return new PermissionDto(
                saved.getRoleCode(), saved.getPageCode(), displayName,
                saved.isCanView(), saved.isCanEdit(), true);
    }

    /**
     * 다건 권한 일괄 갱신.
     *
     * <p>각 항목을 {@link #updatePermission(PermissionUpdateRequest, String)} 으로 순차 처리.
     * 하나라도 실패 시 전체 트랜잭션 롤백.
     *
     * @param request 일괄 갱신 요청 (최대 100건)
     * @param actorId 요청자 userId
     * @return 갱신된 권한 목록
     */
    @Transactional
    public List<PermissionDto> updatePermissionsBatch(
            PermissionBatchUpdateRequest request, String actorId) {
        return updatePermissionsBatch(request, actorId, null);
    }

    /**
     * role override 권한을 일괄 갱신한다.
     *
     * @param request   일괄 갱신 요청
     * @param actorId   요청자 userId
     * @param actorRole 요청자 role header 값
     * @return 갱신된 권한 목록
     */
    @Transactional
    public List<PermissionDto> updatePermissionsBatch(
            PermissionBatchUpdateRequest request,
            String actorId,
            String actorRole) {
        return request.permissions().stream()
                .map(item -> updatePermission(item, actorId, actorRole))
                .collect(Collectors.toList());
    }

    /**
     * 권한 override 삭제 (soft-delete).
     *
     * <p>삭제 후 해당 (roleCode, pageCode) 조합은 fallback 정책으로 복귀.
     *
     * @param roleCode 역할 코드
     * @param pageCode 페이지 코드
     * @param actorId  요청자 userId
     * @throws BusinessException(FORBIDDEN) MASTER 권한 삭제 시도 시 (403)
     * @throws BusinessException(NOT_FOUND) override row 가 없는 경우 (404)
     */
    @Transactional
    public void deletePermission(String roleCode, String pageCode, String actorId) {
        deletePermission(roleCode, pageCode, actorId, null);
    }

    /**
     * role override 권한을 soft-delete 한다.
     *
     * <p>관리 page-code 회수도 권한 위임 구조를 바꾸는 행위이므로 MASTER 전용으로 제한한다.
     *
     * @param roleCode  역할 코드
     * @param pageCode  page-code
     * @param actorId   요청자 userId
     * @param actorRole 요청자 role header 값
     */
    @Transactional
    public void deletePermission(String roleCode, String pageCode, String actorId, String actorRole) {
        if ("MASTER".equalsIgnoreCase(roleCode)) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "MASTER 역할의 권한은 삭제할 수 없습니다. MASTER 는 항상 전 페이지 전권입니다.");
        }
        validatePageCode(pageCode);
        ManagementPageMutationGuard.rejectManagementPageMutation(pageCode, actorRole);
        RolePagePermission perm = repository.findByRoleCodeAndPageCode(roleCode, pageCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "권한 override 행을 찾을 수 없습니다: roleCode=" + roleCode + ", pageCode=" + pageCode));
        perm.markDeleted(actorId);
        repository.save(perm);
        log.info("[SP-D1] 권한 override 삭제 — roleCode={} pageCode={} actorName={}",
                roleCode, pageCode, ActorDisplayName.resolve(actorId, null));
    }

    // -----------------------------------------------------------------------
    // 내부 유틸
    // -----------------------------------------------------------------------

    private void validatePageCode(String pageCode) {
        if (!PageCode.isValid(pageCode)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "등록되지 않은 페이지 코드입니다: " + pageCode
                            + ". SP-D2 에서 신규 페이지 추가 시 PageCode enum 을 먼저 확장하세요.");
        }
    }

    private String resolveDisplayName(String pageCode) {
        try {
            return PageCode.fromCode(pageCode).getDisplayName();
        } catch (IllegalArgumentException e) {
            return pageCode;  // 미등록 코드는 코드 그대로 사용
        }
    }

    /**
     * UUID 파싱 유틸 — 헤더에서 받은 actorId 가 UUID 형식이 아닐 수 있으므로 방어 처리.
     *
     * @param actorId userId 문자열 (null 가능)
     * @return UUID 또는 nil UUID (파싱 실패 시)
     */
    @SuppressWarnings("unused")
    private UUID parseActorId(String actorId) {
        if (actorId == null || actorId.isBlank()) {
            return new UUID(0L, 0L);
        }
        try {
            return UUID.fromString(actorId);
        } catch (IllegalArgumentException e) {
            return new UUID(0L, 0L);
        }
    }
}

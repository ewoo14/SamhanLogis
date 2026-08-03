package com.samhanair.logis.user.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.user.repository.EmployeeRepository;
import com.samhanair.logis.user.service.EmployeeSignatureService;
import com.samhanair.logis.user.web.dto.BulkDisplayNameRequest;
import com.samhanair.logis.user.web.dto.BulkVerifyRequest;
import com.samhanair.logis.user.web.dto.BulkVerifyResponse;
import com.samhanair.logis.user.web.dto.EmployeeSignatureDto;
import com.samhanair.logis.user.web.dto.InternalEmployeeDirectoryResponse;
import com.samhanair.logis.user.web.dto.InternalEmployeeLookupResponse;
import com.samhanair.logis.user.web.dto.InternalEmployeeSearchResponse;
import com.samhanair.logis.user.web.dto.InternalSignatureBatchRequest;
import com.samhanair.logis.user.web.dto.InternalUserResponse;
import jakarta.validation.Valid;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 형제 service (notification-service / groupware-service / partner-service / partner-order-service /
 * slip-service) 가 직원 정보를 lookup 하는 Internal endpoint.
 *
 * <p>Phase 9 W3 신규 — Phase 9 W1/W2 의 UserClient 가 호출하는 단건 lookup 의 실 endpoint 보유 +
 * Phase 9 W3 BE backlog #4 채택 (UserClient bulk verify endpoint 추가, fan-out 직렬 RPC 비용 해소).
 *
 * <p>인증 = X-Internal-Token 필수. 토큰 누락 시 익명 요청 → AuthorizationFilter 의 AccessDenied → 403.
 * 토큰 불일치 시 InternalTokenFilter 가 직접 401 응답.
 *
 * <p>UUID 비공개 가드 — 본 응답은 형제 service 만 받는다 (사용자 화면 직접 노출 X).
 */
@RestController
@RequestMapping("/internal/users")
@RequiredArgsConstructor
public class InternalUserController {

    private final EmployeeRepository employeeRepository;
    private final EmployeeSignatureService signatureService;

    /**
     * 종합견적서 담당자 directory 조회.
     *
     * <p>담당자는 거래처 연락처가 아니라 우리 행정직원(Employee)이다. blank q 는 전체 활성 직원을
     * 반환하며, ecountCode 는 legacy 담당자코드로 estimate-app 에 전달된다.
     *
     * @param q 직원명 부분일치 검색어
     * @param limit 최대 반환 건수 (상한 1000)
     * @return 200 + 담당자 directory 목록 ; 토큰 누락 403 ; 토큰 불일치 401
     */
    @GetMapping("/employees")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<List<InternalEmployeeDirectoryResponse>> employees(
            @RequestParam(value = "q", required = false, defaultValue = "") String q,
            @RequestParam(value = "limit", defaultValue = "500") int limit) {
        String normalized = q == null || q.isBlank() ? null : escapeLikeLiteral(q.trim());
        int normalizedLimit = Math.min(Math.max(limit, 1), 1000);
        List<InternalEmployeeDirectoryResponse> employees = employeeRepository
                .searchEmployeeDirectory(normalized, PageRequest.of(0, normalizedLimit))
                .stream()
                .map(employee -> new InternalEmployeeDirectoryResponse(
                        employee.getId(),
                        employee.getFullName(),
                        employee.getEcountCode(),
                        employee.getDepartment() == null ? null : employee.getDepartment().getName()))
                .toList();
        return ApiResponse.ok(employees);
    }

    /**
     * 사용자 단건 존재 확인 + 기본 정보 lookup. notification-service / groupware-service / partner-service
     * 의 UserClient.exists 가 호출.
     *
     * @param userId user UUID
     * @return 200 + InternalUserResponse ; 미존재 404 ; 토큰 불일치 401 ; 토큰 누락 403
     */
    @GetMapping("/{userId}")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<InternalUserResponse> findOne(@PathVariable UUID userId) {
        var emp = employeeRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다: " + userId));
        return ApiResponse.ok(new InternalUserResponse(
                emp.getId(),
                emp.getLoginId(),
                emp.getFullName(),
                emp.getRoleSnapshot()));
    }

    /**
     * 직원명 exact lookup. accounting-service MIG-10 Order.manager_name cross-link 에서 사용한다.
     *
     * <p>0건/2건 이상도 정상 200 + 배열로 반환한다. caller 가 miss/ambiguous warning 으로 분기한다.
     */
    @GetMapping("/by-name")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<List<InternalEmployeeLookupResponse>> findByName(@RequestParam("name") String name) {
        String normalized = name == null ? "" : name.trim();
        if (normalized.isBlank()) {
            return ApiResponse.ok(List.of());
        }
        List<InternalEmployeeLookupResponse> employees = employeeRepository.findTop20ByFullName(normalized).stream()
                .map(emp -> new InternalEmployeeLookupResponse(emp.getId(), emp.getFullName()))
                .toList();
        return ApiResponse.ok(employees);
    }

    /**
     * 직원명/loginId 부분일치 검색. groupware-service 결재자 picker 가 호출한다.
     *
     * <p>빈 q 는 빈 배열, limit 은 기본 20 / 상한 10000 으로 제한한다.
     */
    @GetMapping("/search")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<List<InternalEmployeeSearchResponse>> search(
            @RequestParam("q") String q,
            @RequestParam(value = "limit", defaultValue = "20") int limit,
            @RequestParam(value = "activeOnly", defaultValue = "false") boolean activeOnly) {
        String normalized = q == null ? "" : q.trim();
        if (normalized.isBlank()) {
            return ApiResponse.ok(List.of());
        }
        int normalizedLimit = Math.min(Math.max(limit, 1), 10000);
        String escaped = escapeLikeLiteral(normalized);
        List<InternalEmployeeSearchResponse> employees = (activeOnly
                ? employeeRepository.searchInternalActiveRecipients(escaped, PageRequest.of(0, normalizedLimit))
                : employeeRepository.searchInternalApprovers(escaped, PageRequest.of(0, normalizedLimit))).stream()
                .map(emp -> new InternalEmployeeSearchResponse(
                        emp.getId(),
                        emp.getFullName(),
                        emp.getDepartment() == null ? null : emp.getDepartment().getName(),
                        emp.getRoleSnapshot().name(),
                        emp.getEcountCode()))
                .toList();
        return ApiResponse.ok(employees);
    }

    private static String escapeLikeLiteral(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    /**
     * 이메일 exact lookup — #31 estimate-app(종합견적서 웹) 접속 게이트.
     *
     * <p>legacy 는 Notion AUTH DB 에서 email 로 승인 여부를 조회했다. 우리 치환 = 사용자
     * 마스터(Employee, soft-delete 활성만) 존재 여부. 미존재 404 → caller 가 미승인 처리.
     */
    @GetMapping("/by-email")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<InternalUserResponse> findByEmail(@RequestParam("email") String email) {
        String normalized = email == null ? "" : email.trim();
        if (normalized.isBlank()) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "이메일이 비었습니다");
        }
        var emp = employeeRepository.findByEmail(normalized)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "직원을 찾을 수 없습니다: " + normalized));
        return ApiResponse.ok(new InternalUserResponse(
                emp.getId(),
                emp.getLoginId(),
                emp.getFullName(),
                emp.getRoleSnapshot()));
    }

    /**
     * 사용자 다건 존재 검증 — Phase 9 W3 BE backlog #4 채택. notification-service / groupware-service 의
     * UserClient.verifyBulk 가 호출. 한 번의 RPC 로 N user 의 존재 여부 일괄 응답.
     *
     * @param req 검증 대상 user UUID 목록
     * @return 200 + {@code exists: { uuid: bool }} 매핑
     */
    @PostMapping("/verify-bulk")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<BulkVerifyResponse> verifyBulk(@Valid @RequestBody BulkVerifyRequest req) {
        List<UUID> ids = req.userIds() == null ? List.of() : req.userIds();
        if (ids.isEmpty()) {
            return ApiResponse.ok(new BulkVerifyResponse(Map.of()));
        }
        Set<UUID> distinct = new HashSet<>(ids);
        Set<UUID> existing = new HashSet<>();
        employeeRepository.findAllByIdIn(distinct).forEach(e -> existing.add(e.getId()));
        Map<UUID, Boolean> exists = new HashMap<>();
        for (UUID id : distinct) {
            exists.put(id, existing.contains(id));
        }
        return ApiResponse.ok(new BulkVerifyResponse(exists));
    }

    /**
     * 메신저 발송 직전 재직 상태 일괄 검증. 검색 시점 이후 퇴사 처리된 직원은 false다.
     * 존재 여부 검증과 별도 endpoint로 두어 호출자가 반드시 최신 재직 계약을 선택하게 한다.
     */
    @PostMapping("/verify-active-bulk")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<BulkVerifyResponse> verifyActiveBulk(@Valid @RequestBody BulkVerifyRequest req) {
        List<UUID> ids = req.userIds() == null ? List.of() : req.userIds();
        if (ids.isEmpty()) {
            return ApiResponse.ok(new BulkVerifyResponse(Map.of()));
        }
        Set<UUID> distinct = new HashSet<>(ids);
        Set<UUID> active = new HashSet<>();
        employeeRepository.findAllActiveByIdIn(distinct).forEach(e -> active.add(e.getId()));
        Map<UUID, Boolean> result = new HashMap<>();
        distinct.forEach(id -> result.put(id, active.contains(id)));
        return ApiResponse.ok(new BulkVerifyResponse(result));
    }

    /**
     * 사용자 표시명 다건 조회. groupware-service 결재 목록/상세가 요청자와 결재자 표시명을
     * 한 번의 RPC 로 해석할 때 사용한다.
     *
     * @param req 조회 대상 user UUID 목록
     * @return 존재하는 활성 직원의 {@code userId -> fullName} 매핑
     */
    @PostMapping("/display-names")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<Map<UUID, String>> displayNames(@Valid @RequestBody BulkDisplayNameRequest req) {
        List<UUID> ids = req.userIds() == null ? List.of() : req.userIds();
        if (ids.isEmpty()) {
            return ApiResponse.ok(Map.of());
        }
        Set<UUID> distinct = ids.stream()
                .filter(java.util.Objects::nonNull)
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
        if (distinct.isEmpty()) {
            return ApiResponse.ok(Map.of());
        }
        Map<UUID, String> displayNames = new LinkedHashMap<>();
        employeeRepository.findAllByIdIn(distinct)
                .forEach(employee -> displayNames.put(employee.getId(), employee.getFullName()));
        return ApiResponse.ok(displayNames);
    }

    /**
     * 사원 서명 다건 조회 - C1a. slip-service 가 출고전표 결재란(작성자/출고인/검수인) 인감을
     * enrich 할 때 dispatcher/inspector/owner userId 의 서명을 한 번의 RPC 로 해석한다.
     *
     * <p>join key = {@code Employee.id} = slip 의 createdBy/dispatcherUserId/inspectorUserId (P4).
     * display-names/verify-bulk 배치 패턴 미러 - {@code findAllByIdIn}. 미등록 사원은 맵에서 생략한다.
     *
     * @param req 조회 대상 user UUID 목록
     * @return 존재·등록 사원의 {@code userId -> EmployeeSignatureDto} 매핑
     */
    @PostMapping("/signatures")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<Map<UUID, EmployeeSignatureDto>> signatures(
            @Valid @RequestBody InternalSignatureBatchRequest req) {
        return ApiResponse.ok(signatureService.resolveSignatures(req.userIds()));
    }
}

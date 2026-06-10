package com.samhanair.logis.user.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.user.repository.EmployeeRepository;
import com.samhanair.logis.user.web.dto.BulkVerifyRequest;
import com.samhanair.logis.user.web.dto.BulkVerifyResponse;
import com.samhanair.logis.user.web.dto.InternalEmployeeLookupResponse;
import com.samhanair.logis.user.web.dto.InternalUserResponse;
import jakarta.validation.Valid;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
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
}

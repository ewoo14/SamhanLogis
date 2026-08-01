package com.samhanair.logis.user.client;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.security.Role;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.Map;
import java.util.UUID;
import org.springframework.core.ParameterizedTypeReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Internal-token-authenticated client to {@code auth-service}'s {@code /auth/internal/accounts}
 * endpoints. All methods throw {@link BusinessException} on non-2xx — {@link ErrorCode#CONFLICT}
 * for 409 (duplicate loginId) and {@link ErrorCode#INTERNAL_ERROR} for everything else, so the
 * provisioning saga can decide whether to compensate.
 */
@Component
public class AuthClient {

    private static final ParameterizedTypeReference<ApiResponse<AccountLookupResponse>>
            ACCOUNT_LOOKUP_RESPONSE = new ParameterizedTypeReference<>() {};

    private static final Logger log = LoggerFactory.getLogger(AuthClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String AUTH_SERVICE_BASE = "http://auth-service";

    private final RestClient restClient;
    private final InternalAuthProperties properties;

    public AuthClient(RestClient.Builder loadBalancedRestClientBuilder, InternalAuthProperties properties) {
        this.properties = properties;
        this.restClient = loadBalancedRestClientBuilder
                .baseUrl(AUTH_SERVICE_BASE)
                .build();
    }

    public void createAccount(UUID id, String loginId, String password, String displayName, Role role) {
        createAccount(id, loginId, password, displayName, role, false);
    }

    /**
     * auth-service에서 활성 계정의 ID를 읽는다.
     *
     * <p>계정이 없거나 비활성화된 경우 auth-service의 404를 그대로 {@code NOT_FOUND}로
     * 전달하여 호출자가 계획을 fail-closed 할 수 있게 한다.
     *
     * @param loginId 조회할 로그인 아이디
     * @return auth-service에 현재 존재하고 활성인 계정의 ID
     */
    public UUID findActiveAccountIdByLoginId(String loginId) {
        try {
            ApiResponse<AccountLookupResponse> response = restClient.get()
                    .uri(uriBuilder -> uriBuilder.path("/auth/internal/accounts/by-login")
                            .queryParam("loginId", loginId).build())
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .retrieve()
                    .onStatus(status -> status.value() == 404, (req, res) -> {
                        throw new BusinessException(ErrorCode.NOT_FOUND,
                                "활성 auth 계정을 찾을 수 없습니다");
                    })
                    .onStatus(HttpStatusCode::isError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "auth-service account lookup failed: " + res.getStatusCode());
                    })
                    .body(ACCOUNT_LOOKUP_RESPONSE);
            if (response == null || response.getData() == null || response.getData().accountId() == null) {
                throw new BusinessException(ErrorCode.NOT_FOUND, "활성 auth 계정을 찾을 수 없습니다");
            }
            return response.getData().accountId();
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("AuthClient active account lookup failed: {}", ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "auth-service 호출 실패: active account lookup", ex);
        }
    }

    /** auth-service 내부 계정 ID 조회 응답. UUID는 서비스 간 계약에서만 사용한다. */
    public record AccountLookupResponse(UUID accountId) {}

    /**
     * auth-service 에 계정 생성 — {@code passwordChangeRequired} 플래그 전달 지원.
     *
     * <p>Phase 10 P0-5: MASTER 가 임시 비밀번호로 신규 직원을 등록할 때
     * {@code passwordChangeRequired = true} 로 호출하여 첫 로그인 후 변경 강제.
     *
     * @param id                    미리 발급한 UUID (user-service ↔ auth-service 공유)
     * @param loginId               로그인 아이디
     * @param password              임시 비밀번호 (평문)
     * @param displayName           표시 이름
     * @param role                  초기 역할
     * @param passwordChangeRequired 첫 로그인 후 비밀번호 변경 강제 여부
     */
    public void createAccount(UUID id, String loginId, String password, String displayName,
                               Role role, boolean passwordChangeRequired) {
        Map<String, Object> body = Map.of(
                "id", id.toString(),
                "loginId", loginId,
                "password", password,
                "displayName", displayName,
                "role", role.name(),
                "passwordChangeRequired", passwordChangeRequired);
        execute("POST createAccount", () -> restClient.post()
                .uri("/auth/internal/accounts")
                .header(INTERNAL_TOKEN_HEADER, requireToken())
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                    if (res.getStatusCode().value() == 409) {
                        throw new BusinessException(ErrorCode.CONFLICT, "이미 사용중인 아이디입니다");
                    }
                    throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                            "auth-service 4xx: " + res.getStatusCode());
                })
                .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                    throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                            "auth-service 5xx: " + res.getStatusCode());
                })
                .toBodilessEntity());
    }

    /**
     * auth-service 계정 잠금 해제 — MASTER 가 사용자 관리 화면에서 호출 (Phase 10 P0-5).
     *
     * @param id 잠금 해제할 계정 UUID
     */
    public void unlock(UUID id) {
        execute("POST unlock", () -> restClient.post()
                .uri("/auth/internal/accounts/{id}/unlock", id)
                .header(INTERNAL_TOKEN_HEADER, requireToken())
                .retrieve()
                .onStatus(HttpStatusCode::isError, (req, res) -> {
                    throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                            "auth-service unlock failed: " + res.getStatusCode());
                })
                .toBodilessEntity());
    }

    public void updateRole(UUID id, Role role) {
        execute("PATCH updateRole", () -> restClient.patch()
                .uri("/auth/internal/accounts/{id}/role", id)
                .header(INTERNAL_TOKEN_HEADER, requireToken())
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("role", role.name()))
                .retrieve()
                .onStatus(HttpStatusCode::isError, (req, res) -> {
                    throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                            "auth-service updateRole failed: " + res.getStatusCode());
                })
                .toBodilessEntity());
    }

    public void updateDisplayName(UUID id, String displayName) {
        execute("PATCH updateDisplayName", () -> restClient.patch()
                .uri("/auth/internal/accounts/{id}/display-name", id)
                .header(INTERNAL_TOKEN_HEADER, requireToken())
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("displayName", displayName))
                .retrieve()
                .onStatus(HttpStatusCode::isError, (req, res) -> {
                    throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                            "auth-service updateDisplayName failed: " + res.getStatusCode());
                })
                .toBodilessEntity());
    }

    public void disable(UUID id) {
        execute("PATCH disable", () -> restClient.patch()
                .uri("/auth/internal/accounts/{id}/disable", id)
                .header(INTERNAL_TOKEN_HEADER, requireToken())
                .retrieve()
                .onStatus(HttpStatusCode::isError, (req, res) -> {
                    throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                            "auth-service disable failed: " + res.getStatusCode());
                })
                .toBodilessEntity());
    }

    public void delete(UUID id) {
        execute("DELETE compensation", () -> restClient.delete()
                .uri("/auth/internal/accounts/{id}", id)
                .header(INTERNAL_TOKEN_HEADER, requireToken())
                .retrieve()
                .onStatus(HttpStatusCode::isError, (req, res) -> {
                    throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                            "auth-service delete failed: " + res.getStatusCode());
                })
                .toBodilessEntity());
    }

    /**
     * auth-service 계정 부서명 동기화 — Phase 12 인사 카테고리 가드.
     *
     * <p>user-service 에서 직원 등록/부서 변경 시 호출. 다음 로그인 JWT 에
     * {@code departmentName} claim 이 갱신된 값으로 포함된다.
     * {@code departmentName = null} 전달 시 미배정 상태로 초기화.
     *
     * @param id             대상 계정 UUID
     * @param departmentName 신규 부서명 (null = 미배정)
     */
    public void updateDepartmentName(UUID id, String departmentName) {
        java.util.Map<String, Object> body = new java.util.HashMap<>();
        body.put("departmentName", departmentName);  // null 허용 — HashMap 은 null value 지원
        execute("PATCH updateDepartmentName", () -> restClient.patch()
                .uri("/auth/internal/accounts/{id}/department-name", id)
                .header(INTERNAL_TOKEN_HEADER, requireToken())
                .contentType(MediaType.APPLICATION_JSON)
                .body((Object) body)
                .retrieve()
                .onStatus(HttpStatusCode::isError, (req, res) -> {
                    throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                            "auth-service updateDepartmentName failed: " + res.getStatusCode());
                })
                .toBodilessEntity());
    }

    private String requireToken() {
        String token = properties.getToken();
        if (token == null || token.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "app.security.internal.token 미설정");
        }
        return token;
    }

    private void execute(String label, Runnable call) {
        try {
            call.run();
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("AuthClient {} failed: {}", label, ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "auth-service 호출 실패: " + label, ex);
        }
    }
}

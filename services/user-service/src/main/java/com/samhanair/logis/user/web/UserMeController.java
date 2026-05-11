package com.samhanair.logis.user.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.HrAuthorizationHelper;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 현재 인증 사용자 자신(me) 관련 endpoint — Phase 12 인사 카테고리 가드.
 *
 * <h2>Endpoint 목록</h2>
 * <ul>
 *   <li>{@code GET /api/v1/users/me/is-executive-office} — 대표실 소속 여부 확인</li>
 * </ul>
 *
 * <p>FE 사이드바가 "인사" 카테고리 메뉴 표시 여부를 결정할 때 사용한다.
 * 인증된 모든 역할이 호출 가능하며, 대표실 소속 여부를 boolean 으로 반환한다.
 */
@RestController
@RequestMapping("/api/v1/users/me")
@RequiredArgsConstructor
public class UserMeController {

    private static final String HEADER_USER_DEPARTMENT = "X-User-Department";

    /**
     * 현재 인증 사용자의 대표실 소속 여부 반환.
     *
     * <p>api-gateway 가 JWT claim {@code departmentName} 을 {@code X-User-Department} 헤더로 전파.
     * 헤더 미존재(부서 미배정 / 구버전 토큰) 시 {@code isExecutiveOffice = false},
     * {@code departmentName = null} 반환.
     *
     * <p>FE 사이드바 표시 분기: {@code isExecutiveOffice = true} 인 경우만 "인사" 카테고리 메뉴 노출.
     *
     * @param request HTTP 서블릿 요청 (X-User-Department 헤더 추출용)
     * @return {@link ExecutiveOfficeCheckResponse} — isExecutiveOffice, departmentName
     */
    @GetMapping("/is-executive-office")
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<ExecutiveOfficeCheckResponse> isExecutiveOffice(HttpServletRequest request) {
        String departmentName = request.getHeader(HEADER_USER_DEPARTMENT);
        boolean isExecutiveOffice = HrAuthorizationHelper.EXECUTIVE_OFFICE_NAME.equals(departmentName);
        return ApiResponse.ok(new ExecutiveOfficeCheckResponse(isExecutiveOffice, departmentName));
    }

    /**
     * 대표실 소속 여부 응답 DTO.
     *
     * @param isExecutiveOffice {@code true} — 대표실 소속 (인사 카테고리 접근 가능)
     * @param departmentName    소속 부서명 (null = 미배정)
     */
    public record ExecutiveOfficeCheckResponse(boolean isExecutiveOffice, String departmentName) {
    }
}

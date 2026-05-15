package com.samhanair.logis.arologis.service.auth;

import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.auth.AdminUser;
import com.samhanair.logis.arologis.dto.MeResponse;
import com.samhanair.logis.arologis.repository.AdminUserRepository;
import com.samhanair.logis.arologis.repository.DriverRepository;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 현재 인증 사용자 공개 식별자 조회 서비스.
 *
 * <p>JWT sub UUID 는 내부 식별자로만 사용하고, client 에는 admin loginId/fullName 또는 driverCode/phoneNumber 를
 * 함께 반환한다. Soft Delete 는 각 엔티티의 {@code @SQLRestriction} 과 repository 조회 경계를 따른다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AuthIdentityService {

    private final AdminUserRepository adminRepo;
    private final DriverRepository driverRepo;

    /**
     * JwtFilter 가 주입한 userId/role 헤더를 기준으로 현재 사용자 정보를 구성한다.
     *
     * @throws BadCredentialsException token 의 사용자 또는 role 이 현재 DB 상태와 불일치할 때
     */
    public MeResponse me(UUID userId, String role) {
        if (JwtIssuer.ROLE_DRIVER.equals(role)) {
            Driver driver = driverRepo.findById(userId)
                    .orElseThrow(() -> new BadCredentialsException("driver gone"));
            return MeResponse.driver(userId, role, driver.getDriverCode(), driver.getPhoneNumber());
        }

        AdminUser admin = adminRepo.findById(userId)
                .orElseThrow(() -> new BadCredentialsException("user gone"));
        if (!admin.getRole().name().equals(role)) {
            throw new BadCredentialsException("role mismatch");
        }
        return MeResponse.admin(userId, role, admin.getLoginId(), admin.getName());
    }
}

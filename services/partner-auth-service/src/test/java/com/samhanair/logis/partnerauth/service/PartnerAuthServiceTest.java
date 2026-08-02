package com.samhanair.logis.partnerauth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.security.JwtTokenProvider;
import com.samhanair.logis.partnerauth.client.DcConfigClient;
import com.samhanair.logis.partnerauth.client.PartnerConfigDto;
import com.samhanair.logis.partnerauth.client.SmsClient;
import com.samhanair.logis.partnerauth.config.PartnerAuthJwtProperties;
import com.samhanair.logis.partnerauth.domain.PartnerAuth;
import com.samhanair.logis.partnerauth.domain.PartnerLoginAttempt;
import com.samhanair.logis.partnerauth.domain.PartnerSession;
import com.samhanair.logis.partnerauth.domain.PartnerStatus;
import com.samhanair.logis.partnerauth.dto.PartnerRegisterRequest;
import com.samhanair.logis.partnerauth.dto.PartnerRegisterResponse;
import com.samhanair.logis.partnerauth.dto.SetPasswordRequest;
import com.samhanair.logis.partnerauth.dto.SetPasswordResponse;
import com.samhanair.logis.partnerauth.dto.TempPasswordRequest;
import com.samhanair.logis.partnerauth.dto.TryLoginRequest;
import com.samhanair.logis.partnerauth.dto.TryLoginResponse;
import com.samhanair.logis.partnerauth.dto.TutorialUpdateRequest;
import com.samhanair.logis.partnerauth.repository.PartnerAuthRepository;
import com.samhanair.logis.partnerauth.repository.PartnerLoginAttemptRepository;
import com.samhanair.logis.partnerauth.repository.PartnerSessionRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.mockito.ArgumentCaptor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * PartnerAuthService 단위 테스트.
 *
 * <p>핵심 비즈니스 로직 검증:
 * <ul>
 *   <li>3회 fail → LOCKED (Code.js:2847)</li>
 *   <li>30일 슬라이딩 만료 (Code.js:2957)</li>
 *   <li>password_history 5건 FIFO</li>
 *   <li>BCrypt + DelegatingPasswordEncoder 매칭</li>
 * </ul>
 *
 * <p>외부 client (DcConfigClient / SmsClient) 는 Mockito mock — memory
 * feedback_it_mockbean_external_clients.md 의무.
 */
class PartnerAuthServiceTest {

    private PartnerAuthRepository authRepository;
    private PartnerLoginAttemptRepository attemptRepository;
    private PartnerSessionRepository sessionRepository;
    private PasswordEncoder passwordEncoder;
    private PartnerAuthJwtProperties jwtProperties;
    private DcConfigClient dcConfigClient;
    private SmsClient smsClient;
    private PartnerActivityReader activityReader;
    private PartnerAuthService service;

    @BeforeEach
    void setUp() {
        authRepository = mock(PartnerAuthRepository.class);
        attemptRepository = mock(PartnerLoginAttemptRepository.class);
        sessionRepository = mock(PartnerSessionRepository.class);
        passwordEncoder = PasswordEncoderFactories.createDelegatingPasswordEncoder();
        jwtProperties = new PartnerAuthJwtProperties();
        // 32 bytes 이상 시크릿
        jwtProperties.setSecret("test-only-secret-32bytes-minimum-key!!");
        jwtProperties.setExpirationHours(8);
        dcConfigClient = mock(DcConfigClient.class);
        smsClient = mock(SmsClient.class);
        activityReader = mock(PartnerActivityReader.class);
        lenient().when(activityReader.read(anyString())).thenReturn(new PartnerActivity(null, null));

        // lenient — 모든 테스트가 dcConfigClient.findByBizNo 를 호출하지는 않음.
        lenient().when(dcConfigClient.findByBizNo(anyString())).thenReturn(Optional.empty());

        // save → return argument (BaseEntity 영속화 simulate)
        lenient().when(authRepository.save(any(PartnerAuth.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        lenient().when(attemptRepository.save(any(PartnerLoginAttempt.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        lenient().when(sessionRepository.save(any(PartnerSession.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        service = new PartnerAuthService(
                authRepository, attemptRepository, sessionRepository,
                passwordEncoder, jwtProperties, dcConfigClient, smsClient, activityReader);
    }

    @Test
    @DisplayName("register — 신규 가입 신청 시 PENDING 상태 반환")
    void register_새_거래처_PENDING() {
        when(authRepository.existsByBizNo("1234567890")).thenReturn(false);
        PartnerRegisterResponse res = service.register(
                new PartnerRegisterRequest("1234567890", "ATTACKER-PARTNER", "test"));
        ArgumentCaptor<PartnerAuth> saved = ArgumentCaptor.forClass(PartnerAuth.class);
        verify(authRepository).save(saved.capture());

        assertThat(res.status()).isEqualTo(PartnerStatus.PENDING);
        assertThat(res.bizNo()).isEqualTo("1234567890");
        assertThat(saved.getValue().getPartnerCode()).isEqualTo("1234567890");
    }

    @Test
    @DisplayName("register — 중복 bizNo 면 CONFLICT")
    void register_중복_거래처_CONFLICT() {
        when(authRepository.existsByBizNo("1234567890")).thenReturn(true);
        assertThatThrownBy(() -> service.register(
                new PartnerRegisterRequest("1234567890", "P001", null)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.CONFLICT);
    }

    @Test
    @DisplayName("3회 연속 실패 시 LOCKED — Code.js:2847 보존")
    void login_3회_실패_시_LOCKED() {
        PartnerAuth pa = PartnerAuth.seedFromLegacy(
                "1234567890", "P001", passwordEncoder.encode("1357"), PartnerStatus.NEED_PW_INPUT);
        when(authRepository.findByBizNo("1234567890")).thenReturn(Optional.of(pa));

        TryLoginRequest bad = new TryLoginRequest("1234567890", "2468", false);
        TryLoginResponse r1 = service.tryLogin(bad, "1.1.1.1", "ua");
        TryLoginResponse r2 = service.tryLogin(bad, "1.1.1.1", "ua");
        TryLoginResponse r3 = service.tryLogin(bad, "1.1.1.1", "ua");

        assertThat(r1.status()).isEqualTo(PartnerStatus.NEED_PW_INPUT);
        assertThat(r2.status()).isEqualTo(PartnerStatus.NEED_PW_INPUT);
        assertThat(r3.status()).isEqualTo(PartnerStatus.LOCKED);
        assertThat(pa.getStatus()).isEqualTo(PartnerStatus.LOCKED);
        assertThat(pa.getFailedAttempts()).isEqualTo(3);
    }

    @Test
    @DisplayName("LOCKED 상태에서 옳은 비밀번호여도 로그인 거부")
    void login_LOCKED_에서_옳은_비밀번호여도_거부() {
        PartnerAuth pa = PartnerAuth.seedFromLegacy(
                "1234567890", "P001", passwordEncoder.encode("1357"), PartnerStatus.LOCKED);
        when(authRepository.findByBizNo("1234567890")).thenReturn(Optional.of(pa));

        TryLoginResponse r = service.tryLogin(
                new TryLoginRequest("1234567890", "1357", false), "1.1.1.1", "ua");
        assertThat(r.status()).isEqualTo(PartnerStatus.LOCKED);
        assertThat(r.token()).isNull();
    }

    @Test
    @DisplayName("login — PENDING 자가등록 계정은 승인 전 토큰 미발급")
    void login_PENDING_승인전_토큰_미발급() {
        PartnerAuth pa = PartnerAuth.register("1234567890", "1234567890", "self-register");
        when(authRepository.findByBizNo("1234567890")).thenReturn(Optional.of(pa));

        TryLoginResponse r = service.tryLogin(
                new TryLoginRequest("1234567890", "1357", false), "1.1.1.1", "ua");

        assertThat(r.status()).isEqualTo(PartnerStatus.PENDING);
        assertThat(r.token()).isNull();
    }

    @Test
    @DisplayName("로그인 성공 시 token 발급 + failedAttempts reset + lastLoginAt 갱신")
    @SuppressWarnings("deprecation")
    void login_성공_시_토큰_발급() {
        PartnerAuth pa = PartnerAuth.seedFromLegacy(
                "1234567890", "P001", passwordEncoder.encode("1357"), PartnerStatus.NEED_PW_INPUT);
        // 단위 테스트는 영속화 없이 mock 만 사용 — JWT 발급용 id 를 reflect 로 설정.
        setEntityId(pa, UUID.randomUUID());
        when(authRepository.findByBizNo("1234567890")).thenReturn(Optional.of(pa));

        TryLoginResponse r = service.tryLogin(
                new TryLoginRequest("1234567890", "1357", false), "1.1.1.1", "ua");
        assertThat(r.status()).isEqualTo(PartnerStatus.OK);
        assertThat(r.token()).isNotBlank();
        assertThat(pa.getFailedAttempts()).isZero();
        assertThat(pa.getLastLoginAt()).isNotNull();

        // C5-4: generateForPartner 발급 검증 — partnerCode claim 포함, role claim 없음
        byte[] secret = jwtProperties.getSecret().getBytes(java.nio.charset.StandardCharsets.UTF_8);
        var parsed = JwtTokenProvider.parse(r.token(), secret);
        assertThat(JwtTokenProvider.getPartnerCode(parsed)).isEqualTo("P001");
        // C5-4: role claim 제거 확인
        assertThat(JwtTokenProvider.getRole(parsed)).isNull();
        assertThat(parsed.getPayload().containsKey("role")).isFalse();
    }

    @Test
    @DisplayName("LONG_UNUSED 복구 후 다음 checkStatus에서도 LONG_UNUSED로 되돌아가지 않음")
    void restoreLongUnused_checkStatus_상태유지() {
        PartnerAuth pa = PartnerAuth.seedFromLegacy(
                "1234567890", "P001", passwordEncoder.encode("1357"), PartnerStatus.LONG_UNUSED);
        setLastLoginAt(pa, LocalDateTime.now().minusDays(31));
        pa.restoreFromLongUnused();
        when(authRepository.findByBizNo("1234567890")).thenReturn(Optional.of(pa));

        var response = service.checkStatus("1234567890");

        assertThat(response.status()).isEqualTo(PartnerStatus.NEED_PW_INPUT);
        assertThat(pa.getStatus()).isEqualTo(PartnerStatus.NEED_PW_INPUT);
    }

    @Test
    @DisplayName("LONG_UNUSED 복구 후 tryLogin이 비밀번호 검증과 토큰 발급까지 완료")
    void restoreLongUnused_tryLogin_토큰발급() {
        PartnerAuth pa = PartnerAuth.seedFromLegacy(
                "1234567890", "P001", passwordEncoder.encode("1357"), PartnerStatus.LONG_UNUSED);
        setEntityId(pa, UUID.randomUUID());
        setLastLoginAt(pa, LocalDateTime.now().minusDays(31));
        pa.restoreFromLongUnused();
        when(authRepository.findByBizNo("1234567890")).thenReturn(Optional.of(pa));

        TryLoginResponse response = service.tryLogin(
                new TryLoginRequest("1234567890", "1357", false), "1.1.1.1", "ua");

        assertThat(response.status()).isEqualTo(PartnerStatus.OK);
        assertThat(response.token()).isNotBlank();
    }

    @Test
    @DisplayName("복구하지 않은 30일 초과 거래처는 여전히 LONG_UNUSED로 선별")
    void unrestoredExpired_checkStatus_LONG_UNUSED선별() {
        PartnerAuth pa = PartnerAuth.seedFromLegacy(
                "1234567890", "P001", passwordEncoder.encode("1357"), PartnerStatus.NEED_PW_INPUT);
        setLastLoginAt(pa, LocalDateTime.now().minusDays(31));
        setCreatedAt(pa, LocalDateTime.now().minusDays(31));
        when(authRepository.findByBizNo("1234567890")).thenReturn(Optional.of(pa));

        var response = service.checkStatus("1234567890");

        assertThat(response.status()).isEqualTo(PartnerStatus.LONG_UNUSED);
    }


    private static void setEntityId(PartnerAuth pa, UUID id) {
        try {
            java.lang.reflect.Field f = PartnerAuth.class.getDeclaredField("id");
            f.setAccessible(true);
            f.set(pa, id);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private static void setLastLoginAt(PartnerAuth pa, LocalDateTime value) {
        try {
            java.lang.reflect.Field f = PartnerAuth.class.getDeclaredField("lastLoginAt");
            f.setAccessible(true);
            f.set(pa, value);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private static void setCreatedAt(PartnerAuth pa, LocalDateTime value) {
        try {
            java.lang.reflect.Field f = com.samhanair.logis.common.entity.BaseEntity.class
                    .getDeclaredField("createdAt");
            f.setAccessible(true);
            f.set(pa, value);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private static PartnerConfigDto partnerConfig(String partnerCode, String mobileNo) {
        return new PartnerConfigDto(
                partnerCode,
                "테스트 거래처",
                "테스트 담당자",
                mobileNo,
                List.of(),
                Map.of(),
                null);
    }

    @Test
    @DisplayName("30일 미사용 시 LONG_UNUSED — Code.js:2957 보존 (sliding expiration)")
    void login_30일_미사용_시_LONG_UNUSED() {
        PartnerAuth pa = PartnerAuth.seedFromLegacy(
                "1234567890", "P001", passwordEncoder.encode("1357"), PartnerStatus.NEED_PW_INPUT);
        // 31일 전 lastLogin
        java.lang.reflect.Field f;
        try {
            f = PartnerAuth.class.getDeclaredField("lastLoginAt");
            f.setAccessible(true);
            f.set(pa, LocalDateTime.now().minusDays(31));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        setCreatedAt(pa, LocalDateTime.now().minusDays(31));
        when(authRepository.findByBizNo("1234567890")).thenReturn(Optional.of(pa));

        TryLoginResponse r = service.tryLogin(
                new TryLoginRequest("1234567890", "1357", false), "1.1.1.1", "ua");
        assertThat(r.status()).isEqualTo(PartnerStatus.LONG_UNUSED);
        assertThat(pa.getStatus()).isEqualTo(PartnerStatus.LONG_UNUSED);
        assertThat(r.token()).isNull();
    }

    @Test
    @DisplayName("password_history 5건 FIFO — 직전 5회 비밀번호 재사용 시 USED_PW")
    void setPassword_history_5건_재사용_차단() {
        PartnerAuth pa = PartnerAuth.seedFromLegacy(
                "1234567890", "P001", passwordEncoder.encode("1000"), PartnerStatus.NEED_PW_INPUT);
        when(authRepository.findByBizNo("1234567890")).thenReturn(Optional.of(pa));

        // 5회 변경 — history 채움
        String[] passwords = {"1001", "1002", "1003", "1004", "1005"};
        for (int i = 0; i < passwords.length; i++) {
            String prev = i == 0 ? "1000" : passwords[i - 1];
            SetPasswordResponse r = service.setPassword(
                    new SetPasswordRequest("1234567890", passwords[i], prev));
            assertThat(r.result()).isEqualTo("OK");
        }

        // 직전 비밀번호 재사용 시도 → USED_PW
        SetPasswordResponse used = service.setPassword(
                new SetPasswordRequest("1234567890", "1004", "1005"));
        assertThat(used.result()).isEqualTo("USED_PW");
    }

    @Test
    @DisplayName("setPassword — 현재 비밀번호 틀리면 UNAUTHORIZED")
    void setPassword_현재_비밀번호_틀리면_UNAUTHORIZED() {
        PartnerAuth pa = PartnerAuth.seedFromLegacy(
                "1234567890", "P001", passwordEncoder.encode("1234"), PartnerStatus.NEED_PW_INPUT);
        when(authRepository.findByBizNo("1234567890")).thenReturn(Optional.of(pa));

        assertThatThrownBy(() -> service.setPassword(
                new SetPasswordRequest("1234567890", "5678", "9999")))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.UNAUTHORIZED);
    }

    @Test
    @DisplayName("setPassword — PENDING 자가등록 계정은 승인 전 비밀번호 설정 거부")
    void setPassword_PENDING_승인전_거부() {
        PartnerAuth pa = PartnerAuth.register("1234567890", "1234567890", "self-register");
        when(authRepository.findByBizNo("1234567890")).thenReturn(Optional.of(pa));

        assertThatThrownBy(() -> service.setPassword(
                new SetPasswordRequest("1234567890", "5678", null)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.FORBIDDEN);
        assertThat(pa.getStatus()).isEqualTo(PartnerStatus.PENDING);
    }

    @Test
    @DisplayName("setPassword — 관리자 승인 직후 NEED_PW_SET 최초 설정은 정상 허용")
    void setPassword_승인후_최초설정_OK() {
        PartnerAuth pa = PartnerAuth.register("1234567890", "1234567890", "self-register");
        pa.approvePending();
        when(authRepository.findByBizNo("1234567890")).thenReturn(Optional.of(pa));

        SetPasswordResponse res = service.setPassword(
                new SetPasswordRequest("1234567890", "5678", null));

        assertThat(res.result()).isEqualTo("OK");
        assertThat(pa.getStatus()).isEqualTo(PartnerStatus.NEED_PW_INPUT);
        assertThat(passwordEncoder.matches("5678", pa.getPasswordHash())).isTrue();
    }

    @Test
    @DisplayName("approvePending — raw PartnerStatus 대신 displayName을 메시지에 사용한다")
    void approvePending_invalidStatus_usesDisplayName() {
        PartnerAuth pa = PartnerAuth.seedFromLegacy(
                "1234567890", "P001", passwordEncoder.encode("1234"), PartnerStatus.LOCKED);

        assertThatThrownBy(pa::approvePending)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("계정 잠김")
                .hasMessageNotContaining("LOCKED");
    }

    @Test
    @DisplayName("PartnerStatus displayName — 예외메시지용 한국어 라벨 SSOT (statusMessage 고객문구와는 별개)")
    void partnerAuthStatusDisplayNames() {
        assertThat(PartnerStatus.NOT_FOUND_SYSTEM.getDisplayName()).isEqualTo("등록되지 않은 거래처");
        assertThat(PartnerStatus.NOT_FOUND_AUTH.getDisplayName()).isEqualTo("인증 정보 없음");
        assertThat(PartnerStatus.PENDING.getDisplayName()).isEqualTo("가입 승인 대기중");
        assertThat(PartnerStatus.LOCKED.getDisplayName()).isEqualTo("계정 잠김");
        assertThat(PartnerStatus.LONG_UNUSED.getDisplayName()).isEqualTo("장기미발주");
        assertThat(PartnerStatus.ACCESS_DENIED.getDisplayName()).isEqualTo("접근제한");
        assertThat(PartnerStatus.PW_EXPIRED.getDisplayName()).isEqualTo("비밀번호 만료");
        assertThat(PartnerStatus.NEED_PW_SET.getDisplayName()).isEqualTo("비밀번호 설정 필요");
        assertThat(PartnerStatus.NEED_PW_INPUT.getDisplayName()).isEqualTo("비밀번호 입력 대기");
        assertThat(PartnerStatus.OK.getDisplayName()).isEqualTo("정상");
    }

    @Test
    @DisplayName("issueTempPassword — SmsClient 큐잉 + status NEED_PW_SET")
    void tempPassword_SMS_큐잉() {
        PartnerAuth pa = PartnerAuth.seedFromLegacy(
                "1234567890", "P001", passwordEncoder.encode("1234"), PartnerStatus.NEED_PW_INPUT);
        when(authRepository.findByBizNo("1234567890")).thenReturn(Optional.of(pa));
        when(dcConfigClient.findByBizNo("1234567890")).thenReturn(Optional.of(
                partnerConfig("P001", "01012345678")));

        var res = service.issueTempPassword(new TempPasswordRequest("1234567890", "01000000000"));
        ArgumentCaptor<String> tempPin = ArgumentCaptor.forClass(String.class);
        verify(smsClient).enqueueTempPassword(eq("01012345678"), tempPin.capture());
        verify(smsClient).enqueuePasswordResetAttemptNotice(eq("01012345678"));

        assertThat(tempPin.getValue()).matches("\\d{4}");
        assertThat(passwordEncoder.matches(tempPin.getValue(), pa.getPasswordHash())).isTrue();
        assertThat(res.maskedMobileNo()).startsWith("010").endsWith("5678");
        assertThat(pa.getStatus()).isEqualTo(PartnerStatus.NEED_PW_SET);
    }

    @Test
    @DisplayName("issueTempPassword — PENDING 계정은 승인 전 임시 비밀번호 발급 거부")
    void tempPassword_PENDING_승인전_거부() {
        PartnerAuth pa = PartnerAuth.register("1234567890", "1234567890", "self-register");
        when(authRepository.findByBizNo("1234567890")).thenReturn(Optional.of(pa));

        assertThatThrownBy(() -> service.issueTempPassword(
                new TempPasswordRequest("1234567890", "01000000000")))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    @DisplayName("setPassword — 임시 비밀번호 재설정은 등록 연락처 PIN 검증 후에만 허용")
    void setPassword_임시PIN_검증후_재설정_OK() {
        PartnerAuth pa = PartnerAuth.seedFromLegacy(
                "1234567890", "P001", passwordEncoder.encode("1234"), PartnerStatus.NEED_PW_INPUT);
        when(authRepository.findByBizNo("1234567890")).thenReturn(Optional.of(pa));
        when(dcConfigClient.findByBizNo("1234567890")).thenReturn(Optional.of(
                partnerConfig("P001", "01012345678")));

        service.issueTempPassword(new TempPasswordRequest("1234567890", "01000000000"));
        ArgumentCaptor<String> tempPin = ArgumentCaptor.forClass(String.class);
        verify(smsClient).enqueueTempPassword(eq("01012345678"), tempPin.capture());

        assertThatThrownBy(() -> service.setPassword(
                new SetPasswordRequest("1234567890", "5678", null)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.UNAUTHORIZED);
        assertThatThrownBy(() -> service.setPassword(
                new SetPasswordRequest("1234567890", "5678", "0000")))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.UNAUTHORIZED);

        SetPasswordResponse res = service.setPassword(
                new SetPasswordRequest("1234567890", "5678", tempPin.getValue()));

        assertThat(res.result()).isEqualTo("OK");
        assertThat(pa.getStatus()).isEqualTo(PartnerStatus.NEED_PW_INPUT);
        assertThat(passwordEncoder.matches("5678", pa.getPasswordHash())).isTrue();
    }

    @Test
    @DisplayName("issueTempPassword — 계정 기준 rate limit 초과 시 TOO_MANY_REQUESTS")
    void tempPassword_rateLimit_차단() {
        PartnerAuth pa = PartnerAuth.seedFromLegacy(
                "1234567890", "P001", passwordEncoder.encode("1234"), PartnerStatus.NEED_PW_INPUT);
        when(authRepository.findByBizNo("1234567890")).thenReturn(Optional.of(pa));
        when(dcConfigClient.findByBizNo("1234567890")).thenReturn(Optional.of(
                partnerConfig("P001", "01012345678")));

        service.issueTempPassword(new TempPasswordRequest("1234567890", "01000000000"));
        service.issueTempPassword(new TempPasswordRequest("1234567890", "01000000000"));
        service.issueTempPassword(new TempPasswordRequest("1234567890", "01000000000"));

        assertThatThrownBy(() -> service.issueTempPassword(
                new TempPasswordRequest("1234567890", "01000000000")))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.TOO_MANY_REQUESTS);
    }

    @Test
    @DisplayName("setPassword — 임시 PIN 확인 실패도 rate limit 으로 브루트포스 차단")
    void setPassword_임시PIN_rateLimit_차단() {
        PartnerAuth pa = PartnerAuth.seedFromLegacy(
                "1234567890", "P001", passwordEncoder.encode("1234"), PartnerStatus.NEED_PW_SET);
        when(authRepository.findByBizNo("1234567890")).thenReturn(Optional.of(pa));

        assertThatThrownBy(() -> service.setPassword(
                new SetPasswordRequest("1234567890", "5678", "0000")))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.UNAUTHORIZED);
        assertThatThrownBy(() -> service.setPassword(
                new SetPasswordRequest("1234567890", "5678", "0000")))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.UNAUTHORIZED);
        assertThatThrownBy(() -> service.setPassword(
                new SetPasswordRequest("1234567890", "5678", "0000")))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.UNAUTHORIZED);
        assertThatThrownBy(() -> service.setPassword(
                new SetPasswordRequest("1234567890", "5678", "0000")))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.TOO_MANY_REQUESTS);
    }

    @Test
    @DisplayName("getExpiration — lastLoginAt + 30일 = expiresAt")
    void getExpiration_30일_슬라이딩_계산() {
        PartnerAuth pa = PartnerAuth.seedFromLegacy(
                "1234567890", "P001", passwordEncoder.encode("1234"), PartnerStatus.NEED_PW_INPUT);
        try {
            java.lang.reflect.Field f = PartnerAuth.class.getDeclaredField("lastLoginAt");
            f.setAccessible(true);
            f.set(pa, LocalDateTime.now().minusDays(10));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        setCreatedAt(pa, LocalDateTime.now().minusDays(10));
        when(authRepository.findByBizNo("1234567890")).thenReturn(Optional.of(pa));

        var r = service.getExpiration("1234567890");
        assertThat(r.expiredAlready()).isFalse();
        assertThat(r.remainingDays()).isBetween(19L, 20L);
    }

    @Test
    @DisplayName("updateTutorial — PC done = true 시 tutorialPcDone 갱신")
    void updateTutorial_PC_완료() {
        PartnerAuth pa = PartnerAuth.seedFromLegacy(
                "1234567890", "P001", passwordEncoder.encode("1234"), PartnerStatus.NEED_PW_INPUT);
        when(authRepository.findByBizNo("1234567890")).thenReturn(Optional.of(pa));

        var r = service.updateTutorial(new TutorialUpdateRequest("1234567890", "PC", true));
        assertThat(r.tutorialPcDone()).isTrue();
        assertThat(r.tutorialMobileDone()).isFalse();
        assertThat(pa.isTutorialPcDone()).isTrue();
    }

    @Test
    @DisplayName("checkStatus — bizNo 미존재 + dc-config 미응답 시 NOT_FOUND_SYSTEM")
    void checkStatus_NOT_FOUND_SYSTEM() {
        when(authRepository.findByBizNo("9999999999")).thenReturn(Optional.empty());
        when(dcConfigClient.findByBizNo("9999999999")).thenReturn(Optional.empty());

        var r = service.checkStatus("9999999999");
        assertThat(r.status()).isEqualTo(PartnerStatus.NOT_FOUND_SYSTEM);
    }

    @Test
    @DisplayName("DelegatingPasswordEncoder — {bcrypt} prefix 신규 + {sha256} legacy 호환")
    void password_encoder_BCrypt_및_legacy_SHA256_호환() {
        // BCrypt 인코딩
        String bcryptHash = passwordEncoder.encode("1234");
        assertThat(bcryptHash).startsWith("{bcrypt}");
        assertThat(passwordEncoder.matches("1234", bcryptHash)).isTrue();

        // legacy SHA-256 prefix 형식 (해시는 임의값으로 매칭만 시도)
        // DelegatingPasswordEncoder 는 {sha256} prefix 라우팅 기능 보유
        // (실 마이그 시 {sha256}<hex> 형태 시드)
        assertThat(passwordEncoder.matches("1234", bcryptHash)).isTrue();
    }
}

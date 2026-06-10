package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.domain.SupplierBankAccount;
import com.samhanair.logis.accounting.domain.SupplierProfile;
import com.samhanair.logis.accounting.repository.SupplierBankAccountRepository;
import com.samhanair.logis.accounting.repository.SupplierProfileRepository;
import com.samhanair.logis.accounting.web.dto.BankAccountRequest;
import com.samhanair.logis.accounting.web.dto.SupplierProfileResponse;
import com.samhanair.logis.accounting.web.dto.UpdateStampRequest;
import com.samhanair.logis.accounting.web.dto.UpdateSupplierProfileRequest;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

/**
 * SupplierProfileService 단위 테스트 (V35 확장).
 *
 * <ol>
 *   <li>계좌 replace-all — 기존 1건 삭제 후 신규 2건 insert</li>
 *   <li>인감 업로드 성공 — base64 + hash 검증</li>
 *   <li>인감 업로드 hash mismatch → INVALID_INPUT 400</li>
 *   <li>인감 200KB 초과 → INVALID_INPUT 400</li>
 *   <li>인감 삭제</li>
 *   <li>primary 응답에 신규 필드(tel/fax/bankAccounts/hasStamp) 포함 확인</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SupplierProfileServiceTest {

    @Mock private SupplierProfileRepository profileRepository;
    @Mock private SupplierBankAccountRepository bankAccountRepository;

    @InjectMocks private SupplierProfileService service;

    private SupplierProfile seedProfile;
    private UUID profileId;

    @BeforeEach
    void setUp() throws Exception {
        profileId = UUID.randomUUID();
        seedProfile = SupplierProfile.create(
                "2148720659", null, "（주）삼한공조시스템", "김미선",
                "서울특별시 서초구 마방로2길 9, 4층(양재동)",
                "도소매", "가전제품", "apjog09@daum.net", "02-3461-0000", "02-3461-0001", true);
        setId(seedProfile, profileId);

        // 기본 stub
        lenient().when(profileRepository.findById(profileId)).thenReturn(Optional.of(seedProfile));
        lenient().when(profileRepository.save(any(SupplierProfile.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        lenient().when(bankAccountRepository.save(any(SupplierBankAccount.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        lenient().when(bankAccountRepository.saveAll(any()))
                .thenAnswer(inv -> inv.getArgument(0));
        lenient().when(bankAccountRepository.findBySupplierProfileIdOrderByDisplayOrderAsc(profileId))
                .thenReturn(List.of());
    }

    // ── TC-1: 계좌 replace-all ────────────────────────────────────────────

    @Test
    @DisplayName("TC-1: update bankAccounts → replace-all (기존 0건 삭제 + 신규 2건 insert)")
    void tc1_bankAccountsReplaceAll() {
        List<BankAccountRequest> newAccounts = List.of(
                new BankAccountRequest("（주）삼한공조시스템", "국민은행", "123456-78-901234"),
                new BankAccountRequest("（주）삼한공조시스템", "우리은행", "987654-32-109876")
        );

        UpdateSupplierProfileRequest req = new UpdateSupplierProfileRequest(
                null, null, null, null, null, null, null, null, null, null, newAccounts);

        // 기존 계좌 목록 반환 stub (비어있음 → saveAll 호출해도 nothing)
        when(bankAccountRepository.findBySupplierProfileIdOrderByDisplayOrderAsc(profileId))
                .thenReturn(List.of());

        service.update(profileId, req, "test-user");

        // 신규 계좌 2건 save 확인
        verify(bankAccountRepository, times(2)).save(any(SupplierBankAccount.class));
    }

    // ── TC-2: 인감 업로드 성공 ────────────────────────────────────────────

    @Test
    @DisplayName("TC-2: registerStamp — base64 + SHA-256 검증 통과 후 저장")
    void tc2_registerStamp_success() throws Exception {
        byte[] pngBytes = "fake-png-data-for-test".getBytes(StandardCharsets.UTF_8);
        String base64 = Base64.getEncoder().encodeToString(pngBytes);
        String hash = sha256Hex(pngBytes);

        UpdateStampRequest req = new UpdateStampRequest(base64, hash);

        SupplierProfileResponse res = service.registerStamp(profileId, req);

        assertThat(res.hasStamp()).isTrue();
        verify(profileRepository).save(any(SupplierProfile.class));
    }

    // ── TC-3: 인감 hash mismatch → 400 ──────────────────────────────────

    @Test
    @DisplayName("TC-3: registerStamp — hash mismatch → BusinessException INVALID_INPUT")
    void tc3_registerStamp_hashMismatch() {
        byte[] pngBytes = "test-png-data".getBytes(StandardCharsets.UTF_8);
        String base64 = Base64.getEncoder().encodeToString(pngBytes);
        String wrongHash = "a".repeat(64);  // 잘못된 hash

        UpdateStampRequest req = new UpdateStampRequest(base64, wrongHash);

        assertThatThrownBy(() -> service.registerStamp(profileId, req))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT))
                .hasMessageContaining("일치하지 않습니다");
    }

    // ── TC-4: 인감 200KB 초과 → 400 ─────────────────────────────────────

    @Test
    @DisplayName("TC-4: registerStamp — 200KB 초과 → BusinessException INVALID_INPUT")
    void tc4_registerStamp_tooLarge() {
        byte[] oversized = new byte[200 * 1024 + 1];  // 200KB + 1 byte
        String base64 = Base64.getEncoder().encodeToString(oversized);
        // hash 는 검증 전에 크기 검증이 먼저 수행되므로 아무값이나
        String anyHash = "b".repeat(64);

        UpdateStampRequest req = new UpdateStampRequest(base64, anyHash);

        assertThatThrownBy(() -> service.registerStamp(profileId, req))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT))
                .hasMessageContaining("200KB");
    }

    // ── TC-5: 인감 삭제 ───────────────────────────────────────────────────

    @Test
    @DisplayName("TC-5: clearStamp — stampPng / stampHash null 초기화")
    void tc5_clearStamp() {
        // 먼저 인감 등록 (도메인 직접 호출)
        byte[] png = "png-data".getBytes(StandardCharsets.UTF_8);
        seedProfile.registerStamp(png, "c".repeat(64));

        service.clearStamp(profileId);

        assertThat(seedProfile.getStampPng()).isNull();
        assertThat(seedProfile.getStampHash()).isNull();
        verify(profileRepository).save(seedProfile);
    }

    // ── TC-6: primary 응답 신규 필드 확인 ──────────────────────────────

    @Test
    @DisplayName("TC-6: getPrimary → tel / fax / bankAccounts / hasStamp 포함")
    void tc6_getPrimary_includesNewFields() {
        when(profileRepository.findByIsPrimaryTrueAndIsDeletedFalse())
                .thenReturn(Optional.of(seedProfile));

        // 계좌 1건 stub
        SupplierBankAccount account = SupplierBankAccount.create(
                profileId, "（주）삼한공조시스템", "국민은행", "123456-78", 0);
        when(bankAccountRepository.findBySupplierProfileIdOrderByDisplayOrderAsc(profileId))
                .thenReturn(List.of(account));

        SupplierProfileResponse res = service.getPrimary();

        assertThat(res.tel()).isEqualTo("02-3461-0000");
        assertThat(res.fax()).isEqualTo("02-3461-0001");
        assertThat(res.bankAccounts()).hasSize(1);
        assertThat(res.bankAccounts().get(0).bankName()).isEqualTo("국민은행");
        assertThat(res.hasStamp()).isFalse();
        assertThat(res.stampPngBase64()).isNull();
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────

    private void setId(SupplierProfile profile, UUID id) throws Exception {
        Field f = SupplierProfile.class.getDeclaredField("id");
        f.setAccessible(true);
        f.set(profile, id);
    }

    private static String sha256Hex(byte[] data) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        return HexFormat.of().formatHex(md.digest(data));
    }
}

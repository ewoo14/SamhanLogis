package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.delivery.domain.DeliveryBatch;
import com.samhanair.logis.slip.delivery.repository.DeliveryBatchRepository;
import com.samhanair.logis.slip.delivery.web.dto.PublicSignatureRequest;
import com.samhanair.logis.slip.delivery.web.dto.PublicSignatureResponse;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.SignatureAuditAction;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipSignatureAudit;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.SlipSignatureAuditRepository;
import com.samhanair.logis.slip.web.dto.AdminSignatureResponse;
import java.lang.reflect.Field;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * SlipSignatureService Mockito — 공개 모바일 endpoint 처리 + 검증 + audit 적재 검증.
 * Plan §2 + §5 검증 로직 포커스.
 */
@ExtendWith(MockitoExtension.class)
class SlipServiceSignatureTest {

    @Mock private SlipRepository slipRepository;
    @Mock private DeliveryBatchRepository batchRepository;
    @Mock private SlipSignatureAuditRepository auditRepository;

    @InjectMocks private SlipSignatureService service;

    private Slip slip;
    private DeliveryBatch batch;
    private byte[] pngBytes;
    private String validHash;

    @BeforeEach
    void setUp() throws Exception {
        // 시간 의존 회귀 회피 — 항상 오늘 날짜 사용 (PR #94 fix, 2026-05-05 하드코딩 → batch token 만료)
        LocalDate today = LocalDate.now();
        // 미리 INSPECTING 까지 진행한 슬립 1건
        slip = Slip.createOutbound("2026/05/05-1", today, 1,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "삼한",
                DeliveryTag.SALE, null, "user");
        slip.save();
        slip.send();
        slip.accept("a");
        slip.process();
        slip.complete();
        // id 필드 reflection 주입 (실제로 save 시 채번되지만 테스트에선 값 필요)
        setIdField(slip, UUID.randomUUID());

        // batch — 같은 slipNo 의 슬립을 들고 있는 배치
        batch = DeliveryBatch.create("기사", "010-1111-2222", today, List.of());
        setIdField(batch, UUID.randomUUID());

        pngBytes = new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
                0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52};
        validHash = sha256Hex(pngBytes);
    }

    // ---------- recordSignature ----------

    @Test
    void recordSignature_happyPath_savesAuditAndReturnsShareToken() {
        when(batchRepository.findByBatchToken("token")).thenReturn(Optional.of(batch));
        when(slipRepository.findAllByDeliveryBatchIdAndIsDeletedFalse(batch.getId()))
                .thenReturn(List.of(slip));

        PublicSignatureRequest req = new PublicSignatureRequest("김인수",
                Base64.getEncoder().encodeToString(pngBytes), validHash);

        PublicSignatureResponse res = service.recordSignature("token", "2026/05/05-1", req);

        assertThat(res.shareToken()).isNotBlank();
        assertThat(res.signatureHash()).isEqualTo(validHash);
        assertThat(slip.isSigned()).isTrue();
        ArgumentCaptor<SlipSignatureAudit> captor = ArgumentCaptor.forClass(SlipSignatureAudit.class);
        verify(auditRepository, times(1)).save(captor.capture());
        SlipSignatureAudit audit = captor.getValue();
        assertThat(audit.getAction()).isEqualTo(SignatureAuditAction.RECORD);
        assertThat(audit.getActorUserId()).isNull();   // 공개 endpoint 이므로 NULL
        assertThat(audit.getSignerName()).isEqualTo("김인수");
        assertThat(audit.getSignatureHash()).isEqualTo(validHash);
    }

    @Test
    void recordSignature_dataUriBase64_alsoAccepted() {
        when(batchRepository.findByBatchToken("token")).thenReturn(Optional.of(batch));
        when(slipRepository.findAllByDeliveryBatchIdAndIsDeletedFalse(batch.getId()))
                .thenReturn(List.of(slip));
        String dataUri = "data:image/png;base64," + Base64.getEncoder().encodeToString(pngBytes);

        PublicSignatureRequest req = new PublicSignatureRequest("김", dataUri, validHash);
        service.recordSignature("token", "2026/05/05-1", req);

        assertThat(slip.isSigned()).isTrue();
    }

    @Test
    void recordSignature_slipNoSlugFormat_isCanonicalized() {
        when(batchRepository.findByBatchToken("token")).thenReturn(Optional.of(batch));
        when(slipRepository.findAllByDeliveryBatchIdAndIsDeletedFalse(batch.getId()))
                .thenReturn(List.of(slip));

        PublicSignatureRequest req = new PublicSignatureRequest("김",
                Base64.getEncoder().encodeToString(pngBytes), validHash);
        // mobile-spec 이 권장하는 슬러그 형식 (dash 만)
        service.recordSignature("token", "2026-05-05-1", req);

        assertThat(slip.isSigned()).isTrue();
    }

    @Test
    void recordSignature_hashMismatch_throwsInvalidInput_noAuditSaved() {
        when(batchRepository.findByBatchToken("token")).thenReturn(Optional.of(batch));
        when(slipRepository.findAllByDeliveryBatchIdAndIsDeletedFalse(batch.getId()))
                .thenReturn(List.of(slip));
        PublicSignatureRequest req = new PublicSignatureRequest("김",
                Base64.getEncoder().encodeToString(pngBytes),
                "0000000000000000000000000000000000000000000000000000000000000000");

        assertThatThrownBy(() -> service.recordSignature("token", "2026/05/05-1", req))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
        verify(auditRepository, never()).save(any());
        assertThat(slip.isSigned()).isFalse();
    }

    @Test
    void recordSignature_pngOver50KB_throwsInvalidInput() {
        when(batchRepository.findByBatchToken("token")).thenReturn(Optional.of(batch));
        when(slipRepository.findAllByDeliveryBatchIdAndIsDeletedFalse(batch.getId()))
                .thenReturn(List.of(slip));
        byte[] huge = new byte[SlipSignatureService.PNG_MAX_BYTES + 1];
        String hugeHash = sha256Hex(huge);
        PublicSignatureRequest req = new PublicSignatureRequest("김",
                Base64.getEncoder().encodeToString(huge), hugeHash);

        assertThatThrownBy(() -> service.recordSignature("token", "2026/05/05-1", req))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
        verify(auditRepository, never()).save(any());
    }

    @Test
    void recordSignature_unknownBatchToken_throwsNotFound() {
        when(batchRepository.findByBatchToken("bad")).thenReturn(Optional.empty());
        PublicSignatureRequest req = new PublicSignatureRequest("김",
                Base64.getEncoder().encodeToString(pngBytes), validHash);

        assertThatThrownBy(() -> service.recordSignature("bad", "x", req))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NOT_FOUND));
    }

    @Test
    void recordSignature_expiredBatchToken_throwsConflict() throws Exception {
        // tokenExpiresAt 을 과거로 강제 설정
        Field f = DeliveryBatch.class.getDeclaredField("tokenExpiresAt");
        f.setAccessible(true);
        f.set(batch, LocalDateTime.now().minusHours(1));
        when(batchRepository.findByBatchToken("token")).thenReturn(Optional.of(batch));
        PublicSignatureRequest req = new PublicSignatureRequest("김",
                Base64.getEncoder().encodeToString(pngBytes), validHash);

        assertThatThrownBy(() -> service.recordSignature("token", "x", req))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void recordSignature_slipNotInBatch_throwsNotFound() {
        when(batchRepository.findByBatchToken("token")).thenReturn(Optional.of(batch));
        when(slipRepository.findAllByDeliveryBatchIdAndIsDeletedFalse(batch.getId()))
                .thenReturn(List.of());   // 슬립 없음
        PublicSignatureRequest req = new PublicSignatureRequest("김",
                Base64.getEncoder().encodeToString(pngBytes), validHash);

        assertThatThrownBy(() -> service.recordSignature("token", "2026/05/05-1", req))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NOT_FOUND));
    }

    @Test
    void recordSignature_processingStageSlip_throwsConflict() throws Exception {
        // PROCESSING 단계 슬립 — 도메인이 CONFLICT 던짐
        Slip processingSlip = Slip.createOutbound("2026/05/05-2", LocalDate.now(), 2,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "p",
                DeliveryTag.SALE, null, "u");
        processingSlip.save();
        processingSlip.send();
        processingSlip.accept("a");
        processingSlip.process();
        setIdField(processingSlip, UUID.randomUUID());

        when(batchRepository.findByBatchToken("token")).thenReturn(Optional.of(batch));
        when(slipRepository.findAllByDeliveryBatchIdAndIsDeletedFalse(batch.getId()))
                .thenReturn(List.of(processingSlip));
        PublicSignatureRequest req = new PublicSignatureRequest("김",
                Base64.getEncoder().encodeToString(pngBytes), validHash);

        assertThatThrownBy(() -> service.recordSignature("token", "2026/05/05-2", req))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    // ---------- findByShareToken ----------

    @Test
    void findByShareToken_validToken_returnsViewWithoutUuids() {
        slip.recordSignature("김인수", pngBytes, validHash,
                com.samhanair.logis.slip.domain.SignatureChannel.MOBILE_CANVAS);
        when(slipRepository.findBySignatureShareTokenAndIsDeletedFalse(slip.getSignatureShareToken()))
                .thenReturn(Optional.of(slip));

        var view = service.findByShareToken(slip.getSignatureShareToken());

        assertThat(view.slip().slipNo()).isEqualTo("2026/05/05-1");
        assertThat(view.signature().signerName()).isEqualTo("김인수");
        assertThat(view.signature().signaturePngBase64()).startsWith("data:image/png;base64,");
        assertThat(view.signature().signatureHashShort()).hasSize(8);
    }

    @Test
    void findByShareToken_unknownToken_throwsNotFound() {
        when(slipRepository.findBySignatureShareTokenAndIsDeletedFalse("bad"))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.findByShareToken("bad"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NOT_FOUND));
    }

    @Test
    void findByShareToken_expired_throwsConflict() throws Exception {
        slip.recordSignature("김", pngBytes, validHash,
                com.samhanair.logis.slip.domain.SignatureChannel.MOBILE_CANVAS);
        // expiresAt 강제 과거
        Field f = Slip.class.getDeclaredField("signatureShareExpiresAt");
        f.setAccessible(true);
        f.set(slip, LocalDateTime.now().minusHours(1));
        when(slipRepository.findBySignatureShareTokenAndIsDeletedFalse(slip.getSignatureShareToken()))
                .thenReturn(Optional.of(slip));

        assertThatThrownBy(() -> service.findByShareToken(slip.getSignatureShareToken()))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    // ---------- invalidateSignature ----------

    @Test
    void invalidateSignature_savesAuditWithActorUserId() {
        slip.recordSignature("김", pngBytes, validHash,
                com.samhanair.logis.slip.domain.SignatureChannel.MOBILE_CANVAS);
        String prevHash = slip.getSignatureHash();
        when(slipRepository.findById(slip.getId())).thenReturn(Optional.of(slip));

        AdminSignatureResponse res = service.invalidateSignature(slip.getId(), "재서명", "master-1");

        assertThat(res.signed()).isFalse();
        ArgumentCaptor<SlipSignatureAudit> captor = ArgumentCaptor.forClass(SlipSignatureAudit.class);
        verify(auditRepository, times(1)).save(captor.capture());
        SlipSignatureAudit audit = captor.getValue();
        assertThat(audit.getAction()).isEqualTo(SignatureAuditAction.INVALIDATE);
        assertThat(audit.getActorUserId()).isEqualTo("master-1");
        assertThat(audit.getReason()).isEqualTo("재서명");
        // 직전 hash snapshot 보존되었는지
        assertThat(audit.getSignatureHash()).isEqualTo(prevHash);
        assertThat(audit.getSignerName()).isEqualTo("김");
    }

    @Test
    void invalidateSignature_unsignedSlip_throwsConflict_noAuditSaved() {
        when(slipRepository.findById(slip.getId())).thenReturn(Optional.of(slip));
        // slip 미서명 상태

        assertThatThrownBy(() -> service.invalidateSignature(slip.getId(), "사유", "master-1"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
        verify(auditRepository, never()).save(any());
    }

    @Test
    void invalidateSignature_unknownSlipId_throwsNotFound() {
        UUID fake = UUID.randomUUID();
        when(slipRepository.findById(fake)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.invalidateSignature(fake, "사유", "master-1"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NOT_FOUND));
    }

    // ---------- getSignature ----------

    @Test
    void getSignature_signedSlip_returnsFullMeta() {
        slip.recordSignature("김", pngBytes, validHash,
                com.samhanair.logis.slip.domain.SignatureChannel.MOBILE_CANVAS);
        when(slipRepository.findById(slip.getId())).thenReturn(Optional.of(slip));

        AdminSignatureResponse res = service.getSignature(slip.getId());

        assertThat(res.signed()).isTrue();
        assertThat(res.signatureHash()).isEqualTo(validHash);
        assertThat(res.signaturePngBase64()).startsWith("data:image/png;base64,");
    }

    @Test
    void getSignature_unsignedSlip_returnsSignedFalse() {
        when(slipRepository.findById(slip.getId())).thenReturn(Optional.of(slip));

        AdminSignatureResponse res = service.getSignature(slip.getId());

        assertThat(res.signed()).isFalse();
        assertThat(res.signatureHash()).isNull();
    }

    // ---------- helpers ----------

    private static void setIdField(Object target, UUID value) {
        try {
            Field f = target.getClass().getDeclaredField("id");
            f.setAccessible(true);
            f.set(target, value);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private static String sha256Hex(byte[] data) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(data);
            StringBuilder sb = new StringBuilder(64);
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

}

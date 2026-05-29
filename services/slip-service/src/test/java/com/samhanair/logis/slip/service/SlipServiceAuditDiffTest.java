package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.audit.service.SlipAuditLogService;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.web.dto.EditHeaderRequest;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * PR-H2 BE — SlipService 의 audit overlay diff 통합 5 case 단위 테스트.
 *
 * <ol>
 *   <li>editHeader — memo 변경 시 audit overlay 1행 호출</li>
 *   <li>editHeader — memo 미변경 (req.memo()=null) 시 audit 미호출</li>
 *   <li>editHeader — memo 동일 값 (oldValue=newValue) 시 audit 미호출</li>
 *   <li>applyOverlayPatch — 정상 단일 필드 patch + audit 호출</li>
 *   <li>applyOverlayPatch — 미지원 필드 시 INVALID_INPUT</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
class SlipServiceAuditDiffTest {

    @Mock private SlipRepository slipRepository;
    @Mock private SlipNumberService slipNumberService;
    @Mock private ProductClient productClient;
    @Mock private InventoryClient inventoryClient;
    @Mock private SlipAuditLogService auditLogService;
    /** 권한 재편 Phase 2.1 Task 2 — overlay patch 성공 시 capture 호출. mock 격리. */
    @Mock private com.samhanair.logis.slip.revision.service.SlipRevisionService slipRevisionService;

    @InjectMocks private SlipService service;

    private UUID slipId;
    private Slip slip;

    @BeforeEach
    void setUp() {
        slipId = UUID.randomUUID();
        slip = Slip.createOutbound("2026/05/10-001", LocalDate.now(), 1,
                UUID.randomUUID(), null, null, "거래처A", null, "원본 메모", "user-1");
    }

    @Test
    void editHeader_memoChanged_recordsOverlayPatch() {
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        EditHeaderRequest req = new EditHeaderRequest(null, null, null,
                "수정된 메모", null, null);
        service.editHeader(slipId, req, "user-1");

        verify(auditLogService, times(1)).recordOverlayPatch(
                eq(slipId), any(), eq("user-1"), eq(null),
                eq("memo"), eq("원본 메모"), eq("수정된 메모"));
    }

    @Test
    void editHeader_memoNull_skipsOverlay() {
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        EditHeaderRequest req = new EditHeaderRequest(null, null, null,
                null, null, null);
        service.editHeader(slipId, req, "user-1");

        verify(auditLogService, never()).recordOverlayPatch(
                any(), any(), anyString(), any(), anyString(), any(), any());
    }

    @Test
    void editHeader_memoSameValue_skipsOverlay() {
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        EditHeaderRequest req = new EditHeaderRequest(null, null, null,
                "원본 메모", null, null);
        service.editHeader(slipId, req, "user-1");

        verify(auditLogService, never()).recordOverlayPatch(
                any(), any(), anyString(), any(), anyString(), any(), any());
    }

    @Test
    void applyOverlayPatch_normalField_patchesAndRecords() {
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        service.applyOverlayPatch(slipId, "shippingAddress", "서울시 강남구 테헤란로 1",
                "user-1", "관리자홍");

        assertThat(slip.getShippingAddress()).isEqualTo("서울시 강남구 테헤란로 1");
        verify(auditLogService, times(1)).recordOverlayPatch(
                eq(slipId), any(), eq("관리자홍"), eq(null),
                eq("shippingAddress"), eq(null), eq("서울시 강남구 테헤란로 1"));
    }

    @Test
    void applyOverlayPatch_unsupportedField_throwsInvalidInput() {
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        assertThatThrownBy(() -> service.applyOverlayPatch(slipId, "nonExistentField",
                "any", "user-1", null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_INPUT);

        verify(auditLogService, never()).recordOverlayPatch(
                any(), any(), anyString(), any(), anyString(), any(), any());
    }
}

package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.audit.service.SlipAuditLogService;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.editrequest.service.SlipEditRequestService;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.web.dto.EditHeaderRequest;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * PR-H2 BE — SlipService 의 audit overlay diff 5 case 단위 테스트.
 *
 * <p>SlipService 전 의존을 @Mock 등록 + @BeforeEach lenient stub 하여
 * editHeader 게이트/applyDeliverySchedule 경로를 실제로 탄다.
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
    /** PR-H3 — 잠금 정책 가드. 본 테스트에서는 mock 격리. */
    @Mock private SlipEditRequestService editRequestService;
    /** V20 — partner-service businessNumber resolve. 본 테스트에서는 mock 격리 (empty 반환). */
    @Mock private PartnerInternalClient partnerInternalClient;
    /**
     * SP-08-FU2 P2-2 — inventory-service 창고명 lookup client.
     * 단위 테스트에서는 mock 격리 (empty 반환).
     */
    @Mock private WarehouseInternalClient warehouseInternalClient;
    /** 권한 재편 Phase 2.1 Task 2 — mutation 스냅샷 캡처. 본 테스트에서는 mock 격리. */
    @Mock private com.samhanair.logis.slip.revision.service.SlipRevisionService slipRevisionService;
    /**
     * 출고 마감 게이트 — SlipService 가 slipDate 기본값 계산 시 LocalDate.now(clock) 사용.
     * Clock @Mock 미등록 시 @InjectMocks 가 null 주입 → NPE.
     */
    @Mock private Clock clock;
    /**
     * 출고전표 마감 게이트 — editHeader/create 의 cutoffGuard.assertWithinCutoff() 호출 경로.
     * 단위 테스트에서는 mock 격리(lenient, 기본 통과).
     */
    @Mock private com.samhanair.logis.slip.service.cutoff.OutboundCutoffGuard cutoffGuard;
    /** 전표일 마감 게이트 — 단위 테스트에서는 mock 격리. */
    @Mock private com.samhanair.logis.slip.service.closing.SlipClosedDateGuard closedDateGuard;
    /** 결재선 결재자 게이트 — 단위 테스트 격리. */
    @Mock private com.samhanair.logis.slip.client.ApprovalLineAuthorizeClient approvalLineAuthorizeClient;
    /** user-service 내부 클라이언트 — 단위 테스트 격리 (ownerFullName resolve). */
    @Mock private com.samhanair.logis.slip.client.UserInternalClient userInternalClient;
    /** SSE 브로커 — 단위 테스트 격리 (restore broadcast). */
    @Mock private com.samhanair.logis.slip.realtime.SlipRealtimeBroker broker;
    /** 보상 감사 로그 — 단위 테스트 격리. */
    @Mock private com.samhanair.logis.slip.service.CompensationAuditWriter compensationAuditWriter;
    /** #809 가격기억 — 단위 테스트 격리. */
    @Mock private com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryService priceMemoryService;

    @InjectMocks private SlipService service;

    private UUID slipId;
    private Slip slip;

    @BeforeEach
    void setUp() {
        slipId = UUID.randomUUID();
        slip = Slip.createOutbound("2026/05/10-001", LocalDate.of(2026, 5, 10), 1,
                UUID.randomUUID(), null, null, "거래처A", null, "원본 메모", "user-1");

        // Clock stub — slipDate=null 경로에서 LocalDate.now(clock) 호출 시 NPE 방지.
        lenient().when(clock.instant()).thenReturn(Instant.parse("2026-05-10T00:00:00Z"));
        lenient().when(clock.getZone()).thenReturn(ZoneId.of("Asia/Seoul"));

        // partnerInternalClient — resolvePartnerCode 기본 empty 반환 (graceful fallback)
        lenient().when(partnerInternalClient.resolvePartnerCode(any()))
                .thenReturn(Optional.empty());
        lenient().when(partnerInternalClient.verifyPartnerCode(anyString()))
                .thenReturn(com.samhanair.logis.slip.client.PartnerInternalClient.PartnerVerifyResult.skipped(Optional.empty()));

        // warehouseInternalClient — findWarehouseName 기본 empty 반환
        lenient().when(warehouseInternalClient.findWarehouseName(any())).thenReturn(Optional.empty());

        // userInternalClient — resolveFullName 기본 empty 반환
        lenient().when(userInternalClient.resolveFullName(any())).thenReturn(Optional.empty());

        // approvalLineAuthorizeClient — 결재 미설정 상태(configured=false)로 게이트 통과
        lenient().when(approvalLineAuthorizeClient.authorize(anyString(), anyString(), any()))
                .thenReturn(new com.samhanair.logis.slip.client.ApprovalLineAuthorizeResult(false, false));

        // cutoffGuard — 기본 통과 (no-op)
        lenient().doNothing().when(cutoffGuard).assertWithinCutoff(any(), any());
    }

    @Test
    void editHeader_memoChanged_recordsOverlayPatch() {
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        EditHeaderRequest req = new EditHeaderRequest(null, null, null,
                "수정된 메모", null, null, null);
        service.editHeader(slipId, req, "user-1", "홍길동");

        verify(auditLogService, times(1)).recordOverlayPatch(
                eq(slipId), any(), eq("user-1"), eq(null),
                eq("memo"), eq("원본 메모"), eq("수정된 메모"));
    }

    @Test
    void editHeader_memoNull_skipsOverlay() {
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        EditHeaderRequest req = new EditHeaderRequest(null, null, null,
                null, null, null, null);
        service.editHeader(slipId, req, "user-1", "홍길동");

        verify(auditLogService, never()).recordOverlayPatch(
                any(), any(), anyString(), any(), anyString(), any(), any());
    }

    @Test
    void editHeader_memoSameValue_skipsOverlay() {
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        EditHeaderRequest req = new EditHeaderRequest(null, null, null,
                "원본 메모", null, null, null);
        service.editHeader(slipId, req, "user-1", "홍길동");

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

    /**
     * editHeader — 배송태그 미변경 + N 편집(당착: unloadDate=slipDate) 검증.
     *
     * <p>지방 전표 생성 후 deliveryTag=null(유지), unloadDate=slipDate 로 editHeader →
     * unloadDate == slipDate, scheduleLabel = "당착" 검증.
     *
     * <p>도메인 단위에서 applyDeliverySchedule 경로 직접 검증
     * (당착 = REGION 태그 + override=slipDate).
     */
    @Test
    void editHeader_태그미변경_당착편집_unloadDate_당착() {
        // 지방(REGION) 전표 — slipDate = 2026-05-10(일요일 아닌 평일 고정)
        LocalDate slipDate = LocalDate.of(2027, 3, 10); // 수요일
        Slip regionSlip = Slip.createOutbound("2027/03/10-001", slipDate, 1,
                UUID.randomUUID(), null, null, "거래처B", DeliveryTag.REGION, "메모", "user-1");
        // 최초 배송일정 적용 (unloadDate = 익일 목요일)
        regionSlip.applyDeliverySchedule(DeliveryTag.REGION, null);
        assertThat(regionSlip.getUnloadDate()).isEqualTo(slipDate.plusDays(1));

        UUID regionSlipId = UUID.randomUUID();
        when(slipRepository.findById(regionSlipId)).thenReturn(Optional.of(regionSlip));

        // editHeader: deliveryTag=null(미변경), unloadDate=slipDate(당착)
        EditHeaderRequest req = new EditHeaderRequest(null, null, null, null, null, null, slipDate);
        service.editHeader(regionSlipId, req, "user-1", "홍길동");

        // unloadDate == slipDate (당착 override)
        assertThat(regionSlip.getUnloadDate()).isEqualTo(slipDate);
        // scheduleLabel = "당착" (지방 && N==M)
        assertThat(com.samhanair.logis.slip.domain.schedule.DeliverySchedule
                .scheduleLabel(regionSlip.getSlipDate(), regionSlip.getUnloadDate(), regionSlip.getDeliveryTag()))
                .isEqualTo("당착");
    }
}

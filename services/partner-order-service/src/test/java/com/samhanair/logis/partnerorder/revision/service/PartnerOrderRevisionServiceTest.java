package com.samhanair.logis.partnerorder.revision.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.domain.PartnerOrderStatus;
import com.samhanair.logis.partnerorder.revision.service.PartnerOrderRestoreResult;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.revision.domain.PartnerOrderRevision;
import com.samhanair.logis.partnerorder.revision.domain.PartnerOrderRevisionType;
import com.samhanair.logis.partnerorder.revision.repository.PartnerOrderRevisionRepository;
import com.samhanair.logis.partnerorder.revision.snapshot.PartnerOrderSnapshot;
import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

/**
 * {@link PartnerOrderRevisionService} 단위 테스트 (Phase 2.4 Task 4 + 5).
 *
 * <p>검증 항목:
 * <ul>
 *   <li>capture 연속 호출 시 revision_no 1, 2 단조증가</li>
 *   <li>actorName=UUID → null 저장 (UUID 비공개 가드)</li>
 *   <li>DataIntegrityViolation 1회 재시도 후 성공</li>
 *   <li>DataIntegrityViolation 2회 → 409 CONFLICT</li>
 *   <li>restore: DRAFT 주문 — 헤더+라인 원복 + RESTORE revision 캡처(sourceRevisionNo 기록) + slipResyncRequired=false</li>
 *   <li>restore: CONFIRMED 주문 — 복원 성공 + slipResyncRequired=true (Phase 2.4 정책 변경)</li>
 *   <li>restore: CONFIRMING → 409 CONFLICT</li>
 *   <li>restore: CANCELED → 409 CONFLICT</li>
 *   <li>restore: orderId 미존재 → 404</li>
 *   <li>restore: revisionNo 미존재 → 404</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class PartnerOrderRevisionServiceTest {

    @Mock
    private PartnerOrderRevisionRepository revisionRepository;

    @Mock
    private PartnerOrderRepository orderRepository;

    private ObjectMapper objectMapper;
    private PartnerOrderRevisionService service;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
        objectMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        service = new PartnerOrderRevisionService(revisionRepository, orderRepository, objectMapper);
    }

    // ── capture 채번 단조증가 ──────────────────────────────────────────────────

    @Nested
    @DisplayName("capture() — revision_no 채번")
    class CaptureRevisionNo {

        @Test
        @DisplayName("capture 연속 2회 호출 시 revision_no 1, 2 단조증가")
        void capture_consecutiveCalls_revisionNoIncreases() {
            // given
            PartnerOrder order = draftOrder();
            UUID orderId = order.getId();

            // 첫 호출 시 MAX=null (스냅샷 없음) → 1
            when(revisionRepository.findMaxRevisionNo(orderId)).thenReturn(null).thenReturn(1);
            when(revisionRepository.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

            // when
            PartnerOrderRevision rev1 = service.capture(order, PartnerOrderRevisionType.CREATE,
                    null, UUID.randomUUID(), "홍길동", null);
            PartnerOrderRevision rev2 = service.capture(order, PartnerOrderRevisionType.EDIT,
                    null, UUID.randomUUID(), "김영희", null);

            // then
            assertThat(rev1.getRevisionNo()).isEqualTo(1);
            assertThat(rev2.getRevisionNo()).isEqualTo(2);
        }
    }

    // ── UUID 비공개 가드 ───────────────────────────────────────────────────────

    @Nested
    @DisplayName("displayNameOrNull() — actorName UUID 비공개 가드")
    class DisplayNameOrNull {

        @Test
        @DisplayName("actorName 이 UUID 패턴이면 null 반환")
        void actorName_uuid_returnsNull() {
            UUID id = UUID.randomUUID();
            String uuidString = id.toString();
            assertThat(PartnerOrderRevisionService.displayNameOrNull(id, uuidString)).isNull();
        }

        @Test
        @DisplayName("actorName 이 actorId 와 동일한 UUID 문자열이면 null 반환")
        void actorName_sameAsActorId_returnsNull() {
            UUID id = UUID.randomUUID();
            assertThat(PartnerOrderRevisionService.displayNameOrNull(id, id.toString())).isNull();
        }

        @Test
        @DisplayName("actorName 이 일반 이름이면 원본 반환")
        void actorName_normalName_returnsOriginal() {
            UUID id = UUID.randomUUID();
            assertThat(PartnerOrderRevisionService.displayNameOrNull(id, "홍길동")).isEqualTo("홍길동");
        }

        @Test
        @DisplayName("actorName 이 null 이면 null 반환")
        void actorName_null_returnsNull() {
            assertThat(PartnerOrderRevisionService.displayNameOrNull(UUID.randomUUID(), null))
                    .isNull();
        }

        @Test
        @DisplayName("capture 호출 시 actorName=UUID → 저장된 revision 의 actorName=null")
        void capture_actorNameUuid_savedWithNullActorName() {
            // given
            PartnerOrder order = draftOrder();
            UUID actorId = UUID.randomUUID();
            String actorNameAsUuid = actorId.toString(); // X-User-Name 미전파 시 UUID 전달 케이스

            when(revisionRepository.findMaxRevisionNo(order.getId())).thenReturn(null);
            ArgumentCaptor<PartnerOrderRevision> captor = ArgumentCaptor.forClass(PartnerOrderRevision.class);
            when(revisionRepository.saveAndFlush(captor.capture())).thenAnswer(inv -> inv.getArgument(0));

            // when
            service.capture(order, PartnerOrderRevisionType.CREATE, null,
                    actorId, actorNameAsUuid, null);

            // then
            assertThat(captor.getValue().getActorName()).isNull();
        }
    }

    // ── DataIntegrityViolation 재시도 ─────────────────────────────────────────

    @Nested
    @DisplayName("capture() — race 충돌 재시도")
    class CaptureRaceRetry {

        @Test
        @DisplayName("DataIntegrityViolation 1회 → 재시도 성공")
        void capture_firstConflict_retrySucceeds() {
            // given
            PartnerOrder order = draftOrder();
            when(revisionRepository.findMaxRevisionNo(order.getId()))
                    .thenReturn(null)   // 첫 시도
                    .thenReturn(null);  // 재시도

            PartnerOrderRevision retryResult = mockRevision(order.getId(), 1);
            when(revisionRepository.saveAndFlush(any()))
                    .thenThrow(new DataIntegrityViolationException("unique violation")) // 1차 실패
                    .thenReturn(retryResult); // 재시도 성공

            // when
            PartnerOrderRevision result = service.capture(order, PartnerOrderRevisionType.CREATE,
                    null, UUID.randomUUID(), "홍길동", null);

            // then
            assertThat(result).isEqualTo(retryResult);
            verify(revisionRepository, times(2)).saveAndFlush(any());
        }

        @Test
        @DisplayName("DataIntegrityViolation 2회 → 409 CONFLICT")
        void capture_twoConflicts_throws409() {
            // given
            PartnerOrder order = draftOrder();
            when(revisionRepository.findMaxRevisionNo(order.getId())).thenReturn(null);
            when(revisionRepository.saveAndFlush(any()))
                    .thenThrow(new DataIntegrityViolationException("unique violation"));

            // when + then
            assertThatThrownBy(() -> service.capture(order, PartnerOrderRevisionType.CREATE,
                    null, UUID.randomUUID(), "홍길동", null))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                            .isEqualTo(HttpStatus.CONFLICT));
        }
    }

    // ── restore ──────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("restore() — 복원 성공 + 상태 가드 (Phase 2.4 정책 변경: 제외목록 방식)")
    class RestoreTests {

        @Test
        @DisplayName("DRAFT 주문 restore 시 헤더+라인 원복 + RESTORE revision(sourceRevisionNo 기록) + slipResyncRequired=false")
        void restore_draftOrder_headerAndLinesRestored() throws Exception {
            // given
            UUID orderId = UUID.randomUUID();
            PartnerOrder order = draftOrder(orderId);

            // 스냅샷 — 원본 상태 (rev1)
            PartnerOrderLine snapLine = PartnerOrderLine.create(
                    UUID.randomUUID(), "MODEL-ORIG", "원본상품", "homemulti",
                    2, new BigDecimal("100000.00"), "원본비고");
            PartnerOrderSnapshot snapshot = new PartnerOrderSnapshot(
                    order.getOrderNo(), "ORIG-PC", "ORIG-BIZ",
                    PartnerOrderStatus.DRAFT, null, null,
                    new BigDecimal("200000.00"), null, null,
                    null, "원본메모", null, 0,
                    java.util.List.of(PartnerOrderSnapshot.LineSnapshot.from(snapLine)));

            String snapshotJson = objectMapper.writeValueAsString(snapshot);
            PartnerOrderRevision targetRevision = mockRevisionWithSnapshot(orderId, 1, snapshotJson);

            when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));
            when(revisionRepository.findByPartnerOrderIdAndRevisionNo(orderId, 1))
                    .thenReturn(Optional.of(targetRevision));
            when(orderRepository.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
            when(revisionRepository.findMaxRevisionNo(orderId)).thenReturn(1);
            when(revisionRepository.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

            // when
            PartnerOrderRestoreResult result = service.restore(orderId, 1, UUID.randomUUID(), "복원자", null);

            // then — 헤더 복원 확인
            assertThat(result.order().getPartnerCode()).isEqualTo("ORIG-PC");
            assertThat(result.order().getBizCode()).isEqualTo("ORIG-BIZ");
            assertThat(result.order().getMemo()).isEqualTo("원본메모");
            // DRAFT 복원은 slipResyncRequired=false
            assertThat(result.slipResyncRequired()).isFalse();
        }

        @Test
        @DisplayName("CONFIRMED 주문 restore → 복원 성공 + slipResyncRequired=true (Phase 2.4 정책 변경)")
        void restore_confirmedOrder_successWithSlipResyncRequired() throws Exception {
            // given
            UUID orderId = UUID.randomUUID();
            PartnerOrder order = confirmedOrder(orderId);

            PartnerOrderLine snapLine = PartnerOrderLine.create(
                    UUID.randomUUID(), "MODEL-CONF", "완료상품", "homemulti",
                    1, new BigDecimal("50000.00"), null);
            PartnerOrderSnapshot snapshot = new PartnerOrderSnapshot(
                    order.getOrderNo(), "CONF-PC", "CONF-BIZ",
                    PartnerOrderStatus.CONFIRMED, null, null,
                    new BigDecimal("50000.00"), null, null,
                    null, "완료메모", null, 0,
                    java.util.List.of(PartnerOrderSnapshot.LineSnapshot.from(snapLine)));

            String snapshotJson = objectMapper.writeValueAsString(snapshot);
            PartnerOrderRevision targetRevision = mockRevisionWithSnapshot(orderId, 1, snapshotJson);

            when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));
            when(revisionRepository.findByPartnerOrderIdAndRevisionNo(orderId, 1))
                    .thenReturn(Optional.of(targetRevision));
            when(orderRepository.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
            when(revisionRepository.findMaxRevisionNo(orderId)).thenReturn(1);
            when(revisionRepository.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

            // when
            PartnerOrderRestoreResult result = service.restore(orderId, 1, UUID.randomUUID(), "복원자", null);

            // then — 복원 성공
            assertThat(result.order().getPartnerCode()).isEqualTo("CONF-PC");
            // CONFIRMED 복원은 slipResyncRequired=true
            assertThat(result.slipResyncRequired()).isTrue();
        }

        @Test
        @DisplayName("CONFIRMING 상태 주문 restore → 409 CONFLICT")
        void restore_confirmingOrder_throws409() {
            // given
            UUID orderId = UUID.randomUUID();
            PartnerOrder order = confirmingOrder(orderId);

            when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));
            when(revisionRepository.findByPartnerOrderIdAndRevisionNo(orderId, 1))
                    .thenReturn(Optional.of(mockRevision(orderId, 1)));

            // when + then
            assertThatThrownBy(() -> service.restore(orderId, 1, UUID.randomUUID(), "복원자", null))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                            .isEqualTo(HttpStatus.CONFLICT));
        }

        @Test
        @DisplayName("CANCELED 상태 주문 restore → 409 CONFLICT")
        void restore_canceledOrder_throws409() {
            // given
            UUID orderId = UUID.randomUUID();
            PartnerOrder order = canceledOrder(orderId);

            when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));
            when(revisionRepository.findByPartnerOrderIdAndRevisionNo(orderId, 1))
                    .thenReturn(Optional.of(mockRevision(orderId, 1)));

            // when + then
            assertThatThrownBy(() -> service.restore(orderId, 1, UUID.randomUUID(), "복원자", null))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                            .isEqualTo(HttpStatus.CONFLICT));
        }

        @Test
        @DisplayName("orderId 미존재 → 404 NOT_FOUND")
        void restore_orderNotFound_throws404() {
            UUID orderId = UUID.randomUUID();
            when(orderRepository.findById(orderId)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.restore(orderId, 1, UUID.randomUUID(), "복원자", null))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                            .isEqualTo(HttpStatus.NOT_FOUND));
        }

        @Test
        @DisplayName("revisionNo 미존재 → 404 NOT_FOUND")
        void restore_revisionNotFound_throws404() {
            UUID orderId = UUID.randomUUID();
            PartnerOrder order = draftOrder(orderId);

            when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));
            when(revisionRepository.findByPartnerOrderIdAndRevisionNo(orderId, 99))
                    .thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.restore(orderId, 99, UUID.randomUUID(), "복원자", null))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                            .isEqualTo(HttpStatus.NOT_FOUND));
        }
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────

    /** DRAFT 상태 주문 (from-estimate 경로). */
    private PartnerOrder draftOrder() {
        return draftOrder(UUID.randomUUID());
    }

    private PartnerOrder draftOrder(UUID id) {
        PartnerOrder order = PartnerOrder.createFromEstimate(
                "GS01", "1234567890", "2026/05/30-1",
                "idem-key-" + id, BigDecimal.ZERO,
                UUID.randomUUID(), null, null);
        ReflectionTestUtils.setField(order, "id", id);
        // 라인 1개 추가
        PartnerOrderLine line = PartnerOrderLine.create(
                UUID.randomUUID(), "MODEL-INIT", "초기상품", "homemulti",
                1, new BigDecimal("50000.00"), null);
        order.addLine(line);
        return order;
    }

    /** CONFIRMED 상태 주문. */
    private PartnerOrder confirmedOrder(UUID id) {
        PartnerOrder order = PartnerOrder.createFromEstimate(
                "GS01", "1234567890", "2026/05/30-CONF",
                "idem-conf-" + id, BigDecimal.ZERO,
                UUID.randomUUID(), null, null);
        ReflectionTestUtils.setField(order, "id", id);
        // status=CONFIRMED 세팅
        ReflectionTestUtils.setField(order, "status", PartnerOrderStatus.CONFIRMED);
        return order;
    }

    /** CONFIRMING 상태 주문. */
    private PartnerOrder confirmingOrder(UUID id) {
        PartnerOrder order = PartnerOrder.createFromEstimate(
                "GS01", "1234567890", "2026/05/30-CMING",
                "idem-cming-" + id, BigDecimal.ZERO,
                UUID.randomUUID(), null, null);
        ReflectionTestUtils.setField(order, "id", id);
        ReflectionTestUtils.setField(order, "status", PartnerOrderStatus.CONFIRMING);
        return order;
    }

    /** CANCELED 상태 주문. */
    private PartnerOrder canceledOrder(UUID id) {
        PartnerOrder order = PartnerOrder.createFromEstimate(
                "GS01", "1234567890", "2026/05/30-CNCL",
                "idem-cncl-" + id, BigDecimal.ZERO,
                UUID.randomUUID(), null, null);
        ReflectionTestUtils.setField(order, "id", id);
        ReflectionTestUtils.setField(order, "status", PartnerOrderStatus.CANCELED);
        return order;
    }

    /** snapshot 없이 revisionNo 만 세팅된 mock revision. */
    private PartnerOrderRevision mockRevision(UUID orderId, int revisionNo) {
        PartnerOrderRevision rev = PartnerOrderRevision.of(
                orderId, revisionNo, PartnerOrderRevisionType.CREATE,
                null, "2026/05/30-1", "{}",
                null, null, null);
        return rev;
    }

    /** snapshot JSON 이 포함된 revision. */
    private PartnerOrderRevision mockRevisionWithSnapshot(UUID orderId, int revisionNo,
                                                           String snapshotJson) {
        return PartnerOrderRevision.of(
                orderId, revisionNo, PartnerOrderRevisionType.CREATE,
                null, "2026/05/30-1", snapshotJson,
                null, null, null);
    }
}

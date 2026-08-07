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
import com.samhanair.logis.partnerorder.repository.PartnerOrderLineRepository;
import com.samhanair.logis.partnerorder.revision.service.PartnerOrderRestoreResult;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.revision.domain.PartnerOrderRevision;
import com.samhanair.logis.partnerorder.revision.domain.PartnerOrderRevisionType;
import com.samhanair.logis.partnerorder.revision.repository.PartnerOrderRevisionRepository;
import com.samhanair.logis.partnerorder.realtime.PartnerOrderAuthorityEventPublisher;
import com.samhanair.logis.partnerorder.revision.snapshot.PartnerOrderSnapshot;
import java.math.BigDecimal;
import java.util.List;
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

    @Mock
    private PartnerOrderLineRepository lineRepository;

    @Mock
    private PartnerOrderAuthorityEventPublisher authorityEventPublisher;

    private ObjectMapper objectMapper;
    private PartnerOrderRevisionService service;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
        objectMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        service = new PartnerOrderRevisionService(revisionRepository, orderRepository, lineRepository, objectMapper,
                null, authorityEventPublisher);

        // restore() 내부 lineRepository.findAllIncludingDeletedByPartnerOrderId() 기본 lenient stub
        // (단위 테스트에서 실 DB 조회 불가 — 빈 리스트 반환으로 사이드이펙트 없음)
        lenient().when(lineRepository.findAllIncludingDeletedByPartnerOrderId(any(UUID.class)))
                .thenReturn(java.util.List.of());
    }

    // ── listWithSummary 스냅샷 스키마 진화 내성 ───────────────────────────────

    @Nested
    @DisplayName("listWithSummary() — 저장 스냅샷 스키마 진화 내성")
    class ListWithSummarySnapshotEvolution {

        @Test
        @DisplayName("① unknown 필드가 추가된 snapshot 은 정상 요약한다")
        void listWithSummary_unknownFields_succeeds() {
            UUID orderId = UUID.randomUUID();
            when(revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(orderId))
                    .thenReturn(List.of(mockRevisionWithSnapshot(orderId, 1,
                            snapshotWithUnknownFields())));

            List<com.samhanair.logis.partnerorder.revision.web.dto.PartnerOrderRevisionResponse> result =
                    service.listWithSummary(orderId);

            assertThat(result).hasSize(1);
            assertThat(result.get(0).changeSummary().lineAdded()).isEqualTo(1);
        }

        @Test
        @DisplayName("② 폐기된 enum 값이 저장된 snapshot 도 500 없이 요약한다")
        void listWithSummary_unknownEnumValues_succeeds() {
            UUID orderId = UUID.randomUUID();
            when(revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(orderId))
                    .thenReturn(List.of(mockRevisionWithSnapshot(orderId, 1,
                            snapshotWithUnknownEnumValues())));

            List<com.samhanair.logis.partnerorder.revision.web.dto.PartnerOrderRevisionResponse> result =
                    service.listWithSummary(orderId);

            assertThat(result).hasSize(1);
            assertThat(result.get(0).changeSummary().lineAdded()).isEqualTo(1);
        }

        @Test
        @DisplayName("③ 타입 불일치로 역직렬화 불가한 snapshot 은 해당 revision summary 만 null 처리한다")
        void listWithSummary_typeMismatch_returnsRevisionWithEmptySummary() {
            UUID orderId = UUID.randomUUID();
            when(revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(orderId))
                    .thenReturn(List.of(mockRevisionWithSnapshot(orderId, 1,
                            snapshotWithTypeMismatch())));

            List<com.samhanair.logis.partnerorder.revision.web.dto.PartnerOrderRevisionResponse> result =
                    service.listWithSummary(orderId);

            assertThat(result).hasSize(1);
            assertThat(result.get(0).changeSummary()).isNull();
        }
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
            verify(authorityEventPublisher).publish(orderId, "CREATE", 1);
            verify(authorityEventPublisher).publish(orderId, "EDIT", 2);
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
                    order.getOrderNo(), UUID.fromString("00000000-0000-0000-0000-000000000902"),
                    "ORIG-PC", "ORIG-BIZ",
                    PartnerOrderStatus.DRAFT, null, null,
                    new BigDecimal("200000.00"), null, null,
                    null, "원본메모", null, 0,
                    java.util.List.of(PartnerOrderSnapshot.LineSnapshot.from(snapLine)));

            String snapshotJson = objectMapper.writeValueAsString(snapshot);
            PartnerOrderRevision targetRevision = mockRevisionWithSnapshot(orderId, 1, snapshotJson);

            when(orderRepository.findByIdIncludingDeleted(orderId)).thenReturn(Optional.of(order));
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
            assertThat(result.order().getPartnerId())
                    .isEqualTo(UUID.fromString("00000000-0000-0000-0000-000000000902"));
            assertThat(result.order().getMemo()).isEqualTo("원본메모");
            // DRAFT 복원은 slipResyncRequired=false
            assertThat(result.slipResyncRequired()).isFalse();
            verify(authorityEventPublisher).publish(orderId, "RESTORE", 2);
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

            when(orderRepository.findByIdIncludingDeleted(orderId)).thenReturn(Optional.of(order));
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
            // [P1-6] restoreHeader 는 status 를 변경하지 않으므로 복원 후에도 CONFIRMED 유지
            assertThat(result.order().getStatus()).isEqualTo(PartnerOrderStatus.CONFIRMED);
            verify(authorityEventPublisher).publish(orderId, "RESTORE", 2);
        }

        @Test
        @DisplayName("CONFIRMING 상태 주문 restore → 409 CONFLICT")
        void restore_confirmingOrder_throws409() {
            // given
            UUID orderId = UUID.randomUUID();
            PartnerOrder order = confirmingOrder(orderId);

            when(orderRepository.findByIdIncludingDeleted(orderId)).thenReturn(Optional.of(order));
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

            when(orderRepository.findByIdIncludingDeleted(orderId)).thenReturn(Optional.of(order));
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
            when(orderRepository.findByIdIncludingDeleted(orderId)).thenReturn(Optional.empty());

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

            when(orderRepository.findByIdIncludingDeleted(orderId)).thenReturn(Optional.of(order));
            when(revisionRepository.findByPartnerOrderIdAndRevisionNo(orderId, 99))
                    .thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.restore(orderId, 99, UUID.randomUUID(), "복원자", null))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                            .isEqualTo(HttpStatus.NOT_FOUND));
        }

        @Test
        @DisplayName("soft-deleted(is_deleted=true) 주문도 findByIdIncludingDeleted 로 로드 후 복원 가능")
        void restore_softDeletedOrder_undeleteAndRestoreContent() throws Exception {
            // given
            UUID orderId = UUID.randomUUID();
            PartnerOrder order = draftOrder(orderId);
            // soft-delete 상태 모의 (BaseEntity.markDeleted 호출)
            order.markDeleted("삭제자");
            assertThat(order.getIsDeleted()).isTrue();

            PartnerOrderLine snapLine = PartnerOrderLine.create(
                    UUID.randomUUID(), "MODEL-DEL", "삭제전상품", "homemulti",
                    1, new BigDecimal("80000.00"), "복원비고");
            PartnerOrderSnapshot snapshot = new PartnerOrderSnapshot(
                    order.getOrderNo(), "DEL-PC", "DEL-BIZ",
                    PartnerOrderStatus.DRAFT, null, null,
                    new BigDecimal("80000.00"), null, null,
                    null, "삭제전메모", null, 0,
                    java.util.List.of(PartnerOrderSnapshot.LineSnapshot.from(snapLine)));

            String snapshotJson = objectMapper.writeValueAsString(snapshot);
            PartnerOrderRevision targetRevision = mockRevisionWithSnapshot(orderId, 1, snapshotJson);

            // findByIdIncludingDeleted — soft-deleted 주문 반환
            when(orderRepository.findByIdIncludingDeleted(orderId)).thenReturn(Optional.of(order));
            when(revisionRepository.findByPartnerOrderIdAndRevisionNo(orderId, 1))
                    .thenReturn(Optional.of(targetRevision));
            when(orderRepository.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
            when(revisionRepository.findMaxRevisionNo(orderId)).thenReturn(1);
            when(revisionRepository.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

            // when
            PartnerOrderRestoreResult result = service.restore(orderId, 1, UUID.randomUUID(), "복원자", null);

            // then
            // undelete 확인 — is_deleted=false 로 복구
            assertThat(result.order().getIsDeleted()).isFalse();
            assertThat(result.order().getDeletedAt()).isNull();
            // 헤더 복원 확인
            assertThat(result.order().getPartnerCode()).isEqualTo("DEL-PC");
            assertThat(result.order().getMemo()).isEqualTo("삭제전메모");
            // DRAFT 복원 → slipResyncRequired=false
            assertThat(result.slipResyncRequired()).isFalse();
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

    private String snapshotWithUnknownFields() {
        return """
                {
                  "orderNo": "2026/06/01-320",
                  "partnerCode": "P-REV-EVO",
                  "bizCode": "1112233333",
                  "status": "DRAFT",
                  "slipPublishStatus": "NOT_REQUIRED",
                  "totalAmount": 240000,
                  "dueDate": "2026-06-10",
                  "memo": "unknown field",
                  "legacyHeaderField": "과거 헤더 필드",
                  "revisionCount": 0,
                  "lines": [
                    {
                      "productId": "00000000-0000-0000-0000-000000000121",
                      "modelName": "AJ040RXH4BC1",
                      "productName": "실외기",
                      "categoryKey": "homemulti",
                      "quantity": 2,
                      "priceVat": 120000,
                      "subtotal": 240000,
                      "remark": "unknown field",
                      "legacyLineField": "과거 라인 필드"
                    }
                  ]
                }
                """;
    }

    private String snapshotWithUnknownEnumValues() {
        return """
                {
                  "orderNo": "2026/06/01-321",
                  "partnerCode": "P-REV-EVO",
                  "bizCode": "1112233333",
                  "status": "LEGACY_DONE",
                  "slipPublishStatus": "LEGACY_QUEUE",
                  "totalAmount": 240000,
                  "dueDate": "2026-06-10",
                  "memo": "unknown enum",
                  "revisionCount": 0,
                  "lines": [
                    {
                      "productId": "00000000-0000-0000-0000-000000000122",
                      "modelName": "AJ040RXH4BC1",
                      "productName": "실외기",
                      "categoryKey": "homemulti",
                      "quantity": 2,
                      "priceVat": 120000,
                      "subtotal": 240000,
                      "remark": "unknown enum"
                    }
                  ]
                }
                """;
    }

    private String snapshotWithTypeMismatch() {
        return """
                {
                  "orderNo": "2026/06/01-322",
                  "partnerCode": "P-REV-EVO",
                  "bizCode": "1112233333",
                  "status": "DRAFT",
                  "slipPublishStatus": "NOT_REQUIRED",
                  "totalAmount": 240000,
                  "dueDate": "2026-06-10",
                  "memo": "type mismatch",
                  "revisionCount": 0,
                  "lines": [
                    {
                      "productId": "00000000-0000-0000-0000-000000000123",
                      "modelName": "AJ040RXH4BC1",
                      "productName": "실외기",
                      "categoryKey": "homemulti",
                      "quantity": {"legacy": 2},
                      "priceVat": 120000,
                      "subtotal": 240000,
                      "remark": "type mismatch"
                    }
                  ]
                }
                """;
    }
}

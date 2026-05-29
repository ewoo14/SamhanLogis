package com.samhanair.logis.partner.revision.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.domain.PartnerContact;
import com.samhanair.logis.partner.domain.PartnerPriceDiscount;
import com.samhanair.logis.partner.domain.PartnerShippingAddress;
import com.samhanair.logis.partner.repository.PartnerRepository;
import com.samhanair.logis.partner.revision.domain.PartnerRevision;
import com.samhanair.logis.partner.revision.domain.PartnerRevisionType;
import com.samhanair.logis.partner.revision.domain.PartnerSnapshot;
import com.samhanair.logis.partner.revision.repository.PartnerRevisionRepository;
import com.samhanair.logis.partner.tab.dto.PartnerFullResponse;
import com.samhanair.logis.partner.tab.repository.PartnerContactRepository;
import com.samhanair.logis.partner.tab.repository.PartnerPriceDiscountRepository;
import com.samhanair.logis.partner.tab.repository.PartnerShippingAddressRepository;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * {@link PartnerRevisionService} 스냅샷 조립/캡처 단위 테스트 (권한 재편 Phase 2.3 Task 2).
 *
 * <p>거래처는 4탭 자식 (단가/할인 1:1, 배송지 1:N, 담당자 1:N) 이 entity 의 {@code @OneToMany} 가 아니라
 * service-layer 가 각 repository 로 partnerId join 수집하므로 스냅샷 조립이 service 책임이다. 본 테스트는
 * {@link PartnerRevisionService#assemble(UUID)} 의 헤더+3자식 정합, {@code maxRevisionNo+1} 채번 정합
 * (1 → 2), 채번 race (saveAndFlush DataIntegrityViolation 1회 → 재시도 성공 / 2회 → CONFLICT) 를
 * Mockito mock repository 로 검증한다.
 *
 * <p>{@code EstimateRevisionServiceTest} 의 capture 케이스 미러 (estimateId→partnerId, 4탭 자식 join 보강).
 */
@ExtendWith(MockitoExtension.class)
class PartnerRevisionServiceTest {

    @Mock
    private PartnerRevisionRepository repository;
    @Mock
    private PartnerRepository partnerRepository;
    @Mock
    private PartnerPriceDiscountRepository priceDiscountRepository;
    @Mock
    private PartnerShippingAddressRepository shippingAddressRepository;
    @Mock
    private PartnerContactRepository contactRepository;
    @Mock
    private com.samhanair.logis.partner.tab.service.Partner4TabService partner4TabService;
    @Mock
    private com.samhanair.logis.shared.realtime.broker.RealtimeBroker broker;

    @InjectMocks
    private PartnerRevisionService service;

    /**
     * id 가 @GeneratedValue 라 영속화 전엔 null 이므로, 단위 테스트에서는 reflection 으로 주입한다.
     */
    private static void injectId(Object entity, Class<?> declaring, UUID id) throws Exception {
        Field f = declaring.getDeclaredField("id");
        f.setAccessible(true);
        f.set(entity, id);
    }

    private Partner samplePartner(UUID partnerId) throws Exception {
        Partner partner = Partner.register("P-2026-0001", "123-45-67890", "삼한물산",
                "서울시 주소", "02-1234-5678", new BigDecimal("1000000"));
        injectId(partner, Partner.class, partnerId);
        return partner;
    }

    private PartnerPriceDiscount samplePriceDiscount(UUID partnerId) {
        return PartnerPriceDiscount.create(partnerId, new BigDecimal("5.00"), 30, "VIP 할인");
    }

    private PartnerShippingAddress sampleShippingAddress(UUID partnerId, String alias, boolean isDefault) {
        return PartnerShippingAddress.create(partnerId, alias, "06234", "서울 강남구",
                "02-0000-0000", "수령인", isDefault, "비고");
    }

    private PartnerContact sampleContact(UUID partnerId, boolean isPrimary) {
        return PartnerContact.create(partnerId, "홍길동", "팀장",
                "010-1111-2222", "hong@samhan.com", isPrimary, "비고");
    }

    @Test
    @DisplayName("assemble: 헤더 + 단가/할인(1:1) + 배송지 2건 + 담당자 1건 을 PartnerSnapshot 으로 정합 조립한다")
    void assembleCollectsHeaderAndThreeChildren() throws Exception {
        UUID partnerId = UUID.randomUUID();
        Partner partner = samplePartner(partnerId);

        when(partnerRepository.findById(partnerId)).thenReturn(Optional.of(partner));
        when(priceDiscountRepository.findByPartnerId(partnerId))
                .thenReturn(Optional.of(samplePriceDiscount(partnerId)));
        when(shippingAddressRepository.findAllByPartnerId(partnerId))
                .thenReturn(List.of(
                        sampleShippingAddress(partnerId, "본사창고", true),
                        sampleShippingAddress(partnerId, "강남센터", false)));
        when(contactRepository.findAllByPartnerId(partnerId))
                .thenReturn(List.of(sampleContact(partnerId, true)));

        PartnerSnapshot snapshot = service.assemble(partnerId);

        // 헤더 정합
        assertThat(snapshot.partnerCode()).isEqualTo("P-2026-0001");
        assertThat(snapshot.name()).isEqualTo("삼한물산");
        assertThat(snapshot.bizNo()).isEqualTo("123-45-67890");
        assertThat(snapshot.creditLimit()).isEqualByComparingTo("1000000");
        // 단가/할인 (1:1)
        assertThat(snapshot.priceDiscount()).isNotNull();
        assertThat(snapshot.priceDiscount().basicDiscountRate()).isEqualByComparingTo("5.00");
        assertThat(snapshot.priceDiscount().paymentTermDays()).isEqualTo(30);
        // 배송지 (1:N)
        assertThat(snapshot.shippingAddresses()).hasSize(2);
        assertThat(snapshot.shippingAddresses().get(0).alias()).isEqualTo("본사창고");
        assertThat(snapshot.shippingAddresses().get(0).isDefault()).isTrue();
        // 담당자 (1:N)
        assertThat(snapshot.contacts()).hasSize(1);
        assertThat(snapshot.contacts().get(0).contactName()).isEqualTo("홍길동");
        assertThat(snapshot.contacts().get(0).isPrimary()).isTrue();
    }

    @Test
    @DisplayName("assemble: 단가/할인 정책 미등록 시 priceDiscount 는 null, 자식 빈 리스트도 정합")
    void assembleNullPriceDiscountWhenAbsent() throws Exception {
        UUID partnerId = UUID.randomUUID();
        Partner partner = samplePartner(partnerId);

        when(partnerRepository.findById(partnerId)).thenReturn(Optional.of(partner));
        when(priceDiscountRepository.findByPartnerId(partnerId)).thenReturn(Optional.empty());
        when(shippingAddressRepository.findAllByPartnerId(partnerId)).thenReturn(List.of());
        when(contactRepository.findAllByPartnerId(partnerId)).thenReturn(List.of());

        PartnerSnapshot snapshot = service.assemble(partnerId);

        assertThat(snapshot.priceDiscount()).isNull();
        assertThat(snapshot.shippingAddresses()).isEmpty();
        assertThat(snapshot.contacts()).isEmpty();
        assertThat(snapshot.partnerCode()).isEqualTo("P-2026-0001");
    }

    @Test
    @DisplayName("assemble: 거래처 미존재 시 NOT_FOUND")
    void assembleThrowsNotFoundWhenPartnerAbsent() {
        UUID partnerId = UUID.randomUUID();
        when(partnerRepository.findById(partnerId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.assemble(partnerId))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.NOT_FOUND);
    }

    @Test
    @DisplayName("capture 2회 호출 시 revisionNo 가 1 → 2 로 채번되고 partnerCode/type 이 정합한다")
    void captureAssignsSequentialRevisionNos() throws Exception {
        UUID partnerId = UUID.randomUUID();
        Partner partner = samplePartner(partnerId);
        UUID actorId = UUID.randomUUID();
        PartnerSnapshot snapshot = new PartnerSnapshot(
                "P-2026-0001", "123-45-67890", "삼한물산", null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                null, List.of(), List.of());

        // 1회차: 기존 스냅샷 없음 (maxRevisionNo == null → next = 1)
        when(repository.maxRevisionNo(partnerId)).thenReturn(null);
        when(repository.saveAndFlush(any(PartnerRevision.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        PartnerRevision first = service.capture(partner, snapshot, PartnerRevisionType.CREATE, null,
                actorId, "홍길동", null);

        assertThat(first.getRevisionNo()).isEqualTo(1);
        assertThat(first.getRevisionType()).isEqualTo(PartnerRevisionType.CREATE);
        assertThat(first.getPartnerId()).isEqualTo(partnerId);
        assertThat(first.getPartnerCode()).isEqualTo("P-2026-0001");
        assertThat(first.getActorId()).isEqualTo(actorId);
        assertThat(first.getActorName()).isEqualTo("홍길동");
        assertThat(first.getSnapshot().name()).isEqualTo("삼한물산");

        // 2회차: 직전 revision 1 존재 (maxRevisionNo == 1 → next = 2)
        when(repository.maxRevisionNo(partnerId)).thenReturn(1);

        PartnerRevision second = service.capture(partner, snapshot, PartnerRevisionType.EDIT, null,
                actorId, "홍길동", null);

        assertThat(second.getRevisionNo()).isEqualTo(2);
        assertThat(second.getRevisionType()).isEqualTo(PartnerRevisionType.EDIT);
    }

    @Test
    @DisplayName("capture: saveAndFlush 1회차 DataIntegrityViolationException → 1회 재채번 재시도 후 "
            + "정상 반환 (saveAndFlush 2회 + maxRevisionNo 재조회 2회)")
    void captureRetriesOnceWhenFirstSaveConflicts() throws Exception {
        UUID partnerId = UUID.randomUUID();
        Partner partner = samplePartner(partnerId);
        PartnerSnapshot snapshot = new PartnerSnapshot(
                "P-2026-0001", "123-45-67890", "삼한물산", null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                null, List.of(), List.of());

        // maxRevisionNo: 1회차 채번 시 1(→next=2), 재시도 채번 시 갱신된 2(→next=3)
        when(repository.maxRevisionNo(partnerId)).thenReturn(1, 2);
        // saveAndFlush: 1회차 unique 위반, 2회차 정상 반환
        when(repository.saveAndFlush(any(PartnerRevision.class)))
                .thenThrow(new org.springframework.dao.DataIntegrityViolationException(
                        "partner_revisions unique 위반 (race)"))
                .thenAnswer(inv -> inv.getArgument(0));

        PartnerRevision result = service.capture(partner, snapshot, PartnerRevisionType.EDIT, null,
                UUID.randomUUID(), "홍길동", null);

        assertThat(result).isNotNull();
        assertThat(result.getRevisionNo()).isEqualTo(3);
        assertThat(result.getRevisionType()).isEqualTo(PartnerRevisionType.EDIT);
        verify(repository, times(2)).saveAndFlush(any(PartnerRevision.class));
        verify(repository, times(2)).maxRevisionNo(partnerId);
    }

    @Test
    @DisplayName("capture: saveAndFlush 가 2회 모두 DataIntegrityViolationException → "
            + "BusinessException(CONFLICT) 로 변환한다")
    void captureThrowsConflictWhenRetryAlsoConflicts() throws Exception {
        UUID partnerId = UUID.randomUUID();
        Partner partner = samplePartner(partnerId);
        PartnerSnapshot snapshot = new PartnerSnapshot(
                "P-2026-0001", "123-45-67890", "삼한물산", null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                null, List.of(), List.of());

        when(repository.maxRevisionNo(partnerId)).thenReturn(1, 2);
        when(repository.saveAndFlush(any(PartnerRevision.class)))
                .thenThrow(new org.springframework.dao.DataIntegrityViolationException(
                        "partner_revisions unique 위반 (race)"));

        assertThatThrownBy(() -> service.capture(partner, snapshot, PartnerRevisionType.EDIT, null,
                UUID.randomUUID(), "홍길동", null))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.CONFLICT);

        verify(repository, times(2)).saveAndFlush(any(PartnerRevision.class));
    }

    // ================================================================
    // 도메인 가드 — isEditable / requireEditable (권한 재편 Phase 2.3 Task 3)
    // ================================================================

    @Test
    @DisplayName("isEditable: ACTIVE/SUSPENDED 는 true, TERMINATED 는 false (requireEditable 도 동일 판정)")
    void isEditableByStatus() {
        Partner active = Partner.register("P-1", "1", "n", null, null, BigDecimal.ZERO);
        assertThat(active.isEditable()).isTrue();
        active.requireEditable(); // 통과

        active.suspend();
        assertThat(active.isEditable()).isTrue();
        active.requireEditable(); // SUSPENDED 도 편집 가능

        active.terminate();
        assertThat(active.isEditable()).isFalse();
        assertThatThrownBy(active::requireEditable)
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.CONFLICT)
                .hasMessageContaining("거래종료");
    }

    // ================================================================
    // restore — point-in-time 복원 (권한 재편 Phase 2.3 Task 3)
    // ================================================================

    private PartnerSnapshot restoreSnapshot() {
        // 헤더 40필드 (existing 채번 테스트의 null 패턴 미러) 중 name/status/representative/
        // businessType/industry/managerName 만 비-null 로 세팅, 나머지는 null + 4탭 자식 3종.
        return new PartnerSnapshot(
                "P-2026-0001", "123-45-67890", "삼한물산(복원본)", "옛주소", "02-0000-0000",
                null, null, com.samhanair.logis.partner.domain.PartnerStatus.ACTIVE,
                null, "대표자", "제조", "공조", null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, "담당김",
                new PartnerSnapshot.PriceDiscount(new BigDecimal("7.00"), 45, "복원할인"),
                List.of(new PartnerSnapshot.ShippingAddress("본사", "06234", "서울 강남",
                        "02-1111-2222", "수령인", true, "메모")),
                List.of(new PartnerSnapshot.Contact("홍길동", "팀장", "010-1111-2222",
                        "hong@samhan.com", true, "메모")));
    }

    @Test
    @DisplayName("restore: 복원 대상 revision 미존재 시 NOT_FOUND")
    void restoreThrowsNotFoundWhenTargetRevisionAbsent() {
        UUID partnerId = UUID.randomUUID();
        when(repository.findByPartnerIdAndRevisionNo(partnerId, 3)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.restore(partnerId, 3, UUID.randomUUID(), "김복원", null))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.NOT_FOUND);
    }

    @Test
    @DisplayName("restore: TERMINATED 거래처 → requireEditable 거부 → CONFLICT (자식 교체/캡처/SSE 미발생)")
    void restoreThrowsConflictWhenPartnerTerminated() throws Exception {
        UUID partnerId = UUID.randomUUID();
        Partner partner = samplePartner(partnerId);
        partner.terminate();

        PartnerRevision target = PartnerRevision.of(partnerId, 1, PartnerRevisionType.EDIT, null,
                "P-2026-0001", restoreSnapshot(), UUID.randomUUID(), "작성자", null);
        when(repository.findByPartnerIdAndRevisionNo(partnerId, 1)).thenReturn(Optional.of(target));
        when(partnerRepository.findById(partnerId)).thenReturn(Optional.of(partner));

        assertThatThrownBy(() -> service.restore(partnerId, 1, UUID.randomUUID(), "김복원", null))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.CONFLICT);

        verify(partner4TabService, never()).replaceChildrenFromFull(any(), any(), any(), any());
        verify(repository, never()).saveAndFlush(any());
        verify(broker, never()).publish(any(), any(), any());
    }

    @Test
    @DisplayName("restore: 정상 복원 — 헤더 역적용 + 자식 전량교체(replaceChildrenFromFull) "
            + "+ RESTORE revision 캡처(source=target) + partner:edit SSE 발행 + PartnerFullResponse 반환")
    void restoreAppliesSnapshotAndCapturesRestoreRevision() throws Exception {
        UUID partnerId = UUID.randomUUID();
        Partner partner = samplePartner(partnerId);
        UUID actorId = UUID.randomUUID();

        PartnerRevision target = PartnerRevision.of(partnerId, 1, PartnerRevisionType.EDIT, null,
                "P-2026-0001", restoreSnapshot(), UUID.randomUUID(), "작성자", null);
        when(repository.findByPartnerIdAndRevisionNo(partnerId, 1)).thenReturn(Optional.of(target));
        when(partnerRepository.findById(partnerId)).thenReturn(Optional.of(partner));

        // getFull 재조회 stub (flush 유발 + 응답)
        PartnerFullResponse fullResponse = new PartnerFullResponse(null, null, List.of(), List.of());
        when(partner4TabService.getFull("P-2026-0001")).thenReturn(fullResponse);

        // captureFor 내부 경로: loadPartnerOrThrow + assembleFrom + capture(maxRevisionNo+1)
        when(priceDiscountRepository.findByPartnerId(partnerId)).thenReturn(Optional.empty());
        when(shippingAddressRepository.findAllByPartnerId(partnerId)).thenReturn(List.of());
        when(contactRepository.findAllByPartnerId(partnerId)).thenReturn(List.of());
        when(repository.maxRevisionNo(partnerId)).thenReturn(1);
        when(repository.saveAndFlush(any(PartnerRevision.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        PartnerFullResponse result = service.restore(partnerId, 1, actorId, "김복원", "#3B82F6");

        // 반환값 = getFull 결과
        assertThat(result).isSameAs(fullResponse);

        // 헤더 역적용 검증 (스냅샷 name 으로 덮어쓰기)
        assertThat(partner.getName()).isEqualTo("삼한물산(복원본)");
        assertThat(partner.getManagerName()).isEqualTo("담당김");

        // 자식 전량교체 helper 1회 호출 (배송지/담당자 non-null 전달)
        verify(partner4TabService, times(1)).replaceChildrenFromFull(eq(partnerId), any(), any(), any());

        // RESTORE revision 캡처 (source=target=1, revisionNo=maxRevisionNo+1=2)
        org.mockito.ArgumentCaptor<PartnerRevision> captor =
                org.mockito.ArgumentCaptor.forClass(PartnerRevision.class);
        verify(repository).saveAndFlush(captor.capture());
        PartnerRevision saved = captor.getValue();
        assertThat(saved.getRevisionType()).isEqualTo(PartnerRevisionType.RESTORE);
        assertThat(saved.getSourceRevisionNo()).isEqualTo(1);
        assertThat(saved.getRevisionNo()).isEqualTo(2);
        assertThat(saved.getActorId()).isEqualTo(actorId);

        // SSE 발행 (partner:edit)
        verify(broker).publish(eq(partnerId), eq("partner:edit"), any());
    }
}

package com.samhanair.logis.partner.tab.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.domain.PartnerContact;
import com.samhanair.logis.partner.domain.PartnerPriceDiscount;
import com.samhanair.logis.partner.domain.PartnerShippingAddress;
import com.samhanair.logis.partner.repository.PartnerRepository;
import com.samhanair.logis.partner.tab.dto.PartnerContactRequest;
import com.samhanair.logis.partner.tab.dto.PartnerFullRequest;
import com.samhanair.logis.partner.tab.dto.PartnerFullResponse;
import com.samhanair.logis.partner.tab.dto.PartnerPriceDiscountRequest;
import com.samhanair.logis.partner.tab.dto.PartnerPriceDiscountResponse;
import com.samhanair.logis.partner.tab.dto.PartnerShippingAddressRequest;
import com.samhanair.logis.partner.tab.dto.PartnerShippingAddressResponse;
import com.samhanair.logis.partner.tab.repository.PartnerContactRepository;
import com.samhanair.logis.partner.tab.repository.PartnerPriceDiscountRepository;
import com.samhanair.logis.partner.tab.repository.PartnerShippingAddressRepository;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

/**
 * Partner4TabService 단위 테스트 — JPA / Spring 부팅 없음.
 *
 * <p>커버 시나리오:
 * <ol>
 *   <li>getFull — 4탭 데이터 일괄 조회 (단가/할인 정책 포함)</li>
 *   <li>getFull — 단가/할인 정책 미등록 시 empty 응답</li>
 *   <li>getFull — 존재하지 않는 partnerCode → NOT_FOUND</li>
 *   <li>registerFull — 정상 등록 (배송지/담당자 포함)</li>
 *   <li>registerFull — partnerCode 누락 시 INVALID_INPUT</li>
 *   <li>upsertPriceDiscountTab — 기존 정책 없을 때 신규 생성</li>
 *   <li>addShippingAddress — isDefault=true 시 기존 기본 배송지 clearDefault 호출</li>
 *   <li>deleteContact — 소속 거래처 불일치 시 NOT_FOUND</li>
 * </ol>
 *
 * <p>주의: {@link Partner#getId()} 는 DB 영속화(UuidGenerator) 전까지 null. 단위 테스트에서
 * id 가 필요한 경우 {@link #injectId(Partner, UUID)} reflection 헬퍼로 고정 UUID 주입.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class Partner4TabServiceTest {

    @Mock
    private PartnerRepository partnerRepository;
    @Mock
    private PartnerPriceDiscountRepository priceDiscountRepository;
    @Mock
    private PartnerShippingAddressRepository shippingAddressRepository;
    @Mock
    private PartnerContactRepository contactRepository;
    @Mock
    private com.samhanair.logis.partner.revision.service.PartnerRevisionService partnerRevisionService;

    @InjectMocks
    private Partner4TabService service;

    // ----------------------------------------------------------------
    // 1. getFull — 4탭 전체 조회 (단가/할인 정책 포함)
    // ----------------------------------------------------------------

    @Test
    void getFull_returns_full_response_with_price_discount() throws Exception {
        UUID partnerId = UUID.randomUUID();
        Partner partner = samplePartner("P-001", partnerId);

        PartnerPriceDiscount discount = PartnerPriceDiscount.create(
                partnerId, new BigDecimal("5.00"), 30, "VIP 할인");

        when(partnerRepository.findByPartnerCode("P-001")).thenReturn(Optional.of(partner));
        when(priceDiscountRepository.findByPartnerId(partnerId)).thenReturn(Optional.of(discount));
        when(shippingAddressRepository.findAllByPartnerId(partnerId)).thenReturn(List.of());
        when(contactRepository.findAllByPartnerId(partnerId)).thenReturn(List.of());

        PartnerFullResponse resp = service.getFull("P-001");

        assertThat(resp.basic().partnerCode()).isEqualTo("P-001");
        assertThat(resp.priceDiscount().basicDiscountRate()).isEqualByComparingTo("5.00");
        assertThat(resp.priceDiscount().paymentTermDays()).isEqualTo(30);
        assertThat(resp.shippingAddresses()).isEmpty();
        assertThat(resp.contacts()).isEmpty();
    }

    // ----------------------------------------------------------------
    // 2. getFull — 단가/할인 정책 미등록 시 empty 응답
    // ----------------------------------------------------------------

    @Test
    void getFull_returns_empty_price_discount_when_not_registered() throws Exception {
        UUID partnerId = UUID.randomUUID();
        Partner partner = samplePartner("P-002", partnerId);

        when(partnerRepository.findByPartnerCode("P-002")).thenReturn(Optional.of(partner));
        when(priceDiscountRepository.findByPartnerId(partnerId)).thenReturn(Optional.empty());
        when(shippingAddressRepository.findAllByPartnerId(partnerId)).thenReturn(List.of());
        when(contactRepository.findAllByPartnerId(partnerId)).thenReturn(List.of());

        PartnerFullResponse resp = service.getFull("P-002");

        assertThat(resp.priceDiscount().basicDiscountRate()).isEqualByComparingTo("0");
        assertThat(resp.priceDiscount().paymentTermDays()).isNull();
    }

    // ----------------------------------------------------------------
    // 3. getFull — 존재하지 않는 partnerCode → NOT_FOUND
    // ----------------------------------------------------------------

    @Test
    void getFull_throws_not_found_for_unknown_partner_code() {
        when(partnerRepository.findByPartnerCode("UNKNOWN")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getFull("UNKNOWN"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("UNKNOWN");
    }

    // ----------------------------------------------------------------
    // 4. registerFull — 정상 등록 (배송지/담당자 포함)
    // ----------------------------------------------------------------

    @Test
    void registerFull_saves_partner_with_shipping_and_contact() throws Exception {
        UUID partnerId = UUID.randomUUID();
        Partner savedPartner = samplePartner("P-003", partnerId);

        when(partnerRepository.findByPartnerCode("P-003")).thenReturn(Optional.empty());
        when(partnerRepository.findByBizNo("111-22-33333")).thenReturn(Optional.empty());
        when(partnerRepository.save(any(Partner.class))).thenReturn(savedPartner);
        when(priceDiscountRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(shippingAddressRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(contactRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(priceDiscountRepository.findByPartnerId(any())).thenReturn(Optional.empty());
        when(shippingAddressRepository.findAllByPartnerId(any())).thenReturn(List.of());
        when(contactRepository.findAllByPartnerId(any())).thenReturn(List.of());

        PartnerFullRequest req = new PartnerFullRequest(
                "P-003", "111-22-33333", "(주)테스트",
                new PartnerPriceDiscountRequest(new BigDecimal("3.00"), 45, null),
                List.of(new PartnerShippingAddressRequest(
                        "본사", "12345", "서울 강남구", "02-0000-0000", "홍길동", true, null)),
                List.of(new PartnerContactRequest(
                        "김담당", "팀장", "010-1234-5678", null, true, null))
        );

        PartnerFullResponse resp = service.registerFull(req);

        assertThat(resp.basic().partnerCode()).isEqualTo("P-003");
        verify(priceDiscountRepository).save(any(PartnerPriceDiscount.class));
        verify(shippingAddressRepository).save(any(PartnerShippingAddress.class));
        verify(contactRepository).save(any(PartnerContact.class));
    }

    // ----------------------------------------------------------------
    // 5. registerFull — partnerCode 누락 시 INVALID_INPUT
    // ----------------------------------------------------------------

    @Test
    void registerFull_throws_invalid_input_when_partner_code_blank() {
        PartnerFullRequest req = new PartnerFullRequest(
                "", "111-22-33334", "(주)테스트", null, null, null);

        assertThatThrownBy(() -> service.registerFull(req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("partnerCode");
    }

    // ----------------------------------------------------------------
    // 6. upsertPriceDiscountTab — 기존 정책 없을 때 신규 생성
    // ----------------------------------------------------------------

    @Test
    void upsertPriceDiscountTab_creates_new_when_not_exists() throws Exception {
        UUID partnerId = UUID.randomUUID();
        Partner partner = samplePartner("P-004", partnerId);

        when(partnerRepository.findByPartnerCode("P-004")).thenReturn(Optional.of(partner));
        when(priceDiscountRepository.findByPartnerId(partnerId)).thenReturn(Optional.empty());
        when(priceDiscountRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PartnerPriceDiscountRequest req = new PartnerPriceDiscountRequest(
                new BigDecimal("10.00"), 60, "신규 고객 할인");

        PartnerPriceDiscountResponse resp = service.upsertPriceDiscountTab("P-004", req);

        assertThat(resp.basicDiscountRate()).isEqualByComparingTo("10.00");
        assertThat(resp.paymentTermDays()).isEqualTo(60);
        verify(priceDiscountRepository).save(any(PartnerPriceDiscount.class));
    }

    // ----------------------------------------------------------------
    // 7. addShippingAddress — isDefault=true 시 clearDefault 호출
    // ----------------------------------------------------------------

    @Test
    void addShippingAddress_clears_existing_default_when_new_is_default() throws Exception {
        UUID partnerId = UUID.randomUUID();
        Partner partner = samplePartner("P-005", partnerId);

        when(partnerRepository.findByPartnerCode("P-005")).thenReturn(Optional.of(partner));
        when(shippingAddressRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PartnerShippingAddressRequest req = new PartnerShippingAddressRequest(
                "물류센터", "06234", "서울 강남구 테헤란로 1", "02-1111-2222", "이수신", true, null);

        PartnerShippingAddressResponse resp = service.addShippingAddress("P-005", req);

        assertThat(resp.isDefault()).isTrue();
        verify(shippingAddressRepository).clearDefaultByPartnerId(partnerId);
    }

    // ----------------------------------------------------------------
    // 8. deleteContact — 소속 거래처 불일치 시 NOT_FOUND
    // ----------------------------------------------------------------

    @Test
    void deleteContact_throws_not_found_when_contact_belongs_to_different_partner() throws Exception {
        UUID partnerId = UUID.randomUUID();
        Partner partner = samplePartner("P-006", partnerId);
        UUID contactId = UUID.randomUUID();
        UUID otherPartnerId = UUID.randomUUID();

        // 담당자가 다른 거래처 소속
        PartnerContact contact = PartnerContact.create(
                otherPartnerId, "홍길동", "이사", null, null, false, null);

        when(partnerRepository.findByPartnerCode("P-006")).thenReturn(Optional.of(partner));
        when(contactRepository.findById(contactId)).thenReturn(Optional.of(contact));

        assertThatThrownBy(() -> service.deleteContact("P-006", contactId, "user-master"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining(contactId.toString());
    }

    // ----------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------

    /**
     * 단위 테스트용 Partner 생성 — DB 영속화 없이 고정 UUID 주입.
     * UuidGenerator 는 EntityManager persist 시점에 동작하므로 reflection 으로 id 필드를 직접 설정.
     */
    private Partner samplePartner(String partnerCode, UUID id) throws Exception {
        Partner partner = Partner.register(partnerCode, "123-45-67890", "(주)테스트",
                "서울 강남구", "02-0000-0000", new BigDecimal("5000000"));
        injectId(partner, id);
        return partner;
    }

    private void injectId(Partner partner, UUID id) throws Exception {
        Field field = Partner.class.getDeclaredField("id");
        field.setAccessible(true);
        field.set(partner, id);
    }
}

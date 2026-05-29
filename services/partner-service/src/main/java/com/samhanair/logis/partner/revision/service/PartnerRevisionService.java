package com.samhanair.logis.partner.revision.service;

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
import com.samhanair.logis.partner.tab.dto.PartnerContactRequest;
import com.samhanair.logis.partner.tab.dto.PartnerFullResponse;
import com.samhanair.logis.partner.tab.dto.PartnerPriceDiscountRequest;
import com.samhanair.logis.partner.tab.dto.PartnerShippingAddressRequest;
import com.samhanair.logis.partner.tab.repository.PartnerContactRepository;
import com.samhanair.logis.partner.tab.repository.PartnerPriceDiscountRepository;
import com.samhanair.logis.partner.tab.repository.PartnerShippingAddressRepository;
import com.samhanair.logis.partner.tab.service.Partner4TabService;
import com.samhanair.logis.shared.realtime.audit.AuditEventPayloadBuilder;
import com.samhanair.logis.shared.realtime.audit.ChangeEntry;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 거래처 버전이력 스냅샷 조립/캡처/조회 서비스 (권한 재편 Phase 2.3 Task 2).
 *
 * <p>거래처 mutation 커밋 직후 현 상태를 {@link PartnerRevision} 1건으로 기록한다. revisionNo 는
 * partner 별 단조 증가 — {@code maxRevisionNo + 1} 로 채번한다 (첫 캡처는 1).
 *
 * <p>estimate 와의 구조 차이: 거래처 4탭 자식 (단가/할인 1:1, 배송지 1:N, 담당자 1:N) 은 entity 의
 * {@code @OneToMany} 가 아니라 각 자식 repository 로 partnerId join 수집된다. 따라서 스냅샷 조립
 * ({@link #assemble(UUID)}) 이 본 service 책임이다. estimate 는 {@code Estimate#toSnapshot()} 도메인이
 * 책임지는 점만 다르고 capture 채번/race 가드는 동형이다.
 *
 * <p>{@link com.samhanair.logis.partner.service.PartnerService} 및
 * {@link com.samhanair.logis.partner.tab.service.Partner4TabService} 의 content-mutation 훅에서
 * 같은 트랜잭션 내 return 직전에 {@link #captureFor}를 호출한다 (스냅샷 일관성 — 자식 교체가 flush 된 뒤
 * 동일 TX 의 repository 조회가 갱신본을 읽는다).
 *
 * <p>{@code com.samhanair.logis.slip.estimate.revision.service.EstimateRevisionService} 미러
 * (estimateId→partnerId, estimateNo→partnerCode, 4탭 자식 join 보강).
 */
@Service
@Transactional
@RequiredArgsConstructor
public class PartnerRevisionService {

    /** SSE event name — 거래처 entity 본문 수정/복원 (partner realtime 재사용, PartnerAuditLogService 와 동일). */
    public static final String EVENT_PARTNER_EDIT = "partner:edit";

    private final PartnerRevisionRepository repository;
    private final PartnerRepository partnerRepository;
    private final PartnerPriceDiscountRepository priceDiscountRepository;
    private final PartnerShippingAddressRepository shippingAddressRepository;
    private final PartnerContactRepository contactRepository;

    /**
     * 4탭 자식 전량교체 helper 재사용 ({@link Partner4TabService#replaceChildrenFromFull}). 복원 시
     * 단가/할인 UPSERT + 배송지/담당자 soft-delete 후 재등록 로직을 4탭 수정과 공유한다.
     *
     * <p>{@code @Lazy} — {@link Partner4TabService}가 본 service 를 의존하고 본 service 도
     * {@link Partner4TabService}를 의존하는 순환 의존을 끊기 위해 지연 주입한다.
     */
    private final @Lazy Partner4TabService partner4TabService;

    /** 실시간 협업 SSE 브로커 (PR-H4a). 복원 완료 후 구독자에게 partner:edit 이벤트를 발행한다. */
    private final RealtimeBroker broker;

    /**
     * 거래처 헤더 41필드 + 4탭 자식(단가/할인 1:1, 배송지 1:N, 담당자 1:N)을 한 시점의
     * {@link PartnerSnapshot} 으로 조립한다.
     *
     * <p>각 자식 repository 의 조회 결과는 entity 의 {@code @SQLRestriction("is_deleted = false")} 가
     * 자동 적용되므로 미삭제분만 수집된다. 단가/할인 정책은 거래처당 1행 (1:1) 이며 미등록 시 null 로
     * 스냅샷에 보관한다 (PartnerSnapshot 의 {@code @JsonInclude(NON_NULL)} 와 일관).
     *
     * @param partnerId 대상 거래처 UUID (필수)
     * @return 헤더 + 3자식이 채워진 PartnerSnapshot
     * @throws BusinessException(NOT_FOUND) 거래처 미존재
     */
    @Transactional(readOnly = true)
    public PartnerSnapshot assemble(UUID partnerId) {
        Partner partner = loadPartnerOrThrow(partnerId);
        return assembleFrom(partner);
    }

    /**
     * 영속 상태 {@link Partner} 와 그 4탭 자식을 모아 {@link PartnerSnapshot} 으로 조립한다.
     *
     * <p>{@link #assemble(UUID)} 와 {@link #captureFor}가 공유하는 내부 조립 단위. partner 는 이미
     * 조회된 영속 entity 를 받아 중복 조회를 피한다 (id 로 4탭 자식만 추가 join).
     */
    private PartnerSnapshot assembleFrom(Partner partner) {
        UUID partnerId = partner.getId();

        // 탭2 단가/할인 정책 (1:1, 미등록 시 null)
        PartnerSnapshot.PriceDiscount priceDiscount = priceDiscountRepository.findByPartnerId(partnerId)
                .map(this::toSnapshotPriceDiscount)
                .orElse(null);

        // 탭3 배송지 (1:N)
        List<PartnerSnapshot.ShippingAddress> shippingAddresses = shippingAddressRepository
                .findAllByPartnerId(partnerId)
                .stream()
                .map(this::toSnapshotShippingAddress)
                .toList();

        // 탭4 담당자 (1:N)
        List<PartnerSnapshot.Contact> contacts = contactRepository
                .findAllByPartnerId(partnerId)
                .stream()
                .map(this::toSnapshotContact)
                .toList();

        return new PartnerSnapshot(
                partner.getPartnerCode(),
                partner.getBizNo(),
                partner.getName(),
                partner.getAddress(),
                partner.getPhone(),
                partner.getCreditLimit(),
                partner.getOutstandingBalance(),
                partner.getStatus(),
                partner.getSubBizNo(),
                partner.getRepresentative(),
                partner.getBusinessType(),
                partner.getIndustry(),
                partner.getFax(),
                partner.getEmail(),
                partner.getEmail2(),
                partner.getMobile(),
                partner.getZipCode1(),
                partner.getAddress1(),
                partner.getZipCode2(),
                partner.getAddress2(),
                partner.getSearchKeyword(),
                partner.getPartnerGroup1(),
                partner.getPartnerGroup2(),
                partner.getWebsite(),
                partner.getCurrency(),
                partner.getShipmentTarget(),
                partner.getSalesType(),
                partner.getPurchaseType(),
                partner.getReceivableNoMgmt(),
                partner.getPayableNoMgmt(),
                partner.getOutboundAdjustmentRate(),
                partner.getInboundAdjustmentRate(),
                partner.getSalesPriceGroup(),
                partner.getPurchasePriceGroup(),
                partner.getCreditPeriodDays(),
                partner.getPaymentDueDays(),
                partner.getRegistrationDate(),
                partner.getTransferInfo(),
                partner.getNote(),
                partner.getManagerName(),
                priceDiscount,
                shippingAddresses,
                contacts);
    }

    /**
     * 거래처 현 상태를 조립({@link #assembleFrom})한 뒤 버전 스냅샷 1건으로 캡처한다 (편의 래퍼).
     *
     * <p>content-mutation 훅이 호출하는 진입점. 같은 트랜잭션 내에서 거래처 + 4탭 자식의 갱신본을
     * 조립하므로, 호출 측은 mutation 성공 직후 partner.getId() 로 본 메서드만 호출하면 된다.
     *
     * @param partnerId 캡처 대상 거래처 UUID (필수)
     * @param type 캡처 유형 CREATE/EDIT/RESTORE
     * @param sourceRevisionNo RESTORE 시 복원 출처 revision (그 외 null)
     * @param actorId 변경 주체 UUID (감사용, 화면 노출 금지)
     * @param actorName 변경 주체 표시명 (UUID 비공개 가드, 없으면 null)
     * @param actorColor FE userIdToColor 결과 backup (선택, 없으면 null)
     * @return 영속화된 PartnerRevision
     * @throws BusinessException(NOT_FOUND) 거래처 미존재
     * @throws BusinessException(CONFLICT) 채번 race 2회 실패
     */
    public PartnerRevision captureFor(UUID partnerId, PartnerRevisionType type,
                                      Integer sourceRevisionNo, UUID actorId, String actorName,
                                      String actorColor) {
        Partner partner = loadPartnerOrThrow(partnerId);
        PartnerSnapshot snapshot = assembleFrom(partner);
        return capture(partner, snapshot, type, sourceRevisionNo, actorId, actorName, actorColor);
    }

    /**
     * 미리 조립된 스냅샷을 버전 1건으로 캡처해 영속화한다.
     *
     * <p>revisionNo 는 {@code repository.maxRevisionNo(partnerId) + 1} 로 채번한다. 기존 스냅샷이
     * 없으면 {@code maxRevisionNo} 가 null 이므로 첫 버전은 1 이 된다.
     *
     * <p>채번 race 가드 ({@code EstimateRevisionService} 동형): maxRevisionNo+1 read-then-insert 가
     * 동시 mutation 시 (partner_id, revision_no) unique 를 위반하면 DataIntegrityViolationException 이
     * 발생한다. 이를 그대로 흘리면 500 이 되므로, 1회 재채번 재시도 후에도 충돌하면 409 CONFLICT 로
     * 변환한다 (사용자 재시도 안내). 스냅샷은 불변이라 재시도 간 그대로 재사용한다.
     *
     * @param partner 캡처 대상 거래처 (영속 상태, id 필수)
     * @param snapshot 미리 조립된 거래처 full-snapshot (호출자가 1회만 만들어 재시도 간 재사용)
     * @param type 캡처 유형 CREATE/EDIT/RESTORE
     * @param sourceRevisionNo RESTORE 시 복원 출처 revision (그 외 null)
     * @param actorId 변경 주체 UUID (감사용, 화면 노출 금지)
     * @param actorName 변경 주체 표시명 (UUID 비공개 가드, 없으면 null)
     * @param actorColor FE userIdToColor 결과 backup (선택, 없으면 null)
     * @return 영속화된 PartnerRevision
     * @throws BusinessException(CONFLICT) 채번 race 2회 실패
     */
    public PartnerRevision capture(Partner partner, PartnerSnapshot snapshot,
                                   PartnerRevisionType type, Integer sourceRevisionNo,
                                   UUID actorId, String actorName, String actorColor) {
        try {
            return saveWithNextRevisionNo(partner, snapshot, type, sourceRevisionNo,
                    actorId, actorName, actorColor);
        } catch (org.springframework.dao.DataIntegrityViolationException firstConflict) {
            try {
                // 1회 재채번 — 직전 insert 가 채간 revision_no 다음 번호로 재시도
                return saveWithNextRevisionNo(partner, snapshot, type, sourceRevisionNo,
                        actorId, actorName, actorColor);
            } catch (org.springframework.dao.DataIntegrityViolationException retryConflict) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "동시 수정 충돌 — 잠시 후 다시 시도해 주세요");
            }
        }
    }

    /**
     * 현 시점 {@code maxRevisionNo+1} 로 채번해 PartnerRevision 1건을 저장한다 (capture 의 채번 단위).
     *
     * <p>분리 목적: 채번 read 와 insert 가 한 호출에 묶여 있어야 재시도 시 갱신된 maxRevisionNo 로
     * 다시 채번된다. 스냅샷은 호출자가 1회만 만들어 재시도 간 재사용한다 (불변 — 재계산 불필요).
     */
    private PartnerRevision saveWithNextRevisionNo(Partner partner, PartnerSnapshot snapshot,
                                                   PartnerRevisionType type, Integer sourceRevisionNo,
                                                   UUID actorId, String actorName, String actorColor) {
        Integer max = repository.maxRevisionNo(partner.getId());
        int next = (max == null ? 0 : max) + 1;
        PartnerRevision revision = PartnerRevision.of(
                partner.getId(), next, type, sourceRevisionNo,
                partner.getPartnerCode(), snapshot, actorId, actorName, actorColor);
        // saveAndFlush — unique 제약 위반을 commit 이 아닌 이 시점에 동기 노출시켜 catch/재시도 가능하게 한다.
        return repository.saveAndFlush(revision);
    }

    /**
     * 거래처의 버전 타임라인을 최신(revisionNo 내림차순) 우선으로 조회한다.
     *
     * @param partnerId 대상 거래처 UUID
     * @return revisionNo 내림차순 정렬된 버전 목록 (없으면 빈 리스트)
     */
    @Transactional(readOnly = true)
    public List<PartnerRevision> list(UUID partnerId) {
        return repository.findByPartnerIdOrderByRevisionNoDesc(partnerId);
    }

    /**
     * 거래처를 특정 revision 시점 스냅샷으로 복원한다 (권한 재편 Phase 2.3 Task 3).
     *
     * <p>처리 순서 ({@code EstimateRevisionService#restore} 미러 + 거래처 4탭 자식 보강):
     * <ol>
     *   <li>복원 대상 revision 스냅샷 로드 — 없으면 {@link ErrorCode#NOT_FOUND}</li>
     *   <li>거래처 로드 — 없으면 {@link ErrorCode#NOT_FOUND}</li>
     *   <li>{@link Partner#requireEditable()} — TERMINATED 거래처면 {@link ErrorCode#CONFLICT} 거부</li>
     *   <li>헤더 역적용 — Partner 도메인 update 메서드로 스냅샷 헤더를 통째 덮어쓴다
     *       (creditLimit/outstandingBalance 는 신용 도메인 누적과 일관 보존 대상이라 제외,
     *       partnerCode/bizNo 는 불변 식별자라 제외)</li>
     *   <li>자식 전량교체 — 스냅샷의 단가/할인·배송지·담당자를 Request DTO 로 변환해
     *       {@link Partner4TabService#replaceChildrenFromFull}로 위임 (배송지/담당자는 스냅샷이
     *       비어 있어도 non-null 빈 리스트로 전달해 현재 자식을 전량 비운다 — point-in-time 정합)</li>
     *   <li>복원 결과를 신규 {@link PartnerRevisionType#RESTORE} revision 1건으로 캡처 —
     *       {@code sourceRevisionNo = targetRevisionNo} 로 복원 출처 기록</li>
     *   <li>SSE {@code partner:edit} 이벤트 발행 (partner realtime 재사용)</li>
     * </ol>
     *
     * <p>{@link #captureFor}가 채번하는 신규 revisionNo 는 항상 {@code maxRevisionNo+1} 이므로 복원 후
     * 타임라인의 최신 항목이 된다 (복원 이력도 되돌릴 수 있는 정방향 누적).
     *
     * @param partnerId 복원 대상 거래처 UUID (필수)
     * @param targetRevisionNo 복원할 시점의 revisionNo
     * @param actorId 복원 주체 UUID (감사용, 화면 노출 금지)
     * @param actorName 복원 주체 표시명 (UUID 비공개 가드, 없으면 null)
     * @param actorColor FE userIdToColor 결과 backup (선택, 없으면 null)
     * @return 복원된 거래처의 4탭 전체 응답
     * @throws BusinessException(NOT_FOUND) 복원 대상 revision 또는 거래처 미존재
     * @throws BusinessException(CONFLICT) TERMINATED 거래처 (편집 불가 도메인 가드)
     */
    public PartnerFullResponse restore(UUID partnerId, int targetRevisionNo,
                                       UUID actorId, String actorName, String actorColor) {
        PartnerRevision target = repository
                .findByPartnerIdAndRevisionNo(partnerId, targetRevisionNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "복원 대상 revision 없음 (partnerId=" + partnerId
                                + ", revisionNo=" + targetRevisionNo + ")"));

        Partner partner = loadPartnerOrThrow(partnerId);
        // 거래종료(TERMINATED) 거래처는 복원 불가 — 스냅샷 역적용 전에 사전 차단
        partner.requireEditable();

        PartnerSnapshot s = target.getSnapshot();
        applyHeaderSnapshot(partner, s);
        applyChildrenSnapshot(partnerId, s);

        // 복원 결과를 RESTORE revision 으로 캡처. captureFor 가 자식 교체 flush 후 갱신본을 조립하도록,
        // 그에 앞서 getFull 재조회로 영속성 컨텍스트 flush 를 유발하고 응답을 구성한다.
        PartnerFullResponse response = partner4TabService.getFull(partner.getPartnerCode());
        PartnerRevision restored = captureFor(partnerId, PartnerRevisionType.RESTORE,
                targetRevisionNo, actorId, actorName, actorColor);

        // SSE — 복원도 거래처 본문 변경이므로 partner:edit 이벤트 재사용 (구독 협업자 화면 갱신)
        broker.publish(partnerId, EVENT_PARTNER_EDIT,
                AuditEventPayloadBuilder.build(restored.getRevisionNo(), actorId, actorName,
                        actorColor, List.of(new ChangeEntry("restore", null,
                                "rev" + targetRevisionNo))));
        return response;
    }

    /**
     * 스냅샷 헤더 41필드를 Partner 도메인 update 메서드로 역적용한다 (복원 헤더 단계).
     *
     * <p>제외 필드: creditLimit/outstandingBalance (신용 도메인 {@code PartnerCreditHistory} 누적과
     * 일관 보존 — 복원으로 되돌리지 않음), partnerCode/bizNo (불변 식별자).
     */
    private void applyHeaderSnapshot(Partner partner, PartnerSnapshot s) {
        partner.updateProfile(s.name(), s.address(), s.phone());
        partner.updateBusinessProfile(s.representative(), s.businessType(),
                s.industry(), s.subBizNo());
        partner.updateContactChannels(s.fax(), s.email(), s.email2(), s.mobile());
        partner.updateAddresses(s.zipCode1(), s.address1(), s.zipCode2(), s.address2());
        partner.updateSearchKeyword(s.searchKeyword());
        partner.updateClassification(s.partnerGroup1(), s.partnerGroup2(), s.website());
        partner.updateCreditPolicy(s.salesType(), s.purchaseType(),
                s.receivableNoMgmt(), s.payableNoMgmt(),
                s.salesPriceGroup(), s.purchasePriceGroup(),
                s.outboundAdjustmentRate(), s.inboundAdjustmentRate(),
                s.creditPeriodDays(), s.paymentDueDays());
        // currency 가 null 이면 changeCurrency 가 KRW 로 강제 채움 → null 스냅샷은 호출 스킵 (정합 보존)
        if (s.currency() != null) {
            partner.changeCurrency(s.currency());
        }
        if (s.shipmentTarget() != null) {
            partner.changeShipmentTarget(s.shipmentTarget());
        }
        partner.changeRegistrationDate(s.registrationDate());
        partner.updateTransferInfo(s.transferInfo());
        partner.updateNote(s.note());
        partner.updateManagerName(s.managerName());
        if (s.status() != null) {
            partner.changeStatus(s.status());
        }
    }

    /**
     * 스냅샷의 4탭 자식을 Request DTO 로 변환해 {@link Partner4TabService#replaceChildrenFromFull}로
     * 전량교체한다 (복원 자식 단계).
     *
     * <p>배송지/담당자는 스냅샷이 비어 있어도 non-null 빈 리스트로 전달해 현재 자식을 전량 비운다
     * (point-in-time 정합 — 복원 시점에 자식이 없었으면 현재도 없어야 함). 단가/할인 정책은 스냅샷에
     * 없으면 null 전달(미변경) — 1:1 정책 특성상 정책 행 부재는 "미설정" 의미를 보존한다.
     */
    private void applyChildrenSnapshot(UUID partnerId, PartnerSnapshot s) {
        PartnerPriceDiscountRequest priceDiscount = s.priceDiscount() == null ? null
                : new PartnerPriceDiscountRequest(
                        s.priceDiscount().basicDiscountRate(),
                        s.priceDiscount().paymentTermDays(),
                        s.priceDiscount().discountMemo());

        List<PartnerShippingAddressRequest> addresses =
                (s.shippingAddresses() == null ? List.<PartnerSnapshot.ShippingAddress>of()
                        : s.shippingAddresses())
                        .stream()
                        .map(a -> new PartnerShippingAddressRequest(
                                a.alias(), a.zipCode(), a.address(), a.phone(),
                                a.receiverName(), a.isDefault(), a.memo()))
                        .toList();

        List<PartnerContactRequest> contacts =
                (s.contacts() == null ? List.<PartnerSnapshot.Contact>of() : s.contacts())
                        .stream()
                        .map(c -> new PartnerContactRequest(
                                c.contactName(), c.position(), c.phone(),
                                c.email(), c.isPrimary(), c.memo()))
                        .toList();

        partner4TabService.replaceChildrenFromFull(partnerId, priceDiscount, addresses, contacts);
    }

    private Partner loadPartnerOrThrow(UUID partnerId) {
        return partnerRepository.findById(partnerId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "거래처를 찾을 수 없습니다: " + partnerId));
    }

    private PartnerSnapshot.PriceDiscount toSnapshotPriceDiscount(PartnerPriceDiscount entity) {
        return new PartnerSnapshot.PriceDiscount(
                entity.getBasicDiscountRate(),
                entity.getPaymentTermDays(),
                entity.getDiscountMemo());
    }

    private PartnerSnapshot.ShippingAddress toSnapshotShippingAddress(PartnerShippingAddress entity) {
        return new PartnerSnapshot.ShippingAddress(
                entity.getAlias(),
                entity.getZipCode(),
                entity.getAddress(),
                entity.getPhone(),
                entity.getReceiverName(),
                entity.getIsDefault(),
                entity.getMemo());
    }

    private PartnerSnapshot.Contact toSnapshotContact(PartnerContact entity) {
        return new PartnerSnapshot.Contact(
                entity.getContactName(),
                entity.getPosition(),
                entity.getPhone(),
                entity.getEmail(),
                entity.getIsPrimary(),
                entity.getMemo());
    }
}

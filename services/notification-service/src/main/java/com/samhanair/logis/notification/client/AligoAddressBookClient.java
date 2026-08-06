package com.samhanair.logis.notification.client;

import com.samhanair.logis.notification.dto.AligoAddressBookDeliveryStatus;
import java.util.List;

/**
 * Phase 10 PR-F1 BE-1 — 알리고 주소록 (Address Book) API client (계약 정의).
 *
 * <p><b>Samhan Public 이식 — legacy GAS 9번 "알리고 자동 업로드" 의 native 자동화.</b>
 * Legacy 흐름은 거래처마스터 → CSV 수동 다운로드 → 알리고 콘솔 수동 업로드 였으나, 본 client 는
 * 알리고 주소록 API 를 직접 호출하여 우리 자체 partner-service → 알리고 주소록을 1단계 자동
 * 동기화한다.
 *
 * <h2>구현 상태 — STUB / TODO</h2>
 * <p>본 PR 시점에는 알리고 주소록 API 의 실 spec (endpoint / 인증 / payload schema / rate limit)
 * 이 사용자에게 제공되지 않았다. 따라서 본 인터페이스의 production 구현체
 * {@link MockAligoAddressBookClient} 는 dryRun-only — 실제 외부 호출은 수행하지 않으며 호출만
 * 기록한다 (응답은 외부 미전달 상태와 added=0으로 반환). PR-F2 시점에 사용자가 알리고 spec 을
 * 확정한 후 RestClient 기반 실 구현체로 교체 예정이며, 본 인터페이스 자체는 변경하지 않는다
 * (계약 안정성 보장).
 *
 * <h2>chunk / 429 backoff 정책</h2>
 * <ul>
 *   <li>호출 측 ({@code AligoAddressBookSyncService}) 가 chunk 50 으로 contact 분할 후 본 client
 *       호출 — 본 client 자체는 단일 chunk 단위 호출 (chunk 분할 책임 X).</li>
 *   <li>response 의 {@link UploadResult#httpStatus()} 가 429 면 호출 측이 exponential backoff 후 재시도.</li>
 * </ul>
 */
public interface AligoAddressBookClient {

    /**
     * 알리고 주소록에 contact chunk 1건 업로드.
     *
     * <p>호출 측은 chunk 50 단위로 contact 를 분할하여 본 메서드를 N회 호출. 본 메서드는 단일 chunk
     * 의 동기 업로드만 책임 — 외부 API 가 멱등하지 않을 수 있으므로 호출 측에서 syncId 등의 dedup
     * 키를 별도 관리해야 한다 (BE-2 후속 슬라이스 책임).
     *
     * @param contacts 업로드 대상 contact (chunk 50 이하 권장, 본 메서드 자체는 검증 X)
     * @return 업로드 결과 ({@link UploadResult#added}/{@link UploadResult#updated}/
     *         {@link UploadResult#skipped}/{@link UploadResult#httpStatus} 등)
     */
    UploadResult uploadChunk(List<AligoContact> contacts);

    /**
     * 알리고 주소록 contact (그룹명 + 이름 + 휴대폰 + 비고).
     *
     * <p>{@code group} = 알리고 SF벤더 그룹명 (예: VIP거래처 / 일반거래처).
     * {@code phone} = 정규화된 11자리 휴대폰 (예: 01012345678).
     * {@code memo} = 운영자 추적용 placeholder (예: "[P-2026-0001]").
     */
    record AligoContact(String group, String name, String phone, String memo) {}

    /**
     * chunk 1건 업로드 결과.
     *
     * <ul>
     *   <li>{@code added} — 신규 추가된 contact 수</li>
     *   <li>{@code updated} — 기존 contact 갱신 수 (실 spec 미정 — 현 stub 은 0)</li>
     *   <li>{@code skipped} — 알리고 측에서 중복 / 잘못된 형식 등으로 skip 된 수</li>
     *   <li>{@code httpStatus} — 알리고 응답 HTTP status (429 → 호출 측 backoff trigger)</li>
     *   <li>{@code rawBody} — debugging 용 응답 body (truncated, sensitive data 제거 후)</li>
     * </ul>
     */
    record UploadResult(int added, int updated, int skipped, int httpStatus, String rawBody,
                        AligoAddressBookDeliveryStatus deliveryStatus) {

        /** 기존 5개 필드 생성 호출과의 소스 호환 — 2xx 결과는 외부 전달 완료로 해석한다. */
        public UploadResult(int added, int updated, int skipped, int httpStatus, String rawBody) {
            this(added, updated, skipped, httpStatus, rawBody,
                    httpStatus >= 200 && httpStatus < 300
                            ? AligoAddressBookDeliveryStatus.DELIVERED
                            : AligoAddressBookDeliveryStatus.NOT_DELIVERED);
        }

        public static UploadResult success(int added) {
            return new UploadResult(added, 0, 0, 200, null,
                    AligoAddressBookDeliveryStatus.DELIVERED);
        }

        /** 외부 호출 없이 처리한 mock/dry-run 결과 — 어떤 건수도 성공으로 계수하지 않는다. */
        public static UploadResult notDelivered() {
            return new UploadResult(0, 0, 0, 200, "dry-run-not-delivered",
                    AligoAddressBookDeliveryStatus.NOT_DELIVERED);
        }

        public static UploadResult rateLimited() {
            return new UploadResult(0, 0, 0, 429, "rate-limited",
                    AligoAddressBookDeliveryStatus.NOT_DELIVERED);
        }

        public boolean isRateLimited() {
            return httpStatus == 429;
        }

        public boolean isExternallyDelivered() {
            return deliveryStatus == AligoAddressBookDeliveryStatus.DELIVERED
                    || deliveryStatus == AligoAddressBookDeliveryStatus.PARTIALLY_DELIVERED;
        }
    }
}

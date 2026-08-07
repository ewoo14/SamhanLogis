package com.samhanair.logis.notification.service;

import com.samhanair.logis.notification.client.AligoAddressBookClient;
import com.samhanair.logis.notification.client.AligoAddressBookClient.AligoContact;
import com.samhanair.logis.notification.client.AligoAddressBookClient.UploadResult;
import com.samhanair.logis.notification.client.AligoCsvSourceClient;
import com.samhanair.logis.notification.dto.AligoAddressBookDeliveryStatus;
import com.samhanair.logis.notification.dto.AligoAddressBookSyncResponse;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Phase 10 PR-F1 BE-1 — 알리고 주소록 자동 동기화 service.
 *
 * <p><b>Samhan Public 이식 — legacy GAS 9번 "알리고 자동 업로드" 의 native 자동화.</b>
 * Legacy 흐름 = <i>이카운트 거래처리스트 + KT 공유주소록 → Notion 거래처마스터 → 알리고 SF벤더 그룹
 * CSV (수동 업로드)</i>. 본 service = <i>partner-service 거래처 → 알리고 주소록 API native sync (자동)</i>.
 *
 * <h2>흐름</h2>
 * <ol>
 *   <li>{@link AligoCsvSourceClient#fetchContacts()} 로 partner-service 알리고 CSV 다운 + parse</li>
 *   <li>{@link #CHUNK_SIZE} 50 단위로 contact 분할</li>
 *   <li>각 chunk 를 {@link AligoAddressBookClient#uploadChunk(List)} 호출
 *       — 429 응답 시 {@link #BACKOFF_INITIAL_MILLIS} 부터 {@link #BACKOFF_MAX_RETRIES} 회 exponential
 *       backoff 재시도</li>
 *   <li>최종 added / updated / skipped 누적 + failed chunk 의 sample memo 누적 후 반환</li>
 * </ol>
 *
 * <h2>TODO — 실 알리고 API spec 후 보강</h2>
 * <p>현 시점 {@link AligoAddressBookClient} 구현체는 외부 미전달 mock. 실 spec 확정 후 RestClient 기반
 * 구현체로 교체되면 client 결과의 {@code deliveryStatus} 가 자동으로 응답에 반영된다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AligoAddressBookSyncService {

    /** 알리고 주소록 chunk size — legacy GAS 패턴 이식 (외부 API rate limit 회피). */
    static final int CHUNK_SIZE = 50;

    /** 429 응답 시 재시도 횟수 (exponential backoff). */
    static final int BACKOFF_MAX_RETRIES = 3;

    /** 첫 backoff sleep (ms). 다음 retry 마다 2배 증가 (200 → 400 → 800). */
    static final long BACKOFF_INITIAL_MILLIS = 200L;

    private final AligoCsvSourceClient csvSourceClient;
    private final AligoAddressBookClient aligoClient;

    /**
     * 알리고 주소록 sync 실행 (운영자 trigger).
     *
     * @return 4 카테고리 결과 (added / updated / skipped / failed)
     */
    public AligoAddressBookSyncResponse sync() {
        List<AligoContact> contacts = csvSourceClient.fetchContacts();
        if (contacts.isEmpty()) {
            log.warn("AligoAddressBookSync — partner-service CSV fetch 결과 비어있음 (token 미설정 또는 활성 거래처 0건)");
            return new AligoAddressBookSyncResponse(0, 0, 0, List.of(),
                    AligoAddressBookDeliveryStatus.NOT_DELIVERED);
        }

        int added = 0;
        int updated = 0;
        int skipped = 0;
        List<String> failed = new ArrayList<>();
        AligoAddressBookDeliveryStatus deliveryStatus = null;

        int chunkIndex = 0;
        for (int from = 0; from < contacts.size(); from += CHUNK_SIZE) {
            int to = Math.min(from + CHUNK_SIZE, contacts.size());
            List<AligoContact> chunk = contacts.subList(from, to);
            chunkIndex++;

            UploadResult result = uploadWithBackoff(chunk, chunkIndex);
            if (result == null) {
                deliveryStatus = AligoAddressBookDeliveryStatus.combine(
                        deliveryStatus, AligoAddressBookDeliveryStatus.NOT_DELIVERED);
                String sample = chunk.get(0).memo();
                failed.add("chunk#" + chunkIndex + " [first=" + sample + "] FAILED 429 retries exhausted");
                log.warn("AligoAddressBookSync — chunk#{} 최종 실패 (429 backoff 소진)", chunkIndex);
                continue;
            }
            if (result.httpStatus() >= 400 && !result.isRateLimited()) {
                deliveryStatus = AligoAddressBookDeliveryStatus.combine(
                        deliveryStatus, AligoAddressBookDeliveryStatus.NOT_DELIVERED);
                String sample = chunk.get(0).memo();
                failed.add("chunk#" + chunkIndex + " [first=" + sample + "] HTTP " + result.httpStatus());
                log.warn("AligoAddressBookSync — chunk#{} HTTP {} (실패)", chunkIndex, result.httpStatus());
                continue;
            }
            deliveryStatus = AligoAddressBookDeliveryStatus.combine(deliveryStatus, result.deliveryStatus());
            if (result.isExternallyDelivered()) {
                added += result.added();
                updated += result.updated();
                skipped += result.skipped();
            } else {
                log.warn("AligoAddressBookSync — chunk#{} 외부 미전달 결과는 성공/신규 건수로 계수하지 않음",
                        chunkIndex);
            }
        }

        log.info("AligoAddressBookSync 완료 — totalContacts={} chunks={} added={} updated={} skipped={} failed={}",
                contacts.size(), chunkIndex, added, updated, skipped, failed.size());
        return new AligoAddressBookSyncResponse(added, updated, skipped, failed,
                deliveryStatus == null ? AligoAddressBookDeliveryStatus.NOT_DELIVERED : deliveryStatus);
    }

    /**
     * 단일 chunk 업로드 + 429 응답 시 exponential backoff 재시도.
     *
     * @return 성공/실패 응답 또는 backoff 소진 시 {@code null}
     */
    UploadResult uploadWithBackoff(List<AligoContact> chunk, int chunkIndex) {
        long sleepMs = BACKOFF_INITIAL_MILLIS;
        for (int attempt = 0; attempt <= BACKOFF_MAX_RETRIES; attempt++) {
            UploadResult result = aligoClient.uploadChunk(chunk);
            if (!result.isRateLimited()) {
                return result;
            }
            if (attempt >= BACKOFF_MAX_RETRIES) {
                return null;
            }
            log.warn("AligoAddressBookSync — chunk#{} 429 received, attempt={}, backoff={}ms",
                    chunkIndex, attempt + 1, sleepMs);
            sleep(sleepMs);
            sleepMs *= 2;
        }
        return null;
    }

    /** 테스트에서 override 가능하도록 분리. */
    void sleep(long millis) {
        if (millis <= 0) {
            return;
        }
        try {
            Thread.sleep(millis);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
    }
}

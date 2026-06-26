package com.samhanair.logis.notification.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Firebase Cloud Messaging (FCM) 환경 설정.
 *
 * <ul>
 *   <li>{@code projectId} — Firebase 프로젝트 ID</li>
 *   <li>{@code credentialsPath} — service-account credentials JSON 파일 경로</li>
 *   <li>{@code credentialsBase64} — service-account credentials JSON base64</li>
 * </ul>
 *
 * <p>credentials 가 blank 또는 placeholder 인 경우 stub-success 반환 (외부 호출 X). 실 자격은
 * 환경변수/시크릿으로만 주입하며 JSON 파일 또는 base64 값을 repo 에 커밋하지 않는다.
 */
@Data
@ConfigurationProperties(prefix = "samhan.notification.fcm")
public class FcmProperties {

    private String projectId;
    private String credentialsPath;
    private String credentialsBase64;
}

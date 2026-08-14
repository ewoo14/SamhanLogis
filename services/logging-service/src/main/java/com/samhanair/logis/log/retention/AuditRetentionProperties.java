package com.samhanair.logis.log.retention;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** 업무·법규 판단으로 바뀔 수 있는 감사 보존 기간 설정. */
@ConfigurationProperties(prefix = "samhan.audit.retention")
public class AuditRetentionProperties {
    private Duration changeRetention;
    private Duration failureRetention;
    private Duration readRetention;
    public Duration getChangeRetention() { return changeRetention; }
    public void setChangeRetention(Duration value) { this.changeRetention = value; }
    public Duration getFailureRetention() { return failureRetention; }
    public void setFailureRetention(Duration value) { this.failureRetention = value; }
    public Duration getReadRetention() { return readRetention; }
    public void setReadRetention(Duration value) { this.readRetention = value; }
}

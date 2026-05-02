package com.shuaibo.ai.model;

import lombok.Builder;
import lombok.Data;

/**
 * 聊天响应（含可观测性数据）
 */
@Data
@Builder
public class ChatResponse {
    /** AI回答 */
    private String answer;
    /** RAG召回的相关代码片段数量 */
    private int ragHits;
    /** Token消耗 */
    private TokenUsage tokenUsage;
    /** 响应耗时(ms) */
    private long latencyMs;

    @Data
    @Builder
    public static class TokenUsage {
        private int promptTokens;
        private int completionTokens;
        private int totalTokens;
    }
}

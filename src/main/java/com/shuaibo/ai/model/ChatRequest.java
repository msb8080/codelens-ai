package com.shuaibo.ai.model;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;

/**
 * 聊天请求
 */
@Data
public class ChatRequest {
    /** 用户提问 */
    @NotBlank(message = "question 不能为空")
    private String question;
    /** 会话ID（多轮对话） */
    private String sessionId;
    /** 智能体ID */
    private String agentId;
    /** 系统提示词（前端智能体传入） */
    private String systemPrompt;
    /** 模型名称 */
    private String model;
    /** API Base URL（可选，覆盖默认） */
    private String baseUrl;
    /** API Key（可选，覆盖默认） */
    private String apiKey;
}

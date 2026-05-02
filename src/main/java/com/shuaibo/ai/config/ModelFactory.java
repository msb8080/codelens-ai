package com.shuaibo.ai.config;

import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 动态模型工厂 — 根据请求中的 model 名称创建 ChatModel
 * 支持所有 OpenAI 兼容接口（硅基流动、小米 mimo、Ollama 等）
 */
@Component
public class ModelFactory {

    @Value("${spring.ai.openai.base-url}")
    private String defaultBaseUrl;

    @Value("${spring.ai.openai.api-key}")
    private String defaultApiKey;

    @Value("${spring.ai.openai.chat.options.model:mimo-v2.5-pro}")
    private String defaultModel;

    /** 模型缓存 */
    private final Map<String, OpenAiChatModel> modelCache = new ConcurrentHashMap<>();

    /**
     * 获取 ChatModel。如果 model 为 null 或与默认相同，返回 null（调用方使用默认 bean）
     */
    public OpenAiChatModel getModel(String modelName) {
        if (modelName == null || modelName.isBlank() || modelName.equals(defaultModel)) {
            return null; // 使用 Spring 自动配置的默认 ChatModel
        }

        return modelCache.computeIfAbsent(modelName, name -> {
            OpenAiApi openAiApi = new OpenAiApi(defaultBaseUrl, defaultApiKey);
            OpenAiChatOptions options = OpenAiChatOptions.builder()
                    .withModel(name)
                    .withTemperature(0.7)
                    .withMaxTokens(2048)
                    .build();
            return new OpenAiChatModel(openAiApi, options);
        });
    }

    public String getDefaultModel() {
        return defaultModel;
    }
}

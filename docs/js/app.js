// =========================================
// OmniAgent — 多智能体平台 前端逻辑
// =========================================

// ===== 常量 & DOM =====
const $ = id => document.getElementById(id);
const messages = $('messages');
const input = $('input');
const sendBtn = $('sendBtn');

let currentAbort = null;
let streamingMsgEl = null;
let activeAgentId = null;
let activeModelId = null;

// ===== 内置智能体定义 =====
const BUILTIN_AGENTS = [
    // --- 开发全流程 ---
    { id: 'prd',       emoji: '📋', name: 'PRD 助手',    category: '开发', brief: '需求分析、用户故事、PRD 文档撰写',   systemPrompt: '你是专业的产品经理助手。帮助用户分析需求、撰写 PRD、定义用户故事和验收标准。输出结构化的产品文档。' },
    { id: 'design',    emoji: '🎨', name: '设计助手',    category: '开发', brief: 'UI/UX 设计方案、交互原型描述',     systemPrompt: '你是资深 UI/UX 设计助手。帮助用户制定设计方案、描述交互原型、推荐设计模式和配色方案。擅长输出清晰的设计规格说明。' },
    { id: 'code',      emoji: '💻', name: '编码助手',    category: '开发', brief: '代码编写、重构、Code Review',      systemPrompt: '你是高级软件工程师。帮助用户编写代码、重构优化、进行 Code Review。遵循 SOLID 原则，注重代码质量和可维护性。根据语言规范输出最佳实践代码。' },
    { id: 'test',      emoji: '🧪', name: '测试助手',    category: '开发', brief: '测试用例设计、自动化测试脚本',     systemPrompt: '你是 QA 测试专家。帮助用户设计测试用例（边界值、等价类）、编写自动化测试脚本、制定测试策略。覆盖单元测试、集成测试和 E2E 测试。' },
    { id: 'deploy',    emoji: '🚀', name: '部署助手',    category: '开发', brief: 'Docker、K8s、CI/CD、运维',        systemPrompt: '你是 DevOps 工程师。帮助用户编写 Dockerfile、docker-compose、K8s 配置、CI/CD 流水线（GitHub Actions/GitLab CI）。关注安全性、可观测性和成本优化。' },

    // --- 生活 & 投资 ---
    { id: 'chef',      emoji: '🍳', name: '烹饪助手',    category: '生活', brief: '菜谱推荐、营养搭配、烹饪技巧',     systemPrompt: '你是米其林级厨师和营养师。根据用户食材、口味偏好和健康目标，推荐菜谱，给出详细步骤、火候控制和营养分析。语言亲切有趣。' },
    { id: 'stock',     emoji: '📈', name: '股票助手',    category: '投资', brief: '行情分析、基本面/技术面、投资建议', systemPrompt: '你是专业证券分析师。提供股票行情分析、基本面（PE/PB/ROE）、技术面（K线/均线/MACD）解读。给出投资建议时必须附风险提示：投资有风险，入市需谨慎。不提供具体的买卖点建议。' },

    // --- 通用 ---
    { id: 'general',   emoji: '🧠', name: '通用助手',    category: '通用', brief: '问答、翻译、写作、头脑风暴',       systemPrompt: '你是 OmniAgent 通用助手，一个全能的 AI 助手。帮助用户解答问题、翻译文本、润色写作、头脑风暴。回答简洁专业。' },
];

// ===== 配置管理 =====
const STORAGE_KEY = 'omniagent-config';

function defaultConfig() {
    return {
        apiUrl: 'https://codelens-ai-ghfh.onrender.com',
        models: [
            { id: 'mimo', name: 'mimo-v2.5-pro', provider: '小米 mimo', baseUrl: 'https://token-plan-cn.xiaomimimo.com', apiKey: '', model: 'mimo-v2.5-pro', active: true },
        ],
        agents: JSON.parse(JSON.stringify(BUILTIN_AGENTS)),
        agentBindings: {},  // { agentId: { modelId, mcpIds:[], skillIds:[], ruleIds:[] } }
        mcps: [],
        skills: [],
        rules: [],
    };
}

function loadConfig() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultConfig();
        const cfg = JSON.parse(raw);
        // 合并默认，确保新增字段存在
        const def = defaultConfig();
        for (const k of Object.keys(def)) {
            if (!(k in cfg)) cfg[k] = def[k];
        }
        // 确保内置 agent 存在
        for (const ba of BUILTIN_AGENTS) {
            if (!cfg.agents.find(a => a.id === ba.id)) {
                cfg.agents.push({ ...ba });
            }
        }
        return cfg;
    } catch { return defaultConfig(); }
}

function saveConfig(cfg) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

let config = loadConfig();

// ===== API URL =====
function getApiBase() {
    return new URLSearchParams(window.location.search).get('api')
        || config.apiUrl
        || 'https://codelens-ai-ghfh.onrender.com';
}

// ===== Markdown =====
let useMarked = false;
try { marked.setOptions({ breaks: true, gfm: true }); useMarked = true; } catch {}

function parseMarkdown(text) {
    if (!useMarked || !text) return escapeHtml(text || '').replace(/\n/g, '<br>');
    const opens = (text.match(/```/g) || []).length;
    if (opens % 2 === 1) {
        const lastIdx = text.lastIndexOf('```');
        const closed = text.substring(0, lastIdx);
        const unclosed = text.substring(lastIdx);
        let html = '';
        if (closed) { try { html = marked.parse(closed); } catch { html = escapeHtml(closed).replace(/\n/g,'<br>'); } }
        html += '<pre><code>' + escapeHtml(unclosed) + '</code></pre>';
        return html;
    }
    try { return marked.parse(text); } catch { return escapeHtml(text).replace(/\n/g,'<br>'); }
}

function escapeHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ===== Mermaid =====
let useMermaid = false, mermaidCounter = 0;
try {
    mermaid.initialize({ startOnLoad:false, theme:'dark', themeVariables:{ primaryColor:'#7e5adc', primaryTextColor:'#fff', primaryBorderColor:'#a894df', lineColor:'#a894df', secondaryColor:'#3d2966', tertiaryColor:'#1a1030', background:'transparent', mainBkg:'#3d2966', nodeBorder:'#a894df', titleColor:'#fff' }, fontFamily:'Plus Jakarta Sans', securityLevel:'loose' });
    useMermaid = true;
} catch {}

function renderMermaidInElement(container) {
    if (!useMermaid) return;
    container.querySelectorAll('code.language-mermaid').forEach(codeEl => {
        const preEl = codeEl.closest('pre'); if (!preEl) return;
        const def = codeEl.textContent.trim(); if (!def) return;
        const id = 'mermaid-' + (++mermaidCounter);
        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid'; wrapper.id = id;
        preEl.replaceWith(wrapper);
        try { mermaid.render(id+'-svg', def).then(({svg}) => { wrapper.innerHTML = svg; }).catch(err => { wrapper.innerHTML = '<pre style="color:#f87171;">'+escapeHtml(err.message||err)+'</pre>'; }); }
        catch { wrapper.innerHTML = '<pre style="color:#f87171;">Mermaid 渲染失败</pre>'; }
    });
}

// ===== 滚动 =====
function scrollToBottom() {
    const cursor = messages.querySelector('.streaming-cursor');
    if (cursor) cursor.scrollIntoView({ behavior:'auto', block:'end' });
    else messages.scrollTop = messages.scrollHeight;
}

// ===== Agent 选择 =====
function selectAgent(agentId) {
    const agent = config.agents.find(a => a.id === agentId);
    if (!agent) return;

    activeAgentId = agentId;
    const binding = config.agentBindings[agentId] || {};

    // 更新头部
    $('agentAvatar').textContent = agent.emoji;
    $('agentName').textContent = agent.name;
    $('agentDesc').textContent = agent.brief;
    $('activeAgentDisplay').textContent = `智能体: ${agent.name}`;

    // 启用输入
    input.disabled = false;
    sendBtn.disabled = false;
    input.placeholder = `向 ${agent.name} 提问... (Enter 发送, Shift+Enter 换行)`;

    // 设置默认模型
    if (binding.modelId) {
        const m = config.models.find(m => m.id === binding.modelId);
        if (m) { activeModelId = m.id; updateModelLabel(m); }
    } else if (!activeModelId && config.models.length) {
        const first = config.models[0];
        activeModelId = first.id;
        updateModelLabel(first);
    }

    // 更新侧边栏高亮
    document.querySelectorAll('.agent-option').forEach(el => {
        el.classList.toggle('active', el.dataset.id === agentId);
    });

    // 关闭侧边栏
    closeAgentPanel();
    input.focus();
}

// ===== Agent 侧边栏 =====
function toggleAgentPanel() {
    const sidebar = $('agentSidebar');
    const overlay = $('agentSidebarOverlay');
    const isOpen = sidebar.classList.contains('open');
    if (isOpen) closeAgentPanel(); else openAgentPanel();
}

function openAgentPanel() {
    renderAgentSidebar();
    $('agentSidebar').classList.add('open');
    $('agentSidebarOverlay').style.display = 'block';
    $('agentSelectorBtn').classList.add('active');
}

function closeAgentPanel() {
    $('agentSidebar').classList.remove('open');
    $('agentSidebarOverlay').style.display = 'none';
    $('agentSelectorBtn').classList.remove('active');
}

function renderAgentSidebar() {
    const container = $('agentCategories');
    // 按类别分组
    const groups = {};
    config.agents.forEach(a => {
        const cat = a.category || '其他';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(a);
    });

    let html = '';
    for (const [cat, agents] of Object.entries(groups)) {
        html += `<div class="agent-category-label">${escapeHtml(cat)}</div>`;
        agents.forEach(a => {
            const isActive = a.id === activeAgentId;
            html += `
                <div class="agent-option ${isActive?'active':''}" data-id="${a.id}" onclick="selectAgent('${a.id}')">
                    <div class="agent-option-emoji">${a.emoji}</div>
                    <div class="agent-option-info">
                        <div class="agent-option-name">${escapeHtml(a.name)}</div>
                        <div class="agent-option-brief">${escapeHtml(a.brief)}</div>
                    </div>
                </div>`;
        });
    }
    container.innerHTML = html;
}

// ===== 模型管理 =====
function updateModelLabel(m) {
    $('currentModelLabel').textContent = m.name || m.model || '--';
}

function toggleModelSelector() {
    const dd = $('modelDropdown');
    const ind = $('modelIndicator');
    if (dd.style.display === 'none') {
        dd.style.display = 'block';
        ind.classList.add('active');
        renderModelDropdown();
    } else {
        dd.style.display = 'none';
        ind.classList.remove('active');
    }
}

function renderModelDropdown() {
    const list = $('modelList');
    if (!config.models.length) {
        list.innerHTML = '<div style="padding:1rem;text-align:center;color:rgba(255,255,255,0.3);font-size:0.8rem;">请先添加模型</div>';
        return;
    }
    list.innerHTML = config.models.map(m => `
        <div class="model-option ${m.id===activeModelId?'active':''}" onclick="pickModel('${m.id}')">
            <div class="model-option-icon"><span class="material-symbols-outlined">smart_toy</span></div>
            <div class="model-option-info">
                <div class="model-option-name">${escapeHtml(m.name||m.model)}</div>
                <div class="model-option-provider">${escapeHtml(m.provider||'自定义')}</div>
            </div>
            ${m.id===activeModelId ? '<span class="material-symbols-outlined model-option-check">check_circle</span>' : ''}
        </div>
    `).join('');
}

function pickModel(id) {
    activeModelId = id;
    const m = config.models.find(m => m.id === id);
    if (m) updateModelLabel(m);
    $('modelDropdown').style.display = 'none';
    $('modelIndicator').classList.remove('active');

    // 如果有活动 agent，更新绑定
    if (activeAgentId) {
        if (!config.agentBindings[activeAgentId]) config.agentBindings[activeModelId] = {};
        config.agentBindings[activeAgentId] = config.agentBindings[activeAgentId] || {};
        config.agentBindings[activeAgentId].modelId = id;
        saveConfig(config);
    }
}

// 点击外部关闭模型下拉
document.addEventListener('click', e => {
    const dd = $('modelDropdown');
    const ind = $('modelIndicator');
    if (dd.style.display !== 'none' && !dd.contains(e.target) && !ind.contains(e.target)) {
        dd.style.display = 'none';
        ind.classList.remove('active');
    }
});

// ===== 发送消息 =====
async function send() {
    const question = input.value.trim();
    if (!question || !activeAgentId) return;

    const agent = config.agents.find(a => a.id === activeAgentId);
    if (!agent) return;

    addMessage('user', question);
    input.value = '';
    autoResize();
    setSending(true);

    const aiMsgEl = createStreamingMessage();
    streamingMsgEl = aiMsgEl;
    const bubbleEl = aiMsgEl.querySelector('.bubble');
    let fullText = '';

    const controller = new AbortController();
    currentAbort = () => { controller.abort(); fullText = finalizeStopped(aiMsgEl, fullText); };

    // 构建请求
    const binding = config.agentBindings[activeAgentId] || {};
    const model = config.models.find(m => m.id === (binding.modelId || activeModelId));

    const body = {
        question,
        agentId: activeAgentId,
        systemPrompt: agent.systemPrompt,
        model: model ? (model.model || model.name) : undefined,
    };

    try {
        const res = await fetch(`${getApiBase()}/api/chat/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            let currentEvent = '';
            for (const line of lines) {
                if (line.startsWith('event:')) {
                    currentEvent = line.slice(6).trim();
                } else if (line.startsWith('data:')) {
                    const raw = line.slice(5);
                    if (currentEvent === 'token') {
                        let token; try { token = JSON.parse(raw); } catch { token = raw; }
                        fullText += token;
                        bubbleEl.innerHTML = parseMarkdown(fullText) + '<span class="streaming-cursor"></span>';
                        renderMermaidInElement(bubbleEl);
                        scrollToBottom();
                    } else if (currentEvent === 'done') {
                        try {
                            const result = JSON.parse(raw);
                            finalizeStreamingMessage(aiMsgEl, result.latencyMs, result.tokenUsage);
                            updateStats(result.latencyMs);
                        } catch { finalizeStreamingMessage(aiMsgEl); }
                    }
                }
            }
        }

        bubbleEl.innerHTML = parseMarkdown(fullText);
        renderMermaidInElement(bubbleEl);
        if (bubbleEl.querySelector('.streaming-cursor')) finalizeStreamingMessage(aiMsgEl);

    } catch (e) {
        if (e.name !== 'AbortError') {
            bubbleEl.innerHTML = parseMarkdown(fullText || '') + '<br><br>⚠️ ' + escapeHtml(e.message);
            const cursor = bubbleEl.querySelector('.streaming-cursor');
            if (cursor) cursor.remove();
            finalizeStreamingMessage(aiMsgEl);
        }
    } finally {
        setSending(false);
        currentAbort = null;
        streamingMsgEl = null;
        input.focus();
    }
}

// ===== 停止 & 继续 =====
function finalizeStopped(msgEl, fullText) {
    const bubbleEl = msgEl.querySelector('.bubble');
    bubbleEl.innerHTML = parseMarkdown(fullText) + '<br><em style="color:var(--brand-light);font-size:0.85em;">⏸ 已中断</em>';
    renderMermaidInElement(bubbleEl);
    finalizeStreamingMessage(msgEl);
    addContinueButton(msgEl);
    return fullText;
}

function addContinueButton(msgEl) {
    const actions = msgEl.querySelector('.msg-actions') || (() => {
        const d = document.createElement('div'); d.className = 'msg-actions';
        msgEl.querySelector('.msg-body').appendChild(d); return d;
    })();
    if (actions.querySelector('.continue-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'action-btn continue-btn'; btn.title = '继续生成';
    btn.innerHTML = '<span class="material-symbols-outlined">play_arrow</span>';
    btn.onclick = () => {
        const userMsgs = messages.querySelectorAll('.message.user');
        if (!userMsgs.length) return;
        input.value = userMsgs[userMsgs.length-1].querySelector('.bubble').textContent;
        msgEl.remove();
        send();
    };
    actions.appendChild(btn);
}

function addCopyButton(msgEl) {
    if (msgEl.querySelector('.msg-actions .copy-btn')) return;
    let actions = msgEl.querySelector('.msg-actions');
    if (!actions) { actions = document.createElement('div'); actions.className = 'msg-actions'; msgEl.querySelector('.msg-body').appendChild(actions); }
    const btn = document.createElement('button');
    btn.className = 'action-btn copy-btn'; btn.title = '复制';
    btn.innerHTML = '<span class="material-symbols-outlined">content_copy</span>';
    btn.onclick = () => {
        const text = msgEl.querySelector('.bubble')?.textContent || '';
        navigator.clipboard.writeText(text).then(() => {
            btn.innerHTML = '<span class="material-symbols-outlined">check</span>';
            setTimeout(() => { btn.innerHTML = '<span class="material-symbols-outlined">content_copy</span>'; }, 1500);
        });
    };
    actions.appendChild(btn);
}

// ===== 消息渲染 =====
function setSending(sending) {
    if (sending) {
        sendBtn.disabled = false;
        sendBtn.classList.add('stop-btn');
        sendBtn.innerHTML = '<span class="material-symbols-outlined">stop_circle</span> 停止';
        sendBtn.onclick = () => { if (currentAbort) currentAbort(); };
    } else {
        sendBtn.classList.remove('stop-btn');
        sendBtn.disabled = !activeAgentId;
        sendBtn.innerHTML = '<span class="material-symbols-outlined">send</span> 发送';
        sendBtn.onclick = () => send();
    }
}

function createStreamingMessage() {
    const agent = config.agents.find(a => a.id === activeAgentId);
    const avatarEmoji = agent ? agent.emoji : '🧠';
    const div = document.createElement('div');
    div.className = 'message ai streaming';
    div.innerHTML = `
        <div class="msg-avatar">${avatarEmoji}</div>
        <div class="msg-body">
            <div class="bubble"><span class="streaming-cursor"></span></div>
            <div class="msg-meta"><span class="generating-text">正在生成</span><span class="generating-dots"><i></i><i></i><i></i></span></div>
        </div>`;
    messages.appendChild(div);
    addCopyButton(div);
    scrollToBottom();
    return div;
}

function finalizeStreamingMessage(msgEl, latency, tokenUsage) {
    msgEl.classList.remove('streaming');
    const cursor = msgEl.querySelector('.streaming-cursor');
    if (cursor) cursor.remove();
    const meta = msgEl.querySelector('.msg-meta');
    if (meta) {
        const parts = [];
        if (latency) parts.push(`${latency}ms`);
        if (tokenUsage?.totalTokens) parts.push(`↑${tokenUsage.promptTokens} ↓${tokenUsage.completionTokens}`);
        parts.push(new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}));
        meta.textContent = parts.join(' · ');
    }
    addCopyButton(msgEl);
    const count = messages.querySelectorAll('.message').length;
    $('msgCount').textContent = `消息: ${count}`;
}

function addMessage(role, text) {
    const agent = config.agents.find(a => a.id === activeAgentId);
    const avatarEmoji = role === 'user' ? '👤' : (agent ? agent.emoji : '🧠');
    const div = document.createElement('div');
    div.className = `message ${role}`;
    const content = role === 'ai' ? parseMarkdown(text) : escapeHtml(text).replace(/\n/g,'<br>');
    const meta = `<div class="msg-meta">${new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</div>`;
    div.innerHTML = `<div class="msg-avatar">${avatarEmoji}</div><div class="msg-body"><div class="bubble">${content}</div>${meta}</div>`;
    messages.appendChild(div);
    if (role === 'ai') { renderMermaidInElement(div.querySelector('.bubble')); addCopyButton(div); }
    scrollToBottom();
    const count = messages.querySelectorAll('.message').length;
    $('msgCount').textContent = `消息: ${count}`;
}

// ===== 输入框 =====
function autoResize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; }
input.addEventListener('input', autoResize);
input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (currentAbort) currentAbort(); else send();
    }
});

function updateStats(latency) {
    if (latency) $('latencyDisplay').textContent = `延迟: ${latency}ms`;
}

// =========================================
// 配置面板
// =========================================
function openConfigPanel(tab) {
    $('configOverlay').style.display = 'block';
    $('configPanel').style.display = 'flex';
    switchConfigTab(tab || 'models');
}
function closeConfig() {
    $('configOverlay').style.display = 'none';
    $('configPanel').style.display = 'none';
}

function switchConfigTab(tab) {
    document.querySelectorAll('.config-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.config-content').forEach(c => c.style.display = 'none');
    const target = $('tab-' + tab);
    if (target) target.style.display = 'block';

    // 渲染对应内容
    if (tab === 'models') renderModelConfig();
    else if (tab === 'mcp') renderMcpConfig();
    else if (tab === 'skills') renderSkillConfig();
    else if (tab === 'rules') renderRuleConfig();
    else if (tab === 'agents') renderAgentConfig();
    else if (tab === 'api') $('apiUrlInput').value = config.apiUrl || '';
}

// ===== 模型配置渲染 =====
function renderModelConfig() {
    const list = $('modelConfigList');
    const empty = $('modelEmpty');
    if (!config.models.length) { list.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    list.innerHTML = config.models.map((m, i) => `
        <div class="config-item">
            <div class="config-item-header">
                <div class="config-item-title"><span class="material-symbols-outlined">smart_toy</span> ${escapeHtml(m.name||m.model||'未命名')}</div>
                <div class="config-item-actions">
                    <button onclick="editModel(${i})" title="编辑"><span class="material-symbols-outlined">edit</span></button>
                    <button class="delete-btn" onclick="deleteModel(${i})" title="删除"><span class="material-symbols-outlined">delete</span></button>
                </div>
            </div>
            <div class="config-row"><label>Provider</label><span style="font-size:0.8rem;color:rgba(255,255,255,0.5)">${escapeHtml(m.provider||'-')}</span></div>
            <div class="config-row"><label>Model</label><span style="font-size:0.8rem;color:rgba(255,255,255,0.5)">${escapeHtml(m.model||'-')}</span></div>
            <div class="config-row"><label>Base URL</label><span style="font-size:0.75rem;color:rgba(255,255,255,0.35);word-break:break-all">${escapeHtml(m.baseUrl||'-')}</span></div>
        </div>
    `).join('');
}

function addModel() {
    const name = prompt('模型名称（显示用）：');
    if (!name) return;
    const model = prompt('模型 ID（API 调用名）：', name);
    const baseUrl = prompt('Base URL（OpenAI 兼容，不含 /v1）：', 'https://api.openai.com');
    const provider = prompt('提供商名称：', '自定义');
    config.models.push({ id: 'm_'+Date.now(), name, model, baseUrl: baseUrl||'', provider: provider||'自定义', apiKey: '', active: true });
    saveConfig(config);
    renderModelConfig();
    renderModelDropdown();
}

function editModel(i) {
    const m = config.models[i]; if (!m) return;
    const name = prompt('模型名称：', m.name); if (name === null) return;
    const model = prompt('模型 ID：', m.model); if (model === null) return;
    const baseUrl = prompt('Base URL：', m.baseUrl); if (baseUrl === null) return;
    const apiKey = prompt('API Key（留空不修改）：');
    m.name = name; m.model = model; m.baseUrl = baseUrl;
    if (apiKey) m.apiKey = apiKey;
    saveConfig(config);
    renderModelConfig();
    renderModelDropdown();
}

function deleteModel(i) {
    if (!confirm('删除此模型？')) return;
    config.models.splice(i, 1);
    if (activeModelId && !config.models.find(m => m.id === activeModelId)) {
        activeModelId = config.models[0]?.id || null;
        if (activeModelId) updateModelLabel(config.models[0]);
        else $('currentModelLabel').textContent = '--';
    }
    saveConfig(config);
    renderModelConfig();
    renderModelDropdown();
}

// ===== MCP 配置 =====
function renderMcpConfig() {
    const list = $('mcpConfigList');
    const empty = $('mcpEmpty');
    if (!config.mcps.length) { list.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    list.innerHTML = config.mcps.map((m, i) => `
        <div class="config-item">
            <div class="config-item-header">
                <div class="config-item-title"><span class="material-symbols-outlined">hub</span> ${escapeHtml(m.name)}</div>
                <div class="config-item-actions">
                    <button onclick="editMcp(${i})"><span class="material-symbols-outlined">edit</span></button>
                    <button class="delete-btn" onclick="deleteMcp(${i})"><span class="material-symbols-outlined">delete</span></button>
                </div>
            </div>
            <div class="config-row"><label>类型</label><span style="font-size:0.8rem;color:rgba(255,255,255,0.5)">${escapeHtml(m.type||'stdio')}</span></div>
            <div class="config-row"><label>命令</label><span style="font-size:0.75rem;color:rgba(255,255,255,0.35);word-break:break-all">${escapeHtml(m.command||m.url||'-')}</span></div>
            ${m.enabled === false ? '<div style="color:var(--warning);font-size:0.7rem;margin-top:0.3rem">⏸ 已禁用</div>' : ''}
        </div>
    `).join('');
}

function addMcpServer() {
    const name = prompt('MCP 服务器名称：');
    if (!name) return;
    const type = prompt('类型 (stdio/http)：', 'stdio');
    if (type === 'stdio') {
        const command = prompt('启动命令（如 npx -y @modelcontextprotocol/server-filesystem）：');
        if (!command) return;
        config.mcps.push({ id: 'mcp_'+Date.now(), name, type:'stdio', command, enabled:true });
    } else {
        const url = prompt('HTTP URL：');
        if (!url) return;
        config.mcps.push({ id: 'mcp_'+Date.now(), name, type:'http', url, enabled:true });
    }
    saveConfig(config); renderMcpConfig();
}

function editMcp(i) {
    const m = config.mcps[i]; if (!m) return;
    const name = prompt('名称：', m.name); if (name === null) return;
    m.name = name;
    if (m.type === 'stdio') { const c = prompt('命令：', m.command); if (c !== null) m.command = c; }
    else { const u = prompt('URL：', m.url); if (u !== null) m.url = u; }
    saveConfig(config); renderMcpConfig();
}

function deleteMcp(i) {
    if (!confirm('删除此 MCP 服务器？')) return;
    config.mcps.splice(i, 1); saveConfig(config); renderMcpConfig();
}

// ===== Skills 配置 =====
function renderSkillConfig() {
    const list = $('skillConfigList');
    const empty = $('skillEmpty');
    if (!config.skills.length) { list.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    list.innerHTML = config.skills.map((s, i) => `
        <div class="config-item">
            <div class="config-item-header">
                <div class="config-item-title"><span class="material-symbols-outlined">extension</span> ${escapeHtml(s.name)}</div>
                <div class="config-item-actions">
                    <button onclick="editSkill(${i})"><span class="material-symbols-outlined">edit</span></button>
                    <button class="delete-btn" onclick="deleteSkill(${i})"><span class="material-symbols-outlined">delete</span></button>
                </div>
            </div>
            <div style="font-size:0.75rem;color:rgba(255,255,255,0.35);max-height:60px;overflow:hidden">${escapeHtml((s.content||'').substring(0,150))}...</div>
        </div>
    `).join('');
}

function addSkill() {
    const name = prompt('Skill 名称：');
    if (!name) return;
    const content = prompt('Skill 内容（Markdown 格式）：');
    config.skills.push({ id: 'skill_'+Date.now(), name, content: content||'' });
    saveConfig(config); renderSkillConfig();
}

function editSkill(i) {
    const s = config.skills[i]; if (!s) return;
    const name = prompt('名称：', s.name); if (name === null) return;
    const content = prompt('内容：', s.content); if (content === null) return;
    s.name = name; s.content = content;
    saveConfig(config); renderSkillConfig();
}

function deleteSkill(i) {
    if (!confirm('删除此 Skill？')) return;
    config.skills.splice(i, 1); saveConfig(config); renderSkillConfig();
}

// ===== Rules 配置 =====
function renderRuleConfig() {
    const list = $('ruleConfigList');
    const empty = $('ruleEmpty');
    if (!config.rules.length) { list.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    list.innerHTML = config.rules.map((r, i) => `
        <div class="config-item">
            <div class="config-item-header">
                <div class="config-item-title"><span class="material-symbols-outlined">policy</span> ${escapeHtml(r.name)}</div>
                <div class="config-item-actions">
                    <button onclick="editRule(${i})"><span class="material-symbols-outlined">edit</span></button>
                    <button class="delete-btn" onclick="deleteRule(${i})"><span class="material-symbols-outlined">delete</span></button>
                </div>
            </div>
            <div style="font-size:0.75rem;color:rgba(255,255,255,0.35)">${escapeHtml((r.content||'').substring(0,120))}${(r.content||'').length>120?'...':''}</div>
        </div>
    `).join('');
}

function addRule() {
    const name = prompt('Rule 名称：');
    if (!name) return;
    const content = prompt('Rule 内容：');
    config.rules.push({ id: 'rule_'+Date.now(), name, content: content||'' });
    saveConfig(config); renderRuleConfig();
}

function editRule(i) {
    const r = config.rules[i]; if (!r) return;
    const name = prompt('名称：', r.name); if (name === null) return;
    const content = prompt('内容：', r.content); if (content === null) return;
    r.name = name; r.content = content;
    saveConfig(config); renderRuleConfig();
}

function deleteRule(i) {
    if (!confirm('删除此 Rule？')) return;
    config.rules.splice(i, 1); saveConfig(config); renderRuleConfig();
}

// ===== Agent 配置渲染 =====
function renderAgentConfig() {
    const list = $('agentConfigList');
    list.innerHTML = config.agents.map((a, i) => {
        const binding = config.agentBindings[a.id] || {};
        const modelName = binding.modelId ? (config.models.find(m=>m.id===binding.modelId)?.name || '未知') : '跟随全局';
        const isBuiltin = BUILTIN_AGENTS.some(ba => ba.id === a.id);
        return `
            <div class="config-item">
                <div class="config-item-header">
                    <div class="agent-config-card">
                        <div class="agent-config-emoji">${a.emoji}</div>
                        <div class="agent-config-info">
                            <div class="agent-config-name">${escapeHtml(a.name)}</div>
                            <div class="agent-config-desc">${escapeHtml(a.brief)}</div>
                            <div class="agent-config-tags">
                                <span class="agent-config-tag">${escapeHtml(a.category||'通用')}</span>
                                <span class="agent-config-tag">模型: ${escapeHtml(modelName)}</span>
                                ${isBuiltin ? '<span class="agent-config-tag">内置</span>' : '<span class="agent-config-tag">自定义</span>'}
                            </div>
                        </div>
                    </div>
                    <div class="config-item-actions">
                        <button onclick="editAgentConfig(${i})" title="编辑"><span class="material-symbols-outlined">edit</span></button>
                        ${!isBuiltin ? `<button class="delete-btn" onclick="deleteAgent(${i})" title="删除"><span class="material-symbols-outlined">delete</span></button>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function editAgentConfig(i) {
    const a = config.agents[i]; if (!a) return;
    const name = prompt('名称：', a.name); if (name === null) return;
    const brief = prompt('简介：', a.brief); if (brief === null) return;
    const emoji = prompt('Emoji：', a.emoji); if (emoji === null) return;
    const prompt_ = prompt('System Prompt：', a.systemPrompt); if (prompt_ === null) return;
    const modelId = prompt('默认模型 ID（留空跟随全局）：', config.agentBindings[a.id]?.modelId || '');

    a.name = name; a.brief = brief; a.emoji = emoji; a.systemPrompt = prompt_;
    config.agentBindings[a.id] = config.agentBindings[a.id] || {};
    config.agentBindings[a.id].modelId = modelId || undefined;

    saveConfig(config); renderAgentConfig();
    // 刷新侧边栏和头部
    if (activeAgentId === a.id) selectAgent(a.id);
}

function addAgent() {
    const name = prompt('智能体名称：');
    if (!name) return;
    const emoji = prompt('Emoji 图标：', '🤖');
    const brief = prompt('一句话简介：');
    const category = prompt('分类（如 开发/生活/投资/通用）：', '通用');
    const systemPrompt = prompt('System Prompt（系统提示词）：');
    config.agents.push({ id: 'custom_'+Date.now(), emoji: emoji||'🤖', name, category: category||'通用', brief: brief||'', systemPrompt: systemPrompt||'' });
    saveConfig(config); renderAgentConfig();
}

function deleteAgent(i) {
    const a = config.agents[i]; if (!a) return;
    if (!confirm(`删除智能体 "${a.name}"？`)) return;
    config.agents.splice(i, 1);
    if (activeAgentId === a.id) {
        activeAgentId = null;
        $('agentAvatar').textContent = '🧠';
        $('agentName').textContent = 'OmniAgent';
        $('agentDesc').textContent = '全能智能体 · 选择一个助手开始';
        $('activeAgentDisplay').textContent = '智能体: 未选择';
        input.disabled = true; sendBtn.disabled = true;
        input.placeholder = '选择一个智能体后开始对话...';
    }
    saveConfig(config); renderAgentConfig();
}

// ===== API URL 保存 =====
function saveApiUrl() {
    const url = $('apiUrlInput').value.trim();
    if (url) { config.apiUrl = url; saveConfig(config); alert('已保存'); }
}

// ===== 导出 / 导入 =====
function exportConfig() {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'omniagent-config.json';
    a.click(); URL.revokeObjectURL(url);
}

function handleImport(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const imported = JSON.parse(reader.result);
            config = { ...defaultConfig(), ...imported };
            saveConfig(config);
            alert('导入成功！');
            location.reload();
        } catch { alert('文件格式错误'); }
    };
    reader.readAsText(file);
    e.target.value = '';
}

// ===== GSAP 入场 =====
document.addEventListener('DOMContentLoaded', () => {
    if (typeof gsap !== 'undefined') {
        gsap.set('.gsap-reveal', { y: 30 });
        gsap.to('.gsap-reveal', { duration: 0.8, opacity: 1, visibility: 'visible', y: 0, stagger: 0.15, ease: 'power3.out', delay: 0.1 });
    } else {
        document.querySelectorAll('.gsap-reveal').forEach(el => { el.style.opacity = '1'; el.style.visibility = 'visible'; });
    }
});

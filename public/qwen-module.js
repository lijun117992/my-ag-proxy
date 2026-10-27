/**
 * 通义千问 (Qwen Creative Studio) 原生嵌入模块
 * 深度集成进 CPAMC 官方仪表盘，作为原生侧边栏功能无缝运行
 */

(function () {
    console.log('[QwenModule] 正在挂载通义千问嵌入式原生扩展...');

    let qwenRoot = null;
    let activeSubTab = 'quota';

    // 1. 初始化 DOM 监听，等待 CPAMC 侧边栏与主容器加载
    function initObserver() {
        const checkInterval = setInterval(() => {
            const sidebar = document.querySelector('nav, .app-sidebar, aside');
            const mainContent = document.querySelector('main.main-content, main');

            if (sidebar && mainContent) {
                clearInterval(checkInterval);
                injectSidebarNav();
                injectMainModule(mainContent);

                // 检查是否有之前激活的状态或 hash 中带有 qwen
                if (sessionStorage.getItem('cpamc_current_tab') === 'qwen' || (window.location.hash && window.location.hash.includes('qwen'))) {
                    if (window.location.hash && window.location.hash.includes('qwen')) {
                        try {
                            history.replaceState(null, '', window.location.pathname + window.location.search);
                        } catch (e) {}
                    }
                    setTimeout(activateQwenView, 100);
                }

                // 启动 DOM 守护（防止 React SPA 异步渲染抹除挂载点）
                startDomGuardian();
            }
        }, 200);

        // 监听其他原生侧边栏菜单的点击，平滑切回 CPAMC 原生视图
        document.addEventListener('click', (e) => {
            const targetNav = e.target.closest('.nav-item, nav a, aside a');
            if (targetNav && targetNav.id !== 'nav-item-qwen') {
                deactivateQwenView();
            }
        }, true);
    }

    // 2. 将“通义千问”注入到 CPAMC 原生侧边栏菜单中
    function injectSidebarNav() {
        if (document.getElementById('nav-item-qwen')) return;

        // 查找合适挂载位置：优先放在 OAuth 登录 或 认证文件 后面
        const targetAnchor = document.querySelector('a[href*="/oauth"]') 
            || document.querySelector('a[href*="/auth-files"]') 
            || document.querySelector('a.nav-item');

        if (!targetAnchor || !targetAnchor.parentElement) return;

        const navLink = document.createElement('a');
        navLink.id = 'nav-item-qwen';
        navLink.href = 'javascript:void(0);';
        navLink.className = 'nav-item qwen-nav-item';
        navLink.setAttribute('aria-label', '通义千问');
        navLink.innerHTML = `
            <span class="nav-icon" style="display:flex;align-items:center;justify-content:center;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>
                </svg>
            </span>
            <span class="nav-text">
                <span class="nav-label">通义千问 (2K/视频)</span>
            </span>
            <span class="nav-badge" style="background:#10b981;color:#fff;font-size:10px;padding:2px 6px;border-radius:10px;margin-left:auto;">新</span>
        `;

        navLink.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            activateQwenView();
        });

        targetAnchor.parentElement.insertBefore(navLink, targetAnchor.nextSibling);
        console.log('[QwenModule] ✅ 已成功将通义千问菜单注入 CPAMC 侧边栏！');
    }

    // 3. 构建并注入通义千问主控制面板
    function injectMainModule(mainContent) {
        if (document.getElementById('qwen-embedded-module')) return;

        qwenRoot = document.createElement('div');
        qwenRoot.id = 'qwen-embedded-module';
        qwenRoot.innerHTML = `
            <div class="qwen-header">
                <div class="qwen-title-group">
                    <h1>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>
                        </svg>
                        通义千问 Creative Studio
                    </h1>
                    <p>原生集成于 CLIProxyAPI · 支持 2048x2048 2K原画、HappyHorse 1.1 电影级生视频与百炼 DashScope 官方直连</p>
                </div>
                <div style="display:flex;gap:8px;align-items:center;">
                    <span class="qwen-badge">
                        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10b981;"></span>
                        双引擎云端协同就绪
                    </span>
                    <button class="qwen-btn" onclick="window.qwenRefreshData()">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
                        刷新数据
                    </button>
                </div>
            </div>

            <!-- 子导航 Tabs -->
            <div class="qwen-tabs">
                <button class="qwen-tab-btn active" id="qwen-tab-quota" onclick="window.qwenSwitchTab('quota')">📊 账号池与配额</button>
                <button class="qwen-tab-btn" id="qwen-tab-import" onclick="window.qwenSwitchTab('import')">📥 账号录入与授权</button>
                <button class="qwen-tab-btn" id="qwen-tab-playground" onclick="window.qwenSwitchTab('playground')">🎨 2K生图与视频试炼场</button>
                <button class="qwen-tab-btn" id="qwen-tab-backup" onclick="window.qwenSwitchTab('backup')">🛡️ 凭证永久备份 (防丢)</button>
            </div>

            <!-- 视图 1：账号池与配额概览 -->
            <div id="qwen-view-quota">
                <div class="qwen-stat-grid">
                    <div class="qwen-stat-box">
                        <div class="qwen-stat-label">已挂载千问账号</div>
                        <div class="qwen-stat-val" id="qwen-stat-accounts">-</div>
                        <div class="qwen-stat-desc">自动轮询负载均衡</div>
                    </div>
                    <div class="qwen-stat-box">
                        <div class="qwen-stat-label">2K 画王有效账号</div>
                        <div class="qwen-stat-val" style="color:#8b5cf6;" id="qwen-stat-2k">-</div>
                        <div class="qwen-stat-desc">2048x2048 顶级分辨率</div>
                    </div>
                    <div class="qwen-stat-box">
                        <div class="qwen-stat-label">对话通道有效账号</div>
                        <div class="qwen-stat-val" style="color:#06b6d4;" id="qwen-stat-chat">-</div>
                        <div class="qwen-stat-desc">主站对话通道</div>
                    </div>
                    <div class="qwen-stat-box">
                        <div class="qwen-stat-label">DashScope 官方引擎</div>
                        <div class="qwen-stat-val" style="color:#10b981;font-size:18px;line-height:2.2;" id="qwen-stat-dashscope">检测中...</div>
                        <div class="qwen-stat-desc">百炼官方 API 直连</div>
                    </div>
                </div>

                <div class="qwen-card">
                    <div style="font-weight:600;font-size:15px;margin-bottom:12px;">千问账号挂载明细</div>
                    <div style="overflow-x:auto;">
                        <table class="qwen-table">
                            <thead>
                                <tr>
                                    <th>账号 ID / 备注</th>
                                    <th>2K 画王与视频权限</th>
                                    <th>对话通道权限</th>
                                    <th>Cookie 挂载</th>
                                    <th>状态</th>
                                </tr>
                            </thead>
                            <tbody id="qwen-accounts-table-body">
                                <tr><td colspan="5" style="text-align:center;color:var(--text-tertiary);padding:24px;">正在读取账号池...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- 视图 2：账号录入与授权管理 -->
            <div id="qwen-view-import" style="display:none;">
                <!-- 卡片 A：直接录入通义千问 Cookie / Token -->
                <div class="qwen-card" style="margin-bottom:20px;">
                    <div style="font-weight:600;font-size:15px;margin-bottom:6px;">⚡ 方式一：直接录入通义千问 Cookie / Token (支持 2K 画王与 5秒 视频)</div>
                    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;line-height:1.5;">
                        在浏览器打开 <a href="https://create.qwen.com" target="_blank" style="color:#10b981;text-decoration:underline;">create.qwen.com</a> 或 <a href="https://chat.qwen.ai" target="_blank" style="color:#10b981;text-decoration:underline;">chat.qwen.ai</a> 登录后，直接将页面 Cookie 粘贴在此处，一键保存立即激活！
                    </p>
                    <div style="display:grid;grid-template-columns:1fr;gap:12px;">
                        <div>
                            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">账号标识 / 备注名</label>
                            <input id="qwen-cred-name" class="qwen-input" placeholder="例如：千问主号 或 我的账号1">
                        </div>
                        <div>
                            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">通义千问 Cookie 字符串 (包含 refresh_token=...)</label>
                            <textarea id="qwen-cred-cookie" class="qwen-textarea" rows="3" placeholder="粘贴完整的 Cookie 字符串，例如：_qw_bx_timeout_v1=...; refresh_token=eyJ...; ..."></textarea>
                        </div>
                        <div>
                            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">认证 Token (可选，从 Authorization 或 localStorage 提取的 JWT)</label>
                            <input id="qwen-cred-token" class="qwen-input" placeholder="选填，例如：eyJhbGciOiJIUzI1NiIs...">
                        </div>
                    </div>
                    <div style="margin-top:14px;">
                        <button class="qwen-btn qwen-btn-primary" onclick="window.qwenSubmitCredential()">
                            💾 立即保存并激活该账号
                        </button>
                    </div>
                </div>

                <!-- 卡片 B：配置阿里云百炼 / DashScope 官方密钥 -->
                <div class="qwen-card" style="margin-bottom:20px;">
                    <div style="font-weight:600;font-size:15px;margin-bottom:6px;">🌟 方式二：配置阿里云百炼 / DashScope API Key (官方直连，稳定推荐)</div>
                    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;line-height:1.5;">
                        阿里云百炼新用户拥有大量免费额度。录入 API Key 后，系统生图将自动调用官方 <code>qwen-image-plus</code> 旗舰模型，永不掉线，免维护！
                    </p>
                    <div style="display:flex;gap:10px;align-items:center;">
                        <input id="qwen-dashscope-key-input" class="qwen-input" style="flex:1;" placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx">
                        <button class="qwen-btn qwen-btn-primary" onclick="window.qwenSubmitDashscopeKey()">
                            💾 保存百炼密钥
                        </button>
                    </div>
                </div>

                <!-- 卡片 C：微软 Outlook 自动收码与批量导入 -->
                <div class="qwen-card">
                    <div style="font-weight:600;font-size:15px;margin-bottom:6px;">📫 方式三：微软 Outlook 自动取件 & 批量导入</div>
                    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;">
                        支持导入批量购买的微软 Outlook 账号，系统将通过微软 Graph API 自动连接邮箱收取 6 位验证码！
                    </p>
                    <textarea id="qwen-import-input" class="qwen-textarea" rows="4" placeholder="账号格式（每行一个）：&#10;邮箱----密码----client_id----refresh_token&#10;例如：DanielsenDrawe084@outlook.com----oyfcnuq97----9e5f94bc-e8a4-4e73-b8be-63364c29d753----M.C546_BAY..."></textarea>
                    
                    <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;">
                        <button class="qwen-btn qwen-btn-primary" id="qwen-btn-import" onclick="window.qwenSubmitImport()">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                            一键批量录入
                        </button>
                        <button class="qwen-btn" onclick="window.qwenTestFirstLine()">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                            仅测试首行自动收取验证码
                        </button>
                    </div>

                    <div id="qwen-import-log-box" style="margin-top:16px;display:none;">
                        <div style="font-size:12px;font-weight:600;margin-bottom:6px;">执行日志与收件结果：</div>
                        <div id="qwen-import-log" class="qwen-log-box"></div>
                    </div>
                </div>
            </div>

            <!-- 视图 3：2K 生图与 HappyHorse 视频试炼场 -->
            <div id="qwen-view-playground" style="display:none;">
                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:20px;">
                    <div class="qwen-card" style="margin-bottom:0;">
                        <div style="font-weight:600;font-size:15px;margin-bottom:14px;">创作参数配置</div>
                        
                        <div style="margin-bottom:12px;">
                            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">生成模式</label>
                            <div style="display:flex;gap:8px;">
                                <button id="qwen-mode-img-btn" class="qwen-btn qwen-btn-dark" style="flex:1;" onclick="window.qwenSetGenMode('image')">🎨 2K 画王原画 (2048x2048)</button>
                                <button id="qwen-mode-dash-btn" class="qwen-btn" style="flex:1;" onclick="window.qwenSetGenMode('dashscope')">⚡ DashScope 绘图</button>
                                <button id="qwen-mode-vid-btn" class="qwen-btn" style="flex:1;" onclick="window.qwenSetGenMode('video')">🎬 5秒电影视频</button>
                            </div>
                        </div>

                        <div style="margin-bottom:12px;">
                            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">提示词 (Prompt)</label>
                            <textarea id="qwen-gen-prompt" class="qwen-textarea" rows="3" placeholder="例如：超高清写实赛博朋克机械黑猫，霓虹雨夜街道，2K电影光影"></textarea>
                        </div>

                        <div style="margin-bottom:12px;">
                            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">画幅比例</label>
                            <select id="qwen-gen-size" class="qwen-select">
                                <option value="1:1" selected>1:1 正方形 (2048x2048 / 经典方形)</option>
                                <option value="16:9">16:9 宽屏风光 (电影壁纸)</option>
                                <option value="9:16">9:16 竖屏短视频 (手机全屏)</option>
                                <option value="4:3">4:3 经典摄影画幅</option>
                                <option value="3:4">3:4 经典人像立绘</option>
                            </select>
                        </div>

                        <div id="qwen-video-ref-container" style="display:none;margin-bottom:14px;">
                            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">参考图 URL (选填，首尾帧控制)</label>
                            <input id="qwen-gen-ref" class="qwen-input" placeholder="http://... (多个 URL 逗号隔开)">
                        </div>

                        <button id="qwen-btn-generate" class="qwen-btn qwen-btn-primary" style="width:100%;padding:12px;" onclick="window.qwenRunGenerate()">
                            ✨ 立即生成
                        </button>
                    </div>

                    <div class="qwen-card" style="margin-bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:360px;">
                        <div id="qwen-gen-empty" style="text-align:center;color:var(--text-tertiary);">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 12px auto;display:block;"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                            <div style="font-weight:600;font-size:14px;">等待生成任务</div>
                            <div style="font-size:12px;margin-top:4px;">生成的 2K 原图或 MP4 视频将在此处呈现</div>
                        </div>
                        <div id="qwen-gen-loading" style="display:none;text-align:center;">
                            <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:6px;">正在向通义云端调度任务...</div>
                            <div style="font-size:12px;color:var(--text-secondary);">2K 原画通常耗时约 15-25 秒，视频耗时约 40-70 秒</div>
                        </div>
                        <div id="qwen-gen-error-box" style="display:none;width:100%;padding:16px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:10px;text-align:center;">
                            <div id="qwen-gen-error-msg" style="color:#ef4444;font-size:13px;font-weight:600;margin-bottom:10px;line-height:1.6;"></div>
                            <button class="qwen-btn qwen-btn-primary" style="padding:6px 14px;font-size:12px;" onclick="window.qwenSwitchTab('import')">
                                👉 前往【账号录入与授权】添加凭证
                            </button>
                        </div>
                        <div id="qwen-gen-result" style="display:none;width:100%;text-align:center;">
                            <div id="qwen-media-wrapper" style="max-height:420px;overflow:hidden;border-radius:10px;margin-bottom:12px;background:#000;"></div>
                            <div style="display:flex;gap:10px;justify-content:center;">
                                <a id="qwen-download-btn" href="#" target="_blank" download class="qwen-btn">下载原文件</a>
                                <button class="qwen-btn" onclick="window.qwenCopyUrl()">复制直链</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 视图 4：凭证永久固化与防丢 -->
            <div id="qwen-view-backup" style="display:none;">
                <div class="qwen-card" style="margin-bottom:20px;">
                    <div style="font-weight:600;font-size:15px;margin-bottom:6px;">🛡️ 为什么之前的凭证会丢失？如何彻底永久保存？</div>
                    <p style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:16px;">
                        Render 免费实例的磁盘属于<b>临时容器层</b>。当 Render 云端重新构建或重启容器时，保存在容器内的临时文件会被重置为代码仓库的初始状态。<br>
                        <b>彻底告别重置的方法：</b>点击下方按钮生成持久化备份，将其贴入 Render 的 <code>Environment Variables</code>，以后云端无论如何重启更新，所有 Antigravity / Claude / 通义千问凭据永久生效并开机自启自动还原！
                    </p>

                    <div style="background:var(--bg-primary);border:1px solid var(--border-color);border-radius:10px;padding:16px;margin-bottom:16px;">
                        <div style="font-weight:600;font-size:13px;margin-bottom:6px;">当前凭据池实时检测：</div>
                        <div id="qwen-auths-list" style="font-size:13px;color:var(--text-secondary);line-height:1.6;">正在读取云端凭证...</div>
                    </div>

                    <div style="display:flex;gap:10px;flex-wrap:wrap;">
                        <button class="qwen-btn qwen-btn-dark" onclick="window.qwenGenerateBackup()">
                            📋 一键导出全量持久化环境变量 (Render 专用)
                        </button>
                        <a href="#/oauth" class="qwen-btn">
                            🔑 前往左侧 OAuth 登录重新授权 Antigravity
                        </a>
                    </div>

                    <div id="qwen-backup-output-box" style="margin-top:16px;display:none;">
                        <div style="font-size:12px;font-weight:600;margin-bottom:6px;">将以下 Base64 字符串配置到 Render 后台 Environment -> Key 填 <code>RENDER_AUTHS_BACKUP</code>：</div>
                        <textarea id="qwen-backup-output" class="qwen-textarea" rows="4" readonly></textarea>
                    </div>
                </div>

                <!-- 手动还原卡片 -->
                <div class="qwen-card">
                    <div style="font-weight:600;font-size:15px;margin-bottom:6px;">📥 手动粘贴 Base64 备份立即还原</div>
                    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;">
                        如果您之前导出了备份字符串，可直接粘贴在此处，一键瞬间还原所有认证文件与账号池：
                    </p>
                    <textarea id="qwen-restore-input" class="qwen-textarea" rows="3" placeholder="粘贴 RENDER_AUTHS_BACKUP 的 Base64 备份字符串..."></textarea>
                    <div style="margin-top:12px;">
                        <button class="qwen-btn qwen-btn-primary" onclick="window.qwenSubmitRestore()">
                            ⚡ 立即还原凭证
                        </button>
                    </div>
                </div>
            </div>
        `;

        mainContent.appendChild(qwenRoot);
        console.log('[QwenModule] ✅ 已将通义千问模块面板注入 CPAMC 主视窗！');
    }

    // 4. 激活与关闭通义千问面板
    function activateQwenView() {
        sessionStorage.setItem('cpamc_current_tab', 'qwen');
        const qwenNav = document.getElementById('nav-item-qwen');
        const mainContent = document.querySelector('main.main-content, main');

        if (qwenNav) {
            document.querySelectorAll('.nav-item').forEach(el => {
                if (el !== qwenNav) {
                    el.classList.remove('active');
                    el.removeAttribute('aria-current');
                }
            });
            qwenNav.classList.add('active');
            qwenNav.setAttribute('aria-current', 'page');
        }

        if (mainContent && qwenRoot) {
            if (!mainContent.contains(qwenRoot)) {
                mainContent.appendChild(qwenRoot);
            }
            Array.from(mainContent.children).forEach(child => {
                if (child !== qwenRoot) {
                    child.style.setProperty('display', 'none', 'important');
                }
            });
            qwenRoot.style.setProperty('display', 'block', 'important');
            qwenRoot.classList.add('active');
        }

        if (window.qwenLoadAccounts) window.qwenLoadAccounts();
        if (window.qwenCheckAuths) window.qwenCheckAuths();
    }

    function deactivateQwenView() {
        sessionStorage.removeItem('cpamc_current_tab');
        const qwenNav = document.getElementById('nav-item-qwen');
        const mainContent = document.querySelector('main.main-content, main');

        if (qwenNav) {
            qwenNav.classList.remove('active');
            qwenNav.removeAttribute('aria-current');
        }

        if (qwenRoot) {
            qwenRoot.style.setProperty('display', 'none', 'important');
            qwenRoot.classList.remove('active');
        }

        if (mainContent) {
            Array.from(mainContent.children).forEach(child => {
                if (child !== qwenRoot) {
                    child.style.removeProperty('display');
                }
            });
        }
    }

    // 守护进程：防止 React SPA 重新渲染抹除挂载点或覆盖 display
    function startDomGuardian() {
        let isSyncing = false;
        const observer = new MutationObserver(() => {
            if (isSyncing) return;
            injectSidebarNav();

            if (sessionStorage.getItem('cpamc_current_tab') === 'qwen') {
                isSyncing = true;
                try {
                    const mainContent = document.querySelector('main.main-content, main');
                    if (mainContent && qwenRoot) {
                        if (!mainContent.contains(qwenRoot)) {
                            mainContent.appendChild(qwenRoot);
                        }
                        Array.from(mainContent.children).forEach(child => {
                            if (child !== qwenRoot && child.style.display !== 'none') {
                                child.style.setProperty('display', 'none', 'important');
                            }
                        });
                        if (qwenRoot.style.display !== 'block') {
                            qwenRoot.style.setProperty('display', 'block', 'important');
                        }
                    }
                    const qNav = document.getElementById('nav-item-qwen');
                    if (qNav && !qNav.classList.contains('active')) {
                        document.querySelectorAll('.nav-item').forEach(el => {
                            if (el !== qNav) el.classList.remove('active');
                        });
                        qNav.classList.add('active');
                    }
                } finally {
                    isSyncing = false;
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    // 5. 交互方法暴露给 window
    window.qwenSwitchTab = function (tab) {
        activeSubTab = tab;
        ['quota', 'import', 'playground', 'backup'].forEach(t => {
            const btn = document.getElementById('qwen-tab-' + t);
            const view = document.getElementById('qwen-view-' + t);
            if (btn) btn.className = 'qwen-tab-btn' + (t === tab ? ' active' : '');
            if (view) view.style.display = (t === tab ? 'block' : 'none');
        });
        if (tab === 'quota') window.qwenLoadAccounts();
        if (tab === 'backup') window.qwenCheckAuths();
    };

    window.qwenRefreshData = function () {
        window.qwenLoadAccounts();
        window.qwenCheckAuths();
        alert('数据已刷新！');
    };

    let currentGenMode = 'image';
    let lastMediaUrl = '';

    window.qwenSetGenMode = function (mode) {
        currentGenMode = mode;
        const imgBtn = document.getElementById('qwen-mode-img-btn');
        const dashBtn = document.getElementById('qwen-mode-dash-btn');
        const vidBtn = document.getElementById('qwen-mode-vid-btn');
        const refBox = document.getElementById('qwen-video-ref-container');

        imgBtn.className = 'qwen-btn' + (mode === 'image' ? ' qwen-btn-dark' : '');
        dashBtn.className = 'qwen-btn' + (mode === 'dashscope' ? ' qwen-btn-dark' : '');
        vidBtn.className = 'qwen-btn' + (mode === 'video' ? ' qwen-btn-dark' : '');
        refBox.style.display = (mode === 'video' ? 'block' : 'none');
    };

    window.qwenLoadAccounts = async function () {
        try {
            const res = await fetch('/api/management/accounts');
            const data = await res.json();
            if (data.success) {
                document.getElementById('qwen-stat-accounts').innerText = data.totalAccounts || 0;
                document.getElementById('qwen-stat-2k').innerText = data.validStudioCount || 0;
                document.getElementById('qwen-stat-chat').innerText = data.validChatCount || 0;
                
                const dashEl = document.getElementById('qwen-stat-dashscope');
                if (dashEl) {
                    dashEl.innerHTML = data.dashscopeConfigured 
                        ? '<span style="color:#10b981;">🟢 已就绪 (免登)</span>' 
                        : '<span style="color:var(--text-tertiary);font-size:14px;">⚪ 未配置</span>';
                }

                const tbody = document.getElementById('qwen-accounts-table-body');
                if (!data.accounts || data.accounts.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-tertiary);padding:24px;">暂无挂载账号，请前往【账号录入与授权】中录入 Cookie 或百炼 Key</td></tr>';
                } else {
                    tbody.innerHTML = data.accounts.map(acc => `
                        <tr>
                            <td style="font-weight:600;">${acc.name || acc.id}</td>
                            <td>${acc.hasStudio ? '<span style="color:#10b981;">🟢 2K 画王已激活</span>' : '<span style="color:var(--text-tertiary);">⚪ 未配置</span>'}</td>
                            <td>${acc.hasChat ? '<span style="color:#10b981;">🟢 主站对话就绪</span>' : '<span style="color:var(--text-tertiary);">⚪ 未配置</span>'}</td>
                            <td>${acc.hasCookies ? '<span style="color:#10b981;">🟢 Cookie 已挂载</span>' : '<span style="color:var(--text-tertiary);">⚪ 无</span>'}</td>
                            <td><span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;background:rgba(16,185,129,0.12);color:#10b981;">正常服务</span></td>
                        </tr>
                    `).join('');
                }
            }
        } catch (e) {
            console.error('[QwenModule] 加载账号失败:', e);
        }
    };

    window.qwenSubmitCredential = async function () {
        const name = document.getElementById('qwen-cred-name').value.trim();
        const cookies = document.getElementById('qwen-cred-cookie').value.trim();
        const token = document.getElementById('qwen-cred-token').value.trim();

        if (!cookies && !token) {
            alert('请至少填入通义千问 Cookie 或 Token 中的一项！');
            return;
        }

        try {
            const res = await fetch('/api/management/qwen-credential', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, cookies, token })
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                document.getElementById('qwen-cred-cookie').value = '';
                document.getElementById('qwen-cred-token').value = '';
                window.qwenLoadAccounts();
                window.qwenSwitchTab('quota');
            } else {
                alert('保存失败: ' + (data.error || '未知错误'));
            }
        } catch (e) {
            alert('请求异常: ' + e.message);
        }
    };

    window.qwenSubmitDashscopeKey = async function () {
        const key = document.getElementById('qwen-dashscope-key-input').value.trim();
        if (!key) {
            alert('请输入有效的 DashScope API Key (sk-...)');
            return;
        }

        try {
            const res = await fetch('/api/management/dashscope-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: key })
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                window.qwenLoadAccounts();
            } else {
                alert('保存失败: ' + (data.error || '未知错误'));
            }
        } catch (e) {
            alert('请求异常: ' + e.message);
        }
    };

    window.qwenTestFirstLine = async function () {
        const raw = document.getElementById('qwen-import-input').value.trim();
        if (!raw) {
            alert('请先输入至少一行账号数据！');
            return;
        }
        const line = raw.split('\n')[0].trim();
        const parts = line.split('----').map(s => s.trim());
        if (parts.length < 4) {
            alert('该行缺少 client_id 或 refresh_token，无法执行微软 Graph API 取件！');
            return;
        }

        const logBox = document.getElementById('qwen-import-log-box');
        const log = document.getElementById('qwen-import-log');
        logBox.style.display = 'block';
        log.innerHTML = `<div>▶ 正在通过微软 Graph API 连接 ${parts[0]}...</div>`;

        try {
            const res = await fetch('/api/management/fetch-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client_id: parts[2], refresh_token: parts[3] })
            });
            const data = await res.json();
            if (data.success) {
                log.innerHTML += `<div style="color:#10b981;font-weight:bold;margin-top:6px;">🎉 成功收取验证码：${data.code}</div>`;
            } else {
                log.innerHTML += `<div style="color:#f59e0b;margin-top:6px;">⚠️ ${data.message}</div>`;
            }
        } catch (err) {
            log.innerHTML += `<div style="color:#ef4444;margin-top:6px;">❌ 取件失败: ${err.message}</div>`;
        }
    };

    window.qwenSubmitImport = async function () {
        const raw = document.getElementById('qwen-import-input').value.trim();
        if (!raw) {
            alert('请输入待导入账号');
            return;
        }

        const btn = document.getElementById('qwen-btn-import');
        btn.disabled = true;
        btn.innerText = '正在录入...';

        const logBox = document.getElementById('qwen-import-log-box');
        const log = document.getElementById('qwen-import-log');
        logBox.style.display = 'block';
        log.innerHTML = `<div>▶ 正在批量录入并检验微软 Graph API 通道...</div>`;

        try {
            const res = await fetch('/api/management/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ raw_text: raw })
            });
            const data = await res.json();
            if (data.success) {
                log.innerHTML += `<div style="color:#10b981;font-weight:bold;margin-top:6px;">✅ ${data.message}</div>`;
                data.results.forEach(r => {
                    log.innerHTML += `<div style="margin-left:12px;margin-top:4px;">• ${r.email} - ${r.hasGraphApi ? '🟢 微软Graph API就绪 (' + r.lastCodeFound + ')' : '🟡 仅密码'}</div>`;
                });
                window.qwenLoadAccounts();
            } else {
                log.innerHTML += `<div style="color:#ef4444;margin-top:6px;">❌ 导入失败: ${data.error}</div>`;
            }
        } catch (e) {
            log.innerHTML += `<div style="color:#ef4444;margin-top:6px;">❌ 请求异常: ${e.message}</div>`;
        } finally {
            btn.disabled = false;
            btn.innerText = '一键批量录入';
        }
    };

    window.qwenRunGenerate = async function () {
        const prompt = document.getElementById('qwen-gen-prompt').value.trim();
        if (!prompt) {
            alert('请输入提示词');
            return;
        }

        const size = document.getElementById('qwen-gen-size').value;
        const refStr = document.getElementById('qwen-gen-ref').value.trim();
        const refImages = refStr ? refStr.split(',').map(s => s.trim()).filter(Boolean) : [];

        const emptyBox = document.getElementById('qwen-gen-empty');
        const resultBox = document.getElementById('qwen-gen-result');
        const loadingBox = document.getElementById('qwen-gen-loading');
        const errorBox = document.getElementById('qwen-gen-error-box');
        const errorMsg = document.getElementById('qwen-gen-error-msg');
        const btn = document.getElementById('qwen-btn-generate');

        emptyBox.style.display = 'none';
        resultBox.style.display = 'none';
        errorBox.style.display = 'none';
        loadingBox.style.display = 'block';
        btn.disabled = true;

        try {
            let res, data;
            if (currentGenMode === 'image') {
                res = await fetch('/v1/images/generations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt, size, resolution: '2K' })
                });
            } else if (currentGenMode === 'dashscope') {
                res = await fetch('/v1/images/generations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt, size, provider: 'dashscope' })
                });
            } else {
                res = await fetch('/v1/videos/generations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt, size, duration: 5, model: 'happyhorse1.1', reference_images: refImages })
                });
            }

            data = await res.json();
            if (!res.ok || data.error) {
                const errMsg = data.error?.message || data.message || data.error || '生成失败，请检查账号池凭证配置。';
                throw new Error(errMsg);
            }

            const url = data.data?.[0]?.url;
            if (!url) throw new Error('云端未返回有效的媒体资源链接');

            lastMediaUrl = url;
            if (currentGenMode === 'video') {
                document.getElementById('qwen-media-wrapper').innerHTML = `<video src="${url}" controls autoplay loop style="max-height:420px;max-width:100%;border-radius:8px;"></video>`;
            } else {
                document.getElementById('qwen-media-wrapper').innerHTML = `<img src="${url}" style="max-height:420px;max-width:100%;object-fit:contain;border-radius:8px;">`;
            }

            document.getElementById('qwen-download-btn').href = lastMediaUrl;
            resultBox.style.display = 'block';
        } catch (err) {
            errorMsg.innerText = err.message;
            errorBox.style.display = 'block';
        } finally {
            loadingBox.style.display = 'none';
            btn.disabled = false;
        }
    };

    window.qwenCopyUrl = function () {
        if (lastMediaUrl) {
            navigator.clipboard.writeText(lastMediaUrl);
            alert('已复制生成文件的直接访问 URL！');
        }
    };

    window.qwenCheckAuths = async function () {
        const el = document.getElementById('qwen-auths-list');
        if (!el) return;
        try {
            const res = await fetch('/api/management/auths-backup');
            const data = await res.json();
            if (data.success && data.files && data.files.length > 0) {
                el.innerHTML = `已挂载 <b>${data.files.length}</b> 个全量持久化凭证与配置文件：<br>` + 
                    data.files.map(f => `• <code>${f.filename}</code> (${f.size} 字节)`).join('<br>');
            } else {
                el.innerHTML = `⚠️ 当前云端凭据池暂无凭据文件。<br>请前往左侧 <b>OAuth 登录</b> 授权 Antigravity 或在【账号录入与授权】中添加通义凭证！`;
            }
        } catch (e) {
            el.innerHTML = `读取凭据池状态异常: ${e.message}`;
        }
    };

    window.qwenGenerateBackup = async function () {
        try {
            const res = await fetch('/api/management/auths-backup');
            const data = await res.json();
            if (!data.success || !data.backup_b64) {
                alert('当前凭据池暂无凭据可备份，请先完成登录或凭证录入！');
                return;
            }
            const outBox = document.getElementById('qwen-backup-output-box');
            const outArea = document.getElementById('qwen-backup-output');
            outBox.style.display = 'block';
            outArea.value = data.backup_b64;
            navigator.clipboard.writeText(data.backup_b64);
            alert('已复制持久化 Base64 到剪贴板！请前往 Render 仪表盘 Environment Variables 新建 RENDER_AUTHS_BACKUP 并粘贴保存。');
        } catch (e) {
            alert('生成备份失败: ' + e.message);
        }
    };

    window.qwenSubmitRestore = async function () {
        const b64 = document.getElementById('qwen-restore-input').value.trim();
        if (!b64) {
            alert('请先粘贴 RENDER_AUTHS_BACKUP Base64 字符串');
            return;
        }

        try {
            const res = await fetch('/api/management/auths-restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ backup_b64: b64 })
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                document.getElementById('qwen-restore-input').value = '';
                window.qwenCheckAuths();
                window.qwenLoadAccounts();
            } else {
                alert('还原失败: ' + (data.error || '未知错误'));
            }
        } catch (e) {
            alert('请求异常: ' + e.message);
        }
    };

    // 启动监听
    initObserver();
})();

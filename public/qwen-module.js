/**
 * 通义千问 (Qwen Studio) 原生嵌入模块
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
                handleRouteChange();
                window.addEventListener('hashchange', handleRouteChange);
            }
        }, 300);
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
        navLink.href = '#/qwen';
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
            window.location.hash = '#/qwen';
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
                    <p>原生集成于 CLIProxyAPI · 支持 2048x2048 2K原画、HappyHorse 1.1 电影级生视频与微软 Graph 自动取件</p>
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
                <button class="qwen-tab-btn" id="qwen-tab-import" onclick="window.qwenSwitchTab('import')">📥 批量导入 & 自动取件</button>
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
                        <div class="qwen-stat-label">每日 2K 画王生图</div>
                        <div class="qwen-stat-val" style="color:#8b5cf6;" id="qwen-stat-2k">-</div>
                        <div class="qwen-stat-desc">2048x2048 顶级分辨率</div>
                    </div>
                    <div class="qwen-stat-box">
                        <div class="qwen-stat-label">每日 HappyHorse 视频</div>
                        <div class="qwen-stat-val" style="color:#ec4899;" id="qwen-stat-videos">-</div>
                        <div class="qwen-stat-desc">5秒动作连贯电影质感</div>
                    </div>
                    <div class="qwen-stat-box">
                        <div class="qwen-stat-label">每日对话生图数</div>
                        <div class="qwen-stat-val" style="color:#06b6d4;" id="qwen-stat-chat">-</div>
                        <div class="qwen-stat-desc">主站对话通道生图</div>
                    </div>
                </div>

                <div class="qwen-card">
                    <div style="font-weight:600;font-size:15px;margin-bottom:12px;">千问账号挂载明细</div>
                    <div style="overflow-x:auto;">
                        <table class="qwen-table">
                            <thead>
                                <tr>
                                    <th>账号 ID / 邮箱</th>
                                    <th>2K 画王权限</th>
                                    <th>对话生图权限</th>
                                    <th>每日积分</th>
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

            <!-- 视图 2：批量导入 & 微软 Graph 自动取件 -->
            <div id="qwen-view-import" style="display:none;">
                <div class="qwen-card">
                    <div style="font-weight:600;font-size:15px;margin-bottom:6px;">⚡ 微软 Outlook 自动取件 & 批量导入</div>
                    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">
                        直接把购买或准备的账号格式粘贴在下方。系统将通过微软 Graph API 自动连接邮箱收取 6 位验证码并入库，彻底免抓包！
                    </p>
                    <textarea id="qwen-import-input" class="qwen-textarea" rows="5" placeholder="账号格式（每行一个）：&#10;邮箱----密码----client_id----refresh_token&#10;例如：DanielsenDrawe084@outlook.com----oyfcnuq97----9e5f94bc-e8a4-4e73-b8be-63364c29d753----M.C546_BAY..."></textarea>
                    
                    <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;">
                        <button class="qwen-btn qwen-btn-primary" id="qwen-btn-import" onclick="window.qwenSubmitImport()">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                            一键自动取件并入库
                        </button>
                        <button class="qwen-btn" onclick="window.qwenTestFirstLine()">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                            仅测试首行自动收码
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
                                <button id="qwen-mode-vid-btn" class="qwen-btn" style="flex:1;" onclick="window.qwenSetGenMode('video')">🎬 HappyHorse 1.1 视频 (5秒)</button>
                            </div>
                        </div>

                        <div style="margin-bottom:12px;">
                            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">提示词 (Prompt)</label>
                            <textarea id="qwen-gen-prompt" class="qwen-textarea" rows="3" placeholder="例如：超高清写实赛博朋克机械黑猫，霓虹雨夜街道，2K电影光影"></textarea>
                        </div>

                        <div style="margin-bottom:12px;">
                            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">画幅比例</label>
                            <select id="qwen-gen-size" class="qwen-select">
                                <option value="1:1" selected>1:1 正方形 (2048x2048 / 头像特写)</option>
                                <option value="16:9">16:9 宽屏风光 (电影壁纸)</option>
                                <option value="9:16">9:16 竖屏短视频 (手机全屏)</option>
                                <option value="4:3">4:3 经典摄影画幅</option>
                                <option value="3:4">3:4 经典人像立绘</option>
                            </select>
                        </div>

                        <div id="qwen-video-ref-container" style="display:none;margin-bottom:14px;">
                            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">参考图 URL (选填，支持多图首尾关键帧控制)</label>
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
                            <div style="font-size:12px;margin-top:4px;">生成的 2K 原图或 MP4 视频将在此处实时呈现</div>
                        </div>
                        <div id="qwen-gen-loading" style="display:none;text-align:center;">
                            <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:6px;">正在向通义云端调度任务...</div>
                            <div style="font-size:12px;color:var(--text-secondary);">2K 原画通常耗时约 15-25 秒，视频耗时约 40-70 秒</div>
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
                <div class="qwen-card">
                    <div style="font-weight:600;font-size:15px;margin-bottom:6px;">🛡️ 为什么之前的 Antigravity 凭证会消失？</div>
                    <p style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:16px;">
                        Render 免费实例的磁盘属于<b>临时容器层</b>。当 Render 云端重新构建或重启容器时，保存在容器内的临时文件会被重置为代码仓库的初始状态。<br>
                        <b>彻底告别重置的方法：</b>通过下方的一键工具生成持久化配置，将其贴入 Render 的 <code>Environment Variables</code>，以后云端无论如何重启更新，所有 Antigravity / Claude / Codex 凭据永久生效！
                    </p>

                    <div style="background:var(--bg-primary);border:1px solid var(--border-color);border-radius:10px;padding:16px;margin-bottom:16px;">
                        <div style="font-weight:600;font-size:13px;margin-bottom:6px;">当前凭据池实时检测：</div>
                        <div id="qwen-auths-list" style="font-size:13px;color:var(--text-secondary);line-height:1.6;">正在读取云端凭证...</div>
                    </div>

                    <div style="display:flex;gap:10px;flex-wrap:wrap;">
                        <button class="qwen-btn qwen-btn-dark" onclick="window.qwenGenerateBackup()">
                            📋 一键导出持久化环境变量配置 (Render 专用)
                        </button>
                        <a href="#/oauth" class="qwen-btn">
                            🔑 前往左侧 OAuth 登录重新授权 Antigravity
                        </a>
                    </div>

                    <div id="qwen-backup-output-box" style="margin-top:16px;display:none;">
                        <div style="font-size:12px;font-weight:600;margin-bottom:6px;">将以下内容配置到 Render 后台 Environment -> Key 填 <code>RENDER_AUTHS_BACKUP</code>：</div>
                        <textarea id="qwen-backup-output" class="qwen-textarea" rows="4" readonly></textarea>
                    </div>
                </div>
            </div>
        `;

        mainContent.appendChild(qwenRoot);
        console.log('[QwenModule] ✅ 已将通义千问模块面板注入 CPAMC 主视窗！');
    }

    // 4. 处理路由变化（匹配 #/qwen）
    function handleRouteChange() {
        const hash = window.location.hash || '';
        const qwenNav = document.getElementById('nav-item-qwen');
        const mainContent = document.querySelector('main.main-content, main');

        if (!mainContent || !qwenRoot) return;

        if (hash.startsWith('#/qwen')) {
            // 激活通义千问面板，隐藏 CPAMC 原生视图
            if (qwenNav) qwenNav.classList.add('active');
            
            Array.from(mainContent.children).forEach(child => {
                if (child !== qwenRoot) {
                    child.style.display = 'none';
                }
            });

            qwenRoot.classList.add('active');
            window.qwenLoadAccounts();
            window.qwenCheckAuths();
        } else {
            // 切回原生 CPAMC 视图
            if (qwenNav) qwenNav.classList.remove('active');
            qwenRoot.classList.remove('active');

            Array.from(mainContent.children).forEach(child => {
                if (child !== qwenRoot) {
                    child.style.display = '';
                }
            });
        }
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
        const vidBtn = document.getElementById('qwen-mode-vid-btn');
        const refBox = document.getElementById('qwen-video-ref-container');

        if (mode === 'image') {
            imgBtn.className = 'qwen-btn qwen-btn-dark';
            vidBtn.className = 'qwen-btn';
            refBox.style.display = 'none';
        } else {
            vidBtn.className = 'qwen-btn qwen-btn-dark';
            imgBtn.className = 'qwen-btn';
            refBox.style.display = 'block';
        }
    };

    window.qwenLoadAccounts = async function () {
        try {
            const res = await fetch('/api/management/accounts');
            const data = await res.json();
            if (data.success) {
                document.getElementById('qwen-stat-accounts').innerText = data.totalAccounts || 0;
                document.getElementById('qwen-stat-2k').innerText = data.summary?.total2kImagesPerDay || 0;
                document.getElementById('qwen-stat-videos').innerText = data.summary?.totalVideosPerDay || 0;
                document.getElementById('qwen-stat-chat').innerText = data.summary?.totalChatImagesPerDay || 0;

                const tbody = document.getElementById('qwen-accounts-table-body');
                if (!data.accounts || data.accounts.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-tertiary);padding:24px;">暂无挂载账号，请在【批量导入】中录入账号</td></tr>';
                } else {
                    tbody.innerHTML = data.accounts.map(acc => `
                        <tr>
                            <td style="font-weight:600;">${acc.name || acc.id}</td>
                            <td>${acc.hasStudio ? '<span style="color:#10b981;">🟢 2K 画王已激活</span>' : '<span style="color:var(--text-tertiary);">⚪ 未挂载</span>'}</td>
                            <td>${acc.hasChat ? '<span style="color:#10b981;">🟢 主站已就绪</span>' : '<span style="color:var(--text-tertiary);">⚪ 未挂载</span>'}</td>
                            <td>${acc.dailyCredits || 50} 积分</td>
                            <td><span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;background:rgba(16,185,129,0.12);color:#10b981;">正常服务</span></td>
                        </tr>
                    `).join('');
                }
            }
        } catch (e) {
            console.error('[QwenModule] 加载账号失败:', e);
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
            btn.innerText = '一键自动取件并入库';
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

        document.getElementById('qwen-gen-empty').style.display = 'none';
        document.getElementById('qwen-gen-result').style.display = 'none';
        document.getElementById('qwen-gen-loading').style.display = 'block';
        const btn = document.getElementById('qwen-btn-generate');
        btn.disabled = true;

        try {
            if (currentGenMode === 'image') {
                const res = await fetch('/v1/images/generations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt, size, resolution: '2K' })
                });
                const data = await res.json();
                const url = data.data?.[0]?.url;
                if (!url) throw new Error(data.error || '未返回图片 URL');
                lastMediaUrl = url;
                document.getElementById('qwen-media-wrapper').innerHTML = `<img src="${url}" style="max-height:420px;max-width:100%;object-fit:contain;border-radius:8px;">`;
            } else {
                const res = await fetch('/v1/videos/generations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt, size, duration: 5, model: 'happyhorse1.1', reference_images: refImages })
                });
                const data = await res.json();
                const url = data.data?.[0]?.url;
                if (!url) throw new Error(data.error || '未返回视频 URL');
                lastMediaUrl = url;
                document.getElementById('qwen-media-wrapper').innerHTML = `<video src="${url}" controls autoplay loop style="max-height:420px;max-width:100%;border-radius:8px;"></video>`;
            }
            document.getElementById('qwen-download-btn').href = lastMediaUrl;
            document.getElementById('qwen-gen-result').style.display = 'block';
        } catch (err) {
            alert('生成失败: ' + err.message);
            document.getElementById('qwen-gen-empty').style.display = 'block';
        } finally {
            document.getElementById('qwen-gen-loading').style.display = 'none';
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
                el.innerHTML = `已挂载 <b>${data.files.length}</b> 个有效认证凭据：<br>` + 
                    data.files.map(f => `• <code>${f.filename}</code> (${f.size} 字节)`).join('<br>');
            } else {
                el.innerHTML = `⚠️ 当前云端凭据池暂无凭证文件（由于 Render 免费实例重启重置导致）。<br>请点击下方链接前往 <b>OAuth 登录</b> 重新授权一次 Antigravity 即可！`;
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
                alert('当前凭据池暂无凭据可备份，请先完成 OAuth 登录！');
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

    // 启动监听
    initObserver();
})();

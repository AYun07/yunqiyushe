// ==UserScript==
// @name         DS云起预设 · 自动更新检查器
// @namespace    https://github.com/your-repo/dsyq-preset
// @version      1.0.0
// @description  SillyTavern 启动时自动检查 DS云起预设 更新，一键覆盖导入。需配合 GitHub 托管预设 JSON 使用。
// @author       鲸鱼娘 🐋
// @match        http://localhost:8080/*
// @match        http://127.0.0.1:8080/*
// @match        https://*.ngrok-free.app/*
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      raw.githubusercontent.com
// @connect      api.github.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ===== 配置区：按实际情况修改 =====
  const CONFIG = {
    // GitHub 仓库信息（把预设 JSON 放在仓库根目录或任意路径）
    repoOwner: 'YOUR_GITHUB_USERNAME',      // 你的 GitHub 用户名
    repoName: 'dsyq-preset',                // 仓库名
    presetPath: 'DS云起预设.json',          // 仓库内预设文件路径
    branch: 'main',                         // 分支名

    // 本地预设标识（用于匹配要覆盖的预设）
    presetName: 'DS云起预设 · 全能通用角色卡预设',
    presetAuthor: '鲸鱼娘',

    // 检查间隔（毫秒）— 默认 24 小时
    checkInterval: 24 * 60 * 60 * 1000,

    // 是否启用启动时自动检查
    autoCheckOnLoad: true,

    // 是否显示详细日志
    debug: true
  };
  // ===== 配置区结束 =====

  const STORAGE_KEY = 'dsyq_preset_last_check';
  const VERSION_KEY = 'dsyq_preset_local_version';

  function log(...args) {
    if (CONFIG.debug) console.log('[DS云起预设·自动更新]', ...args);
  }

  function parseVersion(ver) {
    return ver.split('.').map(Number);
  }

  function compareVersion(a, b) {
    const va = parseVersion(a), vb = parseVersion(b);
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
      const na = va[i] || 0, nb = vb[i] || 0;
      if (na !== nb) return na - nb;
    }
    return 0;
  }

  async function fetchRemotePreset() {
    const url = `https://raw.githubusercontent.com/${CONFIG.repoOwner}/${CONFIG.repoName}/${CONFIG.branch}/${CONFIG.presetPath}`;
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 10000,
        onload: (r) => {
          if (r.status === 200) {
            try {
              resolve(JSON.parse(r.responseText));
            } catch (e) {
              reject(new Error('JSON 解析失败: ' + e.message));
            }
          } else {
            reject(new Error(`HTTP ${r.status}: ${r.statusText}`));
          }
        },
        onerror: (e) => reject(new Error('网络请求失败: ' + e.error)),
        ontimeout: () => reject(new Error('请求超时'))
      });
    });
  }

  function findLocalPreset() {
    // 遍历 ST 的 preset 列表，找到同名预设
    // 注意：这依赖于 ST 的内部存储结构，可能随版本变化
    try {
      const presets = JSON.parse(localStorage.getItem('presets') || '[]');
      return presets.find(p => p.name === CONFIG.presetName && p.author === CONFIG.presetAuthor);
    } catch (e) {
      log('读取本地预设失败:', e);
      return null;
    }
  }

  function showUpdateNotification(remoteVer, localVer, changelog) {
    const msg = `发现新版本 v${remoteVer}（当前 v${localVer || '未知'}）\n${changelog || '查看 GitHub Release 了解详情'}`;
    if (typeof GM_notification !== 'undefined') {
      GM_notification({
        title: '🐋 DS云起预设有更新啦',
        text: msg,
        timeout: 10000,
        onclick: () => openUpdateUI(remoteVer)
      });
    } else {
      // 降级：在页面右下角创建一个浮动提示
      createFloatingNotice(msg, remoteVer);
    }
  }

  function createFloatingNotice(message, remoteVer) {
    if (document.getElementById('dsyq-update-notice')) return;

    const el = document.createElement('div');
    el.id = 'dsyq-update-notice';
    el.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 99999;
      background: linear-gradient(135deg, #1e1e24 0%, #2a2a35 100%);
      border: 1px solid #6366f1; border-radius: 12px;
      padding: 16px 20px; max-width: 360px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(99,102,241,0.3);
      font-family: 'M PLUS Rounded 1c', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #e0e0e0; line-height: 1.5; animation: dsyq-slide-in 0.4s ease-out;
    `;
    el.innerHTML = `
      <style>
        @keyframes dsyq-slide-in { from { opacity: 0; transform: translateX(100px); } to { opacity: 1; transform: translateX(0); } }
        .dsyq-notice-title { font-weight: 700; color: #a5b4fc; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
        .dsyq-notice-body { font-size: 0.9em; color: #cbd5e1; margin-bottom: 12px; }
        .dsyq-notice-btns { display: flex; gap: 8px; }
        .dsyq-btn { padding: 6px 14px; border-radius: 8px; font-size: 0.85em; font-weight: 600; cursor: pointer; border: none; transition: all 0.2s; }
        .dsyq-btn-primary { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; }
        .dsyq-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(99,102,241,0.5); }
        .dsyq-btn-secondary { background: rgba(99,102,241,0.2); color: #a5b4fc; border: 1px solid #6366f1; }
        .dsyq-btn-secondary:hover { background: rgba(99,102,241,0.3); }
      </style>
      <div class="dsyq-notice-title">🐋 DS云起预设有更新</div>
      <div class="dsyq-notice-body">${message}</div>
      <div class="dsyq-notice-btns">
        <button class="dsyq-btn dsyq-btn-primary" id="dsyq-btn-update">一键更新</button>
        <button class="dsyq-btn dsyq-btn-secondary" id="dsyq-btn-later">稍后再说</button>
      </div>
    `;
    document.body.appendChild(el);

    document.getElementById('dsyq-btn-update').onclick = () => openUpdateUI(remoteVer);
    document.getElementById('dsyq-btn-later').onclick = () => el.remove();
  }

  function openUpdateUI(remoteVer) {
    // 打开一个模态框，引导用户完成更新
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed; inset: 0; z-index: 100000;
      background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
    `;
    modal.innerHTML = `
      <div style="
        background: #1e1e24; border: 1px solid #6366f1; border-radius: 16px;
        padding: 24px; max-width: 480px; width: 90%;
        font-family: 'M PLUS Rounded 1c', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: #e0e0e0; box-shadow: 0 16px 48px rgba(0,0,0,0.5);
      ">
        <h2 style="margin: 0 0 16px; color: #a5b4fc; display: flex; align-items: center; gap: 10px;">
          🐋 DS云起预设更新到 v${remoteVer}
        </h2>
        <p style="margin: 0 0 16px; color: #94a3b8; line-height: 1.6;">
          检测到远程仓库有新版本。点击下方按钮将自动下载并覆盖导入当前预设。
          <strong>注意：这会覆盖你对预设的任何本地修改（如启用/禁用的分页、自定义变量值等）。</strong>
        </p>
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button id="dsyq-modal-cancel" style="
            padding: 10px 20px; border-radius: 10px; font-weight: 600;
            background: transparent; color: #94a3b8; border: 1px solid #334155;
            cursor: pointer;
          ">取消</button>
          <button id="dsyq-modal-confirm" style="
            padding: 10px 20px; border-radius: 10px; font-weight: 600;
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
            color: white; border: none; cursor: pointer;
          ">确认更新并导入</button>
        </div>
        <p id="dsyq-modal-status" style="margin: 16px 0 0; font-size: 0.85em; color: #64748b; min-height: 1.2em;"></p>
      </div>
    `;
    document.body.appendChild(modal);

    const statusEl = document.getElementById('dsyq-modal-status');

    document.getElementById('dsyq-modal-cancel').onclick = () => modal.remove();
    document.getElementById('dsyq-modal-confirm').onclick = async () => {
      document.getElementById('dsyq-modal-confirm').disabled = true;
      document.getElementById('dsyq-modal-cancel').disabled = true;
      statusEl.textContent = '正在下载最新预设...';
      statusEl.style.color = '#a5b4fc';

      try {
        const remotePreset = await fetchRemotePreset();
        statusEl.textContent = '下载完成，正在导入...';
        statusEl.style.color = '#a5b4fc';

        // 导入逻辑：调用 ST 的内部导入 API（如果可用）或模拟导入
        await importPresetToST(remotePreset);

        statusEl.textContent = '✅ 更新成功！页面将在 2 秒后刷新生效。';
        statusEl.style.color = '#22c55e';

        // 更新本地版本记录
        GM_setValue(VERSION_KEY, remotePreset.version);
        GM_setValue(STORAGE_KEY, Date.now());

        setTimeout(() => location.reload(), 2000);
      } catch (e) {
        statusEl.textContent = `❌ 更新失败: ${e.message}`;
        statusEl.style.color = '#ef4444';
        document.getElementById('dsyq-modal-cancel').disabled = false;
        document.getElementById('dsyq-modal-cancel').textContent = '关闭';
      }
    };
  }

  async function importPresetToST(presetData) {
    // 方案 1：尝试调用 ST 的内部 API（如果暴露了）
    // 方案 2：直接操作 localStorage（风险较高，结构可能变）
    // 方案 3：模拟用户点击导入（最稳妥但需用户交互）

    // 这里采用方案 3：创建一个隐藏的文件输入并触发 ST 的导入逻辑
    // 注意：ST 的导入按钮通常在预设管理面板，我们通过派发事件模拟

    return new Promise((resolve, reject) => {
      // 创建一个 Blob 并触发下载，然后提示用户手动导入（最兼容）
      // 或者尝试直接写入 localStorage（如果结构已知）

      // 尝试直接写入 localStorage（兼容当前 ST 版本）
      try {
        const presets = JSON.parse(localStorage.getItem('presets') || '[]');
        const idx = presets.findIndex(p => p.name === CONFIG.presetName && p.author === CONFIG.presetAuthor);
        if (idx >= 0) {
          presets[idx] = presetData;
        } else {
          presets.push(presetData);
        }
        localStorage.setItem('presets', JSON.stringify(presets));

        // 触发 ST 重新加载预设（派发存储事件）
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'presets',
          newValue: JSON.stringify(presets),
          oldValue: localStorage.getItem('presets'),
          storageArea: localStorage
        }));

        resolve();
      } catch (e) {
        // 降级：下载文件让用户手动导入
        const blob = new Blob([JSON.stringify(presetData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'DS云起预设.json';
        a.click();
        URL.revokeObjectURL(url);
        reject(new Error('自动导入失败，已下载文件请手动在预设面板导入覆盖'));
      }
    });
  }

  async function checkUpdate() {
    const now = Date.now();
    const lastCheck = GM_getValue(STORAGE_KEY, 0);
    if (now - lastCheck < CONFIG.checkInterval) {
      log('距离上次检查未到间隔，跳过');
      return;
    }

    log('开始检查更新...');
    try {
      const remotePreset = await fetchRemotePreset();
      const remoteVer = remotePreset.version;
      const localVer = GM_getValue(VERSION_KEY, '0.0.0');

      log('远程版本:', remoteVer, '本地版本:', localVer);

      if (compareVersion(remoteVer, localVer) > 0) {
        log('发现新版本！');
        const changelog = remotePreset.changelog || '';
        showUpdateNotification(remoteVer, localVer, changelog);
      } else {
        log('已是最新版本');
      }

      GM_setValue(STORAGE_KEY, now);
    } catch (e) {
      log('检查更新失败:', e);
    }
  }

  // 初始化：等待 ST 完全加载后再检查
  function waitForSTReady() {
    return new Promise(resolve => {
      const check = () => {
        if (document.querySelector('#preset-select') || document.querySelector('.preset-manager') || localStorage.getItem('presets')) {
          resolve();
        } else {
          setTimeout(check, 500);
        }
      };
      check();
    });
  }

  async function init() {
    log('初始化自动更新检查器...');
    await waitForSTReady();

    // 读取本地预设版本并记录
    const localPreset = findLocalPreset();
    if (localPreset && localPreset.version) {
      GM_setValue(VERSION_KEY, localPreset.version);
      log('记录本地版本:', localPreset.version);
    }

    if (CONFIG.autoCheckOnLoad) {
      setTimeout(checkUpdate, 3000); // 稍微延迟，避免阻塞启动
    }

    // 定期检查
    setInterval(checkUpdate, CONFIG.checkInterval);

    // 在预设管理面板添加手动检查按钮（如果能找到面板）
    injectManualCheckButton();
  }

  function injectManualCheckButton() {
    // 尝试在预设下拉菜单旁添加一个检查更新按钮
    const observer = new MutationObserver(() => {
      const presetSelect = document.querySelector('#preset-select, select[name="preset"], .preset-select');
      if (presetSelect && !document.getElementById('dsyq-check-update-btn')) {
        const btn = document.createElement('button');
        btn.id = 'dsyq-check-update-btn';
        btn.textContent = '🔄 检查更新';
        btn.style.cssText = `
          margin-left: 8px; padding: 4px 10px; border-radius: 6px;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: white; border: none; font-size: 0.8em; font-weight: 600;
          cursor: pointer; transition: all 0.2s;
        `;
        btn.onmouseover = () => btn.style.transform = 'translateY(-1px)';
        btn.onmouseout = () => btn.style.transform = 'translateY(0)';
        btn.onclick = checkUpdate;
        presetSelect.parentNode?.insertBefore(btn, presetSelect.nextSibling);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
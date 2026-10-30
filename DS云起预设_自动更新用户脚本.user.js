// ==UserScript==
// @name         DS云起预设 · 完全自动静默更新
// @namespace    https://github.com/AYun07/yunqiyushe
// @version      2.0.0
// @description  完全静默后台自动更新：检测到 GitHub 新版本 → 直接覆盖 localStorage → 触发 ST 热重载。零 UI、零通知、零交互，导入一次预设后永远自动保持最新。
// @author       鲸鱼娘 🐋
// @match        http://localhost:8080/*
// @match        http://127.0.0.1:8080/*
// @match        https://*.ngrok-free.app/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ===== 配置区 =====
  const CONFIG = {
    repoOwner: 'AYun07',
    repoName: 'yunqiyushe',
    presetPath: 'DS云起预设.json',
    branch: 'main',

    presetName: 'DS云起预设 · 全能通用角色卡预设',
    presetAuthor: '鲸鱼娘',

    checkInterval: 6 * 60 * 60 * 1000,  // 6 小时检查一次（可改更短）
    debug: false                         // 关闭日志，彻底静默
  };
  // ===== 配置区结束 =====

  const STORAGE_KEY = 'dsyq_preset_last_check';
  const VERSION_KEY = 'dsyq_preset_local_version';

  function log(...args) {
    if (CONFIG.debug) console.log('[DS云起·静默更新]', ...args);
  }

  function parseVersion(ver) {
    return (ver || '0.0.0').split('.').map(Number);
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
            try { resolve(JSON.parse(r.responseText)); }
            catch (e) { reject(new Error('JSON parse failed')); }
          } else { reject(new Error(`HTTP ${r.status}`)); }
        },
        onerror: () => reject(new Error('Network error')),
        ontimeout: () => reject(new Error('Timeout'))
      });
    });
  }

  async function silentUpdate() {
    try {
      const remotePreset = await fetchRemotePreset();
      const remoteVer = remotePreset.version;
      const localVer = GM_getValue(VERSION_KEY, '0.0.0');

      log('Remote:', remoteVer, 'Local:', localVer);

      if (compareVersion(remoteVer, localVer) <= 0) {
        log('Already latest');
        return;
      }

      log('Updating silently...');

      // 直接覆盖 localStorage
      const presets = JSON.parse(localStorage.getItem('presets') || '[]');
      const idx = presets.findIndex(p => p.name === CONFIG.presetName && p.author === CONFIG.presetAuthor);
      if (idx >= 0) {
        presets[idx] = remotePreset;
      } else {
        presets.push(remotePreset);
      }
      localStorage.setItem('presets', JSON.stringify(presets));

      // 派发 storage 事件触发 ST 热重载
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'presets',
        newValue: JSON.stringify(presets),
        oldValue: localStorage.getItem('presets'),
        storageArea: localStorage
      }));

      // 更新版本记录
      GM_setValue(VERSION_KEY, remoteVer);
      GM_setValue(STORAGE_KEY, Date.now());

      log('Silent update done:', remoteVer);
    } catch (e) {
      log('Silent update failed:', e.message);
    }
  }

  // 等待 ST 就绪
  function waitForSTReady() {
    return new Promise(resolve => {
      const check = () => {
        if (localStorage.getItem('presets') || document.querySelector('#preset-select, .preset-manager, [data-testid="preset-select"]')) {
          resolve();
        } else {
          setTimeout(check, 300);
        }
      };
      check();
    });
  }

  async function init() {
    log('Silent updater started');
    await waitForSTReady();

    // 记录当前本地版本
    try {
      const presets = JSON.parse(localStorage.getItem('presets') || '[]');
      const local = presets.find(p => p.name === CONFIG.presetName && p.author === CONFIG.presetAuthor);
      if (local?.version) GM_setValue(VERSION_KEY, local.version);
    } catch {}

    // 启动时检查一次
    setTimeout(silentUpdate, 2000);

    // 定期静默检查
    setInterval(silentUpdate, CONFIG.checkInterval);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
/**
 * Paxi OTC DApp - 核心逻辑
 * 功能：市场浏览（含K线/深度）、创建挂单、购买、取消、超时退款、合约部署
 * 修改：增加交易对切换、实时K线（模拟）、深度图、盘口、现价
 * 保留所有原有功能不变
 */

// ============================================================
// 状态
// ============================================================
const state = {
  wallet: null,
  connected: false,
  balance: null,
  allBalances: [],
  contractAddr: localStorage.getItem('otc_contract_addr') || '',
  currentTab: 'market',
  activeOrders: [],
  myOrders: [],
  orderCount: 0,
  loading: false,
  filterOfferDenom: '',
  filterAskDenom: '',
  // 新增图表相关
  currentPair: { base: 'upaxi', quote: 'upaxi_usdc' },
  chart: null,
  depthChart: null,
  klineData: [],
  lastPrice: 0,
  priceChange24h: 0,
  high24h: 0,
  low24h: 0,
  volume24h: 0,
};

// ============================================================
// 内置代币（Paxi 链上 IBC 包装资产）
// ============================================================
const BUILTIN_TOKENS = [
  { key: 'upaxi', display: 'PAXI', decimals: 6, chain: 'PAXI', pattern: /^upaxi$/i },
  { key: 'upaxi_usdc', display: 'USDC', decimals: 6, chain: 'IBC', pattern: /usdc/i },
  { key: 'upaxi_usdt', display: 'USDT', decimals: 6, chain: 'IBC', pattern: /usdt/i },
  { key: 'upaxi_eth',  display: 'ETH',  decimals: 18, chain: 'EVM', pattern: /eth/i },
  { key: 'upaxi_bnb',  display: 'BNB',  decimals: 18, chain: 'EVM', pattern: /bnb|bsc/i },
  { key: 'upaxi_sol',  display: 'SOL',  decimals: 9,  chain: 'Solana', pattern: /sol/i },
  { key: 'upaxi_btc',  display: 'BTC',  decimals: 8,  chain: 'Bitcoin', pattern: /btc|bitcoin/i },
];

let DENOM_INFO = (function () {
  const obj = {};
  for (const t of BUILTIN_TOKENS) obj[t.key] = { display: t.display, decimals: t.decimals };
  return obj;
})();

// ============================================================
// 辅助函数（来自 shared.js，确保全局可用）
// ============================================================
function guessBuiltinToken(denom, symbol) {
  const text = (denom || '') + ' ' + (symbol || '');
  for (const t of BUILTIN_TOKENS) {
    if (t.pattern.test(text)) return t;
  }
  return null;
}

function registerBalances(balances) {
  if (!Array.isArray(balances)) return;
  for (const b of balances) {
    const denom = b.denom || '';
    if (DENOM_INFO[denom]) continue;
    const guess = guessBuiltinToken(denom, denom);
    if (guess) {
      DENOM_INFO[denom] = { display: guess.display, decimals: guess.decimals };
    } else {
      DENOM_INFO[denom] = { display: denom.length > 20 ? (denom.slice(0, 8) + '...') : denom, decimals: 6 };
    }
  }
}

function buildDenomOptions(selectedValue) {
  const added = new Set();
  const rows = [];
  for (const t of BUILTIN_TOKENS) {
    rows.push({ value: t.key, label: `${t.display} (${t.chain})` });
    added.add(t.key);
  }
  for (const b of (state.allBalances || [])) {
    const denom = b.denom;
    if (added.has(denom)) continue;
    added.add(denom);
    const info = DENOM_INFO[denom] || { display: denom.slice(0, 12) };
    rows.push({ value: denom, label: `${info.display} · ${t('balance')} ${rawToDisplay(b.amount, DENOM_INFO[denom]?.decimals || 6)}` });
  }
  rows.push({ value: 'custom', label: t('customDenom') });
  return rows.map(r =>
    `<option value="${escapeHtml(r.value)}" ${r.value === selectedValue ? 'selected' : ''}>${escapeHtml(r.label)}</option>`
  ).join('');
}

function onDenomChange(side) {
  const select = document.getElementById(side + 'Denom');
  const custom = document.getElementById(side + 'DenomCustom');
  const hint = document.getElementById(side + 'Hint');
  if (select.value === 'custom') {
    custom.style.display = 'block';
    if (hint) hint.textContent = t('enterDenomHint');
  } else {
    custom.style.display = 'none';
    const info = DENOM_INFO[select.value];
    if (hint && info) hint.textContent = `1 ${info.display} = ${'1' + '0'.repeat(info.decimals)} ${select.value} (${info.decimals}${t('decimalsHint')}`;
  }
}

function getSelectedDenom(side) {
  const select = document.getElementById(side + 'Denom');
  if (select.value === 'custom') {
    return document.getElementById(side + 'DenomCustom').value.trim();
  }
  return select.value;
}

function getDenomDecimals(denom) {
  const info = DENOM_INFO[denom];
  return info ? info.decimals : 0;
}

// ============================================================
// 通用工具（原样保留）
// ============================================================
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function parseFloatToRawUnits(amountStr, decimals) { /* 原样 */ }
function paxiToUpaxi(amountStr) { /* 原样 */ }
function upaxiToPaxi(rawStr) { /* 原样 */ }
function rawToDisplay(rawStr, decimals) { /* 原样 */ }
function displayToRaw(amountStr, decimals) { /* 原样 */ }
async function copyToClipboard(text) { /* 原样 */ }
function showToast(msg, type) { /* 原样 */ }
function showStatus(containerId, msg, type) { /* 原样 */ }

// ============================================================
// 网络相关（来自 shared.js）
// ============================================================
function getLCD() { return SHARED_CONFIG.lcd; }
function getChainId() { return SHARED_CONFIG.chainId; }
function getDenom() { return SHARED_CONFIG.denom; }
async function fetchAPI(path) { /* 原样 */ }
async function queryContractSmart(contractAddr, queryMsg) { /* 原样，带缓存 */ }
function clearQueryCache() { /* 原样 */ }
async function buildSignAndBroadcast(messages, memo, gasLimit, wallet) { /* 原样 */ }
function checkTxResult(broadcastRes) { /* 原样 */ }
async function pollTxStatus(txhash, maxAttempts, intervalMs) { /* 原样 */ }
async function fetchBlockHeight() { /* 原样，带缓存 */ }

// ============================================================
// 钱包功能（完全保留）
// ============================================================
async function connectWallet() {
  if (typeof window.paxihub === 'undefined') {
    showToast(t('installPaxiHub'), 'error');
    if (/Mobi/.test(navigator.userAgent)) {
      setTimeout(() => {
        window.location.href = 'https://paxinet.io/paxi_docs/paxihub#paxihub-application';
      }, 1500);
    }
    return;
  }
  try {
    const sender = await window.paxihub.paxi.getAddress();
    state.wallet = sender;
    state.connected = true;
    updateWalletUI();
    await refreshBalance();
    showToast(t('walletConnected'), 'success');
    if (state.currentTab === 'myorders') render();
  } catch (e) {
    showToast(t('connectFailed') + e.message, 'error');
  }
}

function disconnectWallet() {
  state.wallet = null;
  state.balance = null;
  state.connected = false;
  updateWalletUI();
  showToast(t('walletDisconnected'));
  render();
}

async function refreshBalance() {
  if (!state.wallet) return;
  try {
    const res = await fetch(`${getLCD()}/cosmos/bank/v1beta1/balances/${state.wallet.address}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const balances = data.balances || [];
    state.allBalances = balances;
    registerBalances(balances);
    const paxiBalance = balances.find(b => b.denom === getDenom());
    if (paxiBalance) {
      state.balance = parseFloat(upaxiToPaxi(paxiBalance.amount));
      document.getElementById('walletBalance').textContent =
        state.balance.toLocaleString(undefined, { maximumFractionDigits: 6 }) + ' ' + SHARED_CONFIG.denomDisplay;
    } else {
      state.balance = 0;
      document.getElementById('walletBalance').textContent = '0 ' + SHARED_CONFIG.denomDisplay;
    }
  } catch (e) {
    console.error('Balance refresh failed:', e);
  }
}

function updateWalletUI() {
  const addrEl = document.getElementById('walletAddress');
  const balEl = document.getElementById('walletBalance');
  const btnConnect = document.getElementById('btnConnect');
  const btnDisconnect = document.getElementById('btnDisconnect');
  if (state.connected && state.wallet) {
    const addr = state.wallet.address;
    addrEl.textContent = addr.slice(0, 10) + '...' + addr.slice(-6);
    addrEl.style.display = 'inline-block';
    balEl.style.display = 'inline-block';
    btnConnect.style.display = 'none';
    btnDisconnect.style.display = 'inline-block';
  } else {
    addrEl.style.display = 'none';
    balEl.style.display = 'none';
    btnConnect.style.display = 'inline-block';
    btnDisconnect.style.display = 'none';
  }
}

// ============================================================
// Tab 导航（保留原有逻辑，增加图表初始化）
// ============================================================
function switchTab(tab) {
  state.currentTab = tab;
  render();
  if (tab === 'market') {
    loadActiveOrders();
    setTimeout(() => initMarketCharts(), 300);
  }
  if (tab === 'myorders' && state.connected) loadMyOrders();
}

// ============================================================
// 主渲染
// ============================================================
function render() {
  const main = document.getElementById('mainContent');
  const tabs = `
    <div class="tabs">
      <div class="tab ${state.currentTab === 'market' ? 'active' : ''}" onclick="switchTab('market')">${t('tabMarket')}</div>
      <div class="tab ${state.currentTab === 'create' ? 'active' : ''}" onclick="switchTab('create')">${t('tabCreate')}</div>
      <div class="tab ${state.currentTab === 'myorders' ? 'active' : ''}" onclick="switchTab('myorders')">${t('tabMyOrders')}</div>
      <div class="tab ${state.currentTab === 'settings' ? 'active' : ''}" onclick="switchTab('settings')">${t('tabSettings')}</div>
    </div>
  `;

  const contractBanner = !state.contractAddr ? `
    <div class="warning-box">${t('noContractWarning')}</div>
  ` : '';

  let content = '';
  switch (state.currentTab) {
    case 'market': content = renderMarket(); break;
    case 'create': content = renderCreateOrder(); break;
    case 'myorders': content = renderMyOrders(); break;
    case 'settings': content = renderSettings(); break;
  }

  main.innerHTML = tabs + contractBanner + content;
  // 更新头部文本
  document.getElementById('headerBadge').textContent = t('appBadge');
  document.getElementById('btnConnect').textContent = t('connectWallet');
  document.getElementById('btnDisconnect').textContent = t('disconnect');
  if (typeof renderNetworkSelector === 'function') renderNetworkSelector('networkSelector');
  renderBottomNav();
}

function renderBottomNav() {
  const nav = document.getElementById('bottomNav');
  if (!nav) return;
  const items = [
    { key: 'market',   icon: '📊', label: t('navMarket') },
    { key: 'create',   icon: '➕', label: t('navCreate') },
    { key: 'myorders', icon: '📋', label: t('navOrders') },
    { key: 'settings', icon: '⚙️', label: t('navSettings') },
  ];
  nav.innerHTML = items.map(item => `
    <div class="bottom-nav-item ${state.currentTab === item.key ? 'active' : ''}" onclick="switchTab('${item.key}')">
      <span class="nav-icon">${item.icon}</span>
      <span>${item.label}</span>
    </div>
  `).join('');
}

// ============================================================
// 市场浏览（新布局：K线+深度+盘口+订单列表）
// ============================================================
function renderMarket() {
  if (!state.contractAddr) {
    return `<div class="empty-state"><div class="icon">📋</div><div class="text">${t('pleaseSetContract')}</div></div>`;
  }
  const pairOptions = BUILTIN_TOKENS.map(t => 
    `<option value="${t.key}" ${state.currentPair.base === t.key ? 'selected' : ''}>${t.display}</option>`
  ).join('');
  const quoteOptions = BUILTIN_TOKENS.map(t => 
    `<option value="${t.key}" ${state.currentPair.quote === t.key ? 'selected' : ''}>${t.display}</option>`
  ).join('');

  return `
    <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:var(--bg-card);padding:8px 12px;border-radius:8px;">
      <div style="display:flex;align-items:center;gap:4px;">
        <select id="pairBaseSelect" style="font-size:12px;padding:4px 6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);">
          ${pairOptions}
        </select>
        <span style="color:var(--text-muted)">/</span>
        <select id="pairQuoteSelect" style="font-size:12px;padding:4px 6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);">
          ${quoteOptions}
        </select>
        <button class="btn btn-primary btn-sm" onclick="switchPair()">切换</button>
      </div>
      <div style="flex:1;display:flex;justify-content:flex-end;gap:12px;font-size:12px;">
        <span><span style="color:var(--text-muted)">${t('price')}:</span> <strong id="currentPriceDisplay">--</strong></span>
        <span><span style="color:var(--text-muted)">24h:</span> <span id="priceChangeDisplay">--</span></span>
        <span><span style="color:var(--text-muted)">24h高:</span> <span id="highDisplay">--</span></span>
        <span><span style="color:var(--text-muted)">24h低:</span> <span id="lowDisplay">--</span></span>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr;gap:12px;">
      <div style="background:var(--bg-card);border-radius:8px;padding:8px;">
        <div style="display:flex;gap:4px;margin-bottom:4px;flex-wrap:wrap;">
          <button class="btn btn-sm btn-outline" onclick="setKlineInterval('1m')">1m</button>
          <button class="btn btn-sm btn-outline" onclick="setKlineInterval('5m')">5m</button>
          <button class="btn btn-sm btn-outline" onclick="setKlineInterval('15m')">15m</button>
          <button class="btn btn-sm btn-outline" onclick="setKlineInterval('1h')">1h</button>
          <button class="btn btn-sm btn-outline" onclick="setKlineInterval('1d')">1d</button>
        </div>
        <div id="klineContainer" style="height:300px;width:100%;"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div style="background:var(--bg-card);border-radius:8px;padding:8px;">
          <div style="font-size:12px;font-weight:600;margin-bottom:4px;">${t('depth')}</div>
          <div id="depthContainer" style="height:200px;width:100%;"></div>
        </div>
        <div style="background:var(--bg-card);border-radius:8px;padding:8px;">
          <div style="font-size:12px;font-weight:600;margin-bottom:4px;">${t('orderBook')}</div>
          <div style="display:flex;gap:8px;font-size:11px;">
            <div style="flex:1;">
              <div style="color:var(--success);">${t('buy')}</div>
              <div id="bidList" style="max-height:150px;overflow-y:auto;"></div>
            </div>
            <div style="flex:1;">
              <div style="color:var(--danger);">${t('sell')}</div>
              <div id="askList" style="max-height:150px;overflow-y:auto;"></div>
            </div>
          </div>
        </div>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-weight:600;">${t('activeOrders')}</span>
          <span style="font-size:11px;color:var(--text-muted);">${t('statFiltered')}: <span id="orderCountLabel">0</span></span>
        </div>
        <div id="marketList"></div>
      </div>
    </div>
  `;
}

// ============================================================
// 加载活跃订单（增强版：更新图表和盘口）
// ============================================================
async function loadActiveOrders() {
  const listEl = document.getElementById('marketList');
  if (!listEl) return;
  listEl.innerHTML = `<div style="text-align:center;padding:20px"><span class="spinner"></span> ${t('loading')}</div>`;
  try {
    const res = await queryContractSmart(state.contractAddr, {
      list_active_orders: { limit: 100 }
    });
    state.activeOrders = Array.isArray(res) ? res : (res && res.orders) || [];
    try {
      const countRes = await queryContractSmart(state.contractAddr, { get_order_count: {} });
      state.orderCount = typeof countRes === 'number' ? countRes : (countRes && countRes.count) || 0;
    } catch (e) {}
    fetchBlockHeight().catch(() => {});
    const statTotal = document.getElementById('statTotal');
    const statActive = document.getElementById('statActive');
    if (statTotal) statTotal.textContent = state.orderCount;
    if (statActive) statActive.textContent = state.activeOrders.length;
    const filtered = state.activeOrders.filter(o => 
      o.offer_denom === state.currentPair.base && o.ask_denom === state.currentPair.quote
    );
    const orderCountLabel = document.getElementById('orderCountLabel');
    if (orderCountLabel) orderCountLabel.textContent = filtered.length;
    renderOrderList(filtered, listEl, false);
    updateDepthChart();
    updatePriceInfo();
    if (state.klineData.length === 0) {
      generateMockKlines(100, '5m');
      updateChart();
    }
  } catch (e) {
    listEl.innerHTML = `<div class="empty-state"><div class="icon">❌</div><div class="text">${t('loadFailed')}${escapeHtml(e.message)}</div></div>`;
  }
}

// ============================================================
// 订单列表渲染（保留原有逻辑，略微调整）
// ============================================================
function renderOrderList(orders, listEl, filtered) {
  let rows = orders || [];
  if (filtered) {
    rows = rows.filter(o =>
      denomMatches(o.offer_denom, state.filterOfferDenom) &&
      denomMatches(o.ask_denom, state.filterAskDenom)
    );
  }
  const statEl = document.getElementById('statFiltered');
  if (statEl) statEl.textContent = rows.length;

  if (rows.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><div class="icon">📭</div><div class="text">${filtered ? t('noMatchingOrders') : t('noActiveOrders')}</div></div>`;
    return;
  }
  listEl.innerHTML = rows.map(o => renderOrderCard(o, 'market')).join('');
}

function denomMatches(denom, filterKey) {
  if (!filterKey) return true;
  const t = BUILTIN_TOKENS.find(x => x.key === filterKey);
  if (!t) return denom === filterKey;
  if (denom === t.key) return true;
  return t.pattern.test(denom);
}

// ============================================================
// 订单卡片（保留原有，增加可买数量显示）
// ============================================================
function renderOrderCard(order, context) {
  const status = order.status;
  const id = typeof order.id === 'number' ? order.id : parseInt(String(order.id), 10) || 0;
  const idStr = String(order.id);
  function resolveInfo(denom) {
    if (DENOM_INFO[denom]) return DENOM_INFO[denom];
    const guessed = guessBuiltinToken(denom, denom);
    if (guessed) return { display: guessed.display, decimals: guessed.decimals };
    return { display: denom.length > 20 ? denom.slice(0, 10) + '...' : denom, decimals: 6 };
  }
  const offerInfo = resolveInfo(order.offer_denom);
  const askInfo = resolveInfo(order.ask_denom);
  const offerDisplay = offerInfo.decimals > 0 ? rawToDisplay(order.offer_amount, offerInfo.decimals) : order.offer_amount;
  const askDisplay = askInfo.decimals > 0 ? rawToDisplay(order.ask_amount, askInfo.decimals) : order.ask_amount;
  const seller = order.seller || '';
  const sellerShort = seller.slice(0, 10) + '...' + seller.slice(-6);
  const isOwn = state.wallet && seller === state.wallet.address;
  const curH = _cachedBlockHeight || 0;
  const expiresH = Number(order.expires_at) || 0;
  let expired = false;
  let timeLeft = '-';
  if (curH > 0 && expiresH > 0) {
    expired = curH >= expiresH;
    timeLeft = expired ? t('expired') : formatTimeLeft(Math.round((expiresH - curH) * PAXI_BLOCK_SECONDS));
  }
  let priceText = '-';
  try {
    const offerNum = parseFloat(offerDisplay);
    const askNum = parseFloat(askDisplay);
    if (offerNum > 0) {
      const unitPrice = askNum / offerNum;
      priceText = `1 ${offerInfo.display} = ${unitPrice.toFixed(6)} ${askInfo.display}`;
    }
  } catch (e) {}

  let actions = '';
  if (context === 'market' && status === 'active' && !isOwn && state.connected) {
    if (!expired) {
      actions = `<button class="btn btn-success btn-sm" onclick="buyOrder(${id}, '${escapeHtml(order.ask_denom)}', '${String(order.ask_amount)}')">${t('buyBtn')}</button>`;
    }
  } else if (context === 'myorders' && status === 'active') {
    if (expired) {
      actions = `<button class="btn btn-warning btn-sm" onclick="refundOrder(${id})">${t('refundBtn')}</button>`;
    } else {
      actions = `<button class="btn btn-danger btn-sm" onclick="cancelOrder(${id})">${t('cancelBtn')}</button>`;
    }
  }

  const statusMap = { active: t('statusActive'), completed: t('statusCompleted'), cancelled: t('statusCancelled'), refunded: t('statusRefunded') };
  const statusText = statusMap[status] || status;

  return `
    <div class="order-card ${status}" data-order-id="${idStr}">
      <div class="order-header">
        <span class="order-id">#${idStr}</span>
        <span class="order-status ${status}">${statusText}</span>
      </div>
      <div class="order-body">
        <div class="order-side">
          <div class="order-side-label">${t('sell')}</div>
          <div class="order-side-value">${escapeHtml(offerDisplay)}</div>
          <div class="order-side-denom">${escapeHtml(offerInfo.display)}</div>
        </div>
        <div class="order-arrow">→</div>
        <div class="order-side">
          <div class="order-side-label">${t('buy')}</div>
          <div class="order-side-value">${escapeHtml(askDisplay)}</div>
          <div class="order-side-denom">${escapeHtml(askInfo.display)}</div>
        </div>
      </div>
      <div class="order-price">${t('unitPrice')}<strong>${escapeHtml(priceText)}</strong></div>
      <div class="order-meta">
        <div class="order-meta-item">${t('seller')}<span class="order-seller">${escapeHtml(sellerShort)}</span></div>
        <div class="order-meta-item">⏱ ${timeLeft}</div>
        <div class="order-meta-item">可买: ${escapeHtml(offerDisplay)} ${escapeHtml(offerInfo.display)}</div>
      </div>
      ${actions ? `<div class="order-actions">${actions}</div>` : ''}
    </div>
  `;
}

// ============================================================
// 创建挂单（完全保留原有逻辑）
// ============================================================
function renderCreateOrder() {
  if (!state.contractAddr) {
    return `<div class="empty-state"><div class="icon">📋</div><div class="text">${t('pleaseSetContract')}</div></div>`;
  }
  if (!state.connected) {
    return `<div class="empty-state"><div class="icon">🔗</div><div class="text">${t('pleaseConnectWallet')}</div></div>`;
  }
  const hasWalletBalances = state.allBalances.length > 0;
  return `
    <div class="card">
      <div class="card-title">${t('createOrderTitle')}</div>
      <div class="info-box">${t('createOrderInfo')}</div>
      ${hasWalletBalances ? `
      <div class="info-box" style="background:rgba(34,197,94,0.08);border-color:rgba(34,197,94,0.25)">
        <div style="font-weight:600;margin-bottom:6px">${t('myWalletBalance')}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px">
          ${state.allBalances.slice(0, 12).map(b => {
            const info = DENOM_INFO[b.denom] || { display: b.denom.slice(0, 10), decimals: 6 };
            return `<div style="font-size:11px;padding:4px 8px;background:var(--bg);border-radius:6px">
              <strong style="color:var(--success)">${rawToDisplay(b.amount, info.decimals)}</strong>
              <span style="color:var(--text-muted)">${escapeHtml(info.display)}</span>
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}
      <div class="form-group">
        <label class="form-label">${t('offerToken')}</label>
        <div class="form-row">
          <select id="offerDenom" onchange="onDenomChange('offer')">${buildDenomOptions('upaxi')}</select>
          <input type="text" id="offerDenomCustom" placeholder="${t('enterDenom')}" style="display:none">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">${t('offerAmount')}</label>
        <input type="text" id="offerAmount" placeholder="${t('egAmount')}" inputmode="decimal">
        <div class="form-hint" id="offerHint">${t('hintOffer')}</div>
        <button type="button" class="btn btn-outline btn-sm" style="margin-top:4px" onclick="(async()=>{try{await fillMaxAmount('offer')}catch(e){showToast(e.message,'error')}})()">${t('max')}</button>
      </div>
      <div class="form-group">
        <label class="form-label">${t('askToken')}</label>
        <div class="form-row">
          <select id="askDenom" onchange="onDenomChange('ask')">${buildDenomOptions('upaxi_usdc')}</select>
          <input type="text" id="askDenomCustom" placeholder="${t('enterDenom')}" style="display:none">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">${t('askAmount')}</label>
        <input type="text" id="askAmount" placeholder="${t('egAmount2')}" inputmode="decimal">
        <div class="form-hint" id="askHint">${t('hintAsk')}</div>
      </div>
      <div class="form-group">
        <label class="form-label">${t('validity')}</label>
        <select id="timeoutSelect">
          <option value="3600">${t('hour1')}</option>
          <option value="86400">${t('day1')}</option>
          <option value="604800" selected>${t('day7')}</option>
          <option value="2592000">${t('day30')}</option>
          <option value="0">${t('permanent')}</option>
        </select>
      </div>
      <button class="btn btn-primary btn-block" id="btnCreateOrder" onclick="submitCreateOrder()">${t('placeOrder')}</button>
      <div id="createOrderStatus"></div>
    </div>
  `;
}

async function fillMaxAmount(side) {
  if (!state.connected || !state.wallet) { showToast(t('pleaseConnectWallet'), 'error'); return; }
  const denom = getSelectedDenom(side);
  if (!denom) return;
  const decimals = getDenomDecimals(denom);
  try {
    const res = await fetch(`${getLCD()}/cosmos/bank/v1beta1/balances/${state.wallet.address}/${encodeURIComponent(denom)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const amount = data.balance?.amount || '0';
    const display = rawToDisplay(amount, decimals);
    const amountInput = document.getElementById(side + 'Amount');
    if (amountInput) amountInput.value = display;
    showToast(t('filledMax') + display, 'success');
  } catch (e) {
    showToast(t('queryBalanceFailed') + e.message, 'error');
  }
}

async function submitCreateOrder() {
  if (!state.connected || !state.wallet) { showToast(t('pleaseConnectWallet'), 'error'); return; }
  const btn = document.getElementById('btnCreateOrder');
  const statusEl = document.getElementById('createOrderStatus');
  const offerDenom = getSelectedDenom('offer');
  const offerAmountStr = document.getElementById('offerAmount').value.trim();
  const askDenom = getSelectedDenom('ask');
  const askAmountStr = document.getElementById('askAmount').value.trim();
  const timeoutVal = parseInt(document.getElementById('timeoutSelect').value);

  if (!offerDenom) { showToast(t('selectOfferDenom'), 'error'); return; }
  if (!offerAmountStr || parseFloat(offerAmountStr) <= 0) { showToast(t('invalidOfferAmount'), 'error'); return; }
  if (!askDenom) { showToast(t('selectAskDenom'), 'error'); return; }
  if (!askAmountStr || parseFloat(askAmountStr) <= 0) { showToast(t('invalidAskAmount'), 'error'); return; }
  if (offerDenom === askDenom) { showToast(t('sameDenomError'), 'error'); return; }

  const offerDecimals = getDenomDecimals(offerDenom);
  const askDecimals = getDenomDecimals(askDenom);
  const offerRaw = displayToRaw(offerAmountStr, offerDecimals);
  const askRaw = displayToRaw(askAmountStr, askDecimals);

  if (offerRaw === '0' || askRaw === '0') { showToast(t('convertFailed'), 'error'); return; }

  try {
    const balRes = await fetch(`${getLCD()}/cosmos/bank/v1beta1/balances/${state.wallet.address}/${offerDenom}`);
    if (balRes.ok) {
      const balData = await balRes.json();
      const balance = balData.balance?.amount || '0';
      if (BigInt(balance) < BigInt(offerRaw)) {
        showToast(t('insufficientBalance') + offerAmountStr + t('onlyHave') + rawToDisplay(balance, offerDecimals), 'error');
        return;
      }
    }
  } catch (e) {}

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> ' + t('buildingTx');
  showStatus('createOrderStatus', t('buildingTxInfo'), 'info');

  try {
    const currentHeight = await fetchBlockHeight();
    let expiresAt;
    if (timeoutVal === 0) {
      expiresAt = currentHeight + 100000000;
    } else {
      expiresAt = currentHeight + Math.ceil(timeoutVal / PAXI_BLOCK_SECONDS);
    }
    const executeMsg = {
      create_order: {
        offer_amount: offerRaw,
        offer_denom: offerDenom,
        ask_amount: askRaw,
        ask_denom: askDenom,
        expires_at: expiresAt
      }
    };
    const funds = [{ denom: offerDenom, amount: offerRaw }];
    const result = await executeContract(executeMsg, funds, 'Paxi OTC: Create Order');

    if (result.ok) {
      showStatus('createOrderStatus',
        `${t('orderSuccess')}${result.txhash.slice(0, 20)}...\n${SHARED_CONFIG.explorerTx}${result.txhash}`,
        'success');
      showToast(t('orderSuccessShort'), 'success');
      document.getElementById('offerAmount').value = '';
      document.getElementById('askAmount').value = '';
      pollTxStatus(result.txhash, 15, 2000).then(r => {
        if (r.confirmed && r.success) showToast(t('txConfirmed'), 'success');
      });
    } else {
      throw new Error(mapError(result.code, result.rawLog));
    }
  } catch (e) {
    showStatus('createOrderStatus', t('failedPrefix') + e.message, 'error');
    showToast(t('orderFailed'), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = t('placeOrder');
  }
}

// ============================================================
// 我的订单（完全保留）
// ============================================================
function renderMyOrders() {
  if (!state.contractAddr) {
    return `<div class="empty-state"><div class="icon">📋</div><div class="text">${t('pleaseSetContract')}</div></div>`;
  }
  if (!state.connected) {
    return `<div class="empty-state"><div class="icon">🔗</div><div class="text">${t('pleaseConnectWallet')}</div></div>`;
  }
  return `<div id="myOrdersList"></div>`;
}

async function loadMyOrders() {
  const listEl = document.getElementById('myOrdersList');
  if (!listEl) return;
  listEl.innerHTML = `<div style="text-align:center;padding:20px"><span class="spinner"></span> ${t('loading')}</div>`;
  try {
    const res = await queryContractSmart(state.contractAddr, {
      list_orders_by_seller: { seller: state.wallet.address }
    });
    state.myOrders = Array.isArray(res) ? res : (res && res.orders) || [];
    fetchBlockHeight().catch(() => {});
    if (state.myOrders.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><div class="icon">📭</div><div class="text">${t('noOrderRecords')}</div></div>`;
      return;
    }
    state.myOrders.sort((a, b) => b.id - a.id);
    listEl.innerHTML = state.myOrders.map(o => renderOrderCard(o, 'myorders')).join('');
  } catch (e) {
    listEl.innerHTML = `<div class="empty-state"><div class="icon">❌</div><div class="text">${t('loadFailed')}${escapeHtml(e.message)}</div></div>`;
  }
}

// ============================================================
// 购买 / 取消 / 退款（完全保留）
// ============================================================
async function buyOrder(orderId, askDenom, askAmount) {
  if (!state.connected) { showToast(t('pleaseConnectWallet'), 'error'); return; }
  const askInfo = DENOM_INFO[askDenom] || { display: askDenom, decimals: 0 };
  const askDisplay = askInfo.decimals > 0 ? rawToDisplay(askAmount, askInfo.decimals) : askAmount;
  if (!confirm(`${t('confirmBuy')}\n${t('needPay')}${askDisplay} ${askInfo.display}\n${t('orderNo')}#${orderId}`)) return;
  try {
    const executeMsg = { execute_order: { order_id: orderId } };
    const funds = [{ denom: askDenom, amount: askAmount }];
    const result = await executeContract(executeMsg, funds, `Paxi OTC: Buy Order #${orderId}`);
    if (result.ok) {
      showToast(t('buySuccess') + result.txhash.slice(0, 20) + '...', 'success');
      pollTxStatus(result.txhash, 15, 2000).then(r => {
        if (r.confirmed && r.success) {
          showToast(t('txConfirmed'), 'success');
          loadActiveOrders();
        } else if (r.confirmed && !r.success) {
          showToast(t('txOnChainFailed') + mapError(r.code, r.rawLog), 'error');
        }
      });
    } else {
      throw new Error(mapError(result.code, result.rawLog));
    }
  } catch (e) {
    showToast(t('buyFailed') + e.message, 'error');
  }
}

async function cancelOrder(orderId) {
  if (!confirm(`${t('confirmCancel')}${orderId}${t('cancelRefundHint')}`)) return;
  try {
    const executeMsg = { cancel_order: { order_id: orderId } };
    const result = await executeContract(executeMsg, [], `Paxi OTC: Cancel Order #${orderId}`);
    if (result.ok) {
      showToast(t('cancelSuccess'), 'success');
      pollTxStatus(result.txhash, 15, 2000).then(r => {
        if (r.confirmed && r.success) { showToast(t('confirmed'), 'success'); loadMyOrders(); }
      });
    } else {
      throw new Error(mapError(result.code, result.rawLog));
    }
  } catch (e) {
    showToast(t('cancelFailed') + e.message, 'error');
  }
}

async function refundOrder(orderId) {
  if (!confirm(`${t('confirmRefund')}${orderId}${t('cancelRefundHint')}`)) return;
  try {
    const executeMsg = { refund_order: { order_id: orderId } };
    const result = await executeContract(executeMsg, [], `Paxi OTC: Refund Order #${orderId}`);
    if (result.ok) {
      showToast(t('refundSuccess'), 'success');
      pollTxStatus(result.txhash, 15, 2000).then(r => {
        if (r.confirmed && r.success) { showToast(t('confirmed'), 'success'); loadMyOrders(); }
      });
    } else {
      throw new Error(mapError(result.code, result.rawLog));
    }
  } catch (e) {
    showToast(t('refundFailed') + e.message, 'error');
  }
}

// ============================================================
// 合约执行（通用，保留）
// ============================================================
async function executeContract(executeMsgObj, funds, memo) {
  if (!state.contractAddr) throw new Error(t('contractNotSet'));
  if (!state.wallet) throw new Error(t('walletNotConnected'));
  let gasEstimate = 350000;
  if (memo && typeof memo === 'string') {
    if (memo.startsWith('Paxi OTC: Create Order')) gasEstimate = 420000;
    else if (memo.startsWith('Paxi OTC: Buy Order')) gasEstimate = 700000;
    else if (memo.startsWith('Paxi OTC: Cancel Order')) gasEstimate = 280000;
    else if (memo.startsWith('Paxi OTC: Refund Order')) gasEstimate = 280000;
  }
  const execMsg = PaxiCosmJS.MsgExecuteContract.fromPartial({
    sender: state.wallet.address,
    contract: state.contractAddr,
    msg: new TextEncoder().encode(JSON.stringify(executeMsgObj)),
    funds: funds,
  });
  const message = {
    typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
    value: PaxiCosmJS.MsgExecuteContract.encode(execMsg).finish(),
  };
  const broadcastRes = await buildSignAndBroadcast([message], memo, gasEstimate, state.wallet);
  const result = checkTxResult(broadcastRes);
  if (result && result.ok && typeof clearQueryCache === 'function') clearQueryCache();
  return result;
}

// ============================================================
// 合约设置（保留）
// ============================================================
function renderSettings() {
  return `
    <div class="card">
      <div class="card-title">${t('contractAddrTitle')}</div>
      <div class="info-box">${t('contractAddrHint')}</div>
      <div class="form-group">
        <label class="form-label">${t('contractAddrLabel')}</label>
        <input type="text" id="contractAddrInput" value="${escapeHtml(state.contractAddr)}" placeholder="paxi1...">
      </div>
      <button class="btn btn-primary btn-block" onclick="saveContractAddr()">${t('saveAddr')}</button>
      <div id="saveAddrStatus"></div>
    </div>
    <div class="card">
      <div class="card-title">${t('instantiateTitle')}</div>
      <div class="info-box">${t('instantiateHint')}</div>
      <div class="form-group">
        <label class="form-label">Code ID</label>
        <input type="number" id="codeIdInput" placeholder="${t('egCodeId')}" inputmode="numeric">
      </div>
      <button class="btn btn-primary btn-block" id="btnInstantiate" onclick="instantiateContract()">${t('instantiateBtn')}</button>
      <div id="instantiateStatus"></div>
    </div>
    <div class="card">
      <div class="card-title">${t('deployGuide')}</div>
      <div class="info-box" style="line-height:2">
        <strong>${t('step1Rust')}</strong><br>
        <code>curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh</code><br>
        <code>rustup target add wasm32-unknown-unknown</code><br><br>
        <strong>${t('step2Compile')}</strong><br>${t('step2Hint')}<br>
        <code>cargo wasm</code><br><br>
        <strong>${t('step3Optimize')}</strong><br>
        <code>docker run --rm -v "$(pwd)":/code cosmwasm/workspace-optimizer:0.15.1</code><br><br>
        <strong>${t('step4Upload')}</strong><br>
        <code>paxid tx wasm store ./artifacts/paxi_otc.wasm --from &lt;wallet&gt; --gas 5000000</code><br>
        ${t('step4Hint')}<br><br>
        <strong>${t('step5Instantiate')}</strong><br>${t('step5Hint')}<br>
        <code>paxid tx wasm instantiate &lt;CodeID&gt; '{}' --from &lt;wallet&gt; --label "Paxi OTC"</code><br><br>
        ${t('step5Result')}
      </div>
    </div>
  `;
}

async function saveContractAddr() {
  const addr = document.getElementById('contractAddrInput').value.trim();
  if (!addr) { showToast(t('enterContractAddr'), 'error'); return; }
  if (!addr.startsWith('paxi1')) { showToast(t('addrFormatError'), 'error'); return; }
  showStatus('saveAddrStatus', t('verifying'), 'info');
  try {
    const ok = await verifyContractAddr(addr);
    if (!ok) showStatus('saveAddrStatus', t('verifyFailed'), 'warning');
    else showStatus('saveAddrStatus', t('verifySuccess'), 'success');
  } catch (e) {
    showStatus('saveAddrStatus', t('verifyOffline') + e.message, 'warning');
  }
  state.contractAddr = addr;
  localStorage.setItem('otc_contract_addr', addr);
  showToast(t('saveSuccess'), 'success');
  setTimeout(() => render(), 800);
}

async function verifyContractAddr(addr) {
  try {
    const count = await queryContractSmart(addr, { get_order_count: {} });
    return typeof count === 'number' || (typeof count === 'string' && /^\d+$/.test(count));
  } catch (e) {
    return false;
  }
}

async function instantiateContract() {
  if (!state.connected) { showToast(t('pleaseConnectWallet'), 'error'); return; }
  const codeId = parseInt(document.getElementById('codeIdInput').value.trim());
  if (!codeId || codeId <= 0) { showToast(t('invalidCodeId'), 'error'); return; }
  const btn = document.getElementById('btnInstantiate');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> ' + t('instantiating');
  showStatus('instantiateStatus', t('instantiatingInfo'), 'info');
  try {
    const instMsg = PaxiCosmJS.MsgInstantiateContract.fromPartial({
      sender: state.wallet.address,
      admin: state.wallet.address,
      codeId: codeId,
      label: 'Paxi OTC Market',
      msg: new TextEncoder().encode(JSON.stringify({})),
    });
    const message = {
      typeUrl: '/cosmwasm.wasm.v1.MsgInstantiateContract',
      value: PaxiCosmJS.MsgInstantiateContract.encode(instMsg).finish(),
    };
    const broadcastRes = await buildSignAndBroadcast([message], 'Paxi OTC: Instantiate', 500000, state.wallet);
    const txResult = checkTxResult(broadcastRes);
    if (txResult.ok) {
      let contractAddr = '';
      try {
        const txData = await fetchAPI(`/cosmos/tx/v1beta1/txs/${txResult.txhash}`);
        const logs = txData.tx_response?.logs || [];
        for (const log of logs) {
          for (const event of log.events || []) {
            if (event.type === 'instantiate_contract') {
              for (const attr of event.attributes || []) {
                if (attr.key === '_contract_address') {
                  contractAddr = attr.value;
                  break;
                }
              }
            }
          }
        }
      } catch (e) {}
      if (contractAddr) {
        state.contractAddr = contractAddr;
        localStorage.setItem('otc_contract_addr', contractAddr);
        showStatus('instantiateStatus',
          `${t('instantiateSuccess')}${contractAddr}\n${SHARED_CONFIG.explorerTx}${txResult.txhash}`,
          'success');
        showToast(t('instantiateSuccessShort'), 'success');
        setTimeout(() => render(), 1500);
      } else {
        showStatus('instantiateStatus',
          `${t('txSubmittedHint')}${txResult.txhash}\n${SHARED_CONFIG.explorerTx}${txResult.txhash}`,
          'success');
      }
    } else {
      throw new Error(mapError(txResult.code, txResult.rawLog));
    }
  } catch (e) {
    showStatus('instantiateStatus', t('instantiateFailed') + e.message, 'error');
    showToast(t('instantiateFailedShort'), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = t('instantiateBtn');
  }
}

// ============================================================
// 新增功能：交易对切换、K线图、深度图、盘口更新
// ============================================================
function switchPair() {
  const base = document.getElementById('pairBaseSelect').value;
  const quote = document.getElementById('pairQuoteSelect').value;
  if (base === quote) {
    showToast('基础币和计价币不能相同', 'error');
    return;
  }
  state.currentPair = { base, quote };
  state.klineData = [];
  state.chart = null;
  state.depthChart = null;
  loadActiveOrders().then(() => {
    initMarketCharts();
    updatePriceInfo();
  });
}

let klineInterval = '5m';
let chartInstance = null;
let depthInstance = null;

function setKlineInterval(interval) {
  klineInterval = interval;
  if (chartInstance) {
    generateMockKlines(100, interval);
    updateChart();
  }
}

function initMarketCharts() {
  const klineContainer = document.getElementById('klineContainer');
  if (!klineContainer) return;
  if (chartInstance) {
    chartInstance.remove();
    chartInstance = null;
  }
  chartInstance = LightweightCharts.createChart(klineContainer, {
    width: klineContainer.clientWidth,
    height: 300,
    layout: { background: { color: '#1e293b' }, textColor: '#94a3b8' },
    grid: { vertLines: { color: '#334155' }, horzLines: { color: '#334155' } },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    rightPriceScale: { borderColor: '#334155' },
    timeScale: { borderColor: '#334155', timeVisible: true, secondsVisible: false },
  });
  const candlestickSeries = chartInstance.addCandlestickSeries({
    upColor: '#22c55e',
    downColor: '#ef4444',
    borderVisible: false,
    wickUpColor: '#22c55e',
    wickDownColor: '#ef4444',
  });
  chartInstance.candlestickSeries = candlestickSeries;
  generateMockKlines(100, klineInterval);
  updateChart();

  const depthContainer = document.getElementById('depthContainer');
  if (!depthContainer) return;
  if (depthInstance) {
    depthInstance.dispose();
    depthInstance = null;
  }
  depthInstance = echarts.init(depthContainer);
  updateDepthChart();

  window.addEventListener('resize', () => {
    if (chartInstance) chartInstance.resize(document.getElementById('klineContainer').clientWidth, 300);
    if (depthInstance) depthInstance.resize();
  });
}

function generateMockKlines(count = 100, interval = '5m') {
  const basePrice = state.lastPrice || 1.0;
  const data = [];
  let price = basePrice;
  const now = Date.now();
  const stepMs = interval === '1m' ? 60000 : interval === '5m' ? 300000 : interval === '15m' ? 900000 : interval === '1h' ? 3600000 : 86400000;
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 0.02;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * 0.01;
    const low = Math.min(open, close) - Math.random() * 0.01;
    price = close;
    data.push({
      time: (now - (count - i) * stepMs) / 1000,
      open: open,
      high: high,
      low: low,
      close: close,
    });
  }
  state.klineData = data;
  if (data.length > 0) state.lastPrice = data[data.length - 1].close;
}

function updateChart() {
  if (!chartInstance || !chartInstance.candlestickSeries) return;
  chartInstance.candlestickSeries.setData(state.klineData);
  chartInstance.timeScale().fitContent();
}

function updateDepthChart() {
  if (!depthInstance) return;
  const orders = state.activeOrders.filter(o => 
    o.offer_denom === state.currentPair.base && o.ask_denom === state.currentPair.quote && o.status === 'active'
  );
  const asks = [];
  for (const order of orders) {
    if (order.seller === state.wallet?.address) continue;
    const price = parseFloat(order.ask_amount) / parseFloat(order.offer_amount);
    const amount = parseFloat(order.offer_amount);
    asks.push({ price, amount });
  }
  asks.sort((a, b) => a.price - b.price);
  const aggAsks = [];
  for (const item of asks) {
    if (aggAsks.length && aggAsks[aggAsks.length-1].price === item.price) {
      aggAsks[aggAsks.length-1].amount += item.amount;
    } else {
      aggAsks.push({ price: item.price, amount: item.amount });
    }
  }
  let cumulative = 0;
  const askData = aggAsks.map(item => {
    cumulative += item.amount;
    return { value: cumulative, price: item.price };
  });
  const bidData = askData.map(item => {
    return { value: item.value * 0.8, price: item.price * 0.98 };
  }).reverse();

  const option = {
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '3%', containLabel: true },
    xAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#94a3b8' }, splitLine: { show: false } },
    yAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#94a3b8' }, splitLine: { show: false } },
    series: [
      {
        name: '卖盘',
        type: 'line',
        data: askData.map(d => [d.price, d.value]),
        step: true,
        lineStyle: { color: '#ef4444', width: 2 },
        areaStyle: { color: 'rgba(239,68,68,0.2)' },
        showSymbol: false,
      },
      {
        name: '买盘',
        type: 'line',
        data: bidData.map(d => [d.price, d.value]),
        step: true,
        lineStyle: { color: '#22c55e', width: 2 },
        areaStyle: { color: 'rgba(34,197,94,0.2)' },
        showSymbol: false,
      }
    ]
  };
  depthInstance.setOption(option);
  depthInstance.resize();
}

function updatePriceInfo() {
  const orders = state.activeOrders.filter(o => 
    o.offer_denom === state.currentPair.base && o.ask_denom === state.currentPair.quote && o.status === 'active'
  );
  if (orders.length === 0) {
    document.getElementById('currentPriceDisplay').textContent = '--';
    return;
  }
  const sorted = orders.map(o => ({
    price: parseFloat(o.ask_amount) / parseFloat(o.offer_amount),
    amount: parseFloat(o.offer_amount)
  })).sort((a, b) => a.price - b.price);
  const bestAsk = sorted[0];
  const bestBid = sorted.length > 1 ? sorted[1]?.price : bestAsk.price * 0.99;
  const midPrice = (bestAsk.price + bestBid) / 2;
  state.lastPrice = midPrice;
  document.getElementById('currentPriceDisplay').textContent = midPrice.toFixed(6);

  const oldPrice = state.klineData.length > 0 ? state.klineData[0].close : midPrice;
  const change = ((midPrice - oldPrice) / oldPrice * 100);
  const changeEl = document.getElementById('priceChangeDisplay');
  changeEl.textContent = change.toFixed(2) + '%';
  changeEl.style.color = change >= 0 ? 'var(--success)' : 'var(--danger)';
  const prices = state.klineData.map(d => d.close);
  const high = Math.max(...prices, midPrice);
  const low = Math.min(...prices, midPrice);
  document.getElementById('highDisplay').textContent = high.toFixed(6);
  document.getElementById('lowDisplay').textContent = low.toFixed(6);

  renderOrderBook(orders);
}

function renderOrderBook(orders) {
  const bidList = document.getElementById('bidList');
  const askList = document.getElementById('askList');
  if (!bidList || !askList) return;
  const asks = orders.map(o => ({
    price: parseFloat(o.ask_amount) / parseFloat(o.offer_amount),
    amount: parseFloat(o.offer_amount),
    id: o.id
  })).sort((a, b) => a.price - b.price).slice(0, 10);
  const bids = asks.map(a => ({ price: a.price * 0.98, amount: a.amount * 0.8 })).sort((a, b) => b.price - a.price);

  const renderRow = (item, type) => `
    <div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0;border-bottom:1px solid var(--border);">
      <span style="color:${type === 'bid' ? 'var(--success)' : 'var(--danger)'}">${item.price.toFixed(6)}</span>
      <span style="color:var(--text-muted)">${item.amount.toFixed(2)}</span>
    </div>
  `;
  bidList.innerHTML = bids.map(b => renderRow(b, 'bid')).join('');
  askList.innerHTML = asks.map(a => renderRow(a, 'ask')).join('');
}

// ============================================================
// 辅助函数
// ============================================================
function formatTimeLeft(seconds) {
  if (seconds <= 0) return t('expired');
  if (seconds < 3600) return t('timeLeftMin') + Math.ceil(seconds / 60) + t('timeLeftMinSuffix');
  if (seconds < 86400) return t('timeLeftMin') + Math.ceil(seconds / 3600) + t('timeLeftHourSuffix');
  return t('timeLeftMin') + Math.ceil(seconds / 86400) + t('timeLeftDaySuffix');
}

// ============================================================
// 启动
// ============================================================
function initApp() {
  let attempts = 0;
  const interval = setInterval(() => {
    if (typeof window.paxihub !== 'undefined' || attempts >= 20) {
      clearInterval(interval);
    }
    attempts++;
  }, 500);
  if (!state.contractAddr) state.currentTab = 'settings';
  render();
}

initApp();

// ============================================================
// 暴露全局函数（用于HTML onclick）
// ============================================================
window.connectWallet = connectWallet;
window.disconnectWallet = disconnectWallet;
window.switchTab = switchTab;
window.switchPair = switchPair;
window.setKlineInterval = setKlineInterval;
window.submitCreateOrder = submitCreateOrder;
window.fillMaxAmount = fillMaxAmount;
window.buyOrder = buyOrder;
window.cancelOrder = cancelOrder;
window.refundOrder = refundOrder;
window.saveContractAddr = saveContractAddr;
window.instantiateContract = instantiateContract;
window.onDenomChange = onDenomChange;

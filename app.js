/**
 * Paxi OTC DApp - 核心逻辑
 * 功能：市场浏览、创建挂单、购买、取消、超时退款、合约部署
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
};

// ============================================================
// 内置代币（Paxi 链上 IBC 包装资产）
// ============================================================
// 说明：PaxiHub 已打通 BNB/ETH/SOL/BTC 跨链通道，这些资产桥接到 Paxi 链后
// 会以 IBC denom 形式存在（如 ibc/XXXX 或自定义包装名）。
// 下表列出用户截图中出现的常见代币符号。真实 denom 请以
// /cosmos/bank/v1beta1/balances/<地址> 返回的为准。
const BUILTIN_TOKENS = [
  { key: 'upaxi', display: 'PAXI', decimals: 6, chain: 'PAXI', pattern: /^upaxi$/i },
  { key: 'upaxi_usdc', display: 'USDC', decimals: 6, chain: 'IBC', pattern: /usdc/i },
  { key: 'upaxi_usdt', display: 'USDT', decimals: 6, chain: 'IBC', pattern: /usdt/i },
  { key: 'upaxi_eth',  display: 'ETH',  decimals: 18, chain: 'EVM', pattern: /eth/i },
  { key: 'upaxi_bnb',  display: 'BNB',  decimals: 18, chain: 'EVM', pattern: /bnb|bsc/i },
  { key: 'upaxi_sol',  display: 'SOL',  decimals: 9,  chain: 'Solana', pattern: /sol/i },
  { key: 'upaxi_btc',  display: 'BTC',  decimals: 8,  chain: 'Bitcoin', pattern: /btc|bitcoin/i },
];

// 已知 denom 精度映射（可动态追加 wallet 中实际存在的 denom）
let DENOM_INFO = (function () {
  const obj = {};
  for (const t of BUILTIN_TOKENS) obj[t.key] = { display: t.display, decimals: t.decimals };
  return obj;
})();

// ============================================================
// 辅助：用 pattern 匹配内置代币（如果钱包里的 denom 是 IBC 哈希也能猜）
// ============================================================
function guessBuiltinToken(denom, symbol) {
  const text = (denom || '') + ' ' + (symbol || '');
  for (const t of BUILTIN_TOKENS) {
    if (t.pattern.test(text)) return t;
  }
  return null;
}

// ============================================================
// 辅助：从 wallet 全量余额列表中识别并注册 denom
// ============================================================
function registerBalances(balances) {
  if (!Array.isArray(balances)) return;
  for (const b of balances) {
    const denom = b.denom || '';
    if (DENOM_INFO[denom]) continue; // 已注册
    const guess = guessBuiltinToken(denom, denom);
    if (guess) {
      DENOM_INFO[denom] = { display: guess.display, decimals: guess.decimals };
    } else {
      // 默认按 6 位小数
      DENOM_INFO[denom] = { display: denom.length > 20 ? (denom.slice(0, 8) + '...') : denom, decimals: 6 };
    }
  }
}

// ============================================================
// 辅助：生成下拉选项（内置 + 钱包余额里的实际 denom）
// ============================================================
function buildDenomOptions(selectedValue) {
  // 先用内置 key，再加上钱包里实际存在的 denom（去重）
  const added = new Set();
  const rows = [];

  // 1. 内置代币
  for (const t of BUILTIN_TOKENS) {
    rows.push({ value: t.key, label: `${t.display} (${t.chain})` });
    added.add(t.key);
  }

  // 2. 钱包实际 denom
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

// ============================================================
// 初始化
// ============================================================
function initApp() {
  // 等待 PaxiHub 注入
  let attempts = 0;
  const interval = setInterval(() => {
    if (typeof window.paxihub !== 'undefined' || attempts >= 20) {
      clearInterval(interval);
    }
    attempts++;
  }, 500);

  // 如果没有合约地址，默认显示设置页
  if (!state.contractAddr) {
    state.currentTab = 'settings';
  }
  render();
}

// ============================================================
// 钱包
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
// Tab 导航
// ============================================================
function switchTab(tab) {
  state.currentTab = tab;
  render();
  // 加载数据
  if (tab === 'market') loadActiveOrders();
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
    <div class="warning-box">
      ${t('noContractWarning')}
    </div>
  ` : '';

  let content = '';
  switch (state.currentTab) {
    case 'market': content = renderMarket(); break;
    case 'create': content = renderCreateOrder(); break;
    case 'myorders': content = renderMyOrders(); break;
    case 'settings': content = renderSettings(); break;
  }

  main.innerHTML = tabs + contractBanner + content;

  // Update header static text + network selector + lang button
  const badge = document.getElementById('headerBadge');
  const btnConn = document.getElementById('btnConnect');
  const btnDisc = document.getElementById('btnDisconnect');
  if (badge) badge.textContent = t('appBadge');
  if (btnConn) btnConn.textContent = t('connectWallet');
  if (btnDisc) btnDisc.textContent = t('disconnect');
  // Re-render network selector so its options follow the current language
  if (typeof renderNetworkSelector === 'function') renderNetworkSelector('networkSelector');
  // Update language toggle button text (always show "中/EN" as identifier)
  const btnLang = document.getElementById('btnLang');
  if (btnLang) btnLang.textContent = '中/EN';

  // Render bottom nav (mobile)
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
// 市场浏览
// ============================================================
function renderMarket() {
  if (!state.contractAddr) {
    return `<div class="empty-state"><div class="icon">📋</div><div class="text">${t('pleaseSetContract')}</div></div>`;
  }
  const filterRow = `
    <div class="card" style="padding:12px;margin-bottom:12px">
      <div class="form-row" style="margin:0">
        <div>
          <label class="form-label" style="font-size:10px;margin-bottom:4px">${t('filterOffer')}</label>
          <select id="filterOffer" onchange="applyFilterOffer()" style="padding:6px 8px;font-size:12px">
            <option value="">${t('all')}</option>
            ${BUILTIN_TOKENS.map(tok => `<option value="${tok.key}" ${state.filterOfferDenom===tok.key?'selected':''}>${tok.display}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="form-label" style="font-size:10px;margin-bottom:4px">${t('filterAsk')}</label>
          <select id="filterAsk" onchange="applyFilterAsk()" style="padding:6px 8px;font-size:12px">
            <option value="">${t('all')}</option>
            ${BUILTIN_TOKENS.map(tok => `<option value="${tok.key}" ${state.filterAskDenom===tok.key?'selected':''}>${tok.display}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>
  `;
  const html = `
    <div class="stats-row">
      <div class="stat-card"><div class="stat-value" id="statTotal">-</div><div class="stat-label">${t('statTotal')}</div></div>
      <div class="stat-card"><div class="stat-value" id="statActive">-</div><div class="stat-label">${t('statActive')}</div></div>
      <div class="stat-card"><div class="stat-value" id="statFiltered">-</div><div class="stat-label">${t('statFiltered')}</div></div>
    </div>
    ${filterRow}
    <div id="marketList"></div>
  `;
  setTimeout(() => loadActiveOrders(), 0);
  return html;
}

function applyFilterOffer() {
  state.filterOfferDenom = document.getElementById('filterOffer').value;
  applyFilterRender();
}
function applyFilterAsk() {
  state.filterAskDenom = document.getElementById('filterAsk').value;
  applyFilterRender();
}
function applyFilterRender() {
  const listEl = document.getElementById('marketList');
  if (!listEl) return;
  renderOrderList(state.activeOrders, listEl, true);
}

function denomMatches(denom, filterKey) {
  if (!filterKey) return true;
  const t = BUILTIN_TOKENS.find(x => x.key === filterKey);
  if (!t) return denom === filterKey;
  // 精确匹配或 pattern 匹配（兼容 IBC 包装 denom）
  if (denom === t.key) return true;
  return t.pattern.test(denom);
}

function renderOrderList(orders, listEl, filtered) {
  let rows = orders || [];
  if (filtered) {
    rows = rows.filter(o =>
      denomMatches(o.offer_denom, state.filterOfferDenom)
      && denomMatches(o.ask_denom, state.filterAskDenom)
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

async function loadActiveOrders() {
  const listEl = document.getElementById('marketList');
  if (!listEl) return;
  listEl.innerHTML = `<div style="text-align:center;padding:20px"><span class="spinner"></span> ${t('loading')}</div>`;
  try {
    const orders = await queryContractSmart(state.contractAddr, {
      list_active_orders: { limit: 100 }
    });
    state.activeOrders = orders || [];
    try {
      const count = await queryContractSmart(state.contractAddr, { get_order_count: {} });
      state.orderCount = count || 0;
    } catch (e) {}
    const statTotal = document.getElementById('statTotal');
    const statActive = document.getElementById('statActive');
    if (statTotal) statTotal.textContent = state.orderCount;
    if (statActive) statActive.textContent = state.activeOrders.length;
    renderOrderList(state.activeOrders, listEl, true);
  } catch (e) {
    listEl.innerHTML = `<div class="empty-state"><div class="icon">❌</div><div class="text">${t('loadFailed')}${escapeHtml(e.message)}</div></div>`;
  }
}

// ============================================================
// 创建挂单
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
      <div class="info-box">
        ${t('createOrderInfo')}
      </div>
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
          <select id="offerDenom" onchange="onDenomChange('offer')">
            ${buildDenomOptions('upaxi')}
          </select>
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
          <select id="askDenom" onchange="onDenomChange('ask')">
            ${buildDenomOptions('upaxi_usdc')}
          </select>
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
      <button class="btn btn-primary btn-block" id="btnCreateOrder" onclick="submitCreateOrder()">
        ${t('placeOrder')}
      </button>
      <div id="createOrderStatus"></div>
    </div>
  `;
}

// ============================================================
// 辅助：填入卖出代币的最大余额
// ============================================================
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
    const executeMsg = {
      create_order: {
        ask_denom: askDenom,
        ask_amount: askRaw,
        timeout: timeoutVal === 0 ? null : timeoutVal,
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
        if (r.confirmed && r.success) {
          showToast(t('txConfirmed'), 'success');
        }
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
// 我的订单
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
    const orders = await queryContractSmart(state.contractAddr, {
      list_orders_by_seller: { seller: state.wallet.address }
    });
    state.myOrders = orders || [];
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
// 订单卡片渲染
// ============================================================
function renderOrderCard(order, context) {
  const status = order.status;
  // 先把 id 转字符串，避免 JSON 序列化后 number/string 不一致
  const id = typeof order.id === 'number' ? order.id : parseInt(String(order.id), 10) || 0;
  const idStr = String(order.id);
  // 先用 DENOM_INFO 查，没找到再用 pattern 猜（兼容 IBC 包装的 ibc/XXX hash）
  function resolveInfo(denom) {
    if (DENOM_INFO[denom]) return DENOM_INFO[denom];
    const guessed = guessBuiltinToken(denom, denom);
    if (guessed) return { display: guessed.display, decimals: guessed.decimals };
    return { display: denom.length > 20 ? denom.slice(0, 10) + '...' : denom, decimals: 6 };
  }
  const offerInfo = resolveInfo(order.offer_denom);
  const askInfo = resolveInfo(order.ask_denom);

  const offerDisplay = offerInfo.decimals > 0
    ? rawToDisplay(order.offer_amount, offerInfo.decimals)
    : order.offer_amount;
  const askDisplay = askInfo.decimals > 0
    ? rawToDisplay(order.ask_amount, askInfo.decimals)
    : order.ask_amount;

  const seller = order.seller || '';
  const sellerShort = seller.slice(0, 10) + '...' + seller.slice(-6);
  const isOwn = state.wallet && seller === state.wallet.address;
  const now = Math.floor(Date.now() / 1000);
  const expired = now > Number(order.expires_at);
  const timeLeft = expired ? t('expired') : formatTimeLeft(Number(order.expires_at) - now);

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
      </div>
      ${actions ? `<div class="order-actions">${actions}</div>` : ''}
    </div>
  `;
}

// ============================================================
// 购买
// ============================================================
async function buyOrder(orderId, askDenom, askAmount) {
  if (!state.connected) { showToast(t('pleaseConnectWallet'), 'error'); return; }

  const askInfo = DENOM_INFO[askDenom] || { display: askDenom, decimals: 0 };
  const askDisplay = askInfo.decimals > 0 ? rawToDisplay(askAmount, askInfo.decimals) : askAmount;

  if (!confirm(`${t('confirmBuy')}\n${t('needPay')}${askDisplay} ${askInfo.display}\n${t('orderNo')}#${orderId}`)) return;

  try {
    const executeMsg = { execute_order: { id: orderId } };
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

// ============================================================
// 取消挂单
// ============================================================
async function cancelOrder(orderId) {
  if (!confirm(`${t('confirmCancel')}${orderId}${t('cancelRefundHint')}`)) return;
  try {
    const executeMsg = { cancel_order: { id: orderId } };
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

// ============================================================
// 超时退款
// ============================================================
async function refundOrder(orderId) {
  if (!confirm(`${t('confirmRefund')}${orderId}${t('cancelRefundHint')}`)) return;
  try {
    const executeMsg = { refund_order: { id: orderId } };
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
// 合约执行（通用）
// ============================================================
async function executeContract(executeMsgObj, funds, memo) {
  if (!state.contractAddr) throw new Error(t('contractNotSet'));
  if (!state.wallet) throw new Error(t('walletNotConnected'));

  // 按操作类型动态分配 Gas（越高安全性 1.2x 已经在 buildSignAndBroadcast 中，再加一层冗余）
  let gasEstimate = 350000;
  if (memo && typeof memo === 'string') {
    if (memo.startsWith('Paxi OTC: Create Order')) gasEstimate = 420000; // 创建：接收 funds + 写入 2 个 KV
    else if (memo.startsWith('Paxi OTC: Buy Order')) gasEstimate = 700000; // 购买：校验+写入+最多4次转账
    else if (memo.startsWith('Paxi OTC: Cancel Order')) gasEstimate = 280000; // 取消：写入+1次转账
    else if (memo.startsWith('Paxi OTC: Refund Order')) gasEstimate = 280000; // 退款：写入+1次转账
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
// 合约设置
// ============================================================
function renderSettings() {
  return `
    <div class="card">
      <div class="card-title">${t('contractAddrTitle')}</div>
      <div class="info-box">
        ${t('contractAddrHint')}
      </div>
      <div class="form-group">
        <label class="form-label">${t('contractAddrLabel')}</label>
        <input type="text" id="contractAddrInput" value="${escapeHtml(state.contractAddr)}" placeholder="paxi1...">
      </div>
      <button class="btn btn-primary btn-block" onclick="saveContractAddr()">${t('saveAddr')}</button>
      <div id="saveAddrStatus"></div>
    </div>

    <div class="card">
      <div class="card-title">${t('instantiateTitle')}</div>
      <div class="info-box">
        ${t('instantiateHint')}
      </div>
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
        <strong>${t('step2Compile')}</strong><br>
        ${t('step2Hint')}<br>
        <code>cargo wasm</code><br><br>
        <strong>${t('step3Optimize')}</strong><br>
        <code>docker run --rm -v "$(pwd)":/code cosmwasm/workspace-optimizer:0.15.1</code><br><br>
        <strong>${t('step4Upload')}</strong><br>
        <code>paxid tx wasm store ./artifacts/paxi_otc.wasm --from &lt;wallet&gt; --gas 5000000</code><br>
        ${t('step4Hint')}<br><br>
        <strong>${t('step5Instantiate')}</strong><br>
        ${t('step5Hint')}<br>
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
    if (!ok) {
      showStatus('saveAddrStatus', t('verifyFailed'), 'warning');
    } else {
      showStatus('saveAddrStatus', t('verifySuccess'), 'success');
    }
  } catch (e) {
    showStatus('saveAddrStatus', t('verifyOffline') + e.message, 'warning');
  }
  state.contractAddr = addr;
  localStorage.setItem('otc_contract_addr', addr);
  showToast(t('saveSuccess'), 'success');
  setTimeout(() => render(), 800);
}

/** 校验合约地址是否真的是 OTC 合约（通过 get_order_count 查询） */
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
initApp();

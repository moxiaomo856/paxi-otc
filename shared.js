/**
 * Paxi OTC DApp - 公共模块
 * 包含：网络配置、交易构建/签名/广播、Gas模拟、交易轮询、错误码映射、通用工具函数
 * 基于 paxi-toolbox/shared.js 精简，去除 NFT/P2P 相关配置
 */

// ============================================================
// 网络配置（支持主网/测试网切换）
// ============================================================
const NETWORKS = {
  mainnet: {
    name: '主网',
    rpc: 'https://mainnet-rpc.paxinet.io',
    lcd: 'https://mainnet-lcd.paxinet.io',
    chainId: 'paxi-mainnet',
    denom: 'upaxi',
    denomDisplay: 'PAXI',
    sdkUrl: 'https://mainnet-api.paxinet.io/resources/js/paxi-cosmjs.umd.js',
  },
  testnet: {
    name: '测试网',
    rpc: 'https://testnet-rpc.paxinet.io',
    lcd: 'https://testnet-lcd.paxinet.io',
    chainId: 'paxi-testnet',
    denom: 'upaxi',
    denomDisplay: 'PAXI',
    sdkUrl: 'https://testnet-api.paxinet.io/resources/js/paxi-cosmjs.umd.js',
  },
};

let currentNetwork = localStorage.getItem('paxi_network') || 'mainnet';

function getNetworkConfig() {
  return NETWORKS[currentNetwork] || NETWORKS.mainnet;
}
function getLCD() { return getNetworkConfig().lcd; }
function getChainId() { return getNetworkConfig().chainId; }
function getDenom() { return getNetworkConfig().denom; }

function switchNetwork(network) {
  if (!NETWORKS[network]) return;
  currentNetwork = network;
  localStorage.setItem('paxi_network', network);
  window.location.reload();
}

const SHARED_CONFIG = {
  get denom() { return getDenom(); },
  get denomDisplay() { return getNetworkConfig().denomDisplay; },
  get lcd() { return getLCD(); },
  get chainId() { return getChainId(); },
  gasPrice: '0.05upaxi',
  gasLimit: 600000,
  explorerTx: 'https://explorer.paxinet.io/tx/',
  explorerAddr: 'https://explorer.paxinet.io/account/',
};

// ============================================================
// 通用工具函数
// ============================================================
function toBase64(bytes) {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

function fromBase64(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function parseFloatToRawUnits(amountStr, decimals) {
  if (!amountStr || typeof amountStr !== 'string') return '0';
  const str = amountStr.trim();
  if (!str || str === '.' || !/^\d+\.?\d*$/.test(str)) return '0';
  const dotIdx = str.indexOf('.');
  let intPart, decPart;
  if (dotIdx === -1) { intPart = str; decPart = ''; }
  else { intPart = str.substring(0, dotIdx) || '0'; decPart = str.substring(dotIdx + 1); }
  if (decPart.length < decimals) decPart = decPart.padEnd(decimals, '0');
  else if (decPart.length > decimals) decPart = decPart.substring(0, decimals);
  try {
    const intBig = BigInt(intPart || '0');
    const decBig = BigInt(decPart || '0');
    const multiplier = BigInt(10) ** BigInt(decimals);
    return (intBig * multiplier + decBig).toString();
  } catch (e) { return '0'; }
}

function paxiToUpaxi(amountStr) { return parseFloatToRawUnits(amountStr, 6); }

function upaxiToPaxi(rawStr) {
  if (!rawStr || typeof rawStr !== 'string') return '0';
  const padded = rawStr.padStart(7, '0');
  const intPart = padded.slice(0, -6);
  const decPart = padded.slice(-6).replace(/0+$/, '');
  return decPart ? intPart + '.' + decPart : intPart;
}

function rawToDisplay(rawStr, decimals) {
  if (!rawStr || typeof rawStr !== 'string') return '0';
  const d = decimals || 6;
  const padded = rawStr.padStart(d + 1, '0');
  const intPart = padded.slice(0, -d);
  const decPart = padded.slice(-d).replace(/0+$/, '');
  return decPart ? intPart + '.' + decPart : intPart;
}

function displayToRaw(amountStr, decimals) {
  return parseFloatToRawUnits(amountStr, decimals || 6);
}

async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try { await navigator.clipboard.writeText(text); return; } catch (e) {}
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(ta);
}

function showToast(msg, type = '') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function showStatus(containerId, msg, type) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.textContent = msg;
  el.className = 'status-msg ' + type;
  el.style.display = 'block';
}

// ============================================================
// 错误码映射
// ============================================================
const ERROR_CODE_MAP = {
  0: '成功', 5: '类型解码失败', 9: '地址无效', 11: '越界访问',
  12: '权限不足', 18: 'gas 估算失败', 19: '账户序列号不匹配',
  22: 'gas 不足', 24: '签名无效', 25: 'Gas 不足',
  27: '地址解析失败', 28: 'WASM 合约执行失败', 33: '授权不存在或已过期',
};

const ERROR_KEYWORD_MAP = [
  { pattern: /insufficient fund/i, msg: '账户余额不足' },
  { pattern: /insufficient fee/i, msg: 'Gas 费用不足' },
  { pattern: /unauthorized|not authorized|permission/i, msg: '权限不足' },
  { pattern: /account sequence mismatch/i, msg: '账户序列号不匹配，请重试' },
  { pattern: /out of gas|gas.*exhausted/i, msg: 'Gas 不足' },
  { pattern: /contract.*not found|no such contract/i, msg: '合约地址不存在' },
  { pattern: /timeout|timed out/i, msg: '网络超时' },
  { pattern: /rejected|denied|cancelled/i, msg: '用户在钱包中拒绝了交易' },
];

function mapError(code, rawLog) {
  if (code !== undefined && code !== 0 && ERROR_CODE_MAP[code])
    return `${ERROR_CODE_MAP[code]}（代码 ${code}）`;
  if (rawLog && typeof rawLog === 'string') {
    for (const { pattern, msg } of ERROR_KEYWORD_MAP) {
      if (pattern.test(rawLog)) return `${msg}（${rawLog.slice(0, 100)}）`;
    }
  }
  return rawLog ? (typeof rawLog === 'string' ? rawLog.slice(0, 200) : String(rawLog)) : '未知错误';
}

// ============================================================
// LCD 请求辅助
// ============================================================
async function fetchAPI(path) {
  const res = await fetch(`${getLCD()}${path}`);
  if (!res.ok) throw new Error(`API 请求失败: HTTP ${res.status}`);
  return res.json();
}

// ============================================================
// Gas 模拟
// ============================================================
async function simulateGas(txBytesBase64) {
  try {
    const res = await fetch(`${getLCD()}/cosmos/tx/v1beta1/simulate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx_bytes: txBytesBase64 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const gasUsed = parseInt(data.gas_info?.gas_used || data.gasUsed || '0');
    if (gasUsed > 0) return Math.ceil(gasUsed * 1.2);
  } catch (e) { console.warn('[Gas] 模拟失败:', e.message); }
  return null;
}

// ============================================================
// 交易构建 & 签名 & 广播
// ============================================================
async function buildSignAndBroadcast(messages, memo, gasLimit, wallet) {
  if (!wallet || !wallet.address) throw new Error('钱包未连接');
  const pubKey = wallet.public_key || wallet.publicKey;
  if (!pubKey) throw new Error('钱包公钥缺失');

  const accountRes = await fetch(`${getLCD()}/cosmos/auth/v1beta1/accounts/${wallet.address}`);
  if (!accountRes.ok) throw new Error(`获取账户信息失败: HTTP ${accountRes.status}`);
  const accountData = await accountRes.json();
  const account = accountData.account?.base_account || accountData.account;
  const accountNumber = Number(account.account_number);
  const sequence = Number(account.sequence);

  const chainId = getChainId();
  const denom = getDenom();

  let totalGas = gasLimit;
  if (!totalGas) {
    let gasSum = 0;
    for (const msg of messages) {
      if (msg.typeUrl?.includes('MsgSend')) gasSum += 90000;
      else if (msg.typeUrl?.includes('MsgExecuteContract')) gasSum += 300000;
      else if (msg.typeUrl?.includes('MsgInstantiateContract')) gasSum += 500000;
      else gasSum += 200000;
    }
    totalGas = gasSum + 100000;
  }

  const txBody = PaxiCosmJS.TxBody.fromPartial({ messages, memo });
  const fee = {
    amount: [PaxiCosmJS.coins(Math.floor(totalGas * 0.05).toString(), denom)[0]],
    gasLimit: BigInt(totalGas),
  };
  const pubkeyBytes = typeof pubKey === 'string' ? fromBase64(pubKey) : new Uint8Array(pubKey);
  const pubkeyAny = {
    typeUrl: '/cosmos.crypto.secp256k1.PubKey',
    value: PaxiCosmJS.PubKey.encode({ key: pubkeyBytes }).finish(),
  };
  const authInfo = PaxiCosmJS.AuthInfo.fromPartial({
    signerInfos: [{ publicKey: pubkeyAny, modeInfo: { single: { mode: 1 } }, sequence: BigInt(sequence) }],
    fee,
  });
  const signDoc = PaxiCosmJS.SignDoc.fromPartial({
    bodyBytes: PaxiCosmJS.TxBody.encode(txBody).finish(),
    authInfoBytes: PaxiCosmJS.AuthInfo.encode(authInfo).finish(),
    chainId, accountNumber: BigInt(accountNumber),
  });

  const txObj = {
    bodyBytes: toBase64(signDoc.bodyBytes),
    authInfoBytes: toBase64(signDoc.authInfoBytes),
    chainId, accountNumber: signDoc.accountNumber.toString(),
  };
  const result = await window.paxihub.paxi.signAndSendTransaction(txObj);
  if (!result || !result.success) throw new Error(result?.message || '钱包签名失败或被拒绝');

  const sigBytes = fromBase64(result.success);
  const txRaw = PaxiCosmJS.TxRaw.fromPartial({
    bodyBytes: signDoc.bodyBytes, authInfoBytes: signDoc.authInfoBytes, signatures: [sigBytes],
  });
  const txBytes = PaxiCosmJS.TxRaw.encode(txRaw).finish();
  const base64Tx = toBase64(txBytes);

  const broadcastRes = await fetch(`${getLCD()}/cosmos/tx/v1beta1/txs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tx_bytes: base64Tx, mode: 'BROADCAST_MODE_SYNC' }),
  }).then(r => r.json());

  return broadcastRes;
}

function checkTxResult(broadcastRes) {
  const tx = broadcastRes.tx_response || broadcastRes;
  return {
    ok: tx?.code === 0 && tx?.txhash,
    txhash: tx?.txhash || '',
    code: tx?.code,
    rawLog: tx?.raw_log || broadcastRes.message || '未知错误',
  };
}

async function pollTxStatus(txhash, maxAttempts = 30, intervalMs = 3000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const data = await fetchAPI(`/cosmos/tx/v1beta1/txs/${txhash}`);
      const tx = data.tx_response || data;
      if (tx && tx.height && parseInt(tx.height) > 0) {
        return { confirmed: true, success: tx.code === 0, height: tx.height, code: tx.code, rawLog: tx.raw_log || '' };
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return { confirmed: false };
}

// ============================================================
// CosmWasm 合约查询辅助
// ============================================================
// ============================================================
// 合约查询（带 5 秒内存缓存，减轻 LCD 压力 & Tab 切换不重复请求）
// ============================================================
const _queryCache = new Map();
const QUERY_CACHE_TTL_MS = 5000;

async function queryContractSmart(contractAddr, queryMsg) {
  const cacheKey = currentNetwork + '|' + contractAddr + '|' + JSON.stringify(queryMsg);
  const now = Date.now();
  const hit = _queryCache.get(cacheKey);
  if (hit && now - hit.ts < QUERY_CACHE_TTL_MS) {
    return hit.value;
  }
  const encoded = btoa(JSON.stringify(queryMsg));
  const res = await fetch(`${getLCD()}/cosmwasm/wasm/v1/contract/${contractAddr}/smart/${encoded}`);
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`合约查询失败: HTTP ${res.status} - ${errBody.slice(0, 200)}`);
  }
  const data = await res.json();
  const value = data.data;
  _queryCache.set(cacheKey, { ts: now, value });
  return value;
}

/** 手动清除查询缓存（例如成交/挂单后） */
function clearQueryCache() {
  _queryCache.clear();
}

// ============================================================
// 网络选择器 UI
// ============================================================
function renderNetworkSelector(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const lang = (typeof _lang !== 'undefined') ? _lang : 'zh';
  const mainnetLabel = lang === 'en' ? 'Mainnet' : '主网';
  const testnetLabel = lang === 'en' ? 'Testnet' : '测试网';
  el.innerHTML = `
    <select id="networkSelect" onchange="switchNetwork(this.value)" style="font-size:11px;padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text)">
      <option value="mainnet" ${currentNetwork === 'mainnet' ? 'selected' : ''}>${mainnetLabel}</option>
      <option value="testnet" ${currentNetwork === 'testnet' ? 'selected' : ''}>${testnetLabel}</option>
    </select>
  `;
}

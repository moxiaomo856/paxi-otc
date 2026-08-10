/**
 * Paxi OTC DApp - i18n 国际化
 * Support: zh-CN / en-US
 */

const I18N = {
  // ===== Header =====
  appTitle: { zh: 'Paxi OTC', en: 'Paxi OTC' },
  appBadge: { zh: '场外交易', en: 'OTC' },
  connectWallet: { zh: '连接钱包', en: 'Connect' },
  disconnect: { zh: '断开', en: 'Disconnect' },
  mainnet: { zh: '主网', en: 'Mainnet' },
  testnet: { zh: '测试网', en: 'Testnet' },

  // ===== Tabs =====
  tabMarket: { zh: '市场浏览', en: 'Market' },
  tabCreate: { zh: '创建挂单', en: 'Create' },
  tabMyOrders: { zh: '我的订单', en: 'My Orders' },
  tabSettings: { zh: '合约设置', en: 'Settings' },

  // ===== Bottom Nav (mobile) =====
  navMarket: { zh: '市场', en: 'Market' },
  navCreate: { zh: '挂单', en: 'Create' },
  navOrders: { zh: '订单', en: 'Orders' },
  navSettings: { zh: '设置', en: 'Settings' },

  // ===== Common =====
  loading: { zh: '加载中...', en: 'Loading...' },
  pleaseSetContract: { zh: '请先设置合约地址', en: 'Please set contract address first' },
  pleaseConnectWallet: { zh: '请先连接钱包', en: 'Please connect wallet first' },
  installPaxiHub: { zh: '请先安装 PaxiHub 钱包', en: 'Please install PaxiHub wallet first' },
  walletConnected: { zh: '钱包已连接', en: 'Wallet connected' },
  walletDisconnected: { zh: '钱包已断开', en: 'Wallet disconnected' },
  connectFailed: { zh: '连接钱包失败：', en: 'Failed to connect wallet: ' },
  saveSuccess: { zh: '保存成功', en: 'Saved successfully' },
  confirmed: { zh: '已确认', en: 'Confirmed' },
  txConfirmed: { zh: '交易已上链确认', en: 'Transaction confirmed on-chain' },
  customDenom: { zh: '自定义 denom...', en: 'Custom denom...' },
  balance: { zh: '余额', en: 'Balance' },

  // ===== Contract banner =====
  noContractWarning: { zh: '⚠️ 尚未设置 OTC 合约地址，请先到「合约设置」页面配置或部署合约。', en: '⚠️ OTC contract address not set. Please configure or deploy in Settings.' },

  // ===== Market =====
  filterOffer: { zh: '筛选：卖出币种', en: 'Filter: Offer' },
  filterAsk: { zh: '筛选：买入币种', en: 'Filter: Ask' },
  all: { zh: '全部', en: 'All' },
  statTotal: { zh: '总订单', en: 'Total' },
  statActive: { zh: '活跃中', en: 'Active' },
  statFiltered: { zh: '筛选后', en: 'Filtered' },
  noMatchingOrders: { zh: '没有匹配筛选条件的挂单', en: 'No orders match your filters' },
  noActiveOrders: { zh: '暂无活跃挂单', en: 'No active orders' },
  loadFailed: { zh: '加载失败：', en: 'Load failed: ' },

  // ===== Create Order =====
  createOrderTitle: { zh: '创建挂单', en: 'Create Order' },
  createOrderInfo: { zh: '支持 PAXI、USDC、USDT、ETH、BNB、SOL、BTC（Paxi 链上 IBC 包装资产）。<br>卖出代币会存入智能合约托管，买家支付后合约自动交割。', en: 'Supports PAXI, USDC, USDT, ETH, BNB, SOL, BTC (IBC-wrapped on Paxi chain).<br>Offer tokens are escrowed by the smart contract, auto-settled on buyer payment.' },
  myWalletBalance: { zh: '💼 我的钱包余额', en: '💼 My Wallet Balance' },
  offerToken: { zh: '卖出代币 (Offer)', en: 'Offer Token' },
  askToken: { zh: '买入代币 (Ask)', en: 'Ask Token' },
  enterDenom: { zh: '输入链上 denom', en: 'Enter on-chain denom' },
  offerAmount: { zh: '卖出数量', en: 'Offer Amount' },
  askAmount: { zh: '买入数量', en: 'Ask Amount' },
  egAmount: { zh: '例如：100', en: 'e.g. 100' },
  egAmount2: { zh: '例如：200', en: 'e.g. 200' },
  hintOffer: { zh: '1 PAXI = 1,000,000 upaxi（6位小数）', en: '1 PAXI = 1,000,000 upaxi (6 decimals)' },
  hintAsk: { zh: '买家需要支付此数量的代币', en: 'Buyer must pay this amount' },
  max: { zh: '最大', en: 'Max' },
  validity: { zh: '有效期', en: 'Validity' },
  hour1: { zh: '1 小时', en: '1 hour' },
  day1: { zh: '1 天', en: '1 day' },
  day7: { zh: '7 天', en: '7 days' },
  day30: { zh: '30 天', en: '30 days' },
  permanent: { zh: '永久（不超时）', en: 'Permanent (no expiry)' },
  placeOrder: { zh: '挂单', en: 'Place Order' },
  selectOfferDenom: { zh: '请选择或输入卖出代币', en: 'Please select or enter offer token' },
  invalidOfferAmount: { zh: '请输入有效的卖出数量', en: 'Please enter a valid offer amount' },
  selectAskDenom: { zh: '请选择或输入买入代币', en: 'Please select or enter ask token' },
  invalidAskAmount: { zh: '请输入有效的买入数量', en: 'Please enter a valid ask amount' },
  sameDenomError: { zh: '卖出和买入代币不能相同', en: 'Offer and ask tokens cannot be the same' },
  convertFailed: { zh: '金额转换失败', en: 'Amount conversion failed' },
  insufficientBalance: { zh: '余额不足：需要 ', en: 'Insufficient balance: need ' },
  onlyHave: { zh: '，仅有 ', en: ', have only ' },
  buildingTx: { zh: '构建交易...', en: 'Building transaction...' },
  buildingTxInfo: { zh: '正在构建交易...', en: 'Building transaction...' },
  orderSuccess: { zh: '挂单成功！交易哈希：', en: 'Order placed! TX hash: ' },
  orderSuccessShort: { zh: '挂单成功！', en: 'Order placed!' },
  orderFailed: { zh: '挂单失败', en: 'Failed to place order' },
  failedPrefix: { zh: '失败：', en: 'Failed: ' },
  filledMax: { zh: '已填入最大可用 ', en: 'Filled max available ' },
  queryBalanceFailed: { zh: '查询余额失败：', en: 'Query balance failed: ' },
  enterDenomHint: { zh: '请输入代币的最小单位 denom', en: 'Enter the smallest unit denom of the token' },
  decimalsHint: { zh: '位小数）', en: ' decimals)' },

  // ===== My Orders =====
  noOrderRecords: { zh: '你还没有挂单记录', en: 'You have no order records' },

  // ===== Order Card =====
  expired: { zh: '已过期', en: 'Expired' },
  statusActive: { zh: '活跃', en: 'Active' },
  statusCompleted: { zh: '已成交', en: 'Completed' },
  statusCancelled: { zh: '已取消', en: 'Cancelled' },
  statusRefunded: { zh: '已退款', en: 'Refunded' },
  sell: { zh: '卖出', en: 'SELL' },
  buy: { zh: '买入', en: 'BUY' },
  unitPrice: { zh: '单价：', en: 'Price: ' },
  seller: { zh: '卖家：', en: 'Seller: ' },
  buyBtn: { zh: '购买', en: 'Buy' },
  refundBtn: { zh: '超时退款', en: 'Refund' },
  cancelBtn: { zh: '取消挂单', en: 'Cancel' },
  timeLeftMin: { zh: '剩余 ', en: '' },
  timeLeftMinSuffix: { zh: ' 分钟', en: ' min left' },
  timeLeftHourSuffix: { zh: ' 小时', en: ' hours left' },
  timeLeftDaySuffix: { zh: ' 天', en: ' days left' },

  // ===== Buy =====
  confirmBuy: { zh: '确认购买？', en: 'Confirm purchase?' },
  needPay: { zh: '需要支付：', en: 'You need to pay: ' },
  orderNo: { zh: '订单编号：', en: 'Order #: ' },
  buySuccess: { zh: '购买成功！交易哈希：', en: 'Purchase successful! TX: ' },
  txOnChainFailed: { zh: '交易上链但执行失败：', en: 'TX on-chain but failed: ' },
  buyFailed: { zh: '购买失败：', en: 'Purchase failed: ' },

  // ===== Cancel =====
  confirmCancel: { zh: '确认取消挂单 #', en: 'Confirm cancel order #' },
  cancelRefundHint: { zh: '？\n卖出的代币将退回到你的钱包。', en: '?\nOffer tokens will be returned to your wallet.' },
  cancelSuccess: { zh: '取消成功！', en: 'Cancelled successfully!' },
  cancelFailed: { zh: '取消失败：', en: 'Cancel failed: ' },

  // ===== Refund =====
  confirmRefund: { zh: '确认退款挂单 #', en: 'Confirm refund order #' },
  refundSuccess: { zh: '退款成功！', en: 'Refunded successfully!' },
  refundFailed: { zh: '退款失败：', en: 'Refund failed: ' },

  // ===== Contract Execution =====
  contractNotSet: { zh: '未设置合约地址', en: 'Contract address not set' },
  walletNotConnected: { zh: '钱包未连接', en: 'Wallet not connected' },

  // ===== Settings =====
  contractAddrTitle: { zh: '合约地址设置', en: 'Contract Address' },
  contractAddrHint: { zh: '输入已部署的 OTC 合约地址。部署后请妥善保存，地址会存储在浏览器本地。', en: 'Enter the deployed OTC contract address. It will be stored in your browser locally.' },
  contractAddrLabel: { zh: 'OTC 合约地址', en: 'OTC Contract Address' },
  saveAddr: { zh: '保存地址', en: 'Save Address' },
  verifying: { zh: '正在验证合约...', en: 'Verifying contract...' },
  verifyFailed: { zh: '地址验证失败：未检测到 OTC 合约接口（get_order_count），仍然保存', en: 'Verification failed: OTC interface not detected, saved anyway' },
  verifySuccess: { zh: '合约地址已验证 ✓ 已保存', en: 'Contract verified ✓ Saved' },
  verifyOffline: { zh: '合约无法在线验证，已保存：', en: 'Cannot verify online, saved: ' },
  enterContractAddr: { zh: '请输入合约地址', en: 'Please enter contract address' },
  addrFormatError: { zh: '地址格式不正确，应以 paxi1 开头', en: 'Invalid format, address should start with paxi1' },
  instantiateTitle: { zh: '从 Code ID 实例化合约', en: 'Instantiate from Code ID' },
  instantiateHint: { zh: '如果你已上传合约代码（Store Code）并拿到了 <strong>Code ID</strong>，可以在这里直接实例化。实例化成功后，合约地址会自动填入上方。', en: 'If you have uploaded the contract code (Store Code) and got a <strong>Code ID</strong>, you can instantiate here. The contract address will auto-fill above.' },
  instantiateBtn: { zh: '实例化合约', en: 'Instantiate' },
  instantiating: { zh: '实例化中...', en: 'Instantiating...' },
  instantiatingInfo: { zh: '正在实例化合约...', en: 'Instantiating contract...' },
  instantiateSuccess: { zh: '实例化成功！合约地址：', en: 'Instantiated! Contract: ' },
  instantiateSuccessShort: { zh: '合约实例化成功！', en: 'Contract instantiated!' },
  txSubmittedHint: { zh: '交易已提交，请从区块浏览器查看合约地址。\n交易哈希：', en: 'TX submitted. Check explorer for contract address.\nTX hash: ' },
  instantiateFailed: { zh: '实例化失败：', en: 'Instantiation failed: ' },
  instantiateFailedShort: { zh: '实例化失败', en: 'Instantiation failed' },
  invalidCodeId: { zh: '请输入有效的 Code ID', en: 'Please enter a valid Code ID' },
  egCodeId: { zh: '例如：123', en: 'e.g. 123' },

  // ===== Deploy Guide =====
  deployGuide: { zh: '部署指南', en: 'Deploy Guide' },
  step1Rust: { zh: '1. 安装 Rust 工具链', en: '1. Install Rust toolchain' },
  step2Compile: { zh: '2. 编译合约', en: '2. Compile contract' },
  step2Hint: { zh: '在 <code>contract/</code> 目录执行：', en: 'Run in <code>contract/</code> directory:' },
  step3Optimize: { zh: '3. 优化合约体积', en: '3. Optimize contract size' },
  step4Upload: { zh: '4. 上传合约', en: '4. Upload contract' },
  step4Hint: { zh: '记下返回的 <strong>Code ID</strong>', en: 'Note the returned <strong>Code ID</strong>' },
  step5Instantiate: { zh: '5. 实例化合约', en: '5. Instantiate contract' },
  step5Hint: { zh: '使用上方「从 Code ID 实例化」功能，或命令行：', en: 'Use "Instantiate from Code ID" above, or CLI:' },
  step5Result: { zh: '实例化后得到的 <strong>合约地址</strong> 就是你的 OTC 市场地址。', en: 'The <strong>contract address</strong> is your OTC market address.' },

  // ===== Errors =====
  errorInvalidAmount: { zh: '数量必须大于 0', en: 'Amount must be greater than 0' },
};

// ============================================================
// Language state
// ============================================================
let _lang = localStorage.getItem('otc_lang') || 'zh';

function t(key) {
  const entry = I18N[key];
  if (!entry) return key;
  return entry[_lang] !== undefined ? entry[_lang] : entry.zh || key;
}

function getCurrentLang() { return _lang; }

function setLang(lang) {
  _lang = lang;
  localStorage.setItem('otc_lang', lang);
}

function toggleLang() {
  setLang(_lang === 'zh' ? 'en' : 'zh');
  render();
  updateLangButton();
}

function updateLangButton() {
  const btn = document.getElementById('btnLang');
  if (btn) btn.textContent = '中/EN';
}

function langLabel() {
  return _lang === 'zh' ? 'EN' : '中';
}

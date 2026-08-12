# Paxi OTC DApp

Paxi Network 上的去中心化场外交易 (OTC) 平台。支持 PAXI、USDC、USDT、ETH、BNB、SOL、BTC 等
Paxi 链上 IBC 包装资产的任意两两兑换。

---

## ⚠️ 免责声明 / Disclaimer

> **本项目仅供试验、调试、技术研究与学习用途，不得用于任何实际交易、商业用途或生产环境部署。**

### 使用限制

1. **非商业用途**：本合约及前端代码尚未经过专业第三方安全审计，不保证其正确性、安全性、完整性或适用性。严禁将本代码用于任何商业活动、真实资金交易、公开募资、金融服务等场景。

2. **试验性质**：本代码仅用于在测试环境或受控环境中验证技术可行性。任何在主网上的部署均属于开发者本人的个人测试行为，与本项目作者无关。

3. **风险提示**：智能合约涉及真实资产转移，一旦部署到区块链上即不可篡改。使用本代码可能导致：
   - 数字资产永久丢失
   - 资金被锁定无法取回
   - 被第三方恶意利用
   - 因合约漏洞造成的经济损失

4. **无担保**：本项目作者（以下简称"贡献者"）按"现状"（AS IS）提供本代码，不提供任何明示或默示的担保，包括但不限于对适销性、特定用途适用性、非侵权性的担保。

5. **责任免除**：在任何情况下，贡献者均不对因使用本代码而产生的任何直接、间接、附带、特殊、衍生或惩罚性损害承担责任，包括但不限于：
   - 资金损失
   - 业务中断
   - 利润损失
   - 数据丢失
   - 第三方索赔

6. **合规义务**：用户应自行确保其使用本代码的行为符合所在国家或地区的法律法规，包括但不限于：
   - 《中华人民共和国证券法》《防范和处置非法集资条例》等相关金融法规
   - 反洗钱（AML）与了解你的客户（KYC）相关法规
   - 跨境数据传输与外汇管制法规
   - 数字资产监管政策
   - 其他适用的地方性法规

7. **司法管辖**：本免责声明的解释与适用，以及与之相关的任何争议，均适用中华人民共和国法律（不含香港特别行政区、澳门特别行政区及台湾地区法律）。

8. **最终解释权**：贡献者保留对本免责声明的最终解释权。

### 部署即视为同意

**一旦您部署、复制、修改或以任何方式使用本代码，即视为您已阅读、理解并同意接受本免责声明的全部条款。** 如您不同意本声明的任何条款，请立即停止使用并删除本代码。

---

## 项目结构

```
paxi-otc/
├── index.html          # 前端 DApp 入口
├── app.js              # 前端核心逻辑
├── shared.js           # 网络配置、交易构建、工具函数
├── compat.js           # PaxiCosmJS 兼容层（protobuf 编码器）
├── contract/           # Rust 智能合约
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       ├── msg.rs       # 消息定义
│       ├── state.rs     # 状态存储
│       ├── error.rs     # 错误类型
│       └── contract.rs  # 核心逻辑
└── README.md
```

## 支持的代币

PaxiHub 钱包已经打通了 **Paxi、BNB、ETH、Solana、Bitcoin** 的跨链通道。在这些通道中，
用户将 BNB/ETH/SOL/BTC/USDC/USDT 从各自原链桥接到 Paxi 链后，它们会以 Paxi 链上
**原生 denom**（常见形式为 `ibc/XXXXXXXXXXXXXXXXXXXX...` 或 Paxi 官方分配的包装名）
的身份存在。

CosmWasm OTC 合约使用 Cosmos SDK `bank` 模块（`info.funds` + `BankMsg::Send`）处理资金，
天然支持 **Paxi 链上任何原生 denom**，包括：

| 代币 | 常见展示名 | 精度（decimals） | 原链 |
|------|-----------|-----------------|------|
| PAXI  | `upaxi` | 6 | Paxi |
| USDC | 通常是 IBC 包装 | 6 | (原链各异) |
| USDT | 通常是 IBC 包装 | 6 | (原链各异) |
| ETH  | 通常是 IBC 包装 | 18 | Ethereum |
| BNB  | 通常是 IBC 包装 | 18 | BNB Chain |
| SOL  | 通常是 IBC 包装 | 9  | Solana |
| BTC  | 通常是 IBC 包装 | 8  | Bitcoin |

> 💡 **用户端不用关心 denom**：连接钱包后，前端会从 `/cosmos/bank/v1beta1/balances/<地址>`
> 自动加载你钱包里**所有**代币余额，挂单时下拉框会显示这些 denom 的真实名称和余额。
> 你只需要在界面中选"ETH""BTC"等展示名即可，前端会自动转换成真实链上 denom。

### 跨链 OTC 兑换示例

如果你在 PaxiHub 里把 1 ETH 从 Ethereum 跨链到 Paxi 钱包：

1. 你会在 Paxi 钱包中看到 **余额为 1 ETH**（在 Paxi 链上以 `ibc/XXXX` denom 形式）
2. 你可以在 OTC DApp 中挂单：**卖出 1 ETH → 买入 3,000 USDC**
3. 买家支付 3,000 USDC（Paxi 链上 IBC 包装的 USDC），合约自动交割
4. 你拿到 3,000 USDC，买家拿到 1 ETH，全程都在 Paxi 链上结算
5. 如果需要把 ETH / USDC 转回原链，可通过 PaxiHub 的「转账-跨链通道」操作

## 功能

- **市场浏览**：查看所有活跃挂单，显示单价和剩余时间；支持按「卖出币种/买入币种」筛选
- **创建挂单**：卖家存入代币到智能合约托管，可一键填入最大余额，内置常见代币
- **购买（吃单）**：买家支付对应代币，合约自动交割，支持找零、误发代币原路退回
- **取消挂单**：卖家随时取消，代币立即退回（即使合约暂停也可取消）
- **超时退款**：挂单超时后，卖家可取回代币（即使合约暂停也可退款）
- **手续费分账**：支持两个手续费收款地址，按比例自动分账
- **白名单机制**：管理员可开启白名单模式，仅允许白名单地址挂单
- **合约暂停**：管理员可暂停合约（暂停期间仍允许取消/退款，保障资金安全）
- **管理员转移**：支持转移管理员权限
- **合约升级**：内置 migrate 入口，支持合约平滑升级
- **合约部署**：支持从 DApp 内直接通过 Code ID 实例化合约
- **钱包余额面板**：连接钱包后自动展示所有链上余额（PAXI/USDC/USDT/ETH/BNB/SOL/BTC...）

## 快速开始

### 1. 本地运行前端

由于 PaxiHub 钱包需要通过 HTTP 访问页面（不能直接打开 file://），需要启动一个本地服务器：

```bash
# Python 3
python -m http.server 8080

# 或 Python 2
python -m SimpleHTTPServer 8080
```

然后浏览器访问 `http://localhost:8080`

### 2. 部署智能合约

#### 2.1 安装 Rust 工具链

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown
```

#### 2.2 编译合约

```bash
cd contract
cargo wasm
```

编译产物在 `target/wasm32-unknown-unknown/release/paxi_otc.wasm`

#### 2.3 优化合约体积

```bash
docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source="$(basename "$(pwd)")_cache",target=/code/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/workspace-optimizer:0.15.1
```

优化后的文件在 `artifacts/paxi_otc.wasm`

#### 2.4 上传合约

```bash
paxid tx wasm store ./artifacts/paxi_otc.wasm \
  --from <钱包名称> \
  --gas 5000000 \
  --chain-id paxi-mainnet \
  --node https://mainnet-rpc.paxinet.io
```

记下返回的 **Code ID**。

#### 2.5 实例化合约

实例化时需要传入以下参数：

```json
{
  "admin": "paxi1...",
  "fee_rate": 100,
  "fee_address_1": "paxi1...",
  "fee_address_2": "paxi1...",
  "fee_split_ratio": 6000
}
```

| 参数 | 说明 |
|------|------|
| `admin` | 合约管理员地址 |
| `fee_rate` | 手续费比例（万分比），如 100 = 1%，范围 0-10000 |
| `fee_address_1` | 手续费收款地址 1（你的地址） |
| `fee_address_2` | 手续费收款地址 2（合伙人地址，不能与地址 1 相同） |
| `fee_split_ratio` | 地址 1 的分账比例（万分比），如 6000 = 你拿 60%，范围 0-10000 |

**方式 A：在 DApp 中实例化（推荐）**

1. 打开 DApp，连接钱包
2. 进入「合约设置」页面
3. 输入 Code ID，点击「实例化合约」
4. 实例化成功后，合约地址会自动保存

**方式 B：命令行实例化**

```bash
paxid tx wasm instantiate <CodeID> '{"admin":"paxi1...","fee_rate":100,"fee_address_1":"paxi1...","fee_address_2":"paxi1...","fee_split_ratio":6000}' \
  --from <钱包名称> \
  --label "Paxi OTC Market" \
  --gas 500000 \
  --chain-id paxi-mainnet \
  --node https://mainnet-rpc.paxinet.io
```

实例化后得到的合约地址就是你的 OTC 市场地址。

### 3. 使用 DApp

1. 在「合约设置」页面输入合约地址（或通过 Code ID 实例化后自动填入）
2. 连接 PaxiHub 钱包
3. **创建挂单**：选择卖出代币和数量，设定买入代币和数量，确认交易
4. **购买**：在「市场浏览」中找到感兴趣的挂单，点击「购买」
5. **管理订单**：在「我的订单」中取消或退款

## 合约接口

### 执行消息 (ExecuteMsg)

#### 交易功能

| 操作 | 消息 | 附带资金 | 说明 |
|------|------|----------|------|
| 创建挂单 | `{ "create_order": { "offer_amount": "1000000", "offer_denom": "uusdc", "ask_amount": "5000000", "ask_denom": "upaxi", "expires_at": 1700000000 } }` | offer 代币 | 卖家存入代币，过期时间为 Unix 秒（距当前不得超过 90 天） |
| 购买 | `{ "execute_order": { "order_id": 1 } }` | ask 代币 | 买家付款，自动交割，多付部分自动找零 |
| 取消 | `{ "cancel_order": { "order_id": 1 } }` | 无 | 仅卖家可取消，合约暂停时也可操作 |
| 退款 | `{ "refund_order": { "order_id": 1 } }` | 无 | 仅超时后卖家可退款，合约暂停时也可操作 |

#### 管理员功能

| 操作 | 消息 | 说明 |
|------|------|------|
| 暂停合约 | `{ "pause": {} }` | 暂停期间禁止创建/执行订单，但允许取消和退款 |
| 恢复合约 | `{ "resume": {} }` | 恢复合约正常运作 |
| 修改手续费比例 | `{ "update_fee_rate": { "new_fee_rate": 50 } }` | 万分比，范围 0-10000 |
| 修改收款地址（两个） | `{ "update_fee_addresses": { "fee_address_1": "paxi1...", "fee_address_2": "paxi1..." } }` | 两个地址不能相同 |
| 仅修改收款地址 1 | `{ "update_fee_address_1": { "fee_address_1": "paxi1..." } }` | 不能与地址 2 相同 |
| 仅修改收款地址 2 | `{ "update_fee_address_2": { "fee_address_2": "paxi1..." } }` | 不能与地址 1 相同 |
| 修改分账比例 | `{ "update_fee_split": { "new_split_ratio": 5000 } }` | 地址 1 占比，万分比 |
| 转移管理员 | `{ "update_admin": { "new_admin": "paxi1..." } }` | 转移管理员权限 |
| 添加白名单 | `{ "add_to_whitelist": { "address": "paxi1..." } }` | 添加地址到白名单 |
| 移除白名单 | `{ "remove_from_whitelist": { "address": "paxi1..." } }` | 从白名单移除地址 |
| 开关白名单 | `{ "toggle_whitelist": { "enabled": true } }` | 开启/关闭白名单模式 |

### 查询消息 (QueryMsg)

| 查询 | 消息 | 返回 |
|------|------|------|
| 查询单个订单 | `{ "get_order": { "order_id": 1 } }` | Order |
| 列出所有订单 | `{ "list_orders": { "start_after": null, "limit": 50 } }` | Vec\<Order\> |
| 列出活跃订单 | `{ "list_active_orders": { "start_after": null, "limit": 100 } }` | Vec\<Order\> |
| 查询卖家订单 | `{ "list_orders_by_seller": { "seller": "paxi1...", "start_after": null, "limit": 50 } }` | Vec\<Order\> |
| 订单总数 | `{ "get_order_count": {} }` | { count: u64 } |
| 合约配置 | `{ "get_config": {} }` | ConfigResponse |
| 是否暂停 | `{ "is_paused": {} }` | { paused: bool } |
| 是否在白名单 | `{ "is_whitelisted": { "address": "paxi1..." } }` | { whitelisted: bool } |
| 手续费信息 | `{ "get_fee_info": {} }` | FeeInfoResponse |
| 白名单开关 | `{ "is_whitelist_enabled": {} }` | { enabled: bool } |

## 手续费计算

手续费按万分比收取，并按比例分给两个地址：

```
手续费总额 = 求购数量 × fee_rate / 10000
卖家所得 = 求购数量 - 手续费总额
地址 1 所得 = 手续费总额 × fee_split_ratio / 10000
地址 2 所得 = 手续费总额 - 地址 1 所得
```

示例：买家支付 5000 upaxi，fee_rate=100 (1%)，fee_split_ratio=6000 (60%)
- 手续费总额 = 50 upaxi
- 卖家所得 = 4950 upaxi
- 地址 1 所得 = 30 upaxi
- 地址 2 所得 = 20 upaxi

## 安全特性

- 所有交易由智能合约托管，无需信任第三方
- 买家多付的代币会自动找零退回
- 卖家不能购买自己的订单（防止自买自卖）
- 挂单代币和求购代币不能相同（避免无意义订单）
- 合约暂停时仍允许取消/退款，保障用户资金安全
- 两个手续费收款地址不能相同
- 过期时间使用 Unix 时间戳，最大有效期 90 天
- 卖家可随时取消活跃挂单，代币立即退回
- 挂单超时后，卖家可发起退款取回代币
- 订单 ID 自增，使用 checked_add 防止溢出
- 支持白名单模式，可限制挂单权限

## 技术栈

- **智能合约**：Rust + CosmWasm 1.5（合约版本 0.3.0）
- **前端**：原生 HTML/JS/CSS（无构建步骤）
- **钱包**：PaxiHub
- **SDK**：PaxiCosmJS + 自定义 protobuf 兼容层
- **网络**：Paxi 主网 / 测试网

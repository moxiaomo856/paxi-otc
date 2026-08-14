use cosmwasm_std::{Addr, Uint128};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::state::{Config, Order, OrderStatus};

// ----------------------------------------------------
// InstantiateMsg - 部署时传入的参数
// ----------------------------------------------------
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct InstantiateMsg {
    /// 合约管理员地址
    pub admin: String,
    /// 手续费比例（万分比），如 50 = 0.5%, 100 = 1%
    pub fee_rate: u64,
    /// 手续费收款地址 1（你的地址）
    pub fee_address_1: String,
    /// 手续费收款地址 2（合伙人地址）
    pub fee_address_2: String,
    /// 你的分账比例（万分比），如 6000 = 你拿 60%，合伙人拿 40%
    pub fee_split_ratio: u64,
}

// ----------------------------------------------------
// ExecuteMsg - 交易操作 + 管理员操作
// ----------------------------------------------------
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ExecuteMsg {
    // ---- 交易功能 ----
    /// 创建挂单
    CreateOrder {
        /// 挂单数量（你要卖多少）
        offer_amount: Uint128,
        /// 挂单代币（你要卖什么币）
        offer_denom: String,
        /// 求购数量（你想换多少）
        ask_amount: Uint128,
        /// 求购代币（你想换什么币）
        ask_denom: String,
        /// 过期区块高度
        expires_at: u64,
    },
    /// 执行订单（买家买入）
    ExecuteOrder {
        /// 订单 ID
        order_id: u64,
    },
    /// 取消挂单（仅卖家）
    CancelOrder {
        /// 订单 ID
        order_id: u64,
    },
    /// 退款（仅卖家，订单过期后可退）
    RefundOrder {
        /// 订单 ID
        order_id: u64,
    },

    // ---- 管理员功能 ----
    /// 暂停合约
    Pause {},
    /// 恢复合约
    Resume {},
    /// 修改手续费比例
    UpdateFeeRate {
        /// 新的手续费比例（万分比）
        new_fee_rate: u64,
    },
    /// 修改手续费收款地址
    UpdateFeeAddresses {
        /// 新的收款地址 1
        fee_address_1: String,
        /// 新的收款地址 2
        fee_address_2: String,
    },
    /// 修改分账比例
    UpdateFeeSplit {
        /// 新的分账比例（地址1占比，万分比）
        new_split_ratio: u64,
    },
    /// 添加白名单
    AddToWhitelist {
        /// 要添加的地址
        address: String,
    },
    /// 移除白名单
    RemoveFromWhitelist {
        /// 要移除的地址
        address: String,
    },
    /// 开关白名单功能
    ToggleWhitelist {
        /// true=开启, false=关闭
        enabled: bool,
    },
}

// ----------------------------------------------------
// QueryMsg - 查询操作
// ----------------------------------------------------
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum QueryMsg {
    /// 查询单个订单
    GetOrder {
        /// 订单 ID
        order_id: u64,
    },
    /// 列出所有订单（支持分页）
    ListOrders {
        /// 从哪个订单 ID 之后开始（可选）
        start_after: Option<u64>,
        /// 返回数量限制
        limit: Option<u32>,
    },
    /// 列出活跃订单
    ListActiveOrders {
        start_after: Option<u64>,
        limit: Option<u32>,
    },
    /// 按卖家查询订单
    ListOrdersBySeller {
        /// 卖家地址
        seller: String,
        start_after: Option<u64>,
        limit: Option<u32>,
    },
    /// 获取订单总数
    GetOrderCount {},
    /// 查询合约配置
    GetConfig {},
    /// 查询合约是否暂停
    IsPaused {},
    /// 查询地址是否在白名单
    IsWhitelisted {
        address: String,
    },
    /// 查询手续费信息
    GetFeeInfo {},
    /// 查询白名单开关状态
    IsWhitelistEnabled {},
}

// ----------------------------------------------------
// 查询响应类型
// ----------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct OrdersResponse {
    pub orders: Vec<Order>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct OrderCountResponse {
    pub count: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct ConfigResponse {
    pub admin: String,
    pub fee_rate: u64,
    pub fee_address_1: String,
    pub fee_address_2: String,
    pub fee_split_ratio: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct PausedResponse {
    pub paused: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct WhitelistedResponse {
    pub whitelisted: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct WhitelistEnabledResponse {
    pub enabled: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct FeeInfoResponse {
    pub fee_rate: u64,
    pub fee_address_1: String,
    pub fee_address_2: String,
    pub fee_split_ratio: u64,
}

impl From<&Config> for ConfigResponse {
    fn from(cfg: &Config) -> Self {
        ConfigResponse {
            admin: cfg.admin.to_string(),
            fee_rate: cfg.fee_rate,
            fee_address_1: cfg.fee_address_1.to_string(),
            fee_address_2: cfg.fee_address_2.to_string(),
            fee_split_ratio: cfg.fee_split_ratio,
        }
    }
}

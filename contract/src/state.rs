use cosmwasm_std::{Addr, Uint128};
use cw_storage_plus::{Item, Map};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// 订单基础单位：万分之一
pub const BASIS_POINTS: u64 = 10000;

/// 订单最大有效期：90 天（以秒为单位）
pub const MAX_EXPIRATION: u64 = 90 * 24 * 60 * 60;

/// 全局配置（单例）
pub const CONFIG: Item<Config> = Item::new("config");

/// 合约暂停状态
pub const PAUSED: Item<bool> = Item::new("paused");

/// 订单计数器
pub const ORDER_COUNT: Item<u64> = Item::new("order_count");

/// 订单存储 (order_id -> Order)
pub const ORDERS: Map<u64, Order> = Map::new("orders");

/// 白名单地址集合
pub const WHITELIST: Map<Addr, bool> = Map::new("whitelist");

/// 白名单开关
pub const WHITELIST_ENABLED: Item<bool> = Item::new("whitelist_enabled");

// ----------------------------------------------------
// 合约配置
// ----------------------------------------------------
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct Config {
    /// 合约管理员
    pub admin: Addr,
    /// 手续费比例（万分比），例如 100 表示 1%
    pub fee_rate: u64,
    /// 手续费收款地址 1（你的地址）
    pub fee_address_1: Addr,
    /// 手续费收款地址 2（合伙人地址）
    pub fee_address_2: Addr,
    /// 地址 1 的分账比例（万分比），例如 6000 表示你占 60%
    pub fee_split_ratio: u64,
}

// ----------------------------------------------------
// 订单状态
// ----------------------------------------------------
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum OrderStatus {
    /// 活跃中
    Active,
    /// 已完成
    Completed,
    /// 已取消
    Cancelled,
    /// 已退款
    Refunded,
}

// ----------------------------------------------------
// 订单
// ----------------------------------------------------
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct Order {
    /// 订单 ID
    pub id: u64,
    /// 卖家地址
    pub seller: Addr,
    /// 挂单数量
    pub offer_amount: Uint128,
    /// 挂单代币 denom
    pub offer_denom: String,
    /// 求购数量
    pub ask_amount: Uint128,
    /// 求购代币 denom
    pub ask_denom: String,
    /// 订单状态
    pub status: OrderStatus,
    /// 创建时间（Unix 秒）
    pub created_at: u64,
    /// 过期时间（Unix 秒）
    pub expires_at: u64,
}

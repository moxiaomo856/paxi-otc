use cosmwasm_std::{
    entry_point, to_json_binary, BankMsg, Binary, Coin, Deps, DepsMut, Env, MessageInfo,
    Order as StdOrder, Response, StdResult, Uint128,
};

use crate::error::ContractError;
use crate::msg::{
    ConfigResponse, ExecuteMsg, FeeInfoResponse, InstantiateMsg, MigrateMsg, OrderCountResponse,
    OrdersResponse, PausedResponse, QueryMsg, WhitelistEnabledResponse, WhitelistedResponse,
};
use crate::state::{
    Config, Order, OrderStatus, BASIS_POINTS, CONFIG, MAX_EXPIRATION, ORDERS, ORDER_COUNT, PAUSED,
    WHITELIST, WHITELIST_ENABLED,
};
use cw2::set_contract_version;

const CONTRACT_NAME: &str = "paxi-otc";
const CONTRACT_VERSION: &str = "0.3.0";

const DEFAULT_LIMIT: u32 = 30;
const MAX_LIMIT: u32 = 100;

// ============================================================
// INSTANTIATE — 合约初始化（部署时执行一次）
// ============================================================
#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    // 设置合约版本（cw2 标准）
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    // 校验参数
    if msg.fee_rate > BASIS_POINTS {
        return Err(ContractError::InvalidFeeRate);
    }
    if msg.fee_split_ratio > BASIS_POINTS {
        return Err(ContractError::InvalidSplitRatio);
    }

    let admin = deps.api.addr_validate(&msg.admin)?;
    let fee_address_1 = deps.api.addr_validate(&msg.fee_address_1)?;
    let fee_address_2 = deps.api.addr_validate(&msg.fee_address_2)?;

    // 两个手续费收款地址不能相同
    if fee_address_1 == fee_address_2 {
        return Err(ContractError::DuplicateFeeAddress);
    }

    // 保存配置
    let config = Config {
        admin,
        fee_rate: msg.fee_rate,
        fee_address_1,
        fee_address_2,
        fee_split_ratio: msg.fee_split_ratio,
    };
    CONFIG.save(deps.storage, &config)?;

    // 初始化状态
    PAUSED.save(deps.storage, &false)?;
    ORDER_COUNT.save(deps.storage, &0)?;
    WHITELIST_ENABLED.save(deps.storage, &false)?;

    Ok(Response::new().add_attribute("action", "instantiate"))
}

// ============================================================
// EXECUTE — 所有写操作入口
// ============================================================
#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        // -- 交易功能
        ExecuteMsg::CreateOrder {
            offer_amount,
            offer_denom,
            ask_amount,
            ask_denom,
            expires_at,
        } => execute_create_order(
            deps,
            env,
            info,
            offer_amount,
            offer_denom,
            ask_amount,
            ask_denom,
            expires_at,
        ),

        ExecuteMsg::ExecuteOrder { order_id } => {
            execute_execute_order(deps, env, info, order_id)
        }

        // cancel / refund 不受 pause 影响，确保用户随时可取回资金
        ExecuteMsg::CancelOrder { order_id } => execute_cancel_order(deps, info, order_id),

        ExecuteMsg::RefundOrder { order_id } => execute_refund_order(deps, env, info, order_id),

        // -- 管理员功能
        ExecuteMsg::Pause {} => execute_pause(deps, info),
        ExecuteMsg::Resume {} => execute_resume(deps, info),
        ExecuteMsg::UpdateFeeRate { new_fee_rate } => execute_update_fee_rate(deps, info, new_fee_rate),
        ExecuteMsg::UpdateFeeAddresses { fee_address_1, fee_address_2 } => {
            execute_update_fee_addresses(deps, info, fee_address_1, fee_address_2)
        }
        ExecuteMsg::UpdateFeeAddress1 { fee_address_1 } => {
            execute_update_fee_address_1(deps, info, fee_address_1)
        }
        ExecuteMsg::UpdateFeeAddress2 { fee_address_2 } => {
            execute_update_fee_address_2(deps, info, fee_address_2)
        }
        ExecuteMsg::UpdateFeeSplit { new_split_ratio } => {
            execute_update_fee_split(deps, info, new_split_ratio)
        }
        ExecuteMsg::UpdateAdmin { new_admin } => execute_update_admin(deps, info, new_admin),
        ExecuteMsg::AddToWhitelist { address } => execute_add_whitelist(deps, info, address),
        ExecuteMsg::RemoveFromWhitelist { address } => execute_remove_whitelist(deps, info, address),
        ExecuteMsg::ToggleWhitelist { enabled } => execute_toggle_whitelist(deps, info, enabled),
    }
}

// ============================================================
// 创建挂单
// ============================================================
#[allow(clippy::too_many_arguments)]
fn execute_create_order(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    offer_amount: Uint128,
    offer_denom: String,
    ask_amount: Uint128,
    ask_denom: String,
    expires_at: u64,
) -> Result<Response, ContractError> {
    // 检查合约是否暂停
    check_paused(deps.as_ref())?;

    // 检查白名单
    check_whitelist(deps.as_ref(), &info.sender)?;

    // 参数校验
    if offer_amount.is_zero() {
        return Err(ContractError::InvalidOfferAmount);
    }
    if ask_amount.is_zero() {
        return Err(ContractError::InvalidAskAmount);
    }
    if ask_denom.is_empty() {
        return Err(ContractError::EmptyAskDenom);
    }
    if offer_denom.is_empty() {
        return Err(ContractError::EmptyOfferDenom);
    }
    // 禁止同币种挂单（无意义订单）
    if offer_denom == ask_denom {
        return Err(ContractError::SameDenomNotAllowed);
    }

    // 过期时间使用 Unix 秒
    let now = env.block.time.seconds();
    if expires_at <= now {
        return Err(ContractError::InvalidExpiration);
    }
    if expires_at > now.saturating_add(MAX_EXPIRATION) {
        return Err(ContractError::ExpirationTooFar);
    }

    // 卖家必须发送挂单资产
    if info.funds.len() != 1 {
        return Err(ContractError::InvalidFunds);
    }
    let fund = &info.funds[0];
    if fund.denom != offer_denom || fund.amount != offer_amount {
        return Err(ContractError::InsufficientPayment {
            expected: format!("{}{}", offer_amount, offer_denom),
            actual: format!("{}{}", fund.amount, fund.denom),
        });
    }

    // 生成订单 ID（使用 checked_add 防止溢出）
    let current_count = ORDER_COUNT.load(deps.storage)?;
    let order_id = current_count
        .checked_add(1)
        .ok_or_else(|| ContractError::Std(cosmwasm_std::StdError::generic_err("订单 ID 溢出")))?;
    ORDER_COUNT.save(deps.storage, &order_id)?;

    // 创建订单
    let order = Order {
        id: order_id,
        seller: info.sender.clone(),
        offer_amount,
        offer_denom: offer_denom.clone(),
        ask_amount,
        ask_denom: ask_denom.clone(),
        status: OrderStatus::Active,
        created_at: now,
        expires_at,
    };
    ORDERS.save(deps.storage, order_id, &order)?;

    Ok(Response::new()
        .add_attribute("action", "create_order")
        .add_attribute("order_id", order_id.to_string())
        .add_attribute("seller", info.sender.to_string()))
}

// ============================================================
// 执行订单（买家买入）— 核心：含手续费分账 + 找零逻辑
// ============================================================
fn execute_execute_order(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    order_id: u64,
) -> Result<Response, ContractError> {
    check_paused(deps.as_ref())?;

    // 加载订单
    let mut order = ORDERS.load(deps.storage, order_id)?;

    // 校验订单状态
    if order.status != OrderStatus::Active {
        return Err(ContractError::OrderNotActive);
    }

    // 校验是否过期（Unix 秒）
    if order.expires_at <= env.block.time.seconds() {
        return Err(ContractError::OrderExpired);
    }

    // 禁止卖家购买自己的订单
    if order.seller == info.sender {
        return Err(ContractError::SelfTradeNotAllowed);
    }

    // 校验买家支付
    if info.funds.len() != 1 {
        return Err(ContractError::NoFunds);
    }
    let payment = &info.funds[0];
    if payment.denom != order.ask_denom {
        return Err(ContractError::DenomMismatch {
            expected: order.ask_denom.clone(),
            actual: payment.denom.clone(),
        });
    }
    // 允许超额支付，少付则报错
    if payment.amount < order.ask_amount {
        return Err(ContractError::InsufficientPayment {
            expected: format!("{}{}", order.ask_amount, order.ask_denom),
            actual: format!("{}{}", payment.amount, payment.denom),
        });
    }

    // 计算找零（多付部分原路退回）
    let change = payment.amount - order.ask_amount;

    // 加载配置
    let config = CONFIG.load(deps.storage)?;

    // ----- 计算手续费分账 -----
    let fee_total = order
        .ask_amount
        .multiply_ratio(config.fee_rate, BASIS_POINTS);

    let seller_amount = order.ask_amount - fee_total;

    // 手续费分给两个地址
    let fee_to_addr1 = fee_total.multiply_ratio(config.fee_split_ratio, BASIS_POINTS);
    let fee_to_addr2 = fee_total - fee_to_addr1;

    // 构建转账消息列表
    let mut messages = vec![];

    // 1. 将挂单资产发送给买家
    messages.push(
        BankMsg::Send {
            to_address: info.sender.to_string(),
            amount: vec![Coin {
                denom: order.offer_denom.clone(),
                amount: order.offer_amount,
            }],
        }
        .into(),
    );

    // 2. 卖家所得（扣除手续费后）发送给卖家
    if !seller_amount.is_zero() {
        messages.push(
            BankMsg::Send {
                to_address: order.seller.to_string(),
                amount: vec![Coin {
                    denom: order.ask_denom.clone(),
                    amount: seller_amount,
                }],
            }
            .into(),
        );
    }

    // 3. 手续费分给地址 1
    if !fee_to_addr1.is_zero() {
        messages.push(
            BankMsg::Send {
                to_address: config.fee_address_1.to_string(),
                amount: vec![Coin {
                    denom: order.ask_denom.clone(),
                    amount: fee_to_addr1,
                }],
            }
            .into(),
        );
    }

    // 4. 手续费分给地址 2
    if !fee_to_addr2.is_zero() {
        messages.push(
            BankMsg::Send {
                to_address: config.fee_address_2.to_string(),
                amount: vec![Coin {
                    denom: order.ask_denom.clone(),
                    amount: fee_to_addr2,
                }],
            }
            .into(),
        );
    }

    // 5. 找零退回买家
    if !change.is_zero() {
        messages.push(
            BankMsg::Send {
                to_address: info.sender.to_string(),
                amount: vec![Coin {
                    denom: order.ask_denom.clone(),
                    amount: change,
                }],
            }
            .into(),
        );
    }

    // 更新订单状态（先构建消息，最后落库）
    order.status = OrderStatus::Completed;
    ORDERS.save(deps.storage, order_id, &order)?;

    Ok(Response::new()
        .add_messages(messages)
        .add_attribute("action", "execute_order")
        .add_attribute("order_id", order_id.to_string())
        .add_attribute("buyer", info.sender.to_string())
        .add_attribute("seller", order.seller.to_string())
        .add_attribute("fee_total", fee_total.to_string())
        .add_attribute("fee_to_addr_1", fee_to_addr1.to_string())
        .add_attribute("fee_to_addr_2", fee_to_addr2.to_string())
        .add_attribute("change", change.to_string()))
}

// ============================================================
// 取消挂单（仅卖家，不受 pause 影响）
// ============================================================
fn execute_cancel_order(
    deps: DepsMut,
    info: MessageInfo,
    order_id: u64,
) -> Result<Response, ContractError> {
    let mut order = ORDERS.load(deps.storage, order_id)?;

    if order.status != OrderStatus::Active {
        return Err(ContractError::OrderNotActive);
    }

    if order.seller != info.sender {
        return Err(ContractError::OnlySellerCanCancel);
    }

    // 退还挂单资产给卖家
    let refund_msg = BankMsg::Send {
        to_address: order.seller.to_string(),
        amount: vec![Coin {
            denom: order.offer_denom.clone(),
            amount: order.offer_amount,
        }],
    };

    // 更新订单状态
    order.status = OrderStatus::Cancelled;
    ORDERS.save(deps.storage, order_id, &order)?;

    Ok(Response::new()
        .add_message(refund_msg)
        .add_attribute("action", "cancel_order")
        .add_attribute("order_id", order_id.to_string()))
}

// ============================================================
// 退款（仅卖家，订单过期后可退，不受 pause 影响）
// ============================================================
fn execute_refund_order(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    order_id: u64,
) -> Result<Response, ContractError> {
    let mut order = ORDERS.load(deps.storage, order_id)?;

    if order.status != OrderStatus::Active {
        return Err(ContractError::OrderNotActive);
    }

    if order.seller != info.sender {
        return Err(ContractError::OnlySellerCanRefund);
    }

    // 必须已过期（Unix 秒）
    if order.expires_at > env.block.time.seconds() {
        return Err(ContractError::OrderNotExpired);
    }

    // 退还挂单资产给卖家
    let refund_msg = BankMsg::Send {
        to_address: order.seller.to_string(),
        amount: vec![Coin {
            denom: order.offer_denom.clone(),
            amount: order.offer_amount,
        }],
    };

    // 更新订单状态
    order.status = OrderStatus::Refunded;
    ORDERS.save(deps.storage, order_id, &order)?;

    Ok(Response::new()
        .add_message(refund_msg)
        .add_attribute("action", "refund_order")
        .add_attribute("order_id", order_id.to_string()))
}

// ============================================================
// 管理员功能
// ============================================================

fn check_admin(deps: Deps, sender: &cosmwasm_std::Addr) -> Result<(), ContractError> {
    let config = CONFIG.load(deps.storage)?;
    if config.admin != *sender {
        return Err(ContractError::Unauthorized);
    }
    Ok(())
}

fn check_paused(deps: Deps) -> Result<(), ContractError> {
    if PAUSED.load(deps.storage)? {
        return Err(ContractError::ContractPaused);
    }
    Ok(())
}

fn check_whitelist(deps: Deps, sender: &cosmwasm_std::Addr) -> Result<(), ContractError> {
    if WHITELIST_ENABLED.load(deps.storage)? {
        let in_whitelist = WHITELIST.has(deps.storage, sender.clone());
        if !in_whitelist {
            return Err(ContractError::NotInWhitelist);
        }
    }
    Ok(())
}

fn execute_pause(deps: DepsMut, info: MessageInfo) -> Result<Response, ContractError> {
    check_admin(deps.as_ref(), &info.sender)?;
    PAUSED.save(deps.storage, &true)?;
    Ok(Response::new()
        .add_attribute("action", "pause")
        .add_attribute("paused", "true")
        .add_attribute("by", info.sender.to_string()))
}

fn execute_resume(deps: DepsMut, info: MessageInfo) -> Result<Response, ContractError> {
    check_admin(deps.as_ref(), &info.sender)?;
    PAUSED.save(deps.storage, &false)?;
    Ok(Response::new()
        .add_attribute("action", "resume")
        .add_attribute("paused", "false")
        .add_attribute("by", info.sender.to_string()))
}

fn execute_update_fee_rate(
    deps: DepsMut,
    info: MessageInfo,
    new_fee_rate: u64,
) -> Result<Response, ContractError> {
    check_admin(deps.as_ref(), &info.sender)?;
    if new_fee_rate > BASIS_POINTS {
        return Err(ContractError::InvalidFeeRate);
    }
    CONFIG.update(deps.storage, |mut c| -> StdResult<_> {
        c.fee_rate = new_fee_rate;
        Ok(c)
    })?;
    Ok(Response::new()
        .add_attribute("action", "update_fee_rate")
        .add_attribute("new_fee_rate", new_fee_rate.to_string())
        .add_attribute("by", info.sender.to_string()))
}

fn execute_update_fee_addresses(
    deps: DepsMut,
    info: MessageInfo,
    fee_address_1: String,
    fee_address_2: String,
) -> Result<Response, ContractError> {
    check_admin(deps.as_ref(), &info.sender)?;
    let addr1 = deps.api.addr_validate(&fee_address_1)?;
    let addr2 = deps.api.addr_validate(&fee_address_2)?;
    if addr1 == addr2 {
        return Err(ContractError::DuplicateFeeAddress);
    }
    CONFIG.update(deps.storage, |mut c| -> StdResult<_> {
        c.fee_address_1 = addr1.clone();
        c.fee_address_2 = addr2.clone();
        Ok(c)
    })?;
    Ok(Response::new()
        .add_attribute("action", "update_fee_addresses")
        .add_attribute("fee_address_1", addr1.to_string())
        .add_attribute("fee_address_2", addr2.to_string())
        .add_attribute("by", info.sender.to_string()))
}

fn execute_update_fee_address_1(
    deps: DepsMut,
    info: MessageInfo,
    fee_address_1: String,
) -> Result<Response, ContractError> {
    check_admin(deps.as_ref(), &info.sender)?;
    let addr1 = deps.api.addr_validate(&fee_address_1)?;
    // 不能与现有的 fee_address_2 相同
    let config = CONFIG.load(deps.storage)?;
    if addr1 == config.fee_address_2 {
        return Err(ContractError::DuplicateFeeAddress);
    }
    CONFIG.update(deps.storage, |mut c| -> StdResult<_> {
        c.fee_address_1 = addr1.clone();
        Ok(c)
    })?;
    Ok(Response::new()
        .add_attribute("action", "update_fee_address_1")
        .add_attribute("fee_address_1", addr1.to_string())
        .add_attribute("by", info.sender.to_string()))
}

fn execute_update_fee_address_2(
    deps: DepsMut,
    info: MessageInfo,
    fee_address_2: String,
) -> Result<Response, ContractError> {
    check_admin(deps.as_ref(), &info.sender)?;
    let addr2 = deps.api.addr_validate(&fee_address_2)?;
    // 不能与现有的 fee_address_1 相同
    let config = CONFIG.load(deps.storage)?;
    if addr2 == config.fee_address_1 {
        return Err(ContractError::DuplicateFeeAddress);
    }
    CONFIG.update(deps.storage, |mut c| -> StdResult<_> {
        c.fee_address_2 = addr2.clone();
        Ok(c)
    })?;
    Ok(Response::new()
        .add_attribute("action", "update_fee_address_2")
        .add_attribute("fee_address_2", addr2.to_string())
        .add_attribute("by", info.sender.to_string()))
}

fn execute_update_fee_split(
    deps: DepsMut,
    info: MessageInfo,
    new_split_ratio: u64,
) -> Result<Response, ContractError> {
    check_admin(deps.as_ref(), &info.sender)?;
    if new_split_ratio > BASIS_POINTS {
        return Err(ContractError::InvalidSplitRatio);
    }
    CONFIG.update(deps.storage, |mut c| -> StdResult<_> {
        c.fee_split_ratio = new_split_ratio;
        Ok(c)
    })?;
    Ok(Response::new()
        .add_attribute("action", "update_fee_split")
        .add_attribute("new_split_ratio", new_split_ratio.to_string())
        .add_attribute("by", info.sender.to_string()))
}

fn execute_update_admin(
    deps: DepsMut,
    info: MessageInfo,
    new_admin: String,
) -> Result<Response, ContractError> {
    check_admin(deps.as_ref(), &info.sender)?;
    let new_admin_addr = deps.api.addr_validate(&new_admin)?;
    let config = CONFIG.load(deps.storage)?;
    if new_admin_addr == config.admin {
        return Err(ContractError::SameAdminAddress);
    }
    CONFIG.update(deps.storage, |mut c| -> StdResult<_> {
        c.admin = new_admin_addr.clone();
        Ok(c)
    })?;
    Ok(Response::new()
        .add_attribute("action", "update_admin")
        .add_attribute("new_admin", new_admin_addr.to_string())
        .add_attribute("by", info.sender.to_string()))
}

fn execute_add_whitelist(
    deps: DepsMut,
    info: MessageInfo,
    address: String,
) -> Result<Response, ContractError> {
    check_admin(deps.as_ref(), &info.sender)?;
    let addr = deps.api.addr_validate(&address)?;
    if WHITELIST.has(deps.storage, addr.clone()) {
        return Err(ContractError::AlreadyWhitelisted);
    }
    WHITELIST.save(deps.storage, addr.clone(), &true)?;
    Ok(Response::new()
        .add_attribute("action", "add_to_whitelist")
        .add_attribute("address", addr.to_string())
        .add_attribute("by", info.sender.to_string()))
}

fn execute_remove_whitelist(
    deps: DepsMut,
    info: MessageInfo,
    address: String,
) -> Result<Response, ContractError> {
    check_admin(deps.as_ref(), &info.sender)?;
    let addr = deps.api.addr_validate(&address)?;
    if !WHITELIST.has(deps.storage, addr.clone()) {
        return Err(ContractError::NotWhitelisted);
    }
    WHITELIST.remove(deps.storage, addr.clone());
    Ok(Response::new()
        .add_attribute("action", "remove_from_whitelist")
        .add_attribute("address", addr.to_string())
        .add_attribute("by", info.sender.to_string()))
}

fn execute_toggle_whitelist(
    deps: DepsMut,
    info: MessageInfo,
    enabled: bool,
) -> Result<Response, ContractError> {
    check_admin(deps.as_ref(), &info.sender)?;
    WHITELIST_ENABLED.save(deps.storage, &enabled)?;
    Ok(Response::new()
        .add_attribute("action", "toggle_whitelist")
        .add_attribute("enabled", enabled.to_string())
        .add_attribute("by", info.sender.to_string()))
}

// ============================================================
// MIGRATE — 合约升级入口（仅更新版本号）
// ============================================================
#[entry_point]
pub fn migrate(deps: DepsMut, _env: Env, _msg: MigrateMsg) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;
    Ok(Response::new().add_attribute("action", "migrate"))
}

// ============================================================
// QUERY — 所有查询入口
// ============================================================
#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetOrder { order_id } => to_json_binary(&query_order(deps, order_id)?),
        QueryMsg::ListOrders { start_after, limit } => {
            to_json_binary(&query_list_orders(deps, start_after, limit)?)
        }
        QueryMsg::ListActiveOrders { start_after, limit } => {
            to_json_binary(&query_list_active_orders(deps, start_after, limit)?)
        }
        QueryMsg::ListOrdersBySeller { seller, start_after, limit } => {
            to_json_binary(&query_list_orders_by_seller(deps, seller, start_after, limit)?)
        }
        QueryMsg::GetOrderCount {} => to_json_binary(&query_order_count(deps)?),
        QueryMsg::GetConfig {} => to_json_binary(&query_config(deps)?),
        QueryMsg::IsPaused {} => to_json_binary(&query_is_paused(deps)?),
        QueryMsg::IsWhitelisted { address } => to_json_binary(&query_is_whitelisted(deps, address)?),
        QueryMsg::GetFeeInfo {} => to_json_binary(&query_fee_info(deps)?),
        QueryMsg::IsWhitelistEnabled {} => to_json_binary(&query_whitelist_enabled(deps)?),
    }
}

fn query_order(deps: Deps, order_id: u64) -> StdResult<Order> {
    ORDERS.load(deps.storage, order_id)
}

fn query_list_orders(
    deps: Deps,
    start_after: Option<u64>,
    limit: Option<u32>,
) -> StdResult<OrdersResponse> {
    let limit = limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT) as usize;
    let orders: Vec<Order> = ORDERS
        .range(
            deps.storage,
            start_after.map(|s| cosmwasm_std::Bound::exclusive(s)),
            None,
            StdOrder::Ascending,
        )
        .take(limit)
        .collect::<StdResult<Vec<_>>>()?
        .into_iter()
        .map(|(_, v)| v)
        .collect();
    Ok(OrdersResponse { orders })
}

fn query_list_active_orders(
    deps: Deps,
    start_after: Option<u64>,
    limit: Option<u32>,
) -> StdResult<OrdersResponse> {
    let limit = limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT) as usize;
    // 先按状态过滤再 take，确保返回数量正确
    let orders: Vec<Order> = ORDERS
        .range(
            deps.storage,
            start_after.map(|s| cosmwasm_std::Bound::exclusive(s)),
            None,
            StdOrder::Ascending,
        )
        .filter_map(|r| r.ok())
        .map(|(_, v)| v)
        .filter(|o| o.status == OrderStatus::Active)
        .take(limit)
        .collect();
    Ok(OrdersResponse { orders })
}

fn query_list_orders_by_seller(
    deps: Deps,
    seller: String,
    start_after: Option<u64>,
    limit: Option<u32>,
) -> StdResult<OrdersResponse> {
    let seller_addr = deps.api.addr_validate(&seller)?;
    let limit = limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT) as usize;
    // 先按卖家过滤再 take，确保返回数量正确
    let orders: Vec<Order> = ORDERS
        .range(
            deps.storage,
            start_after.map(|s| cosmwasm_std::Bound::exclusive(s)),
            None,
            StdOrder::Ascending,
        )
        .filter_map(|r| r.ok())
        .map(|(_, v)| v)
        .filter(|o| o.seller == seller_addr)
        .take(limit)
        .collect();
    Ok(OrdersResponse { orders })
}

fn query_order_count(deps: Deps) -> StdResult<OrderCountResponse> {
    let count = ORDER_COUNT.load(deps.storage)?;
    Ok(OrderCountResponse { count })
}

fn query_config(deps: Deps) -> StdResult<ConfigResponse> {
    let config = CONFIG.load(deps.storage)?;
    Ok(ConfigResponse::from(&config))
}

fn query_is_paused(deps: Deps) -> StdResult<PausedResponse> {
    let paused = PAUSED.load(deps.storage)?;
    Ok(PausedResponse { paused })
}

fn query_is_whitelisted(deps: Deps, address: String) -> StdResult<WhitelistedResponse> {
    let addr = deps.api.addr_validate(&address)?;
    let whitelisted = WHITELIST.has(deps.storage, addr);
    Ok(WhitelistedResponse { whitelisted })
}

fn query_whitelist_enabled(deps: Deps) -> StdResult<WhitelistEnabledResponse> {
    let enabled = WHITELIST_ENABLED.load(deps.storage)?;
    Ok(WhitelistEnabledResponse { enabled })
}

fn query_fee_info(deps: Deps) -> StdResult<FeeInfoResponse> {
    let config = CONFIG.load(deps.storage)?;
    Ok(FeeInfoResponse {
        fee_rate: config.fee_rate,
        fee_address_1: config.fee_address_1.to_string(),
        fee_address_2: config.fee_address_2.to_string(),
        fee_split_ratio: config.fee_split_ratio,
    })
}

// ============================================================
// 单元测试
// ============================================================
#[cfg(test)]
mod tests {
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
    use cosmwasm_std::{coins, from_binary, Addr, BankMsg, DepsMut, SubMsg, Timestamp, Uint128};

    use super::{execute, instantiate, migrate, query};
    use crate::error::ContractError;
    use crate::msg::{
        ExecuteMsg, InstantiateMsg, MigrateMsg, OrderCountResponse, OrdersResponse, QueryMsg,
    };
    use crate::state::{Order, MAX_EXPIRATION};

    // 测试用常量
    const ADMIN: &str = "paxi1admin";
    const SELLER: &str = "paxi1seller";
    const BUYER: &str = "paxi1buyer";
    const FEE_ADDR_1: &str = "paxi1fee1";
    const FEE_ADDR_2: &str = "paxi1fee2";
    const OFFER_DENOM: &str = "uusdc";
    const ASK_DENOM: &str = "upaxi";

    fn default_instantiate() -> InstantiateMsg {
        InstantiateMsg {
            admin: ADMIN.to_string(),
            fee_rate: 100, // 1%
            fee_address_1: FEE_ADDR_1.to_string(),
            fee_address_2: FEE_ADDR_2.to_string(),
            fee_split_ratio: 6000, // 60% 给地址 1
        }
    }

    /// 初始化合约，返回 env。调用方负责创建 deps 并传入 as_mut()。
    fn init_contract(deps: DepsMut) -> cosmwasm_std::Env {
        let msg = default_instantiate();
        let info = mock_info(ADMIN, &[]);
        let env = mock_env();
        let res = instantiate(deps, env.clone(), info, msg).unwrap();
        assert_eq!(res.attributes[0].value, "instantiate");
        env
    }

    fn future_expires(env: &cosmwasm_std::Env, secs: u64) -> u64 {
        env.block.time.seconds() + secs
    }

    /// 创建一个标准订单供执行测试使用
    fn create_sample_order(deps: DepsMut, env: &cosmwasm_std::Env) {
        let expires_at = future_expires(env, 86400);
        let msg = ExecuteMsg::CreateOrder {
            offer_amount: Uint128::new(1000),
            offer_denom: OFFER_DENOM.to_string(),
            ask_amount: Uint128::new(5000),
            ask_denom: ASK_DENOM.to_string(),
            expires_at,
        };
        let info = mock_info(SELLER, &coins(1000, OFFER_DENOM));
        execute(deps, env.clone(), info, msg).unwrap();
    }

    // ---------- 初始化 ----------

    #[test]
    fn instantiate_works() {
        let mut deps = mock_dependencies();
        init_contract(deps.as_mut());
    }

    #[test]
    fn instantiate_rejects_invalid_fee_rate() {
        let mut deps = mock_dependencies();
        let mut msg = default_instantiate();
        msg.fee_rate = 10001;
        let info = mock_info(ADMIN, &[]);
        let err = instantiate(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(err, ContractError::InvalidFeeRate);
    }

    #[test]
    fn instantiate_rejects_duplicate_fee_addresses() {
        let mut deps = mock_dependencies();
        let mut msg = default_instantiate();
        msg.fee_address_2 = FEE_ADDR_1.to_string();
        let info = mock_info(ADMIN, &[]);
        let err = instantiate(deps.as_mut(), mock_env(), info, msg).unwrap_err();
        assert_eq!(err, ContractError::DuplicateFeeAddress);
    }

    // ---------- 创建挂单 ----------

    #[test]
    fn create_order_works() {
        let mut deps = mock_dependencies();
        let env = init_contract(deps.as_mut());
        let expires_at = future_expires(&env, 86400);
        let msg = ExecuteMsg::CreateOrder {
            offer_amount: Uint128::new(1000),
            offer_denom: OFFER_DENOM.to_string(),
            ask_amount: Uint128::new(5000),
            ask_denom: ASK_DENOM.to_string(),
            expires_at,
        };
        let info = mock_info(SELLER, &coins(1000, OFFER_DENOM));
        let res = execute(deps.as_mut(), env, info, msg).unwrap();
        assert_eq!(res.attributes[1].value, "1");
    }

    #[test]
    fn create_order_rejects_same_denom() {
        let mut deps = mock_dependencies();
        let env = init_contract(deps.as_mut());
        let expires_at = future_expires(&env, 86400);
        let msg = ExecuteMsg::CreateOrder {
            offer_amount: Uint128::new(1000),
            offer_denom: OFFER_DENOM.to_string(),
            ask_amount: Uint128::new(2000),
            ask_denom: OFFER_DENOM.to_string(),
            expires_at,
        };
        let info = mock_info(SELLER, &coins(1000, OFFER_DENOM));
        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::SameDenomNotAllowed);
    }

    #[test]
    fn create_order_rejects_past_expiration() {
        let mut deps = mock_dependencies();
        let env = init_contract(deps.as_mut());
        let expires_at = env.block.time.seconds() - 10;
        let msg = ExecuteMsg::CreateOrder {
            offer_amount: Uint128::new(1000),
            offer_denom: OFFER_DENOM.to_string(),
            ask_amount: Uint128::new(5000),
            ask_denom: ASK_DENOM.to_string(),
            expires_at,
        };
        let info = mock_info(SELLER, &coins(1000, OFFER_DENOM));
        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::InvalidExpiration);
    }

    #[test]
    fn create_order_rejects_too_far_expiration() {
        let mut deps = mock_dependencies();
        let env = init_contract(deps.as_mut());
        let expires_at = env.block.time.seconds() + MAX_EXPIRATION + 1;
        let msg = ExecuteMsg::CreateOrder {
            offer_amount: Uint128::new(1000),
            offer_denom: OFFER_DENOM.to_string(),
            ask_amount: Uint128::new(5000),
            ask_denom: ASK_DENOM.to_string(),
            expires_at,
        };
        let info = mock_info(SELLER, &coins(1000, OFFER_DENOM));
        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::ExpirationTooFar);
    }

    #[test]
    fn create_order_rejects_wrong_funds() {
        let mut deps = mock_dependencies();
        let env = init_contract(deps.as_mut());
        let expires_at = future_expires(&env, 86400);
        let msg = ExecuteMsg::CreateOrder {
            offer_amount: Uint128::new(1000),
            offer_denom: OFFER_DENOM.to_string(),
            ask_amount: Uint128::new(5000),
            ask_denom: ASK_DENOM.to_string(),
            expires_at,
        };
        let info = mock_info(SELLER, &coins(500, OFFER_DENOM));
        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert!(matches!(err, ContractError::InsufficientPayment { .. }));
    }

    // ---------- 执行订单（含找零）----------

    #[test]
    fn execute_order_exact_payment_works() {
        let mut deps = mock_dependencies();
        let env = init_contract(deps.as_mut());
        create_sample_order(deps.as_mut(), &env);

        let msg = ExecuteMsg::ExecuteOrder { order_id: 1 };
        let info = mock_info(BUYER, &coins(5000, ASK_DENOM));
        let res = execute(deps.as_mut(), env, info, msg).unwrap();

        // 4 条消息：给买家 offer、给卖家扣费后、给 fee1、给 fee2（无找零）
        assert_eq!(res.messages.len(), 4);
        let change_attr = res.attributes.iter().find(|a| a.key == "change").unwrap();
        assert_eq!(change_attr.value, "0");
    }

    #[test]
    fn execute_order_with_change_refunds_excess() {
        let mut deps = mock_dependencies();
        let env = init_contract(deps.as_mut());
        create_sample_order(deps.as_mut(), &env);

        // 买家多付 1000，应找零 1000
        let msg = ExecuteMsg::ExecuteOrder { order_id: 1 };
        let info = mock_info(BUYER, &coins(6000, ASK_DENOM));
        let res = execute(deps.as_mut(), env, info, msg).unwrap();

        // 5 条消息：多了一条找零
        assert_eq!(res.messages.len(), 5);

        let last_msg = res.messages.last().unwrap();
        if let SubMsg::Bank(BankMsg::Send { to_address, amount }) = last_msg {
            assert_eq!(to_address, BUYER);
            assert_eq!(amount, &coins(1000, ASK_DENOM));
        } else {
            panic!("最后一条消息应为找零 BankMsg::Send");
        }

        let change_attr = res.attributes.iter().find(|a| a.key == "change").unwrap();
        assert_eq!(change_attr.value, "1000");
    }

    #[test]
    fn execute_order_rejects_self_trade() {
        let mut deps = mock_dependencies();
        let env = init_contract(deps.as_mut());
        create_sample_order(deps.as_mut(), &env);

        let msg = ExecuteMsg::ExecuteOrder { order_id: 1 };
        let info = mock_info(SELLER, &coins(5000, ASK_DENOM));
        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::SelfTradeNotAllowed);
    }

    #[test]
    fn execute_order_rejects_insufficient_payment() {
        let mut deps = mock_dependencies();
        let env = init_contract(deps.as_mut());
        create_sample_order(deps.as_mut(), &env);

        let msg = ExecuteMsg::ExecuteOrder { order_id: 1 };
        let info = mock_info(BUYER, &coins(4000, ASK_DENOM));
        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert!(matches!(err, ContractError::InsufficientPayment { .. }));
    }

    #[test]
    fn execute_order_rejects_wrong_denom() {
        let mut deps = mock_dependencies();
        let env = init_contract(deps.as_mut());
        create_sample_order(deps.as_mut(), &env);

        let msg = ExecuteMsg::ExecuteOrder { order_id: 1 };
        let info = mock_info(BUYER, &coins(5000, "wrongdenom"));
        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert!(matches!(err, ContractError::DenomMismatch { .. }));
    }

    #[test]
    fn execute_order_rejects_expired() {
        let mut deps = mock_dependencies();
        let env = init_contract(deps.as_mut());
        let expires_at = future_expires(&env, 1);
        let create_msg = ExecuteMsg::CreateOrder {
            offer_amount: Uint128::new(1000),
            offer_denom: OFFER_DENOM.to_string(),
            ask_amount: Uint128::new(5000),
            ask_denom: ASK_DENOM.to_string(),
            expires_at,
        };
        let info = mock_info(SELLER, &coins(1000, OFFER_DENOM));
        execute(deps.as_mut(), env.clone(), info, create_msg).unwrap();

        let mut env2 = env;
        env2.block.time = Timestamp::from_seconds(expires_at + 10);

        let msg = ExecuteMsg::ExecuteOrder { order_id: 1 };
        let info = mock_info(BUYER, &coins(5000, ASK_DENOM));
        let err = execute(deps.as_mut(), env2, info, msg).unwrap_err();
        assert_eq!(err, ContractError::OrderExpired);
    }

    // ---------- 手续费分账 ----------

    #[test]
    fn fee_split_calculated_correctly() {
        let mut deps = mock_dependencies();
        let env = init_contract(deps.as_mut());
        create_sample_order(deps.as_mut(), &env);

        // ask=5000, fee_rate=100(1%), split=6000(60%)
        // fee_total=50, seller=4950, fee1=30, fee2=20
        let msg = ExecuteMsg::ExecuteOrder { order_id: 1 };
        let info = mock_info(BUYER, &coins(5000, ASK_DENOM));
        let res = execute(deps.as_mut(), env, info, msg).unwrap();

        let fee_total = res.attributes.iter().find(|a| a.key == "fee_total").unwrap().value.clone();
        let fee_to_addr_1 = res.attributes.iter().find(|a| a.key == "fee_to_addr_1").unwrap().value.clone();
        let fee_to_addr_2 = res.attributes.iter().find(|a| a.key == "fee_to_addr_2").unwrap().value.clone();
        assert_eq!(fee_total, "50");
        assert_eq!(fee_to_addr_1, "30");
        assert_eq!(fee_to_addr_2, "20");

        let seller_msg = &res.messages[1];
        if let SubMsg::Bank(BankMsg::Send { amount, .. }) = seller_msg {
            assert_eq!(amount, &coins(4950, ASK_DENOM));
        }
    }

    // ---------- 取消挂单 ----------

    #[test]
    fn cancel_order_works() {
        let mut deps = mock_dependencies();
        let env = init_contract(deps.as_mut());
        create_sample_order(deps.as_mut(), &env);

        let msg = ExecuteMsg::CancelOrder { order_id: 1 };
        let info = mock_info(SELLER, &[]);
        let res = execute(deps.as_mut(), env, info, msg).unwrap();
        assert_eq!(res.messages.len(), 1);
    }

    #[test]
    fn cancel_order_rejects_non_seller() {
        let mut deps = mock_dependencies();
        let env = init_contract(deps.as_mut());
        create_sample_order(deps.as_mut(), &env);

        let msg = ExecuteMsg::CancelOrder { order_id: 1 };
        let info = mock_info(BUYER, &[]);
        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::OnlySellerCanCancel);
    }

    #[test]
    fn cancel_order_works_even_when_paused() {
        let mut deps = mock_dependencies();
        let env = init_contract(deps.as_mut());
        create_sample_order(deps.as_mut(), &env);

        let pause_msg = ExecuteMsg::Pause {};
        let admin_info = mock_info(ADMIN, &[]);
        execute(deps.as_mut(), env.clone(), admin_info, pause_msg).unwrap();

        let msg = ExecuteMsg::CancelOrder { order_id: 1 };
        let info = mock_info(SELLER, &[]);
        let res = execute(deps.as_mut(), env, info, msg).unwrap();
        assert_eq!(res.messages.len(), 1);
    }

    // ---------- 退款 ----------

    #[test]
    fn refund_order_works_after_expiry() {
        let mut deps = mock_dependencies();
        let env = init_contract(deps.as_mut());
        let expires_at = future_expires(&env, 1);
        let create_msg = ExecuteMsg::CreateOrder {
            offer_amount: Uint128::new(1000),
            offer_denom: OFFER_DENOM.to_string(),
            ask_amount: Uint128::new(5000),
            ask_denom: ASK_DENOM.to_string(),
            expires_at,
        };
        let info = mock_info(SELLER, &coins(1000, OFFER_DENOM));
        execute(deps.as_mut(), env.clone(), info, create_msg).unwrap();

        let mut env2 = env;
        env2.block.time = Timestamp::from_seconds(expires_at + 10);

        let msg = ExecuteMsg::RefundOrder { order_id: 1 };
        let info = mock_info(SELLER, &[]);
        let res = execute(deps.as_mut(), env2, info, msg).unwrap();
        assert_eq!(res.messages.len(), 1);
    }

    #[test]
    fn refund_order_rejects_before_expiry() {
        let mut deps = mock_dependencies();
        let env = init_contract(deps.as_mut());
        create_sample_order(deps.as_mut(), &env);

        let msg = ExecuteMsg::RefundOrder { order_id: 1 };
        let info = mock_info(SELLER, &[]);
        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::OrderNotExpired);
    }

    // ---------- 管理员功能 ----------

    #[test]
    fn pause_blocks_create_but_not_cancel() {
        let mut deps = mock_dependencies();
        let env = init_contract(deps.as_mut());
        create_sample_order(deps.as_mut(), &env);

        let pause_msg = ExecuteMsg::Pause {};
        let admin_info = mock_info(ADMIN, &[]);
        execute(deps.as_mut(), env.clone(), admin_info, pause_msg).unwrap();

        let expires_at = future_expires(&env, 86400);
        let create_msg = ExecuteMsg::CreateOrder {
            offer_amount: Uint128::new(1000),
            offer_denom: OFFER_DENOM.to_string(),
            ask_amount: Uint128::new(5000),
            ask_denom: ASK_DENOM.to_string(),
            expires_at,
        };
        let info = mock_info(SELLER, &coins(1000, OFFER_DENOM));
        let err = execute(deps.as_mut(), env.clone(), info, create_msg).unwrap_err();
        assert_eq!(err, ContractError::ContractPaused);

        let cancel_msg = ExecuteMsg::CancelOrder { order_id: 1 };
        let info = mock_info(SELLER, &[]);
        let res = execute(deps.as_mut(), env, info, cancel_msg).unwrap();
        assert_eq!(res.messages.len(), 1);
    }

    #[test]
    fn update_admin_works() {
        let mut deps = mock_dependencies();
        let env = init_contract(deps.as_mut());
        let new_admin = "paxi1newadmin";
        let msg = ExecuteMsg::UpdateAdmin {
            new_admin: new_admin.to_string(),
        };
        let info = mock_info(ADMIN, &[]);
        let res = execute(deps.as_mut(), env.clone(), info, msg).unwrap();
        assert_eq!(res.attributes[1].value, new_admin);

        let pause_msg = ExecuteMsg::Pause {};
        let old_admin_info = mock_info(ADMIN, &[]);
        let err = execute(deps.as_mut(), env, old_admin_info, pause_msg.clone()).unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);

        let new_admin_info = mock_info(new_admin, &[]);
        let res = execute(deps.as_mut(), mock_env(), new_admin_info, pause_msg).unwrap();
        assert_eq!(res.attributes[1].value, "true");
    }

    #[test]
    fn update_admin_rejects_same_address() {
        let mut deps = mock_dependencies();
        let env = init_contract(deps.as_mut());
        let msg = ExecuteMsg::UpdateAdmin {
            new_admin: ADMIN.to_string(),
        };
        let info = mock_info(ADMIN, &[]);
        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::SameAdminAddress);
    }

    #[test]
    fn update_fee_address_1_rejects_duplicate_with_2() {
        let mut deps = mock_dependencies();
        let env = init_contract(deps.as_mut());
        let msg = ExecuteMsg::UpdateFeeAddress1 {
            fee_address_1: FEE_ADDR_2.to_string(),
        };
        let info = mock_info(ADMIN, &[]);
        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::DuplicateFeeAddress);
    }

    #[test]
    fn non_admin_cannot_pause() {
        let mut deps = mock_dependencies();
        let env = init_contract(deps.as_mut());
        let msg = ExecuteMsg::Pause {};
        let info = mock_info(SELLER, &[]);
        let err = execute(deps.as_mut(), env, info, msg).unwrap_err();
        assert_eq!(err, ContractError::Unauthorized);
    }

    // ---------- 查询 ----------

    #[test]
    fn query_order_count_increments() {
        let mut deps = mock_dependencies();
        let env = init_contract(deps.as_mut());
        create_sample_order(deps.as_mut(), &env);

        let res: OrderCountResponse = from_binary(
            &query(deps.as_ref(), mock_env(), QueryMsg::GetOrderCount {}).unwrap(),
        )
        .unwrap();
        assert_eq!(res.count, 1);
    }

    #[test]
    fn query_get_order_returns_correct_data() {
        let mut deps = mock_dependencies();
        let env = init_contract(deps.as_mut());
        create_sample_order(deps.as_mut(), &env);

        let res: Order = from_binary(
            &query(deps.as_ref(), mock_env(), QueryMsg::GetOrder { order_id: 1 }).unwrap(),
        )
        .unwrap();
        assert_eq!(res.seller, Addr::unchecked(SELLER));
        assert_eq!(res.offer_amount, Uint128::new(1000));
        assert_eq!(res.ask_amount, Uint128::new(5000));
        assert_eq!(res.offer_denom, OFFER_DENOM);
        assert_eq!(res.ask_denom, ASK_DENOM);
    }

    #[test]
    fn query_list_active_orders_filters_correctly() {
        let mut deps = mock_dependencies();
        let env = init_contract(deps.as_mut());
        for _ in 0..3 {
            create_sample_order(deps.as_mut(), &env);
        }
        let cancel_msg = ExecuteMsg::CancelOrder { order_id: 2 };
        let info = mock_info(SELLER, &[]);
        execute(deps.as_mut(), env.clone(), info, cancel_msg).unwrap();

        let res: OrdersResponse = from_binary(
            &query(
                deps.as_ref(),
                mock_env(),
                QueryMsg::ListActiveOrders {
                    start_after: None,
                    limit: Some(100),
                },
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(res.orders.len(), 2);
        assert_eq!(res.orders[0].id, 1);
        assert_eq!(res.orders[1].id, 3);
    }

    // ---------- Migrate ----------

    #[test]
    fn migrate_works() {
        let mut deps = mock_dependencies();
        let env = init_contract(deps.as_mut());
        let msg = MigrateMsg::default();
        let res = migrate(deps.as_mut(), env, msg).unwrap();
        assert_eq!(res.attributes[0].value, "migrate");
    }
}

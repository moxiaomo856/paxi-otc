use cosmwasm_std::{
    entry_point, to_json_binary, BankMsg, Binary, Coin, CosmosMsg, Deps, DepsMut, Env,
    MessageInfo, Order as StdOrder, Response, StdResult, Uint128,
};

use crate::error::ContractError;
use crate::msg::{
    ConfigResponse, ExecuteMsg, FeeInfoResponse, InstantiateMsg, OrderCountResponse,
    OrdersResponse, PausedResponse, QueryMsg, WhitelistEnabledResponse, WhitelistedResponse,
};
use crate::state::{
    Config, Order, OrderStatus, BASIS_POINTS, CONFIG, ORDERS, ORDER_COUNT, PAUSED, WHITELIST,
    WHITELIST_ENABLED,
};
use cw2::set_contract_version;
use cw_storage_plus::Bound;

const CONTRACT_NAME: &str = "paxi-otc";
const CONTRACT_VERSION: &str = "0.2.0";

const DEFAULT_LIMIT: u32 = 30;
const MAX_LIMIT: u32 = 100;

// ============================================================
// INSTANTIATE
// ============================================================
#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    if msg.fee_rate > BASIS_POINTS {
        return Err(ContractError::InvalidFeeRate);
    }
    if msg.fee_split_ratio > BASIS_POINTS {
        return Err(ContractError::InvalidSplitRatio);
    }

    let config = Config {
        admin: deps.api.addr_validate(&msg.admin)?,
        fee_rate: msg.fee_rate,
        fee_address_1: deps.api.addr_validate(&msg.fee_address_1)?,
        fee_address_2: deps.api.addr_validate(&msg.fee_address_2)?,
        fee_split_ratio: msg.fee_split_ratio,
    };
    CONFIG.save(deps.storage, &config)?;

    PAUSED.save(deps.storage, &false)?;
    ORDER_COUNT.save(deps.storage, &0)?;
    WHITELIST_ENABLED.save(deps.storage, &false)?;

    Ok(Response::new().add_attribute("action", "instantiate"))
}

// ============================================================
// EXECUTE
// ============================================================
#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::CreateOrder {
            offer_amount,
            offer_denom,
            ask_amount,
            ask_denom,
            expires_at,
        } => execute_create_order(deps, env, info, offer_amount, offer_denom, ask_amount, ask_denom, expires_at),

        ExecuteMsg::ExecuteOrder { order_id } => {
            execute_execute_order(deps, env, info, order_id)
        }

        ExecuteMsg::CancelOrder { order_id } => {
            execute_cancel_order(deps, env, info, order_id)
        }

        ExecuteMsg::RefundOrder { order_id } => {
            execute_refund_order(deps, env, info, order_id)
        }

        ExecuteMsg::Pause {} => execute_pause(deps, info),
        ExecuteMsg::Resume {} => execute_resume(deps, info),
        ExecuteMsg::UpdateFeeRate { new_fee_rate } => execute_update_fee_rate(deps, info, new_fee_rate),
        ExecuteMsg::UpdateFeeAddresses { fee_address_1, fee_address_2 } => {
            execute_update_fee_addresses(deps, info, fee_address_1, fee_address_2)
        }
        ExecuteMsg::UpdateFeeSplit { new_split_ratio } => {
            execute_update_fee_split(deps, info, new_split_ratio)
        }
        ExecuteMsg::AddToWhitelist { address } => execute_add_whitelist(deps, info, address),
        ExecuteMsg::RemoveFromWhitelist { address } => execute_remove_whitelist(deps, info, address),
        ExecuteMsg::ToggleWhitelist { enabled } => execute_toggle_whitelist(deps, info, enabled),
    }
}

// ============================================================
// CREATE ORDER
// ============================================================
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
    check_paused(deps.as_ref())?;
    check_whitelist(deps.as_ref(), &info.sender)?;

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
    if expires_at <= env.block.height {
        return Err(ContractError::InvalidExpiration);
    }

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

    let order_id = ORDER_COUNT.load(deps.storage)? + 1;
    ORDER_COUNT.save(deps.storage, &order_id)?;

    let order = Order {
        id: order_id,
        seller: info.sender.clone(),
        offer_amount,
        offer_denom: offer_denom.clone(),
        ask_amount,
        ask_denom: ask_denom.clone(),
        status: OrderStatus::Active,
        created_at: env.block.height,
        expires_at,
    };
    ORDERS.save(deps.storage, order_id, &order)?;

    Ok(Response::new()
        .add_attribute("action", "create_order")
        .add_attribute("order_id", order_id.to_string())
        .add_attribute("seller", info.sender.to_string()))
}

// ============================================================
// EXECUTE ORDER (BUY)
// ============================================================
fn execute_execute_order(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    order_id: u64,
) -> Result<Response, ContractError> {
    check_paused(deps.as_ref())?;

    let mut order = ORDERS.load(deps.storage, order_id)?;

    if order.status != OrderStatus::Active {
        return Err(ContractError::OrderNotActive);
    }
    if order.expires_at <= env.block.height {
        return Err(ContractError::OrderExpired);
    }

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
    if payment.amount != order.ask_amount {
        return Err(ContractError::InsufficientPayment {
            expected: format!("{}{}", order.ask_amount, order.ask_denom),
            actual: format!("{}{}", payment.amount, payment.denom),
        });
    }

    let config = CONFIG.load(deps.storage)?;

    let fee_total = order
        .ask_amount
        .multiply_ratio(config.fee_rate, BASIS_POINTS);

    let seller_amount = order.ask_amount - fee_total;

    let fee_to_addr1 = fee_total.multiply_ratio(config.fee_split_ratio, BASIS_POINTS);
    let fee_to_addr2 = fee_total - fee_to_addr1;

    let mut messages: Vec<CosmosMsg> = vec![];

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
        .add_attribute("fee_to_addr_2", fee_to_addr2.to_string()))
}

// ============================================================
// CANCEL ORDER
// ============================================================
fn execute_cancel_order(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    order_id: u64,
) -> Result<Response, ContractError> {
    check_paused(deps.as_ref())?;

    let mut order = ORDERS.load(deps.storage, order_id)?;

    if order.status != OrderStatus::Active {
        return Err(ContractError::OrderNotActive);
    }
    if order.seller != info.sender {
        return Err(ContractError::OnlySellerCanCancel);
    }

    let refund_msg = BankMsg::Send {
        to_address: order.seller.to_string(),
        amount: vec![Coin {
            denom: order.offer_denom.clone(),
            amount: order.offer_amount,
        }],
    };

    order.status = OrderStatus::Cancelled;
    ORDERS.save(deps.storage, order_id, &order)?;

    Ok(Response::new()
        .add_message(refund_msg)
        .add_attribute("action", "cancel_order")
        .add_attribute("order_id", order_id.to_string()))
}

// ============================================================
// REFUND ORDER
// ============================================================
fn execute_refund_order(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    order_id: u64,
) -> Result<Response, ContractError> {
    check_paused(deps.as_ref())?;

    let mut order = ORDERS.load(deps.storage, order_id)?;

    if order.status != OrderStatus::Active {
        return Err(ContractError::OrderNotActive);
    }
    if order.seller != info.sender {
        return Err(ContractError::OnlySellerCanRefund);
    }
    if order.expires_at > env.block.height {
        return Err(ContractError::OrderNotExpired);
    }

    let refund_msg = BankMsg::Send {
        to_address: order.seller.to_string(),
        amount: vec![Coin {
            denom: order.offer_denom.clone(),
            amount: order.offer_amount,
        }],
    };

    order.status = OrderStatus::Refunded;
    ORDERS.save(deps.storage, order_id, &order)?;

    Ok(Response::new()
        .add_message(refund_msg)
        .add_attribute("action", "refund_order")
        .add_attribute("order_id", order_id.to_string()))
}

// ============================================================
// ADMIN FUNCTIONS
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
        .add_attribute("paused", "true"))
}

fn execute_resume(deps: DepsMut, info: MessageInfo) -> Result<Response, ContractError> {
    check_admin(deps.as_ref(), &info.sender)?;
    PAUSED.save(deps.storage, &false)?;
    Ok(Response::new()
        .add_attribute("action", "resume")
        .add_attribute("paused", "false"))
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
        .add_attribute("new_fee_rate", new_fee_rate.to_string()))
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
    CONFIG.update(deps.storage, |mut c| -> StdResult<_> {
        c.fee_address_1 = addr1.clone();
        c.fee_address_2 = addr2.clone();
        Ok(c)
    })?;
    Ok(Response::new()
        .add_attribute("action", "update_fee_addresses")
        .add_attribute("fee_address_1", addr1.to_string())
        .add_attribute("fee_address_2", addr2.to_string()))
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
        .add_attribute("new_split_ratio", new_split_ratio.to_string()))
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
        .add_attribute("address", addr.to_string()))
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
        .add_attribute("address", addr.to_string()))
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
        .add_attribute("enabled", enabled.to_string()))
}

// ============================================================
// QUERY
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

fn query_list_orders(deps: Deps, start_after: Option<u64>, limit: Option<u32>) -> StdResult<OrdersResponse> {
    let limit = limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT) as usize;
    let orders: Vec<Order> = ORDERS
        .range(deps.storage, start_after.map(Bound::exclusive), None, StdOrder::Ascending)
        .take(limit)
        .filter_map(|r| r.ok())
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
    let orders: Vec<Order> = ORDERS
        .range(deps.storage, start_after.map(Bound::exclusive), None, StdOrder::Ascending)
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
    let orders: Vec<Order> = ORDERS
        .range(deps.storage, start_after.map(Bound::exclusive), None, StdOrder::Ascending)
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
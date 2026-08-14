use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("未授权：仅管理员可执行此操作")]
    Unauthorized,

    #[error("合约已暂停")]
    ContractPaused,

    #[error("订单不存在")]
    OrderNotFound,

    #[error("订单不在活跃状态")]
    OrderNotActive,

    #[error("只有卖家可以取消订单")]
    OnlySellerCanCancel,

    #[error("只有卖家可以发起退款")]
    OnlySellerCanRefund,

    #[error("订单尚未超时，无法退款")]
    OrderNotExpired,

    #[error("订单已过期，请卖家使用退款功能")]
    OrderExpired,

    #[error("挂单数量必须大于 0")]
    InvalidOfferAmount,

    #[error("求购数量必须大于 0")]
    InvalidAskAmount,

    #[error("求购代币类型不能为空")]
    EmptyAskDenom,

    #[error("挂单代币类型不能为空")]
    EmptyOfferDenom,

    #[error("必须且只能发送一种代币作为挂单资产")]
    InvalidFunds,

    #[error("过期时间必须大于当前区块高度")]
    InvalidExpiration,

    #[error("手续费比例必须在 0-10000 之间")]
    InvalidFeeRate,

    #[error("分账比例必须在 0-10000 之间")]
    InvalidSplitRatio,

    #[error("支付不足：需要 {expected}，实际支付 {actual}")]
    InsufficientPayment {
        expected: String,
        actual: String,
    },

    #[error("支付过多：需要 {expected}，实际支付 {actual}")]
    ExcessivePayment {
        expected: String,
        actual: String,
    },

    #[error("付款代币类型不匹配：需要 {expected}，收到 {actual}")]
    DenomMismatch {
        expected: String,
        actual: String,
    },

    #[error("没有发送任何代币")]
    NoFunds,

    #[error("该地址已在白名单中")]
    AlreadyWhitelisted,

    #[error("该地址不在白名单中")]
    NotWhitelisted,

    #[error("白名单已开启，你的地址不在白名单中")]
    NotInWhitelist,
}

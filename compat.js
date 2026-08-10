/**
 * PaxiCosmJS 兼容层
 *
 * Paxi 官方 SDK (paxi-cosmjs.umd.js) 仅包含 Cosmos tx 模块
 *（TxBody/AuthInfo/SignDoc/TxRaw/Any/Coin），缺少 bank/wasm 模块的消息类
 *（MsgSend/MsgExecuteContract/MsgInstantiateContract/PubKey/coins）。
 *
 * 本文件在 SDK 加载后检测缺失的类，用手写 protobuf 编码器补充。
 * 直接从 paxi-toolbox 复制。
 */
(function () {
  'use strict';

  function encodeVarint(n) {
    const bytes = [];
    n = BigInt(n);
    if (n === 0n) return new Uint8Array([0]);
    while (n > 0n) {
      let byte = Number(n & 0x7fn);
      n >>= 7n;
      if (n > 0n) byte |= 0x80;
      bytes.push(byte);
    }
    return new Uint8Array(bytes);
  }

  function encodeLenDelim(fieldNum, data) {
    const tag = (fieldNum << 3) | 2;
    const dataBytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    return concatBytes(encodeVarint(tag), encodeVarint(dataBytes.length), dataBytes);
  }

  function encodeVarintField(fieldNum, value) {
    const tag = (fieldNum << 3) | 0;
    return concatBytes(encodeVarint(tag), encodeVarint(value));
  }

  function concatBytes(...arrays) {
    const total = arrays.reduce((s, a) => s + a.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const arr of arrays) { result.set(arr, offset); offset += arr.length; }
    return result;
  }

  function encodeCoin(denom, amount) {
    return concatBytes(encodeLenDelim(1, denom), encodeLenDelim(2, amount));
  }

  function coins(amount, denom) {
    return [{ denom, amount: String(amount) }];
  }

  const MsgSend = {
    fromPartial(data) { return data; },
    encode(data) {
      const fromAddress = data.fromAddress || data.from_address;
      const toAddress = data.toAddress || data.to_address;
      const parts = [encodeLenDelim(1, fromAddress), encodeLenDelim(2, toAddress)];
      if (data.amount && data.amount.length > 0) {
        for (const coin of data.amount) {
          parts.push(encodeLenDelim(3, encodeCoin(coin.denom, coin.amount)));
        }
      }
      return { finish: () => concatBytes(...parts) };
    },
  };

  const MsgExecuteContract = {
    fromPartial(data) { return data; },
    encode(data) {
      const sender = data.sender || data.sender_address;
      const contract = data.contract || data.contract_addr;
      const msg = data.msg || new Uint8Array();
      const parts = [encodeLenDelim(1, sender), encodeLenDelim(2, contract), encodeLenDelim(3, msg)];
      if (data.funds && data.funds.length > 0) {
        for (const coin of data.funds) {
          parts.push(encodeLenDelim(5, encodeCoin(coin.denom, coin.amount)));
        }
      }
      return { finish: () => concatBytes(...parts) };
    },
  };

  const MsgInstantiateContract = {
    fromPartial(data) { return data; },
    encode(data) {
      const parts = [
        encodeLenDelim(1, data.sender),
        encodeLenDelim(2, data.admin || ''),
        encodeVarintField(3, data.codeId || data.code_id || 0),
        encodeLenDelim(4, data.label || ''),
        encodeLenDelim(5, data.msg || new Uint8Array()),
      ];
      if (data.funds && data.funds.length > 0) {
        for (const coin of data.funds) {
          parts.push(encodeLenDelim(6, encodeCoin(coin.denom, coin.amount)));
        }
      }
      return { finish: () => concatBytes(...parts) };
    },
  };

  const PubKey = {
    encode(data) { return { finish: () => encodeLenDelim(1, data.key) }; },
  };

  function applyCompat() {
    if (typeof window.PaxiCosmJS === 'undefined') {
      console.error('[Compat] PaxiCosmJS 未加载');
      return;
    }
    const supplement = { MsgSend, MsgExecuteContract, MsgInstantiateContract, PubKey, coins };
    let added = [];
    for (const [name, impl] of Object.entries(supplement)) {
      if (typeof window.PaxiCosmJS[name] === 'undefined') {
        window.PaxiCosmJS[name] = impl;
        added.push(name);
      }
    }
    if (added.length > 0) console.log('[Compat] 已补充:', added.join(', '));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyCompat);
  } else {
    applyCompat();
  }
})();

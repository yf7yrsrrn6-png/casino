import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";
import { contractErrorText } from "./errors";

/** Помилки гаманця/мережі/контракту → зрозумілий текст українською. Повертає null, якщо не впізнано. */
export function walletErrorText(e: unknown): string | null {
  if (!(e instanceof Error)) return null;
  const msg = e.message ?? "";
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return "Ви скасували дію в гаманці.";
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? revert.reason;
      if (name) return contractErrorText(name);
      return "Контракт відхилив транзакцію. Оновіть сторінку й спробуйте ще раз.";
    }
  }
  if (/user (rejected|denied)|rejected the request|request rejected|cancell?ed by user/i.test(msg)) return "Ви скасували дію в гаманці.";
  if (/insufficient funds|exceeds the balance|gas required exceeds/i.test(msg)) {
    return "Недостатньо tBNB для оплати газу. Отримайте тестові BNB у фаусеті BNB Chain.";
  }
  if (/chain mismatch|does not match the target chain|switch chain|unrecognized chain|wallet_switchEthereumChain/i.test(msg)) {
    return "Гаманець підключено до іншої мережі. Перемкніться на BNB Smart Chain Testnet (chainId 97).";
  }
  if (/connector not connected|not connected|no connector|connection.*not found/i.test(msg)) return "Гаманець не підключено. Натисніть «Гаманець» угорі.";
  if (/already pending|resource unavailable|request of type .* already pending/i.test(msg)) {
    return "У гаманці вже відкрито запит — підтвердьте або відхиліть його в застосунку гаманця.";
  }
  if (/nonce too low|replacement transaction underpriced/i.test(msg)) return "Попередня транзакція ще обробляється. Зачекайте хвилину й спробуйте знову.";
  if (/timed? ?out|timeout|took too long/i.test(msg)) return "Мережа відповідає повільно. Перевірте статус угоди за хвилину (кнопка ⟳).";
  if (/fetch failed|network ?error|failed to fetch|HttpRequestError/i.test(msg)) return "Немає з'єднання з мережею. Перевірте інтернет і спробуйте ще раз.";
  return null;
}

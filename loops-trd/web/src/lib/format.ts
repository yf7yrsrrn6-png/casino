export const fmtNum = (v: unknown, digits = 2) =>
  Number(v ?? 0).toLocaleString("uk-UA", { minimumFractionDigits: 0, maximumFractionDigits: digits });

export const fmtUah = (v: unknown) => `${fmtNum(v)} ₴`;
export const fmtUsdt = (v: unknown) => `${fmtNum(v)} USDT`;

export const fmtDate = (v: unknown) =>
  v ? new Date(String(v)).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export const shortAddr = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

export const DEAL_STATUS: Record<string, { label: string; tone: "info" | "ok" | "warn" | "bad" | "muted" | "brand" }> = {
  awaiting_deposit: { label: "Очікує депозит", tone: "info" },
  funded: { label: "Очікує оплату", tone: "brand" },
  paid: { label: "Оплачено", tone: "warn" },
  released: { label: "Завершено", tone: "ok" },
  cancelled: { label: "Скасовано", tone: "muted" },
  disputed: { label: "Спір", tone: "bad" },
  resolved: { label: "Вирішено адміном", tone: "ok" },
  blocked: { label: "Заблоковано", tone: "bad" },
};

export const USER_STATUS: Record<string, { label: string; tone: "info" | "ok" | "warn" | "bad" | "muted" }> = {
  pending: { label: "Очікує підтвердження", tone: "warn" },
  approved: { label: "Підтверджено", tone: "ok" },
  rejected: { label: "Відхилено", tone: "bad" },
  blocked: { label: "Заблоковано", tone: "bad" },
};

export const ROLE_LABEL: Record<string, string> = { member: "Учасник", moderator: "Модератор", admin: "Адміністратор" };

export const RISK: Record<string, { label: string; tone: "ok" | "warn" | "bad" }> = {
  low: { label: "Низький ризик", tone: "ok" },
  medium: { label: "Середній ризик", tone: "warn" },
  high: { label: "Високий ризик", tone: "bad" },
};

export const EVENT_LABEL: Record<string, string> = {
  "deal.created": "Угоду створено",
  "deal.signature_issued": "Сервер видав дозвіл на депозит",
  "deal.paid_intent": "Покупець вказав ім'я відправника",
  "deal.release_requested": "Продавець запросив відпуск коштів",
  "deal.release_signed": "Продавець підписав підтвердження",
  "deal.sender_name_mismatch_reported": "Продавець: ім'я відправника не збігається",
  "deal.cancelled": "Угоду скасовано",
  "chain.created": "Угоду зареєстровано в контракті",
  "chain.funded": "USDT внесено в ескроу",
  "chain.paid": "Покупець: «Я оплатив»",
  "chain.released": "USDT відправлено покупцю",
  "chain.cancelled": "Скасовано в контракті",
  "chain.disputed": "Спір відкрито в контракті",
  "chain.resolved": "Рішення в контракті",
  "chain.frozen": "Заморожено в контракті",
  "chain.unfrozen": "Розморожено в контракті",
  "chain.mismatch": "⚠ Розбіжність з контрактом",
  "antifraud.frozen": "Антифрод: угоду заморожено",
  "antifraud.confirm_required": "Антифрод: потрібне додаткове підтвердження",
  "antifraud.release_approved": "Антифрод: відпуск дозволено",
  "dispute.opened": "Відкрито спір",
  "staff.recommendation": "Рекомендація модератора",
  "staff.review_approved": "Перевірку схвалено персоналом",
  "staff.chat_message": "Повідомлення персоналу",
  "admin.resolved": "Рішення адміністратора",
  "admin.unfrozen": "Адмін дозволив угоду",
  "admin.cancelled": "Адмін скасував угоду",
  "keeper.auto_cancel": "Автоскасування",
};

/** Тексти помилок контракту LoopsTrdEscrow та гаманця українською (спільні для клієнта й сервера). */
const CONTRACT_ERRORS: Record<string, string> = {
  ZeroAddress: "Некоректна адреса гаманця.",
  ZeroAmount: "Сума має бути більшою за нуль.",
  InvalidParties: "Покупець і продавець мають бути різними гаманцями.",
  DealExists: "Угоду вже зареєстровано в контракті — оновіть сторінку.",
  DealNotFound: "Угоду ще не зареєстровано в контракті.",
  InvalidStatus: "Дія недоступна в поточному стані угоди — оновіть сторінку.",
  NotSeller: "Цю дію може виконати лише продавець (підключіть його гаманець).",
  NotBuyer: "Цю дію може виконати лише покупець (підключіть його гаманець).",
  NotParty: "Цю дію може виконати лише сторона угоди.",
  DealIsFrozen: "Угоду зупинено системою безпеки — кошти рухаються лише за рішенням адміністратора.",
  DealNotFrozen: "Угода не заморожена.",
  SignatureExpired: "Дозвіл сервера прострочено — натисніть кнопку ще раз.",
  InvalidSignature: "Дозвіл сервера недійсний. Оновіть сторінку й спробуйте ще раз.",
  PaymentWindowExpired: "Час на оплату минув. Якщо ви вже заплатили — негайно відкрийте спір.",
  PaymentWindowActive: "Скасувати ще не можна: у покупця триває час на оплату.",
  ReviewPending: "Відпуск коштів ще не схвалено системою безпеки. Натисніть «Підтвердити отримання» ще раз.",
  ReviewNotRequired: "Додаткове схвалення для цієї угоди не потрібне.",
  InvalidSplit: "Сума покупцю більша за суму угоди.",
  InvalidPaymentWindow: "Недопустиме вікно оплати.",
  InvalidGracePeriod: "Недопустимий пільговий період.",
  UnsupportedToken: "Токен списує комісію за переказ — такий токен не підтримується.",
  EnforcedPause: "Площадку тимчасово призупинено адміністратором. Повернення коштів і спори працюють.",
  AccessControlUnauthorizedAccount: "Недостатньо прав для цієї дії в контракті.",
  ReentrancyGuardReentrantCall: "Повторний виклик заборонено.",
  ERC20InsufficientBalance: "Недостатньо mUSDT на гаманці.",
  ERC20InsufficientAllowance: "Не надано дозвіл на списання mUSDT — підтвердіть approve у гаманці.",
  FaucetCooldown: "Кран доступний раз на годину — спробуйте пізніше.",
};

export function contractErrorText(name: string): string {
  return CONTRACT_ERRORS[name] ?? `Контракт відхилив транзакцію (${name}).`;
}

export function knownContractErrors() {
  return Object.keys(CONTRACT_ERRORS);
}

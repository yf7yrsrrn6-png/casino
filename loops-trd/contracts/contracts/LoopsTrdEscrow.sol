// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title LoopsTrdEscrow — ескроу для закритої P2P-площадки Loops Trd (USDT ↔ UAH).
/// @notice Продавець блокує USDT у контракті, покупець платить гривнею поза блокчейном,
///         після підтвердження продавцем USDT переходять покупцю.
///
/// Стани угоди (Status) і переходи:
///
///   None ──createDeal──▶ Created ──deposit──▶ Funded ──markPaid──▶ Paid ──confirmRelease──▶ Released
///                          │                    │ │                  │
///                          │ cancel             │ │ openDispute      │ openDispute
///                          ▼                    │ ▼                  ▼
///                      Cancelled ◀──cancel──────┘ Disputed ──resolveDispute──▶ Resolved
///
///   • frozen — окремий прапорець (не стан) для Funded/Paid/Disputed: поки він стоїть, кошти не
///     рухаються ні в який бік; вийти можна лише через resolveDispute або unfreezeDeal (адмін).
///   • Released / Cancelled / Resolved — кінцеві стани; баланс угоди в контракті = 0.
///
/// Гарантія «кошти не застрягають»: з кожного стану, де USDT лежать у контракті, є вихід:
///   Funded   — покупець скасовує будь-коли; будь-хто — після дедлайну + пільгового періоду;
///              спір; адмін: freezeDeal → resolveDispute.
///   Paid     — продавець confirmRelease (після approveRelease); спір; адмін: freezeDeal → resolveDispute.
///   Disputed — адмін resolveDispute (розподіл між сторонами).
///   frozen   — адмін resolveDispute або unfreezeDeal.
///   Пауза не блокує жодного виходу: cancel покупцем, openDispute, resolveDispute, freeze/unfreeze
///   працюють завжди, а час паузи не зараховується у вікно оплати.
///
/// @dev Модератори не мають жодної ролі в контракті й не можуть рухати кошти.
///      Контракт не має функції виведення довільних коштів адміном.
contract LoopsTrdEscrow is AccessControl, ReentrancyGuard, Pausable, EIP712 {
    using SafeERC20 for IERC20;

    /// @notice Адмін-арбітр: resolveDispute, unfreezeDeal (а також freezeDeal, approveRelease).
    bytes32 public constant ARBITER_ROLE = keccak256("ARBITER_ROLE");
    /// @notice Серверний ключ антифроду: freezeDeal, approveRelease.
    bytes32 public constant FREEZER_ROLE = keccak256("FREEZER_ROLE");
    /// @notice Серверний ключ, що підписує дозвіл на створення угоди (після перевірки антифродом).
    bytes32 public constant SIGNER_ROLE = keccak256("SIGNER_ROLE");

    bytes32 public constant CREATE_DEAL_TYPEHASH = keccak256(
        "CreateDeal(bytes32 dealId,address seller,address buyer,uint256 amount,bool reviewRequired,uint256 expiry)"
    );

    uint64 public constant MIN_PAYMENT_WINDOW = 5 minutes;
    uint64 public constant MAX_PAYMENT_WINDOW = 24 hours;
    uint64 public constant MIN_GRACE_PERIOD = 5 minutes;
    uint64 public constant MAX_GRACE_PERIOD = 24 hours;

    enum Status {
        None, // угоди не існує
        Created, // зареєстрована, коштів ще немає
        Funded, // USDT в ескроу, іде вікно оплати
        Paid, // покупець натиснув «Я оплатив»
        Released, // USDT відправлено покупцю (кінцевий)
        Cancelled, // скасовано, USDT (якщо були) повернуто продавцю (кінцевий)
        Disputed, // спір, чекає рішення адміна
        Resolved // адмін розподілив кошти (кінцевий)
    }

    struct Deal {
        address seller;
        address buyer;
        uint256 amount;
        uint64 createdAt;
        uint64 fundedAt;
        /// @dev «Сирий» дедлайн; фактичний — effectiveDeadline() (з урахуванням пауз).
        uint64 paymentDeadline;
        uint64 paidAt;
        /// @dev Сумарний час пауз контракту на момент deposit — для зсуву дедлайну.
        uint64 pauseOffset;
        Status status;
        bool frozen;
        bool reviewRequired;
        bool reviewApproved;
    }

    /// @notice Токен ескроу (MockUSDT у тестовій мережі).
    IERC20 public immutable token;
    /// @notice Вікно оплати після deposit.
    uint64 public paymentWindow = 30 minutes;
    /// @notice Скільки після дедлайну ще чекати, перш ніж скасувати може не покупець.
    ///         Дає покупцю, який уже заплатив, час відкрити спір.
    uint64 public cancelGracePeriod = 15 minutes;
    /// @notice Сумарна тривалість завершених пауз.
    uint64 public totalPausedTime;
    /// @notice Початок поточної паузи (0, якщо не на паузі).
    uint64 public pausedAt;

    mapping(bytes32 => Deal) private _deals;

    // ─── Events ────────────────────────────────────────────────────────────
    event DealCreated(
        bytes32 indexed dealId, address indexed seller, address indexed buyer, uint256 amount, bool reviewRequired
    );
    event DealFunded(bytes32 indexed dealId, uint256 amount, uint64 paymentDeadline);
    event DealPaid(bytes32 indexed dealId, address indexed buyer, uint64 paidAt);
    event DealReleased(bytes32 indexed dealId, address indexed buyer, uint256 amount);
    event DealCancelled(bytes32 indexed dealId, address indexed by, uint256 refunded);
    event DisputeOpened(bytes32 indexed dealId, address indexed by);
    event DisputeResolved(bytes32 indexed dealId, address indexed arbiter, uint256 toBuyer, uint256 toSeller);
    event DealFrozen(bytes32 indexed dealId, address indexed by, bytes32 reasonHash);
    event DealUnfrozen(bytes32 indexed dealId, address indexed by);
    event ReleaseApproved(bytes32 indexed dealId, address indexed by);
    event PaymentWindowUpdated(uint64 oldWindow, uint64 newWindow);
    event CancelGracePeriodUpdated(uint64 oldPeriod, uint64 newPeriod);

    // ─── Errors ────────────────────────────────────────────────────────────
    error ZeroAddress();
    error ZeroAmount();
    error InvalidParties();
    error DealExists(bytes32 dealId);
    error DealNotFound(bytes32 dealId);
    error InvalidStatus(bytes32 dealId, Status status);
    error NotSeller();
    error NotBuyer();
    error NotParty();
    error DealIsFrozen(bytes32 dealId);
    error DealNotFrozen(bytes32 dealId);
    error SignatureExpired();
    error InvalidSignature();
    error PaymentWindowExpired();
    error PaymentWindowActive(uint64 cancelAvailableAt);
    error ReviewPending(bytes32 dealId);
    error ReviewNotRequired(bytes32 dealId);
    error InvalidSplit();
    error InvalidPaymentWindow();
    error InvalidGracePeriod();
    error UnsupportedToken(uint256 expected, uint256 received);

    /// @param token_ ERC-20 токен ескроу.
    /// @param admin Отримує DEFAULT_ADMIN_ROLE та ARBITER_ROLE.
    constructor(IERC20 token_, address admin) EIP712("LoopsTrdEscrow", "1") {
        if (address(token_) == address(0) || admin == address(0)) revert ZeroAddress();
        token = token_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ARBITER_ROLE, admin);
    }

    // ─── Views ─────────────────────────────────────────────────────────────

    /// @notice Повні дані угоди (нульова структура, якщо угоди немає).
    function getDeal(bytes32 dealId) external view returns (Deal memory) {
        return _deals[dealId];
    }

    /// @notice Фактичний дедлайн оплати: час пауз контракту після deposit не зараховується.
    /// @return 0, якщо угода ще не профінансована.
    function effectiveDeadline(bytes32 dealId) public view returns (uint64) {
        Deal storage d = _deals[dealId];
        if (d.fundedAt == 0) return 0;
        return _effectiveDeadline(d);
    }

    /// @notice Коли угоду в стані Funded зможе скасувати не покупець (дедлайн + пільговий період).
    function cancelAvailableAt(bytes32 dealId) external view returns (uint64) {
        Deal storage d = _deals[dealId];
        if (d.fundedAt == 0) return 0;
        return _effectiveDeadline(d) + cancelGracePeriod;
    }

    /// @notice Хеш EIP-712 для підпису сервером (зручно для бекенду/тестів).
    function hashCreateDeal(
        bytes32 dealId,
        address seller,
        address buyer,
        uint256 amount,
        bool reviewRequired,
        uint256 expiry
    ) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(abi.encode(CREATE_DEAL_TYPEHASH, dealId, seller, buyer, amount, reviewRequired, expiry))
        );
    }

    // ─── Життєвий цикл угоди ───────────────────────────────────────────────

    /// @notice Продавець реєструє угоду. None → Created.
    /// @dev Потрібен EIP-712 підпис SIGNER_ROLE — доказ, що угода пройшла антифрод. Підпис прив'язаний
    ///      до dealId, продавця (msg.sender), покупця, суми, reviewRequired і терміну дії, тож його не можна
    ///      перехопити (front-running) чи змінити параметри. dealId одноразовий.
    /// @param dealId Унікальний id (keccak256 від id угоди в БД).
    /// @param buyer Адреса покупця.
    /// @param amount Сума USDT (в мінімальних одиницях токена).
    /// @param reviewRequired Якщо true — confirmRelease можливий лише після approveRelease сервером.
    /// @param expiry Термін дії підпису (unix-час).
    /// @param signature Підпис сервера.
    function createDeal(
        bytes32 dealId,
        address buyer,
        uint256 amount,
        bool reviewRequired,
        uint256 expiry,
        bytes calldata signature
    ) external whenNotPaused {
        if (buyer == address(0)) revert ZeroAddress();
        if (buyer == msg.sender) revert InvalidParties();
        if (amount == 0) revert ZeroAmount();
        if (_deals[dealId].status != Status.None) revert DealExists(dealId);
        if (block.timestamp > expiry) revert SignatureExpired();

        bytes32 digest = hashCreateDeal(dealId, msg.sender, buyer, amount, reviewRequired, expiry);
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || !hasRole(SIGNER_ROLE, signer)) revert InvalidSignature();

        _deals[dealId] = Deal({
            seller: msg.sender,
            buyer: buyer,
            amount: amount,
            createdAt: uint64(block.timestamp),
            fundedAt: 0,
            paymentDeadline: 0,
            paidAt: 0,
            pauseOffset: 0,
            status: Status.Created,
            frozen: false,
            reviewRequired: reviewRequired,
            reviewApproved: false
        });

        emit DealCreated(dealId, msg.sender, buyer, amount, reviewRequired);
    }

    /// @notice Продавець вносить USDT в ескроу. Created → Funded; стартує вікно оплати.
    /// @dev Перевіряє фактично отриману суму: токени з комісією за переказ не підтримуються,
    ///      інакше в контракті було б менше, ніж записано в угоді.
    function deposit(bytes32 dealId) external nonReentrant whenNotPaused {
        Deal storage d = _get(dealId);
        if (msg.sender != d.seller) revert NotSeller();
        _requireStatus(dealId, d, Status.Created);

        uint64 nowTs = uint64(block.timestamp);
        d.status = Status.Funded;
        d.fundedAt = nowTs;
        d.paymentDeadline = nowTs + paymentWindow;
        d.pauseOffset = _totalPaused();

        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), d.amount);
        uint256 received = token.balanceOf(address(this)) - before;
        if (received != d.amount) revert UnsupportedToken(d.amount, received);

        emit DealFunded(dealId, d.amount, d.paymentDeadline);
    }

    /// @notice Покупець: «Я оплатив». Funded → Paid. Лише до фактичного дедлайну, не на паузі,
    ///         не для замороженої угоди. Після цього скасувати угоду вже неможливо — лише спір.
    function markPaid(bytes32 dealId) external whenNotPaused {
        Deal storage d = _get(dealId);
        if (msg.sender != d.buyer) revert NotBuyer();
        _requireStatus(dealId, d, Status.Funded);
        if (d.frozen) revert DealIsFrozen(dealId);
        if (block.timestamp > _effectiveDeadline(d)) revert PaymentWindowExpired();

        d.status = Status.Paid;
        d.paidAt = uint64(block.timestamp);
        emit DealPaid(dealId, msg.sender, d.paidAt);
    }

    /// @notice Продавець підтверджує надходження гривні — USDT іде покупцю. Funded|Paid → Released.
    /// @dev Не на паузі, не для замороженої угоди; якщо reviewRequired — лише після approveRelease.
    ///      Ефекти (зміна статусу) до взаємодії (переказ) + nonReentrant.
    function confirmRelease(bytes32 dealId) external nonReentrant whenNotPaused {
        Deal storage d = _get(dealId);
        if (msg.sender != d.seller) revert NotSeller();
        if (d.status != Status.Funded && d.status != Status.Paid) revert InvalidStatus(dealId, d.status);
        if (d.frozen) revert DealIsFrozen(dealId);
        if (d.reviewRequired && !d.reviewApproved) revert ReviewPending(dealId);

        d.status = Status.Released;
        uint256 amount = d.amount;
        token.safeTransfer(d.buyer, amount);
        emit DealReleased(dealId, d.buyer, amount);
    }

    /// @notice Скасування з поверненням коштів продавцю.
    ///  - Created: будь-яка сторона (коштів ще немає).
    ///  - Funded: покупець — будь-коли; будь-хто інший (продавець, кіпер сервера) —
    ///    лише після дедлайну + cancelGracePeriod (покупець встигає відкрити спір, якщо вже заплатив).
    ///  - Paid / Disputed / frozen / кінцеві: неможливо.
    /// @dev Працює й на паузі: повернення коштів продавцю ніколи не блокується
    ///      (а дедлайн під час паузи зсувається, тож сторонні на паузі скасувати не можуть).
    function cancel(bytes32 dealId) external nonReentrant {
        Deal storage d = _get(dealId);
        if (d.frozen) revert DealIsFrozen(dealId);

        if (d.status == Status.Created) {
            if (msg.sender != d.seller && msg.sender != d.buyer) revert NotParty();
            d.status = Status.Cancelled;
            emit DealCancelled(dealId, msg.sender, 0);
            return;
        }

        if (d.status != Status.Funded) revert InvalidStatus(dealId, d.status);
        if (msg.sender != d.buyer) {
            uint64 availableAt = _effectiveDeadline(d) + cancelGracePeriod;
            if (block.timestamp <= availableAt) revert PaymentWindowActive(availableAt);
        }

        d.status = Status.Cancelled;
        uint256 amount = d.amount;
        token.safeTransfer(d.seller, amount);
        emit DealCancelled(dealId, msg.sender, amount);
    }

    /// @notice Відкрити спір (покупець або продавець). Funded|Paid → Disputed.
    /// @dev Дозволено і на паузі, і після дедлайну (поки угоду не скасовано), і для замороженої угоди.
    function openDispute(bytes32 dealId) external {
        Deal storage d = _get(dealId);
        if (msg.sender != d.seller && msg.sender != d.buyer) revert NotParty();
        if (d.status != Status.Funded && d.status != Status.Paid) revert InvalidStatus(dealId, d.status);

        d.status = Status.Disputed;
        emit DisputeOpened(dealId, msg.sender);
    }

    /// @notice Остаточне рішення адміна: toBuyer — покупцю, решта — продавцю. → Resolved.
    /// @dev Діє для Disputed та для заморожених Funded/Paid. Працює на паузі. Лише ARBITER_ROLE.
    /// @param toBuyer Сума покупцю (≤ amount); решта повертається продавцю.
    function resolveDispute(bytes32 dealId, uint256 toBuyer) external nonReentrant onlyRole(ARBITER_ROLE) {
        Deal storage d = _get(dealId);
        bool resolvable = d.status == Status.Disputed
            || (d.frozen && (d.status == Status.Funded || d.status == Status.Paid));
        if (!resolvable) revert InvalidStatus(dealId, d.status);
        if (toBuyer > d.amount) revert InvalidSplit();

        uint256 toSeller = d.amount - toBuyer;
        d.status = Status.Resolved;
        d.frozen = false;

        if (toBuyer > 0) token.safeTransfer(d.buyer, toBuyer);
        if (toSeller > 0) token.safeTransfer(d.seller, toSeller);
        emit DisputeResolved(dealId, msg.sender, toBuyer, toSeller);
    }

    // ─── Антифрод ──────────────────────────────────────────────────────────

    /// @notice Заморозка за рішенням антифроду (FREEZER_ROLE) або адміна. Кошти не рухаються до рішення адміна.
    /// @param reasonHash keccak256 текстової причини (сама причина зберігається на сервері).
    function freezeDeal(bytes32 dealId, bytes32 reasonHash) external {
        _requireFreezerOrArbiter();
        Deal storage d = _get(dealId);
        if (d.status != Status.Funded && d.status != Status.Paid && d.status != Status.Disputed) {
            revert InvalidStatus(dealId, d.status);
        }
        if (d.frozen) revert DealIsFrozen(dealId);

        d.frozen = true;
        emit DealFrozen(dealId, msg.sender, reasonHash);
    }

    /// @notice Розморожування — лише адмін. Для Funded вікно оплати подовжується до повного,
    ///         щоб час заморозки не «з'їв» час покупця.
    function unfreezeDeal(bytes32 dealId) external onlyRole(ARBITER_ROLE) {
        Deal storage d = _get(dealId);
        if (!d.frozen) revert DealNotFrozen(dealId);
        d.frozen = false;
        if (d.status == Status.Funded) {
            uint64 target = uint64(block.timestamp) + paymentWindow;
            uint64 eff = _effectiveDeadline(d);
            if (eff < target) d.paymentDeadline += target - eff;
        }
        emit DealUnfrozen(dealId, msg.sender);
    }

    /// @notice Дозвіл на відпуск коштів для угод з reviewRequired (після серверної перевірки
    ///         антифродом, підпису продавця або перевірки модератором). Сам відпуск робить лише продавець.
    function approveRelease(bytes32 dealId) external whenNotPaused {
        _requireFreezerOrArbiter();
        Deal storage d = _get(dealId);
        if (!d.reviewRequired) revert ReviewNotRequired(dealId);
        if (d.status != Status.Funded && d.status != Status.Paid) revert InvalidStatus(dealId, d.status);
        d.reviewApproved = true;
        emit ReleaseApproved(dealId, msg.sender);
    }

    // ─── Налаштування адміна ───────────────────────────────────────────────

    /// @notice Вікно оплати для НОВИХ депозитів (5 хв … 24 год).
    function setPaymentWindow(uint64 newWindow) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newWindow < MIN_PAYMENT_WINDOW || newWindow > MAX_PAYMENT_WINDOW) revert InvalidPaymentWindow();
        emit PaymentWindowUpdated(paymentWindow, newWindow);
        paymentWindow = newWindow;
    }

    /// @notice Пільговий період перед скасуванням стороннім (5 хв … 24 год). Діє одразу для всіх угод.
    function setCancelGracePeriod(uint64 newPeriod) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newPeriod < MIN_GRACE_PERIOD || newPeriod > MAX_GRACE_PERIOD) revert InvalidGracePeriod();
        emit CancelGracePeriodUpdated(cancelGracePeriod, newPeriod);
        cancelGracePeriod = newPeriod;
    }

    /// @notice Екстрена пауза (лише адмін). Зупиняє createDeal, deposit, markPaid, confirmRelease,
    ///         approveRelease. Завжди доступні: cancel покупцем, openDispute, freeze/unfreeze, resolveDispute.
    ///         Час паузи не зараховується у вікно оплати.
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
        pausedAt = uint64(block.timestamp);
    }

    /// @notice Зняти паузу.
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        totalPausedTime += uint64(block.timestamp) - pausedAt;
        pausedAt = 0;
        _unpause();
    }

    // ─── Internal ──────────────────────────────────────────────────────────

    function _totalPaused() private view returns (uint64) {
        return paused() ? totalPausedTime + (uint64(block.timestamp) - pausedAt) : totalPausedTime;
    }

    function _effectiveDeadline(Deal storage d) private view returns (uint64) {
        return d.paymentDeadline + (_totalPaused() - d.pauseOffset);
    }

    function _requireFreezerOrArbiter() private view {
        if (!hasRole(FREEZER_ROLE, msg.sender) && !hasRole(ARBITER_ROLE, msg.sender)) {
            revert AccessControlUnauthorizedAccount(msg.sender, FREEZER_ROLE);
        }
    }

    function _get(bytes32 dealId) private view returns (Deal storage d) {
        d = _deals[dealId];
        if (d.status == Status.None) revert DealNotFound(dealId);
    }

    function _requireStatus(bytes32 dealId, Deal storage d, Status expected) private view {
        if (d.status != expected) revert InvalidStatus(dealId, d.status);
    }
}

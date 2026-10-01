// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title P2PEscrow — ескроу для закритої P2P-площадки USDT ↔ UAH.
/// @notice Життєвий цикл угоди:
///   createDeal (продавець, з підписом сервера-антифроду)
///   → deposit (продавець вносить USDT)
///   → markPaid (покупець: «Я оплатив»)
///   → confirmRelease (продавець підтверджує надходження гривні) → USDT покупцю.
///   Без оплати протягом paymentWindow — cancel, кошти повертаються продавцю.
///   Будь-яка сторона може відкрити спір; вирішує лише ARBITER_ROLE (адмін).
///   Антифрод (FREEZER_ROLE) може заморозити угоду — тоді кошти не рухаються до рішення адміна.
/// @dev Модератори не мають жодної ролі в контракті й не можуть рухати кошти.
contract P2PEscrow is AccessControl, ReentrancyGuard, Pausable, EIP712 {
    using SafeERC20 for IERC20;

    /// @notice Адмін-арбітр: resolveDispute, unfreezeDeal.
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

    enum Status {
        None,
        Created,
        Funded,
        Paid,
        Released,
        Cancelled,
        Disputed,
        Resolved
    }

    struct Deal {
        address seller;
        address buyer;
        uint256 amount;
        uint64 createdAt;
        uint64 fundedAt;
        uint64 paymentDeadline;
        uint64 paidAt;
        Status status;
        bool frozen;
        bool reviewRequired;
        bool reviewApproved;
    }

    IERC20 public immutable token;
    uint64 public paymentWindow = 30 minutes;

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
    error PaymentWindowActive(uint64 deadline);
    error ReviewPending(bytes32 dealId);
    error ReviewNotRequired(bytes32 dealId);
    error InvalidSplit();
    error InvalidPaymentWindow();

    constructor(IERC20 token_, address admin) EIP712("P2PEscrow", "1") {
        if (address(token_) == address(0) || admin == address(0)) revert ZeroAddress();
        token = token_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ARBITER_ROLE, admin);
    }

    // ─── Views ─────────────────────────────────────────────────────────────

    function getDeal(bytes32 dealId) external view returns (Deal memory) {
        return _deals[dealId];
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

    // ─── Deal lifecycle ────────────────────────────────────────────────────

    /// @notice Продавець реєструє угоду. Потрібен підпис SIGNER_ROLE — доказ, що угода пройшла антифрод.
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
            status: Status.Created,
            frozen: false,
            reviewRequired: reviewRequired,
            reviewApproved: false
        });

        emit DealCreated(dealId, msg.sender, buyer, amount, reviewRequired);
    }

    /// @notice Продавець вносить USDT в ескроу. Від цього моменту стартує вікно оплати.
    function deposit(bytes32 dealId) external nonReentrant whenNotPaused {
        Deal storage d = _get(dealId);
        if (msg.sender != d.seller) revert NotSeller();
        _requireStatus(dealId, d, Status.Created);

        uint64 nowTs = uint64(block.timestamp);
        d.status = Status.Funded;
        d.fundedAt = nowTs;
        d.paymentDeadline = nowTs + paymentWindow;

        token.safeTransferFrom(msg.sender, address(this), d.amount);
        emit DealFunded(dealId, d.amount, d.paymentDeadline);
    }

    /// @notice Покупець: «Я оплатив». Можливо лише до завершення вікна оплати.
    function markPaid(bytes32 dealId) external {
        Deal storage d = _get(dealId);
        if (msg.sender != d.buyer) revert NotBuyer();
        _requireStatus(dealId, d, Status.Funded);
        if (d.frozen) revert DealIsFrozen(dealId);
        if (block.timestamp > d.paymentDeadline) revert PaymentWindowExpired();

        d.status = Status.Paid;
        d.paidAt = uint64(block.timestamp);
        emit DealPaid(dealId, msg.sender, d.paidAt);
    }

    /// @notice Продавець підтверджує надходження гривні — USDT іде покупцю.
    function confirmRelease(bytes32 dealId) external nonReentrant {
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

    /// @notice Скасування.
    ///  - Created: будь-яка сторона (коштів ще немає).
    ///  - Funded: покупець у будь-який час; будь-хто після дедлайну оплати (автоскасування). Кошти → продавцю.
    ///  - Paid / Disputed / frozen: неможливо.
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
        if (msg.sender != d.buyer && block.timestamp <= d.paymentDeadline) {
            revert PaymentWindowActive(d.paymentDeadline);
        }

        d.status = Status.Cancelled;
        uint256 amount = d.amount;
        token.safeTransfer(d.seller, amount);
        emit DealCancelled(dealId, msg.sender, amount);
    }

    /// @notice Відкрити спір (покупець або продавець) для профінансованої угоди.
    function openDispute(bytes32 dealId) external {
        Deal storage d = _get(dealId);
        if (msg.sender != d.seller && msg.sender != d.buyer) revert NotParty();
        if (d.status != Status.Funded && d.status != Status.Paid) revert InvalidStatus(dealId, d.status);

        d.status = Status.Disputed;
        emit DisputeOpened(dealId, msg.sender);
    }

    /// @notice Остаточне рішення адміна: розподіл суми між покупцем і продавцем.
    /// @dev Діє для спорів і для заморожених угод (Funded/Paid/Disputed).
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

    // ─── Anti-fraud ────────────────────────────────────────────────────────

    /// @notice Заморозка за рішенням антифроду. Кошти не рухаються до рішення адміна.
    function freezeDeal(bytes32 dealId, bytes32 reasonHash) external {
        if (!hasRole(FREEZER_ROLE, msg.sender) && !hasRole(ARBITER_ROLE, msg.sender)) {
            revert AccessControlUnauthorizedAccount(msg.sender, FREEZER_ROLE);
        }
        Deal storage d = _get(dealId);
        if (d.status != Status.Funded && d.status != Status.Paid && d.status != Status.Disputed) {
            revert InvalidStatus(dealId, d.status);
        }
        if (d.frozen) revert DealIsFrozen(dealId);

        d.frozen = true;
        emit DealFrozen(dealId, msg.sender, reasonHash);
    }

    /// @notice Розморожування — лише адмін.
    function unfreezeDeal(bytes32 dealId) external onlyRole(ARBITER_ROLE) {
        Deal storage d = _get(dealId);
        if (!d.frozen) revert DealNotFrozen(dealId);
        d.frozen = false;
        // Час, поки угода була заморожена, не повинен «з'їдати» вікно оплати покупця.
        if (d.status == Status.Funded && d.paymentDeadline < block.timestamp + paymentWindow) {
            d.paymentDeadline = uint64(block.timestamp) + paymentWindow;
        }
        emit DealUnfrozen(dealId, msg.sender);
    }

    /// @notice Додаткове підтвердження для угод середнього ризику (після перевірки модератором/адміном).
    function approveRelease(bytes32 dealId) external {
        if (!hasRole(FREEZER_ROLE, msg.sender) && !hasRole(ARBITER_ROLE, msg.sender)) {
            revert AccessControlUnauthorizedAccount(msg.sender, FREEZER_ROLE);
        }
        Deal storage d = _get(dealId);
        if (!d.reviewRequired) revert ReviewNotRequired(dealId);
        if (d.status != Status.Funded && d.status != Status.Paid) revert InvalidStatus(dealId, d.status);
        d.reviewApproved = true;
        emit ReleaseApproved(dealId, msg.sender);
    }

    // ─── Admin settings ────────────────────────────────────────────────────

    function setPaymentWindow(uint64 newWindow) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newWindow < MIN_PAYMENT_WINDOW || newWindow > MAX_PAYMENT_WINDOW) revert InvalidPaymentWindow();
        emit PaymentWindowUpdated(paymentWindow, newWindow);
        paymentWindow = newWindow;
    }

    /// @notice Зупиняє створення й фінансування НОВИХ угод. Наявні угоди можна завершити/скасувати.
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ─── Internal ──────────────────────────────────────────────────────────

    function _get(bytes32 dealId) private view returns (Deal storage d) {
        d = _deals[dealId];
        if (d.status == Status.None) revert DealNotFound(dealId);
    }

    function _requireStatus(bytes32 dealId, Deal storage d, Status expected) private view {
        if (d.status != expected) revert InvalidStatus(dealId, d.status);
    }
}

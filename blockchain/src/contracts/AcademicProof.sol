// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  AcademicProof —— 科研链证核心合约
/// @notice 学术成果原创性与 AIGC 贡献存证 / 核验。
///         原文永不上链，链上只存 SHA-256 指纹与关键元信息。
/// @author 科研链证项目（全国大学生数智链应用大赛）
contract AcademicProof {
    // ----------------------------------------------------------------------
    // 类型定义
    // ----------------------------------------------------------------------

    enum WorkType {
        Paper, // 0 论文
        Code, // 1 代码
        Dataset, // 2 数据集
        Other // 3 其他
    }

    struct Work {
        bytes32 contentHash; // 当前版本文件 SHA-256 指纹
        address author; // 登记人钱包地址（身份即地址）
        uint64 registeredAt; // 首次登记时间（链上时间戳）
        uint64 updatedAt; // 最近一次变更时间
        uint8 aigcRatio; // AIGC 介入比例 0-100
        WorkType workType; // 成果类型
        string title; // 标题（短文本，直接上链）
        string metaURI; // 扩展元信息指针（留作 IPFS 等，demo 可留空）
        bool disputed; // 是否处于争议中
        uint32 versionCount; // 版本数，首次登记即为 1
    }

    // ----------------------------------------------------------------------
    // 状态变量
    // ----------------------------------------------------------------------

    address public immutable admin;
    uint256 public workCount;

    mapping(uint256 => Work) private _works;

    /// @notice 指纹 → 成果ID，实现 O(1) 核验
    mapping(bytes32 => uint256) public hashToWorkId;

    /// @notice 成果ID → 版本号 → 指纹，保留全部历史版本
    mapping(uint256 => mapping(uint32 => bytes32)) public versionHash;

    /// @notice 成果ID → AIGC 工具声明历史
    mapping(uint256 => string[]) private _aigcTools;

    // ----------------------------------------------------------------------
    // 事件
    // ----------------------------------------------------------------------

    event WorkRegistered(
        uint256 indexed workId,
        bytes32 indexed contentHash,
        address indexed author,
        uint64 timestamp,
        string title
    );
    event VersionAdded(uint256 indexed workId, uint32 version, bytes32 contentHash, uint8 aigcRatio);
    event AIGCDeclared(uint256 indexed workId, uint8 ratio, string tools);
    event DisputeRaised(uint256 indexed workId, address indexed raiser, string reason);

    // ----------------------------------------------------------------------
    // 自定义错误（比 require 字符串省 gas，也是工程规范的体现）
    // ----------------------------------------------------------------------

    error AlreadyRegistered();
    error NotAuthor();
    error InvalidRatio();
    error NotFound();
    error ZeroHash();
    error SameHash();
    error EmptyTitle();

    // ----------------------------------------------------------------------
    // 修饰器
    // ----------------------------------------------------------------------

    modifier onlyExisting(uint256 workId) {
        if (_works[workId].author == address(0)) revert NotFound();
        _;
    }

    modifier onlyWorkAuthor(uint256 workId) {
        if (_works[workId].author != msg.sender) revert NotAuthor();
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    // ----------------------------------------------------------------------
    // 核心功能
    // ----------------------------------------------------------------------

    /// @notice 登记一份新成果（存证）
    /// @param  _contentHash 文件 SHA-256 指纹（浏览器本地计算，0x 前缀 32 字节）
    /// @param  _title       成果标题
    /// @param  _type        成果类型
    /// @param  _aigcRatio   AIGC 介入比例 0-100
    /// @param  _metaURI     扩展元信息指针，可传空字符串
    /// @return workId       成果编号，从 1 开始
    function registerWork(
        bytes32 _contentHash,
        string calldata _title,
        WorkType _type,
        uint8 _aigcRatio,
        string calldata _metaURI
    ) external returns (uint256 workId) {
        if (_contentHash == bytes32(0)) revert ZeroHash();
        if (hashToWorkId[_contentHash] != 0) revert AlreadyRegistered();
        if (_aigcRatio > 100) revert InvalidRatio();
        if (bytes(_title).length == 0) revert EmptyTitle();

        unchecked {
            workId = ++workCount; // workCount 不可能溢出 uint256
        }

        _works[workId] = Work({
            contentHash: _contentHash,
            author: msg.sender,
            registeredAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp),
            aigcRatio: _aigcRatio,
            workType: _type,
            title: _title,
            metaURI: _metaURI,
            disputed: false,
            versionCount: 1
        });

        hashToWorkId[_contentHash] = workId;
        versionHash[workId][1] = _contentHash;

        emit WorkRegistered(workId, _contentHash, msg.sender, uint64(block.timestamp), _title);
    }

    /// @notice 追加新版本（过程留痕：同一成果的迭代历史全部可查）
    /// @dev    仅成果作者可调用；历史版本指纹永久保留在 versionHash 中
    function addVersion(
        uint256 _workId,
        bytes32 _contentHash,
        uint8 _aigcRatio
    ) external onlyExisting(_workId) onlyWorkAuthor(_workId) {
        if (_contentHash == bytes32(0)) revert ZeroHash();
        if (_aigcRatio > 100) revert InvalidRatio();

        Work storage w = _works[_workId];
        if (_contentHash == w.contentHash) revert SameHash();

        // 该指纹若已被其他成果占用，禁止挪用
        uint256 owner = hashToWorkId[_contentHash];
        if (owner != 0 && owner != _workId) revert AlreadyRegistered();

        unchecked {
            w.versionCount += 1;
        }
        w.contentHash = _contentHash;
        w.aigcRatio = _aigcRatio;
        w.updatedAt = uint64(block.timestamp);

        versionHash[_workId][w.versionCount] = _contentHash;
        hashToWorkId[_contentHash] = _workId;

        emit VersionAdded(_workId, w.versionCount, _contentHash, _aigcRatio);
    }

    /// @notice 声明 / 更新 AIGC 使用情况（核心差异化卖点）
    function declareAIGC(
        uint256 _workId,
        uint8 _ratio,
        string calldata _tools
    ) external onlyExisting(_workId) onlyWorkAuthor(_workId) {
        if (_ratio > 100) revert InvalidRatio();

        Work storage w = _works[_workId];
        w.aigcRatio = _ratio;
        w.updatedAt = uint64(block.timestamp);
        _aigcTools[_workId].push(_tools);

        emit AIGCDeclared(_workId, _ratio, _tools);
    }

    /// @notice 核验：任何人可调用，view 函数零成本
    /// @return exists       是否已登记
    /// @return workId       成果编号
    /// @return author       登记人
    /// @return registeredAt 首次登记时间
    /// @return aigcRatio    AIGC 比例
    /// @return title        标题
    function verifyWork(
        bytes32 _contentHash
    )
        external
        view
        returns (
            bool exists,
            uint256 workId,
            address author,
            uint64 registeredAt,
            uint8 aigcRatio,
            string memory title
        )
    {
        workId = hashToWorkId[_contentHash];
        if (workId == 0) return (false, 0, address(0), 0, 0, "");
        Work storage w = _works[workId];
        return (true, workId, w.author, w.registeredAt, w.aigcRatio, w.title);
    }

    /// @notice 对已登记的成果发起争议（任意第三方 / 作者均可发起）
    function raiseDispute(
        uint256 _workId,
        string calldata _reason
    ) external onlyExisting(_workId) {
        _works[_workId].disputed = true;
        emit DisputeRaised(_workId, msg.sender, _reason);
    }

    // ----------------------------------------------------------------------
    // 只读查询
    // ----------------------------------------------------------------------

    function getWork(uint256 _workId) external view returns (Work memory) {
        return _works[_workId];
    }

    function getVersionHash(uint256 _workId, uint32 _version) external view returns (bytes32) {
        return versionHash[_workId][_version];
    }

    function getAigcTools(uint256 _workId) external view returns (string[] memory) {
        return _aigcTools[_workId];
    }

    /// @notice 某地址登记的成果总数（前端"我的存证"用）
    function getWorkCountOf(address _author) external view returns (uint256 count) {
        for (uint256 i = 1; i <= workCount; ) {
            if (_works[i].author == _author) {
                unchecked {
                    ++count;
                }
            }
            unchecked {
                ++i;
            }
        }
    }
}

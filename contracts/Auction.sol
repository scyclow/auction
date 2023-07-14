// SPDX-License-Identifier: MIT


/*

 █████  ██    ██  ██████ ████████ ██  ██████  ███    ██
██   ██ ██    ██ ██         ██    ██ ██    ██ ████   ██
███████ ██    ██ ██         ██    ██ ██    ██ ██ ██  ██
██   ██ ██    ██ ██         ██    ██ ██    ██ ██  ██ ██
██   ██  ██████   ██████    ██    ██  ██████  ██   ████

*/


pragma solidity ^0.8.17;



interface IWETH {
  function deposit() external payable;
  function withdraw(uint256 wad) external;
  function transfer(address to, uint256 value) external returns (bool);
}

interface Minter {
  function mint(address to, uint256 tokenId) external;
}

interface AllowList {
  function balanceOf(address owner) external view returns (uint256);
}

interface RewardMinter {
  function mint(address to) external;
}


abstract contract Ownable {
  address private _owner;

  event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

  /**
   * @dev Initializes the contract setting the deployer as the initial owner.
   */
  constructor() {
    _setOwner(msg.sender);
  }

  /**
   * @dev Returns the address of the current owner.
   */
  function owner() public view virtual returns (address) {
    return _owner;
  }

  /**
   * @dev Throws if called by any account other than the owner.
   */
  modifier onlyOwner() {
    require(owner() == msg.sender, "Ownable: caller is not the owner");
    _;
  }

  /**
   * @dev Leaves the contract without owner. It will not be possible to call
   * `onlyOwner` functions anymore. Can only be called by the current owner.
   *
   * NOTE: Renouncing ownership will leave the contract without an owner,
   * thereby removing any functionality that is only available to the owner.
   */
  function renounceOwnership() public virtual onlyOwner {
      _setOwner(address(0));
  }

  /**
   * @dev Transfers ownership of the contract to a new account (`newOwner`).
   * Can only be called by the current owner.
   */
  function transferOwnership(address newOwner) public virtual onlyOwner {
    require(newOwner != address(0), "Ownable: new owner is the zero address");
    _setOwner(newOwner);
  }

  function _setOwner(address newOwner) private {
    address oldOwner = _owner;
    _owner = newOwner;
    emit OwnershipTransferred(oldOwner, newOwner);
  }
}

contract MinterAuction is Ownable {
  IWETH public immutable weth = IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

  uint256 public auctionCount;

  struct Auction {
    uint256 duration;
    uint256 bidIncreaseBps;
    uint256 bidTimeExtension;
    uint256 minBid;
    uint256 tokenId;
    uint256 startTime;
    address beneficiary;
    Minter minterContract;
    RewardMinter rewardContract;
    AllowList allowListContract;
    bool isSettled;
  }

  struct Bid {
    uint128 amount;
    uint128 timestamp;
    address bidder;
  }


  event BidMade(uint256 indexed auctionId, address indexed bidder, uint256 amount, uint256 timestamp);
  event Settled(uint256 indexed auctionId, uint256 timestamp);

  mapping(uint256 => Auction) public auctionIdToAuction;
  mapping(uint256 => Bid) public auctionIdToHighestBid;



  function create(
    uint256 duration,
    uint256 bidIncreaseBps,
    uint256 bidTimeExtension,
    uint256 minBid,
    uint256 tokenId,
    address beneficiary,
    Minter minterContract,
    RewardMinter rewardContract,
    AllowList allowListContract
  ) external onlyOwner {
    require(duration > 0);
    require(bidIncreaseBps > 0);
    require(address(minterContract) != address(0));

    auctionIdToAuction[auctionCount].duration = duration;
    auctionIdToAuction[auctionCount].bidIncreaseBps = bidIncreaseBps;
    auctionIdToAuction[auctionCount].bidTimeExtension = bidTimeExtension;
    auctionIdToAuction[auctionCount].minBid = minBid;
    auctionIdToAuction[auctionCount].tokenId = tokenId;
    auctionIdToAuction[auctionCount].beneficiary = beneficiary;
    auctionIdToAuction[auctionCount].minterContract = minterContract;
    auctionIdToAuction[auctionCount].rewardContract = rewardContract;
    auctionIdToAuction[auctionCount].allowListContract = allowListContract;

    auctionCount++;
  }

  function bid(uint256 auctionId, bool wantsReward) external payable {
    _bid(auctionId, wantsReward);
  }

  function bid(uint256 auctionId) external payable {
    _bid(auctionId, false);
  }


  function _bid(uint256 auctionId, bool wantsReward) private {
    Auction storage auction = auctionIdToAuction[auctionId];
    Bid storage highestBid = auctionIdToHighestBid[auctionId];

    require(_isActive(auction, highestBid), 'Auction is not active');

    if (address(auction.allowListContract) != address(0)) {
      require(auction.allowListContract.balanceOf(msg.sender) > 0, 'Bidder not on allow list');
    }

    require(
      msg.value >= (highestBid.amount * (10000 + auction.bidIncreaseBps) / 10000)
      && msg.value >= auction.minBid,
      'Bid not high enough'
    );

    uint256 refundAmount;
    address refundBidder;

    if (highestBid.timestamp > 0) {
      refundAmount = highestBid.amount;
      refundBidder = highestBid.bidder;
    } else {
      auction.startTime = block.timestamp;
    }

    highestBid.timestamp = uint128(block.timestamp);
    highestBid.amount = uint128(msg.value);
    highestBid.bidder = msg.sender;

    if (wantsReward && address(auction.rewardContract) != address(0)) {
      auction.rewardContract.mint(msg.sender);
    }

    emit BidMade(auctionId, msg.sender, msg.value, block.timestamp);

    if (refundAmount > 0) _safeTransferETH(refundBidder, refundAmount);
  }

  function cancel(uint256 auctionId) external onlyOwner {
    Bid memory highestBid = auctionIdToHighestBid[auctionId];
    Auction storage auction = auctionIdToAuction[auctionId];

    require(auction.duration > 0, 'Auction does not exist');
    require(highestBid.timestamp == 0, 'Auction is active');
    require(!auction.isSettled, 'Auction has settled');

    auction.isSettled = true;
  }

  function settle(uint256 auctionId) external payable {
    Auction memory auction = auctionIdToAuction[auctionId];
    Bid storage highestBid = auctionIdToHighestBid[auctionId];

    require(!auction.isSettled, 'Auction has already been settled');
    require(!_isActive(auction, highestBid), 'Auction is still active');

    auction.isSettled = true;

    emit Settled(auctionId, block.timestamp);

    try auction.minterContract.mint(highestBid.bidder, auction.tokenId) {
      payable(owner()).transfer(highestBid.amount);
    } catch {
      payable(highestBid.bidder).transfer(highestBid.amount);
    }
  }

  function isActive(uint256 auctionId) public view returns (bool) {
    Auction memory auction = auctionIdToAuction[auctionId];
    Bid memory highestBid = auctionIdToHighestBid[auctionId];

    return _isActive(auction, highestBid);
  }

  function _isActive(Auction memory auction, Bid memory highestBid) private view returns (bool) {
    if (highestBid.timestamp == 0) return !auction.isSettled && auction.duration > 0;

    uint256 endTime = auction.startTime + auction.duration;

    return (
      block.timestamp < endTime
      || block.timestamp < highestBid.timestamp + auction.bidTimeExtension
    );
  }


  /**
   * @notice Transfer ETH. If the ETH transfer fails, wrap the ETH and try send it as WETH.
   */
  function _safeTransferETHWithFallback(address to, uint256 amount) internal {
    if (!_safeTransferETH(to, amount)) {
      weth.deposit{ value: amount }();
      weth.transfer(to, amount);
    }
  }

  /**
   * @notice Transfer ETH and return the success status.
   * @dev This function only forwards 30,000 gas to the callee.
   */
  function _safeTransferETH(address to, uint256 value) internal returns (bool) {
    (bool success, ) = to.call{ value: value, gas: 30_000 }(new bytes(0));
    return success;
  }
}



// SPDX-License-Identifier: MIT

import "./Dependencies.sol";

pragma solidity ^0.8.17;


contract MinterMock {
  mapping(uint256 => address) public ownerOf;

  function mint(address to, uint256 tokenId) external {
    ownerOf[tokenId] = to;
  }

}

contract RewardMinterMock {
  mapping(address => uint256) public balanceOf;

  function mint(address to) external {
    balanceOf[to] += 1;
  }
}

contract AllowListMock {
  mapping(address => uint256) public balanceOf;

  function setBalance(address addr, uint256 balance) external {
    balanceOf[addr] = balance;
  }
}

contract FaultyMinterMock {
  function mint(address, uint256) external {
    revert('Uh oh...');
  }
}

contract ExistingTokenMock is ERC721 {
  constructor() ERC721('Existing Token Mock', 'Mock') {}

  function mint(address to, uint256 tokenId) external {
    _mint(to, tokenId);
  }
}

contract UniswapV2Mock {
  function getReserves() external view returns (uint112, uint112, uint32) {
    return (
      uint112(29954418357284),
      uint112(15982938777635119725700),
      uint32(block.timestamp)
    );
  }
}
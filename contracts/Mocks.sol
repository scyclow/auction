// SPDX-License-Identifier: MIT



pragma solidity ^0.8.17;


contract MinterMock {
  mapping(address => uint256) public addrToTokenId;

  function mint(address to, uint256 tokenId) external {
    addrToTokenId[to] = tokenId;
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
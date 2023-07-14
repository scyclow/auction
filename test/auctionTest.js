const { expect } = require('chai')
const { ethers, waffle } = require('hardhat')
const { expectRevert, time, snapshot } = require('@openzeppelin/test-helpers')


const toETH = amt => ethers.utils.parseEther(String(amt))
const bidAmount = amt => ({ value: toETH(amt) })
const ethVal = n => Number(ethers.utils.formatEther(n))
const num = n => Number(n)


function times(t, fn) {
  const out = []
  for (let i = 0; i < t; i++) out.push(fn(i))
  return out
}



const ONE_DAY = 60 * 60 * 24
const TEN_MINUTES = 60 * 10
const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
const safeTransferFrom = 'safeTransferFrom(address,address,uint256)'
const bid = 'bid(uint256)'
const bidWithReward = 'bid(uint256,bool)'

const expectOwnableError = p => expectRevert(p, 'Ownable: caller is not the owner')
const createGenericAuction = () => MinterAuction.connect(admin).create(ONE_DAY, 1000, TEN_MINUTES, 0, 0, admin.address, MinterMock.address, ZERO_ADDR, ZERO_ADDR)


let admin, bidder1, bidder2, bidder3
let MinterAuction



const auctionSetup = async () => {
  const signers = await ethers.getSigners()

  admin = signers[0]
  bidder1 = signers[1]
  bidder2 = signers[2]
  bidder3 = signers[3]


  const MinterAuctionFactory = await ethers.getContractFactory('MinterAuction', admin)
  MinterAuction = await MinterAuctionFactory.deploy()
  await MinterAuction.deployed()

  const MinterMockFactory = await ethers.getContractFactory('MinterMock', admin)
  MinterMock = await MinterMockFactory.deploy()
  await MinterMock.deployed()

  const RewardMinterMockFactory = await ethers.getContractFactory('RewardMinterMock', admin)
  RewardMinterMock = await RewardMinterMockFactory.deploy()
  await RewardMinterMock.deployed()

  const AllowListMockFactory = await ethers.getContractFactory('AllowListMock', admin)
  AllowListMock = await AllowListMockFactory.deploy()
  await AllowListMock.deployed()

}





describe('MinterAuction', () => {
  beforeEach(async () => {
    await auctionSetup()
  })

  describe.only('create', () => {
    it('creates the auction', async () => {
      expect(await MinterAuction.connect(admin).auctionCount()).to.equal(0)
      await MinterAuction.connect(admin).create(
        ONE_DAY,
        1000,
        TEN_MINUTES,
        111,
        1,
        admin.address,
        MinterMock.address,
        RewardMinterMock.address,
        AllowListMock.address,
      )
      expect(await MinterAuction.connect(admin).auctionCount()).to.equal(1)

      const auction = await MinterAuction.connect(admin).auctionIdToAuction(0)
      expect(num(auction.duration)).to.equal(ONE_DAY)
      expect(num(auction.bidIncreaseBps)).to.equal(1000)
      expect(num(auction.bidTimeExtension)).to.equal(TEN_MINUTES)
      expect(num(auction.minBid)).to.equal(111)
      expect(num(auction.tokenId)).to.equal(1)
      expect(num(auction.startTime)).to.equal(0)
      expect(auction.beneficiary).to.equal(admin.address)
      expect(auction.minterContract).to.equal(MinterMock.address)
      expect(auction.rewardContract).to.equal(RewardMinterMock.address)
      expect(auction.allowListContract).to.equal(AllowListMock.address)
      expect(auction.isSettled).to.equal(false)
    })

    it('reverts if called by non owner', async () => {
      await expectOwnableError(
        MinterAuction.connect(bidder1).create(ONE_DAY, 1000, TEN_MINUTES, 0, 0, admin.address, MinterMock.address, RewardMinterMock.address, AllowListMock.address),
      )
    })
  })

  describe.only('isActive', () => {
    it('returns true if it hasnt started yet', async () => {
      await createGenericAuction()

      expect(await MinterAuction.connect(admin).isActive(0)).to.equal(true)
    })

    it('returns true if auction duration hasn\'t ellapsed yet', async () => {
      await createGenericAuction()
      await MinterAuction.connect(admin).create(ONE_DAY*2, 1000, TEN_MINUTES, 0, 0, admin.address, MinterMock.address, ZERO_ADDR, ZERO_ADDR)
      await MinterAuction.connect(admin).create(ONE_DAY/2, 1000, TEN_MINUTES, 0, 0, admin.address, MinterMock.address, ZERO_ADDR, ZERO_ADDR)
      await MinterAuction.connect(bidder1)[bid](0, bidAmount(0.1))
      await MinterAuction.connect(bidder1)[bid](1, bidAmount(0.1))
      await MinterAuction.connect(bidder1)[bid](2, bidAmount(0.1))


      expect(await MinterAuction.connect(admin).isActive(0)).to.equal(true)
      await time.increase(time.duration.seconds(ONE_DAY - 30))
      expect(await MinterAuction.connect(admin).isActive(0)).to.equal(true)
      expect(await MinterAuction.connect(admin).isActive(2)).to.equal(false)

      await time.increase(time.duration.seconds(ONE_DAY/2))
      expect(await MinterAuction.connect(admin).isActive(0)).to.equal(false)
      expect(await MinterAuction.connect(admin).isActive(1)).to.equal(true)
    })

    it('returns true if auction duration has ellapsed, but there was a late bid', async () => {
      await createGenericAuction()
      await MinterAuction.connect(bidder1)[bid](0, bidAmount(0.1))

      expect(await MinterAuction.connect(admin).isActive(0)).to.equal(true)
      await time.increase(time.duration.seconds(ONE_DAY - 30))
      await MinterAuction.connect(bidder2)[bid](0, bidAmount(0.2))
      await time.increase(time.duration.seconds(TEN_MINUTES - 30))

      expect(await MinterAuction.connect(admin).isActive(0)).to.equal(true)
    })

    it('returns true if auction duration has ellapsed, but there were multiple late bids', async () => {
      await createGenericAuction()
      await MinterAuction.connect(bidder1)[bid](0, bidAmount(0.1))

      expect(await MinterAuction.connect(admin).isActive(0)).to.equal(true)
      await time.increase(time.duration.seconds(ONE_DAY - 30))
      await MinterAuction.connect(bidder2)[bid](0, bidAmount(0.2))

      await time.increase(time.duration.seconds(TEN_MINUTES - 30))
      await MinterAuction.connect(bidder1)[bid](0, bidAmount(0.3))

      await time.increase(time.duration.seconds(TEN_MINUTES - 30))
      await MinterAuction.connect(bidder2)[bid](0, bidAmount(0.4))

      expect(await MinterAuction.connect(admin).isActive(0)).to.equal(true)
      await time.increase(time.duration.seconds(TEN_MINUTES))
      expect(await MinterAuction.connect(admin).isActive(0)).to.equal(false)
    })

    it('returns false if duration has ellapsed', async () => {
      await createGenericAuction()
      await MinterAuction.connect(bidder1)[bid](0, bidAmount(0.1))

      expect(await MinterAuction.connect(admin).isActive(0)).to.equal(true)
      await time.increase(time.duration.seconds(ONE_DAY+1))
      expect(await MinterAuction.connect(admin).isActive(0)).to.equal(false)
    })

    it('returns false if auction duration has ellapsed, there were late bids, and extenstions ellapsed', async () => {
      await createGenericAuction()
      await MinterAuction.connect(bidder1)[bid](0, bidAmount(0.1))

      expect(await MinterAuction.connect(admin).isActive(0)).to.equal(true)
      await time.increase(time.duration.seconds(ONE_DAY - 30))
      await MinterAuction.connect(bidder2)[bid](0, bidAmount(0.2))
      await time.increase(time.duration.seconds(TEN_MINUTES + 1))

      expect(await MinterAuction.connect(admin).isActive(0)).to.equal(false)
    })

    it('returns false for nonexistant auctions', async () => {
      expect(await MinterAuction.connect(admin).isActive(27)).to.equal(false)
    })

    it('returns false for cancelled auctions', async () => {
      await createGenericAuction()
      await MinterAuction.connect(admin).cancel(0)
      expect(await MinterAuction.connect(admin).isActive(0)).to.equal(false)
    })
  })

  describe.only('bid', () => {
    it('updates the highest bidder for an auction', async () => {
      await createGenericAuction()
      const noBidder = await MinterAuction.connect(admin).auctionIdToHighestBid(0)
      expect(num(noBidder.amount)).to.equal(0)
      expect(num(noBidder.timestamp)).to.equal(0)
      expect(noBidder.bidder).to.equal(ZERO_ADDR)

      await MinterAuction.connect(bidder1)[bid](0, bidAmount(0.1))
      let latest = num(await time.latest())

      const highestBid1 = await MinterAuction.connect(admin).auctionIdToHighestBid(0)
      expect(ethVal(highestBid1.amount)).to.equal(0.1)
      expect(num(highestBid1.timestamp)).to.equal(latest)
      expect(highestBid1.bidder).to.equal(bidder1.address)

      await MinterAuction.connect(bidder2)[bid](0, bidAmount(0.2))
      latest = num(await time.latest())

      const highestBid2 = await MinterAuction.connect(admin).auctionIdToHighestBid(0)
      expect(ethVal(highestBid2.amount)).to.equal(0.2)
      expect(num(highestBid2.timestamp)).to.equal(latest)
      expect(highestBid2.bidder).to.equal(bidder2.address)
    })

    it('refunds previous bidder if there is one', async () => {
      await createGenericAuction()
      const startingEthBalance1 = ethVal(await bidder1.getBalance())
      const startingEthBalance2 = ethVal(await bidder2.getBalance())
      await MinterAuction.connect(bidder1)[bid](0, bidAmount(0.1))
      const middleEthBalance1 = ethVal(await bidder1.getBalance())
      await MinterAuction.connect(bidder2)[bid](0, bidAmount(0.2))
      const endingEthBalance1 = ethVal(await bidder1.getBalance())
      const endingEthBalance2 = ethVal(await bidder2.getBalance())

      expect(startingEthBalance1 - endingEthBalance1).to.be.closeTo(0, 0.01)
      expect(startingEthBalance1 - middleEthBalance1).to.be.closeTo(0.1, 0.01)
      expect(startingEthBalance2 - endingEthBalance2).to.be.closeTo(0.2, 0.01)
    })


    it('mints a reward if reward contract and bidder wants it & rewards contract exists', async () => {
      await createGenericAuction()
      await MinterAuction.connect(bidder1)[bidWithReward](0, true, bidAmount(0.1))
      await MinterAuction.connect(bidder2)[bidWithReward](0, false, bidAmount(0.2))

      expect(await RewardMinterMock.connect(admin).balanceOf(bidder1.address)).to.equal(0)
      expect(await RewardMinterMock.connect(admin).balanceOf(bidder2.address)).to.equal(0)

      await MinterAuction.connect(admin).create(ONE_DAY, 1000, TEN_MINUTES, 0, 0, admin.address, MinterMock.address, RewardMinterMock.address, ZERO_ADDR)
      await MinterAuction.connect(bidder1)[bidWithReward](1, true, bidAmount(0.1))
      await MinterAuction.connect(bidder2)[bidWithReward](1, false, bidAmount(0.2))

      expect(await RewardMinterMock.connect(admin).balanceOf(bidder1.address)).to.equal(1)
      expect(await RewardMinterMock.connect(admin).balanceOf(bidder2.address)).to.equal(0)
      await MinterAuction.connect(bidder1)[bidWithReward](1, true, bidAmount(0.3))
      expect(await RewardMinterMock.connect(admin).balanceOf(bidder1.address)).to.equal(2)
    })

    it('emits BidMade', async () => {
      await createGenericAuction()
      await MinterAuction.connect(bidder1)[bid](0, bidAmount(0.1))

      const latest = num(await time.latest())

      const auctionEvents = await MinterAuction.queryFilter({
        address: MinterAuction.address,
        topics: []
      })

      expect(auctionEvents.length).to.equal(2)
      expect(auctionEvents[1].event).to.equal('BidMade')
      expect(num(auctionEvents[1].args.auctionId)).to.equal(0)
      expect(auctionEvents[1].args.bidder).to.equal(bidder1.address)
      expect(ethVal(auctionEvents[1].args.amount)).to.equal(0.1)
      expect(num(auctionEvents[1].args.timestamp)).to.equal(latest)
    })

    it('reverts if duration has ellapsed', async () => {
      await createGenericAuction()
      await MinterAuction.connect(bidder1)[bid](0, bidAmount(0.1))

      await time.increase(time.duration.seconds(ONE_DAY+1))

      await expectRevert(
        MinterAuction.connect(bidder2)[bid](0, bidAmount(0.2)),
        'Auction is not active'
      )
    })

    it('reverts if auction duration has ellapsed, there were late bids, and extenstions ellapsed', async () => {
      await createGenericAuction()
      await MinterAuction.connect(bidder1)[bid](0, bidAmount(0.1))

      await time.increase(time.duration.seconds(ONE_DAY - 30))
      await MinterAuction.connect(bidder2)[bid](0, bidAmount(0.2))

      await time.increase(time.duration.seconds(TEN_MINUTES - 30))
      await MinterAuction.connect(bidder1)[bid](0, bidAmount(0.3))

      await time.increase(time.duration.seconds(TEN_MINUTES + 1))
      await expectRevert(
        MinterAuction.connect(bidder2)[bid](0, bidAmount(0.4)),
        'Auction is not active'
      )

      await MinterAuction.connect(admin).create(ONE_DAY, 1000, TEN_MINUTES - 60, 0, 0, admin.address, MinterMock.address, ZERO_ADDR, ZERO_ADDR)
      await MinterAuction.connect(bidder1)[bid](1, bidAmount(0.1))
      await time.increase(time.duration.seconds(ONE_DAY - 30))
      await MinterAuction.connect(bidder2)[bid](1, bidAmount(0.2))
      await time.increase(time.duration.seconds(TEN_MINUTES - 30))
      await expectRevert(
        MinterAuction.connect(bidder1)[bid](0, bidAmount(0.3)),
        'Auction is not active'
      )

    })

    it('reverts if nonexistant auctions', async () => {
      await expectRevert(
        MinterAuction.connect(bidder1)[bid](0, bidAmount(0.1)),
        'Auction is not active'
      )
    })

    it('reverts if auction is cancelled', async () => {
      await createGenericAuction()
      await MinterAuction.connect(admin).cancel(0)
      await expectRevert(
        MinterAuction.connect(bidder1)[bid](0, bidAmount(0.1)),
        'Auction is not active'
      )
    })

    it('reverts if allow list given and bidder is not on it', async () => {
      await MinterAuction.connect(admin).create(ONE_DAY, 1000, TEN_MINUTES, 0, 0, admin.address, MinterMock.address, ZERO_ADDR, AllowListMock.address)

      await expectRevert(
        MinterAuction.connect(bidder1)[bid](0, bidAmount(0.1)),
        'Bidder not on allow list'
      )

      await AllowListMock.connect(admin).setBalance(bidder1.address, 1)

      await MinterAuction.connect(bidder1)[bid](0, bidAmount(0.1))
    })

    it('reverts if bid is not x% higher than previous bid', async () => {
      await MinterAuction.connect(admin).create(ONE_DAY, 1000, TEN_MINUTES, 0, 0, admin.address, MinterMock.address, ZERO_ADDR, ZERO_ADDR)
      await MinterAuction.connect(admin).create(ONE_DAY, 2000, TEN_MINUTES, 0, 0, admin.address, MinterMock.address, ZERO_ADDR, ZERO_ADDR)

      await MinterAuction.connect(bidder1)[bid](0, bidAmount(0.1))
      await expectRevert(
        MinterAuction.connect(bidder2)[bid](0, bidAmount(0.109)),
        'Bid not high enough'
      )
      await MinterAuction.connect(bidder2)[bid](0, bidAmount(0.11))
      await expectRevert(
        MinterAuction.connect(bidder1)[bid](0, bidAmount(0.12)),
        'Bid not high enough'
      )
      await MinterAuction.connect(bidder2)[bid](0, bidAmount(0.121))

      await MinterAuction.connect(bidder1)[bid](1, bidAmount(0.1))
      await expectRevert(
        MinterAuction.connect(bidder2)[bid](1, bidAmount(0.11)),
        'Bid not high enough'
      )
      await MinterAuction.connect(bidder2)[bid](1, bidAmount(0.12))
    })

    it('reverts if bid is not higher than min bid', async () => {
      await MinterAuction.connect(admin).create(ONE_DAY, 1000, TEN_MINUTES, toETH(0.11), 0, admin.address, MinterMock.address, ZERO_ADDR, ZERO_ADDR)

      const auction = await MinterAuction.connect(admin).auctionIdToAuction(0)

      await expectRevert(
        MinterAuction.connect(bidder1)[bid](0, bidAmount(0.1)),
        'Bid not high enough'
      )
      await MinterAuction.connect(bidder1)[bid](0, bidAmount(0.11))
    })
  })

  describe('cancel', () => {
    it('reverts if called by non owner', async () => {
      await createGenericAuction()
      expectOwnableError(MinterAuction.connect(bidder1).cancel(0))
    })

    it('reverts if cancelled multiple times', async () => {
      await createGenericAuction()
      await MinterAuction.connect(admin).cancel(0)
      await expectRevert(
        MinterAuction.connect(admin).cancel(0),
        'Auction has settled'
      )
    })

    it('reverts if auction is active', async () => {
      await createGenericAuction()
      await MinterAuction.connect(bidder1)[bid](0, bidAmount(0.1))
      await expectRevert(
        MinterAuction.connect(admin).cancel(0),
        'Auction is active'
      )
    })

    it('reverts if cancelling a non existant auction', async () => {
      await expectRevert(
        MinterAuction.connect(admin).cancel(0),
        'Auction does not exist'
      )
    })

    it('reverts if auction is settled', async () => {
      await createGenericAuction()
      await MinterAuction.connect(bidder1)[bid](0, bidAmount(0.1))
      await time.increase(time.duration.seconds(ONE_DAY + 1))

      await MinterAuction.connect(bidder1).settle(0)

      await expectRevert(
        MinterAuction.connect(admin).cancel(0),
        'Auction has settled'
      )
    })
  })

  describe('settle', () => {
    it('mints the correct token + pays the correct beneficiary', async () => {

    })

    it('emits Settled', async () => {

    })

    it('reverts if auction is still active', async () => {

    })

    it('reverts if auction has alredy been settled', async () => {

    })

    it('refunds the bidder if minting fails for some reason', async () => {

    })
  })

  describe('multiple auctions', () => {
    it('multiple simultaneous auctions work', async () => {

    })
  })
})







  // describe('isAuctionActive', () => {
  //   describe('happy path', () => {
  //     it('should return true when between the start and end time, but false otherwise', async () => {
  //       expect(await SequelsMultiAuction.connect(admin).isAuctionActive(0)).to.equal(false)
  //       await time.increaseTo(START_TIME_MULTI)
  //       expect(await SequelsMultiAuction.connect(admin).isAuctionActive(0)).to.equal(true)
  //       await time.increaseTo(END_TIME_MULTI - 1)
  //       expect(await SequelsMultiAuction.connect(admin).isAuctionActive(0)).to.equal(true)
  //       await time.increaseTo(END_TIME_MULTI)
  //       expect(await SequelsMultiAuction.connect(admin).isAuctionActive(0)).to.equal(false)

  //     })
  //   })


  //   describe('last minute bids', () => {
  //     it('should return true if current time is < 10 min after last bid', async () => {
  //       await time.increaseTo(START_TIME_MULTI)
  //       await SequelsMultiAuction.connect(bidder1).bid(1, bidAmount(0.01))

  //       await time.increaseTo(END_TIME_MULTI - 20)
  //       await SequelsMultiAuction.connect(bidder1).bid(2, bidAmount(0.01))

  //       await time.increaseTo(END_TIME_MULTI + 1)
  //       expect(await SequelsMultiAuction.connect(admin).isAuctionActive(1)).to.equal(false)
  //       expect(await SequelsMultiAuction.connect(admin).isAuctionActive(2)).to.equal(true)

  //       await time.increaseTo(END_TIME_MULTI + 579)
  //       expect(await SequelsMultiAuction.connect(admin).isAuctionActive(2)).to.equal(true)

  //       await time.increaseTo(END_TIME_MULTI + 581)
  //       expect(await SequelsMultiAuction.connect(admin).isAuctionActive(2)).to.equal(false)
  //     })
  //   })
  // })

  // describe('bidding', () => {
  //   describe('happy path', () => {
  //     it('should work', async () => {
  //       const tokenId1 = 1
  //       const tokenId2 = 2
  //       await time.increaseTo(START_TIME_MULTI)

  //       await SequelsMultiAuction.connect(bidder1).bid(tokenId1, bidAmount(0.01))
  //       await SequelsMultiAuction.connect(bidder2).bid(tokenId1, bidAmount(0.02))
  //       await SequelsMultiAuction.connect(bidder3).bid(tokenId1, bidAmount(0.04))
  //       await SequelsMultiAuction.connect(bidder1).bid(tokenId1, bidAmount(0.08))

  //       await SequelsMultiAuction.connect(bidder1).bid(tokenId2, bidAmount(0.01))

  //       const auctionEvents = await SequelsMultiAuction.queryFilter({
  //         address: SequelsMultiAuction.address,
  //         topics: []
  //       })

  //       expect(auctionEvents.length).to.equal(5)
  //       expect(auctionEvents.every(e => e.event === 'BidMade')).to.equal(true)
  //     })

  //     it('should revert if bid is before (or after) deadline', async () => {
  //       await time.increaseTo(START_TIME_MULTI - 20)

  //       await expectRevert(
  //         SequelsMultiAuction.connect(bidder1).bid(1, bidAmount(0.01)),
  //         'Auction for this tokenId is not active'
  //       )
  //       await time.increaseTo(END_TIME_MULTI)

  //       await expectRevert(
  //         SequelsMultiAuction.connect(bidder1).bid(1, bidAmount(0.01)),
  //         'Auction for this tokenId is not active'
  //       )

  //     })

  //     it('should revert if bid is < 0.01 ETH', async () => {
  //       await time.increaseTo(START_TIME_MULTI)


  //       await expectRevert(
  //         SequelsMultiAuction.connect(bidder2).bid(1, bidAmount(0.0099999999999)),
  //         'Bid not high enough'
  //       )
  //     })

  //     it('should revert if bid is not at least 10% higher than previous bid', async () => {
  //       await time.increaseTo(START_TIME_MULTI)

  //       await SequelsMultiAuction.connect(bidder1).bid(1, bidAmount(1))

  //       await expectRevert(
  //         SequelsMultiAuction.connect(bidder2).bid(1, bidAmount(1.099999999999)),
  //         'Bid not high enough'
  //       )

  //       await SequelsMultiAuction.connect(bidder2).bid(1, bidAmount(1.1))
  //     })
  //   })

  //   describe('setBidIncreaseBps', () => {
  //     it('should set the min increase in bps', async () => {
  //       const tokenId = 27
  //       await time.increaseTo(START_TIME_MULTI)
  //       await SequelsMultiAuction.connect(bidder1).bid(tokenId, bidAmount(1))
  //       await SequelsMultiAuction.connect(bidder2).bid(tokenId, bidAmount(1.1))

  //       await SequelsMultiAuction.connect(admin).setBidIncreaseBps(2000)

  //       expect(await SequelsMultiAuction.connect(admin).bidIncreaseBps()).to.equal(2000)

  //       await expectRevert(
  //         SequelsMultiAuction.connect(bidder1).bid(tokenId, bidAmount(1.21)),
  //         'Bid not high enough'
  //       )

  //       await SequelsMultiAuction.connect(bidder1).bid(tokenId, bidAmount(1.32))
  //     })

  //     it('should revert if called by non admin', async () => {
  //       await expectRevert(
  //         SequelsMultiAuction.connect(bidder1).setBidIncreaseBps(2000),
  //         'Ownable: caller is not the owner'
  //       )
  //     })
  //   })

  //   describe('setMinBid', () => {
  //     it('should set the minimum bid', async () => {
  //       const tokenId = 42
  //       await time.increaseTo(START_TIME_MULTI)
  //       await SequelsMultiAuction.connect(admin).setMinBid(toETH(0.02))

  //       expect(num(await SequelsMultiAuction.connect(admin).minBid())).to.equal(0.02)

  //       await expectRevert(
  //         SequelsMultiAuction.connect(bidder1).bid(tokenId, bidAmount(0.01)),
  //         'Bid not high enough'
  //       )

  //       await SequelsMultiAuction.connect(bidder1).bid(tokenId, bidAmount(0.02))
  //     })

  //     it('should set the minimum bid for admin settlement', async () => {
  //       await SequelsMultiAuction.connect(admin).setMinBid(toETH(0.02))
  //       await time.increaseTo(END_TIME_MULTI)


  //       await expectRevert(
  //         SequelsMultiAuction.connect(admin).settleAuction(1, bidAmount(0.01)),
  //         'Bid not high enough'
  //       )
  //     })

  //     it('should revert if called by non admin', async () => {
  //       await expectRevert(
  //         SequelsMultiAuction.connect(bidder1).setBidIncreaseBps(2000),
  //         'Ownable: caller is not the owner'
  //       )
  //     })
  //   })

  //   describe('bidding on tokens within range', () => {
  //     it('should work', async () => {
  //       await time.increaseTo(START_TIME_MULTI)
  //       await Promise.all(
  //         times(100,
  //           tokenId => SequelsMultiAuction.connect(bidder1).bid(tokenId, bidAmount(0.01))
  //         )
  //       )
  //     })
  //   })

  //   describe('bidding on tokens outside range', () => {
  //     it('should revert', async () => {
  //       await time.increaseTo(START_TIME_MULTI)
  //       await expectRevert(
  //         SequelsMultiAuction.connect(bidder1).bid(100, bidAmount(0.01)),
  //         'Invalid tokenId'
  //       )
  //     })
  //   })


  //   describe('FPP bidding', () => {
  //     let FPP, fppOwner, fppAdmin
  //     beforeEach(async () => {
  //       const FPPFactory = await ethers.getContractFactory('MockFPP')
  //       FPP = await FPPFactory.attach('0xA8A425864dB32fCBB459Bf527BdBb8128e6abF21')

  //       fppOwner = await ethers.getImpersonatedSigner('0x47144372eb383466D18FC91DB9Cd0396Aa6c87A4')
  //       fppAdmin = await ethers.getImpersonatedSigner('0xC5325831462D809fbf532D71029FA3EFe35CbcCE')

  //       await FPP.connect(fppAdmin).addProjectInfo(
  //         SequelsMultiAuction.address,
  //         SequelsBase.address,
  //         'Sequels'
  //       )
  //     })

  //     it('should work normally and not log a pass use', async () => {
  //       const tokenId = 1
  //       await time.increaseTo(START_TIME_MULTI)

  //       await SequelsMultiAuction.connect(bidder1).bid(tokenId, bidAmount(0.01))
  //       await SequelsMultiAuction.connect(fppOwner).bidWithMintPass(tokenId, 1, bidAmount(0.02))
  //       await SequelsMultiAuction.connect(bidder3).bid(tokenId, bidAmount(0.04))
  //       await SequelsMultiAuction.connect(fppOwner).bidWithMintPass(tokenId, 1, bidAmount(0.08))

  //       const auctionEvents = await SequelsMultiAuction.queryFilter({
  //         address: SequelsMultiAuction.address,
  //         topics: []
  //       })

  //       expect(auctionEvents.length).to.equal(4)
  //       expect(auctionEvents.every(e => e.event === 'BidMade')).to.equal(true)

  //       expect(await FPP.connect(fppOwner).passUses(1, 2)).to.equal(0)
  //     })

  //     it('should revert if FPP is not owned by caller', async () => {
  //       const tokenId = 1
  //       await time.increaseTo(START_TIME_MULTI)

  //       await SequelsMultiAuction.connect(bidder1).bid(tokenId, bidAmount(0.01))
  //       await expectRevert(
  //         SequelsMultiAuction.connect(bidder2).bidWithMintPass(tokenId, 1, bidAmount(0.02)),
  //         'Caller is not the owner of FPP'
  //       )
  //     })
  //   })
  // })

  // describe('refunding', () => {
  //   it('should refund the previous bidder', async () => {
  //     const tokenId = 1
  //     await time.increaseTo(START_TIME_MULTI)

  //     const startingEthBalance = num(await bidder1.getBalance())

  //     await SequelsMultiAuction.connect(bidder1).bid(tokenId, bidAmount(1))
  //     await SequelsMultiAuction.connect(bidder2).bid(tokenId, bidAmount(2))

  //     const endingEthBalance = num(await bidder1.getBalance())

  //     expect(endingEthBalance - startingEthBalance).to.be.closeTo(0, 0.01)
  //   })

  //   it('should refund the previous bidder for their first bid if they make multiple bids', async () => {
  //     const tokenId = 1
  //     await time.increaseTo(START_TIME_MULTI)

  //     const startingEthBalance = num(await bidder1.getBalance())

  //     await SequelsMultiAuction.connect(bidder1).bid(tokenId, bidAmount(1))
  //     await SequelsMultiAuction.connect(bidder1).bid(tokenId, bidAmount(2))

  //     const endingEthBalance = num(await bidder1.getBalance())

  //     expect(startingEthBalance - endingEthBalance).to.be.closeTo(2, 0.01)
  //   })
  // })

  // describe('settling auction', () => {
  //   async function expectSettlementToBeCorrect(bidder, beneficiary, settler, bid, tokenId, rebate=0) {
  //     const startingBeneficiaryBalance = num(await beneficiary.getBalance())
  //     const preSettlementWinnerBalance = num(await bidder.getBalance())

  //     expect(
  //       await SequelsBase.connect(bidder).exists(tokenId)
  //     ).to.equal(false)

  //     await SequelsMultiAuction.connect(settler).settleAuction(tokenId)
  //     const endingBeneficiaryBalance = num(await beneficiary.getBalance())
  //     const endingWinnerBalance = num(await bidder.getBalance())

  //     expect(
  //       (await SequelsBase.connect(bidder).balanceOf(bidder.address)).toNumber()
  //     ).to.equal(1)

  //     expect(
  //       await SequelsBase.connect(bidder).ownerOf(tokenId)
  //     ).to.equal(bidder.address)

  //     expect(
  //       await SequelsBase.connect(bidder).exists(tokenId)
  //     ).to.equal(true)

  //     expect(endingBeneficiaryBalance - startingBeneficiaryBalance).to.be.closeTo(bid - (bid*rebate), 0.001)
  //     expect(endingWinnerBalance - preSettlementWinnerBalance).to.be.closeTo((bid*rebate), 0.00001)
  //   }

  //   describe('when there is a non-FPP bidder', () => {
  //     it('should mint the correct token to the bidder send the eth to the beneficiary, and not refund the winner', async () => {
  //       const tokenId = 1
  //       await time.increaseTo(START_TIME_MULTI)

  //       await SequelsMultiAuction.connect(bidder1).bid(tokenId, bidAmount(0.01))
  //       await time.increase(time.duration.days(1))

  //       await expectSettlementToBeCorrect(bidder1, admin, bidder3, 0.01, tokenId)

  //       const auctionEvents = await SequelsMultiAuction.queryFilter({
  //         address: SequelsMultiAuction.address,
  //         topics: []
  //       })

  //       expect(auctionEvents.length).to.equal(2)
  //       expect(auctionEvents[1].event).to.equal('Settled')
  //     })
  //   })

  //   describe('when there are multiple bidders', () => {
  //     it('should mint the correct token to the final bidder and send the eth to the beneficiary', async () => {
  //       const tokenId = 10
  //       await time.increaseTo(START_TIME_MULTI)

  //       await SequelsMultiAuction.connect(bidder1).bid(tokenId, bidAmount(0.01))
  //       await SequelsMultiAuction.connect(bidder2).bid(tokenId, bidAmount(0.02))
  //       await SequelsMultiAuction.connect(bidder3).bid(tokenId, bidAmount(0.03))

  //       await time.increase(time.duration.days(1))

  //       await expectSettlementToBeCorrect(bidder3, admin, bidder1, 0.03, tokenId)
  //     })
  //   })

  //   describe('when things are multiple auctions happening', () => {
  //     it('should mint the correct token to the bidder and send the eth to the beneficiary', async () => {
  //       const tokenId = 10
  //       await time.increaseTo(START_TIME_MULTI)

  //       await SequelsMultiAuction.connect(bidder1).bid(tokenId, bidAmount(0.01))
  //       await SequelsMultiAuction.connect(bidder2).bid(tokenId+1, bidAmount(0.01))
  //       await SequelsMultiAuction.connect(bidder3).bid(tokenId+2, bidAmount(0.01))

  //       await time.increaseTo(END_TIME_MULTI)

  //       await SequelsMultiAuction.connect(admin).setBeneficiary(beneficiary1.address, beneficiary1.address)

  //       await expectSettlementToBeCorrect(bidder2, beneficiary1, bidder1, 0.01, tokenId+1)
  //       await expectSettlementToBeCorrect(bidder3, beneficiary1, bidder1, 0.01, tokenId+2)
  //       await expectSettlementToBeCorrect(bidder1, beneficiary1, bidder2, 0.01, tokenId)
  //     })
  //   })

  //   describe('when random person attempts to settle and beneficiary != admin', () => {
  //     it('should mint the correct token to the bidder and send the eth to the beneficiary', async () => {
  //       const tokenId = 10
  //       await time.increaseTo(START_TIME_MULTI)

  //       await SequelsMultiAuction.connect(bidder1).bid(tokenId, bidAmount(0.01))
  //       await time.increase(time.duration.days(1))

  //       await SequelsMultiAuction.connect(admin).setBeneficiary(beneficiary1.address, beneficiary1.address)

  //       await expectSettlementToBeCorrect(bidder1, beneficiary1, bidder3, 0.01, tokenId)
  //     })
  //   })

  //   describe('when there is no bidder', () => {
  //     const tokenId = 10

  //     beforeEach(async () => {
  //       await time.increaseTo(START_TIME_MULTI)
  //       await SequelsMultiAuction.connect(admin).setBeneficiary(beneficiary1.address, beneficiary1.address)
  //     })

  //     it('should revert if someone other than the admin attempts to buy', async () => {
  //       await time.increaseTo(END_TIME_MULTI)
  //       await expectRevert(
  //         SequelsMultiAuction.connect(bidder1).settleAuction(tokenId, bidAmount(0.01)),
  //         'Ownable: caller is not the owner'
  //       )
  //     })

  //     it('should revert if admin attempts to buy for less than min price', async () => {
  //       await time.increaseTo(END_TIME_MULTI)
  //       await expectRevert(
  //         SequelsMultiAuction.connect(admin).settleAuction(tokenId),
  //         'Bid not high enough'
  //       )
  //     })

  //     it('should allow the admin to buy for 0.01 + send eth to beneficiary', async () => {
  //       const startingAdminBalance = num(await admin.getBalance())
  //       const startingBeneficiaryBalance = num(await beneficiary1.getBalance())

  //       expect(
  //         num(await SequelsBase.connect(admin).balanceOf(admin.address))
  //       ).to.equal(0)

  //       expect(
  //         await SequelsBase.connect(admin).exists(tokenId)
  //       ).to.equal(false)

  //       await time.increaseTo(END_TIME_MULTI)
  //       await SequelsMultiAuction.connect(admin).settleAuction(tokenId, bidAmount(0.01))

  //       const endingAdminBalance = num(await admin.getBalance())
  //       const endingBeneficiaryBalance = num(await beneficiary1.getBalance())

  //       expect(
  //         (await SequelsBase.connect(admin).balanceOf(admin.address)).toNumber()
  //       ).to.equal(1)

  //       expect(
  //         await SequelsBase.connect(admin).ownerOf(tokenId)
  //       ).to.equal(admin.address)

  //       expect(
  //         await SequelsBase.connect(admin).exists(tokenId)
  //       ).to.equal(true)

  //       expect(endingBeneficiaryBalance - startingBeneficiaryBalance).to.be.closeTo(0.01, 0.00001)
  //       expect(startingAdminBalance - endingAdminBalance).to.be.closeTo(0.01, 0.01)
  //     })
  //   })


  //   describe('setBeneficiary', () => {
  //     it('should update the beneficiary', async () => {
  //       const tokenId = 10
  //       await time.increaseTo(START_TIME_MULTI)

  //       await SequelsMultiAuction.connect(bidder1).bid(tokenId, bidAmount(0.01))
  //       await SequelsMultiAuction.connect(bidder2).bid(tokenId+1, bidAmount(0.01))
  //       await time.increase(time.duration.days(1))

  //       await SequelsMultiAuction.connect(admin).setBeneficiary(beneficiary1.address, beneficiary1.address)
  //       expect(await SequelsMultiAuction.connect(admin).beneficiary1()).to.equal(beneficiary1.address)
  //       await expectSettlementToBeCorrect(bidder1, beneficiary1, admin, 0.01, tokenId)

  //       await SequelsMultiAuction.connect(admin).setBeneficiary(admin.address, beneficiary2.address)
  //       expect(await SequelsMultiAuction.connect(admin).beneficiary1()).to.equal(admin.address)
  //       expect(await SequelsMultiAuction.connect(admin).beneficiary2()).to.equal(beneficiary2.address)
  //       await expectSettlementToBeCorrect(bidder2, admin, admin, 0.01, tokenId+1)
  //     })

  //     it('should revert if called by someone other than the admin', async () => {
  //       await expectRevert(
  //         SequelsMultiAuction.connect(bidder1).setBeneficiary(bidder1.address, bidder1.address),
  //         'Ownable: caller is not the owner'
  //       )
  //     })
  //   })


  //   describe('before auction is completed', () => {
  //     it('should revert', async () => {
  //       const tokenId = 10
  //       await time.increaseTo(START_TIME_MULTI)

  //       await SequelsMultiAuction.connect(bidder1).bid(tokenId, bidAmount(0.01))

  //       await expectRevert(
  //         SequelsMultiAuction.connect(bidder1).settleAuction(tokenId),
  //         'Auction for this tokenId is still active'
  //       )
  //     })
  //   })

  //   describe('when auction is already settled', () => {
  //     it('should revert', async () => {
  //       const tokenId = 10
  //       await time.increaseTo(START_TIME_MULTI)

  //       await SequelsMultiAuction.connect(bidder1).bid(tokenId, bidAmount(0.01))
  //       await time.increase(time.duration.days(1))
  //       await SequelsMultiAuction.connect(bidder1).settleAuction(tokenId)

  //       await expectRevert(
  //         SequelsMultiAuction.connect(bidder1).settleAuction(tokenId),
  //         'Auction has already been settled'
  //       )
  //     })
  //   })

  //   describe('when the winner used a FPP pass', () => {
  //     let FPP, fppOwner, fppAdmin
  //     beforeEach(async () => {
  //       const FPPFactory = await ethers.getContractFactory('MockFPP')
  //       FPP = await FPPFactory.attach('0xA8A425864dB32fCBB459Bf527BdBb8128e6abF21')

  //       fppOwner = await ethers.getImpersonatedSigner('0x47144372eb383466D18FC91DB9Cd0396Aa6c87A4')
  //       fppAdmin = await ethers.getImpersonatedSigner('0xC5325831462D809fbf532D71029FA3EFe35CbcCE')

  //       await SequelsMultiAuction.connect(admin).setBeneficiary(beneficiary1.address, beneficiary2.address)

  //       await FPP.connect(fppAdmin).addProjectInfo(
  //         SequelsMultiAuction.address,
  //         SequelsBase.address,
  //         'Sequels'
  //       )
  //     })

  //     it('should refund a 10% discount by default, and forward the rest to beneficiary2', async () => {
  //       const tokenId = 10
  //       await time.increaseTo(START_TIME_MULTI)

  //       await SequelsMultiAuction.connect(fppOwner).bidWithMintPass(tokenId, 1, bidAmount(1))
  //       await time.increase(time.duration.days(1))

  //       await expectSettlementToBeCorrect(fppOwner, beneficiary2, bidder3, 1, tokenId, 0.1)

  //       const auctionEvents = await SequelsMultiAuction.queryFilter({
  //         address: SequelsMultiAuction.address,
  //         topics: []
  //       })

  //       expect(auctionEvents.length).to.equal(2)
  //       expect(auctionEvents[1].event).to.equal('Settled')
  //     })

  //     it('should refund a the correct discount when updated, and forward the rest to beneficiary2', async () => {
  //       await SequelsMultiAuction.connect(admin).setMintPassRebateBps(500)

  //       const tokenId = 10
  //       await time.increaseTo(START_TIME_MULTI)

  //       await SequelsMultiAuction.connect(fppOwner).bidWithMintPass(tokenId, 1, bidAmount(1))
  //       await time.increase(time.duration.days(1))

  //       await expectSettlementToBeCorrect(fppOwner, beneficiary2, bidder3, 1, tokenId, 0.05)

  //       const auctionEvents = await SequelsMultiAuction.queryFilter({
  //         address: SequelsMultiAuction.address,
  //         topics: []
  //       })

  //       expect(auctionEvents.length).to.equal(2)
  //       expect(auctionEvents[1].event).to.equal('Settled')
  //     })

  //     it('should not refund the bidder if they no longer own the FPP, and forward settlement amount to beneficiary1', async () => {
  //       const tokenId = 10
  //       await time.increaseTo(START_TIME_MULTI)

  //       await SequelsMultiAuction.connect(fppOwner).bidWithMintPass(tokenId, 1, bidAmount(1))
  //       await time.increase(time.duration.days(1))

  //       FPP.connect(fppOwner)[safeTransferFrom](fppOwner.address, fppAdmin.address, 1)

  //       await expectSettlementToBeCorrect(fppOwner, beneficiary1, bidder3, 1, tokenId)
  //     })

  //     it('should log a FPP pass use', async () => {
  //       const tokenId = 10
  //       await time.increaseTo(START_TIME_MULTI)

  //       await SequelsMultiAuction.connect(fppOwner).bidWithMintPass(tokenId, 1, bidAmount(1))
  //       await time.increase(time.duration.days(1))
  //       await SequelsMultiAuction.connect(fppOwner).settleAuction(tokenId)

  //       expect(await FPP.connect(fppOwner).passUses(1, 2)).to.equal(1)
  //     })
  //   })

  //   describe('setMintPassRebateBps', () => {
  //     it('should work', async () => {
  //       expect(
  //         await SequelsMultiAuction.connect(admin).mintPassRebateBps()
  //       ).to.equal(1000)

  //       await SequelsMultiAuction.connect(admin).setMintPassRebateBps(500)

  //       expect(
  //         await SequelsMultiAuction.connect(admin).mintPassRebateBps()
  //       ).to.equal(500)
  //     })

  //     it('should revert if called by non admin', async () => {
  //       await expectRevert(
  //         SequelsMultiAuction.connect(bidder1).setMintPassRebateBps(500),
  //         'Ownable: caller is not the owner'
  //       )
  //     })
  //   })
  // })
// })

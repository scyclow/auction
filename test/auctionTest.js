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
const createGenericAuction = () => SteviepAuction.connect(admin).create(false, ONE_DAY, 1000, TEN_MINUTES, 0, 0, admin.address, MinterMock.address, ZERO_ADDR, ZERO_ADDR)
const contractBalance = contract => contract.provider.getBalance(contract.address)

let admin, bidder1, bidder2
let SteviepAuction, MinterMock, RewardMinterMock, AllowListMock, FaultyMinterMock



const auctionSetup = async () => {
  const signers = await ethers.getSigners()

  admin = signers[0]
  bidder1 = signers[1]
  bidder2 = signers[2]


  const SteviepAuctionFactory = await ethers.getContractFactory('SteviepAuctionV1', admin)
  SteviepAuction = await SteviepAuctionFactory.deploy()
  await SteviepAuction.deployed()

  const MinterMockFactory = await ethers.getContractFactory('MinterMock', admin)
  MinterMock = await MinterMockFactory.deploy()
  await MinterMock.deployed()

  const ExistingTokenFactory = await ethers.getContractFactory('ExistingTokenMock', admin)
  ExistingTokenMock = await ExistingTokenFactory.deploy()
  await ExistingTokenMock.deployed()

  const RewardMinterMockFactory = await ethers.getContractFactory('RewardMinterMock', admin)
  RewardMinterMock = await RewardMinterMockFactory.deploy()
  await RewardMinterMock.deployed()

  const AllowListMockFactory = await ethers.getContractFactory('AllowListMock', admin)
  AllowListMock = await AllowListMockFactory.deploy()
  await AllowListMock.deployed()

  const FaultyMinterMockFactory = await ethers.getContractFactory('FaultyMinterMock', admin)
  FaultyMinterMock = await FaultyMinterMockFactory.deploy()
  await FaultyMinterMock.deployed()

}





describe('SteviepAuction', () => {
  beforeEach(async () => {
    await auctionSetup()
  })

  describe('create', () => {
    it('creates the auction', async () => {
      await ExistingTokenMock.connect(admin).mint(admin.address, 0)
      await ExistingTokenMock.connect(admin).setApprovalForAll(SteviepAuction.address, true)

      expect(await ExistingTokenMock.connect(admin).ownerOf(0)).to.equal(admin.address)
      expect(await SteviepAuction.connect(admin).auctionCount()).to.equal(0)


      await SteviepAuction.connect(admin).create(
        true,
        ONE_DAY,
        1000,
        TEN_MINUTES,
        111,
        0,
        admin.address,
        ExistingTokenMock.address,
        RewardMinterMock.address,
        AllowListMock.address,
      )
      expect(await SteviepAuction.connect(admin).auctionCount()).to.equal(1)

      const auction0 = await SteviepAuction.connect(admin).auctionIdToAuction(0)
      expect(num(auction0.duration)).to.equal(ONE_DAY)
      expect(num(auction0.bidIncreaseBps)).to.equal(1000)
      expect(num(auction0.bidTimeExtension)).to.equal(TEN_MINUTES)
      expect(num(auction0.minBid)).to.equal(111)
      expect(num(auction0.tokenId)).to.equal(0)
      expect(num(auction0.startTime)).to.equal(0)
      expect(auction0.tokenExists).to.equal(true)
      expect(auction0.beneficiary).to.equal(admin.address)
      expect(auction0.tokenContract).to.equal(ExistingTokenMock.address)
      expect(auction0.rewardContract).to.equal(RewardMinterMock.address)
      expect(auction0.allowListContract).to.equal(AllowListMock.address)
      expect(auction0.isSettled).to.equal(false)

      await SteviepAuction.connect(admin).create(
        false,
        ONE_DAY,
        1000,
        TEN_MINUTES,
        111,
        1,
        admin.address,
        MinterMock.address,
        ZERO_ADDR,
        ZERO_ADDR,
      )

      const auction1 = await SteviepAuction.connect(admin).auctionIdToAuction(1)
      expect(auction1.tokenId).to.equal(1)
      expect(auction1.tokenExists).to.equal(false)
      expect(auction1.tokenContract).to.equal(MinterMock.address)
      expect(auction1.rewardContract).to.equal(ZERO_ADDR)
      expect(auction1.allowListContract).to.equal(ZERO_ADDR)
    })

    it('reverts if called by non owner', async () => {
      await expectOwnableError(
        SteviepAuction.connect(bidder1).create(false, ONE_DAY, 1000, TEN_MINUTES, 0, 0, admin.address, MinterMock.address, RewardMinterMock.address, AllowListMock.address),
      )
    })

    it('transfers the token to itself if the token already exists', async () => {
      await ExistingTokenMock.connect(admin).mint(admin.address, 0)
      await ExistingTokenMock.connect(admin).setApprovalForAll(SteviepAuction.address, true)

      expect(await ExistingTokenMock.connect(admin).ownerOf(0)).to.equal(admin.address)

      await SteviepAuction.connect(admin).create(true, ONE_DAY, 1000, TEN_MINUTES, 0, 0, admin.address, ExistingTokenMock.address, ZERO_ADDR, ZERO_ADDR)

      expect(await ExistingTokenMock.connect(admin).ownerOf(0)).to.equal(SteviepAuction.address)
    })
  })

  describe('isActive', () => {
    it('returns true if it hasnt started yet', async () => {
      await createGenericAuction()

      expect(await SteviepAuction.connect(admin).isActive(0)).to.equal(true)
    })

    it('returns true if auction duration hasn\'t ellapsed yet', async () => {
      await createGenericAuction()
      await SteviepAuction.connect(admin).create(false, ONE_DAY*2, 1000, TEN_MINUTES, 0, 0, admin.address, MinterMock.address, ZERO_ADDR, ZERO_ADDR)
      await SteviepAuction.connect(admin).create(false, ONE_DAY/2, 1000, TEN_MINUTES, 0, 0, admin.address, MinterMock.address, ZERO_ADDR, ZERO_ADDR)
      await SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.1))
      await SteviepAuction.connect(bidder1)[bid](1, bidAmount(0.1))
      await SteviepAuction.connect(bidder1)[bid](2, bidAmount(0.1))


      expect(await SteviepAuction.connect(admin).isActive(0)).to.equal(true)
      await time.increase(time.duration.seconds(ONE_DAY - 30))
      expect(await SteviepAuction.connect(admin).isActive(0)).to.equal(true)
      expect(await SteviepAuction.connect(admin).isActive(2)).to.equal(false)

      await time.increase(time.duration.seconds(ONE_DAY/2))
      expect(await SteviepAuction.connect(admin).isActive(0)).to.equal(false)
      expect(await SteviepAuction.connect(admin).isActive(1)).to.equal(true)
    })

    it('returns true if auction duration has ellapsed, but there was a late bid', async () => {
      await createGenericAuction()
      await SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.1))

      expect(await SteviepAuction.connect(admin).isActive(0)).to.equal(true)
      await time.increase(time.duration.seconds(ONE_DAY - 30))
      await SteviepAuction.connect(bidder2)[bid](0, bidAmount(0.2))
      await time.increase(time.duration.seconds(TEN_MINUTES - 30))

      expect(await SteviepAuction.connect(admin).isActive(0)).to.equal(true)
    })

    it('returns true if auction duration has ellapsed, but there were multiple late bids', async () => {
      await createGenericAuction()
      await SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.1))

      expect(await SteviepAuction.connect(admin).isActive(0)).to.equal(true)
      await time.increase(time.duration.seconds(ONE_DAY - 30))
      await SteviepAuction.connect(bidder2)[bid](0, bidAmount(0.2))

      await time.increase(time.duration.seconds(TEN_MINUTES - 30))
      await SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.3))

      await time.increase(time.duration.seconds(TEN_MINUTES - 30))
      await SteviepAuction.connect(bidder2)[bid](0, bidAmount(0.4))

      expect(await SteviepAuction.connect(admin).isActive(0)).to.equal(true)
      await time.increase(time.duration.seconds(TEN_MINUTES))
      expect(await SteviepAuction.connect(admin).isActive(0)).to.equal(false)
    })

    it('returns false if duration has ellapsed', async () => {
      await createGenericAuction()
      await SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.1))

      expect(await SteviepAuction.connect(admin).isActive(0)).to.equal(true)
      await time.increase(time.duration.seconds(ONE_DAY+1))
      expect(await SteviepAuction.connect(admin).isActive(0)).to.equal(false)
    })

    it('returns false if auction duration has ellapsed, there were late bids, and extenstions ellapsed', async () => {
      await createGenericAuction()
      await SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.1))

      expect(await SteviepAuction.connect(admin).isActive(0)).to.equal(true)
      await time.increase(time.duration.seconds(ONE_DAY - 30))
      await SteviepAuction.connect(bidder2)[bid](0, bidAmount(0.2))
      await time.increase(time.duration.seconds(TEN_MINUTES + 1))

      expect(await SteviepAuction.connect(admin).isActive(0)).to.equal(false)
    })

    it('returns false for nonexistant auctions', async () => {
      expect(await SteviepAuction.connect(admin).isActive(27)).to.equal(false)
    })

    it('returns false for cancelled auctions', async () => {
      await createGenericAuction()
      await SteviepAuction.connect(admin).cancel(0)
      expect(await SteviepAuction.connect(admin).isActive(0)).to.equal(false)
    })
  })

  describe('bid', () => {
    it('updates the highest bidder for an auction', async () => {
      await createGenericAuction()
      const noBidder = await SteviepAuction.connect(admin).auctionIdToHighestBid(0)
      expect(num(noBidder.amount)).to.equal(0)
      expect(num(noBidder.timestamp)).to.equal(0)
      expect(noBidder.bidder).to.equal(ZERO_ADDR)

      await SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.1))
      let latest = num(await time.latest())

      const highestBid1 = await SteviepAuction.connect(admin).auctionIdToHighestBid(0)
      expect(ethVal(highestBid1.amount)).to.equal(0.1)
      expect(num(highestBid1.timestamp)).to.equal(latest)
      expect(highestBid1.bidder).to.equal(bidder1.address)

      await SteviepAuction.connect(bidder2)[bid](0, bidAmount(0.2))
      latest = num(await time.latest())

      const highestBid2 = await SteviepAuction.connect(admin).auctionIdToHighestBid(0)
      expect(ethVal(highestBid2.amount)).to.equal(0.2)
      expect(num(highestBid2.timestamp)).to.equal(latest)
      expect(highestBid2.bidder).to.equal(bidder2.address)
    })

    it('refunds previous bidder if there is one', async () => {
      await createGenericAuction()
      const startingEthBalance1 = ethVal(await bidder1.getBalance())
      const startingEthBalance2 = ethVal(await bidder2.getBalance())
      await SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.1))
      const middleEthBalance1 = ethVal(await bidder1.getBalance())
      await SteviepAuction.connect(bidder2)[bid](0, bidAmount(0.2))
      const endingEthBalance1 = ethVal(await bidder1.getBalance())
      const endingEthBalance2 = ethVal(await bidder2.getBalance())

      expect(startingEthBalance1 - endingEthBalance1).to.be.closeTo(0, 0.01)
      expect(startingEthBalance1 - middleEthBalance1).to.be.closeTo(0.1, 0.01)
      expect(startingEthBalance2 - endingEthBalance2).to.be.closeTo(0.2, 0.01)
    })


    it('mints a reward if reward contract and bidder wants it & rewards contract exists', async () => {
      await createGenericAuction()
      await SteviepAuction.connect(bidder1)[bidWithReward](0, true, bidAmount(0.1))
      await SteviepAuction.connect(bidder2)[bidWithReward](0, false, bidAmount(0.2))

      expect(await RewardMinterMock.connect(admin).balanceOf(bidder1.address)).to.equal(0)
      expect(await RewardMinterMock.connect(admin).balanceOf(bidder2.address)).to.equal(0)

      await SteviepAuction.connect(admin).create(false, ONE_DAY, 1000, TEN_MINUTES, 0, 0, admin.address, MinterMock.address, RewardMinterMock.address, ZERO_ADDR)
      await SteviepAuction.connect(bidder1)[bidWithReward](1, true, bidAmount(0.1))
      await SteviepAuction.connect(bidder2)[bidWithReward](1, false, bidAmount(0.2))

      expect(await RewardMinterMock.connect(admin).balanceOf(bidder1.address)).to.equal(1)
      expect(await RewardMinterMock.connect(admin).balanceOf(bidder2.address)).to.equal(0)
      await SteviepAuction.connect(bidder1)[bidWithReward](1, true, bidAmount(0.3))
      expect(await RewardMinterMock.connect(admin).balanceOf(bidder1.address)).to.equal(2)
    })

    it('emits BidMade', async () => {
      await createGenericAuction()
      await SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.1))

      const latest = num(await time.latest())

      const auctionEvents = await SteviepAuction.queryFilter({
        address: SteviepAuction.address,
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
      await SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.1))

      await time.increase(time.duration.seconds(ONE_DAY+1))

      await expectRevert(
        SteviepAuction.connect(bidder2)[bid](0, bidAmount(0.2)),
        'Auction is not active'
      )
    })

    it('reverts if auction duration has ellapsed, there were late bids, and extenstions ellapsed', async () => {
      await createGenericAuction()
      await SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.1))

      await time.increase(time.duration.seconds(ONE_DAY - 30))
      await SteviepAuction.connect(bidder2)[bid](0, bidAmount(0.2))

      await time.increase(time.duration.seconds(TEN_MINUTES - 30))
      await SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.3))

      await time.increase(time.duration.seconds(TEN_MINUTES + 1))
      await expectRevert(
        SteviepAuction.connect(bidder2)[bid](0, bidAmount(0.4)),
        'Auction is not active'
      )

      await SteviepAuction.connect(admin).create(false, ONE_DAY, 1000, TEN_MINUTES - 60, 0, 0, admin.address, MinterMock.address, ZERO_ADDR, ZERO_ADDR)
      await SteviepAuction.connect(bidder1)[bid](1, bidAmount(0.1))
      await time.increase(time.duration.seconds(ONE_DAY - 30))
      await SteviepAuction.connect(bidder2)[bid](1, bidAmount(0.2))
      await time.increase(time.duration.seconds(TEN_MINUTES - 30))
      await expectRevert(
        SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.3)),
        'Auction is not active'
      )

    })

    it('reverts if nonexistant auctions', async () => {
      await expectRevert(
        SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.1)),
        'Auction is not active'
      )
    })

    it('reverts if auction is cancelled', async () => {
      await createGenericAuction()
      await SteviepAuction.connect(admin).cancel(0)
      await expectRevert(
        SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.1)),
        'Auction is not active'
      )
    })

    it('reverts if allow list given and bidder is not on it', async () => {
      await SteviepAuction.connect(admin).create(false, ONE_DAY, 1000, TEN_MINUTES, 0, 0, admin.address, MinterMock.address, ZERO_ADDR, AllowListMock.address)

      await expectRevert(
        SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.1)),
        'Bidder not on allow list'
      )

      await AllowListMock.connect(admin).setBalance(bidder1.address, 1)

      await SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.1))
    })

    it('reverts if bid is not x% higher than previous bid', async () => {
      await SteviepAuction.connect(admin).create(false, ONE_DAY, 1000, TEN_MINUTES, 0, 0, admin.address, MinterMock.address, ZERO_ADDR, ZERO_ADDR)
      await SteviepAuction.connect(admin).create(false, ONE_DAY, 2000, TEN_MINUTES, 0, 0, admin.address, MinterMock.address, ZERO_ADDR, ZERO_ADDR)

      await SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.1))
      await expectRevert(
        SteviepAuction.connect(bidder2)[bid](0, bidAmount(0.109)),
        'Bid not high enough'
      )
      await SteviepAuction.connect(bidder2)[bid](0, bidAmount(0.11))
      await expectRevert(
        SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.12)),
        'Bid not high enough'
      )
      await SteviepAuction.connect(bidder2)[bid](0, bidAmount(0.121))

      await SteviepAuction.connect(bidder1)[bid](1, bidAmount(0.1))
      await expectRevert(
        SteviepAuction.connect(bidder2)[bid](1, bidAmount(0.11)),
        'Bid not high enough'
      )
      await SteviepAuction.connect(bidder2)[bid](1, bidAmount(0.12))
    })

    it('reverts if bid is not higher than min bid', async () => {
      await SteviepAuction.connect(admin).create(false, ONE_DAY, 1000, TEN_MINUTES, toETH(0.11), 0, admin.address, MinterMock.address, ZERO_ADDR, ZERO_ADDR)

      const auction = await SteviepAuction.connect(admin).auctionIdToAuction(0)

      await expectRevert(
        SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.1)),
        'Bid not high enough'
      )
      await SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.11))
    })
  })

  describe('cancel', () => {
    it('marks the auction as settled', async () => {
      await createGenericAuction()
      await SteviepAuction.connect(admin).cancel(0)
      const auction = await SteviepAuction.connect(admin).auctionIdToAuction(0)
      expect(auction.isSettled).to.equal(true)

    })
    it('reverts if called by non owner', async () => {
      await createGenericAuction()
      expectOwnableError(SteviepAuction.connect(bidder1).cancel(0))
    })

    it('reverts if cancelled multiple times', async () => {
      await createGenericAuction()
      await SteviepAuction.connect(admin).cancel(0)
      await expectRevert(
        SteviepAuction.connect(admin).cancel(0),
        'Auction is not active'
      )
    })

    it('reverts if auction is active', async () => {
      await createGenericAuction()
      await SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.1))
      await expectRevert(
        SteviepAuction.connect(admin).cancel(0),
        'Auction has started'
      )
    })

    it('reverts if cancelling a non existant auction', async () => {
      await expectRevert(
        SteviepAuction.connect(admin).cancel(0),
        'Auction does not exist'
      )
    })

    it('reverts if auction is settled', async () => {
      await createGenericAuction()
      await SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.1))
      await time.increase(time.duration.seconds(ONE_DAY + 1))

      await SteviepAuction.connect(bidder1).settle(0)

      await expectRevert(
        SteviepAuction.connect(admin).cancel(0),
        'Auction is not active'
      )
    })

    it('returns the token if it exists', async () => {
      await ExistingTokenMock.connect(admin).mint(admin.address, 0)
      await ExistingTokenMock.connect(admin).setApprovalForAll(SteviepAuction.address, true)
      expect(await ExistingTokenMock.connect(admin).ownerOf(0)).to.equal(admin.address)

      await SteviepAuction.connect(admin).create(true, ONE_DAY, 1000, TEN_MINUTES, 0, 0, admin.address, ExistingTokenMock.address, ZERO_ADDR, ZERO_ADDR)
      expect(await ExistingTokenMock.connect(admin).ownerOf(0)).to.equal(SteviepAuction.address)

      await SteviepAuction.connect(admin).cancel(0)
      expect(await ExistingTokenMock.connect(admin).ownerOf(0)).to.equal(admin.address)
    })
  })

  describe('settle', () => {
    it('mints the correct token + pays the correct beneficiary', async () => {
      await createGenericAuction() // 0
      await createGenericAuction() // 1
      await createGenericAuction() // 2

      const startingContractBalance = ethVal(await contractBalance(SteviepAuction))
      const startingAdminBalance = ethVal(await admin.getBalance())

      await SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.1))
      await SteviepAuction.connect(bidder2)[bid](0, bidAmount(0.2))

      const middleContractBalance = ethVal(await contractBalance(SteviepAuction))

      await time.increase(time.duration.seconds(ONE_DAY + 1))

      await SteviepAuction.connect(bidder1).settle(0)
      await expectRevert(
        SteviepAuction.connect(bidder1).settle(1),
        'Auction is still active'
      )

      const endingContractBalance = ethVal(await contractBalance(SteviepAuction))
      const endingAdminBalance = ethVal(await admin.getBalance())


      expect(middleContractBalance).to.equal(startingContractBalance +  0.2)
      expect(endingContractBalance).to.equal(startingContractBalance)

      expect(endingAdminBalance - startingAdminBalance).to.be.closeTo(0.2, 0.00001)

      const auction = await SteviepAuction.connect(admin).auctionIdToAuction(0)
      expect(auction.isSettled).to.equal(true)
      expect(await MinterMock.connect(admin).ownerOf(0)).to.equal(bidder2.address)
    })

    it('transfers the token to the winner if it already exists + pays the admin', async () => {
      await ExistingTokenMock.connect(admin).mint(admin.address, 0)
      await ExistingTokenMock.connect(admin).setApprovalForAll(SteviepAuction.address, true)
      expect(await ExistingTokenMock.connect(admin).ownerOf(0)).to.equal(admin.address)

      await SteviepAuction.connect(admin).create(true, ONE_DAY, 1000, TEN_MINUTES, 0, 0, admin.address, ExistingTokenMock.address, ZERO_ADDR, ZERO_ADDR)

      const startingContractBalance = ethVal(await contractBalance(SteviepAuction))
      const startingAdminBalance = ethVal(await admin.getBalance())

      await SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.1))
      await time.increase(time.duration.seconds(ONE_DAY + 1))

      const middleContractBalance = ethVal(await contractBalance(SteviepAuction))

      expect(await ExistingTokenMock.connect(admin).ownerOf(0)).to.equal(SteviepAuction.address)
      await SteviepAuction.connect(bidder1).settle(0)

      const endingContractBalance = ethVal(await contractBalance(SteviepAuction))
      const endingAdminBalance = ethVal(await admin.getBalance())

     expect(middleContractBalance).to.equal(startingContractBalance +  0.1)
      expect(endingContractBalance).to.equal(startingContractBalance)

      expect(endingAdminBalance - startingAdminBalance).to.be.closeTo(0.1, 0.00001)

      const auction = await SteviepAuction.connect(admin).auctionIdToAuction(0)
      expect(auction.isSettled).to.equal(true)

      expect(await ExistingTokenMock.connect(admin).ownerOf(0)).to.equal(bidder1.address)
    })

    it('emits Settled', async () => {
      await createGenericAuction()
      await SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.1))
      await time.increase(time.duration.seconds(ONE_DAY + 1))
      await SteviepAuction.connect(bidder1).settle(0)

      const latest = num(await time.latest())

      const auctionEvents = await SteviepAuction.queryFilter({
        address: SteviepAuction.address,
        topics: []
      })

      expect(auctionEvents.length).to.equal(3)
      expect(auctionEvents[2].event).to.equal('Settled')
      expect(num(auctionEvents[2].args.auctionId)).to.equal(0)
      expect(num(auctionEvents[2].args.timestamp)).to.equal(latest)
    })

    it('reverts if auction is still active', async () => {
      await createGenericAuction()
      await expectRevert(
        SteviepAuction.connect(bidder1).settle(0),
        'Auction is still active'
      )
      await SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.1))

      await expectRevert(
        SteviepAuction.connect(bidder1).settle(0),
        'Auction is still active'
      )
      await time.increase(time.duration.seconds(ONE_DAY - 30))
      await expectRevert(
        SteviepAuction.connect(bidder1).settle(0),
        'Auction is still active'
      )
      await time.increase(time.duration.seconds(31))

      await SteviepAuction.connect(admin).settle(0)
    })

    it('reverts if auction has alredy been settled', async () => {
      await createGenericAuction()
      await SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.1))
      await time.increase(time.duration.seconds(ONE_DAY +1))

      await SteviepAuction.connect(bidder1).settle(0)

      await expectRevert(
        SteviepAuction.connect(bidder1).settle(0),
        'Auction has already been settled'
      )
    })

    it('refunds the bidder if minting fails for some reason', async () => {
      await SteviepAuction.connect(admin).create(false, ONE_DAY, 1000, TEN_MINUTES, 0, 0, admin.address, FaultyMinterMock.address, ZERO_ADDR, ZERO_ADDR)

      const startingContractBalance = ethVal(await contractBalance(SteviepAuction))
      const startingAdminBalance = ethVal(await admin.getBalance())
      const startingBidderBalance = ethVal(await bidder1.getBalance())

      await SteviepAuction.connect(bidder1)[bid](0, bidAmount(0.1))

      await time.increase(time.duration.seconds(ONE_DAY + 1))

      await SteviepAuction.connect(bidder1).settle(0)

      const endingContractBalance = ethVal(await contractBalance(SteviepAuction))
      const endingAdminBalance = ethVal(await admin.getBalance())
      const endingBidderBalance = ethVal(await bidder1.getBalance())


      expect(endingContractBalance).to.equal(startingContractBalance)
      expect(endingAdminBalance).to.be.closeTo(startingAdminBalance, 0.01)
      expect(endingBidderBalance).to.be.closeTo(startingBidderBalance, 0.01)

      const auction = await SteviepAuction.connect(admin).auctionIdToAuction(0)
      expect(auction.isSettled).to.equal(true)

      const auctionEvents = await SteviepAuction.queryFilter({
        address: SteviepAuction.address,
        topics: []
      })

      expect(auctionEvents.length).to.equal(3)
      expect(auctionEvents[2].event).to.equal('Settled')
    })
  })
})




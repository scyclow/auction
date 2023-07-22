const ONE_DAY = 60 * 60 * 24
const TEN_MINUTES = 60 * 10
const ZERO_ADDR = '0x0000000000000000000000000000000000000000'

async function main() {
  const signers = await ethers.getSigners()

  admin = signers[0]
  bidder1 = signers[1]
  bidder2 = signers[2]

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

  await MinterAuction.connect(admin).create(
    ONE_DAY,
    1000,
    TEN_MINUTES,
    '100000000000000000',
    1,
    admin.address,
    MinterMock.address,
    RewardMinterMock.address,
    ZERO_ADDR,
  )

  for (let i = 0; i < 10; i++) {
    await MinterAuction.connect(admin).create(
      30,
      1000,
      12,
      '100000000000000000',
      1,
      admin.address,
      MinterMock.address,
      RewardMinterMock.address,
      ZERO_ADDR,
    )
  }

  console.log((await MinterAuction.connect(admin).auctionIdToAuction(0)).minBid)

  console.log(`MinterAuction:`, MinterAuction.address)
  console.log(`MinterMock:`, MinterMock.address)
  console.log('admin:', admin.address)
}


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
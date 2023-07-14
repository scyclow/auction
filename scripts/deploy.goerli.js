async function main() {
  const [artist, collector1, collector2, collector3] = await ethers.getSigners()
  console.log('Deploying base contract for artist addr:', artist.address)

  TerminallyOnlineFactory = await ethers.getContractFactory('TerminallyOnline', artist)
  TerminallyOnline = await TerminallyOnlineFactory.deploy()
  await TerminallyOnline.deployed()


  console.log(`TerminallyOnline:`, TerminallyOnline.address)
  console.log(`Multisig:`, await TerminallyOnline.connect(artist).multisig())
  console.log(`TokenURI:`, await TerminallyOnline.connect(artist).tokenURIContract())
}


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
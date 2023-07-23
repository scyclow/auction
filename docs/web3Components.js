const bnToN = bn => Number(bn.toString())
const ethVal = n => Number(ethers.utils.formatEther(n))
const truncateAddr = addr => addr.slice(0, 5) + '...' + addr.slice(-3)
const toETH = amt => ethers.utils.parseEther(String(amt))
const ethValue = amt => ({ value: toETH(amt) })

class Web3Provider {
  onConnectCbs = []

  constructor() {
    if (window.ethereum) {
      console.log('web3')
      try {
        this.provider = new ethers.providers.Web3Provider(window.ethereum, 'any')
        this.isEthBrowser = true
      } catch (e) {
        console.error(e)
      }

    } else {
      console.log('no Web3 detected')
      this.isEthBrowser = false
    }
  }

  onConnect(cb) {
    this.onConnectCbs.push(cb)
    this.isConnected()
      .then(addr => {
        if (addr) {
          cb(addr)
        }
      })
  }

  connect() {
    this.onConnectCbs.forEach(async cb => cb(await this.isConnected()))
  }

  get signer() {
    return this.provider.getSigner()
  }

  async isConnected() {
    if (!this.isEthBrowser) return false

    try {
      return await this.signer.getAddress()
    } catch (e) {
      return false
    }
  }

  rawContract(contractAddr, abi) {
    return new ethers.Contract(contractAddr, abi, this.provider)
  }

  async contract(contractAddr, abi) {
    const signer = await this.isConnected()
    console.log(signer)
    return (new ethers.Contract(contractAddr, abi, this.provider)).connect(this.signer)
  }

  async getENS(addr) {
    return this.provider.lookupAddress(addr)
  }

  async getETHBalance(addr) {
    return this.provider.getBalance(addr)
  }
}




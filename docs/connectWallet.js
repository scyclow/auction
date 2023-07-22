
// const connectWalletTemplate = `
//   <section>
//   <h1>hello</h1>
//     <section id="case-noWeb3" style="display: none;">
//       <slot name="noWeb3"></slot>
//     </section>

//     <section id="case-notConnected" style="display: none;">
//       <slot name="notConnected"></slot>
//     </section>

//     <section id="case-connected" style="display: none;">
//       <slot name="connected"></slot>
//     </section>

//     <section id="case-connectionError" style="display: none;">
//       <slot name="connectionError"></slot>
//     </section>
//   </section>
// `


document.body.innerHTML += (`
<template id="connectWalletTemplate">
  <section>
    <section id="case-noWeb3" style="display: none;">
      <slot name="noWeb3"></slot>
    </section>

    <section id="case-notConnected" style="display: none;">
      <slot name="notConnected"></slot>
    </section>

    <section id="case-connected" style="display: none;">
      <slot name="connected"></slot>
    </section>

    <section id="case-connectionError" style="display: none;">
      <slot name="connectionError"></slot>
    </section>
  </section>
</template>
`)

const ConnectWallet = (web3Provider, connectButtonId) => class extends BaseComponent('connectWalletTemplate') {
  static name = 'connect-wallet'
  constructor() {
    super()
    this.provider = web3Provider
    this.$noWeb = $.id(this.template, 'case-noWeb3')
    this.$notConnected = $.id(this.template, 'case-notConnected')
    this.$connected = $.id(this.template, 'case-connected')
    this.$connectionError = $.id(this.template, 'case-connectionError')

    this.update('isEthBrowser', this.provider.isEthBrowser)

    this.provider.isConnected().then(addr => this.update('connectedAddr', addr))

    this.provider.onConnect(addr => {
      this.update('connectedAddr', addr)
    })

  }

  unhide(element) {
    $(element, 'display', 'initial')
  }

  render(template, attrs) {
    if (attrs.hasError) {
      this.unhide($.id(template, 'case-connectionError'))
      return template

    } else if (!attrs.isEthBrowser) {
      this.unhide($.id(template, 'case-noWeb3'))
      return template

    } else if (attrs.connectedAddr) {
      this.unhide($.id(template, 'case-connected'))
      return template

    } else {
      this.unhide($.id(template, 'case-notConnected'))
      return template
    }
  }
}



document.body.innerHTML += (`
<template id="connectButtonTemplate">
  <slot name="button" id="case-connectNotLoading" style="display: none;"></slot>
  <slot name="loading" id="case-connectLoading" style="display: none;"></slot>
  <slot name="error" id="case-connectError" style="display: none;"></slot>
</template>
`)

const ConnectButton = (web3Provider) => class extends BaseComponent('connectButtonTemplate') {
  static name = 'connect-button'
  constructor() {
    super()
    this.provider = web3Provider

    Array.from(this.children).forEach(child => {
      if (child.tagName === 'BUTTON') this.$button = child
      if (child.classList.contains('error')) this.$error = child
    })


    this.$button.onclick = async () => {
      this.update('isLoading', true)
      this.update('errorMsg', '')

      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }, [])
        const address = await this.provider.isConnected()
        this.provider.connect()
        // this.update('isEthBrowser', this.provider.isEthBrowser)
        this.update('isLoading', false)

      } catch (e) {
        this.update('isLoading', false)
        this.update('errorMsg', e.message)

        console.error(e)
      }
    }

  }

  unhide(element) {
    $(element, 'display', 'initial')
  }

  hide(element) {
    $(element, 'display', 'none')
  }

  render(template, attrs) {
    if (attrs.isLoading) {
      this.hide($.id(template, 'case-connectNotLoading'))
      this.unhide($.id(template, 'case-connectLoading'))
    } else {
      this.hide($.id(template, 'case-connectLoading'))
      this.unhide($.id(template, 'case-connectNotLoading'))
    }

    if (attrs.errorMsg) {
      this.unhide($.id(template, 'case-connectError'))
      this.$error.innerHTML = attrs.errorMsg
    } else {
      this.hide($.id(template, 'case-connectError'))
    }

    return template
  }
}


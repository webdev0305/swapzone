const { ethers } = require("ethers")
const chains = require('../chains.json')
const ERC20 = require("../abi/ERC20.json")

require('dotenv').config()

// const providers = {}

// const init = async () => {
//     for(let chainId in chains) {
//         providers[chainId] = new ethers.providers.JsonRpcProvider(chains[chainId].url)
//     }
// }

const swapzoneTokens = Object.entries(chains).reduce((prev,cur)=>{
    prev[cur[1].coin] = [cur[0], cur[1].address]
    if(cur[1].tokens) 
        Object.entries(cur[1].tokens).map(([symbol,address])=>{
            prev[symbol] = [cur[0], address]
        })
    return prev
}, {})

const transactions = {}
const wallets = {}
const faucets = {}

const currencies = () => {
    return Object.entries(chains).reduce((prev,cur)=>{
        prev.push({
            name: cur[1].symbol.toUpperCase(),
            ticker: cur[1].coin,
            network: cur[1].name
        })
        if(cur[1].tokens) 
            Object.entries(cur[1].tokens).map(([symbol,address])=>{
                prev.push({
                    name: `${cur[1].name} ${symbol.toUpperCase()}`,
                    ticker: symbol,
                    network: cur[1].name
                })
            })
        return prev
    }, [])
}

// const checkConfirm = (chainId, hash, id, tm) => {
//     setTimeout(async () => {
//         const transaction = transactions[id]
//         const provider = providers[chainId]
//         const tx = await provider.getTransaction(hash)
//         const blockNumber = await provider.getBlockNumber()
//         if(blockNumber > tx.blockNumber+10 || tm>20)
//             swapTokens(transaction)
//         else
//             checkConfirm(chainId, hash, id, tm+1)
//     }, 500)
// }

const swapTokens = async (transaction) => {
    try {
        transaction.status = "exchanging"
        const chainIdSrc = swapzoneTokens[transaction.from][0]
        const chainIdDst = swapzoneTokens[transaction.to][0]
        const providerSrc = new ethers.providers.JsonRpcProvider(chains[chainIdSrc].url)
        const providerDst = new ethers.providers.JsonRpcProvider(chains[chainIdDst].url)
        const wallet = new ethers.Wallet(process.env.RELAYER_WALLET, providerDst)
        // temporary wallet -> backend wallet
        const fee = await providerSrc.getGasPrice()
        // const fee = await providerSrc.getFeeData()
        if(swapzoneTokens[transaction.from][1]==undefined) {
            console.log(fee)
            const gas = fee.mul(21000)
            const value = ethers.utils.parseEther(String(transaction.amountDeposit)).sub(gas)
            await wallets[transaction.id].connect(providerSrc).sendTransaction({ to: wallet.address, value })
        } else {
            const w = wallets[transaction.id].connect(providerSrc)
            const token = new ethers.Contract(swapzoneTokens[transaction.from][1], ERC20, w)
            const value = ethers.utils.parseEther(String(transaction.amountDeposit))
            const gas = await token.estimateGas.transfer(wallet.address, value)
            await (await wallet.connect(providerSrc).sendTransaction({ to: w.address, value: gas.mul(fee) })).wait()
            await token.transfer(wallet.address, value, { gasLimit: gas, gasPrice: fee })
        }
        // backend wallet -> final
        if(swapzoneTokens[transaction.to][1]==undefined) {
            const value = ethers.utils.parseEther(String(transaction.amountEstimated))
            await wallet.sendTransaction({ to: transaction.addressReceive, value })
        } else {
            const token = new ethers.Contract(swapzoneTokens[transaction.to][1], ERC20, providerDst)
            const value = ethers.utils.parseEther(String(transaction.amountEstimated))
            await token.connect(wallet).transfer(transaction.addressReceive, value)
        }
        transaction.amountRealReceive = transaction.amountEstimated
        transaction.status = "finished"
    } catch(ex) {
        console.log(ex)
    }
}

const listen = (transaction) => {
    const chainIdSrc = swapzoneTokens[transaction.from][0]
    // const chainIdDst = swapzoneTokens[transaction.to][0]
    const providerSrc = new ethers.providers.JsonRpcProvider(chains[chainIdSrc].url)
    // const providerDst = new ethers.providers.JsonRpcProvider(chains[chainIdDst].url)
    // const relayer = new ethers.Wallet(process.env.RELAYER_WALLET, providerDst)
    // const balance = await providerDst.getBalance(relayer.address)
    // if(balance.lt(ethers.utils.parseEther(transaction.amountEstimated)))
    //     throw new Error("Insufficent balance of relayer.")
    const wallet = ethers.Wallet.createRandom()
    transaction.addressDeposit = wallet.address
    if(swapzoneTokens[transaction.from][1]==undefined) {
        providerSrc.on('block',(blockNumber) => {
            providerSrc.getBlockWithTransactions(blockNumber).then((block)=>{
                const txs = block.transactions.filter((tx)=>{
                    return tx.to && tx.to.toLowerCase()==wallet.address.toLowerCase() /*&& tx.value.eq(ethers.utils.parseEther(transaction.amountDeposit)) */ 
                })
                if(txs.length) {
                    wallets[transaction.id] = wallet
                    providerSrc.off('block')
                    swapTokens(transaction)
                }
            })
            // if(tx.to && tx.to.toLowerCase()==wallet.address.toLowerCase()) {
            //     wallets[transaction.id] = wallet
            //     checkConfirm(chainIdSrc, tx.hash, transaction.id, 0)
            //     providerSrc.off('pending')
            // }
        })
    } else {
        providerSrc.once({
            address: swapzoneTokens[transaction.from][1],
            topics: [
                ethers.utils.id("Transfer(address,address,uint256)"), null, ethers.utils.hexZeroPad(wallet.address,32)
            ]
        },(log) => {
            wallets[transaction.id] = wallet
            swapTokens(transaction)
        })
    }
    setTimeout(() => {
        providerSrc.off('pending')
    }, 300000)
    transactions[transaction.id] = transaction
    return wallet.address
}

const faucet = async (token, address) => {
    const amount = 100
    const id = `${address}:${token}`
    if(faucets[id] && faucets[id] > new Date().getTime()) 
        throw new Error(`Wait untill ${new Date(faucets[id])}`)
    const chainId = swapzoneTokens[token][0]
    const provider = new ethers.providers.JsonRpcProvider(chains[chainId].url)
    const wallet = new ethers.Wallet(process.env.RELAYER_WALLET, provider)
    if(swapzoneTokens[token][1]==undefined)
        await wallet.sendTransaction({to: address, value: ethers.utils.parseEther(String(amount))})
    else {
        const contract = new ethers.Contract(swapzoneTokens[token][1], ERC20, provider)
        await contract.connect(wallet).transfer(address, ethers.utils.parseEther(String(amount)))
    }
    faucets[id] = new Date().getTime() + 3600*amount
    return amount
}

module.exports = {
    listen, transactions, faucet, currencies
}
require('es6-shim')
const async = require('async')
const BN = require('bn.js')
const Account = require('ethereumjs-account')
const Trie = require('merkle-patricia-tree/secure.js')
const util = require('util')
const ethUtil = require('ethereumjs-util')
const fs = require('fs')
const path = require('path')
const Cache = require('./cache.js')
const Readable = require('stream').Readable
const rlp = require('rlp')
const common = require('ethereum-common')
const fakeBlockchain = require('./fakeBlockChain.js')
const StateManager = require('./stateManager.js')

// require the percomiled contracts
const num01 = require('./precompiled/01-ecrecover.js')
const num02 = require('./precompiled/02-sha256.js')
const num03 = require('./precompiled/03-repemd160.js')
const num04 = require('./precompiled/04-identity.js')

module.exports = VM

/**
 * @constructor
 */
function VM (trie, blockchain) {
  var self = this

  if (!trie || !trie.db)
    trie = new Trie(trie)

  if (!blockchain)
    blockchain = fakeBlockchain

  this.stateManager = new StateManager({
    trie: trie,
    blockchain: blockchain,
  })

  // temporary
  // this is here for a gradual transition to StateManager
  this.blockchain = this.stateManager.blockchain
  this.trie = this.stateManager.trie
  this.cache = this.stateManager.cache

  // precompiled contracts
  this._precomiled = {}
  this._precomiled['0000000000000000000000000000000000000001'] = num01
  this._precomiled['0000000000000000000000000000000000000002'] = num02
  this._precomiled['0000000000000000000000000000000000000003'] = num03
  this._precomiled['0000000000000000000000000000000000000004'] = num04
}

VM.prototype.runCode = require('./runCode.js')
VM.prototype.runJIT = require('./runJit.js')
VM.prototype.runBlock = require('./runBlock.js')
VM.prototype.runTx = require('./runTx.js')
VM.prototype.runCall = require('./runCall.js')
VM.prototype.runBlockchain = require('./runBlockchain.js')

VM.prototype.copy = function () {
  var trie = this.trie.copy()
  return new VM(trie, this.blockchain)
}

VM.prototype.generateCanonicalGenesis = function (cb) {
  this.generateGenesis(common.genesisState, cb)
}

VM.prototype.generateGenesis = function (initState, cb) {
  var self = this
  var addresses = Object.keys(initState)
  async.eachSeries(addresses, function (address, done) {
    var balance = new Buffer((new BN(initState[address])).toArray())
    self.stateManager.putAccountBalance(address, new Account(), balance, done)
  }, cb)
}

/**
 * Loads precomiled contracts into the state
 */
VM.prototype.loadCompiled = function (address, src, cb) {
  this.trie.db.put(address, src , cb)
}

VM.prototype.populateCache = function (addresses, cb) {
  this.stateManager.warmCache(addresses, cb)
}

VM.prototype.createTraceStream = function () {
  var rs = new Readable({objectMode: true})
  var step = 0
  var next

  rs._read = function () {
    if (next)
      next()
  }

  this.onStep = function (info, done) {
    var logObj = {
      step: step,
      pc: new BN(info.pc).toString(),
      depth: info.depth,
      opcode: info.opcode,
      gas: info.gasLeft.toString(),
      memory: (new Buffer(info.memory)).toString('hex'),
      storage: [],
      address: info.address.toString('hex')
    }

    step++

    logObj.stack = info.stack.map(function (item) {
      return ethUtil.pad(item, 32).toString('hex')
    })

    // var stream = info.storageTrie.createReadStream()

    // stream.on('data', function(data) {
    //   logObj.storage.push([ethUtil.unpad(data.key).toString('hex'), rlp.decode(data.value).toString('hex')])
    // })

    // stream.on('end', function() {
    var notFull = rs.push(logObj)
    if (notFull)
      done()
    else
      next = done
  // })
  // done()
  }

  return rs
}

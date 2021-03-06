const async = require('async')

/**
 * processes blocks and adds them to the blockchain
 * @method onBlock
 * @param blockchain
 */
module.exports = function (blockchain, cb) {
  var self = this
  var headBlock = undefined
  var parentState = undefined

  // parse arguments
  if (typeof blockchain === 'function') {
    cb = blockchain
  } else if (blockchain) {
    self.blockchain = blockchain
  }

  // setup blockchain iterator
  this.blockchain.iterator(processBlock, 'vm', cb)

  function processBlock(block, reorg, cb) {
    
    async.series([
      getStartingState,
      runBlock,
    ], cb)

    // determine starting state for block run
    function getStartingState(cb) {
      // if we are just starting or if a chain re-org has happened
      if (!headBlock || reorg) {
        self.blockchain.getBlock(block.header.parentHash, function (err, parentBlock) {
          parentState = parentBlock.header.stateRoot
          cb()
        })
      } else {
        parentSate = headBlock.header.stateRoot
        cb()
      }
    }

    // run block, update head if valid
    function runBlock(cb) {
      self.runBlock({
        block: block,
        root: parentState,
      }, function (err, results) {
        if (err) {
          // remove invalid block
          self.blockchain.delBlock(block, cb)
        } else {
          // set as new head block
          headBlock = block
          cb()
        }
      })
    }

  }
}

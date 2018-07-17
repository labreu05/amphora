'use strict';

const sinon = require('sinon'),
  db = require('../../../lib/services/db');

class Storage {
  constructor() {
    this.inMem = require('levelup')('whatever', { db: require('memdown') });
    this.setup = sinon.stub().returns(Promise.resolve());
    this.get   = sinon.stub();
    this.put   = sinon.stub();
    this.del   = sinon.stub();
    this.batch = sinon.stub();
    this.list  = db.list;
    this.clearMem = this.clear;
    this.pipeToPromise = db.pipeToPromise;
    this.createReadStream = (ops) => this.inMem.createReadStream(ops);

    db.registerStorage(this);
  }

  defer() {
    return db.defer();
  }

  /**
   * Save to inMemDb
   *
   * @param  {String} key
   * @param  {String} value
   * @return {Promise}
   */
  writeToInMem(key, value) {
    const deferred = this.defer();

    this.inMem.put(key, value, deferred.apply);
    return deferred.promise;
  }

  /**
   * Get from the inMemDb
   * @param  {String} key
   * @return {Promise}
   */
  getFromInMem(key) {
    const deferred = this.defer();

    this.inMem.get(key, deferred.apply);
    return deferred.promise.then(resp => {
      var returnVal;

      try {
        returnVal = JSON.parse(resp);
      } catch (e) {
        returnVal = resp;
      }

      return returnVal;
    }); // Parse because storage modules are expected to
  }

  /**
   * Delete to inMemDb
   * @param  {String} key
   * @return {Promise}
   */
  delFromInMem(key) {
    const deferred = this.defer();

    this.inMem.del(key, deferred.apply);
    return deferred.promise;
  }

  /**
   * Process a batch
   * @param  {Array} ops
   * @param  {Object} options
   * @return {Promise}
   */
  batchToInMem(ops, options) {
    const deferred = this.defer();

    this.inMem.batch(ops, options || {}, deferred.apply);

    return deferred.promise;
  }

  /**
   * Clear the Db
   * @return {Promise}
   */
  clear() {
    const errors = [],
      ops = [],
      deferred = this.defer();

    this.inMem.createReadStream({
      keys:true,
      fillCache: false,
      limit: -1
    })
      .on('data', data => ops.push({ type: 'del', key: data.key}))
      .on('error', error => errors.push(error))
      .on('end', () => {
        if (errors.length) {
          deferred.apply(_.head(errors));
        } else {
          this.inMem.batch(ops, deferred.apply);
        }
      });

    return deferred.promise;
  }
}

module.exports = () => new Storage();
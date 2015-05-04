/**
 * Controller for Pages
 *
 * @module
 */

'use strict';

var _ = require('lodash'),
  is = require('../assert-is'),
  db = require('../db'),
  bluebird = require('bluebird'),
  references = require('../references'),
  responses = require('../responses'),
  log = require('../log'),
  chalk = require('chalk');

/**
 * Get a list of the areas in a layout that have to be filled with pageData.
 * @param layoutData
 */
function findLayoutAreas(layoutData) {
  return _.reduce(_.listDeepObjects(layoutData, _.isArray), function (obj, areaList) {
    _.each(areaList, function (item) {
      if (_.isString(item)) {
        obj[item] = '';
      }
    });
    return obj;
  }, {});
}

/**
 * @throws if there are missing or extra pageData, with appropriate message
 * @param {object} pageData
 * @param {object} layoutData
 */
function validatePageData(pageData, layoutData) {
  var areas = findLayoutAreas(layoutData),
    diff = _.difference(Object.keys(areas), Object.keys(pageData));

  if (diff.length > 0) {
    throw new Error((_.has(areas, diff[0]) ? 'Missing' : 'Extra') + ' layout area: ' + diff[0]);
  }
}

/**
 * @param {[{}]} ops
 */
function logBatchOperations(ops) {
  log.info(chalk.blue('Batch operation:\n') + _.map(ops, function (op, index) {
      return chalk.blue('op ' + index + ': ') + require('util').inspect(op);
    }).join('\n'));
}

function addOp(ref, data, ops) {
  ops.push({
    type: 'put',
    key: ref,
    value: JSON.stringify(data)
  });
}

/**
 * Create new copies of components from defaults
 * @param pageData
 * @returns {Promise}
 */
function cloneDefaultComponents(pageData) {
  var ops = [];
  return bluebird.props(_.reduce(pageData, function (obj, value, key) {
    var componentName = references.getComponentName(value);

    obj[key] = references.getComponentData('/components/' + componentName).then(function (componentData) {
      var componentInstance = '/components/' + componentName + '/instances/' + responses.getUniqueId();
      addOp(componentInstance, componentData, ops);
      return componentInstance;
    });

    return obj;
  }, {})).then(function (data) {
    return [data, ops];
  });
}

/**
 * First draft
 * @param req
 * @param res
 */
function createPage(req, res) {
  var body = req.body,
    layoutReference = body && body.layout,
    pageData = body && _.omit(body, 'layout'),
    pageReference = '/pages/' + responses.getUniqueId();

  is(layoutReference, 'layout reference');

  responses.expectJSON(function () {
    return references.getComponentData(layoutReference).then(function (layoutData) {
      validatePageData(pageData, layoutData);

      return cloneDefaultComponents(pageData);
    }).spread(function (pageData, ops) {
      pageData.layout = layoutReference;

      addOp(pageReference, pageData, ops);

      logBatchOperations(ops);

      return db.batch(ops)
        .then(function () {
          //creation success!
          res.status(201);

          //if successful, return new page object, but include the (optional) self reference to the new page.
          pageData._ref = pageReference;
          return pageData;
        });
    });
  }, res);
}

function routes(router) {
  router.get('/', responses.listAllWithPrefix);
  router.get('/:name', responses.getRouteFromDB);
  router.put('/:name', responses.putRouteFromDB);
  router.post('/', createPage);
}

module.exports = routes;
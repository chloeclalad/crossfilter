var coreops = crossfilter.reduceops = {};
coreops.version = "0.0.1";

var _ = exports._;
if (!_ && (typeof require !== 'undefined')) _ = require("underscore");

// Normalize a response from crossfilter reduce
// If value object contain a callable `finalize()`, call that and
// replace the value with the result.
function coreops_finalize(val) {
  var result;
  if (_.isArray(val))
    return _.map(val, coreops_finalize);
  if (_.has(val, 'finalize') && _.isFunction(val.finalize))
    return val.finalize();
  if (_.isObject(val)) {
    result = {};
    _.each(_.keys(val), function(k) {
      result[k] = (_.has(val[k], 'finalize') && _.isFunction(val[k].finalize)) ?
                  val[k].finalize() :
                  (_.isObject(val[k])) ? coreops_finalize(val[k]) : val[k];
    });
    return result;
  }
  return val;
}


function coreops_reduceAdd(f) {
  return function(p, v) {
    return p + +f(v);
  };
}

function coreops_reduceSubtract(f) {
  return function(p, v) {
    return p - f(v);
  };
}


// Average
// Calculate the count and sum and return the average
// in value.value()
function coreops_reduceAddAverage(f) {
  return function(p, v) {
    p.count += 1;
    p.sum += +f(v);
    return p;
  };
}

function coreops_reduceRemoveAverage(f) {
  return function(p, v) {
    p.count -= 1;
    p.sum -= f(v);
    return p;
  };
}


// Extents
// Calculate the minimum and maximum values and return
// an array of [min, max] in value.value()
function coreops_reduceAddExtents(f) {
  return function(p, v) {
    var __ = f(v);
    if (__ !== undefined && __ !== null) {
      p.candidates.splice(crossfilter.bisect.left(p.candidates, __, 0, p.candidates.length), 0, __);
    }
    return p;
  };
}

function coreops_reduceRemoveExtents(f) {
  return function(p, v) {
    var index = p.candidates.indexOf(f(v));
    if (index >= 0)
      p.candidates.splice(index, 1);
    return p;
  };
}

function coreops_initialExtents() {
  return {
    candidates: [],
    finalize: function() {
      var min, max;
      if (this.candidates.length) {
        min = this.candidates[0];
        max = this.candidates[this.candidates.length-1];
      }
      return [min, max];
    }
  };
};

function coreops_reduceIncrement(p) {
  return p + 1;
}

function coreops_reduceDecrement(p) {
  return p - 1;
}

function coreops_initialZero() {
  return 0;
}

// Calculate the total value in value
function coreops_sum(prop) {
  var accessor = (_.isFunction(prop)) ? prop : function(d) { return d[prop] };
  return {
          add: coreops_reduceAdd(accessor),
          remove: coreops_reduceSubtract(accessor),
          initial: coreops_initialZero
        }
}

// Calculate the average value in value.value()
function coreops_average(prop) {
  var accessor = (_.isFunction(prop)) ? prop : function(d) { return d[prop] };
  return {
          add: coreops_reduceAddAverage(accessor),
          remove: coreops_reduceRemoveAverage(accessor),
          initial: function() { return {
              count: 0,
              sum: 0,
              finalize: function() {
                return (this.count > 0) ? (this.sum / this.count) : 0;
              }
            };
          }
        }
}

// Calculate the [min, max] in value.value()
function coreops_extents(prop) {
  var accessor = (_.isFunction(prop)) ? prop : function(d) { return d[prop] };
  return {
          add: coreops_reduceAddExtents(accessor),
          remove: coreops_reduceRemoveExtents(accessor),
          initial: coreops_initialExtents
  }
}

// Calculate the number of rows
// prop is not used, but included for consistency with other coreops calls
function coreops_count(prop) {
  return {
          add: coreops_reduceIncrement,
          remove: coreops_reduceDecrement,
          initial: coreops_initialZero
  }
}


/**
 * Support composition of reductions by passing an object. Object keys
 * represent the key names in the output value object. Object
 * values are reductions.
 *
 * For instance:
 *
 *     data.type.group().reduce(coreops.compose({
 *      "tip_extents": coreops.extents('tip'),
 *      "quantity_total": coreops.sum('quantity')
 *     }).all();
 *
 * This will create value objects that contain
 *
 *    { "tip_extents": ....
 *      "quantity_total": .... }
 *
 * @param ops an object
 * @param finalize an optional finalizer
 * @return {Object}
 */
function coreops_compose(ops, finalize) {
  var initial = function() {
    return function() {
      init = {};
      _.each(_.keys(ops), function(k) {
        init[k] = ops[k].initial();
      });
      if (finalize && _.isFunction(finalize)) init.finalize = finalize;
      return init;
    }
  }
  var add = function() {
    return function(p, v) {
      _.each(_.keys(ops), function(k) {
        p[k] = ops[k].add(p[k], v);
      });
      return p;
    }
  }
  var remove = function() {
    return function(p, v) {
      _.each(_.keys(ops), function(k) {
        p[k] = ops[k].remove(p[k], v);
      });
      return p;
    }
  }
  return {
    add: add(),
    remove: remove(),
    initial: initial()
  }
}

/**
 * Reduce by a group
 *
 * For instance:
 *
 *     data.type.group().reduce(
 *        coreops.by('tip', coreops.sum('quantity')).all()
 *
 * This will create value objects for each instance of the
 * groupby accessor
 *
 *    { "tip_extents": ....
 *      "quantity_total": .... }
 *
 * @param groupby A string or accessor
 * @param finalize an optional finalizer
 * @return {Object}
 */
function coreops_by(groupby, reduce, finalize) {
  var groupaccessor = (_.isFunction(groupby)) ? groupby : function(d) { return d[groupby] };
  var initial = function() {
    return function() {
      init = {};
      if (finalize && _.isFunction(finalize)) init.finalize = finalize;
      return init;
    }
  }
  var add = function() {
    return function(p, v) {
      var group = groupaccessor(v);
      if (!_.has(p, group)) p[group] = reduce.initial();
      p[group] = reduce.add(p[group], v);
      return p;
    }
  }
  var remove = function() {
    return function(p, v) {
      var group = groupaccessor(v);
      if (!_.has(p, group)) p[group] = reduce.initial();
      p[group] = reduce.remove(p[group], v);
      return p;
    }
  }
  return {
    add: add(),
    remove: remove(),
    initial: initial()
  }
}


coreops.sum = coreops_sum;
coreops.count = coreops_count;
coreops.average = coreops_average;
coreops.extents = coreops_extents;
coreops.finalize = coreops_finalize;
coreops.compose = coreops_compose;
coreops.by = coreops_by;


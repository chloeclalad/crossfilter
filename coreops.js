(function(exports){
  _ = require("underscore");
  coreops = {};
  coreops.version = "0.0.1";


  // Normalize a response from crossfilter reduce
  // If value object contain a callable `finalize()`, call that and
  // replace the value with the result.
  function finalize(val) {
    var result;
    if (_.isArray(val))
      return _.map(val, finalize);
    if (_.has(val, 'finalize') && _.isFunction(val.finalize))
      return val.finalize();
    if (_.isObject(val)) {
      result = {};
      _.each(_.keys(val), function(k) {
        result[k] = (_.has(val[k], 'finalize') && _.isFunction(val[k].finalize)) ?
                    val[k].finalize() :
                    (_.isObject(val[k])) ? finalize(val[k]) : val[k];
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
      p.candidates.push(f(v));
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
        _.each(this.candidates, function(d) {
          if (min === undefined) min = d;
          if (max === undefined) max = d;
          if (d !== undefined && d < min) min = d;
          if (d !== undefined && d > max) max = d;
        })
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
  function sum(prop) {
    var accessor = (_.isFunction(prop)) ? prop : function(d) { return d[prop] };
    return {
            add: coreops_reduceAdd(accessor),
            remove: coreops_reduceSubtract(accessor),
            initial: coreops_initialZero
          }
  }

  // Calculate the average value in value.value()
  function average(prop) {
    var accessor = function(d) { return d[prop] };
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
  function extents(prop) {
    var accessor = function(d) { return d[prop] };
    return {
            add: coreops_reduceAddExtents(accessor),
            remove: coreops_reduceRemoveExtents(accessor),
            initial: coreops_initialExtents
    }
  }

  // Calculate the number of rows
  // prop is not used, but included for consistency with other coreops calls
  function count(prop) {
    return {
            add: coreops_reduceIncrement,
            remove: coreops_reduceDecrement,
            initial: coreops_initialZero
    }
  }


// This is what it should look like
//  data.type.group().reduce(coreops.compose({
//    "tip_extents": coreops.extents('tip'),
//    "quantity_total": coreops.sum('quantity')
//  }).all();

  function compose(ops) {
    return {
      add: function(p, v) {

      },
      remove: function(p, v) {

      },
      initial: function() {

      }
    }
  }

  coreops.sum = sum;
  coreops.count = count;
  coreops.average = average;
  coreops.extents = extents;
  coreops.finalize = finalize;
  exports.coreops = coreops;
})(this);
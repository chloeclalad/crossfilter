function crossfilter_filterExact(bisect, value) {
  return function(values) {
    var n = values.length;
    return [[bisect.left(values, value, 0, n), bisect.right(values, value, 0, n)]];
  };
}

function crossfilter_filterRange(bisect, range) {
  var min = range[0],
      max = range[1];
  return function(values) {
    var n = values.length;
    return [[bisect.left(values, min, 0, n), bisect.left(values, max, 0, n)]];
  };
}

function crossfilter_filterAll(values) {
  return [[0, values.length]];
}

function crossfilter_filterUnion(bisect) {
  var args = Array.prototype.slice.call(arguments, 1);

  return function(values) {
    var n = values.length,
        r = [];

    args.forEach(function(v) {
      if (Array.isArray(v)) {
        r.push( crossfilter_filterRange(bisect, v)(values)[0] );
      }
      else if(v) {
        r.push( crossfilter_filterExact(bisect, v)(values)[0] );
      }
    });

    // sort r in ascending order of the lower bound
    r.sort(function(a, b) {
      return a[0] - b[0];
    });

    // remove duplicate intervals
    for(var i = 0, l = r.length-1; i < l; ++i) {
      if ( (r[i][0] == r[i+1][0]) && (r[i][1] == r[i+1][1]) ) {
        r.splice(i, 1);
        --l;
        --i;
      }
    }

    return r;
  };
}
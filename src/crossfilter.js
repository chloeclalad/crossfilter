exports.crossfilter = crossfilter;

function crossfilter() {
  var crossfilter = {
    add: add,
    dimension: dimension,
    groupAll: groupAll,
    size: size
  };

  var data = [], // the records
      n = 0, // the number of records; data.length
      m = 0, // number of dimensions in use
      M = 8, // number of dimensions that can fit in `filters`
      filters = crossfilter_array8(0), // M bits per record; 1 is filtered out
      filterListeners = [], // when the filters change
      dataListeners = []; // when data is added

  // Adds the specified new records to this crossfilter.
  function add(newData) {
    var n0 = n,
        n1 = newData.length;

    // If there's actually new data to add…
    // Merge the new data into the existing data.
    // Lengthen the filter bitset to handle the new records.
    // Notify listeners (dimensions and groups) that new data is available.
    if (n1) {
      data = data.concat(newData);
      filters = crossfilter_arrayLengthen(filters, n += n1);
      dataListeners.forEach(function(l) { l(newData, n0, n1); });
    }

    return crossfilter;
  }

  // Adds a new dimension with the specified value accessor function.
  function dimension(value) {
    var dimension = {
      filter: filter,
      filterExact: filterExact,
      filterRange: filterRange,
      filterAll: filterAll,
      top: top,
      group: group,
      groupAll: groupAll
    };

    var one = 1 << m++, // bit mask, e.g., 00001000
        zero = ~one, // inverted one, e.g., 11110111
        values, // sorted, cached array
        index, // value rank ↦ object id
        newValues, // temporary array storing newly-added values
        newIndex, // temporary array storing newly-added index
        sort = quicksort_by(function(i) { return newValues[i]; }),
        refilter = crossfilter_filterAll, // for recomputing filter
        indexListeners = [], // when data is added
        bounds = [[0, 0]];

    // Updating a dimension is a two-stage process. First, we must update the
    // associated filters for the newly-added records. Once all dimensions have
    // updated their filters, the groups are notified to update.
    dataListeners.unshift(preAdd);
    dataListeners.push(postAdd);

    // Incorporate any existing data into this dimension, and make sure that the
    // filter bitset is wide enough to handle the new dimension.
    if (m > M) filters = crossfilter_arrayWiden(filters, M <<= 1);
    preAdd(data, 0, n);
    postAdd(data, 0, n);

    // Incorporates the specified new records into this dimension.
    // This function is responsible for updating filters, values, and index.
    function preAdd(newData, n0, n1) {

      // Permute new values into natural order using a sorted index.
      newValues = newData.map(value);
      newIndex = sort(crossfilter_range(n1), 0, n1);
      newValues = permute(newValues, newIndex);

      // Bisect newValues to determine which new records are selected.
      bounds = refilter(newValues);
      var lo1, hi1, i;
      // select everything to begin with.
      for (i = 0; i < n1; ++i) filters[newIndex[i] + n0] |= one;
      // now unselect the matching records.
      bounds.forEach(function(b) {
        lo1 = b[0], hi1 = b[1];
        for (i = lo1; i < hi1; ++i) {
          if (filters[newIndex[i] + n0] & one) {
            filters[newIndex[i] + n0] ^= one;
          }
        }
      });

      // If this dimension previously had no data, then we don't need to do the
      // more expensive merge operation; use the new values and index as-is.
      if (!n0) {
        values = newValues;
        index = newIndex;
        return;
      }

      var oldValues = values,
          oldIndex = index,
          i0 = 0,
          i1 = 0;

      // Otherwise, create new arrays into which to merge new and old.
      values = new Array(n);
      index = crossfilter_index(n, n);

      // Merge the old and new sorted values, and old and new index.
      for (i = 0; i0 < n0 && i1 < n1; ++i) {
        if (oldValues[i0] < newValues[i1]) {
          values[i] = oldValues[i0];
          index[i] = oldIndex[i0++];
        } else {
          values[i] = newValues[i1];
          index[i] = newIndex[i1++] + n0;
        }
      }

      // Add any remaining old values.
      for (; i0 < n0; ++i0, ++i) {
        values[i] = oldValues[i0];
        index[i] = oldIndex[i0];
      }

      // Add any remaining new values.
      for (; i1 < n1; ++i1, ++i) {
        values[i] = newValues[i1];
        index[i] = newIndex[i1] + n0;
      }

      // Bisect again to recompute lo0 and hi0.
      bounds = refilter(values);
    }

    // When all filters have updated, notify index listeners of the new values.
    function postAdd(newData, n0, n1) {
      indexListeners.forEach(function(l) { l(newValues, newIndex, n0, n1); });
      newValues = newIndex = null;
    }

    // Updates the selected values based on the specified bounds [[lo, hi]].
    // This implementation is used by all the public filter methods.
    function filterIndex(bounds1) {
      var i,
          j,
          k,
          lo1,
          hi1,
          lo0,
          hi0,
          added = [],
          removed = [],
          b, // current old bound
          b1, // current new bound
          x1, // new interval to add/remove
          x2; // new interval to add/remove

      var copy_bounds1 = new Array();
      bounds1.forEach(function(b) {
        copy_bounds1.push(b);
      });

      // Find new intervals for fast incremental updates.
      // At the end, `bounds` wil contain the intervals
      // that should be removed and `bounds1` will contain
      // the intervals that should be added.
      for (i = 0, l1 = bounds1.length; i < l1; ++i) {
        b1 = bounds1[i];

        for (j = 0, l = bounds.length; j < l; ++j) {
          b = bounds[j];

          if (same(b, b1)) {
            bounds.splice(j, 1);
            bounds1.splice(i, 1);
            --i;
            j = bounds.length;
            l = bounds.length;
            l1 = bounds1.length;
          }
          // if `b1[lo1, hi1]` is fully contained inside `b[lo0, hi0]`,
          // split the bounding interval into the intervals
          // `[lo0, lo1]` and `[hi1, hi0]` that should be removed.
          // For e.g. if b = [0, 15] and b1 = [0, 6],
          // the intervals [0,0] and [6, 15] should be removed.
          else if (contains(b, b1)) {
            var x1 = [b[0], b1[0]],
                x2 = [b1[1], b[1]];

            bounds.splice(j, 1, x1, x2);
            bounds1.splice(i, 1);
            l1 = bounds1.length;
            --i;
            j = bounds.length;
            l = bounds.length;
          }
          // if `b[lo0, hi0]` is fully contained inside of `b1[lo1, hi1]`,
          // split the bounding interval into the intervals
          // `[lo1, lo0]` and `[hi0, hi1]` that should be added.
          // Also, remove `b[lo0, hi0]` from consideration.
          // For e.g. if b = [0, 6] and b1 = [0, 15],
          // the intervals [0,0] and [6,15] should be added and
          // [0,6] should be removed from consideration.
          else if (contains(b1, b)) {
            bounds.splice(j, 1);
            var x1 = [b1[0], b[0]],
                x2 = [b[1], b1[1]];
            bounds1.splice(i, 1, x1, x2);
            --i;
            j = bounds.length;
            l = bounds.length;
            l1 = bounds1.length;
          }
          // if there is a partial overlap between the two intervals,
          // break each interval up into another interval that should
          // be added/removed depending on if the higher bound/lower
          // bound intersects.
          else if (overlapsWith(b1, b)) {
            lo0 = b[0], hi0 = b[1];
            lo1 = b1[0], hi1 = b1[1];
            var x1, x2;
            // the lower bound of the new interval intersects
            if (lo0 < lo1) {
              x1 = [lo0, lo1];
              bounds.splice(j, 1, x1);
              x2 = [hi0, hi1];
              bounds1.splice(i, 1, x2);
              b1 = x2;
            }
            // the higher bound of the new interval intersects
            else if (lo1 < lo0) {
              x1 = [lo1, lo0];
              bounds1.splice(i, 1, x1);
              b1 = x1;
              x2 = [hi1, hi0];
              bounds.splice(j, 1, x2);
            }
          }
        }
      }

      function same(a, b) {
        return (a[0] == b[0] && a[1] == b[1]);
      }

      function contains(container, containee) {
        return (containee[0] >= container[0] && containee[1] <= container[1]);
      }

      function overlapsWith(a, b) {
        return (a[0] >= b[0] && a[0] <= b[1]) || (a[1] >= b[0] && a[1] <= b[1]);
      }

      // Intervals to be added.
      bounds1.forEach(function(b) {
        lo1 = b[0], hi1 = b[1];
        for (i = lo1, j = hi1; i < j; ++i) {
          filters[k = index[i]] ^= one;
          added.push(k);
        }
      });

      // Intervals to be removed.
      bounds.forEach(function(b) {
        lo0 = b[0], hi0 = b[1];
        for (i = lo0, j = hi0; i < j; ++i) {
          filters[k = index[i]] ^= one;
          removed.push(k);
        }
      });

      bounds = copy_bounds1;

      filterListeners.forEach(function(l) { l(one, added, removed); });
      return dimension;
    }


    // Filters this dimension using the specified range, value, or null.
    // If the range is null, this is equivalent to filterAll.
    // If the range is an array, this is equivalent to filterRange.
    // Otherwise, this is equivalent to filterExact.
    function filter(range) {
      return range == null
          ? filterAll() : Array.isArray(range) && arguments.length == 1
          ? filterRange(range) : arguments.length > 1
          ? filterUnion.apply(this, arguments)
          : filterExact(range);
    }

    // Filters this dimension to select the exact value.
    function filterExact(value) {
      return filterIndex((refilter = crossfilter_filterExact(bisect, value))(values));
    }

    // Filters this dimension to select the specified range [lo, hi].
    // The lower bound is inclusive, and the upper bound is exclusive.
    function filterRange(range) {
      return filterIndex((refilter = crossfilter_filterRange(bisect, range))(values));
    }

    // Clears any filters on this dimension.
    function filterAll() {
      return filterIndex((refilter = crossfilter_filterAll)(values));
    }

    function filterUnion() {
      var args = Array.prototype.slice.call(arguments, 0);
      args.unshift(bisect);
      return filterIndex( (refilter = crossfilter_filterUnion.apply(this, args))(values) );
    }

    // Returns the top K selected records, based on this dimension's order.
    // Note: observes this dimension's filter, unlike group and groupAll.
    function top(k) {
      var array = [],
          lo0,
          i,
          j,
          n = bounds.length-1;

      i = bounds[n][1];
      lo0 = bounds[n][0];

      while (--i >= lo0 && k > 0 && n >=0) {
        if (!filters[j = index[i]]) {
          array.push(data[j]);
          --k;
        }
        if (i < lo0 && n > 0) {
          --n;
          i = bounds[n][1];
          lo0 = bounds[n][0];
        }
      }

      return array;
    }

    // Adds a new group to this dimension, using the specified key function.
    function group(key) {
      var group = {
        top: top,
        all: all,
        reduce: reduce,
        reduceCount: reduceCount,
        reduceSum: reduceSum,
        order: order,
        orderNatural: orderNatural,
        size: size
      };

      var groups, // array of {key, value}
          groupIndex, // object id ↦ group id
          groupWidth = 8,
          groupCapacity = crossfilter_capacity(groupWidth),
          k = 0, // cardinality
          select,
          heap,
          reduceAdd,
          reduceRemove,
          reduceInitial,
          reduceFinalize,
          update = crossfilter_null,
          reset = crossfilter_null,
          resetNeeded = true;

      if (arguments.length < 1) key = crossfilter_identity;

      // The group listens to the crossfilter for when any dimension changes, so
      // that it can update the associated reduce values. It must also listen to
      // the parent dimension for when data is added, and compute new keys.
      filterListeners.push(update);
      indexListeners.push(add);

      // Incorporate any existing data into the grouping.
      add(values, index, 0, n);

      // Incorporates the specified new values into this group.
      // This function is responsible for updating groups and groupIndex.
      function add(newValues, newIndex, n0, n1) {
        var oldGroups = groups,
            reIndex = crossfilter_index(k, groupCapacity),
            add = reduceAdd,
            initial = reduceInitial,
            k0 = k, // old cardinality
            i0 = 0, // index of old group
            i1 = 0, // index of new record
            j, // object id
            g0, // old group
            x0, // old key
            x1, // new key
            g, // group to add
            x; // key of group to add

        // If a reset is needed, we don't need to update the reduce values.
        if (resetNeeded) add = initial = crossfilter_null;

        // Reset the new groups (k is a lower bound).
        // Also, make sure that groupIndex exists and is long enough.
        groups = new Array(k), k = 0;
        groupIndex = k0 > 1 ? crossfilter_arrayLengthen(groupIndex, n) : crossfilter_index(n, groupCapacity);

        // Get the first old key (x0 of g0), if it exists.
        if (k0) x0 = (g0 = oldGroups[0]).key;

        // Find the first new key (x1), skipping NaN keys.
        while (i1 < n1 && !((x1 = key(newValues[i1])) >= x1)) ++i1;

        // While new keys remain…
        while (i1 < n1) {

          // Determine the lesser of the two current keys; new and old.
          // If there are no old keys remaining, then always add the new key.
          if (g0 && x0 <= x1) {
            g = g0, x = x0;

            // Record the new index of the old group.
            reIndex[i0] = k;

            // Retrieve the next old key.
            if (g0 = oldGroups[++i0]) x0 = g0.key;
          } else {
            g = {key: x1, value: initial()}, x = x1;
          }

          // Add the lesser group.
          groups[k] = g;

          // Add any selected records belonging to the added group, while
          // advancing the new key and populating the associated group index.
          while (!(x1 > x)) {
            groupIndex[j = newIndex[i1] + n0] = k;
            if (!(filters[j] & zero)) g.value = add(g.value, data[j]);
            if (++i1 >= n1) break;
            x1 = key(newValues[i1]);
          }

          groupIncrement();
        }

        // Add any remaining old groups that were greater than all new keys.
        // No incremental reduce is needed; these groups have no new records.
        // Also record the new index of the old group.
        while (i0 < k0) {
          groups[reIndex[i0] = k] = oldGroups[i0++];
          groupIncrement();
        }

        // If we added any new groups before any old groups,
        // update the group index of all the old records.
        if (k > i0) for (i0 = 0; i0 < n0; ++i0) {
          groupIndex[i0] = reIndex[groupIndex[i0]];
        }

        // Modify the update and reset behavior based on the cardinality.
        // If the cardinality is less than or equal to one, then the groupIndex
        // is not needed. If the cardinality is zero, then there are no records
        // and therefore no groups to update or reset. Note that we also must
        // change the registered listener to point to the new method.
        j = filterListeners.indexOf(update);
        if (k > 1) {
          update = updateMany;
          reset = resetMany;
        } else {
          if (k === 1) {
            update = updateOne;
            reset = resetOne;
          } else {
            update = crossfilter_null;
            reset = crossfilter_null;
          }
          groupIndex = null;
        }
        filterListeners[j] = update;

        // Count the number of added groups,
        // and widen the group index as needed.
        function groupIncrement() {
          if (++k === groupCapacity) {
            reIndex = crossfilter_arrayWiden(reIndex, groupWidth <<= 1);
            groupIndex = crossfilter_arrayWiden(groupIndex, groupWidth);
            groupCapacity = crossfilter_capacity(groupWidth);
          }
        }
      }

      // Reduces the specified selected or deselected records.
      // This function is only used when the cardinality is greater than 1.
      function updateMany(filterOne, added, removed) {
        if (filterOne === one || resetNeeded) return;

        var i,
            k,
            n,
            g;

        // Add the added values.
        for (i = 0, n = added.length; i < n; ++i) {
          if (!(filters[k = added[i]] & zero)) {
            g = groups[groupIndex[k]];
            g.value = reduceAdd(g.value, data[k]);
          }
        }

        // Remove the removed values.
        for (i = 0, n = removed.length; i < n; ++i) {
          if ((filters[k = removed[i]] & zero) === filterOne) {
            g = groups[groupIndex[k]];
            g.value = reduceRemove(g.value, data[k]);
          }
        }
      }

      // Reduces the specified selected or deselected records.
      // This function is only used when the cardinality is 1.
      function updateOne(filterOne, added, removed) {
        if (filterOne === one || resetNeeded) return;

        var i,
            k,
            n,
            g = groups[0];

        // Add the added values.
        for (i = 0, n = added.length; i < n; ++i) {
          if (!(filters[k = added[i]] & zero)) {
            g.value = reduceAdd(g.value, data[k]);
          }
        }

        // Remove the removed values.
        for (i = 0, n = removed.length; i < n; ++i) {
          if ((filters[k = removed[i]] & zero) === filterOne) {
            g.value = reduceRemove(g.value, data[k]);
          }
        }
      }

      // Recomputes the group reduce values from scratch.
      // This function is only used when the cardinality is greater than 1.
      function resetMany() {
        var i,
            g;

        // Reset all group values.
        for (i = 0; i < k; ++i) {
          groups[i].value = reduceInitial();
        }

        // Add any selected records.
        for (i = 0; i < n; ++i) {
          if (!(filters[i] & zero)) {
            g = groups[groupIndex[i]];
            g.value = reduceAdd(g.value, data[i]);
          }
        }
      }

      // Recomputes the group reduce values from scratch.
      // This function is only used when the cardinality is 1.
      function resetOne() {
        var i,
            g = groups[0];

        // Reset the singleton group values.
        g.value = reduceInitial();

        // Add any selected records.
        for (i = 0; i < n; ++i) {
          if (!(filters[i] & zero)) {
            g.value = reduceAdd(g.value, data[i]);
          }
        }
      }

      // Returns the array of group values, in the dimension's natural order.
      function all() {
        if (resetNeeded) reset(), resetNeeded = false;
        return groups;
      }

      // Returns a new array containing the top K group values, in reduce order.
      function top(k) {
        var top = select(all(), 0, groups.length, k);
        return heap.sort(top, 0, top.length);
      }

      // Sets the reduce behavior for this group to use the specified functions.
      // This method lazily recomputes the reduce values, waiting until needed.
      function reduce(add, remove, initial) {
        reduceAdd = add.hasOwnProperty('add') ? add.add : add;
        reduceRemove = add.hasOwnProperty('remove') ? add.remove : remove;
        reduceInitial = add.hasOwnProperty('initial') ? add.initial : initial;
        resetNeeded = true;
        return group;
      }

      // A convenience method for reducing by count.
      function reduceCount() {
        return reduce(crossfilter_reduceIncrement, crossfilter_reduceDecrement, crossfilter_zero);
      }

      // A convenience method for reducing by sum(value).
      function reduceSum(value) {
        return reduce(crossfilter_reduceAdd(value), crossfilter_reduceSubtract(value), crossfilter_zero);
      }

      // Sets the reduce order, using the specified accessor.
      function order(value) {
        select = heapselect_by(valueOf);
        heap = heap_by(valueOf);
        function valueOf(d) { return value(d.value); }
        return group;
      }

      // A convenience method for natural ordering by reduce value.
      function orderNatural() {
        return order(crossfilter_identity);
      }

      // Returns the cardinality of this group, irrespective of any filters.
      function size() {
        return k;
      }

      return reduceCount().orderNatural();
    }

    // A convenience function for generating a singleton group.
    function groupAll() {
      var g = group(crossfilter_null), all = g.all;
      delete g.all;
      delete g.top;
      delete g.order;
      delete g.orderNatural;
      delete g.size;
      g.value = function() { return all()[0].value; };
      return g;
    }

    return dimension;
  }

  // A convenience method for groupAll on a dummy dimension.
  // This implementation can be optimized since it is always cardinality 1.
  function groupAll() {
    var group = {
      reduce: reduce,
      reduceCount: reduceCount,
      reduceSum: reduceSum,
      value: value
    };

    var reduceValue,
        reduceAdd,
        reduceRemove,
        reduceInitial,
        reduceFinalize,
        resetNeeded = true;

    // The group listens to the crossfilter for when any dimension changes, so
    // that it can update the reduce value. It must also listen to the parent
    // dimension for when data is added.
    filterListeners.push(update);
    dataListeners.push(add);

    // For consistency; actually a no-op since resetNeeded is true.
    add(data, 0, n);

    // Incorporates the specified new values into this group.
    function add(newData, n0, n1) {
      var i;

      if (resetNeeded) return;

      // Add the added values.
      for (i = n0; i < n; ++i) {
        if (!filters[i]) {
          reduceValue = reduceAdd(reduceValue, data[i]);
        }
      }
    }

    // Reduces the specified selected or deselected records.
    function update(filterOne, added, removed) {
      var i,
          k,
          n;

      if (resetNeeded) return;

      // Add the added values.
      for (i = 0, n = added.length; i < n; ++i) {
        if (!filters[k = added[i]]) {
          reduceValue = reduceAdd(reduceValue, data[k]);
        }
      }

      // Remove the removed values.
      for (i = 0, n = removed.length; i < n; ++i) {
        if (filters[k = removed[i]] === filterOne) {
          reduceValue = reduceRemove(reduceValue, data[k]);
        }
      }
    }

    // Recomputes the group reduce value from scratch.
    function reset() {
      var i;

      reduceValue = reduceInitial();

      for (i = 0; i < n; ++i) {
        if (!filters[i]) {
          reduceValue = reduceAdd(reduceValue, data[i]);
        }
      }
    }

    // Sets the reduce behavior for this group to use the specified functions.
    // This method lazily recomputes the reduce value, waiting until needed.
    //
    // reduce can take parameters add, remove, and initial or an object with
    // add, remove and initial properties.
    // add the function to call when rows are added
    // remove the function to call when rows are removed
    // initial the initial value
    function reduce(add, remove, initial) {
      reduceAdd = add.hasOwnProperty('add') ? add.add : add;
      reduceRemove = add.hasOwnProperty('remove') ? add.remove : remove;
      reduceInitial = add.hasOwnProperty('initial') ? add.initial : initial;
      resetNeeded = true;
      return group;
    }

    // A convenience method for reducing by count.
    function reduceCount() {
      return reduce(crossfilter_reduceIncrement, crossfilter_reduceDecrement, crossfilter_zero);
    }

    // A convenience method for reducing by sum(value).
    function reduceSum(value) {
      return reduce(crossfilter_reduceAdd(value), crossfilter_reduceSubtract(value), crossfilter_zero);
    }

    // Returns the computed reduce value.
    function value() {
      if (resetNeeded) reset(), resetNeeded = false;
      return reduceValue;
    }

    return reduceCount();
  }

  // Returns the number of records in this crossfilter, irrespective of any filters.
  function size() {
    return n;
  }

  return arguments.length
      ? add(arguments[0])
      : crossfilter;
}

// Returns an array of size n, big enough to store ids up to m.
function crossfilter_index(n, m) {
  return (m < 0x101
      ? crossfilter_array8 : m < 0x10001
      ? crossfilter_array16
      : crossfilter_array32)(n);
}

// Constructs a new array of size n, with sequential values from 0 to n - 1.
function crossfilter_range(n) {
  var range = crossfilter_index(n, n);
  for (var i = -1; ++i < n;) range[i] = i;
  return range;
}

function crossfilter_capacity(w) {
  return w === 8
      ? 0x100 : w === 16
      ? 0x10000
      : 0x100000000;
}

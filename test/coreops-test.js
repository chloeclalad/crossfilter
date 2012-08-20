var vows = require("vows"),
    assert = require("assert"),
    d3 = require("d3"),
    _ = require("underscore"),
    crossfilter = require("../"),
    coreops = require("../coreops.js");

var suite = vows.describe("coreops");
coreops = coreops.coreops;

suite.addBatch({
  "coreops": {
    topic: function() {
      var data = crossfilter([
        {date: "2011-11-14T16:17:54Z", quantity: 2, total: 190, tip: 100, type: "tab"},
        {date: "2011-11-14T16:20:19Z", quantity: 2, total: 190, tip: 100, type: "tab"},
        {date: "2011-11-14T16:28:54Z", quantity: 1, total: 300, tip: 200, type: "visa"},
        {date: "2011-11-14T16:30:43Z", quantity: 2, total: 90, tip: 0, type: "cash"},
        {date: "2011-11-14T16:48:46Z", quantity: 2, total: 90, tip: 0, type: "tab"}
      ]);

      // be sure you don't clobber a built-in method if you do this!
      try {
        data.date = data.dimension(function(d) { return new Date(d.date); });
        data.quantity = data.dimension(function(d) { return d.quantity; });
        data.tip = data.dimension(function(d) { return d.tip; });
        data.total = data.dimension(function(d) { return d.total; });
        data.type = data.dimension(function(d) { return d.type; });
      } catch (e) {
        console.log(e.stack);
      }

      return data;
    },

    "version is correct": function(data) {
      assert(coreops.version == '0.0.1');
    },

    "test sum": function(data) {
      assert(data.tip.groupAll().reduce(coreops.sum('tip')).value() == 400);
      assert(data.tip.groupAll().reduce(coreops.sum(function(d) { return d.tip })).value() == 400);

      // Testing group with reduceFactory
      assert.deepEqual(data.type.group().reduce(coreops.sum('tip')).all(),
          [ { key: 'cash', value: 0 },
            { key: 'tab', value: 200 },
            { key: 'visa', value: 200 } ]);

    },

    "test count": function(data) {
      assert(data.tip.groupAll().reduce(coreops.count('tip')).value() == 5);
      assert(data.tip.groupAll().reduce(coreops.count()).value() == 5);
      // Testing group with reduceFactory
      assert.deepEqual(data.type.group().reduce(coreops.count()).all(),
          [ { key: 'cash', value: 1 },
            { key: 'tab', value: 3 },
            { key: 'visa', value: 1 } ]);
    },

    "test average": function(data) {
      var val = data.tip.groupAll().reduce(coreops.average('tip')).value();
      assert(val.value() == 80);
      var grpval = data.type.group().reduce(coreops.average('tip')).all();
      grpval = _.map(grpval, function(d) { return { key:d.key, value: d.value.value()}});
      assert.deepEqual(grpval,
          [ { value: 0, key: 'cash' },
            { value: 66.66666666666667, key: 'tab' },
            { value: 200, key: 'visa' }   ]);
    },

    "test extents": function(data) {
      var val = data.tip.groupAll().reduce(coreops.extents('tip')).value();
      assert.deepEqual(val.value(), [0, 200]);

      var grpval = data.type.group().reduce(coreops.extents('tip')).all();
      grpval = _.map(grpval, function(d) { return { key:d.key, value: d.value.value()}});
      assert.deepEqual(grpval,
          [ { value: [0, 0], key: 'cash' },
            { value: [0, 100], key: 'tab' },
            { value: [200, 200], key: 'visa' }   ]);
    },

    "test finalize": function(data) {
      var v = { key: "moo", value: function() { return 99; }};
      assert(coreops.finalize(v) == 99);

      var v = { key: "moo", value: { value: function() { return 99; }}};
      var v2 = coreops.finalize(v);
      assert.deepEqual(v2, { key: "moo", value: 99});

      var v = [
        { key: "vt", value: { sum: 500, count: 5, value: function() { return this.sum / this.count; }}},
        { key: "nh", value: { sum: 555, count: 5, value: function() { return this.sum / this.count; }}}
      ];
      var v2 = coreops.finalize(v);
      assert.deepEqual(v2, [ { key: 'vt', value: 100 }, { key: 'nh', value: 111 } ]);
    }


  }
});

function key(d) {
  return d.key;
}

suite.export(module);

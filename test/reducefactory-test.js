var vows = require("vows"),
    assert = require("assert"),
    d3 = require("d3"),
    crossfilter = require("../");

var suite = vows.describe("crossfilter");


// Test that
suite.addBatch({
  "crossfilter": {
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

    "finalizer works": function(data) {

      function reduceAdd(f) {
        return function(p, v) {
          return p + +f(v);
        };
      }

      function reduceSubtract(f) {
        return function(p, v) {
          return p - f(v);
        };
      }

      function zero() {
        return 0;
      }

      function one() {
        return 1;
      }

      function finalizer(value) {
        console.log("in finalizer");
        console.log(value, typeof(value));
        return value;
      }

      var accessor = function(d) { return d.tip };

      function reduceFactory(prop) {
        var accessor = function(d) { return d[prop] };
        return {
                add: reduceAdd(accessor),
                remove: reduceSubtract(accessor),
                initial: zero
              }
      }

      // Standard reduction using sum
      assert(data.tip.groupAll().reduce(reduceAdd(accessor),
          reduceSubtract(accessor), zero).value() == 400);

      // The same reduction using object
      assert(data.tip.groupAll().reduce({
        add: reduceAdd(accessor),
        remove: reduceSubtract(accessor),
        initial: zero
      }).value() == 400);

      // Testing a different initializer
      assert(data.tip.groupAll().reduce({
        add: reduceAdd(accessor),
        remove: reduceSubtract(accessor),
        initial: one
      }).value() == 401);

      // Testing reduceFactory
      assert(data.tip.groupAll().reduce(reduceFactory('tip')).value() == 400);
      assert(data.tip.groupAll().reduce(reduceFactory('quantity')).value() == 9);

      // Testing group with reduceFactory
      assert.deepEqual(data.type.group().reduce(reduceFactory('quantity')).all(),
          [ { key: 'cash', value: 2 },
            { key: 'tab', value: 6 },
            { key: 'visa', value: 1 } ]);
    },

    "basic filters work": function(data) {
    }

  }
});

function key(d) {
  return d.key;
}

suite.export(module);

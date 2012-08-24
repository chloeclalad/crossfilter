var vows = require("vows"),
    assert = require("assert"),
    d3 = require("d3"),
    _ = require("underscore"),
    crossfilter = require("../");

var suite = vows.describe("coreops");
var coreops = crossfilter.reduceops;

suite.addBatch({
  "coreops":{
    topic:function () {
      var data = crossfilter([
        {date:"2011-11-14T16:17:54Z", quantity:2, total:190, tip:100, type:"tab"},
        {date:"2011-11-14T16:20:19Z", quantity:2, total:190, tip:100, type:"tab"},
        {date:"2011-11-14T16:28:54Z", quantity:1, total:300, tip:200, type:"visa"},
        {date:"2011-11-14T16:30:43Z", quantity:2, total:90, tip:0, type:"cash"},
        {date:"2011-11-14T16:48:46Z", quantity:2, total:90, tip:0, type:"tab"}
      ]);

      // be sure you don't clobber a built-in method if you do this!
      try {
        data.date = data.dimension(function (d) {
          return new Date(d.date);
        });
        data.quantity = data.dimension(function (d) {
          return d.quantity;
        });
        data.tip = data.dimension(function (d) {
          return d.tip;
        });
        data.total = data.dimension(function (d) {
          return d.total;
        });
        data.type = data.dimension(function (d) {
          return d.type;
        });
      } catch (e) {
        console.log(e.stack);
      }

      return data;
    },

    "version is correct":function (data) {
      assert(coreops.version == '0.0.1');
    },

    "test sum":function (data) {
      assert(data.tip.groupAll().reduce(coreops.sum('tip')).value() == 400);
      assert(data.tip.groupAll().reduce(coreops.sum(function (d) {
        return d.tip
      })).value() == 400);

      // Testing group with reduceFactory
      assert.deepEqual(data.type.group().reduce(coreops.sum('tip')).all(),
          [
            { key:'cash', value:0 },
            { key:'tab', value:200 },
            { key:'visa', value:200 }
          ]);

    },

    "test count":function (data) {
      assert(data.tip.groupAll().reduce(coreops.count('tip')).value() == 5);
      assert(data.tip.groupAll().reduce(coreops.count()).value() == 5);
      // Testing group with reduceFactory
      assert.deepEqual(data.type.group().reduce(coreops.count()).all(),
          [
            { key:'cash', value:1 },
            { key:'tab', value:3 },
            { key:'visa', value:1 }
          ]);
    },

    "test average":function (data) {
      var val = data.tip.groupAll().reduce(coreops.average('tip')).value();
      assert(val.finalize() == 80);
      var grpval = data.type.group().reduce(coreops.average('tip')).all();
      grpval = _.map(grpval, function (d) {
        return { key:d.key, value:d.value.finalize()}
      });
      assert.deepEqual(grpval,
          [
            { value:0, key:'cash' },
            { value:66.66666666666667, key:'tab' },
            { value:200, key:'visa' }
          ]);
    },


    "test extents":function (data) {
      var val = data.tip.groupAll().reduce(coreops.extents('tip')).value();
      assert.deepEqual(val.finalize(), [0, 200]);

      var grpval = data.type.group().reduce(coreops.extents('tip')).all();
      grpval = _.map(grpval, function (d) {
        return { key:d.key, value:d.value.finalize()}
      });
      assert.deepEqual(grpval,
          [
            { value:[0, 0], key:'cash' },
            { value:[0, 100], key:'tab' },
            { value:[200, 200], key:'visa' }
          ]);
    },

    "test finalize":function (data) {
      var val = data.tip.groupAll().reduce(coreops.average('tip')).value();
      assert(coreops.finalize(val) == 80);

      // Can still filter and calculate after finalizing
      data.type.filterExact("tab");
      var val = data.tip.groupAll().reduce(coreops.average('tip')).value();
      assert(coreops.finalize(val) == 200 / 3);
      data.type.filter(null);

      var v = { key:"moo", value:{ finalize:function () {
        return 99;
      }}};
      var v2 = coreops.finalize(v);
      assert.deepEqual(v2, { key:"moo", value:99});

      var v = [
        { key:"vt", value:{ sum:500, count:5, finalize:function () {
          return this.sum / this.count;
        }}},
        { key:"nh", value:{ sum:555, count:5, finalize:function () {
          return this.sum / this.count;
        }}}
      ];
      var v2 = coreops.finalize(v);
      assert.deepEqual(v2, [
        { key:'vt', value:100 },
        { key:'nh', value:111 }
      ]);

    },

    "test compose":function (data) {
      var v;
      v = data.type.group().reduce(coreops.compose({
        "tip_extents":coreops.extents('tip'),
        "quantity_total":coreops.sum('quantity')
      })).all();

      assert.deepEqual(coreops.finalize(v),
          [
            {"key":"cash", "value":{ tip_extents:[ 0, 0 ], quantity_total:2 }},
            {"key":"tab", "value":{ tip_extents:[ 0, 100 ], quantity_total:6 }},
            {"key":"visa", "value":{ tip_extents:[ 200, 200 ], quantity_total:1 }}
          ]
      );

      // Test custom finalizer
      v = data.tip.groupAll().reduce(coreops.average('tip')).value();
      assert(coreops.finalize(v) == 80);
      v = data.tip.groupAll().reduce(coreops.compose({
        "sum":coreops.sum('tip'),
        "count":coreops.count()
      }, function () {
        return this.sum / this.count
      })).value();
      assert(coreops.finalize(v) == 80);
    },


    "test by":function (data) {
      var v;

      // Grouping reduction (group by type)
      v = data.groupAll().reduce(coreops.by('type', coreops.sum('quantity')));
      assert.deepEqual(coreops.finalize(v.value()), { tab:6, visa:1, cash:2 });

      // Grouping reduction after filtering
      data.type.filterExact("tab");
      v = data.groupAll().reduce(coreops.by('type', coreops.sum('quantity')));
      assert.deepEqual(coreops.finalize(v.value()), { tab:6 });
      data.type.filterExact(null);

      // Grouping reduction (group by type) with a group
      v = data.type.group().reduce(coreops.by('type', coreops.sum('quantity')));
      assert.deepEqual(coreops.finalize(v.all()), [
        {
          value:{ cash:2 },
          key:'cash'
        },
        {
          value:{ tab:6 },
          key:'tab'
        },
        {
          value:{ visa:1 },
          key:'visa'
        }
      ]);

      // Grouping reduction with composition
      v = data.groupAll().reduce(coreops.by('type', coreops.compose({
        "tip_extents":coreops.extents('tip'),
        "quantity_total":coreops.sum('quantity')
      }))).value();

      assert.deepEqual(coreops.finalize(v),
          {
            "cash": { tip_extents:[ 0, 0 ], quantity_total:2 },
            "tab":  { tip_extents:[ 0, 100 ], quantity_total:6 },
            "visa": { tip_extents:[ 200, 200 ], quantity_total:1 }
          }
      );

    }



  }
});

function key(d) {
  return d.key;
}

suite.export(module);

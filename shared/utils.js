var _ = require("lodash");
var moment = require("moment");


function getIndexInWeights(weights) {
    var maxWeight = weights[weights.length - 1];
    var w = Math.random() * maxWeight;
    return _.sortedIndex(weights, w);
}

export function sampleWithWeight(list, weights, count=1, distinct=false) {
    if (list.length <= count) {
        if (count === 1) {
            if (list.length)
                return list[0];
            else
                return null;
        }
        return list;
    }
    var cumDist = _.clone(weights);
    for (var i=1;i<weights.length;i++) {
        cumDist[i] += cumDist[i-1];
    }
    if (count === 1) {
        return list[getIndexInWeights(cumDist)];
    }
    else {
        var ret = [];
        while (ret.length < count) {
            for (var it=ret.length;it<count;it++) {
                ret.push(getIndexInWeights(cumDist));
            }
            if (distinct) {
                ret = _.uniq(ret);
            }
        }
        for (var j=0;j<ret.length;j++) {
            ret[j] = list[ret[j]];
        }
        return ret;
    }
}

var initOnceMap = {};
export function initOnce(key) {
    if (!initOnceMap[key]) {
        initOnceMap[key] = true;
        return true;
    }
    return false;
}

export function nextTimeSegment(segment) {
    var sod = moment().startOf("day");
    var hours = moment() - sod;
    var nextHour = Math.ceil(hours / (segment * 3600 * 1000)) * (segment * 3600);
    return sod.unix() + nextHour;
}

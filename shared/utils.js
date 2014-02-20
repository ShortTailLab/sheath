var _ = require("underscore");


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
        return list[this.getIndexInWeights(cumDist)];
    }
    else {
        var ret = [];
        while (ret.length < count) {
            for (var it=ret.length;it<count;it++) {
                ret.push(this.getIndexInWeights(cumDist));
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

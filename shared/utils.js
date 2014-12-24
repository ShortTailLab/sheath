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

export function sampleLimit(list, weights, low, high, pred, count=1, distinct=false) {
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
        var predCount = 0;
        var ret = [];
        while (ret.length < count) {
            var idx = getIndexInWeights(cumDist);
            if(distinct) {
                if(_.contains(ret, idx)) {
                    continue;
                }
            }
            if(pred(list[idx])) {
                if(predCount + 1 > high) {
                    continue;
                }
                ++predCount;
            } else {
                if(predCount === low - 1 && ret.length === count - 1) {
                    continue;
                }
                if(predCount === low - 2 && ret.length === count - 2) {
                    continue;
                }
            }
            ret.push(idx);
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

export function toChunk(array, chunkSize) {
    return [].concat.apply([],
        array.map(function(elem,i) {
            return i%chunkSize ? [] : [array.slice(i,i+chunkSize)];
        })
    );
}

export function forward(moduleId, agent, serverType, command, msg, cb) {
    if (!cb) {
        cb = function () {};
    }

    var servers = _.values(agent.idMap);
    if (serverType !== "*") servers = _.filter(servers, function (r) { return r.type === serverType; });
    var pending = servers.length;
    var allResults = [];

    var waitAll = function (err, results) {
        if (!cb) return;
        if (err) {
            cb(err);
            cb = null;
        }

        if (_.isArray(results)) {
            allResults = allResults.concat(results);
        }
        else if (results) {
            allResults.push(results);
        }

        if (--pending === 0) {
            cb(null, allResults);
        }
    };

    for (var i=0;i<servers.length;i++) {
        var server = servers[i];
        agent.request(server.id, moduleId, {command: command, msg: msg}, waitAll);
    }
}

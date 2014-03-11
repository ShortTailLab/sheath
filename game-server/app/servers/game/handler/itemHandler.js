var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var Constants = require("../../../../../shared/constants");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var Store = require("../../../services/storeService");
var Promise = require("bluebird");
var moment = require("moment");
var _ = require("underscore");
var logger;


module.exports = function (app) {
    return new ItemHandler(app);
};

class ItemHandler extends base.HandlerBase {
    constructor(app) {
        this.app = app;
        logger = require('../../../utils/rethinkLogger').getLogger(app);
    }

    maxDailyRefresh(role) {
        var max = [2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6];
        if (0 <= role.vipLevel < max.length) {
            return max[role.vipLevel];
        }
        return max[0];
    }

    maxDailyPurchase(role) {
        var max = [20, 20, 20, 20, 25, 25, 25, 30, 30, 30, 35, 35, 35];
        if (0 <= role.vipLevel < max.length) {
            return max[role.vipLevel];
        }
        return max[0];
    }

    getRoleStore(role, isGold) {
        var key = isGold ? "gold" : "coin";
        var storeFunc = isGold ? Store.listGoldItems.bind(Store) : Store.listCoinItems.bind(Store);
        var store = role.store[key];

        if (store && store.items && store.validThru * 1000 >= Date.now()) {
            return store.items;
        }
        else {
            return storeFunc();
        }
    }

    listDef(msg, session, next) {
        wrapSession(session);

        var cache = this.app.get("cache");
        next(null, {
            items: cache.clientItemDefs,
            equipments: cache.clientEquipmentDefs
        });
    }

    list(msg, session, next) {
        wrapSession(session);

        var roleId = session.get("role").id;
        this.safe(models.Item.allP({where: {owner: roleId}}).bind(this)
        .then((items) => {
            next(null, {
                items: _.invoke(items, "toClientObj")
            });
        }), next);
    }

    listStore(msg, session, next) {
        wrapSession(session);
        Store.initOnce(this.app);

        this.safe(models.Role.findP(session.get("role").id).bind(this)
        .then(function (role) {
            var maxDailyPurchase = this.maxDailyPurchase(role);
            var maxDailyRefresh = this.maxDailyRefresh(role);
            var coinPurchaseLeft = maxDailyPurchase - (role.dailyRefreshData.coinPurchaseNum || 0);
            var goldPurchaseLeft = maxDailyPurchase - (role.dailyRefreshData.goldPurchaseNum || 0);
            var coinRefreshLeft = maxDailyRefresh - (role.dailyRefreshData.coinRefreshNum || 0);
            var goldRefreshLeft = maxDailyRefresh - (role.dailyRefreshData.goldRefreshNum || 0);
            var coinStoreItems = this.getRoleStore(role, false);
            var goldStoreItems = this.getRoleStore(role, true);

            next(null, {
                coinItems: coinStoreItems,
                goldItems: goldStoreItems,
                nextCoinStoreRefresh: Store.coinRefresh,
                nextGoldStoreRefresh: Store.goldRefresh,
                coinRefreshLeft: coinRefreshLeft,
                goldRefreshLeft: goldRefreshLeft,
                coinPurchaseLeft: coinPurchaseLeft,
                goldPurchaseLeft: goldPurchaseLeft
            });
        }), next);
    }

    manualRefresh(msg, session, next) {
        wrapSession(session);
        Store.initOnce(this.app);

        var isGoldStore = !!msg.isGold, role, tokenId;
        var key = isGoldStore ? "gold" : "coin";

        this.safe(models.Role.findP(session.get("role").id).bind(this)
        .then(function (_role) {
            role = _role;
            var coinRefreshLeft = this.maxDailyRefresh(role) - (role.dailyRefreshData.coinRefreshNum || 0);
            var goldRefreshLeft = this.maxDailyRefresh(role) - (role.dailyRefreshData.goldRefreshNum || 0);

            if (isGoldStore && goldRefreshLeft > 0) {
                role.dailyRefreshData.goldRefreshNum = (role.dailyRefreshData.goldRefreshNum || 0) + 1;
                return true;
            }
            else if (!isGoldStore && coinRefreshLeft > 0) {
                role.dailyRefreshData.coinRefreshNum = (role.dailyRefreshData.coinRefreshNum || 0) + 1;
                return true;
            }
            else {
                var tokenDefId = parseInt(this.app.get("dataService").get("specialItemId").data.refreshToken);
                if (_.isNaN(tokenDefId)) {
                    return Promise.reject(Constants.StoreFailed.NO_REFRESH);
                }
                else {
                    return models.Item.findOneP({where: {owner: role.id, itemDefId: tokenDefId}}).bind(this)
                    .then(function (token) {
                        if (token) {
                            tokenId = token.id;
                            return token.destroyP();
                        }
                        else {
                            return Promise.reject(Constants.StoreFailed.NO_REFRESH);
                        }
                    });
                }
            }
        })
        .then(function () {
            role.store[key] = {
                validThru: isGoldStore ? Store.goldRefresh : Store.coinRefresh,
                items: Store.sampleItems(isGoldStore, role.store[key] ? role.store[key].items : null)
            };
            return role.saveP();
        })
        .then(function (role) {
            var maxDailyRefresh = this.maxDailyRefresh(role);
            var coinRefreshLeft = maxDailyRefresh - (role.dailyRefreshData.coinRefreshNum || 0);
            var goldRefreshLeft = maxDailyRefresh - (role.dailyRefreshData.goldRefreshNum || 0);

            var resp = {}, logParam = {role: role.toLogObj()};
            if (isGoldStore) {
                resp.goldItems = role.store.gold.items;
                resp.goldRefreshLeft = goldRefreshLeft;
            }
            else {
                resp.coinItems = role.store.coin.items;
                resp.coinRefreshLeft = coinRefreshLeft;
            }

            if (tokenId) {
                resp.destroyed = tokenId;
                logParam.destroyed = tokenId;
            }

            next(null, resp);
            logger.logInfo("store.refresh", logParam);
        }), next);
    }

    buy(msg, session, next) {
        wrapSession(session);

        var siId = msg.siId;
        var cache = this.app.get("cache");
        var storeItem = cache.storeItemById[siId];
        var role = session.get("role");
        if (!storeItem) {
            return this.errorNext(Constants.StoreFailed.NO_ITEM, next);
        }

        this.safe(Promise.join(models.Role.findP(role.id), this.getItemStacks(role.id, storeItem.defId, storeItem.count)).bind(this)
        .spread(function (_role, stacks) {
            role = _role;
            if (stacks > role.getStorageRoom()) {
                return Promise.reject(Constants.NO_ROOM);
            }

            var maxDailyPurchase = this.maxDailyPurchase(role);
            var coinPurchaseLeft = maxDailyPurchase - (role.dailyRefreshData.coinPurchaseNum || 0);
            var goldPurchaseLeft = maxDailyPurchase - (role.dailyRefreshData.goldPurchaseNum || 0);
            if (storeItem.gold && goldPurchaseLeft > 0) {
                if (role.golds < storeItem.price) {
                    return Promise.reject(Constants.NO_GOLDS);
                }
                role.golds -= storeItem.price;
                role.dailyRefreshData.goldPurchaseNum = (role.dailyRefreshData.goldPurchaseNum || 0) + 1;
            }
            else if (!storeItem.gold && coinPurchaseLeft > 0) {
                if (role.coins < storeItem.price) {
                    return Promise.reject(Constants.NO_GOLDS);
                }
                role.coins -= storeItem.price;
                role.dailyRefreshData.coinPurchaseNum = (role.dailyRefreshData.coinPurchaseNum || 0) + 1;
            }
            else {
                return Promise.reject(Constants.StoreFailed.NO_PURCHASE);
            }

            var newItems = [];
            for (var i=0;i<storeItem.count;i++) {
                newItems.push({
                    itemDefId: storeItem.defId,
                    owner: role.id
                });
            }
            return [role.saveP(), models.Item.createP(newItems)];
        })
        .spread(function (role, items) {
            next(null, {
                role: role.toClientObj(),
                newItems: _.invoke(items, "toClientObj")
            });
            logger.logInfo("store.buy", {
                role: role.toLogObj(),
                storeItem: storeItem,
                newItems: _.pluck(items, "id")
            });
        }), next);
    }

    sell(msg, session, next) {
        wrapSession(session);
    }

    destroy(msg, session, next) {
        wrapSession(session);
    }

    transform(msg, session, next) {

    }
}

var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var Constants = require("../../../../../shared/constants");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var Store = require("../../../services/storeService");
var Promise = require("bluebird");
var moment = require("moment");
var _ = require("lodash");
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
        if (0 <= role.vip < max.length) {
            return max[role.vip];
        }
        return max[0];
    }

    maxDailyPurchase(role) {
        var max = [20, 20, 20, 20, 25, 25, 25, 30, 30, 30, 35, 35, 35];
        if (0 <= role.vip < max.length) {
            return max[role.vip];
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
        this.safe(models.Item.getAll(roleId, {index: "owner"}).run()
        .then((items) => {
            next(null, {
                items: _.invoke(items, "toClientObj")
            });
        }), next);
    }

    useItem(msg, session, next) {
        wrapSession(session);

        var role = session.get("role");
        var roleId = role.id;
        var item, itemDef;
        var cache = this.app.get("cache");
        var validEffects = [
            null,
            ["energy"],
            ["exp"]
        ];

        this.safe(this.getItemWithDef(msg.itemId).bind(this)
        .spread(function (_item, _itemDef) {
            item = _item;
            itemDef = _itemDef;
            var target = msg.target || roleId;
            if (item.owner !== roleId) throw Constants.EquipmentFailed.DO_NOT_OWN_ITEM;
            if (!target || !itemDef.useTarget || itemDef.useTarget > 2 || !itemDef.itemEffect || itemDef.itemEffect.length === 0) {
                throw Constants.InvalidRequest;
            }
            if (!_.contains(validEffects[itemDef.useTarget], itemDef.itemEffect[0])) {
                throw Constants.InternalServerError;
            }

            var targetP = itemDef.useTarget === 1 ? models.Role.get(roleId) : models.Hero.get(target);
            return targetP.run();
        })
        .then(function (target) {
            var [effectName, amount] = itemDef.itemEffect;
            switch (effectName) {
                case "energy": {
                    target.energy += amount;
                    break;
                }
                case "exp": {
                    target.exp += amount;
                    var heroDef = cache.heroDefById[target.heroDefId];
                    target.levelUp(cache.heroExpByLevel, heroDef.expFactor || 1, role.level);
                    break;
                }
            }
            return [target.save(), item.delete()];
        })
        .spread(function (target) {
            var tName = itemDef.useTarget === 1 ? "role" : "hero";

            logger.logInfo("item.use", {
                target: itemDef.useTarget === 1 ? "" : target.id,
                item: itemDef.id
            });

            next(null, {
                [tName]: target.toClientObj()
            });
        }), next);
    }

    listStore(msg, session, next) {
        wrapSession(session);
        Store.initOnce(this.app);
        var mKey = this.app.mKey;

        this.safe(models.Role.get(session.get("role").id).run().bind(this)
        .then(function (role) {
            var maxDailyPurchase = this.maxDailyPurchase(role);
            var maxDailyRefresh = this.maxDailyRefresh(role);
            var coinPurchaseLeft = maxDailyPurchase - (role.dailyRefreshData[mKey.coinPurchaseNum] || 0);
            var goldPurchaseLeft = maxDailyPurchase - (role.dailyRefreshData[mKey.goldPurchaseNum] || 0);
            var coinRefreshLeft = maxDailyRefresh - (role.dailyRefreshData.coinRefreshNum || 0);
            var goldRefreshLeft = maxDailyRefresh - (role.dailyRefreshData.goldRefreshNum || 0);
            var coinStoreItems = this.getRoleStore(role, false);
            var goldStoreItems = this.getRoleStore(role, true);

            next(null, {
                coinItems: coinStoreItems,
                goldItems: goldStoreItems,
                nextCoinStoreRefresh: Store.coinRefresh - Math.floor(Date.now()/1000),
                nextGoldStoreRefresh: Store.goldRefresh - Math.floor(Date.now()/1000),
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

        this.safe(models.Role.get(session.get("role").id).run().bind(this)
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
                var tokenDefId = this.app.get("specialItemId").storeRefreshToken;
                if (tokenDefId === undefined || tokenDefId === null) {
                    throw Constants.StoreFailed.NO_REFRESH;
                }
                else {
                    return models.Item.getAll(role.id, {index: "owner"}).filter({itemDefId: tokenDefId}).run().bind(this)
                    .then(function (token) {
                        if (token) {
                            tokenId = token.id;
                            return token.delete();
                        }
                        else {
                            throw Constants.StoreFailed.NO_REFRESH;
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
            return role.save();
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
        Store.initOnce(this.app);

        var siId = msg.siId;
        var cache = this.app.get("cache");
        var storeItem = cache.storeItemById[siId];
        var role = session.get("role");
        if (!storeItem) {
            return this.errorNext(Constants.StoreFailed.NO_ITEM, next);
        }

        this.safe(models.Role.get(role.id).getJoin({bag: true}).run().bind(this)
        .then(function (_role) {
            role = _role;
            if (this.getStacks(role, storeItem.defId, storeItem.count) > role.getStorageRoom()) {
                throw Constants.NO_ROOM;
            }

            var store = this.getRoleStore(role, storeItem.gold);
            var mKey = this.app.mKey;
            if (!store || !_.findWhere(store, {id: storeItem.id})) {
                throw Constants.StoreFailed.NO_ITEM;
            }

            var maxDailyPurchase = this.maxDailyPurchase(role);
            var coinPurchaseLeft = maxDailyPurchase - (role.dailyRefreshData[mKey.coinPurchaseNum] || 0);
            var goldPurchaseLeft = maxDailyPurchase - (role.dailyRefreshData[mKey.goldPurchaseNum] || 0);
            if (storeItem.gold && goldPurchaseLeft > 0) {
                if (role.golds < storeItem.price) {
                    throw Constants.NO_GOLDS;
                }
                role.golds -= storeItem.price;
                role.dailyRefreshData[mKey.goldPurchaseNum] = (role.dailyRefreshData[mKey.goldPurchaseNum] || 0) + 1;
            }
            else if (!storeItem.gold && coinPurchaseLeft > 0) {
                if (role.coins < storeItem.price) {
                    throw Constants.NO_GOLDS;
                }
                role.coins -= storeItem.price;
                role.dailyRefreshData[mKey.coinPurchaseNum] = (role.dailyRefreshData[mKey.coinPurchaseNum] || 0) + 1;
            }
            else {
                throw Constants.StoreFailed.NO_PURCHASE;
            }

            var newItems = [];
            for (var i=0;i<storeItem.count;i++) {
                newItems.push((new models.Item({
                    itemDefId: storeItem.defId,
                    owner: role.id,
                    bound: null
                })).save());
            }
            session.set("role", role.toSessionObj());
            return [role.save(), Promise.all(newItems), session.push("role")];
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

    refineGem(msg, session, next) {
        wrapSession(session);

        var gemType = msg.gemType;
        var gemDef = this.app.get("cache").getItemDef(gemType);
        var role = session.get("role");

        if (!gemType) {
            return this.errorNext(Constants.InvalidRequest, next);
        }
        if (!gemDef || !gemDef.composable) {
            return this.errorNext(Constants.EquipmentFailed.LEVEL_MAX, next);
        }

        this.safe(models.Item.getAll(role.id, {index: "owner"}).filter({itemDefId: gemType, bound: null}).limit(gemDef.composeCount).run().bind(this)
            .then((mats) => {
                if (mats.length < gemDef.composeCount) {
                    throw Constants.EquipmentFailed.NO_MATERIAL;
                }

                mats[0].itemDefId = gemDef.composeTarget[0];
                var promises = new Array(gemDef.composeCount + 1);
                promises[0] = mats;
                promises[1] = mats[0].save();
                for (var i=1;i<mats.length;i++) {
                    promises[i+1] = mats[i].delete();
                }
                return promises;
            })
            .spread((mats) => {
                var destroyedMats = mats.slice(1);
                next(null, {
                    destroyed: _.pluck(destroyedMats, "id"),
                    gem: mats[0].toClientObj()
                });
                logger.logInfo("item.refineGem", {
                    role: this.toLogObj(role),
                    materail: _.invoke(destroyedMats, "toLogObj"),
                    refined: mats[0].toLogObj()
                });
            }), next);
    }

    sell(msg, session, next) {
        wrapSession(session);

        var itemId = msg.itemId;
        var role = session.get("role");
        var coinInc, item;
        if (!itemId) {
            return this.errorNext(Constants.InvalidRequest, next);
        }

        this.safe(this.getItemWithDef(itemId).bind(this)
        .spread(function (_item, itemDef) {
            item = _item;
            if (!item || item.owner !== role.id) {
                throw Constants.EquipmentFailed.DO_NOT_OWN_ITEM;
            }

            if(this.app.get("cache").getEquipDef(itemDef.id)) {
                return this.errorNext(Constants.InvalidRequest, next);
            }

            coinInc = itemDef.price + item.level * 100 * 0.3;
            return models.Role.get(role.id).run();
        })
        .then(function (_role) {
            role = _role;
            role.coins += coinInc;
            session.set("role", role.toSessionObj());
            return [session.push("role"), role.save(), item.delete()];
        })
        .all().then(function() {
            next(null, {
                coins: coinInc,
                destroyed: item.id
            });
            logger.logInfo("item.sell", {
                role: this.toLogObj(role),
                soldItem: item.toLogObj()
            });
        }), next);
    }
}

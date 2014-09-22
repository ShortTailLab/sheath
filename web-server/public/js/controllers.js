var sheathControllers = angular.module('sheath.controllers', []);

Array.prototype.chunk = function(chunkSize) {
    var array=this;
    return [].concat.apply([],
        array.map(function(elem,i) {
            return i%chunkSize ? [] : [array.slice(i,i+chunkSize)];
        })
    );
};

Array.prototype.toMap = function(key) {
    var ret = {};
    for (var i=0;i<this.length;i++) {
        var obj = this[i];
        ret[obj[key]] = obj;
    }
    return ret;
};

function diffModel(m1, m2, fields) {
    var diff = {id: m1.id};
    for (var i=0;i<fields.length;i++) {
        var field = fields[i];
        if (_.isArray(m1[field])) {
            if (m1[field].length !== m2[field].length) {
                diff[field] = m2[field];
            }
            else {
                for (var j=0;j<m1[field].length;j++) {
                    if (m1[field][j] !== m2[field][j]) {
                        diff[field] = m2[field];
                        break;
                    }
                }
            }
        }
        else if (m1[field] !== m2[field]) {
            diff[field] = m2[field];
        }
    }
    return diff;
}

sheathControllers.controller('basicStatsController', function ($scope, $http, $window, $filter, ngTableParams) {
    var refreshInterval = 10000;
    $scope.refreshInterval = refreshInterval / 1000;

    function fetch120() {
        $http.get("/api/nodeInfo").
        success(function (data) {
            $scope.nodes = _.values(data.nodes);
        });
    }

    function fetch10() {
        $http.get("/api/basicStats").
        success(function (data) {
            if ($scope.userStats === undefined) {
                $scope.userStats = {
                    _clients: data.onlineUser.totalConnCount,
                    _onlineUsers: data.onlineUser.loginedCount,
                    _totalUsers: data.totalUsers,
                    _totalRoles: data.totalRoles
                };
            }
            else {
                $scope.userStats._clients = $scope.userStats.clients;
                $scope.userStats._onlineUsers = $scope.userStats.onlineUsers;
                $scope.userStats._totalUsers = $scope.userStats.totalUsers;
                $scope.userStats._totalRoles = $scope.userStats.totalRoles;
            }
            $scope.userStats.clients = data.onlineUser.totalConnCount;
            $scope.userStats.onlineUsers = data.onlineUser.loginedCount;
            $scope.userStats.totalUsers = data.totalUsers;
            $scope.userStats.totalRoles = data.totalRoles;
            $scope.userStats.loginList = data.onlineUser.loginedList.chunk(20);
        });
        if ($scope.tableParams) $scope.tableParams.reload();
    }

    $scope.humanizeUpTime = function (minute) {
        return moment.duration(-minute, "minutes").humanize();
    };
    $scope.getToolTip = function (user) {
        return "<table>" +
            "<tr><td><b>等级</b></td><td>" + user.role.level +"</td>" + "</tr>" +
            "<tr><td><b>登陆时间</b></td><td>" + moment(user.loginTime).fromNow() +"</td>" + "</tr>" +
            "<tr><td><b>IP地址</b></td><td>" + user.address +"</td>" + "</tr>" +
            "</table>";
    };

    $scope.intervalID5 = $window.setInterval(function () {$scope.$apply(fetch10);}, refreshInterval);
    $scope.intervalID120 = $window.setInterval(function () {$scope.$apply(fetch120);}, 120 * 1000);

    $scope.$on('$destroy', function () {
        if ($scope.intervalID5) {
            $window.clearInterval($scope.intervalID5);
            delete $scope.intervalID5;
        }
        if ($scope.intervalID120) {
            $window.clearInterval($scope.intervalID120);
            delete $scope.intervalID120;
        }
    });

    fetch10();
    fetch120();

    $scope.tableParams = new ngTableParams({
        page: 1,
        count: 200,
        sorting: {percentile98: 'desc'}
    }, {
        counts: [],
        getData: function($defer, params) {
            $http.post("/api/getPerfStats")
            .success(function (data) {
                params.total(data.length);

                var orderedData = params.sorting() ? $filter('orderBy')(data, params.orderBy()) : data;
                $defer.resolve(orderedData.slice((params.page() - 1) * params.count(), params.page() * params.count()));
            });
        }
    });
});

sheathControllers.controller('userListController', function ($scope, $http, ngTableParams, $routeParams) {
    $scope.query = null;
    var partitionId = $routeParams.partId;

    $http.get("/api/partitions").success(function (data) {
        $scope.partitions = data.partitions;
        _.each($scope.partitions, function (p) { p.selected = !partitionId || (partitionId === p.id); });

        $scope.tableParams = new ngTableParams({
            page: 1,
            count: 20
        }, {
            counts: [],
            groupBy: "partitionName",
            getData: function($defer, params) {
                var partitions = _.pluck(_.filter($scope.partitions, function (p) {return p.selected;}), "id");
                $http.post("/api/userList", {pageSize: params.count(), page: params.page(), hint:$scope.query, partitions: partitions})
                .success(function (data) {
                    params.total(data.totalRoles);
                    _.each(data.roles, function (r) {
                        var part = _.findWhere($scope.partitions, {id: r.partition});
                        if (part) {
                            r.partitionName = part.name;
                        }
                        else {
                            r.partitionName = "---";
                        }
                    });

                    $defer.resolve(data.roles);
                });
            }
        });
    });

    $scope.submit = function () {
        $scope.tableParams.reload();
    };
    $scope.edit = function (role) {
        role.editable = angular.copy(role);
    };
    $scope.save = function (role) {
        var editable = role.editable;
        delete role.editable;
        var diff = diffModel(role, editable, ["level", "energy", "golds", "coins", "contribs"]);

        if (_.size(diff) > 1) {
            $http.post("/api/updateRole", diff).success(function (data) {
                _.extend(role, data);
            })
            .error(function (err) {
                $scope.error = "更新用户数据失败: " + (err.message || "未知错误");
            });
        }
    };
});

sheathControllers.controller('userDetailController', function ($scope, $http, $routeParams, $timeout, $q, $modal, $filter, ngTableParams, $location) {
    var addHeroes = function (newHeroes) {
        $http.post("/api/addHero", {role: $scope.uid, heroes: newHeroes}).success(function (data) {
            $scope.roleData = data.role;
            $scope.roleJson = angular.toJson($scope.roleData, true);
            $scope.heroes = $scope.heroes.concat(data.heroes);
            $scope.heroTableParams.total($scope.heroes.length);
            $scope.heroTableParams.reload();
            $scope.hero_error = null;
        })
            .error(function (data) {
                $scope.hero_error = "添加武将失败，" + (data.message || "未知错误");
            });
    };

    var addItems = function (newItems) {
        $http.post("/api/addItem", {role: $scope.uid, items: newItems}).success(function (data) {
            $scope.items = $scope.items.concat(data.items);
            $scope.itemTableParams.total($scope.items.length);
            $scope.itemTableParams.reload();
            $scope.item_error = null;
        })
            .error(function (data) {
                $scope.item_error = "添加道具失败，" + (data.message || "未知错误");
            });
    };

    $scope.uid = $routeParams.uid;
    $scope.editorParams = {
        useWrapMode : false,
        showGutter: true,
        theme:'xcode',
        mode: 'json'
    };
    $scope.heroTableParams = new ngTableParams({
        page: 1,
        count: 25,
        sorting: {id: "asc"}
    }, {
        counts: [],
        getData: function ($defer, params) {
            if ($scope.heroes) {
                var orderedData = params.sorting() ?
                    $filter('orderBy')($scope.heroes, params.orderBy()) :
                    $scope.heroes;
                $defer.resolve(orderedData.slice((params.page() - 1) * params.count(), params.page() * params.count()));
            }
            else {
                $defer.resolve([]);
            }
        }
    });
    $scope.itemTableParams = new ngTableParams({
        page: 1,
        count: 50,
        sorting: {id: "asc"}
    }, {
        counts: [],
        groupBy: "itemDefId",
        getData: function ($defer, params) {
            if ($scope.items) {
                var orderedData = params.sorting() ?
                    $filter('orderBy')($scope.items, params.orderBy()) :
                    $scope.items;
                $defer.resolve(orderedData.slice((params.page() - 1) * params.count(), params.page() * params.count()));
            }
            else {
                $defer.resolve([]);
            }
        }
    });
    $scope.edit = function (item) {
        item.editable = angular.copy(item);
    };
    $scope.saveItem = function (item) {
        var editable = item.editable;
        delete item.editable;
        var diff = diffModel(item, editable, ["bound", "level", "refinement", "luck"]);
        if (_.has(diff, "bound") && !diff.bound) {
            diff.bound = null;
        }
        if (_.size(diff) > 1) {
            $http.post("/api/updateItem", diff).success(function (data) {
                _.extend(item, data);
            })
            .error(function (err) {
                $scope.error = "更新用户数据失败: " + (err.message || "未知错误");
            });
        }
    };
    $scope.saveHero = function (hero) {
        var editable = hero.editable;
        delete hero.editable;
        var diff = diffModel(hero, editable, ["level", "exp", "stars"]);
        if (_.size(diff) > 1) {
            $http.post("/api/updateHero", diff).success(function (data) {
                _.extend(hero, data);
            })
            .error(function (err) {
                $scope.error = "更新用户数据失败: " + (err.message || "未知错误");
            });
        }
    };
    $scope.remove = function (item) {
        var req;
        if (item.itemDefId) {
            req = $http.post("/api/removeItem", {item: item.id}).error(function (data) {
                $scope.item_error = "删除道具失败，" + (data.message || "未知错误");
            });
        }
        else {
            req = $http.post("/api/removeHero", {hero: item.id}).error(function (data) {
                $scope.hero_error = "删除武将失败，" + (data.message || "未知错误");
            });
        }
        req.success(function (data) {
            var index = $scope.heroes.indexOf(item);
            if (index !== -1) {
                $scope.heroes.splice(index, 1);
                $scope.heroTableParams.total($scope.heroes.length);
                $scope.heroTableParams.reload();
                $scope.hero_error = null;
                $scope.roleData = data;
                $scope.roleJson = angular.toJson($scope.roleData, true);
            }
            else {
                index = $scope.items.indexOf(item);
                $scope.items.splice(index, 1);
                $scope.itemTableParams.total($scope.heroes.length);
                $scope.itemTableParams.reload();
                $scope.item_error = null;
            }
        });
    };
    $scope.clone = function (heroOritem) {
        if (heroOritem.heroDefId) {
            addHeroes([heroOritem.heroDefId]);
        }
        else {
            addItems([heroOritem.itemDefId]);
        }
    };

    $scope.update = function () {
        var modified = angular.fromJson($scope.roleJson);
        var oldDataFields = _.keys($scope.roleData);
        for (var i=0;i<oldDataFields.length;i++) {
            var field = oldDataFields[i];
            if (modified[field] === $scope.roleData[field]) {
                delete modified[field];
            }
        }
        modified.id = $scope.roleData.id;
        if (_.size(modified) > 1) {
            $http.post("/api/updateRole", {diff: modified, rawObject: true}).success(function (data) {
                _.extend($scope.roleData, data);
                $scope.roleJson = angular.toJson($scope.roleData, true);
                $scope.error = null;
                $scope.info = "更新成功";
                $timeout(function () {$scope.info = null;}, 2000);
            })
            .error(function (err) {
                $scope.error = "更新用户数据失败: " + (err.message || "未知错误");
            });
        }
    };
    $scope.boundHeroName = function (item) {
        if (item.bound) {
            var hero = _.findWhere($scope.heroes, {id: item.bound});
            if (hero) {
                return "武将: " + $scope.heroDefs[hero.heroDefId].name;
            }
            else {
                var it = _.findWhere($scope.items, {id: item.bound});
                if (it) {
                    return "道具: " + $scope.itemDefs[it.itemDefId].name;
                }
            }
        }
        return "无";
    };
    $scope.cloneRole = function () {
        var modalIns = $modal.open({
            templateUrl: '/templates/modalCloneRole',
            controller: 'cloneRoleController',
            backdrop: "static",
            resolve: {
                partitions: function () {return $http.get("/api/partitions");}
            }
        });
        modalIns.result.then(function (clone) {
            clone.role = $scope.uid;
            $http.post("/api/cloneRole", clone).success(function (data) {
                $location.path("/user/detail/" + data.id)
            })
            .error(function (data) {
                $scope.error = "复制角色失败，" + (data.message || "未知错误");
            });
        });
    };
    $scope.openAddHero = function () {
        var modalIns = $modal.open({
            templateUrl: '/templates/modalAddHero',
            controller: 'addHeroController',
            backdrop: "static",
            resolve: {
                heroDefs: function () {return $scope.heroDefs;}
            }
        });
        modalIns.result.then(addHeroes);
    };
    $scope.openAddItem = function () {
        var modalIns = $modal.open({
            templateUrl: '/templates/modalAddItem',
            controller: 'addItemController',
            backdrop: "static",
            resolve: {
                itemDefs: function () {return $scope.itemDefs;}
            }
        });
        modalIns.result.then(addItems);
    };

    $q.all([$http.post("/api/getRole", {uid: $scope.uid}), $http.get("/api/itemDefs"), $http.get("/api/equipmentDefs"), $http.get("/api/heroDefs")])
    .then(function (results) {
        $scope.itemDefs = results[1].data.items.concat(results[2].data.equipments).toMap("id");
        $scope.heroDefs = results[3].data.heroes.toMap("id");

        var roleData = results[0].data;
        $scope.roleData = roleData.role;
        $scope.roleJson = angular.toJson(roleData.role, true);
        $scope.heroes = roleData.heroes;
        $scope.items = roleData.items;
        $scope.itemTableParams.total($scope.items.length);
        $scope.heroTableParams.total($scope.heroes.length);
        $scope.itemTableParams.reload();
        $scope.heroTableParams.reload();
    })
    .catch(function (data) {
        data = data.data || data;
        $scope.error = "查看用户失败，" + (data.message || "未知错误");
    });
});

sheathControllers.controller('cloneRoleController', function ($scope, $modalInstance, $http, partitions) {
    partitions = partitions.data.partitions;
    var format = function (item) {return item.name;};

    $scope.getUserByHint = function (val) {
        return $http.post("/api/findUsers", {hint: val}).then(function (res) {
            return res.data.users;
        });
    };

    $scope.selectOptions = {
        width: "100%",
        tokenSeparators: [",", " "],
        data: {results: _.values(partitions), text: "name"},
        formatSelection: format,
        formatResult: format
    };

    $scope.ok = function (userId) {
        $modalInstance.close({
            user: userId,
            partition: $scope.partition.id
        });
    };

    $scope.cancel = function () {
        $modalInstance.dismiss('cancel');
    };
});

sheathControllers.controller('addHeroController', function ($scope, $modalInstance, heroDefs) {
    var format = function (item) {return item.name;};

    $scope.selectOptions = {
        width: "100%",
        multiple: true,
        tokenSeparators: [",", " "],
        data: {results: _.values(heroDefs), text: "name"},
        formatSelection: format,
        formatResult: format,
        allowDuplicates: true
    };

    $scope.ok = function () {
        $modalInstance.close(_.pluck($scope.newHeroes, "id"));
    };

    $scope.cancel = function () {
        $modalInstance.dismiss('cancel');
    };
});

sheathControllers.controller('addItemController', function ($scope, $modalInstance, itemDefs) {
    var format = function (item) {return item.name;};

    $scope.selectOptions = {
        width: "100%",
        multiple: true,
        tokenSeparators: [",", " "],
        data: {results: _.values(itemDefs), text: "name"},
        formatSelection: format,
        formatResult: format,
        allowDuplicates: true
    };

    $scope.ok = function () {
        $modalInstance.close(_.pluck($scope.newItems, "id"));
    };

    $scope.cancel = function () {
        $modalInstance.dismiss('cancel');
    };
});

sheathControllers.controller('rewardController', function ($scope, $http) {
    $scope.getRoleByHint = function (val) {
        return $http.post("/api/findRoles", {hint: val}).then(function (res) {
            return _.pluck(res.data.roles, "name");
        });
    };
});

sheathControllers.controller('partitionListController', function ($scope, $modal, $http) {
    $http.get("/api/partitions").success(function (data) {
        $scope.partitions = data.partitions;
    });

    $scope.openAdd = function () {
        var modalInstance = $modal.open({
            templateUrl: '/templates/modalAddPartition',
            controller: 'addPartitionController',
            backdrop: "static"
        });

        modalInstance.result.then(function (newPart) {
            $http.post("/api/addPartitions", newPart).success(function (data) {
                $scope.partitions.push(data);
                $scope.error = null;
            })
            .error(function (data) {
                $scope.error = "添加分区 " + newPart.name + " 失败，" + (data.message || "未知错误");
            });
        });
    };

    $scope.removePartition = function (part) {
        $http.post("/api/removePartition", {id: part.id}).success(function (data) {
            $scope.partitions = _.reject($scope.partitions, function (p) {return p.id === data.id;});
            $scope.error = null;
        })
        .error(function (data) {
            $scope.error = "删除分区 " + part.name + " 失败，" + (data.message || "未知错误");
        });
    };
});

sheathControllers.controller('addPartitionController', function ($scope, $modalInstance) {
    $scope.newPartition = {
        openSince: new Date(),
        distro: "All",
        public: true
    };

    $scope.ok = function () {
        $scope.newPartition.openSince = moment($scope.newPartition.openSince);
        $scope.newPartition.openSince.seconds(0);
        $modalInstance.close($scope.newPartition);
    };

    $scope.cancel = function () {
        $modalInstance.dismiss('cancel');
    };
});

sheathControllers.controller('adminController', function ($scope, $http, $timeout, $modal) {
    $http.post("/api/adminList").success(function (data) {
        $scope.items = data.admins;
        $scope.select($scope.items[0]);
    })
    .error(function (data) {
        $scope.error = data.message || "未知错误";
    });

    $scope.select = function (data) {
        $scope.selected = data;
        $scope.editable = angular.copy(data);
    };

    $scope.modify = function () {
        $http.post("/api/modifyAdmin", {id: $scope.editable.id, manRole: $scope.editable.manRole}).success(function (data) {
            var stock = _.findWhere($scope.items, {id: data.id});
            if (stock) {
                _.extend(stock, data);
                $scope.select(stock);
                $scope.info = "修改成功";
                $timeout(function () {$scope.info = null;}, 2000);
            }
        })
        .error(function (data) {
            $scope.error = data.message || "未知错误";
        });
    };

    $scope.delete = function () {
        $http.post("/api/removeAdmin", {id: $scope.editable.id}).success(function () {
            $scope.items = _.reject($scope.items, function (item) {
                return item.id === $scope.editable.id;
            });
            $scope.editable = null;
            if ($scope.items.length) {
                $scope.select($scope.items[0]);
            }
        })
        .error(function (data) {
            $scope.error = data.message || "未知错误";
        });
    };

    $scope.openAdd = function () {
        var modalInstance = $modal.open({
            templateUrl: 'templates/modalAddAdmin',
            controller: 'addAdminController',
            backdrop: "static"
        });

        modalInstance.result.then(function (newAdmin) {
            $http.post("/api/addAdmin", {userId: newAdmin}).success(function (data) {
                $scope.items.push(data);
                $scope.error = null;
                $scope.select(data);
            })
            .error(function (data) {
                $scope.error = "添加管理员错误。 " + (data.message || "未知错误");
            });
        });
    };
});

sheathControllers.controller('addAdminController', function ($scope, $http, $modalInstance) {
    $scope.getUserByHint = function (val) {
        return $http.post("/api/findUsers", {hint: val, notAdmin: true}).then(function (res) {
            return res.data.users;
        });
    };

    $scope.ok = function (userId) {
        $modalInstance.close(userId);
    };

    $scope.cancel = function () {
        $modalInstance.dismiss('cancel');
    };
});

sheathControllers.controller('importController', function ($scope, $http, $upload, $timeout) {
    console.log("import function.......")
    $scope.upload = function ($files, tag) {
        var file = $files[0];
        $upload.upload({
            url: "/api/import",
            file: file
        }).success(function (data) {
            var noChange = true;
            for(var i = 0; i < data.length; ++i) {
                if(data[i].updates.length > 0) {
                    noChange = false;
                }
            }

            if(noChange) {
                $scope.info = "无更新";
                $timeout(function () {$scope.info = null;}, 2000);
            } else {
                $scope.error = null;
                $scope.toConfirm = data;
                console.log("have dataaaaaaa: "  + data);
            }
        })
        .error(function (err) {
            $scope.error = "上传文件失败: " + (err.message || "未知错误");
        });
    };

    $scope.confirm = function () {
        var req = {
            confirm: true,
            allDiff: $scope.toConfirm
        };
        $http.post("/api/import", req)
        .success(function (data){
            $scope.toConfirm = null;
            $scope.error = null;
            $scope.info = "导入成功";
            $timeout(function () {$scope.info = null;}, 2000);
        })
        .error(function (err) {
            $scope.error = "导入数据失败: " + (err.message || "未知错误");
        });
    };

    $scope.cancel = function () {
        $scope.toConfirm = null;
    };
});

sheathControllers.controller('exportController', function ($scope, $http, $modal) {
    $http.get("/api/itemDefs").success(function (data) {
        $scope.items = data.items;
    })
    .error(function (err) {
        $scope.item_error = "获取道具错误: " + (err.message || "未知错误");
    });

    $http.get("/api/equipmentDefs").success(function (data) {
        $scope.equipments = data.equipments;
    })
    .error(function (err) {
        $scope.eq_error = "获取道具错误: " + (err.message || "未知错误");
    });

    $http.get("/api/heroDefs").success(function (data) {
        $scope.heroes = data.heroes;
    })
    .error(function (err) {
        $scope.hero_error = "获取武将错误: " + (err.message || "未知错误");
    });

    $http.get("/api/heroDraws").success(function (data) {
        $scope.draws = data.draws;
    })
    .error(function (err) {
        $scope.draw_error = "获取抽将错误: " + (err.message || "未知错误");
    });

    $http.get("/api/heroNodes").success(function (data) {
        $scope.nodes = data.nodes;
    })
    .error(function (err) {
        $scope.node_error = "获取节点错误: " + (err.message || "未知错误");
    });

    $http.get("/api/levels").success(function (data) {
        $scope.levels = data.levels;
    })
    .error(function (err) {
        $scope.level_error = "获取关卡错误: " + (err.message || "未知错误");
    });

    $http.get("/api/treasures").success(function (data) {
        $scope.treasures = data.treasures;
    })
    .error(function (err) {
        $scope.trea_error = "获取奖励错误: " + (err.message || "未知错误");
    });

    $http.get("/api/tasks").success(function (data) {
        $scope.tasks = data.tasks;
    })
    .error(function (err) {
        $scope.task_error = "获取任务错误: " + (err.message || "未知错误");
    });

    $http.get("/api/anns").success(function (data) {
        $scope.anns = data.anns;
    })
    .error(function (err) {
        $scope.ann_error = "获取公告错误: " + (err.message || "未知错误");
    });

    $http.get("/api/storeitems").success(function (data) {
        $scope.storeItems = data.storeItems;
    })
    .error(function (err) {
        $scope.si_error = "获取集市错误: " + (err.message || "未知错误");
    });

    $scope.preview = function(ann) {
        var modalInstance = $modal.open({
            templateUrl: 'templates/modalPreviewAnn',
            controller: 'previewAnnController',
            resolve: {
                ann: function () {return ann;}
            }
        });
    };
});

sheathControllers.controller('previewAnnController', function ($scope, $http, ann) {
    $scope.ann = ann;
});

sheathControllers.controller('storeController', function ($scope, $http) {
});

sheathControllers.controller('eventController', function ($scope, $http) {
});

sheathControllers.controller('pushController', function ($scope, $http, $timeout) {
    $http.get("/api/partitions").success(function (data) {
        $scope.partitions = data.partitions;
    });

    $scope.send = function () {
        if (!$scope.content) return;

        $scope.error = null;
        $http.post("/api/sendNotification", {
            target: $scope.target,
            content: $scope.content
        })
        .success(function (data) {
            $scope.info = "成功发送";
            $timeout(function () {$scope.info = null;}, 2000);
        })
        .error(function (data) {
            $scope.error = data.message || "未知错误";
        });
    };
});

sheathControllers.controller('announcementController', function ($scope, $http, $timeout) {
    $http.get("/api/anns").success(function (data) {
        for (var i=0;i<data.anns.length;i++) {
            data.anns[i].start = moment(data.anns[i].start).toDate();
            data.anns[i].end = moment(data.anns[i].end).toDate();
        }
        $scope.items = data.anns;
        if ($scope.items.length > 0) {
            $scope.select($scope.items[0]);
        }
    })
    .error(function (data) {
        $scope.error = data.message || "未知错误";
    });

    $scope.select = function (data) {
        $scope.selected = data;
        $scope.editable = angular.copy(data);
    };

    $scope.addAnn = function () {
        $scope.items.push({
            isNew: true,
            name: "新公告",
            start: new Date(),
            end: new Date()
        });
        $scope.select($scope.items[$scope.items.length-1]);
    };

    function updateModel(dest, source) {
        _.each(source, function (value, key) {
            dest[key] = value;
        });
        dest.start = moment(source.start).toDate();
        dest.end = moment(source.end).toDate();
    }

    $scope.modify = function (ann) {
        var diff = diffModel($scope.selected, ann, ["name", "content", "partitions", "start", "end"]);
        if (_.size(diff) > 1) {
            if (diff.start) diff.start = +diff.start;
            if (diff.start) diff.end = +diff.end;
            $http.post("/api/updateAnn", diff).success(function (data) {
                updateModel($scope.selected, data);
                $scope.select($scope.selected);
                $scope.error = null;
                $scope.info = "修改成功";
                $timeout(function () {$scope.info = null;}, 2000);
            })
            .error(function (data) {
                $scope.error = data.message || "未知错误";
            });
        }
    };

    $scope.save = function (ann) {
        if (ann.start) ann.start = +ann.start;
        if (ann.start) ann.end = +ann.end;
        ann.isNew = undefined;
        $http.post("/api/saveAnn", ann).success(function (data) {
            updateModel($scope.selected, data);
            $scope.selected.isNew = undefined;
            $scope.select($scope.selected);
            $scope.error = null;
            $scope.info = "保存成功";
            $timeout(function () {$scope.info = null;}, 2000);
        })
        .error(function (data) {
            $scope.error = data.message || "未知错误";
        });
    };

    $scope.remove = function (ann) {
        if (!ann.id) {
            $scope.items = _.without($scope.items, $scope.selected);
            $scope.editable = undefined;
            if ($scope.items.length) {
                $scope.select($scope.items[0]);
            }
            return;
        }

        $http.post("/api/removeAnn", {annId: ann.id}).success(function (data) {
            $scope.items = _.without($scope.items, $scope.selected);
            $scope.editable = undefined;
            if ($scope.items.length) {
                $scope.select($scope.items[0]);
            }
        })
        .error(function (data) {
            $scope.error = data.message || "未知错误";
        });
    };
});

sheathControllers.controller('statsController', function ($scope, $http) {
    var defaultChartConfig = {
        title: {text: ""},
        options: {
            chart: {
                type: "areaspline",
                events: {}
            },
            tooltip: {
                style: {
                    padding: 10,
                    fontWeight: 'bold'
                }
            },
            xAxis: {type: "datetime", dateTimeLabelFormats: {day: "%y-%m-%e"}, minRange: 24*60*60*1000},
            yAxis: {title: "", allowDecimals: false}
        },
        series: []
    };

    var retention = $scope.retention = _.cloneDeep(defaultChartConfig);
    var newReg = $scope.newReg = _.cloneDeep(defaultChartConfig);
    var online = $scope.online = _.cloneDeep(defaultChartConfig);

    retention.options.yAxis.allowDecimals = true;
    retention.options.yAxis.ceiling = 1.0;

    $scope.retrieveStats = function (series, seriesIndex, name, type, cycle, errorPrefix) {
        var s = series[seriesIndex] = series[seriesIndex] || {name: name};
        var requestParam = {
            start: moment().subtract(31, "d").startOf("day"),
            end: null,
            type: type,
            cycle: cycle
        };
        $http.post("/api/getStatInfo", requestParam).success(function (data) {
            _.chain(data).each(function (r) {r.x = new Date(r.x);}).sortBy("x");
            s.data = data;
        })
        .error(function (data) {
            $scope[errorPrefix + "_error"] = data.message || "未知错误";
        });
    };

    $scope.retrieveStats(retention.series, 0, "次日留存", "retention", 1, "retention");
    $scope.retrieveStats(retention.series, 1, "三日留存", "retention", 3, "retention");
    $scope.retrieveStats(retention.series, 2, "七日留存", "retention", 7, "retention");
    $scope.retrieveStats(retention.series, 3, "十四日留存", "retention", 14, "retention");
    $scope.retrieveStats(retention.series, 4, "月留存", "retention", 30, "retention");
    $scope.retrieveStats(newReg.series, 0, "新角色", "regRole", 1, "reg");
    $scope.retrieveStats(newReg.series, 1, "新用户", "regUser", 1, "reg");
    $scope.retrieveStats(online.series, 0, "在线角色", "onlineRole", 1, "online");
    $scope.retrieveStats(online.series, 1, "在线用户", "onlineUser", 1, "online");
});

sheathControllers.controller('mcodeController', function ($scope, $http, $modal) {
    $scope.newMCode = function () {
    };
});

sheathControllers.controller('settingsController', function ($scope, $http, $timeout) {
    $scope.kickAll = function () {
        $http.post("/api/kickAll");
    };

    $scope.reloadTask = function () {
        $http.post("/api/reloadTask");
    };

    $scope.resetPerf = function () {
        $http.post("/api/resetPerfStats");
    };

    $scope.broadcast = function () {
        $http.post("/api/broadcast", {content: $scope.bdConent});
    };

    $scope.chat = function () {
        $http.post("/api/chat", {content: $scope.chatContent});
    };

    $scope.sendMail = function () {
        $http.post("/api/sendMail", {role: $scope.mailRoleId, content: $scope.mailContent});
    };

    $scope.open = function ($event, key) {
        $event.preventDefault();
        $event.stopPropagation();

        $scope[key] = true;
    };
    $scope.logRunStart = $scope.logRunEnd = new Date();

    $scope.logRun = function () {
        $http.post("/api/refreshStats", {start: +$scope.logRunStart, end: +$scope.logRunEnd})
        .success(function (data) {
            $scope.info = "正在刷新数据.请稍候";
            $timeout(function () {$scope.info = null;}, 2000);
        });
    };
});

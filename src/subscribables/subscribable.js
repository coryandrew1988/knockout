/*jshint sub: true */
/*global ko, applyExtenders */

ko.subscription = function (target, callback, disposeCallback, options) {
    this.target = target;
    this.callback = callback;
    this.disposeCallback = disposeCallback;
    this._nestedRepeaters = [];
    ko.dependencyDetection.registerRepeater(this);
    ko.exportProperty(this, 'dispose', this.dispose);

    this._isEager = false;
    this._eagerChangeHandlers = [];
    var eager = options && options.eager;
    this['setEager'](eager !== false);

    var subscription = this;
    this.pushNestedRepeater = function (nestedRepeater) {
        subscription._nestedRepeaters.push(nestedRepeater);
    };
};
ko.subscription.prototype.dispose = function () {
    this.isDisposed = true;

    this['setEager'](false);
    this._eagerChangeHandlers = []; // probably unnecessary, but still a safe bet

    this.disposeNestedRepeaters();
    this.disposeCallback();
};
ko.subscription.prototype.disposeNestedRepeaters = function () {
    // Dispose any subscriptions.
    ko.utils.arrayForEach(this._nestedRepeaters, function (nestedRepeater) {
        nestedRepeater['dispose']();
    });
    this._nestedRepeaters = [];
};
ko.subscription.prototype['update'] = function () {
    this.target.update();
};
ko.subscription.prototype['onEagerChange'] = function (handler) {
    var eagerChangeHandlers = this._eagerChangeHandlers;
    eagerChangeHandlers.push(handler);
    return this;
};
ko.subscription.prototype['setEager'] = function (value) {
    value = !!value;
    if (this._isEager === value) { return; }
    this._isEager = value;

    if (value) {
        this.target.slideEagerSubscriptionCount(1);
    } else {
        this.target.slideEagerSubscriptionCount(-1);
    }

    var eagerChangeHandlers = this._eagerChangeHandlers.slice();
    for (var i = 0, il = eagerChangeHandlers.length; i < il; ++i) {
        var eagerChangeHandler = eagerChangeHandlers[i];
        try {
            eagerChangeHandler(value);
        } catch(err) {
            console.log('error in subscription eager-change handler: ', err);
        }
    }
};

ko.subscribable = function () {
    this._subscriptions = {};
    this._isEager = false;
    this._eagerSubscriptionCount = 0;
    this._eagerChangeHandlers = [];

    ko.utils.extend(this, ko.subscribable['fn']);
    ko.exportProperty(this, 'subscribe', this.subscribe);
    ko.exportProperty(this, 'extend', this.extend);
    ko.exportProperty(this, 'getSubscriptionsCount', this.getSubscriptionsCount);
};

var defaultEvent = 'change';

var subEvents = {
    'change': 'outdated'
};

ko.subscribable['configureEvents'] = function (options) {
    ko.utils.extend(subEvents, options.subEvents);
};

ko.subscribable['fn'] = {
    subscribe: function (callback, callbackTarget, event, options) {
        event = event || defaultEvent;
        var boundCallback = callbackTarget ? callback.bind(callbackTarget) : callback;
        var disposeCallback = function () {
            ko.utils.arrayRemoveItem(this._subscriptions[event], subscription);
        }.bind(this);

        var subscription = new ko.subscription(this, boundCallback, disposeCallback, options);

        if (!this._subscriptions[event]) {
            this._subscriptions[event] = [];
        }
        this._subscriptions[event].push(subscription);
        return subscription;
    },

    'notifySubscribers': function (valueToNotify, event) {
        event = event || defaultEvent;
        if (this.hasSubscriptionsForEvent(event)) {
            try {
                ko.dependencyDetection.begin();

                var subscriptions = this._subscriptions[event];
                subscriptions = subscriptions ? subscriptions.slice() : [];
                var subEvent = event;
                while ((subEvent = subEvents[subEvent])) {
                    var subEventSubscriptions = this._subscriptions[subEvent];
                    if (subEventSubscriptions) {
                        subscriptions.push.apply(subscriptions, subEventSubscriptions);
                    }
                }

                for (var a = subscriptions, i = 0, subscription; (subscription = a[i]); ++i) {
                    // In case a subscription was disposed during the arrayForEach cycle, check
                    // for isDisposed on each subscription before invoking its callback
                    if (subscription && (subscription.isDisposed !== true)) {
                        subscription.disposeNestedRepeaters();
                        try {
                            ko.dependencyDetection.pushRepeater(subscription.pushNestedRepeater);
                            subscription.callback(valueToNotify);
                        } finally {
                            ko.dependencyDetection.popRepeater();
                        }
                    }
                }
            } finally {
                ko.dependencyDetection.end();
            }
        }
    },

    'update': function () { /* interface method, no-op by default */ },

    'onEagerChange': function (handler) {
        var eagerChangeHandlers = this._eagerChangeHandlers;
        eagerChangeHandlers.push(handler);
        return this;
    },

    slideEagerSubscriptionCount: function (displacement) {
        var wasPositive = this._eagerSubscriptionCount > 0;
        this._eagerSubscriptionCount += displacement;
        var isPositive = this._eagerSubscriptionCount > 0;

        if (isPositive === wasPositive) { return; }

        this._isEager = isPositive;

        var eagerChangeHandlers = this._eagerChangeHandlers.slice();
        for (var i = 0, il = eagerChangeHandlers.length; i < il; ++i) {
            var eagerChangeHandler = eagerChangeHandlers[i];
            try {
                eagerChangeHandler(isPositive);
            } catch(err) {
                console.log('error in subscribable eager-change handler: ', err);
            }
        }
    },

    hasSubscriptionsForEvent: function (event) {
        return (
            this._subscriptions[event] && this._subscriptions[event].length
        ) || (
            subEvents[event] && this.hasSubscriptionsForEvent(subEvents[event])
        );
    },

    getSubscriptionsCount: function () {
        var total = 0;
        ko.utils.objectForEach(this._subscriptions, function (eventName, subscriptions) {
            total += subscriptions.length;
        });
        return total;
    },

    extend: applyExtenders
};


ko.isSubscribable = function (instance) {
    return instance != null && typeof instance.subscribe === 'function' &&
    typeof instance['notifySubscribers'] === 'function' && typeof instance['update'] === 'function';
};

ko.exportSymbol('subscribable', ko.subscribable);
ko.exportSymbol('isSubscribable', ko.isSubscribable);

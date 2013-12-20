/*jshint sub: true */
/*global ko, DEBUG, valuesArePrimitiveAndEqual */

ko.dependentObservable = function (evaluatorFunctionOrOptions, evaluatorFunctionTarget, options) {
    var _latestValue;
    var _hasBeenEvaluated = false;
    var _isBeingEvaluated = false;
    var _holdEvaluation = false;
    var _isOutdated = true;
    var readFunction = evaluatorFunctionOrOptions;

    if (readFunction && typeof readFunction === 'object') {
        // Single-parameter syntax - everything is on this "options" param
        options = readFunction;
        readFunction = options['read'];
    } else {
        // Multi-parameter syntax - construct the options according to the params passed
        options = options || {};
        if (!readFunction) {
            readFunction = options['read'];
        }
    }
    if (typeof readFunction !== 'function') {
        throw new Error('Pass a function that returns the value of the ko.computed');
    }
    // By here, "options" is always non-null
    var writeFunction = options['write'];

    var _isEager = options['eager'] !== false;

    var _manageNestedRepeaters = options['manageNestedRepeaters'] || false;
    var _nestedRepeaters = [];
    var disposeNestedRepeaters = function () {
        // Dispose any subscriptions.
        ko.utils.arrayForEach(_nestedRepeaters, function (nestedRepeater) {
            nestedRepeater['dispose']();
        });
        _nestedRepeaters = [];
    };
    var addNestedRepeater = _manageNestedRepeaters ? function (nestedRepeater) {
        _nestedRepeaters.push(nestedRepeater);
    } : (
        null
    );

    var _subscriptionsToDependencies = [];
    var addSubscriptionToDependency = function (subscribable) {
        var subscription = subscribable.subscribe(markOutdated, null, 'outdated', {
            eager: _isEager || dependentObservable._isEager
        });
        dependentObservable['onEagerChange'](function (isEager) {
            subscription['setEager'](isEager);
        });
        _subscriptionsToDependencies.push(subscription);
    };
    var disposeSubscriptionsToDependencies = function () {
        var subscriptionsToDependencies = _subscriptionsToDependencies;
        _subscriptionsToDependencies = [];
        dependentObservable._eagerChangeHandlers = [];
        ko.utils.arrayForEach(subscriptionsToDependencies, function (subscription) {
            subscription.dispose();
        });
    };

    var dispose = function () {
        disposeSubscriptionsToDependencies();
        disposeNestedRepeaters();
    };

    var evaluationTimeoutInstance = null;

    var markOutdated = function () {
        _isOutdated = true;

        if (_isEager || dependentObservable._isEager) {
            var throttleEvaluationTimeout = dependentObservable['throttleEvaluation'];
            if (throttleEvaluationTimeout && throttleEvaluationTimeout >= 0) {
                clearTimeout(evaluationTimeoutInstance);
                evaluationTimeoutInstance = setTimeout(evaluateImmediate, throttleEvaluationTimeout);
            } else {
                evaluateImmediate();
            }
        } else {
            dependentObservable['notifySubscribers'](_latestValue, 'outdated');
        }
    };

    var evaluateImmediate = function () {
        if (_holdEvaluation || _isBeingEvaluated) {
            // First, we can specifically request to hold-off on evaluating the observable.
            // Second, if the evaluation of a ko.computed causes side effects, it's possible that it will trigger its own re-evaluation.
            // This is not desirable (it's hard for a developer to realize a chain of dependencies might cause this, and they almost
            // certainly didn't intend infinite re-evaluations). So, for predictability, we simply prevent ko.computeds from causing
            // their own re-evaluation. Further discussion at https://github.com/SteveSanderson/knockout/pull/387
            return;
        }

        // Don't dispose on first evaluation, because the "disposeWhen" callback might
        // e.g., dispose when the associated DOM element isn't in the doc, and it's not
        // going to be in the doc until *after* the first evaluation
        if (_hasBeenEvaluated && disposeWhen()) {
            dispose();
            return;
        }

        disposeSubscriptionsToDependencies();
        if (_manageNestedRepeaters) {
            disposeNestedRepeaters();
        }

        _isBeingEvaluated = true;
        try {
            ko.dependencyDetection.begin(addSubscriptionToDependency);
            ko.dependencyDetection.pushRepeater(addNestedRepeater);

            var newValue = evaluatorFunctionTarget ? readFunction.call(evaluatorFunctionTarget) : readFunction();

            _hasBeenEvaluated = true;

            if (!dependentObservable['equalityComparer'] || !dependentObservable['equalityComparer'](_latestValue, newValue)) {
                dependentObservable['notifySubscribers'](_latestValue, 'beforeChange');
                _latestValue = newValue;
                if (DEBUG) { dependentObservable._latestValue = _latestValue; }
                dependentObservable['notifySubscribers'](_latestValue);
            }
        } finally {
            ko.dependencyDetection.popRepeater();
            ko.dependencyDetection.end();
            _isBeingEvaluated = false;
            _isOutdated = false;
        }
    };

    var dependentObservable = function () {
        if (arguments.length === 0) {
            // Reading the value
            if (_isOutdated) {
                evaluateImmediate();
            }
            ko.dependencyDetection.registerDependency(dependentObservable);
            return _latestValue;
        }

        if (typeof writeFunction === 'function') {
            // Writing a value
            try {
                _holdEvaluation = true;
                writeFunction.apply(evaluatorFunctionTarget, arguments);
            } finally {
                _holdEvaluation = false;
            }

            markOutdated();
        } else {
            throw new Error('Cannot write a value to a ko.computed unless you specify a \'write\' option. If you wish to read the current value, don\'t pass any parameters.');
        }
        return this; // Permits chained assignments
    };

    var peek = function () {
        if (_isOutdated) {
            evaluateImmediate();
        }
        return _latestValue;
    };

    var isActive = function () {
        return !_hasBeenEvaluated || _subscriptionsToDependencies.length > 0;
    };

    var disposeWhenNodeIsRemoved = options['disposeWhenNodeIsRemoved'] || options.disposeWhenNodeIsRemoved || null;
    var disposeWhen = options['disposeWhen'] ||
    options.disposeWhen || function () { return false; };

    if (!evaluatorFunctionTarget) {
        evaluatorFunctionTarget = options['owner'];
    }

    dependentObservable.peek = peek;
    dependentObservable.getDependenciesCount = function () {
        return _subscriptionsToDependencies.length;
    };
    dependentObservable.hasWriteFunction = typeof options['write'] === 'function';
    dependentObservable.dispose = function () { dispose(); };
    dependentObservable.isActive = isActive;
    dependentObservable.eagerDependencyCount = 0;

    ko.subscribable.call(dependentObservable);
    ko.utils.extend(dependentObservable, ko.dependentObservable['fn']);

    dependentObservable.update = function () {
        if (_isOutdated) {
            evaluateImmediate();
        }
    };

    ko.exportProperty(dependentObservable, 'peek', dependentObservable.peek);
    ko.exportProperty(dependentObservable, 'dispose', dependentObservable.dispose);
    ko.exportProperty(dependentObservable, 'isActive', dependentObservable.isActive);
    ko.exportProperty(dependentObservable, 'getDependenciesCount', dependentObservable.getDependenciesCount);

    ko.dependencyDetection.registerRepeater(dependentObservable);

    // Evaluate, unless deferEvaluation is true
    if ((_isEager || dependentObservable._isEager) && options['deferEvaluation'] !== true) {
        evaluateImmediate();
    }

    // Build "disposeWhenNodeIsRemoved" and "disposeWhenNodeIsRemovedCallback" option values.
    // But skip if isActive is false (there will never be any dependencies to dispose).
    // (Note: "disposeWhenNodeIsRemoved" option both proactively disposes as soon as the node is removed using ko.removeNode(),
    // plus adds a "disposeWhen" callback that, on each evaluation, disposes if the node was removed by some other means.)
    if (disposeWhenNodeIsRemoved && isActive()) {
        var disposeOnNodeRemoval = function () {
            ko.utils.domNodeDisposal.removeDisposeCallback(
                disposeWhenNodeIsRemoved, disposeOnNodeRemoval
            );
            dispose();
        };
        ko.utils.domNodeDisposal.addDisposeCallback(disposeWhenNodeIsRemoved, disposeOnNodeRemoval);
        var existingDisposeWhenFunction = disposeWhen;
        disposeWhen = function () {
            return !ko.utils.domNodeIsAttachedToDocument(disposeWhenNodeIsRemoved) || existingDisposeWhenFunction();
        };
    }

    return dependentObservable;
};

ko.isComputed = function (instance) {
    return ko.hasPrototype(instance, ko.dependentObservable);
};

var protoProp = ko.observable.protoProperty; // == "__ko_proto__"
ko.dependentObservable[protoProp] = ko.observable;

ko.dependentObservable['fn'] = {
    'equalityComparer': valuesArePrimitiveAndEqual
};
ko.dependentObservable['fn'][protoProp] = ko.dependentObservable;

ko.exportSymbol('dependentObservable', ko.dependentObservable);
ko.exportSymbol('computed', ko.dependentObservable); // Make "ko.computed" an alias for "ko.dependentObservable"
ko.exportSymbol('isComputed', ko.isComputed);

/*global ko */
ko.dependencyDetection = (function () {
    'use strict';

    var outerFrames = [];
    var currentFrame = null;
    var outerNestedRepeaterHandlers = [];
    var currentNestedRepeaterHandler = null;

    // Return a unique ID that can be assigned to an observable for dependency tracking.
    // Theoretically, you could eventually overflow the number storage size, resulting
    // in duplicate IDs. But in JavaScript, the largest exact integral value is 2^53
    // or 9,007,199,254,740,992. If you created 1,000,000 IDs per second, it would
    // take over 285 years to reach that number.
    // Reference http://blog.vjeux.com/2010/javascript/javascript-max_int-number-limits.html
    var lastId = 0;
    var getId = function () {
        return ++lastId;
    };

    var begin = function (options) {
        outerFrames.push(currentFrame);
        currentFrame = options;
    };

    var end = function () {
        currentFrame = outerFrames.pop();
    };

    var registerDependency = function (subscribable) {
        if (!currentFrame) { return; }

        if (!ko.isSubscribable(subscribable)) {
            throw new Error("Only subscribable things can act as dependencies");
        }

        currentFrame.callback(subscribable, subscribable._id || (subscribable._id = getId()));
    };

    var ignoreDependencies = function (callback, callbackTarget, callbackArgs) {
        try {
            begin();
            return callback.apply(callbackTarget, callbackArgs || []);
        } finally {
            end();
        }
    };

    var pushRepeater = function (handler) {
        outerNestedRepeaterHandlers.push(currentNestedRepeaterHandler);
        currentNestedRepeaterHandler = handler;
    };

    var popRepeater = function () {
        currentNestedRepeaterHandler = outerNestedRepeaterHandlers.pop();
    };

    var registerRepeater = function (repeater) {
        // If this is nested within other repeaters, register with the repeater currently in control.
        if (currentNestedRepeaterHandler) {
            currentNestedRepeaterHandler(repeater);
        }
    };

    var preserveRepeaters = function (callback, callbackTarget, callbackArgs) {
        try {
            pushRepeater(null);
            return callback.apply(callbackTarget, callbackArgs || []);
        } finally {
            popRepeater();
        }
    };

    return {
        begin: begin,

        end: end,

        registerDependency: registerDependency,

        ignore: ignoreDependencies,

        pushRepeater: pushRepeater,

        popRepeater: popRepeater,

        registerRepeater: registerRepeater,

        preserveRepeaters: preserveRepeaters
    };
})();

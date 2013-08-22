
ko.dependencyDetection = (function () {
    var _frames = [];
    var _nestedRepeaterHandlers = [];

    return {
        begin: function (callback) {
            _frames.push({ callback: callback, distinctDependencies:[] });
        },

        end: function () {
            _frames.pop();
        },

        registerDependency: function (subscribable) {
            if (!ko.isSubscribable(subscribable))
                throw new Error("Only subscribable things can act as dependencies");
            if (_frames.length > 0) {
                var topFrame = _frames[_frames.length - 1];
                if (!topFrame || ko.utils.arrayIndexOf(topFrame.distinctDependencies, subscribable) >= 0)
                    return;
                topFrame.distinctDependencies.push(subscribable);
                topFrame.callback(subscribable);
            }
        },

        ignore: function(callback, callbackTarget, callbackArgs) {
            try {
                _frames.push(null);
                return callback.apply(callbackTarget, callbackArgs || []);
            } finally {
                _frames.pop();
            }
        },

        pushRepeater: function (callback) {
            _nestedRepeaterHandlers.push(callback);
        },

        popRepeater: function () {
            _nestedRepeaterHandlers.pop();
        },

        registerRepeater: function (repeater) {
            // If this is nested within other repeaters, mark it for automatic cleanup.
            var len;
            if ((len = _nestedRepeaterHandlers.length)) {
                var handle = _nestedRepeaterHandlers[len - 1];
                handle(repeater);
            }
        }
    };
})();

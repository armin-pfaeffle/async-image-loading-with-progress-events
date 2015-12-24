
Image.prototype.asyncLoadImage = function(imageUrl) {

    var targetImage = this;
    var loader = {};

    var autoSetupSize = true;
    var databaseConfig = {
        database: 'asyncLoadImage',
        version: 1, // must be an Integer
        objectStore: 'image'
    };

    var indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.OIndexedDB || window.msIndexedDB;
    var IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction || window.OIDBTransaction || window.msIDBTransaction;


    loader.createAndDisptachEvent = function(eventName, data) {
        data = data || {};
        if (typeof Event == 'function') {
            var event = new Event(eventName);
            for (property in data) {
                event[property] = data[property];
            }
            targetImage.dispatchEvent(event);
        }
        else {
            if (document.createEvent) {
                event = document.createEvent('HTMLEvents');
                event.initEvent(eventName, true, true);
            }
            else if (document.createEventObject) {// IE < 9
                event = document.createEventObject();
                event.eventType = eventName;
            }

            event.eventName = eventName;
            if (targetImage.dispatchEvent) {
                targetImage.dispatchEvent(event);
            }
            else if (targetImage.fireEvent && htmlEvents['on' + eventName]){ // IE < 9
                targetImage.fireEvent('on' + event.eventType, event);// can trigger only real event (e.g. 'click')
            }
            else if (targetImage[eventName]) {
                targetImage[eventName]();
            }
            else if (targetImage['on' + eventName]) {
                targetImage['on' + eventName]();
            }
        }
    };

    loader.database = {
        opened: false,

        isAvailable: function() {
            return (typeof indexedDB == 'object');
        },

        get: function(imageUrl, callback) {
            var self = this;
            self.open(function(opened) {
                if (opened) {
                    var transaction = self.db.transaction([databaseConfig.objectStore], 'readonly');
                    transaction.onerror = function(event) {
                        loader.createAndDisptachEvent('asyncLoadImageError', { url: imageUrl, message: 'Transaction not opened due to error: ' + transaction.error });
                    };

                    transaction.objectStore(databaseConfig.objectStore).get(imageUrl).onsuccess = function (event) {
                        callback(event.target.result);
                    };
                }
                else {
                    loader.createAndDisptachEvent('asyncLoadImageError', { url: imageUrl, message: 'Could not open database.' });
                }
            });
        },

        set: function(imageUrl, image, callback) {
            var self = this;
            self.open(function(opened) {
                if (opened) {
                    var transaction = self.db.transaction([databaseConfig.objectStore], 'readwrite');
                    transaction.onerror = function(event) {
                        loader.createAndDisptachEvent('asyncLoadImageError', { url: imageUrl, message: 'Transaction not opened due to error: ' + transaction.error });
                    };

                    try {
                        var request = transaction.objectStore(databaseConfig.objectStore).put(image, imageUrl).onsuccess = function (event) {
                            if (typeof callback == 'function') {
                                callback();
                            }
                        };
                    } catch (e) {
                        loader.createAndDisptachEvent('asyncLoadImageError', { url: imageUrl, message: 'Transaction failed: ' + e.toString() });
                    }
                }
                else {
                    loader.createAndDisptachEvent('asyncLoadImageError', { url: imageUrl, message: 'Could not open database.' });
                }
            });
        },

        open: function(callback) {
            var self = this;
            if (self.opened) {
                callback(self.opened);
            }
            else {
                var request = indexedDB.open(databaseConfig.database, parseInt(databaseConfig.version) || 1);

                request.onsuccess = function (evt) {
                    self.db = evt.target.result;

                    // Deprecated upgrade method
                    if (self.db.setVersion) {
                        if (self.db.version != databaseConfig.version) {
                            var request = self.db.setVersion(databaseConfig.version);
                            request.onsuccess = function () {
                                if (self.db.objectStoreNames.contains(databaseConfig.objectStore)) {
                                    self.db.deleteObjectStore(databaseConfig.objectStore);
                                }
                                var store = self.db.createObjectStore(databaseConfig.objectStore);
                                var transaction = request.result;
                                transaction.oncomplete = function(e) {
                                    self.opened = true;
                                    callback(true);
                                }
                            };

                            request.onerror = function(evt) {
                                loader.createAndDisptachEvent('asyncLoadImageError', { url: imageUrl, message: 'Could not upgrade database: ' + request.error });
                            };
                        }
                        else {
                            self.opened = true;
                            callback(true);
                        }
                    }
                    else {
                        self.opened = true;
                        callback(true);
                    }
                };

                request.onerror = function(evt) {
                    loader.createAndDisptachEvent('asyncLoadImageError', { url: imageUrl, message: 'Could not open database: ' + request.error });
                };

                request.onupgradeneeded = function(evt) {
                    self.db = evt.target.result;
                    if (self.db.objectStoreNames.contains(databaseConfig.objectStore)) {
                        self.db.deleteObjectStore(databaseConfig.objectStore);
                    }
                    self.db.createObjectStore(databaseConfig.objectStore);
                }
            }
        }
    };

    loader.asyncLoadImage = function() {
        var startTimestamp;

        var xhr = new XMLHttpRequest();
        xhr.open('GET', imageUrl, true);
        xhr.responseType = "arraybuffer";

        xhr.onloadstart = function(evt) {
            startTimestamp = evt.timeStamp;
            loader.createAndDisptachEvent('asyncLoadImageStart', {
                url: imageUrl,
                timestamp: evt.timeStamp
            });
        };

        xhr.onprogress = function(evt) {
            if (this.status == 200) {
                loader.createAndDisptachEvent('asyncLoadImageProgress', {
                    url: imageUrl,
                    total: evt.total,
                    loaded: evt.loaded,
                    startTimestamp: startTimestamp,
                    timestamp: evt.timeStamp
                });
            }
        };

        xhr.onload = function(evt) {
            if (this.status == 200 || this.status == 304) {
                var eventData = {
                    url: imageUrl,
                    total: evt.total,
                    loaded: evt.loaded,
                    startTimestamp: startTimestamp,
                    timestamp: evt.timeStamp,
                    duration: evt.timeStamp - startTimestamp
                };

                if (this.status == 200) {
                    // Image was loaded from server
                    var image = {
                        blob: new Blob([this.response]),
                        caching: {
                            loaded: Date.now(),
                            // cacheControl: this.getResponseHeader('Cache-Control'), // Cache-Control: max-age=2592000
                            eTag: this.getResponseHeader('ETag'),
                            lastModified: this.getResponseHeader('Last-Modified')
                            // expires: this.getResponseHeader('Expires')
                        }
                    };

                    loader.setImage(image);
                    eventData.fromCache = false;
                    loader.createAndDisptachEvent('asyncLoadImageLoaded', eventData);

                    if (loader.database.isAvailable()) {
                        loader.database.set(imageUrl, image);
                    }
                }
                else if (this.status == 304) {
                    // Image was not modified, so it must be loaded from local cache
                    loader.database.get(imageUrl, function(image) {
                        loader.setImage(image);
                        eventData.fromCache = true;
                        loader.createAndDisptachEvent('asyncLoadImageLoaded', eventData);
                    });
                }
            }
            else {
                loader.createAndDisptachEvent('asyncLoadImageError', {
                    url: imageUrl,
                    statusCode: this.status,
                    message: this.statusText
                });
            }
        };

        xhr.onerror = function(evt) {
            loader.createAndDisptachEvent('asyncLoadImageError', {
                url: imageUrl,
                statusCode: this.status,
                message: this.statusText
            });
        };


        if (loader.database.isAvailable()) {
            loader.database.get(imageUrl, function(image) {
                if (image) {
                    if (image.caching.lastModified) {
                        xhr.setRequestHeader("If-Modified-Since", image.caching.lastModified);
                    }
                    if (image.caching.eTag) {
                        xhr.setRequestHeader("If-None-Match", image.caching.eTag);
                    }
                }
                xhr.send();
            });
        }
        else {
            xhr.send();
        }
    };

    loader.setImage = function(image) {
        var URL = window.URL || window.webkitURL;
        var tmpImageUrl = URL.createObjectURL(image.blob);
        targetImage.setAttribute('src', tmpImageUrl);
        targetImage.addEventListener('load', function() {

            loader.createAndDisptachEvent('asyncLoadImageFinished', {
                url: imageUrl,
            });

            if (autoSetupSize) {
                this.setAttribute('width', this.width);
                this.setAttribute('height', this.height);
            }

            URL.revokeObjectURL(tmpImageUrl);
        });
    };

    if (window.Blob) {
        loader.asyncLoadImage();
    }
    else {
        // For IE9 or lower
        startTimestamp = Date.now();
        loader.createAndDisptachEvent('asyncLoadImageStart', {
            url: imageUrl,
            timestamp: startTimestamp
        });

        targetImage.addEventListener('load', function() {
            loader.createAndDisptachEvent('asyncLoadImageFinished', {
                url: imageUrl,
                startTimestamp: startTimestamp,
                timestamp: Date.now(),
                duration: Date.now() - startTimestamp
            });
        });

        targetImage.setAttribute('src', imageUrl);
    }
}

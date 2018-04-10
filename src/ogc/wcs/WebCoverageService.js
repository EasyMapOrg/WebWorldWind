/*
 * Copyright 2018 WorldWind Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * @exports WebCoverageService
 */
define([
    '../../error/ArgumentError',
    '../../util/Logger',
    '../../util/Promise',
    '../../ogc/wcs/WcsCapabilities',
    '../../ogc/wcs/WcsCoverage',
    '../../ogc/wcs/WcsDescribeCoverage'
    ],
    function (ArgumentError,
              Logger,
              Promise,
              WcsCapabilities,
              WcsCoverage,
              WcsDescribeCoverage) {
        "use strict";

        /**
         * Represents a Web Coverage Service and provides functionality for interacting with the service. Includes
         * functionality for retrieving DescribeCoverage documents and providing WCS version agnostic coverage objects.
         * @param serviceAddress the url of the Web Coverage Service
         * @constructor
         */
        var WebCoverageService = function (serviceAddress) {

            /**
             * The URL for the Web Coverage Service
             */
            this.serviceAddress = serviceAddress;

            /**
             * A collection of the coverages available from this service. Not populated until service is initialized by
             * the connect method.
             * @type {Array}
             */
            this.coverages = null;

            this._connectPromise = null;
        };

        /**
         * Connects to the Web Coverage Service specified in the constructor. This function handles version negotiation
         * and capabilities document retrieval. The return is a Promise which returns the initialized
         * WebCoverageService.
         * @returns {Promise} a Promise of a WebCoverageService
         */
        WebCoverageService.prototype.connect = function () {
            if (!this._connectPromise) {
                this._connectPromise = this.createConnection();
            }

            return this._connectPromise;
        };

        // Internal use only
        WebCoverageService.prototype.createConnection = function () {
            var self = this;

            return new Promise(function (resolve, reject) {

                self.retrieveGetCapabilities()
                    .then(self.retrieveDescribeCoverage.bind(self))
                    .then(self.parseCoverages)
                    .then(function (coverages) {
                        // TODO more formal definition of the setup process
                        self.coverages = coverages.slice();
                        resolve(self);
                    });
            });
        };

        /**
         * Returns the coverage associated with the provided id or name
         * @param coverageId the requested coverage id or name
         * @returns {WcsCoverage}
         */
        WebCoverageService.prototype.getCoverage = function (coverageId) {
            // TODO
        };

        // Internal use only
        WebCoverageService.prototype.retrieveGetCapabilities = function (version) {
            var self = this, wcsCaps;

            return new Promise(function (resolve, reject) {

                self.retrieveXml(self.buildGetCapabilitiesUrl(version))
                    .then(function (xml) {
                        try {
                            // Attempt to parse the returned XML
                            wcsCaps = new WcsCapabilities(xml);
                            resolve(wcsCaps);
                        } catch (e) {
                            // WcsCapabilities throws an ArgumentError in the event of an incompatible version
                            // If the version is not defined and an argument error is thrown, the server replied with a
                            // preferred version not supported by WebWorldWind. Retry with version 1.0.0.
                            if (!version && e instanceof ArgumentError) {
                                resolve(self.retrieveGetCapabilities("1.0.0"));
                            } else {
                                reject(Error("unable to parse")); // TODO more appropriate error
                            }
                        }
                    });
            });
        };

        // Internal use only
        WebCoverageService.prototype.retrieveDescribeCoverage = function (wcsCaps) {
            if (!wcsCaps) {
                throw new Error("no capabilities document");
            }

            var len = wcsCaps.coverages.length, version = wcsCaps.version, coverageIds = [], coverage, baseUrl,
                remainingCharCount, characterCount = 0, coverageId, requests = [];

            // Watch for the 2083 character limit and split describe coverage requests as needed
            baseUrl = this.buildDescribeCoverageUrl(wcsCaps);
            remainingCharCount = 2083 - baseUrl.length;

            for (var i = 0; i < len; i++) {
                coverage = wcsCaps.coverages[i];
                if (version === "1.0.0") {
                    coverageId = coverage.name;
                } else if (version === "2.0.0" || version === "2.0.1") {
                    coverageId = coverage.coverageId;
                }

                if (coverageId.length + characterCount > remainingCharCount) {
                    requests.push(this.retrieveXml(baseUrl + coverageIds.join(",")));
                    characterCount = 0;
                    coverageIds = [];
                }

                coverageIds.push(coverageId);
                characterCount += coverageId.length + 1;
            }

            requests.push(this.retrieveXml(baseUrl + coverageIds.join(",")));

            return Promise.all(requests);
        };



        WebCoverageService.prototype.parseCoverages = function (describeCoverages) {
            var len = describeCoverages.length, coverageDescription, coverageCount, coverages = [];
            for (var i = 0; i < len; i++) {
                coverageDescription = new WcsDescribeCoverage(describeCoverages[i]);
                coverageCount = coverageDescription.coverages.length;
                for (var j = 0; j < coverageCount; j++) {
                    coverages.push(coverageDescription.coverages[i]);
                }
            }

            return coverages;
        };

        // Internal use only
        WebCoverageService.prototype.retrieveXml = function (url) {
            return new Promise(function (resolve, reject) {
                var xhr = new XMLHttpRequest();
                xhr.open("GET", url);
                xhr.onloadend = function () {
                    if (xhr.readyState === 4) {
                        if (xhr.status === 200) {
                            resolve(xhr.responseXML);
                        } else {
                            // TODO proper error
                            reject(new Error(xhr.statusText + " " + xhr.status));
                        }
                    }
                };
                xhr.onerror = function () {
                    reject(Error(xhr.statusText));
                };
                xhr.send();
            });
        };

        // Internal use only
        WebCoverageService.prototype.buildGetCapabilitiesUrl = function (version) {
            var requestUrl = WebCoverageService.prepareBaseUrl(this.serviceAddress);

            requestUrl += "SERVICE=WCS";
            requestUrl += "&REQUEST=GetCapabilities";
            if (version) {
                requestUrl += "&VERSION=" + version;
            }

            return encodeURI(requestUrl);
        };

        // Internal use only
        WebCoverageService.prototype.buildDescribeCoverageUrl = function (wcsCaps) {
            if (!wcsCaps) {
                throw new ArgumentError(
                    Logger.logMessage(Logger.LEVEL_SEVERE, "WebCoverageService", "buildDescribeCoverageUrl",
                        "The WCS Caps object is missing."));
            }

            var version = wcsCaps.version, requestUrl, coverageParameter;

            if (version === "1.0.0") {
                requestUrl = wcsCaps.capability.request.describeCoverage.get;
                coverageParameter = "&COVERAGES=";
            } else if (version === "2.0.0" || version === "2.0.1") {
                requestUrl = wcsCaps.operationsMetadata.getOperationMetadataByName("DescribeCoverage").dcp[0].getMethods[0].url;
                coverageParameter = "&COVERAGEID=";
            }

            requestUrl = WebCoverageService.prepareBaseUrl(requestUrl);
            requestUrl += "SERVICE=WCS";
            requestUrl += "&REQUEST=DescribeCoverage";
            requestUrl += "&VERSION=" + version;
            requestUrl += coverageParameter;

            return encodeURI(requestUrl);
        };

        // Internal use only - copied from WmsUrlBuilder, is there a better place to centralize???
        WebCoverageService.prepareBaseUrl = function (url) {
            var index = url.indexOf("?");

            if (index < 0) { // if string contains no question mark
                url = url + "?"; // add one
            } else if (index !== url.length - 1) { // else if question mark not at end of string
                index = url.search(/&$/);
                if (index < 0) {
                    url = url + "&"; // add a parameter separator
                }
            }

            return url;
        };

        return WebCoverageService;
    });

/*
 * Copyright 2015-2018 WorldWind Contributors
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
define([
        'src/globe/ElevationImage',
        'src/geom/Sector'
    ],
    function (ElevationImage, Sector) {
        "use strict";
        describe("ElevationImage tests", function () {
            describe("No data value tests", function () {
                it("Correctly classifies no data pixels", function () {
                    for (var i = 0; i < 4; i++) {
                        var v = [ElevationImage.NO_DATA, ElevationImage.NO_DATA, ElevationImage.NO_DATA, ElevationImage.NO_DATA];
                        expect(ElevationImage.isNoData(v[0], v[1], v[2], v[3])).toBe(true);
                        v[i] = v[i] - 1;
                        expect(ElevationImage.isNoData(v[0], v[1], v[2], v[3])).toBe(false);
                    }
                });

                it("Correctly finds min/max elevations respecting NO_DATA values", function () {
                    var w = 5, h = 5;
                    var image = new ElevationImage("/test", new Sector(-1, 1, -1, 1), w, h);
                    image.imageData = [];
                    for (var i = 0; i < w * h; i++) {
                        image.imageData.push(ElevationImage.NO_DATA);
                    }

                    image.findMinAndMaxElevation();
                    expect(image.hasData).toBe(false);
                    expect(image.minAndMaxElevationsForSector(null)).toEqual(null);
                    image.imageData[w] = ElevationImage.NO_DATA - 1;
                    image.imageData[w + 1] = ElevationImage.NO_DATA + 1;
                    image.findMinAndMaxElevation();
                    expect(image.hasData).toBe(true);
                    expect(image.minElevation).toEqual(ElevationImage.NO_DATA - 1);
                    expect(image.maxElevation).toEqual(ElevationImage.NO_DATA + 1);
                });
            });

        });
    });


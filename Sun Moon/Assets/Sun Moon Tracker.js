/*
    Max van Leeuwen
    maxvanleeuwen.com

    Sun Moon Tracker 🌞🌙
    Get the sun and moon position in the sky!
    Uses GPS and time of day.


    
    --- Tips

    - These functions expose sensitive user data. They may not always be accessible when combined with other features (like Leaderboards, as this requires Network APIs).
    - On front camera, use Tracking Mode 'Rotation'.
    - On back camera, Tracking Mode 'World' works out of the box. If you are using 'Surface', make sure to call getSun/getMoon on each "WorldTrackingResetEvent" event!



    --- Usage

        SunMoonTracker.getSun( onSuccess, onFail (optional) )   -> onSuccess/onFail callbacks contain 'info' object
        SunMoonTracker.getMoon( onSuccess, onFail (optional) )  -> onSuccess/onFail callbacks contain 'info' object

            onSuccess(info)     'info' contains the following data:
                directionalRot      rotation to apply to a directional light, to match celestial body origin (quat)
                direction           vector from user to celestial body (normalized vec3), scale to get position in sky
                azimuth             celestial body compass angle (degrees), 0 = true north, 90 = east (cw)
                altitude            celestial body angle above horizon (degrees), 0 = on horizon, 90 = directly overhead, <0 = below horizon
                distance            distance to celestial body (cm)
                position            world position of celestial body. this is extremely far away (but can be converted to screen space, or used for interpolation)
                userHeading         user compass angle (degrees), 0 = true north, 90 = east (cw)
                userLatitude        user latitude
                horizontalAccuracy  horizontal accuracy (m)
                verticalAccuracy    vertical accuracy (m)
                userLongitude       user longitude
                userAltitude        user altitude
                date                measurement time
                name                celestial body name

            onFail(err)         (optional) 'err' is a string describing the error.


    
    --- Helpers

        SunMoonTracker.worldToScreen( worldPosition (vec3) )   -> returns 'ScreenSpaceInfo' object

            ScreenSpaceInfo     object contains the following data:
                position            vec2 screen space (-1 to 1)
                isInFront           bool, true when this screen space position is in front of the camera. useful for hiding the visual when it's behind the camera.





    --- Examples





        Match a directional light's orientation with the angle of the sun, to align the shadows in your scene
    
            SunMoonTracker.getSun(function(info){
                if(info.altitude > 0) script.light.getTransform().setWorldRotation(info.directionalRot); // only set the directional light's rotation if the sun is above the horizon
            });





        Place a 2D screen image on the moon. (Tip: the next example usually looks nicer!)
        
            // store moon world position
            var moonPos;            
            SunMoonTracker.getMoon(function(info){
                moonPos = info.position;
            });

            // continuously update screen position of image, based on latest moon world position
            script.createEvent("UpdateEvent").bind(function(){
                script.moon.getSceneObject().enabled = !!moonPos;               // hide when no moon tracking data found
                if(!moonPos) return;

                const moonOnScreen = SunMoonTracker.worldToScreen(moonPos);     // convert world space to screen space (this function returns a 'ScreenSpaceInfo' object)
                script.moon.anchors.setCenter(moonOnScreen.position);           // set screentransform position
                script.moon.getSceneObject().enabled = moonOnScreen.isInFront;  // hide when behind camera
            });





        Put a 3D SceneObject as far away as possible in the sky (within render distance), in the direction of the real moon. This looks better than a 2D screen image.

            // store moon world position
            var moonPos;
            SunMoonTracker.getMoon(function(info){
                moonPos = info.position;
            });

            // continuously update 3D moon position, based on its world position
            script.createEvent("UpdateEvent").bind(function(){
                if(!moonPos) return;

                // re-calculate an optimal position for the moon, to make it appear as if the moon is infinitely far away without it getting clipped by render distance
                const userPosition = script.cam.getTransform().getWorldPosition();      // get the user's position
                const dir = moonPos.sub(userPosition).normalize();                      // normalized direction from user to moon

                // dynamically scale the moon depending on how far away it will be placed
                const moonScale = 100 * (script.cam.far/1000);                                  // moon scale=100 at camera far=1000. adapt to any render distance
                script.moon.getTransform().setWorldScale( vec3.one().uniformScale(moonScale) ); // apply scale

                // set moon position
                const moonOffset = dir.uniformScale(script.cam.far - moonScale);        // relative position for moon, at render distance minus margin
                const moonPosition = userPosition.add(moonOffset);                      // offset from user
                script.moon.getTransform().setWorldPosition(moonPosition);              // set moon position
            }
*/






// UI
//@ui {"widget":"label"}
//@ui {"widget":"separator"}
//@ui {"widget":"label", "label":"<big><b>Sun Moon Tracker 🌞🌙</b> <small>by Max van Leeuwen"}
//@ui {"widget":"label", "label":""}
//@ui {"widget":"label", "label":"Get the sun and moon position in the sky!"}
//@ui {"widget":"label", "label":"Place script in Scene Hierarchy."}
//@ui {"widget":"label", "label":"See the top of this script for more info."}
//@ui {"widget":"label", "label":""}
//@ui {"widget":"separator"}
//@input Component.DeviceTracking deviceTracking
const tracking = script.deviceTracking;
const cam = tracking ? tracking.getSceneObject().getComponent("Component.Camera") : null; // assuming camera is same sceneobject as device tracking

// access
global.SunMoonTracker = script;
script.getSun = function(onSuccess, onFail){ getOrb(OrbType.Sun, onSuccess, onFail) };
script.getMoon = function(onSuccess, onFail){ getOrb(OrbType.Moon, onSuccess, onFail) };
script.worldToScreen = worldToScreen;

// modules
require('LensStudio:RawLocationModule');

// store
    // settings
    const initialWait = 1; // don't allow gps check before this time, as device tracking component sometimes needs time to stabilize on lens start
    const headingLifetime = .15; // how long heading data should stay valid (s)
    const flipHeadingOnSpectacles = true; // on Spectacles, the heading seems to be off by 180 degrees. use this to offset.

    // device tilt returns unexpected offset in heading. use this to postpone tracking when over threshold, and to compensate heading
    const awaitUpright = true;
    const uprightThreshold = .7; // arbitrary amount, after this the offset seems too noticeable
    const tiltHeadingOffset = 75; // heading range to compensate tilt (measured for uprightThreshold=1)

    // orb data
    const OrbType = {
        Sun:    {   name:"Sun",
                    getPosition:getSunPosition,
                    isSearching:false
                },   
        Moon:   {   name:"Moon",
                    getPosition:getMoonPosition,
                    isSearching:false
                },
    };

    // logging
    const title = "[SunMoonTracker] ";
    const noDeviceTracking = "No DeviceTracking component selected!";
    const noCallback = "No onSuccess callback given!";
    const alreadyActive = "Aborted because a search is already active.";

    // placeholder
    var foundHeadingTime; // heading data timestamp
    var foundHeading; // 0=true north, 90=east
    var tilt; // current tilt angle
    var locationService; // created once on first request
    var frontCameraFlip; // if currently using front camera
    const specs = global.deviceInfoSystem.isSpectacles(); // if currently on spectacles



// initialize
function init(){
    if(!tracking) throw(title + noDeviceTracking);

    // check camera flips
    if(!specs){
        script.createEvent("CameraBackEvent").bind(function(){
            frontCameraFlip = false;
        });
        script.createEvent("CameraFrontEvent").bind(function(){
            frontCameraFlip = true;
        });
    }
};
init();



function getOrb(orbType, onSuccess, onFail){
    // onSuccess callback check
    if(typeof onSuccess != "function") throw(title + noCallback);

    // only 1 search at a time
    if(orbType.isSearching){
        if(onFail) onFail(alreadyActive);
        return;
    }
    orbType.isSearching = true;

    // create service once
    if(!locationService){
        locationService = GeoLocation.createLocationService();
        locationService.accuracy = GeoLocationAccuracy.Low;

        // continuous background search for heading
        locationService.onNorthAlignedOrientationUpdate.add(
            function(h){
                // needs to run from the start to prevent heading-inverting bug
                foundHeading = GeoLocation.getNorthAlignedHeading(h);
                foundHeadingTime = getTime(); // timestamp to check if data is recent enough
            }
        );
    }

    // cache for simultaneous search
    var foundPosition;

    // await lens start
    if(getTime() > initialWait){
        requestUserPosition();
    }else{
        const initialWaitEvent = script.createEvent("UpdateEvent");
        initialWaitEvent.bind(function(){
            if(getTime() > initialWait){
                script.removeEvent(initialWaitEvent);
                requestUserPosition();
            }
        })
    }

    function requestUserPosition(){
        function onPositionFound(p){
            foundPosition = p;

            function isReady(){
                if(foundHeading && checkTimeStamp(foundHeadingTime, headingLifetime) && !checkTilt()) return true;
            }

            if(isReady()){
                interpretTrackingData();
            }else{
                const awaitingHeading = script.createEvent("UpdateEvent");
                awaitingHeading.bind(function(){
                    if(isReady()){
                        script.removeEvent(awaitingHeading);
                        interpretTrackingData();
                    }
                });
            }
        }

        // only do GPS location request once per session, as location will not change significantly anyways
        if(foundPosition){
            onPositionFound(foundPosition);
        }else{
            // request latest GPS location (first in session can take a little longer)
            locationService.getCurrentPosition(
                onPositionFound, 
                function(err){
                    if(onFail) onFail(err);
                }
            );
        }
    }

    // once all data is ready, do sun calculation
    function interpretTrackingData(){
        // new searches can be started from now on
        orbType.isSearching = false;

        // working copy
        var heading = foundHeading;

        // swap when on front cam
        if(frontCameraFlip) heading *= -1;
        if(specs && flipHeadingOnSpectacles) heading += 180;

        // tilt offset
        if(tilt){
            const tiltOffset = remap(tilt, -uprightThreshold, uprightThreshold, (-tiltHeadingOffset/2) * uprightThreshold, (tiltHeadingOffset/2) * uprightThreshold);
            heading -= tiltOffset;
        }

        // get orb position at current lat, long, date
        const date = new Date();
        const lat = foundPosition.latitude;
        const long = foundPosition.longitude;
        const alt = foundPosition.altitude;
        const orbSkyLocation = orbType.getPosition(date, lat, long);
        const azimuth = orbSkyLocation.azimuth;
        const altitude = orbSkyLocation.altitude;
        const distance = orbSkyLocation.distance;
        const localDir = orbDirection( frontCameraFlip?180-azimuth:azimuth, altitude); // create local vector (reverse on front cam)
        const deviceVec = rotateY(localDir, -heading); // compensate for heading

        // convert local to world
        const fwd = tracking.getTransform().forward;
        const fwdAngle = Math.atan2(fwd.x, fwd.z);
        const userFwdRot = quat.angleAxis(fwdAngle, vec3.up()); // user rotation around y (flattened)
        const direction = userFwdRot.multiplyVec3(deviceVec); // world space vector from user's position to orb
        const directionalRot = quat.lookAt(direction, vec3.up()); // the rotation a directional light should have to mimic orb origin
        const worldPosition = direction.uniformScale(distance); // world space position
        
        // callback
        const info = {directionalRot, direction, azimuth, altitude, distance, position:worldPosition, userHeading:heading, userLatitude:lat, userLongitude:long, horizontalAccuracy:foundPosition.horizontalAccuracy, verticalAccuracy:foundPosition.verticalAccuracy, userAltitude:alt, date, name:orbType.name};
        onSuccess(info);
    }
}



// sun: get azimuth and altitude (degrees) based on date, lat, long
function getSunPosition(date, latitude, longitude){
    const earthTiltRad = degToRad(23.44);
    const AU_IN_CM = 1.495978707e13; // 1 AU = ~1.496 * 10^13 cm

    // solar mean anomaly
    function getSolarMeanAnomaly(d){
        return degToRad(357.5291 + 0.98560028 * d);
    }

    // equation of center
    function getEquationOfCenter(M){
        return degToRad(1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    }

    // ecliptic longitude
    function getEclipticLongitude(M, C){
        return M + C + degToRad(102.9372) + Math.PI;
    }

    // declination
    function getDeclination(L){
        return Math.asin(Math.sin(L) * Math.sin(earthTiltRad));
    }

    // right ascension
    function getRightAscension(L){
        return Math.atan2(Math.sin(L) * Math.cos(earthTiltRad), Math.cos(L));
    }

    // hour angle
    function getHourAngle(siderealTime, rightAscension){
        return siderealTime - rightAscension;
    }

    // distance in AU
    function getSunDistanceAU(M, C){
        return 1.00014 - 0.01671 * Math.cos(M) - 0.00014 * Math.cos(2 * M + C);
    }

    const d = toDays(date);
    const lw = degToRad(-longitude);
    const phi = degToRad(latitude);
    const M = getSolarMeanAnomaly(d);
    const C = getEquationOfCenter(M);
    const L = getEclipticLongitude(M, C);
    const dec = getDeclination(L);
    const ra = getRightAscension(L);
    const sidereal = getSiderealTime(d, lw);
    const H = getHourAngle(sidereal, ra);
    const distance = getSunDistanceAU(M, C);
    const { azimuth, altitude } = getAzAlt(H, phi, dec);

    return {
        azimuth: (radToDeg(azimuth) + 180) % 360,
        altitude: radToDeg(altitude),
        distance: distance * AU_IN_CM // AU -> cm
    };
}


// moon: get azimuth and altitude (degrees) based on date, lat, long
function getMoonPosition(date, latitude, longitude){
    function getMoonCoords(d){
        // mean longitude
        const L = degToRad(218.316 + 13.176396 * d);
        // mean anomaly
        const M = degToRad(134.963 + 13.064993 * d);
        // distance
        const dist = 385001 - 20905 * Math.cos(M);
        // ecliptic latitude
        const l = L + degToRad(6.289 * Math.sin(M));
        // ecliptic latitude (approx. always near 0)
        const b = degToRad(5.128 * Math.sin(degToRad(93.272 + 13.229350 * d)));

        const ra = Math.atan2(Math.sin(l) * Math.cos(degToRad(23.44)) - Math.tan(b) * Math.sin(degToRad(23.44)), Math.cos(l));
        const dec = Math.asin(Math.sin(b) * Math.cos(degToRad(23.44)) + Math.cos(b) * Math.sin(degToRad(23.44)) * Math.sin(l));

        return { ra, dec, dist };
    }

    const d = toDays(date);
    const lw = degToRad(-longitude);
    const phi = degToRad(latitude);
    const moon = getMoonCoords(d);
    const sidereal = getSiderealTime(d, lw);
    const H = sidereal - moon.ra;
    const { azimuth, altitude } = getAzAlt(H, phi, moon.dec);

    return {
        azimuth: (radToDeg(azimuth) + 180) % 360,
        altitude: radToDeg(altitude),
        distance: moon.dist * 100000 // km -> cm
    };
}



// helpers

    // improved worldToScreen function, this returns -1 to 1 values (compatible with screentransform anchors) and an 'isInFront' bool
    function worldToScreen(worldPosition){
        if(!cam) return;
        const invMat = tracking.getTransform().getInvertedWorldTransform();
        const zPos = invMat.multiplyPoint(worldPosition); // is positive when possibly in camera frustum (in front of camera)
        const isInFront = zPos.z < 0; // if screen space element cannot be visible currently because of camera angle
        var position = cam.worldSpaceToScreenSpace(worldPosition); // get (0-1, inversed y-axis) screen position
        position = new vec2((position.x - .5)*2, (1-position.y - .5)*2); // remap to (-1 - 1)
        return {position, isInFront};
    }

    // rotate vec around Y-axis by degree
    function rotateY(vec, degrees){
        let rad = degToRad(degrees);
        let cos = Math.cos(rad);
        let sin = Math.sin(rad);
        return new vec3(vec.x * cos - vec.z * sin, vec.y, vec.x * sin + vec.z * cos);
    }

    // convert azimuth and altitude to vec
    function orbDirection(azimuthDeg, altitudeDeg){
        let az = degToRad(azimuthDeg);
        let alt = degToRad(altitudeDeg);
        let x = Math.cos(alt) * Math.sin(az); // east-west
        let y = Math.sin(alt); // up-down
        let z = -Math.cos(alt) * Math.cos(az); // north-south
        return new vec3(x, y, z);
    }

    // check if a timestamp is over threshold
    function checkTimeStamp(t, threshold){
        return getTime()-t < threshold;
    }

    // returns the device tilt angle
    function checkTilt(){
        if(!awaitUpright) return;
        var fwd = tracking.getTransform().forward;
        var upNorm = tracking.getTransform().up;
        var worldUp = vec3.up();
        if(Math.abs(fwd.dot(worldUp)) > 0.99) worldUp = vec3.right();
        var refRight = fwd.cross(worldUp).normalize();
        var refUp = refRight.cross(fwd).normalize();
        var projectedUp = upNorm.sub(fwd.uniformScale(fwd.dot(upNorm))).normalize();
        var dot = refUp.dot(projectedUp);
        var det = refRight.dot(projectedUp);
        var offsetAngle = Math.atan2(det, dot);
        tilt = offsetAngle; // store to make compensation possible later
        if(Math.abs(offsetAngle) > uprightThreshold){
            return true;
        }
    }

    function remap(value, low1, high1, low2, high2){
        low2 = low2 == null ? 0 : low2;
        high2 = high2 == null ? 1 : high2;
        return low2 + (high2 - low2) * (value - low1) / (high1 - low1);
    }

    const dayMs = 1000 * 60 * 60 * 24;
    const J1970 = 2440588;
    const J2000 = 2451545;
    const DEG_TO_RAD = 0.01745329251; // ~ pi/180
    const RAD_TO_DEG = 57.2957795131; // ~ 180/pi
    function degToRad(deg){
        return deg * DEG_TO_RAD;
    }
    function radToDeg(rad){
        return rad * RAD_TO_DEG;
    }
    function toJulian(date){
        return date.getTime() / dayMs - 0.5 + J1970;
    }
    function toDays(date){
        return toJulian(date) - J2000;
    }
    function getSiderealTime(d, lw){
        return degToRad(280.16 + 360.9856235 * d) - lw;
    }
    function getAzAlt(H, phi, dec){
        const altitude = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
        const azimuth = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
        return { azimuth, altitude };
    }
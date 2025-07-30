// Max van Leeuwen
//  maxvanleeuwen.com

// The moon's image (from Voyage Dans La Lune, 1902) is in the Public Domain.



//@input SceneObject infoText
//@input Component.Camera cam
//@input SceneObject moon
//@input Component.LightSource directionalLight



// show the info text in front of the camera
if(script.infoText){
    script.infoText.setParent(script.cam.getSceneObject());
    script.infoText.getTransform().setLocalPosition(new vec3(0, 0, -30));
}



// get moon data (once)
var moonData;
SunMoonTracker.getMoon(function(info){
    moonData = info;
}, function(err){ print(err); }); // print any errors


// get sun data (once)
var sunData;
SunMoonTracker.getSun(function(info){
    sunData = info;
    if(info.altitude > 0) script.directionalLight.getTransform().setWorldRotation(info.directionalRot); // if the sun is above the horizon, rotate the directional light to align
}, function(err){ print(err); }); // print any errors




// on each frame
script.createEvent("UpdateEvent").bind(function(){
    if(sunData){
        // print the current screen position of the sun
        const sunScreenPos = SunMoonTracker.worldToScreen(sunData.position);
        const inFrontText = sunScreenPos.isInFront ? " (in front of camera) \t" : " (behind the camera) \t";
        print("Sun position" + inFrontText + sunScreenPos.position.toString());
    }

    // hide moon if no tracking data yet
    script.moon.enabled = !!moonData;
    
    if(moonData){
        // re-calculate an optimal position for the moon, to make it appear as if the moon is infinitely far away without it getting clipped by render distance
        const userPosition = script.cam.getTransform().getWorldPosition();      // get the user's position
        const dir = moonData.position.sub(userPosition).normalize();            // normalized direction from user to moon
    
        // dynamically scale the moon depending on how far away it will be placed
        const moonScale = 100 * (script.cam.far/1000);                                  // moon scale=100 at camera far=1000. adapt to any render distance
        script.moon.getTransform().setWorldScale( vec3.one().uniformScale(moonScale) ); // apply scale
    
        // set moon position
        const moonOffset = dir.uniformScale(script.cam.far - moonScale);        // relative position for moon, at render distance minus margin
        const moonPosition = userPosition.add(moonOffset);                      // offset from user
        script.moon.getTransform().setWorldPosition(moonPosition);              // set moon position
    }
});
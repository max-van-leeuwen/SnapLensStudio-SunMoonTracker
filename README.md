# Sun Moon Tracker 🌞🌙

Snap AR tool: Get the sun and moon position in the sky! Using GPS, heading, and time of day.

<br>

![Sun Moon Tracker Preview](https://github.com/max-van-leeuwen/SnapLensStudio-SunMoonTracker/blob/main/Media/preview.gif)

Try the lens [here](https://www.snapchat.com/unlock/?type=SNAPCODE&uuid=1b41e32b7e884d6884b2f826df591894&metadata=01)!

<br>
<br>

---

## Tips

* These functions expose sensitive user data. They may not always be accessible when combined with other features (like Leaderboards, as this requires Network APIs).
* On the **front camera**, use Tracking Mode 'Rotation'.
* On the **back camera**, Tracking Mode 'World' works out of the box. If you are using Tracking Mode 'Surface', make sure to call `getSun()` / `getMoon()` on each "WorldTrackingResetEvent" event!

---

## Usage

* `SunMoonTracker.getSun( onSuccess, onFail (optional) )`
* `SunMoonTracker.getMoon( onSuccess, onFail (optional) )`

- `onSuccess`/`onFail` callbacks contain an `info` object.

    ### `onSuccess(info)`

    `info` contains the following data:

    * `directionalRot`: Rotation to apply to a directional light to match the celestial body's origin (quaternion).
    * `direction`: Vector from the user to the celestial body (normalized `vec3`), scale to get position in sky.
    * `azimuth`: Celestial body compass angle (degrees), where 0 = true north and 90 = east (clockwise).
    * `altitude`: Celestial body angle above horizon (degrees), where 0 = on horizon, 90 = directly overhead, and <0 = below horizon.
    * `distance`: Distance to the celestial body (cm).
    * `position`: World position of the celestial body. This is extremely far away (but can be converted to screen space or used for interpolation).
    * `userHeading`: User compass angle (degrees), where 0 = true north and 90 = east (clockwise).
    * `userLatitude`: User latitude.
    * `horizontalAccuracy`: Horizontal accuracy (m).
    * `verticalAccuracy`: Vertical accuracy (m).
    * `userLongitude`: User longitude.
    * `userAltitude`: User altitude.
    * `date`: Measurement time.
    * `name`: Celestial body name.

    ### `onFail(err)` (optional)

    `'err'` is a string describing the error.

---

## Helpers

### `SunMoonTracker.worldToScreen( worldPosition (vec3) )`

Returns a `ScreenSpaceInfo` object.

#### `ScreenSpaceInfo`

The object contains the following data:

* `position`: `vec2` screen space (-1 to 1).
* `isInFront`: `bool`, `true` when this screen space position is in front of the camera. Useful for hiding the visual when it's behind the camera.

---

## Examples

### Match a directional light's orientation with the angle of the sun to align the shadows in your scene

```javascript
SunMoonTracker.getSun(function(info){
    // only set the directional light's rotation if the sun is above the horizon
    if(info.altitude > 0) script.light.getTransform().setWorldRotation(info.directionalRot);
});
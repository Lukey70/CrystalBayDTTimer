# Drive Thru Timer Website

This is the latest static GitHub Pages-ready version of the drive thru timer website.

## Included in this version

- Two separate lanes running up the right side of the map.
- Visual map layout matching the requested reference direction.
- Cars spawn two spaces before the speaker in Lane 1 or Lane 2.
- Cars move one space per second anywhere in the drive thru when the space ahead is clear.
- Order, Cash and Present only release when their button is pressed.
- If a station button is pressed while blocked, the car waits there and that section timer keeps counting until the car actually leaves.
- Lane 1 path after order: Order 1 -> 1 gap to Cash -> Cash.
- Lane 2 path after order: Order 2 -> 2 gap to Cash -> 1 gap to Cash -> Cash.
- One gap between Cash and Present.
- Cars leaving Present count as completed.
- The left-side averages and percentages update using completed cars only.
- Percentages are coloured as requested:
  - 75% to 100% = green
  - 50% to under 75% = yellow
  - under 50% = red
- Total target is 1:00.
- Every section target is 0:30.
- Car colours:
  - under 1:00 total = green
  - at 1:00 total = yellow
  - at 1:30 total = red
- Entry and threshold sound files are included in `assets/`.
- Enable Sounds / Test Sound button added to help with browser audio restrictions.

## Files

- `index.html`
- `styles.css`
- `app.js`
- `simulation.mjs`
- `tests.mjs`
- `assets/`

## Keyboard shortcuts

- `1` = Add Car Lane 1
- `2` = Add Car Lane 2
- `Q` = Order 1 complete
- `W` = Order 2 complete
- `C` = Cash complete
- `P` = Present complete

## Publish on GitHub Pages

1. Create a GitHub repository.
2. Upload everything in this folder.
3. Go to **Settings -> Pages**.
4. Choose **Deploy from a branch**.
5. Select the `main` branch and `/root`.
6. Save.

## Tests run before packaging

- JavaScript syntax check for `simulation.mjs`
- JavaScript syntax check for `app.js`
- Full simulation logic tests in `tests.mjs`


## Asset display fix

This build embeds the car sprite images directly into `app.js` as data URLs. That means the cars still display even if the browser has trouble resolving `assets/car_green.png`, `assets/car_yellow.png`, or `assets/car_red.png`.


## Sound playback fix

This version embeds the audio files directly into `app.js` and uses the Web Audio API instead of relying on `<audio>` file paths. Sounds are on by default, but browser rules still require one user click before playback. Press **Enable Sounds** or **Test All Sounds** once after opening the page.


## Additional changes in this version

- Smoothed the lane merge so it appears as a continuous connected drive-thru road.
- Removed visible gap labels while keeping the same spacing and movement logic.
- Changed the blue map background to a solid colour with no square grid.
- Added Fullscreen Mode showing the results on the left and the drive-thru map on the right.
- Changed the board heading to `Car Count` and added a completed car counter.
- Kept the embedded image and audio fixes so the car assets and sounds work more reliably.


## Latest requested changes in this version

- Present target changed to 1:00.
- Total-time colour and sound thresholds changed to yellow at 1:30 and red at 2:00.
- The live total-time display now uses the same colour as the car status.
- Lane merge artwork refined to look smoother with less overlap.
- Labels moved outside the lanes.
- Car positions adjusted to sit in the middle of the lanes, with Lane 2 merge cars angled to match the curve.
- Fullscreen map positions improved by using a responsive aspect-ratio layout.
- Cars now advance one space at a time with a one-second stagger after a completed car leaves the drive thru.
- Reset Day now resets the simulator immediately without relying on a page reload.


## Latest compact-map fixes

- Compressed the physical spacing of the drive-thru map while keeping the same logical spaces and movement rules.
- Repositioned cars so they remain centred in the adjusted lanes.
- Corrected the Lane 2 merge car to angle left into the shared lane.
- Repositioned labels so Order 1 sits to the left of the Order 1 car, Order 2 sits to the right of the Order 2 car, and Cash/Present sit underneath their cars.
- Added ready-to-move tick indicators for Order 1, Order 2, and Cash after their buttons are pressed.


## Latest lane-position fixes

- Extended the visual entry lane so spawned cars sit fully inside the lane and are not touching each other.
- Extended the present/end lane so the car at Present sits inside the lane more cleanly.
- Re-centred the Lane 2 merge car on the curve while keeping it angled left into the shared lane.
- Moved Order 1 and Order 2 labels closer to the drive-thru, but still outside the lane.
- Moved the live Cars in Lane / Total Time panel left so it sits outside the drive-thru lane.


## Latest timing and lane-centering updates

- Total target time changed to 1:30.
- Live Total Time and the Total result on the left now use green under 1:30, yellow from 1:30 up to under 2:00, and red at 2:00 and over.
- Left-side average colours now use: Order 1 / Order 2 / Cash = green under 0:30, yellow 0:30-0:45, red over 0:45; Present = green under 1:00, yellow 1:00-1:30, red over 1:30.
- Extended the visual entrance slightly more so spawned cars sit fully inside the lane.
- Fine-tuned the Lane 2 merge-turn car position again so it sits more centrally between the lane edges while turning.

- Extended the visual entry lane a touch further again and moved the spawn centres so cars start fully inside the lane.
- Extended the present lane a touch further again so the present car sits fully inside the lane.
- Fine-tuned the Lane 2 merge-turn car again to sit closer to the centre of the curved lane.


## New store layout on original Bloxburg design

- Keeps the original blue Bloxburg visual design, controls, results board, sounds, and car assets.
- Lane 1 is the left vertical lane and Lane 2 is the right vertical lane.
- Each lane has one pre-order space.
- Lane 1 has one post-order space before the merge.
- Lane 2 has one forward diagonal merge space before entering the shared vertical space.
- The shared section has one vertical space after the merge, then one horizontal space before Cash, then Cash, then one horizontal space before Present.


## Immediate layout fixes
- Lanes have been widened much more visibly using a larger road stroke.
- Car sprite sizing has been lightly reduced so cars fit comfortably inside the widened lanes.
- Order 1 and Order 2 labels have been moved further right.
- Cash and Present labels have been moved clearly underneath the top drive-thru lane.

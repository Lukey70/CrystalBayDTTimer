# Crystal Bay Drive Thru Timer

Static, GitHub Pages-ready timer with the original blue theme, embedded car images and sounds, results board, keyboard controls and fullscreen display.

## Layout

The map follows the Crystal Bay reference: two entry lanes on the right, a diagonal merge from Order 2, and a top road travelling left through Cash and Present to Window 3 (the Cafe position in the reference). Cars are centred on wider lanes, with station labels outside the road. The existing queue spaces and one-second movement rules are retained. Each ordering lane has a full entry space before its speaker.

## Window 3 waiting

- **Send to Window 3** moves the car at Present to the waiting window on the next movement tick.
- Its Order, Cash, Present and Total results are recorded once, when it leaves Present.
- The car remains visible at Window 3 with a separate clock starting at **0:00** on arrival.
- Both the waiting car and its clock are green below **1:30**, yellow from **1:30** to **1:59**, and red from **2:00** onwards. These changes are visual only.
- **Window 3 Complete** removes the waiting car without recording another result.
- Waiting time never contributes to service averages, target percentages, completed-car results, or the live longest service time. The car at Window 3 is excluded from Cars in Lane.
- Window 3 holds one car. If occupied, sending another car there is disabled; other cars can still leave Present normally.
- Waiting cars, clocks, pending transfers and recorded results survive a page reload. Reset Day clears the whole day, including Window 3.

## Controls

| Key | Action |
| --- | --- |
| 1 / 2 | Add a car to Lane 1 / Lane 2 |
| Q / W | Complete Order 1 / Order 2 |
| C | Complete Cash |
| P | Complete Present and exit normally |
| H | Send the car at Present to Window 3 |
| R | Complete Window 3 |
| F | Toggle fullscreen |

Order and Cash releases wait until the next space is free; their clocks continue until the car actually moves. Total time starts on departure from the ordering speaker and stops on departure from Present.

## Targets

| Result | Target |
| --- | --- |
| Order 1 / Order 2 / Cash | 0:30 |
| Present | 1:00 |
| Total | 1:30 |

Normal car colours and total-time sounds use yellow at 1:30 and red at 2:00. Audio starts after the first interaction, subject to browser audio permissions. Use Enable Sounds or Test All Sounds if needed.

## Run and verify

Open `index.html`, or serve this directory with a static HTTP server. For GitHub Pages, deploy the root of `main`.

```sh
node --check app.js
node --check simulation.mjs
node tests.mjs
```

The test suite covers both entry lanes, queue movement, merge priority, blocked stations, completion statistics, normal thresholds, Window 3 colour boundaries, result isolation, occupied-window handling, normal exits while Window 3 is occupied, reloads, resets, and parity between the browser and tested simulation engine.

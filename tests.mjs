import assert from 'node:assert/strict';
import { DriveThruSimulator, computeScoreboard, TARGETS } from './simulation.mjs';

function runTicks(sim, seconds) {
  for (let i = 0; i < seconds; i += 1) sim.tick(1);
}

function testTargetsUpdated() {
  assert.equal(TARGETS.present, 60, 'Present target should be 60 seconds');
  assert.equal(TARGETS.total, 90, 'Total target should be 90 seconds');
}

function testOnlyOneSpaceBeforeOrder() {
  const sim = new DriveThruSimulator();
  let result = sim.addCar(1);
  assert.equal(result.ok, true);
  assert.equal(sim.carAt('lane1_pre1')?.lane, 1, 'Lane 1 should spawn in the single pre-order space');
  result = sim.addCar(1);
  assert.equal(result.ok, false, 'Lane 1 should not have a second pre-order spawn space');
  sim.tick(1);
  assert.equal(sim.carAt('order1')?.lane, 1, 'Lane 1 car should reach Order 1 after one second');

  const sim2 = new DriveThruSimulator();
  result = sim2.addCar(2);
  assert.equal(result.ok, true);
  assert.equal(sim2.carAt('lane2_pre1')?.lane, 2, 'Lane 2 should spawn in the single pre-order space');
  result = sim2.addCar(2);
  assert.equal(result.ok, false, 'Lane 2 should not have a second pre-order spawn space');
  sim2.tick(1);
  assert.equal(sim2.carAt('order2')?.lane, 2, 'Lane 2 car should reach Order 2 after one second');
}

function testTotalStartsAfterOrderLeaves() {
  const sim = new DriveThruSimulator();
  sim.addCar(1);
  sim.tick(1);
  assert.equal(sim.carAt('order1')?.totalStartedAt, null);
  runTicks(sim, 3);
  sim.releaseStation('order1');
  sim.tick(1);
  const car = sim.carAt('gap_shared_low');
  assert.ok(car, 'Released Order 1 car should move to the shared vertical lane');
  assert.equal(car.totalStartedAt, sim.now, 'Total should start when the car physically leaves order');
}

function testLane2DiagonalMergePath() {
  const sim = new DriveThruSimulator();
  sim.addCar(2);
  sim.tick(1);
  assert.equal(sim.carAt('order2')?.lane, 2);
  sim.releaseStation('order2');
  sim.tick(1);
  assert.equal(sim.carAt('gap_cash2')?.lane, 2, 'Lane 2 should first move to the diagonal merge space');
  sim.tick(1);
  assert.equal(sim.carAt('gap_shared_low')?.lane, 2, 'Lane 2 should then enter the shared vertical lane');
}

function testLane1SharedPathToCashAndPresent() {
  const sim = new DriveThruSimulator();
  sim.addCar(1);
  sim.tick(1);
  sim.releaseStation('order1');
  sim.tick(1); // shared low
  sim.tick(1); // shared high
  sim.tick(1); // cash entry on top lane
  sim.tick(1); // cash
  assert.equal(sim.carAt('cash')?.lane, 1, 'Lane 1 should reach Cash through the shared vertical lane');
  sim.releaseStation('cash');
  sim.tick(1); // gap present
  sim.tick(1); // present
  assert.equal(sim.carAt('present')?.lane, 1, 'Car should reach Present after Cash and one top-lane space');
}

function testBlockedOrderTimerContinues() {
  const sim = new DriveThruSimulator();

  // Block the shared path so the released Order 1 car cannot leave.
  const blocker = (id, position) => ({
    id,
    lane: 1,
    position,
    positionEnteredAt: 0,
    totalStartedAt: 0,
    orderReleaseAt: 0,
    releaseRequested: false,
    thresholds: { yellow: false, red: false },
    timings: { order1: null, order2: null, cash: null, present: null, total: null },
    completedAt: null,
  });
  sim.activeCars = [
    blocker(97, 'cash'),
    blocker(98, 'gap_cash_entry'),
    blocker(99, 'gap_shared_high'),
    blocker(100, 'gap_shared_low'),
  ];

  sim.addCar(1);
  sim.tick(1);
  const waiting = sim.carAt('order1');
  sim.releaseStation('order1');
  const enteredAt = waiting.positionEnteredAt;
  runTicks(sim, 4);
  assert.equal(sim.carAt('order1')?.id, waiting.id, 'Order car should remain blocked at Order 1');
  assert.equal(sim.now - enteredAt >= 4, true, 'Order timer should keep counting while blocked');
}

function testMergePriorityByFirstCompletedOrder() {
  const sim = new DriveThruSimulator();
  const baseCar = (id, lane, position, orderReleaseAt) => ({
    id,
    lane,
    position,
    positionEnteredAt: 0,
    totalStartedAt: 0,
    orderReleaseAt,
    releaseRequested: position === 'order1' || position === 'gap_cash2',
    thresholds: { yellow: false, red: false },
    timings: { order1: null, order2: null, cash: null, present: null, total: null },
    completedAt: null,
  });

  sim.activeCars = [
    baseCar(1, 2, 'gap_cash2', 5),
    baseCar(2, 1, 'order1', 7),
  ];
  sim.tick(1);
  assert.equal(sim.carAt('gap_shared_low')?.id, 1, 'Earlier completed Lane 2 order should merge first');
  assert.equal(sim.carAt('order1')?.id, 2, 'Later completed Order 1 car should wait');
}

function testSequentialAdvanceAfterCompletion() {
  const sim = new DriveThruSimulator();
  const baseCar = (id, lane, position, releaseRequested = false) => ({
    id,
    lane,
    position,
    positionEnteredAt: 0,
    totalStartedAt: 0,
    orderReleaseAt: 0,
    releaseRequested,
    thresholds: { yellow: false, red: false },
    timings: { order1: null, order2: null, cash: null, present: null, total: null },
    completedAt: null,
  });

  sim.activeCars = [
    baseCar(1, 1, 'present', true),
    baseCar(2, 1, 'gap_present1', false),
    baseCar(3, 1, 'cash', true),
  ];

  sim.tick(1);
  assert.equal(sim.completedCars.length, 1, 'First car should leave the drive thru');
  assert.equal(sim.carAt('gap_present1')?.id, 2, 'Next car should wait until the next second');
  assert.equal(sim.carAt('cash')?.id, 3, 'Following car should also wait');

  sim.tick(1);
  assert.equal(sim.carAt('present')?.id, 2, 'One second later the next car moves forward');
  assert.equal(sim.carAt('cash')?.id, 3, 'Following car waits one more second');

  sim.tick(1);
  assert.equal(sim.carAt('gap_present1')?.id, 3, 'Another second later the following car moves forward');
}

function testCompletedCarsOnlyAffectAverages() {
  const sim = new DriveThruSimulator();
  sim.addCar(1);
  sim.tick(1);
  runTicks(sim, 10);
  sim.releaseStation('order1');
  runTicks(sim, 4); // to cash
  runTicks(sim, 8);
  sim.releaseStation('cash');
  runTicks(sim, 2); // to present
  runTicks(sim, 12);
  sim.releaseStation('present');
  sim.tick(1);

  assert.equal(sim.completedCars.length, 1);
  const completed = sim.completedCars[0];
  sim.addCar(1);
  const scoreboard = computeScoreboard(sim.completedCars);
  assert.equal(scoreboard.order1.avg, completed.timings.order1);
  assert.equal(scoreboard.total.avg, completed.timings.total);
  assert.equal(scoreboard.total.pct, completed.timings.total <= 90 ? 100 : 0);
}

function testThresholdEvents() {
  const sim = new DriveThruSimulator();
  sim.addCar(1);
  sim.tick(1);
  sim.releaseStation('order1');
  sim.tick(1); // total starts
  let sawYellow = false;
  let sawRed = false;
  for (let i = 0; i < 125; i += 1) {
    const events = sim.tick(1);
    if (events.some((event) => event.type === 'yellow-threshold')) sawYellow = true;
    if (events.some((event) => event.type === 'red-threshold')) sawRed = true;
  }
  assert.equal(sawYellow, true, 'Yellow threshold should trigger at 1:30 total');
  assert.equal(sawRed, true, 'Red threshold should trigger at 2:00 total');
}

function testResetMethod() {
  const sim = new DriveThruSimulator();
  sim.addCar(1);
  sim.tick(1);
  sim.reset();
  assert.equal(sim.activeCars.length, 0);
  assert.equal(sim.completedCars.length, 0);
  assert.equal(sim.now, 0);
  assert.equal(sim.nextCarId, 1);
}

function runAll() {
  testTargetsUpdated();
  testOnlyOneSpaceBeforeOrder();
  testTotalStartsAfterOrderLeaves();
  testLane2DiagonalMergePath();
  testLane1SharedPathToCashAndPresent();
  testBlockedOrderTimerContinues();
  testMergePriorityByFirstCompletedOrder();
  testSequentialAdvanceAfterCompletion();
  testCompletedCarsOnlyAffectAverages();
  testThresholdEvents();
  testResetMethod();
  console.log('All simulation tests passed.');
}

runAll();

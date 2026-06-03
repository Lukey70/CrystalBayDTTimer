import assert from 'node:assert/strict';
import { DriveThruSimulator, computeScoreboard, TARGETS } from './simulation.mjs';

function runTicks(sim, seconds) {
  for (let i = 0; i < seconds; i += 1) sim.tick(1);
}

function moveLane1CarToOrder(sim) {
  sim.addCar(1);
  runTicks(sim, 2);
  assert.equal(sim.carAt('order1')?.lane, 1, 'Lane 1 car should reach order1 after 2 seconds');
}

function completeSingleLane1Car(sim, opts = {}) {
  moveLane1CarToOrder(sim);
  runTicks(sim, opts.orderTime ?? 5);
  sim.releaseStation('order1');
  sim.tick(1); // order1 -> gap_cash1, total starts here
  sim.tick(1); // gap_cash1 -> cash
  assert.equal(sim.carAt('cash')?.lane, 1, 'Lane 1 car should reach cash after one extra second');
  runTicks(sim, opts.cashTime ?? 5);
  sim.releaseStation('cash');
  sim.tick(1); // cash -> gap_present1
  sim.tick(1); // gap_present1 -> present
  assert.equal(sim.carAt('present')?.lane, 1, 'Car should reach present after one extra second');
  runTicks(sim, opts.presentTime ?? 5);
  sim.releaseStation('present');
  sim.tick(1);
  assert.equal(sim.completedCars.length, 1, 'Car should complete after leaving present');
  return sim.completedCars[0];
}

function testTargetsUpdated() {
  assert.equal(TARGETS.present, 60, 'Present target should be 60 seconds');
  assert.equal(TARGETS.total, 90, 'Total target should be 90 seconds');
}

function testSpawnAndMovement() {
  const sim = new DriveThruSimulator();
  sim.addCar(1);
  assert.equal(sim.carAt('lane1_pre2')?.lane, 1);
  sim.tick(1);
  assert.equal(sim.carAt('lane1_pre1')?.lane, 1, 'Car should move one space per second');
  sim.tick(1);
  assert.equal(sim.carAt('order1')?.lane, 1, 'Car should reach order after second move');
  assert.equal(sim.carAt('order1').totalStartedAt, null, 'Total must not start while at order');
}

function testTotalStartsAfterOrderLeaves() {
  const sim = new DriveThruSimulator();
  moveLane1CarToOrder(sim);
  runTicks(sim, 3);
  sim.releaseStation('order1');
  sim.tick(1);
  const car = sim.carAt('gap_cash1');
  assert.ok(car, 'Released order car should move into shared gap');
  assert.equal(car.totalStartedAt, sim.now, 'Total should start when the car physically leaves order');
}

function testBlockedOrderTimerContinues() {
  const sim = new DriveThruSimulator();
  moveLane1CarToOrder(sim);
  sim.releaseStation('order1');
  sim.tick(1); // gap_cash1
  sim.tick(1); // cash
  assert.equal(sim.carAt('cash')?.lane, 1, 'Car A should be sitting at cash');

  sim.addCar(2);
  runTicks(sim, 2);
  sim.releaseStation('order2');
  sim.tick(1); // gap_cash2
  sim.tick(1); // gap_cash1
  assert.equal(sim.carAt('gap_cash1')?.lane, 2, 'Car B should be sitting at the shared 1-gap-to-cash');

  sim.addCar(1);
  runTicks(sim, 2);
  const third = sim.carAt('order1');
  runTicks(sim, 2);
  sim.releaseStation('order1');
  const enteredAt = third.positionEnteredAt;
  sim.tick(1);
  assert.equal(sim.carAt('order1')?.id, third.id, 'Blocked order car should stay at order');
  runTicks(sim, 3);
  assert.equal(sim.now - enteredAt >= 5, true, 'Order timer should continue while the car waits');

  sim.releaseStation('cash');
  sim.tick(1); // cash leaves to gap_present1
  sim.tick(1); // gap_cash1 goes to cash
  sim.tick(1); // waiting order car can finally move to gap_cash1
  const moved = sim.activeCars.find((car) => car.id === third.id);
  assert.notEqual(moved?.position, 'order1', 'Order car should move once the path clears');
  assert.ok(moved.totalStartedAt != null, 'Total should start when it actually moves out of order');
  assert.ok(moved.totalStartedAt > enteredAt, 'Total start time should be later than the time it entered order');
}

function testLane2HasTwoGapsToCash() {
  const sim = new DriveThruSimulator();
  sim.addCar(2);
  runTicks(sim, 2);
  assert.equal(sim.carAt('order2')?.lane, 2);
  sim.releaseStation('order2');
  sim.tick(1);
  assert.equal(sim.carAt('gap_cash2')?.lane, 2, 'Lane 2 should first move to 2-gap-to-cash');
  sim.tick(1);
  assert.equal(sim.carAt('gap_cash1')?.lane, 2, 'Lane 2 should then move to 1-gap-to-cash');
  sim.tick(1);
  assert.equal(sim.carAt('cash')?.lane, 2, 'Lane 2 should then reach cash');
}

function testMergePriorityByFirstCompletedOrder() {
  const sim = new DriveThruSimulator();
  moveLane1CarToOrder(sim);
  sim.releaseStation('order1');
  sim.tick(1); // gap_cash1
  sim.tick(1); // cash
  assert.equal(sim.carAt('cash')?.lane, 1);

  sim.addCar(1);
  runTicks(sim, 2);
  sim.releaseStation('order1');
  sim.tick(1); // gap_cash1
  assert.equal(sim.carAt('gap_cash1')?.lane, 1);

  sim.addCar(2);
  runTicks(sim, 2);
  sim.releaseStation('order2');
  sim.tick(1); // gap_cash2
  const lane2Car = sim.carAt('gap_cash2');
  assert.equal(lane2Car?.lane, 2);

  sim.addCar(1);
  runTicks(sim, 2);
  sim.releaseStation('order1');
  const lane1Waiting = sim.carAt('order1');
  assert.equal(lane1Waiting?.lane, 1);

  sim.releaseStation('cash');
  sim.tick(1); // cash -> gap_present1
  sim.tick(1); // existing gap_cash1 car -> cash
  sim.tick(1); // shared gap now free, earlier lane2 completed order should take it
  assert.equal(sim.carAt('gap_cash1')?.id, lane2Car.id, 'Earlier completed order should take the shared 1-gap-to-cash first');
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
    baseCar(3, 2, 'cash', true),
  ];
  sim.nextCarId = 4;

  sim.tick(1);
  assert.equal(sim.completedCars.length, 1, 'First car should leave the drive thru');
  assert.equal(sim.carAt('gap_present1')?.id, 2, 'Immediately after completion, the next car should still wait in the same space');
  assert.equal(sim.carAt('cash')?.id, 3, 'The following car should still wait in cash on the completion tick');

  sim.tick(1);
  assert.equal(sim.carAt('present')?.id, 2, 'One second later the next car should move up one space');
  assert.equal(sim.carAt('cash')?.id, 3, 'The following car should still wait one more second');

  sim.tick(1);
  assert.equal(sim.carAt('gap_present1')?.id, 3, 'Another second later the following car should move up one space');
}

function testCompletedCarsOnlyAffectAverages() {
  const sim = new DriveThruSimulator();
  const completed = completeSingleLane1Car(sim, { orderTime: 10, cashTime: 8, presentTime: 12 });
  sim.addCar(1);
  runTicks(sim, 2);
  const scoreboard = computeScoreboard(sim.completedCars);
  assert.equal(scoreboard.order1.avg, completed.timings.order1);
  assert.equal(scoreboard.cash.avg, completed.timings.cash);
  assert.equal(scoreboard.total.avg, completed.timings.total);
  assert.equal(scoreboard.total.pct, completed.timings.total <= 90 ? 100 : 0, 'Total percentage should use the 90 second target');
  assert.equal(scoreboard.present.pct, completed.timings.present <= 60 ? 100 : 0, 'Present percentage should use the 60 second target');
}

function testThresholdEvents() {
  const sim = new DriveThruSimulator();
  moveLane1CarToOrder(sim);
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
  runTicks(sim, 2);
  sim.reset();
  assert.equal(sim.activeCars.length, 0);
  assert.equal(sim.completedCars.length, 0);
  assert.equal(sim.now, 0);
  assert.equal(sim.nextCarId, 1);
}

function runAll() {
  testTargetsUpdated();
  testSpawnAndMovement();
  testTotalStartsAfterOrderLeaves();
  testBlockedOrderTimerContinues();
  testLane2HasTwoGapsToCash();
  testMergePriorityByFirstCompletedOrder();
  testSequentialAdvanceAfterCompletion();
  testCompletedCarsOnlyAffectAverages();
  testThresholdEvents();
  testResetMethod();
  console.log('All simulation tests passed.');
}

runAll();

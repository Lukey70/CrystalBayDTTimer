import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DriveThruSimulator, computeScoreboard, TARGETS, waitingStatus, resultAverageClass } from './simulation.mjs';
function runTicks(sim, seconds) { for (let i = 0; i < seconds; i += 1) sim.tick(1); }

function testTargets() {
  assert.equal(TARGETS.present, 30);
  assert.equal(TARGETS.total, 90);
}

function testOnePreOrderSpaceEachLane() {
  const sim1 = new DriveThruSimulator();
  let result = sim1.addCar(1); assert.equal(result.ok, true); assert.equal(sim1.carAt('lane1_pre1')?.lane, 1); result = sim1.addCar(1); assert.equal(result.ok, false); sim1.tick(1); assert.equal(sim1.carAt('order1')?.lane, 1);
  const sim2 = new DriveThruSimulator();
  result = sim2.addCar(2); assert.equal(result.ok, true); assert.equal(sim2.carAt('lane2_pre1')?.lane, 2); result = sim2.addCar(2); assert.equal(result.ok, false); sim2.tick(1); assert.equal(sim2.carAt('order2')?.lane, 2);
}

function testLane1HasPostOrderSpaceBeforeMerge() {
  const sim = new DriveThruSimulator();
  sim.addCar(1); sim.tick(1); sim.releaseStation('order1'); sim.tick(1);
  const car = sim.carAt('lane1_post');
  assert.ok(car, 'Lane 1 car should move to its own post-order space first');
  assert.equal(car.totalStartedAt, sim.now, 'Total starts when leaving Order 1');
  sim.tick(1);
  assert.equal(sim.carAt('shared_vertical')?.id, car.id, 'Then it moves into the shared vertical space after merge');
}

function testLane2UsesForwardMergeSpace() {
  const sim = new DriveThruSimulator();
  sim.addCar(2); sim.tick(1); sim.releaseStation('order2'); sim.tick(1);
  assert.equal(sim.carAt('lane2_merge')?.lane, 2, 'Lane 2 should move to the diagonal merge space first');
  sim.tick(1);
  assert.equal(sim.carAt('shared_vertical')?.lane, 2, 'Then Lane 2 should move into the shared vertical space');
}

function testSharedSectionLength() {
  const sim = new DriveThruSimulator();
  sim.addCar(1); sim.tick(1); sim.releaseStation('order1');
  sim.tick(1); assert.equal(sim.carAt('lane1_post')?.lane, 1);
  sim.tick(1); assert.equal(sim.carAt('shared_vertical')?.lane, 1);
  sim.tick(1); assert.equal(sim.carAt('gap_cash_entry')?.lane, 1);
  sim.tick(1); assert.equal(sim.carAt('cash')?.lane, 1);
  sim.releaseStation('cash');
  sim.tick(1); assert.equal(sim.carAt('gap_present1')?.lane, 1);
  sim.tick(1); assert.equal(sim.carAt('present')?.lane, 1);
}

function testBlockedStationTimeContinues() {
  const sim = new DriveThruSimulator();
  const blocker = (id, position) => ({ id, lane: 1, position, positionEnteredAt: 0, totalStartedAt: 0, orderReleaseAt: 0, releaseRequested: false, thresholds: { yellow: false, red: false }, timings: { order1: null, order2: null, cash: null, present: null, total: null }, completedAt: null });
  sim.activeCars = [blocker(90,'lane1_post'), blocker(91,'cash'), blocker(92,'gap_cash_entry'), blocker(93,'shared_vertical')];
  sim.addCar(1); sim.tick(1); sim.releaseStation('order1'); runTicks(sim, 4);
  assert.equal(sim.carAt('order1')?.lane, 1, 'Order 1 should remain blocked while lane1_post is occupied down the line');
}

function testMergePriorityByFirstFinishedOrder() {
  const sim = new DriveThruSimulator();
  const baseCar = (id, lane, position, orderReleaseAt) => ({ id, lane, position, positionEnteredAt: 0, totalStartedAt: 0, orderReleaseAt, releaseRequested: false, thresholds: { yellow: false, red: false }, timings: { order1: null, order2: null, cash: null, present: null, total: null }, completedAt: null });
  sim.activeCars = [baseCar(1,2,'lane2_merge',5), baseCar(2,1,'lane1_post',7)];
  sim.tick(1); assert.equal(sim.carAt('shared_vertical')?.id, 1);
}

function testSequentialAdvanceAfterCompletion() {
  const sim = new DriveThruSimulator();
  const baseCar = (id, lane, position, releaseRequested = false) => ({ id, lane, position, positionEnteredAt: 0, totalStartedAt: 0, orderReleaseAt: 0, releaseRequested, thresholds: { yellow: false, red: false }, timings: { order1: null, order2: null, cash: null, present: null, total: null }, completedAt: null });
  sim.activeCars = [baseCar(1,1,'present',true), baseCar(2,1,'gap_present1'), baseCar(3,1,'cash',true)];
  sim.tick(1); assert.equal(sim.completedCars.length,1); assert.equal(sim.carAt('gap_present1')?.id,2); assert.equal(sim.carAt('cash')?.id,3);
  sim.tick(1); assert.equal(sim.carAt('present')?.id,2); assert.equal(sim.carAt('cash')?.id,3);
  sim.tick(1); assert.equal(sim.carAt('gap_present1')?.id,3);
}

function testCompletedCarsAffectAveragesOnly() {
  const sim = new DriveThruSimulator();
  sim.addCar(1); sim.tick(1); runTicks(sim, 3); sim.releaseStation('order1'); runTicks(sim, 4); runTicks(sim, 5); sim.releaseStation('cash'); runTicks(sim, 2); runTicks(sim, 6); sim.releaseStation('present'); sim.tick(1);
  assert.equal(sim.completedCars.length, 1); const completed = sim.completedCars[0]; sim.addCar(1); const scoreboard = computeScoreboard(sim.completedCars); assert.equal(scoreboard.order1.avg, completed.timings.order1); assert.equal(scoreboard.total.avg, completed.timings.total);
}

function testThresholdEvents() {
  const sim = new DriveThruSimulator(); sim.addCar(1); sim.tick(1); sim.releaseStation('order1'); sim.tick(1); let y=false, r=false; for (let i=0;i<125;i+=1){ const events=sim.tick(1); if(events.some(e=>e.type==='yellow-threshold')) y=true; if(events.some(e=>e.type==='red-threshold')) r=true; } assert.equal(y,true); assert.equal(r,true);
}

function testReset() { const sim = new DriveThruSimulator(); sim.addCar(1); sim.tick(1); sim.reset(); assert.equal(sim.activeCars.length,0); assert.equal(sim.completedCars.length,0); assert.equal(sim.now,0); }

function carAtPresent(sim, lane = 1) {
  sim.addCar(lane);
  sim.tick();
  sim.tick(7);
  sim.releaseStation(lane === 1 ? 'order1' : 'order2');
  sim.tick(4);
  sim.tick(8);
  sim.releaseStation('cash');
  sim.tick(2);
  sim.tick(10);
  return sim.carAt('present');
}

function testWindow3RecordsOnceAndExcludesWaiting() {
  const sim = new DriveThruSimulator();
  const car = carAtPresent(sim);
  assert.ok(car);
  assert.equal(sim.sendToWindow3().ok, true);
  assert.equal(sim.sendToWindow3().ok, false, 'Cannot send twice');
  assert.equal(sim.completedCars.length, 0, 'Result waits for actual departure from Present');
  let events = sim.tick();
  assert.equal(sim.carAt('present'), null);
  assert.equal(sim.carAt('window3'), null);
  assert.equal(sim.carAt('window3_transfer').id, car.id);
  const departedAt = sim.now;
  assert.equal(sim.getCarsInLaneCount(), 0);
  assert.equal(sim.getLongestCurrentTotal(), 0);
  sim.tick(2);
  assert.equal(sim.carAt('window3'), null, 'Hidden for the full first two seconds');
  const arrivalEvents = sim.tick();
  assert.equal(sim.now, departedAt + 3);
  assert.equal(sim.carAt('window3').id, car.id);
  assert.ok(arrivalEvents.some(e => e.type === 'waiting-arrived'));
  assert.equal(sim.completedCars.length, 1);
  assert.equal(events.filter(e => e.type === 'car-completed').length, 1);
  assert.equal(sim.stationElapsed(car), 0);
  assert.equal(waitingStatus(sim.stationElapsed(car)), 'green');
  assert.equal(sim.getCarsInLaneCount(), 0);
  assert.equal(sim.getLongestCurrentTotal(), 0, 'Window 3 does not inflate the service clock');
  const results = JSON.stringify(sim.completedCars);
  const scores = computeScoreboard(sim.completedCars);
  const total = sim.totalElapsed(car);
  sim.tick(89);
  assert.equal(waitingStatus(sim.stationElapsed(car)), 'green');
  events = sim.tick();
  assert.equal(waitingStatus(sim.stationElapsed(car)), 'yellow');
  assert.deepEqual(events, [], 'Waiting colour changes are visual only');
  sim.tick(29);
  assert.equal(waitingStatus(sim.stationElapsed(car)), 'yellow');
  sim.tick();
  assert.equal(waitingStatus(sim.stationElapsed(car)), 'red');
  sim.tick(300);
  assert.equal(sim.totalElapsed(car), total, 'Service total is frozen');
  assert.equal(JSON.stringify(sim.completedCars), results);
  assert.deepEqual(computeScoreboard(sim.completedCars), scores);
  sim.releaseStation('window3');
  events = sim.tick();
  assert.ok(events.some(e => e.type === 'waiting-completed'));
  assert.ok(!events.some(e => e.type === 'car-completed'));
  assert.equal(sim.activeCars.length, 0);
  assert.equal(JSON.stringify(sim.completedCars), results, 'No second result on waiting departure');
}

function departToWindow3(sim) {
  assert.equal(sim.sendToWindow3().ok, true);
  sim.tick();
}

function testOccupiedWindow3AndOtherCarsCanExit() {
  const sim = new DriveThruSimulator();
  const first = carAtPresent(sim); departToWindow3(sim); sim.tick(3);
  const second = carAtPresent(sim, 2); departToWindow3(sim); sim.tick(3);
  assert.equal(sim.carAt('window3').id, first.id);
  assert.equal(sim.carAt('window3_transfer').id, second.id);
  const third = carAtPresent(sim);
  sim.releaseStation('present'); sim.tick();
  assert.equal(sim.completedCars.length, 3, 'Normal exits bypass both occupied waiting spaces');
  assert.equal(sim.carAt('present'), null);
  assert.equal(sim.carAt('window3').id, first.id);
  assert.equal(sim.carAt('window3_transfer').id, second.id);
  assert.ok(sim.completedCars.some(car => car.id === third.id));
}

function testWindow3QueueAndOneSecondHandover() {
  const sim = new DriveThruSimulator();
  const first = carAtPresent(sim); departToWindow3(sim); sim.tick(3);
  const second = carAtPresent(sim, 2); departToWindow3(sim);
  const secondResult = JSON.stringify(sim.completedCars.find(car => car.id === second.id));
  const third = carAtPresent(sim);
  const presentStartedAt = third.positionEnteredAt;
  assert.equal(sim.sendToWindow3().ok, true, 'A third request queues at Present');
  assert.equal(sim.sendToWindow3().ok, false, 'Queued requests are not duplicated');
  sim.tick(10);
  assert.equal(sim.carAt('present').id, third.id);
  assert.equal(sim.carAt('window3_transfer').id, second.id);
  assert.equal(sim.completedCars.length, 2, 'Queued Present car has no result yet');
  assert.equal(sim.getCarsInLaneCount(), 1);
  assert.equal(JSON.stringify(sim.completedCars.find(car => car.id === second.id)), secondResult);
  sim.releaseStation('window3');
  let events = sim.tick();
  const firstLeftAt = sim.now;
  assert.equal(sim.carAt('window3'), null, 'No same-tick replacement');
  assert.equal(sim.carAt('window3_transfer').id, second.id);
  assert.equal(sim.carAt('present').id, third.id);
  assert.equal(events.filter(e => e.type === 'waiting-completed').length, 1);
  events = sim.tick();
  assert.equal(sim.now, firstLeftAt + 1);
  assert.equal(sim.carAt('window3').id, second.id);
  assert.equal(sim.stationElapsed(second), 0);
  assert.equal(sim.carAt('present').id, third.id, 'Present follows on the next movement tick');
  events = sim.tick();
  assert.equal(sim.carAt('present'), null, 'Queued request advances automatically');
  assert.equal(sim.carAt('window3_transfer').id, third.id);
  assert.equal(sim.completedCars.length, 3);
  assert.equal(third.timings.present, sim.now - presentStartedAt, 'Blocked time counts at Present');
  assert.equal(events.filter(e => e.type === 'car-completed').length, 1);
  sim.tick(10);
  const scores = computeScoreboard(sim.completedCars);
  sim.releaseStation('window3'); sim.tick();
  assert.equal(sim.carAt('window3'), null);
  sim.tick();
  assert.equal(sim.carAt('window3').id, third.id, 'FIFO is preserved');
  assert.equal(sim.stationElapsed(third), 0);
  assert.deepEqual(computeScoreboard(sim.completedCars), scores);
  assert.equal(JSON.stringify(sim.completedCars.find(car => car.id === second.id)), secondResult);
}

function testEarlyClearStillHonoursThreeSecondTransfer() {
  const sim = new DriveThruSimulator();
  carAtPresent(sim); departToWindow3(sim); sim.tick(3);
  const next = carAtPresent(sim, 2); departToWindow3(sim);
  const departedAt = sim.now;
  sim.releaseStation('window3'); sim.tick();
  sim.tick();
  assert.equal(sim.carAt('window3'), null, 'Handover cannot shorten the travel time');
  sim.tick();
  assert.equal(sim.now, departedAt + 3);
  assert.equal(sim.carAt('window3').id, next.id);
}

function testQueueSurvivesReloadAtEveryPhase() {
  let sim = new DriveThruSimulator();
  const reload = () => { sim = new DriveThruSimulator(JSON.parse(JSON.stringify(sim.serialize()))); };
  carAtPresent(sim); departToWindow3(sim); reload();
  sim.tick(2); reload(); assert.equal(sim.carAt('window3'), null);
  sim.tick();
  const second = carAtPresent(sim, 2); departToWindow3(sim);
  const third = carAtPresent(sim); sim.sendToWindow3(); reload();
  assert.equal(sim.carAt('present').destination, 'window3');
  sim.tick(3); reload();
  assert.equal(sim.carAt('present').id, third.id);
  sim.releaseStation('window3'); sim.tick(); reload();
  assert.equal(sim.carAt('window3'), null);
  sim.tick(); reload();
  assert.equal(sim.carAt('window3').id, second.id);
  sim.tick(); reload();
  assert.equal(sim.carAt('window3_transfer').id, third.id);
  sim.tick(3); sim.releaseStation('window3'); sim.tick(); reload();
  sim.tick();
  assert.equal(sim.carAt('window3').id, third.id);
  assert.equal(sim.stationElapsed(sim.carAt('window3')), 0);
  assert.equal(sim.completedCars.length, 3);
  sim.reset();
  assert.equal(sim.window3AvailableAt, 0);
  assert.equal(sim.activeCars.length, 0);
  assert.equal(sim.completedCars.length, 0);
}

function testPresentAverageColourAndTargetPercent() {
  for (const [seconds, expected] of [[0,'avg-good'],[29,'avg-good'],[29.9,'avg-good'],[30,'avg-mid'],[37,'avg-mid'],[45,'avg-mid'],[45.01,'avg-bad'],[60,'avg-bad']]) {
    assert.equal(resultAverageClass('present', seconds), expected, `Present average ${seconds}s`);
  }
  const cars = [29,30,37,46].map(seconds => ({lane:1,timings:{present:seconds}}));
  assert.equal(computeScoreboard(cars).present.pct, 50, 'Only results at or below 30s meet target');
  assert.equal(resultAverageClass('cash',37), 'avg-mid');
  assert.equal(resultAverageClass('total',90), 'avg-mid');
  assert.equal(resultAverageClass('total',120), 'avg-bad');
}

function testWaitingReloadAndNextCarStartsAtZero() {
  const sim = new DriveThruSimulator();
  carAtPresent(sim); sim.sendToWindow3();
  // Pending transfers survive reload as well as cars already waiting.
  let restored = new DriveThruSimulator(JSON.parse(JSON.stringify(sim.serialize())));
  restored.tick(4); restored.tick(105);
  restored = new DriveThruSimulator(JSON.parse(JSON.stringify(restored.serialize())));
  assert.equal(restored.stationElapsed(restored.carAt('window3')), 105);
  assert.equal(waitingStatus(restored.stationElapsed(restored.carAt('window3'))), 'yellow');
  const scores = computeScoreboard(restored.completedCars);
  restored.releaseStation('window3'); restored.tick();
  assert.deepEqual(computeScoreboard(restored.completedCars), scores);
  const next = carAtPresent(restored, 2);
  restored.sendToWindow3(); restored.tick(4);
  assert.equal(restored.carAt('window3').id, next.id);
  assert.equal(restored.stationElapsed(next), 0);
  assert.equal(waitingStatus(restored.stationElapsed(next)), 'green');
  restored.reset();
  assert.equal(restored.activeCars.length, 0);
  assert.equal(restored.completedCars.length, 0);
}

function testEmptyWindow3Controls() {
  const sim = new DriveThruSimulator();
  assert.equal(sim.sendToWindow3().ok, false);
  assert.equal(sim.releaseStation('window3').ok, false);
  carAtPresent(sim); sim.releaseStation('present');
  assert.equal(sim.sendToWindow3().ok, false, 'Cannot redirect a car already marked complete');
  sim.tick(); assert.equal(sim.carAt('window3'), null);
}

function testBrowserEngineMatchesSimulation() {
  const module = readFileSync(new URL('./simulation.mjs', import.meta.url), 'utf8').replaceAll('export ', '');
  const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
  assert.ok(app.startsWith(module), 'The browser runs the tested simulation engine');
}

function runAll() {
  const tests = [testTargets, testOnePreOrderSpaceEachLane, testLane1HasPostOrderSpaceBeforeMerge,
    testLane2UsesForwardMergeSpace, testSharedSectionLength, testBlockedStationTimeContinues,
    testMergePriorityByFirstFinishedOrder, testSequentialAdvanceAfterCompletion,
    testCompletedCarsAffectAveragesOnly, testThresholdEvents, testReset,
    testWindow3RecordsOnceAndExcludesWaiting, testOccupiedWindow3AndOtherCarsCanExit,
    testWaitingReloadAndNextCarStartsAtZero, testEmptyWindow3Controls, testBrowserEngineMatchesSimulation,
    testWindow3QueueAndOneSecondHandover, testEarlyClearStillHonoursThreeSecondTransfer,
    testQueueSurvivesReloadAtEveryPhase, testPresentAverageColourAndTargetPercent];
  for (const test of tests) test();
  console.log(`All ${tests.length} simulation tests passed.`);
}
runAll();


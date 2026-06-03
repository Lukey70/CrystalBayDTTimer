import assert from 'node:assert/strict';
import { DriveThruSimulator, computeScoreboard, TARGETS } from './simulation.mjs';
function runTicks(sim, seconds) { for (let i = 0; i < seconds; i += 1) sim.tick(1); }

function testTargetsUpdated() {
  assert.equal(TARGETS.present, 60);
  assert.equal(TARGETS.total, 90);
}
function testOnlyOneSpaceBeforeOrder() {
  const sim = new DriveThruSimulator();
  let result = sim.addCar(1);
  assert.equal(result.ok, true);
  assert.equal(sim.carAt('lane1_pre1')?.lane, 1);
  result = sim.addCar(1);
  assert.equal(result.ok, false);
  sim.tick(1);
  assert.equal(sim.carAt('order1')?.lane, 1);

  const sim2 = new DriveThruSimulator();
  result = sim2.addCar(2);
  assert.equal(result.ok, true);
  assert.equal(sim2.carAt('lane2_pre1')?.lane, 2);
  result = sim2.addCar(2);
  assert.equal(result.ok, false);
  sim2.tick(1);
  assert.equal(sim2.carAt('order2')?.lane, 2);
}
function testTotalStartsAfterOrderLeaves() {
  const sim = new DriveThruSimulator();
  sim.addCar(1); sim.tick(1); runTicks(sim, 3); sim.releaseStation('order1'); sim.tick(1);
  assert.ok(sim.carAt('gap_shared_low'));
  assert.equal(sim.carAt('gap_shared_low').totalStartedAt, sim.now);
}
function testLane2Path() {
  const sim = new DriveThruSimulator();
  sim.addCar(2); sim.tick(1); sim.releaseStation('order2'); sim.tick(1);
  assert.equal(sim.carAt('gap_cash2')?.lane, 2);
  sim.tick(1); assert.equal(sim.carAt('gap_shared_low')?.lane, 2);
}
function testLane1SharedPath() {
  const sim = new DriveThruSimulator();
  sim.addCar(1); sim.tick(1); sim.releaseStation('order1');
  sim.tick(1); assert.equal(sim.carAt('gap_shared_low')?.lane, 1);
  sim.tick(1); assert.equal(sim.carAt('gap_shared_high')?.lane, 1);
  sim.tick(1); assert.equal(sim.carAt('gap_cash_entry')?.lane, 1);
  sim.tick(1); assert.equal(sim.carAt('cash')?.lane, 1);
}
function testCashToPresent() {
  const sim = new DriveThruSimulator();
  sim.activeCars = [{ id: 1, lane: 1, position: 'cash', positionEnteredAt: 0, totalStartedAt: 0, orderReleaseAt: null, releaseRequested: true, thresholds: { yellow: false, red: false }, timings: { order1: 5, order2: null, cash: null, present: null, total: null }, completedAt: null }];
  sim.tick(1); assert.equal(sim.carAt('gap_present1')?.id, 1);
  sim.tick(1); assert.equal(sim.carAt('present')?.id, 1);
}
function testBlockedOrderTimerContinues() {
  const sim = new DriveThruSimulator();
  const blocker = (id, position) => ({ id, lane: 1, position, positionEnteredAt: 0, totalStartedAt: 0, orderReleaseAt: 0, releaseRequested: false, thresholds: { yellow: false, red: false }, timings: { order1: null, order2: null, cash: null, present: null, total: null }, completedAt: null });
  sim.activeCars = [blocker(97, 'cash'), blocker(98, 'gap_cash_entry'), blocker(99, 'gap_shared_high'), blocker(100, 'gap_shared_low')];
  sim.addCar(1); sim.tick(1); const waiting = sim.carAt('order1'); sim.releaseStation('order1'); const enteredAt = waiting.positionEnteredAt; runTicks(sim, 4);
  assert.equal(sim.carAt('order1')?.id, waiting.id);
  assert.equal(sim.now - enteredAt >= 4, true);
}
function testMergePriority() {
  const sim = new DriveThruSimulator();
  const baseCar = (id, lane, position, orderReleaseAt) => ({ id, lane, position, positionEnteredAt: 0, totalStartedAt: 0, orderReleaseAt, releaseRequested: position === 'order1' || position === 'gap_cash2', thresholds: { yellow: false, red: false }, timings: { order1: null, order2: null, cash: null, present: null, total: null }, completedAt: null });
  sim.activeCars = [baseCar(1, 2, 'gap_cash2', 5), baseCar(2, 1, 'order1', 7)];
  sim.tick(1); assert.equal(sim.carAt('gap_shared_low')?.id, 1);
}
function testSequentialAdvanceAfterCompletion() {
  const sim = new DriveThruSimulator();
  const baseCar = (id, lane, position, releaseRequested = false) => ({ id, lane, position, positionEnteredAt: 0, totalStartedAt: 0, orderReleaseAt: 0, releaseRequested, thresholds: { yellow: false, red: false }, timings: { order1: null, order2: null, cash: null, present: null, total: null }, completedAt: null });
  sim.activeCars = [baseCar(1, 1, 'present', true), baseCar(2, 1, 'gap_present1', false), baseCar(3, 1, 'cash', true)];
  sim.tick(1); assert.equal(sim.completedCars.length, 1); assert.equal(sim.carAt('gap_present1')?.id, 2); assert.equal(sim.carAt('cash')?.id, 3);
  sim.tick(1); assert.equal(sim.carAt('present')?.id, 2); assert.equal(sim.carAt('cash')?.id, 3);
  sim.tick(1); assert.equal(sim.carAt('gap_present1')?.id, 3);
}
function testCompletedCarsOnlyAffectAverages() {
  const sim = new DriveThruSimulator();
  sim.addCar(1); sim.tick(1); runTicks(sim, 10); sim.releaseStation('order1'); runTicks(sim, 4); runTicks(sim, 8); sim.releaseStation('cash'); runTicks(sim, 2); runTicks(sim, 12); sim.releaseStation('present'); sim.tick(1);
  assert.equal(sim.completedCars.length, 1); const completed = sim.completedCars[0]; sim.addCar(1); const scoreboard = computeScoreboard(sim.completedCars); assert.equal(scoreboard.order1.avg, completed.timings.order1); assert.equal(scoreboard.total.avg, completed.timings.total); assert.equal(scoreboard.total.pct, completed.timings.total <= 90 ? 100 : 0);
}
function testThresholdEvents() {
  const sim = new DriveThruSimulator(); sim.addCar(1); sim.tick(1); sim.releaseStation('order1'); sim.tick(1); let y=false, r=false; for (let i=0;i<125;i+=1){ const events=sim.tick(1); if(events.some(e=>e.type==='yellow-threshold')) y=true; if(events.some(e=>e.type==='red-threshold')) r=true; } assert.equal(y,true); assert.equal(r,true);
}
function testResetMethod(){ const sim = new DriveThruSimulator(); sim.addCar(1); sim.tick(1); sim.reset(); assert.equal(sim.activeCars.length,0); assert.equal(sim.completedCars.length,0); assert.equal(sim.now,0); assert.equal(sim.nextCarId,1); }
function runAll(){ testTargetsUpdated(); testOnlyOneSpaceBeforeOrder(); testTotalStartsAfterOrderLeaves(); testLane2Path(); testLane1SharedPath(); testCashToPresent(); testBlockedOrderTimerContinues(); testMergePriority(); testSequentialAdvanceAfterCompletion(); testCompletedCarsOnlyAffectAverages(); testThresholdEvents(); testResetMethod(); console.log('All simulation tests passed.'); }
runAll();

export const TARGETS = {
  order1: 30,
  order2: 30,
  cash: 30,
  present: 60,
  total: 90,
};

export const STATUS_THRESHOLDS = {
  yellow: 90,
  red: 120,
};

// Window 3 is a separate, visual-only clock measured from arrival.
export const WAITING_THRESHOLDS = { yellow: 90, red: 120 };

export function waitingStatus(seconds) {
  if (seconds >= WAITING_THRESHOLDS.red) return 'red';
  if (seconds >= WAITING_THRESHOLDS.yellow) return 'yellow';
  return 'green';
}

export const POSITION_META = {
  lane1_pre1: { next: 'order1' },
  order1: { next: 'lane1_post', station: 'order1' },
  lane1_post: { next: 'shared_vertical' },

  lane2_pre1: { next: 'order2' },
  order2: { next: 'lane2_merge', station: 'order2' },
  lane2_merge: { next: 'shared_vertical' },

  shared_vertical: { next: 'gap_cash_entry' },
  gap_cash_entry: { next: 'cash' },
  cash: { next: 'gap_present1', station: 'cash' },
  gap_present1: { next: 'present' },
  present: { next: 'exit', station: 'present' },
  window3: { next: 'exit', station: 'window3' },
};

const STATIONS = new Set(['order1', 'order2', 'cash', 'present', 'window3']);

export class DriveThruSimulator {
  constructor(savedState = null) {
    this.now = 0;
    this.nextCarId = 1;
    this.activeCars = [];
    this.completedCars = [];
    this.statusMessage = 'Ready.';
    if (savedState) this.load(savedState);
  }

  reset() {
    this.now = 0;
    this.nextCarId = 1;
    this.activeCars = [];
    this.completedCars = [];
    this.statusMessage = 'Ready.';
  }

  serialize() {
    return { now: this.now, nextCarId: this.nextCarId, activeCars: this.activeCars, completedCars: this.completedCars, statusMessage: this.statusMessage };
  }

  load(state) {
    this.now = Number(state.now) || 0;
    this.nextCarId = Number(state.nextCarId) || 1;
    this.activeCars = Array.isArray(state.activeCars) ? state.activeCars : [];
    this.completedCars = Array.isArray(state.completedCars) ? state.completedCars : [];
    this.statusMessage = state.statusMessage || 'Ready.';
  }

  carAt(position) { return this.activeCars.find((car) => car.position === position) || null; }

  addCar(lane) {
    const spawn = lane === 1 ? 'lane1_pre1' : 'lane2_pre1';
    if (this.carAt(spawn)) return { ok: false, reason: `Lane ${lane} spawn is full.` };
    const car = {
      id: this.nextCarId++, lane, position: spawn, positionEnteredAt: this.now,
      totalStartedAt: null, orderReleaseAt: null, releaseRequested: false,
      thresholds: { yellow: false, red: false },
      timings: { order1: null, order2: null, cash: null, present: null, total: null },
      completedAt: null,
    };
    this.activeCars.push(car);
    this.statusMessage = `Car #${car.id} added to Lane ${lane}.`;
    return { ok: true, car, events: [{ type: lane === 1 ? 'lane1-entry' : 'lane2-entry', carId: car.id }] };
  }

  releaseStation(station) {
    const car = this.carAt(station);
    if (!car) {
      this.statusMessage = `No car at ${station}.`;
      return { ok: false, reason: `No car at ${station}.` };
    }
    if (car.releaseRequested) {
      this.statusMessage = `Car #${car.id} is already ready to leave ${station}.`;
      return { ok: true, car, alreadyRequested: true };
    }
    car.releaseRequested = true;
    car.orderReleaseAt = STATIONS.has(station) ? this.now : car.orderReleaseAt;
    this.statusMessage = `Car #${car.id} is ready to leave ${station} when the path clears.`;
    return { ok: true, car };
  }

  sendToWindow3() {
    const car = this.carAt('present');
    if (!car) return { ok: false, reason: 'No car at Present.' };
    if (this.carAt('window3')) return { ok: false, reason: 'Window 3 is occupied. Complete that car first.' };
    if (car.releaseRequested) return { ok: false, reason: `Car #${car.id} is already leaving Present.` };
    car.destination = 'window3';
    car.releaseRequested = true;
    this.statusMessage = `Car #${car.id} will move from Present to Window 3.`;
    return { ok: true, car };
  }

  stationElapsed(car) { return this.now - car.positionEnteredAt; }
  totalElapsed(car) { return car.completedAt != null ? car.timings.total : car.totalStartedAt == null ? 0 : this.now - car.totalStartedAt; }
  getCarsInLaneCount() { return this.activeCars.filter((car) => car.position !== 'window3').length; }
  getLongestCurrentTotal() { let longest = 0; for (const car of this.activeCars) if (car.position !== 'window3') longest = Math.max(longest, this.totalElapsed(car)); return longest; }

  tick(seconds = 1) {
    const allEvents = [];
    for (let i = 0; i < seconds; i += 1) {
      this.now += 1;
      const events = [];
      this.processMovement(events);
      this.processThresholds(events);
      allEvents.push(...events);
    }
    return allEvents;
  }

  processThresholds(events) {
    for (const car of this.activeCars) {
      if (car.position === 'window3') continue;
      const total = this.totalElapsed(car);
      if (car.totalStartedAt != null && !car.thresholds.yellow && total >= STATUS_THRESHOLDS.yellow) {
        car.thresholds.yellow = true;
        events.push({ type: 'yellow-threshold', carId: car.id, lane: car.lane });
      }
      if (car.totalStartedAt != null && !car.thresholds.red && total >= STATUS_THRESHOLDS.red) {
        car.thresholds.red = true;
        events.push({ type: 'red-threshold', carId: car.id, lane: car.lane });
      }
    }
  }

  canLeaveStation(car) {
    const meta = POSITION_META[car.position];
    if (!meta.station) return true;
    return !!car.releaseRequested;
  }

  canMoveFrom(position) {
    const car = this.carAt(position);
    if (!car) return false;
    if ((this.now - car.positionEnteredAt) < 1) return false;
    const meta = POSITION_META[position];
    if (!meta.next) return false;
    if (meta.station) return this.canLeaveStation(car);
    return true;
  }

  processMovement(events) {
    const occupiedStart = new Set(this.activeCars.map((car) => car.position));
    const plannedMoves = [];
    const isEmptyAtStart = (position) => !occupiedStart.has(position);
    const planMove = (car, target) => plannedMoves.push({ carId: car.id, from: car.position, to: target });

    const waitingCar = this.carAt('window3');
    if (waitingCar && this.canMoveFrom('window3')) planMove(waitingCar, 'exit');

    const presentCar = this.carAt('present');
    if (presentCar && this.canMoveFrom('present')) {
      const destination = presentCar.destination === 'window3' ? 'window3' : 'exit';
      if (destination === 'exit' || isEmptyAtStart('window3')) planMove(presentCar, destination);
    }

    const gapPresentCar = this.carAt('gap_present1');
    if (gapPresentCar && this.canMoveFrom('gap_present1') && isEmptyAtStart('present')) planMove(gapPresentCar, 'present');

    const cashCar = this.carAt('cash');
    if (cashCar && this.canMoveFrom('cash') && isEmptyAtStart('gap_present1')) planMove(cashCar, 'gap_present1');

    const preCashCar = this.carAt('gap_cash_entry');
    if (preCashCar && this.canMoveFrom('gap_cash_entry') && isEmptyAtStart('cash')) planMove(preCashCar, 'cash');

    const sharedVerticalCar = this.carAt('shared_vertical');
    if (sharedVerticalCar && this.canMoveFrom('shared_vertical') && isEmptyAtStart('gap_cash_entry')) planMove(sharedVerticalCar, 'gap_cash_entry');

    const mergeContenders = [];
    const lane2MergeCar = this.carAt('lane2_merge');
    if (lane2MergeCar && this.canMoveFrom('lane2_merge')) mergeContenders.push(lane2MergeCar);
    const lane1PostCar = this.carAt('lane1_post');
    if (lane1PostCar && this.canMoveFrom('lane1_post')) mergeContenders.push(lane1PostCar);
    if (mergeContenders.length && isEmptyAtStart('shared_vertical')) {
      mergeContenders.sort((a, b) => {
        const ap = a.orderReleaseAt ?? this.now;
        const bp = b.orderReleaseAt ?? this.now;
        if (ap !== bp) return ap - bp;
        return a.id - b.id;
      });
      planMove(mergeContenders[0], 'shared_vertical');
    }

    const order2Car = this.carAt('order2');
    if (order2Car && this.canMoveFrom('order2') && isEmptyAtStart('lane2_merge')) planMove(order2Car, 'lane2_merge');

    const order1Car = this.carAt('order1');
    if (order1Car && this.canMoveFrom('order1') && isEmptyAtStart('lane1_post')) planMove(order1Car, 'lane1_post');

    const lane2PreCar = this.carAt('lane2_pre1');
    if (lane2PreCar && this.canMoveFrom('lane2_pre1') && isEmptyAtStart('order2')) planMove(lane2PreCar, 'order2');

    const lane1PreCar = this.carAt('lane1_pre1');
    if (lane1PreCar && this.canMoveFrom('lane1_pre1') && isEmptyAtStart('order1')) planMove(lane1PreCar, 'order1');

    if (!plannedMoves.length) return;

    for (const move of plannedMoves) {
      const car = this.activeCars.find((active) => active.id === move.carId);
      if (!car) continue;
      const previous = move.from;
      const target = move.to;
      const previousMeta = POSITION_META[previous];

      // A car at Window 3 has already been counted at Present. Removing it
      // must never add another result or change its recorded service times.
      if (previous === 'window3') {
        this.activeCars = this.activeCars.filter((active) => active.id !== car.id);
        events.push({ type: 'waiting-completed', carId: car.id });
        this.statusMessage = `Car #${car.id} left Window 3.`;
        continue;
      }

      if (previousMeta.station) {
        const elapsed = this.now - car.positionEnteredAt;
        car.timings[previous] = elapsed;
        car.releaseRequested = false;
        if (previous === 'order1' || previous === 'order2') car.totalStartedAt = this.now;
      }

      if (previous === 'present') {
        car.timings.total = car.totalStartedAt != null ? this.now - car.totalStartedAt : 0;
        car.completedAt = this.now;
        this.completedCars.unshift({ ...car, timings: { ...car.timings }, thresholds: { ...car.thresholds } });
        events.push({ type: 'car-completed', carId: car.id, lane: car.lane, waiting: target === 'window3' });
      }

      if (target === 'exit') {
        this.activeCars = this.activeCars.filter((active) => active.id !== car.id);
        this.statusMessage = `Car #${car.id} completed the drive thru.`;
      } else {
        car.position = target;
        car.positionEnteredAt = this.now;
        if (previous === 'order1' || previous === 'order2') car.orderReleaseAt = this.now;
        if (target === 'cash') car.orderReleaseAt = null;
        events.push({ type: 'car-moved', carId: car.id, from: previous, to: target });
        if (target === 'window3') this.statusMessage = `Car #${car.id} is waiting at Window 3. Results recorded; waiting time is separate.`;
      }
    }
  }
}

export function computeScoreboard(completedCars) {
  const onlyCompleted = completedCars || [];
  const lane1Completed = onlyCompleted.filter((car) => car.lane === 1);
  const lane2Completed = onlyCompleted.filter((car) => car.lane === 2);
  const avg = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const underPct = (values, target) => !values.length ? 0 : Math.round((values.filter((value) => value <= target).length / values.length) * 100);
  const lane1OrderValues = lane1Completed.map((car) => car.timings.order1).filter((v) => Number.isFinite(v));
  const lane2OrderValues = lane2Completed.map((car) => car.timings.order2).filter((v) => Number.isFinite(v));
  const cashValues = onlyCompleted.map((car) => car.timings.cash).filter((v) => Number.isFinite(v));
  const presentValues = onlyCompleted.map((car) => car.timings.present).filter((v) => Number.isFinite(v));
  const totalValues = onlyCompleted.map((car) => car.timings.total).filter((v) => Number.isFinite(v));
  return {
    order1: { avg: avg(lane1OrderValues), pct: underPct(lane1OrderValues, TARGETS.order1) },
    order2: { avg: avg(lane2OrderValues), pct: underPct(lane2OrderValues, TARGETS.order2) },
    cash: { avg: avg(cashValues), pct: underPct(cashValues, TARGETS.cash) },
    present: { avg: avg(presentValues), pct: underPct(presentValues, TARGETS.present) },
    total: { avg: avg(totalValues), pct: underPct(totalValues, TARGETS.total) },
  };
}


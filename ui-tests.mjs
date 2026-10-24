import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the real browser script and button bindings against a small DOM
// fixture. No browser, network, image or audio dependencies are required.
class Element {
  constructor() {
    this.className = ''; this.textContent = ''; this.children = []; this.dataset = {};
    this.listeners = {}; this.disabled = false;
    this.style = { setProperty(name, value) { this[name] = value; } };
    this.classList = {
      contains: name => this.className.split(' ').includes(name),
      toggle: (name, force) => {
        const values = new Set(this.className.split(' ').filter(Boolean));
        if (force ?? !values.has(name)) values.add(name); else values.delete(name);
        this.className = [...values].join(' ');
      },
    };
  }
  set innerHTML(value) { this.html = value; this.children = []; }
  get innerHTML() { return this.html || ''; }
  appendChild(child) { this.children.push(child); }
  addEventListener(name, callback) { this.listeners[name] = callback; }
}
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(match => [match[1], new Element()]));
const saved = new Map();
const document = {
  body: new Element(),
  querySelector(selector) {
    const element = elements.get(selector.slice(1));
    assert.ok(element, `The page contains ${selector}`);
    return element;
  },
  querySelectorAll() { return []; },
  createElement() { return new Element(); },
  addEventListener() {},
};
const context = vm.createContext({
  document, window: {}, Date, console, setInterval() {},
  localStorage: {getItem: key => saved.get(key), setItem: (key,value) => saved.set(key,value), removeItem: key => saved.delete(key)},
});
vm.runInContext(readFileSync(new URL('./app.js', import.meta.url), 'utf8'), context);
const run = code => vm.runInContext(code, context);
const element = id => elements.get(id);
const click = async id => {
  assert.equal(element(id).disabled, false, `${id} is enabled`);
  await element(id).listeners.click();
};
const tick = seconds => run(`simulator.tick(${seconds}); render();`);
const at = position => element('carsLayer').children.filter(car => car.dataset.position === position);
const readyPresent = lane => run(`
  simulator.addCar(${lane}); simulator.tick(8);
  simulator.releaseStation('order${lane}'); simulator.tick(12);
  simulator.releaseStation('cash'); simulator.tick(12); render();
`);

assert.equal(element('goalPresent').textContent, '0:30');
run(`simulator.completedCars = [{id:99,lane:1,timings:{order1:10,cash:10,present:37,total:70}}]; render();`);
assert.equal(element('avgPresent').textContent, '0:37');
assert.equal(element('avgPresent').className, 'avg avg-mid');
assert.equal(element('pctPresent').textContent, '0%');
run('simulator.reset(); render();');
readyPresent(1);
await click('btnSendWindow3'); tick(1);
assert.equal(at('present').length, 0);
assert.equal(at('window3').length, 0);
assert.equal(element('completedCount').textContent, '1');
assert.match(element('window3QueueStatus').textContent, /3s/);
tick(2); assert.equal(at('window3').length, 0);
tick(1); assert.equal(at('window3').length, 1);
assert.equal(element('labelWindow3Time').textContent, '0:00');
readyPresent(2); await click('btnSendWindow3'); tick(1);
assert.equal(at('present').length, 0);
assert.equal(at('window3').length, 1);
assert.equal(element('completedCount').textContent, '2');
readyPresent(1);
assert.equal(element('btnSendWindow3').disabled, false, 'Occupied Window 3 accepts another queued request');
await click('btnSendWindow3'); tick(10);
assert.equal(element('btnSendWindow3').textContent, 'Queued for Window 3');
assert.equal(element('btnSendWindow3').disabled, true);
assert.equal(element('btnReleasePresent').disabled, true);
assert.match(element('window3QueueStatus').textContent, /queued at Present/);
assert.equal(at('present').length, 1);
assert.equal(element('completedCount').textContent, '2');
assert.equal(element('carsInLane').textContent, '1');
await click('btnReleaseWindow3'); tick(1);
assert.equal(at('window3').length, 0);
tick(1);
assert.equal(at('window3')[0].dataset.carId, '2');
assert.equal(element('labelWindow3Time').textContent, '0:00');
assert.equal(at('present').length, 1);
tick(1);
assert.equal(at('present').length, 0);
assert.equal(element('completedCount').textContent, '3');
assert.match(element('window3QueueStatus').textContent, /3s/);
const average = element('avgPresent').textContent;
tick(100);
assert.equal(element('avgPresent').textContent, average);
assert.equal(element('labelWindow3Time').className, 'waiting-time status-yellow');
console.log('Browser-script UI integration checks passed.');

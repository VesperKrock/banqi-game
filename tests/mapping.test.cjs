"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { BOARD_COLUMNS, BOARD_ROWS, logicToDisplay, displayToLogic, coordinateLabel } = require("../js/app.js");
const positions = Array.from({ length: 32 }, (_, id) => ({
  id,
  x: id % BOARD_COLUMNS,
  y: Math.floor(id / BOARD_COLUMNS),
}));

test("Bàn logic có đúng 8 cột × 4 hàng", () => {
  assert.equal(BOARD_COLUMNS, 8);
  assert.equal(BOARD_ROWS, 4);
});

for (const orientation of ["horizontal", "vertical"]) {
  test(`${orientation}: 32 vị trí duy nhất, trong biên và đảo ngược được`, () => {
    const width = orientation === "vertical" ? 4 : 8;
    const height = orientation === "vertical" ? 8 : 4;
    const occupied = new Set();

    for (const { x, y } of positions) {
      const view = logicToDisplay(x, y, orientation);
      assert.ok(Number.isInteger(view.x) && view.x >= 0 && view.x < width);
      assert.ok(Number.isInteger(view.y) && view.y >= 0 && view.y < height);
      occupied.add(`${view.x},${view.y}`);
      assert.deepEqual(displayToLogic(view.x, view.y, orientation), { x, y });
      if (orientation === "horizontal") assert.deepEqual(view, { x, y: 3 - y });
    }

    assert.equal(occupied.size, 32);
  });

  test(`${orientation}: bảo toàn quan hệ kề cho mọi cặp ô`, () => {
    for (const a of positions) {
      for (const b of positions) {
        const viewA = logicToDisplay(a.x, a.y, orientation);
        const viewB = logicToDisplay(b.x, b.y, orientation);
        const logicalDistance = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        const displayDistance = Math.abs(viewA.x - viewB.x) + Math.abs(viewA.y - viewB.y);
        assert.equal(displayDistance, logicalDistance, `Ô ${a.id} và ${b.id}`);
      }
    }
  });
}

test("Bốn góc dọc đúng chiều xoay 90° theo kim đồng hồ", () => {
  assert.deepEqual(logicToDisplay(0, 0, "vertical"), { x: 0, y: 0 });
  assert.deepEqual(logicToDisplay(7, 0, "vertical"), { x: 0, y: 7 });
  assert.deepEqual(logicToDisplay(0, 3, "vertical"), { x: 3, y: 0 });
  assert.deepEqual(logicToDisplay(7, 3, "vertical"), { x: 3, y: 7 });
});

test("100 vòng chuyển ngang/dọc/ngang giữ đúng vị trí logic và ID", () => {
  for (const { id, x, y } of positions) {
    let position = { x, y };
    for (let turn = 0; turn < 100; turn += 1) {
      const vertical = logicToDisplay(position.x, position.y, "vertical");
      position = displayToLogic(vertical.x, vertical.y, "vertical");
      const horizontal = logicToDisplay(position.x, position.y, "horizontal");
      assert.deepEqual(horizontal, { x, y: 3 - y });
      const logical = displayToLogic(horizontal.x, horizontal.y, "horizontal");
      assert.equal(logical.y * BOARD_COLUMNS + logical.x, id);
    }
  }
});

test("Nhãn a1 và h4 đúng, đủ 32 tọa độ duy nhất", () => {
  assert.equal(coordinateLabel(0, 0), "a1");
  assert.equal(coordinateLabel(7, 3), "h4");
  const labels = positions.map(({ x, y }) => coordinateLabel(x, y));
  assert.equal(new Set(labels).size, 32);
  for (const label of labels) assert.match(label, /^[a-h][1-4]$/);
});

test("Bốn góc ngang lần lượt a4, h4, a1, h1", () => {
  const corners = [[0, 0], [7, 0], [0, 3], [7, 3]].map(([u, v]) => {
    const { x, y } = displayToLogic(u, v, "horizontal");
    return coordinateLabel(x, y);
  });
  assert.deepEqual(corners, ["a4", "h4", "a1", "h1"]);
});

test("Bố cục dọc là xoay ngang 90° theo kim đồng hồ", () => {
  for (const { x, y } of positions) {
    const horizontal = logicToDisplay(x, y, "horizontal");
    const vertical = logicToDisplay(x, y, "vertical");
    assert.deepEqual(vertical, { x: 3 - horizontal.y, y: horizontal.x });
  }
  const row = (v) => Array.from({ length: 4 }, (_, u) => {
    const { x, y } = displayToLogic(u, v, "vertical");
    return coordinateLabel(x, y);
  });
  assert.deepEqual(row(0), ["a1", "a2", "a3", "a4"]);
  assert.deepEqual(row(7), ["h1", "h2", "h3", "h4"]);
});

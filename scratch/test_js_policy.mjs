// Test JavaScript implementation of the optimal TopGameAI Snake policy

const WIDTH = 12;
const HEIGHT = 12;
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const DIRS = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

function bfsPath(start, target, blockedSet) {
  if (start.x === target.x && start.y === target.y) return [];
  const queue = [[start, []]];
  const visited = new Set([`${start.x},${start.y}`]);

  while (queue.length > 0) {
    const [curr, path] = queue.shift();
    for (const [dName, d] of Object.entries(DIRS)) {
      const nx = curr.x + d.dx;
      const ny = curr.y + d.dy;
      if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= HEIGHT) continue;
      if (nx === target.x && ny === target.y) return [...path, dName];
      const key = `${nx},${ny}`;
      if (!blockedSet.has(key) && !visited.has(key)) {
        visited.add(key);
        queue.push([{ x: nx, y: ny }, [...path, dName]]);
      }
    }
  }
  return null;
}

function floodFill(start, blockedSet) {
  const queue = [start];
  const visited = new Set([`${start.x},${start.y}`]);
  let count = 0;

  while (queue.length > 0) {
    const curr = queue.shift();
    count++;
    for (const d of Object.values(DIRS)) {
      const nx = curr.x + d.dx;
      const ny = curr.y + d.dy;
      if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= HEIGHT) continue;
      const key = `${nx},${ny}`;
      if (!blockedSet.has(key) && !visited.has(key)) {
        visited.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }
  return count;
}

function simulateSnake(snake, newHead, ateFood) {
  const nextSnake = [newHead, ...snake.map(s => ({ ...s }))];
  if (!ateFood) nextSnake.pop();
  return nextSnake;
}

function chooseBestMove(snake, food, direction) {
  const head = snake[0];
  const bodyBlocks = new Set(snake.slice(0, -1).map(s => `${s.x},${s.y}`));

  const legalDirs = {};
  for (const [dName, d] of Object.entries(DIRS)) {
    if (dName === OPPOSITE[direction]) continue;
    const nx = head.x + d.dx;
    const ny = head.y + d.dy;
    if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= HEIGHT) continue;
    if (bodyBlocks.has(`${nx},${ny}`)) continue;

    const newHead = { x: nx, y: ny };
    const ate = nx === food.x && ny === food.y;
    const simSnake = simulateSnake(snake, newHead, ate);
    const simBlocks = new Set(simSnake.slice(0, -1).map(s => `${s.x},${s.y}`));
    const tail = simSnake[simSnake.length - 1];

    const canReachTail = bfsPath(newHead, tail, simBlocks) !== null;
    const space = floodFill(newHead, simBlocks);

    legalDirs[dName] = {
      newHead,
      canReachTail,
      space,
      ate,
    };
  }

  if (Object.keys(legalDirs).length === 0) {
    return 'right'; // Emergency
  }

  // Find shortest path to food
  const path = bfsPath(head, food, bodyBlocks);
  if (path && path.length > 0) {
    const nextDir = path[0];
    const info = legalDirs[nextDir];
    if (info) {
      const bodyLen = snake.length;
      if (info.canReachTail || info.space >= Math.min(25, bodyLen + 4)) {
        return nextDir;
      }
    }
  }

  // Safe fallback: maximum flood-fill space
  let bestDir = Object.keys(legalDirs)[0];
  let bestSpace = -1;
  for (const [dName, info] of Object.entries(legalDirs)) {
    let score = info.space;
    if (info.canReachTail) score += 1000;
    if (score > bestSpace) {
      bestSpace = score;
      bestDir = dName;
    }
  }
  return bestDir;
}

console.log('Testing policy on initial state...');
const testSnake = [{ x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 }];
const testFood = { x: 8, y: 1 };
const move = chooseBestMove(testSnake, testFood, 'right');
console.log('Chosen move for food at (8,1):', move);

import random
from collections import deque

WIDTH = 12
HEIGHT = 12
TARGET_FOOD = 15
OPPOSITE = {'up': 'down', 'down': 'up', 'left': 'right', 'right': 'left'}
DIRS = {
    'up': (0, -1),
    'down': (0, 1),
    'left': (-1, 0),
    'right': (1, 0)
}

def bfs_distance(start, target, blocked):
    if start == target:
        return 0
    q = deque([(start[0], start[1], 0)])
    visited = {start}
    while q:
        x, y, d = q.popleft()
        for dx, dy in DIRS.values():
            nx, ny = x + dx, y + dy
            if 0 <= nx < WIDTH and 0 <= ny < HEIGHT:
                if (nx, ny) == target:
                    return d + 1
                if (nx, ny) not in blocked and (nx, ny) not in visited:
                    visited.add((nx, ny))
                    q.append((nx, ny, d + 1))
    return None

def count_reachable(start, blocked):
    q = deque([start])
    visited = {start}
    while q:
        x, y = q.popleft()
        for dx, dy in DIRS.values():
            nx, ny = x + dx, y + dy
            if 0 <= nx < WIDTH and 0 <= ny < HEIGHT:
                if (nx, ny) not in blocked and (nx, ny) not in visited:
                    visited.add((nx, ny))
                    q.append((nx, ny))
    return len(visited)

def choose_snake_action(snake, food, direction):
    head = (snake[0]['x'], snake[0]['y'])
    tail = (snake[-1]['x'], snake[-1]['y'])
    target = (food['x'], food['y'])

    # Blocked coordinates: body except tail
    blocked = {(s['x'], s['y']) for s in snake[:-1]}
    # Blocked for tail BFS (excluding head and tail)
    blocked_tail = {(s['x'], s['y']) for s in snake[1:-1]}

    candidates = ['up', 'down', 'left', 'right']
    opp = OPPOSITE.get(direction)

    scores = {}
    stats = {}

    for d in candidates:
        if d == opp:
            continue
        dx, dy = DIRS[d]
        nx, ny = head[0] + dx, head[1] + dy

        # Wall check
        if nx < 0 or nx >= WIDTH or ny < 0 or ny >= HEIGHT:
            continue
        # Body collision check
        if (nx, ny) in blocked:
            continue

        start_pos = (nx, ny)
        space = count_reachable(start_pos, blocked)
        food_dist = bfs_distance(start_pos, target, blocked)
        tail_dist = bfs_distance(start_pos, tail, blocked_tail)

        is_safe = space >= len(snake)
        score = 0.0

        if is_safe:
            score += 200.0 + space * 1.5
            if food_dist is not None:
                score += (30 - food_dist) * 12.0
            else:
                score -= 40.0
            if tail_dist is not None:
                score += 35.0
        else:
            score += space * 2.0
            if tail_dist is not None:
                score += (30 - tail_dist) * 5.0

        if d == direction:
            score += 3.0

        scores[d] = score
        stats[d] = {'space': space, 'food_dist': food_dist, 'tail_dist': tail_dist, 'safe': is_safe}

    if not scores:
        # Fallback to any non-reversing
        legal = [d for d in candidates if d != opp]
        return legal[0] if legal else 'up', {d: 0.25 for d in candidates}, 0.25

    best_dir = max(scores, key=scores.get)
    max_score = scores[best_dir]

    # Softmax temperature
    import math
    temp = 14.0
    exp_scores = {}
    sum_exp = 0.0
    for d in candidates:
        if d in scores:
            v = math.exp((scores[d] - max_score) / temp)
            exp_scores[d] = v
            sum_exp += v
        else:
            exp_scores[d] = 0.0

    probs = {}
    for d in candidates:
        if d in scores and sum_exp > 0:
            probs[d] = round(exp_scores[d] / sum_exp, 4)
        else:
            probs[d] = 0.0

    # Ensure sum === 1.0000
    cur_sum = round(sum(probs.values()), 4)
    diff = round(1.0 - cur_sum, 4)
    if diff != 0:
        probs[best_dir] = round(probs[best_dir] + diff, 4)

    return best_dir, probs, probs[best_dir]

# Test 10 simulated games
def test_simulated_games(n=10):
    wins = 0
    total_steps = 0
    for g in range(1, n + 1):
        snake = [{'x': 6, 'y': 6}, {'x': 5, 'y': 6}, {'x': 4, 'y': 6}]
        direction = 'right'
        foods_eaten = 0
        steps = 0

        # Spawn food
        def spawn(s):
            occ = {(p['x'], p['y']) for p in s}
            free = [(x, y) for x in range(WIDTH) for y in range(HEIGHT) if (x, y) not in occ]
            fx, fy = random.choice(free)
            return {'x': fx, 'y': fy}

        food = spawn(snake)

        while steps < 300 and foods_eaten < TARGET_FOOD:
            steps += 1
            best_dir, probs, conf = choose_snake_action(snake, food, direction)
            direction = best_dir
            dx, dy = DIRS[direction]
            new_head = {'x': snake[0]['x'] + dx, 'y': snake[0]['y'] + dy}

            # Check collision
            if new_head['x'] < 0 or new_head['x'] >= WIDTH or new_head['y'] < 0 or new_head['y'] >= HEIGHT:
                break
            if any(s['x'] == new_head['x'] and s['y'] == new_head['y'] for s in snake[:-1]):
                break

            snake.insert(0, new_head)
            if new_head['x'] == food['x'] and new_head['y'] == food['y']:
                foods_eaten += 1
                if foods_eaten < TARGET_FOOD:
                    food = spawn(snake)
            else:
                snake.pop()

        won = foods_eaten >= TARGET_FOOD
        if won:
            wins += 1
            total_steps += steps
        print(f"Game {g}: {'WON (15 foods!)' if won else 'LOST'} | Foods: {foods_eaten} | Steps: {steps}")

    print(f"\nSimulated Results: {wins}/{n} WON ({wins/n*100:.0f}%) | Avg Steps: {total_steps/max(1, wins):.1f}")

if __name__ == "__main__":
    test_simulated_games(10)

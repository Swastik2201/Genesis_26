import json

path = 'logs/runs/c16d5586-79d0-4b1b-b9c2-a70167bdc4df.jsonl'
try:
    with open(path, 'r', encoding='utf-8') as f:
        lines = [json.loads(line) for line in f if line.strip()]
    last = lines[-1]
    print(f"Total steps: {len(lines)-1}")
    print(f"Last step score: {last.get('state',{}).get('score')}")
    print(f"Foods eaten: {last.get('state',{}).get('facts',{}).get('food_eaten')}")
    print(f"Done: {last.get('state',{}).get('done')}")
except Exception as e:
    print('Error:', e)

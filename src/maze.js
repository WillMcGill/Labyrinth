export const CELL = 1;

// '#' wall, '.' floor, 'o' hole, 'S' start, 'G' goal
export const LEVEL = [
  '#############',
  '#S..........#',
  '#.###########',
  '#...........#',
  '###########.#',
  '#...........#',
  '#.#########.#',
  '#.#.......o.#',
  '#.#########.#',
  '#...........#',
  '#.###########',
  '#..........G#',
  '#############',
];

export function cellToWorld(col, row) {
  const cols = LEVEL[0].length;
  const rows = LEVEL.length;
  return {
    x: (col - (cols - 1) / 2) * CELL,
    z: (row - (rows - 1) / 2) * CELL,
  };
}

export function parseLevel() {
  const rows = LEVEL.length;
  const cols = LEVEL[0].length;
  const walls = [];
  const floors = [];
  const holes = [];
  let start = null;
  let goal = null;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = LEVEL[r][c];
      const p = cellToWorld(c, r);
      if (ch === '#') {
        walls.push(p);
      } else if (ch === 'o') {
        holes.push(p);
      } else {
        floors.push(p);
        if (ch === 'S') start = p;
        if (ch === 'G') goal = p;
      }
    }
  }

  return { rows, cols, walls, floors, holes, start, goal };
}

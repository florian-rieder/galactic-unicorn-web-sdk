local CURSOR_X = math.floor(SCREEN_W / 2)
local CURSOR_Y = math.floor(SCREEN_H / 2)

local MINE_PROBABILITY = 20 -- 10%=easy 20%=hard
local MAX_START_TRIES = 20

local BACKGROUND_COLOR = rgb(10, 10, 10)
local MINE_COLOR = rgb(255, 153, 0)
local MINE_COLOR_BLINK = rgb(255, 185, 80)
local FLAG_COLOR = rgb(255, 128, 0)
local UNREVEALED_COLOR = rgb(50, 50, 50)
local COLOR_CURSOR = rgb(200, 200, 200)
-- Blink effects: full on/off phases each last 1/(2*BLINK_HZ) seconds.
local CURSOR_BLINK_HZ = 1.5
local GAME_OVER_BLINK_HZ = 2.0
local MINE_BLINK_HZ = 1.1
-- Cursor input move repeat
local INITIAL_DELAY = 0.25
local REPEAT_INTERVAL = 0.1

-- Colors for numbers around mines, based on the colors of the original game
local NUMBERS_COLORS = {
  [1] = rgb(0, 0, 255),     -- Blue       - 1 adjacent mine
  [2] = rgb(0, 255, 0),     -- Green.     - 2 adjacent mines
  [3] = rgb(255, 0, 0),     -- Red        - 3 adjacent mines
  [4] = rgb(0, 0, 128),     -- Dark Blue  - 4 adjacent mines
  [5] = rgb(128, 0, 0),     -- Dark Red   - 5 adjacent mines
  [6] = rgb(0, 128, 128),   -- Cyan       - 6 adjacent mines
  [7] = rgb(132, 0, 132),   -- Magenta    - 7 adjacent mines
  [8] = rgb(117, 117, 117), -- Gray       - 8 adjacent mines
}

local grid = {}
local first_move = true
local game_over = false
local is_lost = false
local is_win = false
local remaining_safe_cells = 0
local held = {}
local hold_state = {}

function math.clamp(n, low, high) return math.min(math.max(n, low), high) end 

-- Visits 8-neighbors of (x, y); stops if fn(nx, ny) returns truthy.
local function for_each_neighbor(x, y, fn)
  for i = -1, 1 do
    for j = -1, 1 do
      if not (i == 0 and j == 0) then
        local nx = x + j
        local ny = y + i
        if nx >= 0 and nx < SCREEN_W and ny >= 0 and ny < SCREEN_H then
          if fn(nx, ny) then
            return
          end
        end
      end
    end
  end
end

local function count_mines_around(x, y)
  local count = 0

  for_each_neighbor(x, y, function(nx, ny)
    if grid[ny][nx].is_mine then
      count = count + 1
    end
  end)

  return count
end

-- True if some 8-neighbor is a non-mine blank (0 adjacent mines).
local function has_safe_zero_neighbor(x, y)
  local found = false
  for_each_neighbor(x, y, function(nx, ny)
    local n = grid[ny][nx]
    if n.neighbor_mines_count == 0 and not n.is_mine then
      found = true
      return true
    end
  end)
  return found
end

-- Nice first click: not a mine, and not a lone number with no opening next to it.
local function is_nice_first_reveal(x, y)
  local c = grid[y][x]
  if c.is_mine then
    return false
  end
  if c.neighbor_mines_count == 0 then
    return true
  end

  return has_safe_zero_neighbor(x, y)
end

function reveal_cell(x, y)
  local cell = grid[y][x]
  if cell.is_revealed then
    return
  end

  if first_move then
    local tries = 0
    while not is_nice_first_reveal(x, y) do
      print("Reinit grid because first move is not nice")
      tries = tries + 1
      if tries > MAX_START_TRIES then
        error("Failed to find a nice first reveal after " .. MAX_START_TRIES .. " tries")
      end
      -- Regenerate the grid
      init_grid()
    end
    cell = grid[y][x]

    if cell.neighbor_mines_count > 0 then
      local redirected = false
      for_each_neighbor(x, y, function(nx, ny)
        local neighbor = grid[ny][nx]
        if neighbor.neighbor_mines_count == 0 and not neighbor.is_mine then
          first_move = false
          reveal_cell(nx, ny)
          redirected = true
          return true
        end
      end)
      if redirected then
        return
      end
    end
    first_move = false
  end

  cell = grid[y][x]

  -- Lose condition
  if cell.is_mine then
    is_lost = true
    game_over = true
    return
  end

  if cell.is_revealed then
    return
  end

  cell.is_revealed = true
  remaining_safe_cells = remaining_safe_cells - 1

  -- Win condition
  if remaining_safe_cells == 0 then
    game_over = true
    is_win = true
  end

  if not cell.is_mine and cell.neighbor_mines_count == 0 then
    for_each_neighbor(x, y, function(nx, ny)
      reveal_cell(nx, ny)
    end)
  end
end

function flag_cell(x, y)
  local cell = grid[y][x]

  if cell.is_revealed then
    return
  end

  -- toggle flag state
  cell.is_flagged = not cell.is_flagged
end

function init_grid()
  local total_mines = 0
  -- Initialize the grid with either mines or empty cells
  for y = 0, SCREEN_H - 1 do
    grid[y] = {}
    for x = 0, SCREEN_W - 1 do
      local is_mine = false
      if math.random(0, 100) < MINE_PROBABILITY then
        is_mine = true
        total_mines = total_mines + 1
      end

      grid[y][x] = {
        is_mine = is_mine,
        is_flagged = false,
        is_revealed = false,
        neighbor_mines_count = 0,
      }
    end
  end

  -- Calculate the number of mines around each cell
  for y = 0, SCREEN_H - 1 do
    for x = 0, SCREEN_W - 1 do
      grid[y][x].neighbor_mines_count = count_mines_around(x, y)
    end
  end

  local total_cells = SCREEN_H * SCREEN_W
  remaining_safe_cells = total_cells - total_mines

  first_move = true
end

function reset()
  is_win = false
  is_lost = false
  CURSOR_X = math.floor(SCREEN_W/2)
  CURSOR_Y = math.floor(SCREEN_H/2)
  init_grid()
end

function setup()
  init_grid()
end

function update()
  local now = get_time()

  for button, _ in pairs(held) do
    local state = hold_state[button]

    if state then
      local held_time = now - state.start

      if held_time > INITIAL_DELAY then
        if (now - state.last) > REPEAT_INTERVAL then
          move_cursor(button)
          state.last = now
        end
      end
    end
  end
end

function draw()
  -- Cells
  for y = 0, SCREEN_H - 1 do
    for x = 0, SCREEN_W - 1 do
      local cell = grid[y][x]

      if cell.is_revealed then
        if cell.neighbor_mines_count > 0 then
          local c = NUMBERS_COLORS[cell.neighbor_mines_count]
          set_pixel(x, y, c)
        else
          set_pixel(x, y, BACKGROUND_COLOR)
        end
      elseif cell.is_flagged then
        set_pixel(x, y, FLAG_COLOR)
      else
        set_pixel(x, y, UNREVEALED_COLOR)
      end

      if cell.is_mine and game_over and is_lost then
        -- Show all the mines (blinky edition)
        local mine_blink_phase = math.floor(get_time() * 2 * MINE_BLINK_HZ) % 2
        if mine_blink_phase == 0 then
          set_pixel(x, y, MINE_COLOR_BLINK)
        else
          set_pixel(x, y, MINE_COLOR)
        end
      end
    end
  end

  if game_over then
    local game_over_phase = math.floor(get_time() * 2 * GAME_OVER_BLINK_HZ) % 2
    -- blink the whole screen in red
    if game_over_phase == 0 then
      if is_lost then
        fill_blend(rgb(200, 0, 0), 0.2)
      elseif is_win then
        fill_blend(rgb(0, 200, 0), 0.2)
      end
    end
  else
    -- Cursor
    local phase = math.floor(get_time() * 2 * CURSOR_BLINK_HZ) % 2
    if phase == 0 then
      set_pixel(CURSOR_X, CURSOR_Y, COLOR_CURSOR)
    end
  end
end

function on_press(button)
  if game_over then
    -- Any button press resets the game
    game_over = false
    reset()
    return
  end

    held[button] = true
    hold_state[button] = {
    start = get_time(),
    last = get_time()
  }

  -- Reveal the cell
  if button == "MENU" then reveal_cell(CURSOR_X, CURSOR_Y)
  -- Flag suspected mine
  elseif button == "ESC" then flag_cell(CURSOR_X, CURSOR_Y)
  -- Move the cursor
  else move_cursor(button)
  end
end

function on_release(button)
  held[button] = nil
  hold_state[button] = nil
end

function move_cursor(button)
  -- Move the cursor
  if button == "R_LEFT" then CURSOR_X = CURSOR_X - 1 end
  if button == "R_RIGHT" then CURSOR_X = CURSOR_X + 1 end
  if button == "R_UP" then CURSOR_Y = CURSOR_Y - 1 end
  if button == "R_DOWN" then CURSOR_Y = CURSOR_Y + 1 end


  CURSOR_X = math.clamp(CURSOR_X, 0, SCREEN_W - 1)
  CURSOR_Y = math.clamp(CURSOR_Y, 0, SCREEN_H - 1)
end

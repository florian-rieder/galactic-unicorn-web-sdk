-- Enum

local uid = 0

-- Use unique identifiers across Enums
local function next_uid()
  uid = uid + 1
  return uid
end

function Enum(keys)
  local values = {} -- Scoped "private" immutable enum
  local enum = {} -- The actual public enum

  for _, key in ipairs(keys) do
    if type(key) ~= "string" then
      error("Enum keys must be strings", 2)
    end

    -- Check duplicate keys
    if values[key] == nil then
      values[key] = next_uid() -- User doesn't need to know what value a key has !
    else
      error("Duplicate key in enum: " .. key, 2)
    end
  end

  setmetatable(enum, {
    __index = function(enum, key)
      if values[key] == nil then
        error("Non existent key in enum", 2)
      end

      return values[key] -- Integers are passed by value in Lua
    end,
    __newindex = function()
      error("Enums are read-only", 2)
    end,
    __tostring = function(enum)
      return "{" .. table.concat(keys, ", ") .. "}"
    end
  })

  return enum
end

if (...) == nil then
  local Fruit = Enum{"APPLE", "BANANA", "CHERRY", "ORANGE"}

  local apple = Fruit.APPLE
  local orange = Fruit.ORANGE

  assert(apple == Fruit.APPLE)
  assert(Fruit.APPLE == Fruit.APPLE)
  assert(apple ~= orange) -- Comparing apples to oranges ?
  assert(Fruit.APPLE ~= Fruit.CHERRY)

  local ok, err = pcall(function() Fruit.values = nil return true end)
  assert(not ok, "Assigning to private values should error")
  
  local ok, err = pcall(function() Fruit.CHERRY = 42 return true end)
  assert(not ok, "Assigning a value to a key should error")

  local ok, err = pcall(function() return Fruit.MANGO end)
  assert(not ok, "Non-existent key should error")

  local ok, err = pcall(function() local E = Enum{1, 2, 3} end)
  assert(not ok, "Non-string key should error")

  local ok = pcall(function() return Enum{} end)
  assert(ok, "Empty enum should be valid")

  local ok, err = pcall(function() return Enum{"A", "A"} end)
  assert(not ok, "Duplicate keys should error")

  local Direction = Enum{"UP", "DOWN", "LEFT", "RIGHT"}
  assert(Fruit.APPLE ~= Direction.UP, "Different enums should not have colliding values")

  assert(tostring(Fruit) == "{APPLE, BANANA, CHERRY, ORANGE}")
  assert(tostring(Direction) == "{UP, DOWN, LEFT, RIGHT}")

  print("Enum: all tests passed !")
end

return Enum

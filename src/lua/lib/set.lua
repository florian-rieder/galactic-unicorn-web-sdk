-- Set datastructure implementation
-- Based on https://stackoverflow.com/a/2282547 and https://www.lua.org/pil/13.1.html

local Set = {}
Set.mt = {}

function Set.new (t)
  if t == nil then t = {} end

  local set = {}
  setmetatable(set, Set.mt)
  for _, l in ipairs(t) do set[l] = true end
  return set
end

function Set.union (a,b)
  if getmetatable(a) ~= Set.mt or
    getmetatable(b) ~= Set.mt then
    error("attempt to add a set with a non-set value", 2)
  end
  local res = Set.new{}
  for k in pairs(a) do res[k] = true end
  for k in pairs(b) do res[k] = true end
  return res
end

function Set.intersection(a,b)
  if getmetatable(a) ~= Set.mt or
    getmetatable(b) ~= Set.mt then
    error("attempt to intersect a set with a non-set value", 2)
  end
  local res = Set.new{}
  for k in pairs(a) do
    res[k] = b[k]
  end
  return res
end

function Set.equals(a,b)
  if getmetatable(a) ~= Set.mt or
    getmetatable(b) ~= Set.mt then
    error("attempt to equate a set with a non-set value", 2)
  end

  -- Check that all of A's keys are in B
  for key in pairs(a) do
    if not b[key] then return false end
  end

  -- Check that all of B's keys are in A
  for key in pairs(b) do
    if not a[key] then return false end
  end

  return true
end

function Set.mt:is_empty()
    return next(self) == nil
end

function Set.mt:tostring()
  local s = "{"
  local sep = ""
  for e in pairs(self) do
    s = s .. sep .. tostring(e)
    sep = ", "
  end
  return s .. "}"
end

function Set.mt:print()
  print(self:tostring())
end

function Set.mt:add(key)
  self[key] = true
end

function Set.mt:remove(key)
  if self:contains(key) then
    self[key] = nil
  end
end

function Set.mt:contains(key)
  return self[key] ~= nil
end

-- Enables method calls on instances
Set.mt.__index = Set.mt

-- Set operator overloads
Set.mt.__add = Set.union
Set.mt.__mul = Set.intersection
Set.mt.__eq = Set.equals

-- Test the module when it's launched as main
if (...) == nil then
  local empty_set = Set.new()

  assert(empty_set == Set.new{})
  assert(empty_set:is_empty())

  local s1 = Set.new({1,2,3})
  local s2 = Set.new({5,6,7})

  assert(s1 ~= s2)

  local union = s1 + s2

  assert(union:contains(1))
  assert(union:contains(5))
  assert(not union:contains(99))

  s1:add(4)
  s2:add(4)

  local intersection = s1 * s2

  assert(intersection:contains(4))
  assert(not intersection:contains(5))

  s2:remove(4)

  local empty_intersection = s1 * s2

  assert(empty_intersection == empty_set)

  print("Set: all tests passed !")
end

return Set

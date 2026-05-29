-- Vector2 datastructure implementation

local Vector2 = {}
Vector2.mt = {}

-- Enables method calls on instances
Vector2.mt.__index = Vector2.mt

local function is_vector2(var)
  return getmetatable(var) == Vector2.mt
end

-- `==` operator overload
Vector2.mt.__eq = function(a,b)
  if not is_vector2(a) or not is_vector2(b) then
    error("attempt to equate a Vector2 with a non-Vector2 value", 2)
  end

  return a.x == b.x and a.y == b.y
end

-- `+` operator overload
Vector2.mt.__add = function(a,b)
  if not is_vector2(a) or not is_vector2(b) then
    error("attempt to add a Vector2 with a non-Vector2 value", 2)
  end
  return Vector2.new(a.x + b.x, a.y + b.y)
end

-- `-` operator overload
Vector2.mt.__sub = function(a, b)
  if not is_vector2(a) or not is_vector2(b) then
    error("attempt to subtract a Vector2 with a non-Vector2 value", 2)
  end
  return Vector2.new(a.x - b.x, a.y - b.y)
end

-- `*` operator overload
Vector2.mt.__mul = function(a, b)
  -- Can multiply with either a Vector2 or a scalar
  local a_is_vec = is_vector2(a)
  local b_is_vec = is_vector2(b)

  -- Scalar * Vector2
  if type(a) == "number" and b_is_vec then
    return Vector2.new(a * b.x, a * b.y)
  end

  -- Vector2 * Scalar
  if a_is_vec and type(b) == "number" then
    return Vector2.new(a.x * b, a.y * b)
  end

  -- Vector2 * Vector2
  if a_is_vec and b_is_vec then
    return Vector2.new(a.x * b.x, a.y * b.y)
  end

  error("invalid operands for Vector2 multiplication", 2)
end

-- `/` operator overload
Vector2.mt.__div = function(a, b)
  if not is_vector2(a) then
    error("attempt to divide a non-Vector2 value", 2)
  end

  if is_vector2(b) then
    return Vector2.new(a.x / b.x, a.y / b.y)
  elseif type(b) == "number" then
    return Vector2.new(a.x / b, a.y / b)
  else 
    error("attempt to divide a Vector2 with an invalid value", 2)
  end
end

-- Unary `-` operator overload
Vector2.mt.__unm = function(a)
  if not is_vector2(a) then
    error("attempt to negate a non-Vector2 value", 2)
  end
  return Vector2.new(-a.x, -a.y)
end

-- `tostring` overload; allows print(vec) to just work
Vector2.mt.__tostring = function(vec)
  return "{" .. "x=" .. tostring(vec.x) .. ", y=" .. tostring(vec.y) .. "}"
end

-- Public methods

---- Class static methods

-- Create a new Vector2
function Vector2.new(x, y)
  local vec = {
    x = x,
    y = y,
  }
  setmetatable(vec, Vector2.mt)
  return vec
end

-- Create a copy of a Vector2
function Vector2.copy(vec)
  return Vector2.new(vec.x, vec.y)
end

-- Compute the dot product of two Vector2
function Vector2.dot(a, b)
  if not is_vector2(a) or not is_vector2(b) then
    error("attempt to dot product a Vector2 with a non-Vector2 value", 2)
  end
  return a.x * b.x + a.y * b.y
end

function Vector2.manhattan_distance(a,b)
  return math.abs(a.x - b.x) + math.abs(a.y - b.y)
end

---- Class instance methods

-- Return a normalized (length == 1) version of the vector
function Vector2.mt:normalize()
  return Vector2.copy(self) / self:length()
end

-- Return the magnitude of the vector
function Vector2.mt:length()
  return math.sqrt(self.x * self.x + self.y * self.y)
end

-- Module definition


-- Vector2 constants accessible like this:
-- local myvec = Vector2.ZERO
local VECTOR2_NAMED_CONSTANTS = {
  ZERO  = Vector2.new( 0,  0),
  UP    = Vector2.new( 0, -1),
  DOWN  = Vector2.new( 0,  1),
  LEFT  = Vector2.new(-1,  0),
  RIGHT = Vector2.new( 1,  0),
}

setmetatable(Vector2, {
  -- __index runs when we try to access a key that doesn't exist on the table
  __index = function(t, k)
    local c = VECTOR2_NAMED_CONSTANTS[k]
    -- Return a copy of the constant named vector
    if c then return Vector2.copy(c) end
  end
})

-- Test the module when it's launched as main
if (...) == nil then
  local zero = Vector2.ZERO

  -- Mutate Vector2.ZERO
  zero.x = 2
  zero.y = 2

  -- Check that we didn't change the output of Vector2.ZERO
  local second_zero = Vector2.ZERO
  assert(second_zero.x == 0 and second_zero.y == 0)

  -- Check Vector2.add
  local v1 = Vector2.new(1, 2)
  local v2 = Vector2.new(2, 4)
  local v3 = Vector2.new(3, 6)

  -- Check tostring()
  print(v1, v2, v3)

  local sum = v1 + v2
  assert(sum.x == 3)
  assert(sum.y == 6)

  -- Check Vector2 multiplication by a scalar
  local product_scalar_left = v1 * 3
  assert(product_scalar_left.x == 3)
  assert(product_scalar_left.y == 6)

  local product_scalar_right = 3 * v1
  assert(product_scalar_right.x == 3)
  assert(product_scalar_right.y == 6)

  -- Check Vector2 multiplication by a vector
  local product = v1 * v2
  assert(product.x == 2)
  assert(product.y == 8)

  -- Check Vector2 division by a scalar
  local quotient_scalar = v2 / 2
  assert(quotient_scalar.x == 1)
  assert(quotient_scalar.y == 2)

  -- Check Vector2 division by a vector
  local quotient_vec = v3 / v1
  assert(quotient_vec.x == 3)
  assert(quotient_vec.y == 3)

  -- Check Vector2.dot
  local dot_product = Vector2.dot(v1, v2)
  assert(dot_product == 10)

  -- Check Vector2:length
  local magnitude = Vector2.new(3, 4):length()
  assert(magnitude == 5) -- 3^2 + 4^2 == 5^2

  -- Check Vector2.sub
  local diff = v2 - v1
  assert(diff.x == 1)
  assert(diff.y == 2)

  -- Check Vector2:normalize
  local normalized = Vector2.new(3, 4):normalize()
  assert(math.abs(normalized:length() - 1) < 0.0001) -- float epsilon comparison
  
  -- Check chaining
  local chained = (v1 + v2) * 2
  assert(chained.x == 6)
  assert(chained.y == 12)

  -- Check unary minus operator
  local negated = -v1
  assert(negated.x == -1)
  assert(negated.y == -2)

  -- Check error cases
  local ok, err = pcall(function() return v1 + 5 end)
  assert(not ok, "adding a scalar to a Vector2 should throw")

  local ok, err = pcall(function() return v1 * "hello" end)
  assert(not ok, "multiplying a Vector2 by a string should throw")

  print("Vector2: all tests passed !")
end

return Vector2
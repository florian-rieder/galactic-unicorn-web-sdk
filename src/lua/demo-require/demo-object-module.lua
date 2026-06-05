-- This module exports an "object" with a member function and a constant.
-- It's actually a table that we return at the end of the file that represents the module.
local M = {}

M.CONSTANT = 42

function M.foo(argument)
  print("Member function called with argument: " .. argument)
end

return M
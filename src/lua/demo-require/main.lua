-- Import a module from LittleFS using its absolute path
require("/demo-require/demo-module.lua")

my_helper_function() -- Global function from demo-module.lua


-- Import the "object" module and use its member function and constant.
local demo_object_module = require("/demo-require/demo-object-module.lua")

demo_object_module.foo("Hello from the member function!")
print("Accessing constant from demo_object_module: " .. demo_object_module.CONSTANT)


-- We can use the same-ish pattern as in python's `if __name__ == "__main__"` to determine
-- if this file is being run directly or imported as a module
-- "..." is a special Lua variable, varargs that contains the arguments passed to the chunk.
--  When a file is run directly, "..." will be nil.

if (...) == nil then
  print("MAIN: This code runs when the file is executed directly") -- This will run.
else
  print("MAIN: This code runs when the file is imported as a module")
end


-- Trying to import a non-existent module to show error handling
require("/demo-require/non_existent_module.lua")
-- This module exports a global function that can be used in other files that import this module.
function my_helper_function()
  print("This is a helper function from the imported file!")
end

if (...) == nil then
  print("MODULE: This code runs when the file is executed directly")
else
  print("MODULE: This code runs when the file is imported as a module") -- This will run when imported
end